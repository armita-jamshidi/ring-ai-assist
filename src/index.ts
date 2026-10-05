import { env, loadAssistantConfig, requireEnv } from './config.js'
import { CameraWatcher } from './engine/cameraWatcher.js'
import { createLogger } from './logger.js'
import { connectRing, selectCameras } from './ring/ringClient.js'
import { ClaudeDetector } from './vision/claudeDetector.js'
import { ElevenLabsTts } from './voice/elevenLabsTts.js'
import type { TextToSpeech } from './voice/tts.js'

const log = createLogger('main')

async function main() {
  const config = loadAssistantConfig()
  requireEnv('ANTHROPIC_API_KEY')
  const detector = new ClaudeDetector(env.claudeModel)

  const enabled = config.scenarios.filter((s) => s.enabled)
  log.info(`Scenarios: ${enabled.map((s) => s.id).join(', ')}${env.dryRun ? ' (DRY RUN - will not speak)' : ''}`)

  // A dry run never speaks, so it doesn't need an ElevenLabs key.
  let tts: TextToSpeech = { synthesize: () => Promise.reject(new Error('TTS disabled in dry run')) }
  if (!env.dryRun) {
    const elevenLabs = new ElevenLabsTts(requireEnv('ELEVENLABS_API_KEY'))
    await elevenLabs.prewarm(enabled.map((s) => ({ text: s.response, tone: config.tones[s.tone] })))
    tts = elevenLabs
  }

  const ring = connectRing()
  const cameras = await selectCameras(ring, config.cameras)
  if (cameras.length === 0) throw new Error('No cameras to watch')

  const watchers = cameras.map((camera) => new CameraWatcher(camera, { config, detector, tts, dryRun: env.dryRun }))
  watchers.forEach((w) => w.start())

  const shutdown = () => {
    log.info('Shutting down')
    watchers.forEach((w) => w.stop())
    ring.disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
