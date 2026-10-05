import { spawn } from 'node:child_process'
import { createSocket } from 'node:dgram'
import type { AddressInfo } from 'node:net'
import type { RingCamera } from 'ring-client-api'
import { RtpPacket } from 'werift'
import { createLogger } from '../logger.js'
import { ffmpegPath } from './ffmpeg.js'

type StreamingSession = Awaited<ReturnType<RingCamera['startLiveCall']>>

export interface Frame {
  jpeg: Buffer
  capturedAt: number
}

export interface LiveSessionOptions {
  framesPerSecond: number
  frameWidth: number
  onFrame: (frame: Frame) => void
}

const JPEG_EOI = Buffer.from([0xff, 0xd9])

/**
 * One live call to a Ring camera. Pulls JPEG frames out of the video and can
 * push audio back to the camera's speaker, both over the same WebRTC call.
 *
 * We don't use ring-client-api's transcodeReturnAudio() because it ends the
 * whole call when the audio clip finishes. Instead we encode each clip to RTP
 * ourselves and feed the packets into the call with sendAudioPacket().
 */
export class LiveSession {
  private readonly log
  private speaking: Promise<void> = Promise.resolve()
  private ended = false

  private constructor(
    readonly camera: RingCamera,
    private readonly session: StreamingSession,
  ) {
    this.log = createLogger(`live:${camera.name}`)
    session.onCallEnded.subscribe(() => {
      this.ended = true
      this.log.info('Live call ended')
    })
  }

  static async start(camera: RingCamera, opts: LiveSessionOptions): Promise<LiveSession> {
    const session = await camera.startLiveCall()
    const live = new LiveSession(camera, session)
    await live.startFrameExtraction(opts)
    live.log.info('Live call started')
    return live
  }

  get isEnded() {
    return this.ended
  }

  onEnded(cb: () => void) {
    this.session.onCallEnded.subscribe(cb)
  }

  stop() {
    this.session.stop()
  }

  private async startFrameExtraction({ framesPerSecond, frameWidth, onFrame }: LiveSessionOptions) {
    let pending = Buffer.alloc(0)
    await this.session.startTranscoding({
      audio: ['-an'],
      video: ['-vf', `fps=${framesPerSecond},scale=${frameWidth}:-2`, '-vcodec', 'mjpeg', '-q:v', '5'],
      output: ['-f', 'image2pipe', 'pipe:1'],
      // ffmpeg writes back-to-back JPEGs; split on the end-of-image marker.
      stdoutCallback: (chunk) => {
        pending = Buffer.concat([pending, chunk])
        let end: number
        while ((end = pending.indexOf(JPEG_EOI)) !== -1) {
          const jpeg = pending.subarray(0, end + 2)
          pending = pending.subarray(end + 2)
          if (jpeg[0] === 0xff && jpeg[1] === 0xd8) onFrame({ jpeg: Buffer.from(jpeg), capturedAt: Date.now() })
        }
      },
    })
    this.session.requestKeyFrame()
  }

  /**
   * Unmute the camera speaker and play an audio file (any format ffmpeg reads).
   * Calls are queued so two clips never talk over each other.
   */
  speak(audioFile: string): Promise<void> {
    const next = this.speaking.then(() => this.playClip(audioFile))
    this.speaking = next.catch(() => {})
    return next
  }

  private async playClip(audioFile: string) {
    if (this.ended) throw new Error('Live call already ended')
    this.session.activateCameraSpeaker()
    const usingOpus = await this.session.isUsingOpus

    const socket = createSocket('udp4')
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
    const { port } = socket.address() as AddressInfo
    socket.on('message', (msg) => {
      if (!this.ended) this.session.sendAudioPacket(RtpPacket.deSerialize(msg))
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const ff = spawn(ffmpegPath(), [
          '-hide_banner', '-loglevel', 'error',
          '-re', '-i', audioFile,
          '-acodec', ...(usingOpus ? ['libopus', '-ac', '2', '-ar', '48k'] : ['pcm_mulaw', '-ac', '1', '-ar', '8k']),
          '-flags', '+global_header',
          '-f', 'rtp', `rtp://127.0.0.1:${port}`,
        ])
        let stderr = ''
        ff.stderr.on('data', (d) => (stderr += d))
        ff.on('error', reject)
        ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`))))
      })
    } finally {
      socket.close()
    }
  }
}
