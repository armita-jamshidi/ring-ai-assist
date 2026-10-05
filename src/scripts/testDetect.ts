// Runs the detector on saved images (oldest first), without a Ring camera.
//   npm run test-detect -- samples/frame1.jpg samples/frame2.jpg samples/frame3.jpg
import { readFileSync } from 'node:fs'
import { env, loadAssistantConfig, requireEnv } from '../config.js'
import { ClaudeDetector } from '../vision/claudeDetector.js'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npm run test-detect -- <image.jpg> [more images...]')
  process.exit(1)
}
requireEnv('ANTHROPIC_API_KEY')

const config = loadAssistantConfig()
const start = Date.now()
// Pretend the images were captured one second apart.
const frames = files.map((f, i) => ({ jpeg: readFileSync(f), capturedAt: start - (files.length - 1 - i) * 1000 }))

const result = await new ClaudeDetector(env.claudeModel).analyze(
  frames,
  config.scenarios.filter((s) => s.enabled),
  { cameraName: 'test' },
)
console.log(JSON.stringify(result, null, 2))
