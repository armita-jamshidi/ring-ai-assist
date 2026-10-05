import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** The ffmpeg binary bundled with ring-client-api's dependency, else the one on PATH. */
export function ffmpegPath(): string {
  try {
    const bundled: string | undefined = require('ffmpeg-for-homebridge')
    if (bundled) return bundled
  } catch {
    // not installed - fall through
  }
  return 'ffmpeg'
}
