import { describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { runDemoActors, seedDemoAndons } from './demoActors'
import { LineSim } from './lineSim'

const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const ix = indexMaster(defaultMaster())

describe('demo personeli (sadece demo)', () => {
  it('koşulu bitmiş eski alarmları onaylayıp kapatır; süren ve yeni alarmlara dokunmaz', () => {
    const raw = new RawDb()
    new LineSim({ t0, startT: t0 - 6 * 3600_000 }).advance(t0, raw)
    const store = new MemoryStore()
    applyCollected(store, ix, raw.since({}), t0)
    const n = runDemoActors(store, ix, t0)
    expect(n).toBeGreaterThan(5)
    for (const a of store.find('alarm')) {
      const old = a.clearedAt !== null && a.clearedAt < t0 - 30 * 60_000
      expect(a.status === 'closed').toBe(old)
      if (old) expect([a.ackBy, a.assignee, a.closeNote].every(Boolean)).toBe(true)
    }
    expect(store.count('audit_log', { where: { action: 'alarm.close' } })).toBe(n)
    expect(runDemoActors(store, ix, t0)).toBe(0)
  })

  it('iki Andon çağrısı açar: biri kapanmış, biri açık', () => {
    const store = new MemoryStore()
    seedDemoAndons(store, ix, t0)
    seedDemoAndons(store, ix, t0)
    const andons = store.find('andon', { orderBy: 't' })
    expect(andons.map((a) => [a.op, a.type])).toEqual([
      ['OP080', 'material'],
      ['OP070', 'quality'],
    ])
    expect(andons.map((a) => store.get('alarm', a.alarmId)!.status)).toEqual(['closed', 'detected'])
  })
})
