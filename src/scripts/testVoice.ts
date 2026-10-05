// Generates a line in a tone and saves it as an mp3 so you can listen to it locally.
//   npm run test-voice -- calm_helpful "You have to swipe your card."
import { loadAssistantConfig, requireEnv } from '../config.js'
import { ElevenLabsTts } from '../voice/elevenLabsTts.js'

const [toneName = 'calm_helpful', text = 'You have to swipe your card.'] = process.argv.slice(2)
const config = loadAssistantConfig()
const tone = config.tones[toneName]
if (!tone) {
  console.error(`Unknown tone "${toneName}". Tones: ${Object.keys(config.tones).join(', ')}`)
  process.exit(1)
}

const file = await new ElevenLabsTts(requireEnv('ELEVENLABS_API_KEY')).synthesize(text, tone)
console.log(`Saved: ${file}`)
