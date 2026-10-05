// Opens a live call and speaks a line through the camera. Use it to test talk-back end to end.
//   npm run say -- "Front Door" calm_helpful "You have to swipe your card."
import { loadAssistantConfig, requireEnv } from '../config.js'
import { LiveSession } from '../ring/liveSession.js'
import { connectRing, findCamera } from '../ring/ringClient.js'
import { ElevenLabsTts } from '../voice/elevenLabsTts.js'

const [cameraName, toneName = 'calm_helpful', text = 'You have to swipe your card.'] = process.argv.slice(2)
if (!cameraName) {
  console.error('Usage: npm run say -- "<camera name>" [tone] [text]')
  process.exit(1)
}

const config = loadAssistantConfig()
const tone = config.tones[toneName]
if (!tone) throw new Error(`Unknown tone "${toneName}"`)

const clip = await new ElevenLabsTts(requireEnv('ELEVENLABS_API_KEY')).synthesize(text, tone)
const ring = connectRing()
const camera = await findCamera(ring, cameraName)
const live = await LiveSession.start(camera, { framesPerSecond: 1, frameWidth: 640, onFrame: () => {} })

// Give the WebRTC call a moment to connect before talking.
await new Promise((r) => setTimeout(r, 2000))
await live.speak(clip)
console.log('Done speaking')
live.stop()
ring.disconnect()
process.exit(0)
