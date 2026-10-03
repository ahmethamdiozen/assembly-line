import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLogLine, readLogTail, rotateIfLarge } from './logs'

describe('uygulama logu (R-073)', () => {
  it('pino satırlarını okur; seviyeye göre süzer, en yeni önce', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm50-log-'))
    const file = join(dir, 'app.log')
    const lines = [
      { level: 30, time: 1, msg: 'Server listening', hostname: 'x' },
      { level: 40, time: 2, reqId: 'req-1', url: '/api/v1/overview', ms: 1200, msg: 'yavaş istek' },
      { level: 50, time: 3, scope: 'collector', msg: 'Collector hatası: bağlanamadı' },
      { level: 50, time: 4, reqId: 'req-2', err: { type: 'TypeError', message: 'x is undefined' }, msg: 'istek hatası' },
    ]
    writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\nbozuk satır\n`)
    const all = readLogTail(file)
    expect(all.map((e) => e.t)).toEqual([4, 3, 2, 1])
    expect(all[0]).toEqual({ t: 4, level: 'error', scope: 'api', msg: 'istek hatası', detail: 'TypeError: x is undefined' })
    expect(all[2]).toMatchObject({ level: 'warn', scope: 'api', detail: '/api/v1/overview (1200 ms)' })
    expect(readLogTail(file, 'error').map((e) => e.scope)).toEqual(['api', 'collector'])
    expect(parseLogLine('{"msg":"zamansız"}')).toBeNull()
    expect(readLogTail(join(dir, 'yok.log'))).toEqual([])
    expect(rotateIfLarge(file, 10)).toBe(true)
    expect(readLogTail(file)).toEqual([])
    expect(readLogTail(`${file}.1`).length).toBe(4)
  })
})
