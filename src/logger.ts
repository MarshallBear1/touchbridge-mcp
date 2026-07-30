type LogLevel = 'log' | 'warn' | 'error'

export function log(tag: string, level: LogLevel, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  const prefix = level === 'error' ? 'ERR' : level === 'warn' ? 'WRN' : 'LOG'
  process.stderr.write(`[${timestamp}] ${prefix} [${tag}] ${message}\n`)
}
