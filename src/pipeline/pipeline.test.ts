import { describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { bottleneck, lineKpi, stationCycleStats } from '@/domain/kpi'
import { activeAlarms, motorTrace, motorsOnLine, stationViews, subViews } from '@/domain/lineState'
import { MemoryStore } from '@/domain/store/MemoryStore'
import type { TableName } from '@/domain/store/Store'
import { LineSim } from '@/sim/lineSim'
import { RawDb } from './rawDb'
import { applyCollected } from './transform'

/**
 * Uçtan uca: simülatör → bellekteki "SQL Server" → collector → uygulama veritabanı.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const ix = indexMaster(defaultMaster())

function pipeline(pullEveryMin: number | null, startT = t0 - 24 * HOUR) {
  const db = new RawDb()
  const sim = new LineSim({ t0, startT })
  const store = new MemoryStore()
  const pull = (now: number) => applyCollected(store, ix, db.since(store.kvGet('sync') ?? {}), now)
  let orphans = 0
  if (pullEveryMin === null) {
    sim.advance(t0, db)
    orphans += pull(t0).orphans
  } else {
    // İlk açılışta geçmiş tek turda okunur, sonra her X dakikada bir
    const first = t0 - 6 * HOUR
    sim.advance(first, db)
    orphans += pull(first).orphans
    for (let t = first + pullEveryMin * MIN; t <= t0; t += pullEveryMin * MIN) {
      sim.advance(t, db)
      orphans += pull(t).orphans
    }
  }
  return { store, db, orphans }
}

const once = pipeline(null)

/** Kimlik ve sıra numaraları hariç tablonun içeriği */
function snapshot(store: MemoryStore, table: TableName, omit: string[] = []) {
  return store
    .find(table)
    .map((r) => {
      const o: Record<string, unknown> = { ...r }
      for (const k of omit) delete o[k]
      return JSON.stringify(o)
    })
    .sort()
}

describe('uçtan uca veri hattı', () => {
  it('eşi bulunamayan satır kalmaz', () => {
    expect(once.orphans).toBe(0)
  })

  it('3 dk\'da bir çekmek, tek seferde çekmekle aynı sonucu verir', () => {
    const inc = pipeline(3)
    expect(inc.orphans).toBe(0)
    // Simülatör tek tur ile aynı satırları üretmiş olmalı
    expect(inc.db.total('OperationEvents')).toBe(once.db.total('OperationEvents'))
    for (const table of ['motor', 'motor_op', 'component_install', 'tightening', 'quality_result', 'quality_image', 'station_span', 'sub_sample', 'motor_hold', 'io_state'] as TableName[]) {
      expect(snapshot(inc.store, table), table).toEqual(snapshot(once.store, table))
    }
    expect(snapshot(inc.store, 'rework', ['id'])).toEqual(snapshot(once.store, 'rework', ['id']))
    // Alarm kimlikleri ve mesajları (süren / bitmiş çevrim) farklı olabilir; içerik aynı olmalı
    expect(snapshot(inc.store, 'alarm', ['id', 'message'])).toEqual(snapshot(once.store, 'alarm', ['id', 'message']))
  })

  it('ekran açıldığında hikâyeler görünür', () => {
    const { store } = once
    const views = new Map(stationViews(store, ix, t0).map((v) => [v.station.op, v]))
    expect(views.get('OP020')!.state).toBe('offline')
    expect(views.get('OP050')!.operator?.name).toBe('Rıza Aydın')
    expect(motorsOnLine(store, ix).length).toBeGreaterThanOrEqual(10)

    const op206 = subViews(store, ix).find((s) => s.station.op === 'OP206')!
    expect(op206.state).toBe('warning')
    expect(op206.bufferQty).toBeLessThan(op206.feed.bufferMin)

    const active = activeAlarms(store).map((a) => a.code)
    expect(active).toEqual(expect.arrayContaining(['VIS-NOK', 'HB-LOSS', 'BUF-LOW']))

    const rw = store.find('rework').filter((r) => r.state !== 'closed')
    expect(rw.map((r) => r.defectCode)).toContain('VIS-CBL-007')
    expect(store.get('motor', rw.find((r) => r.defectCode === 'VIS-CBL-007')!.sn)!.status).toBe('rework')

    // Geçmişte kapanmış olaylar
    const closed = store.find('rework', { where: { state: 'closed' } }).map((r) => r.defectCode)
    expect(closed).toContain('VIS-SEAL-011')
    expect(store.find('motor_hold').some((h) => h.reason === 'Etiket / işaret okunamadı' && h.releasedAt !== null)).toBe(true)
    const dup = store.find('alarm', { where: { code: 'TRC-DUP' } })
    expect(dup).toHaveLength(1)
    expect(dup[0].clearedAt).not.toBeNull()
    expect(store.find('alarm', { where: { code: 'TQ-NOK', op: 'OP080' } }).some((a) => a.message.includes('J3') && a.clearedAt !== null)).toBe(true)
    expect(store.find('alarm', { where: { code: 'PLC-FLT', op: 'OP050' } }).some((a) => a.message.includes('el sıkışma'))).toBe(true)
    expect(store.find('alarm', { where: { code: 'CYC-TAKT', op: 'OP070' } }).length).toBeGreaterThan(0)
  })

  it('darboğaz OP070, vardiya KPI\'ları makul aralıkta', () => {
    const { store } = once
    expect(bottleneck(stationCycleStats(store, ix))!.op).toBe('OP070')
    const k = lineKpi(store, ix, new Date(2026, 9, 3, 8).getTime(), t0)
    expect(k.availability).toBeGreaterThan(0.9)
    expect(k.availability).toBeLessThanOrEqual(1)
    expect(k.performance).toBeGreaterThan(0.8)
    expect(k.performance).toBeLessThanOrEqual(1)
    expect(k.quality).toBeGreaterThan(0.85)
    expect(k.planAttainment).toBeGreaterThan(0.85)
    expect(k.oee).toBeCloseTo(k.availability * k.performance * k.quality, 10)
  })

  it('tamamlanan motorların as-built geçmişi eksiksizdir (AC-04, AC-05)', () => {
    const { store } = once
    const done = store.find('motor', { where: { status: 'completed' } })
    expect(done.length).toBeGreaterThan(150)
    for (const m of done.slice(-20)) {
      const tr = motorTrace(store, ix, m.id)!
      expect(tr.completion).toBe(1)
      expect(tr.components.filter((c) => c.status === 'installed')).toHaveLength(7)
      expect(tr.quality.at(-1)!.decision).toBe('OK')
      expect(tr.images.length).toBeGreaterThanOrEqual(6)
      for (const s of tr.steps) expect(s.op!.operatorNo === null).toBe(s.station.type !== 'manual')
    }
  })
})
