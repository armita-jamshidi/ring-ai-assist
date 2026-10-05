import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { Tone } from '../config.js'
import { createLogger } from '../logger.js'
import type { TextToSpeech } from './tts.js'

const log = createLogger('tts')
const CACHE_DIR = 'data/tts-cache'

/**
 * ElevenLabs TTS. Clips are cached on disk by (text, tone), so a repeated line
 * plays right away instead of waiting on the API.
 */
export class ElevenLabsTts implements TextToSpeech {
  private readonly client: ElevenLabsClient

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey })
    mkdirSync(CACHE_DIR, { recursive: true })
  }

  async synthesize(text: string, tone: Tone): Promise<string> {
    // Audio tags like [gently] only work on the v3 model; other models would read them aloud.
    const spoken = tone.style_tag && tone.model_id.startsWith('eleven_v3') ? `${tone.style_tag} ${text}` : text
    const key = createHash('sha256').update(JSON.stringify({ spoken, tone })).digest('hex').slice(0, 16)
    const file = join(CACHE_DIR, `${key}.mp3`)
    if (existsSync(file)) return file

    log.info(`Generating speech: "${spoken}"`)
    const s = tone.settings
    const stream = await this.client.textToSpeech.convert(tone.voice_id, {
      text: spoken,
      modelId: tone.model_id,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: s.stability,
        similarityBoost: s.similarity_boost,
        style: s.style,
        speed: s.speed,
      },
    })
    const audio = Buffer.from(await new Response(stream).arrayBuffer())
    await writeFile(file, audio)
    return file
  }

  /** Generates every scenario's line up front so the first response isn't delayed. */
  async prewarm(lines: { text: string; tone: Tone }[]) {
    await Promise.all(lines.map(({ text, tone }) => this.synthesize(text, tone)))
  }
}
