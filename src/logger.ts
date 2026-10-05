import { env } from './config.js'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
type Level = keyof typeof LEVELS

const threshold = LEVELS[(env.logLevel as Level) in LEVELS ? (env.logLevel as Level) : 'info']

function write(level: Level, scope: string, msg: string, extra?: unknown) {
  if (LEVELS[level] < threshold) return
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`
  const out = level === 'error' || level === 'warn' ? console.error : console.log
  extra === undefined ? out(line) : out(line, extra)
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => write('debug', scope, msg, extra),
    info: (msg: string, extra?: unknown) => write('info', scope, msg, extra),
    warn: (msg: string, extra?: unknown) => write('warn', scope, msg, extra),
    error: (msg: string, extra?: unknown) => write('error', scope, msg, extra),
  }
}

export type Logger = ReturnType<typeof createLogger>
