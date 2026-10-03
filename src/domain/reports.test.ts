import { beforeAll, describe, expect, it } from 'vitest'
import { lineKpi } from './kpi'
import { defaultMaster, indexMaster } from './lineDef'
import { maintenanceView } from './maintenance'
import { kpiReport, reportWindow, shiftRange } from './reports'
import { dayStartOf } from './shifts'
import { MemoryStore } from './store/MemoryStore'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'

const ix = indexMaster(defaultMaster())
const H = 3600_000
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const day = dayStartOf(t0)
let store: MemoryStore

beforeAll(() => {
  const raw = new RawDb()
  new LineSim({ t0, startT: t0 - 12 * H }).advance(t0, raw)
  store = new MemoryStore()
  applyCollected(store, ix, raw.since({}), t0)
})

describe('KPI & Raporlar: tarih ve vardiya filtresi (R-049)', () => {
  it('üretim günü 08:00\'de başlar: A 08–16, B 16–24, C ertesi gün 00–08', () => {
    const [A, B, C] = ix.master.config.shifts
    expect(new Date(day).getHours()).toBe(8)
    expect(shiftRange(ix, day, A)).toEqual({ from: day, end: day + 8 * H })
    expect(shiftRange(ix, day, B)).toEqual({ from: day + 8 * H, end: day + 16 * H })
    expect(shiftRange(ix, day, C)).toEqual({ from: day + 16 * H, end: day + 24 * H })
    expect(new Date(shiftRange(ix, day, C).from).getHours()).toBe(0)
  })

  it('pencere şimdiye kırpılır; süren vardiyanın KPI\'sı Kontrol Merkezi ile aynıdır', () => {
    const w = reportWindow(ix, { day, shift: 'A' }, t0, day - 6 * H)
    expect([w.from, w.to, w.complete, w.calcFrom, w.partial]).toEqual([day, t0, false, day, false])
    const r = kpiReport(store, ix, { day, shift: 'A' }, t0)
    expect(r.kpi).toEqual(lineKpi(store, ix, day, t0))
    expect(r.shifts.map((s) => [s.shift.id, s.kpi === null])).toEqual([
      ['A', false],
      ['B', true],
      ['C', true],
    ])
  })

  it('önceki gün tamamlanmış pencere; vardiya toplamları tüm günle tutarlı', () => {
    const prev = day - 24 * H
    const all = kpiReport(store, ix, { day: prev, shift: null }, t0)
    expect(all.window.complete).toBe(true)
    const sum = all.shifts.reduce((a, s) => a + (s.kpi?.output ?? 0), 0)
    expect(sum).toBe(all.kpi.output)
  })

  it('veri toplanmadan önceki süre hesaba girmez: verisiz vardiya boş, kısmi vardiya veri başlangıcından hesaplanır', () => {
    // Simülasyon 02:30'da başlıyor: dünkü A ve B vardiyasında veri yok, C (00–08) kısmi
    const prev = kpiReport(store, ix, { day: day - 24 * H, shift: 'C' }, t0)
    expect(prev.dataFrom).not.toBeNull()
    expect(prev.shifts.map((s) => [s.shift.id, s.window.noData, s.window.partial])).toEqual([
      ['A', true, false],
      ['B', true, false],
      ['C', false, true],
    ])
    expect(prev.shifts[0].kpi).toBeNull()
    expect(prev.window.calcFrom).toBe(prev.dataFrom)
    expect(prev.kpi).toEqual(lineKpi(store, ix, prev.dataFrom!, prev.window.to))
    expect(prev.kpi.availability).toBeGreaterThan(0.5)
    const firstHour = prev.hourly.find((h) => h.t + H > prev.dataFrom!)!
    expect(firstHour.target).toBeLessThan(3600 / ix.master.config.taktSec)
    expect(prev.hourly.filter((h) => h.t + H <= prev.dataFrom!).every((h) => h.target === 0)).toBe(true)
  })

  it('saatlik çıkış toplamı çıkışa eşit; tam saatte hedef 3600 / takt', () => {
    const r = kpiReport(store, ix, { day, shift: 'A' }, t0)
    expect(r.hourly.length).toBe(8)
    expect(r.hourly.reduce((a, h) => a + h.output, 0)).toBe(r.kpi.output)
    expect(r.hourly[0].target).toBeCloseTo(3600 / ix.master.config.taktSec)
    expect(r.hourly[6].target).toBeCloseTo(4) // 14:00–14:30
    expect(r.hourly[7].target).toBe(0)
  })

  it('istasyon çevrimleri, darboğaz (R-046, R-047) ve trend', () => {
    const r = kpiReport(store, ix, { day, shift: 'A' }, t0)
    const op70 = r.stations.find((s) => s.op === 'OP070')!
    expect(op70.n).toBe(store.count('motor_op', { where: { op: 'OP070' }, notNull: ['end'], range: { field: 'end', gte: day, lt: t0 } }))
    const max = Math.max(...r.stations.filter((s) => s.n).map((s) => s.meanSec))
    expect(r.stations.find((s) => s.op === r.bottleneck)!.meanSec).toBe(max)
    expect(r.trend.op).toBe(r.bottleneck)
    const t = kpiReport(store, ix, { day, shift: 'A', op: 'OP030' }, t0).trend
    expect(t.op).toBe('OP030')
    expect(t.points.length).toBe(r.stations.find((s) => s.op === 'OP030')!.n)
    expect(t.points.every((p, i) => i === 0 || p.t >= t.points[i - 1].t)).toBe(true)
  })
})

describe('Bakım & Entegrasyon görünümü (R-024, R-057)', () => {
  it('cihaz özetleri, IO ve istasyon bakım metrikleri', () => {
    const m = maintenanceView(store, ix, t0)
    expect(m.summary.map((s) => s.type)).toEqual(['plc', 'controller', 'tool', 'camera'])
    expect(m.summary.find((s) => s.type === 'plc')!.total).toBe(18)
    expect(m.summary.find((s) => s.type === 'controller')!.total).toBe(4)
    expect(m.stations.length).toBe(18)
    expect(m.io.length).toBeGreaterThan(10)
    for (const s of m.stations) {
      expect(s.runRatio).toBeGreaterThanOrEqual(0)
      expect(s.runRatio).toBeLessThanOrEqual(1)
      if (s.faults) expect(s.mttrMin).toBeGreaterThan(0)
    }
    expect(m.faults.every((f, i) => f.state === 'fault' && (i === 0 || f.start <= m.faults[i - 1].start))).toBe(true)
  })
})
