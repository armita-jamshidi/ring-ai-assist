import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { RingApi, type RingCamera } from 'ring-client-api'
import { env } from '../config.js'
import { createLogger } from '../logger.js'

const log = createLogger('ring')
const TOKEN_FILE = 'data/ring-refresh-token.txt'

/**
 * Ring rotates the refresh token on every login, so we keep the newest one on
 * disk. data/ wins over .env once it exists.
 */
function loadRefreshToken(): string {
  if (existsSync(TOKEN_FILE)) {
    const saved = readFileSync(TOKEN_FILE, 'utf8').trim()
    if (saved) return saved
  }
  if (env.ringRefreshToken) return env.ringRefreshToken
  throw new Error('No Ring refresh token. Run `npm run auth` and put the token in .env as RING_REFRESH_TOKEN.')
}

export function connectRing(): RingApi {
  const ring = new RingApi({
    refreshToken: loadRefreshToken(),
    // Push notifications drive onMotionStarted / onDoorbellPressed.
    cameraStatusPollingSeconds: 20,
    debug: env.logLevel === 'debug',
  })

  ring.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true })
    writeFileSync(TOKEN_FILE, newRefreshToken)
    log.debug('Saved rotated Ring refresh token')
  })

  return ring
}

/** Cameras to watch: all of them, or only the names listed in config. */
export async function selectCameras(ring: RingApi, names: string[]): Promise<RingCamera[]> {
  const all = await ring.getCameras()
  if (names.length === 0) return all

  const wanted = new Set(names.map((n) => n.toLowerCase()))
  const picked = all.filter((c) => wanted.has(c.name.toLowerCase()))
  const missing = names.filter((n) => !all.some((c) => c.name.toLowerCase() === n.toLowerCase()))
  if (missing.length) {
    log.warn(`Cameras not found on this account: ${missing.join(', ')}. Available: ${all.map((c) => c.name).join(', ')}`)
  }
  return picked
}

export async function findCamera(ring: RingApi, name: string): Promise<RingCamera> {
  const [camera] = await selectCameras(ring, [name])
  if (!camera) throw new Error(`No camera named "${name}"`)
  return camera
}
