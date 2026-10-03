import { closeSync, existsSync, openSync, readSync, renameSync, statSync } from 'node:fs'
import type { LogEntry, LogLevel } from '@/domain/maintenance'

/**
 * Uygulama logu (R-073): Fastify / pino JSON satırları `logs/app.log`'a yazılır. Bakım ekranı
 * dosyanın son kısmını okur. Dosya açılışta 20 MB'ı geçtiyse `app.log.1` olarak saklanır.
 */

export const LOG_FILE = 'logs/app.log'
const ROTATE_BYTES = 20 * 1024 * 1024
const TAIL_BYTES = 1024 * 1024

export function rotateIfLarge(file = LOG_FILE, maxBytes = ROTATE_BYTES): boolean {
  if (!existsSync(file) || statSync(file).size < maxBytes) return false
  renameSync(file, `${file}.1`)
  return true
}

const LEVEL: Record<number, LogLevel> = { 10: 'info', 20: 'info', 30: 'info', 40: 'warn', 50: 'error', 60: 'error' }
const RANK: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 }

/** pino JSON satırı → LogEntry */
export function parseLogLine(line: string): LogEntry | null {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof o.time !== 'number' || typeof o.level !== 'number') return null
  const err = o.err as { message?: string; type?: string } | undefined
  const url = typeof o.url === 'string' ? o.url : (o.req as { url?: string } | undefined)?.url
  const detail = err?.message ? `${err.type ? `${err.type}: ` : ''}${err.message}` : url ? `${url}${typeof o.ms === 'number' ? ` (${o.ms} ms)` : ''}` : null
  return {
    t: o.time,
    level: LEVEL[o.level] ?? 'info',
    scope: typeof o.scope === 'string' ? o.scope : o.reqId || o.req ? 'api' : 'server',
    msg: typeof o.msg === 'string' ? o.msg : '',
    detail,
  }
}

/** Log dosyasının son ~1 MB'ı, en yeni önce */
export function readLogTail(file = LOG_FILE, minLevel: LogLevel = 'info', limit = 300): LogEntry[] {
  if (!existsSync(file)) return []
  const size = statSync(file).size
  const len = Math.min(size, TAIL_BYTES)
  const buf = Buffer.alloc(len)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buf, 0, len, size - len)
  } finally {
    closeSync(fd)
  }
  const lines = buf.toString('utf8').split('\n')
  if (len < size) lines.shift() // yarım kalan ilk satır
  const out: LogEntry[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const e = lines[i] ? parseLogLine(lines[i]) : null
    if (e && RANK[e.level] >= RANK[minLevel]) out.push(e)
  }
  return out
}
