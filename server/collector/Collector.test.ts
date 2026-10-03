import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { RawDb } from '@/pipeline/rawDb'
import { LineSim } from '@/sim/lineSim'
import { Collector } from './Collector'
import type { RawReader } from './sqlReader'

const ix = indexMaster(defaultMaster())
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const HOUR = 3600_000

/** Bellekteki "SQL Server"ı okuyan sahte okuyucu */
function memReader(db: RawDb, failing = { on: false }): RawReader {
  return {
    read: async (last, limit) => {
      if (failing.on) throw new Error('Bağlantı reddedildi (ECONNREFUSED)')
      return db.since(last, limit)
    },
    maxIds: async () => db.lastIds(),
  }
}

afterEach(() => vi.useRealTimers())

describe('Collector', () => {
  it('ilk turda birikmeyi okur, sonraki turlarda sadece yenileri; turları kaydeder', async () => {
    const db = new RawDb()
    const sim = new LineSim({ t0, startT: t0 - 2 * HOUR })
    sim.advance(t0, db)
    const store = new MemoryStore()
    let now = t0
    const c = new Collector({ store, ix: () => ix, reader: memReader(db), intervalMin: 3, now: () => now })
    const r1 = await c.runOnce()
    expect(r1.ok).toBe(true)
    expect(r1.rows).toBeGreaterThan(1000)
    sim.advance(t0 + 3 * 60_000, db)
    now = t0 + 3 * 60_000
    const r2 = await c.runOnce()
    expect(r2.rows).toBeGreaterThan(0)
    expect(r2.rows).toBeLessThan(500)
    const s = c.status()
    expect(s.lastRun?.at).toBe(now)
    expect(s.watermark).toBe(now - 15_000)
    expect(store.kvGet<unknown[]>('collector:runs')).toHaveLength(2)
  })

  it('SQL Server hatası turu düşürmez; hata kaydedilir ve kısa sürede tekrar denenir', async () => {
    vi.useFakeTimers()
    const db = new RawDb()
    new LineSim({ t0, startT: t0 - HOUR }).advance(t0, db)
    const failing = { on: true }
    const store = new MemoryStore()
    const c = new Collector({ store, ix: () => ix, reader: memReader(db, failing), intervalMin: 3, now: () => t0 })
    const r = await c.trigger()
    expect([r.ok, r.error]).toEqual([false, 'Bağlantı reddedildi (ECONNREFUSED)'])
    expect(c.status().nextRunAt).toBe(t0 + 15_000)
    failing.on = false
    await vi.advanceTimersByTimeAsync(15_000)
    expect(c.status().lastRun?.ok).toBe(true)
    expect(c.status().nextRunAt).toBe(t0 + 3 * 60_000) // veri geldikten sonra normal aralık
    c.stop()
  })

  it('aynı anda iki tur çalışmaz', async () => {
    const db = new RawDb()
    new LineSim({ t0, startT: t0 - HOUR }).advance(t0, db)
    const c = new Collector({ store: new MemoryStore(), ix: () => ix, reader: memReader(db), intervalMin: 3, now: () => t0 })
    const [a, b] = await Promise.all([c.runOnce(), c.runOnce()])
    expect(a).toBe(b)
  })

  it('kaynak sıfırlanmışsa okumayı durdurur ve açık hata verir', async () => {
    const db = new RawDb()
    new LineSim({ t0, startT: t0 - HOUR }).advance(t0, db)
    const store = new MemoryStore()
    const c1 = new Collector({ store, ix: () => ix, reader: memReader(db), intervalMin: 3, now: () => t0 })
    await c1.runOnce()
    const fresh = new RawDb() // sıfırlanmış SQL Server
    new LineSim({ t0, startT: t0 - 10 * 60_000 }).advance(t0, fresh)
    const motors = store.count('motor')
    const r = await new Collector({ store, ix: () => ix, reader: memReader(fresh), intervalMin: 3, now: () => t0 }).runOnce()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('sıfırlanmış olabilir')
    expect(store.count('motor')).toBe(motors)
  })
})
