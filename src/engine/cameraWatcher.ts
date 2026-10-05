import type { RingCamera } from 'ring-client-api'
import type { AssistantConfig, Scenario } from '../config.js'
import { createLogger, type Logger } from '../logger.js'
import { LiveSession, type Frame } from '../ring/liveSession.js'
import type { Detector } from '../vision/detector.js'
import type { TextToSpeech } from '../voice/tts.js'

export interface WatcherDeps {
  config: AssistantConfig
  detector: Detector
  tts: TextToSpeech
  dryRun: boolean
}

/**
 * Watches one camera. Motion or a doorbell press opens a live call. While it's
 * open, recent frames go to the detector every few seconds. When a scenario is
 * seen enough times in a row, the assistant says that scenario's line.
 */
export class CameraWatcher {
  private readonly log: Logger
  private live?: LiveSession
  private starting?: Promise<void>
  private frames: Frame[] = []
  private watchUntil = 0
  private analysisTimer?: NodeJS.Timeout
  private analyzing = false
  private readonly hitStreak = new Map<string, number>()
  private readonly lastSpokenAt = new Map<string, number>()

  constructor(
    private readonly camera: RingCamera,
    private readonly deps: WatcherDeps,
  ) {
    this.log = createLogger(`watch:${camera.name}`)
  }

  private get scenarios(): Scenario[] {
    return this.deps.config.scenarios.filter((s) => s.enabled)
  }

  start() {
    this.camera.onMotionStarted.subscribe(() => this.trigger('motion'))
    this.camera.onDoorbellPressed.subscribe(() => this.trigger('doorbell'))
    this.log.info('Watching for motion')
  }

  /** Opens (or extends) a watch window. Also usable from code for a manual trigger. */
  async trigger(reason: string) {
    this.watchUntil = Date.now() + this.deps.config.watch.session_seconds * 1000
    if (this.live && !this.live.isEnded) return
    if (this.starting) return this.starting

    this.log.info(`${reason} - opening live view`)
    this.starting = this.openSession().finally(() => (this.starting = undefined))
    return this.starting
  }

  private async openSession() {
    const { watch } = this.deps.config
    this.frames = []
    this.hitStreak.clear()
    try {
      this.live = await LiveSession.start(this.camera, {
        framesPerSecond: watch.frames_per_second,
        frameWidth: watch.frame_width,
        onFrame: (f) => {
          this.frames.push(f)
          if (this.frames.length > watch.frames_per_analysis) this.frames.shift()
        },
      })
    } catch (err) {
      this.log.error('Could not start live call', err)
      return
    }
    this.live.onEnded(() => this.onSessionEnded())
    this.analysisTimer = setInterval(() => void this.tick(), watch.analysis_interval_seconds * 1000)
  }

  private onSessionEnded() {
    clearInterval(this.analysisTimer)
    this.analysisTimer = undefined
    this.live = undefined
    // Ring caps call length; reopen if we were still supposed to be watching.
    if (Date.now() < this.watchUntil) void this.trigger('call dropped while still watching')
  }

  private async tick() {
    if (Date.now() > this.watchUntil) {
      this.log.info('Watch window over - closing live view')
      this.live?.stop()
      return
    }
    if (this.analyzing || this.frames.length === 0) return

    this.analyzing = true
    try {
      const result = await this.deps.detector.analyze([...this.frames], this.scenarios, { cameraName: this.camera.name })
      this.log.debug(`Saw: ${result.observations}`)
      await this.handleDetections(result.detections)
    } catch (err) {
      this.log.error('Analysis failed', err)
    } finally {
      this.analyzing = false
    }
  }

  private async handleDetections(detections: { scenarioId: string; confidence: number; evidence: string }[]) {
    for (const scenario of this.scenarios) {
      const hit = detections.find((d) => d.scenarioId === scenario.id && d.confidence >= scenario.min_confidence)
      if (!hit) {
        this.hitStreak.set(scenario.id, 0)
        continue
      }
      const streak = (this.hitStreak.get(scenario.id) ?? 0) + 1
      this.hitStreak.set(scenario.id, streak)
      this.log.info(`${scenario.id} (${hit.confidence.toFixed(2)}, ${streak}/${scenario.consecutive_hits}): ${hit.evidence}`)
      if (streak < scenario.consecutive_hits) continue

      const since = Date.now() - (this.lastSpokenAt.get(scenario.id) ?? 0)
      if (since < scenario.cooldown_seconds * 1000) continue

      this.hitStreak.set(scenario.id, 0)
      this.lastSpokenAt.set(scenario.id, Date.now())
      await this.respond(scenario)
    }
  }

  private async respond(scenario: Scenario) {
    const tone = this.deps.config.tones[scenario.tone]
    if (this.deps.dryRun) {
      this.log.info(`[DRY RUN] would say (${scenario.tone}): "${scenario.response}"`)
      return
    }
    const clip = await this.deps.tts.synthesize(scenario.response, tone)
    if (!this.live || this.live.isEnded) {
      this.log.warn('Live call ended before the assistant could speak')
      return
    }
    this.log.info(`Speaking (${scenario.tone}): "${scenario.response}"`)
    await this.live.speak(clip)
  }

  stop() {
    clearInterval(this.analysisTimer)
    this.live?.stop()
  }
}
