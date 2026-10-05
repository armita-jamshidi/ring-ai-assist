import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const ToneSchema = z.object({
  voice_id: z.string().min(1),
  model_id: z.string().default('eleven_v3'),
  style_tag: z.string().default(''),
  settings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarity_boost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      speed: z.number().min(0.7).max(1.2).optional(),
    })
    .default({}),
})

const ScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'scenario ids must be snake_case'),
  enabled: z.boolean().default(true),
  description: z.string().min(1),
  response: z.string().min(1),
  tone: z.string(),
  min_confidence: z.number().min(0).max(1).default(0.75),
  consecutive_hits: z.number().int().min(1).default(2),
  cooldown_seconds: z.number().min(0).default(60),
})

const AssistantConfigSchema = z
  .object({
    cameras: z.array(z.string()).default([]),
    watch: z.object({
      session_seconds: z.number().positive().default(90),
      frames_per_second: z.number().positive().default(1),
      analysis_interval_seconds: z.number().positive().default(3),
      frames_per_analysis: z.number().int().min(1).max(10).default(4),
      frame_width: z.number().int().positive().default(960),
    }),
    tones: z.record(z.string(), ToneSchema),
    scenarios: z.array(ScenarioSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    for (const s of cfg.scenarios) {
      if (!cfg.tones[s.tone]) {
        ctx.addIssue({ code: 'custom', message: `scenario "${s.id}" uses unknown tone "${s.tone}"` })
      }
    }
  })

export type Tone = z.infer<typeof ToneSchema>
export type Scenario = z.infer<typeof ScenarioSchema>
export type AssistantConfig = z.infer<typeof AssistantConfigSchema>

export function loadAssistantConfig(path = 'config/assistant.yaml'): AssistantConfig {
  const raw = parseYaml(readFileSync(path, 'utf8'))
  const result = AssistantConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid ${path}:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v ? v : undefined
}

export function requireEnv(name: string): string {
  const v = optional(name)
  if (!v) throw new Error(`Missing ${name} in .env`)
  return v
}

export const env = {
  ringRefreshToken: optional('RING_REFRESH_TOKEN'),
  partner: {
    clientId: optional('RING_PARTNER_CLIENT_ID'),
    clientSecret: optional('RING_PARTNER_CLIENT_SECRET'),
    hmacKey: optional('RING_PARTNER_HMAC_KEY'),
  },
  claudeModel: optional('CLAUDE_MODEL') ?? 'claude-opus-5-5',
  elevenLabsApiKey: optional('ELEVENLABS_API_KEY'),
  dryRun: optional('DRY_RUN') === 'true',
  logLevel: optional('LOG_LEVEL') ?? 'info',
}
