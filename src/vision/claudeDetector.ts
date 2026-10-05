import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Scenario } from '../config.js'
import { createLogger } from '../logger.js'
import type { Frame } from '../ring/liveSession.js'
import type { DetectionResult, Detector } from './detector.js'

const log = createLogger('claude')

const ResultSchema = z.object({
  observations: z.string().describe('One or two sentences on what is happening in the frames.'),
  detections: z.array(
    z.object({
      scenario_id: z.string(),
      confidence: z.number().describe('0 to 1'),
      evidence: z.string().describe('What in the frames supports this.'),
    }),
  ),
})

const SYSTEM_PROMPT = `You watch a live security camera feed for an assistant that can speak to people through the camera's speaker. Your job is to notice when someone in view needs a specific kind of help, so the assistant can step in.

You get a few consecutive frames, oldest first, and a list of scenarios. For each scenario that is clearly happening, add a detection with a confidence from 0 to 1. Leave out scenarios that aren't happening. Return an empty detections list when nobody needs help, which will be most of the time.

Speaking up when nobody needs help is annoying and erodes trust, so only report a scenario when the frames actually show it. One frame of someone near a device is not struggling; repeated attempts or visible confusion across frames is.`

export class ClaudeDetector implements Detector {
  private readonly client = new Anthropic()

  constructor(private readonly model: string) {}

  async analyze(frames: Frame[], scenarios: Scenario[], { cameraName }: { cameraName: string }): Promise<DetectionResult> {
    const newest = frames[frames.length - 1]?.capturedAt ?? Date.now()
    const scenarioList = scenarios.map((s) => `- ${s.id}: ${s.description.trim()}`).join('\n')

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: `Camera: ${cameraName}\n\nScenarios:\n${scenarioList}` },
    ]
    for (const [i, f] of frames.entries()) {
      const secondsAgo = ((newest - f.capturedAt) / 1000).toFixed(1)
      content.push({ type: 'text', text: `Frame ${i + 1} (${secondsAgo}s ago)` })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.jpeg.toString('base64') } })
    }

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Low effort: this runs every few seconds and latency matters more than depth.
      output_config: { effort: 'low', format: betaZodOutputFormat(ResultSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      log.warn(`Analysis declined (${response.stop_details?.category ?? 'unknown'}); treating as no detection`)
      return { observations: '', detections: [] }
    }
    const parsed = response.parsed_output
    if (!parsed) {
      log.warn(`No structured output (stop_reason=${response.stop_reason})`)
      return { observations: '', detections: [] }
    }

    const known = new Set(scenarios.map((s) => s.id))
    return {
      observations: parsed.observations,
      detections: parsed.detections
        .filter((d) => known.has(d.scenario_id))
        .map((d) => ({ scenarioId: d.scenario_id, confidence: d.confidence, evidence: d.evidence })),
    }
  }
}
