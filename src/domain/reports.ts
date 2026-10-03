import { lineKpi, unionLength } from './kpi'
import type { LineKpi } from './kpi'
import type { MasterIndex } from './lineDef'
import { alarmPareto, defectPareto } from './pareto'
import type { ParetoItem } from './pareto'
import type { Shift, ShiftId } from './shifts'
import type { Store } from './store/Store'

/**
 * KPI & Raporlar (R-045–R-049): seçilen üretim günü ve vardiya için performans, vardiya
 * karşılaştırması, saatlik çıkış, istasyon çevrimleri, darboğaz, çevrim trendi ve Pareto'lar.
 * Üretim günü config.dayStartHour'da başlar (varsayılan 08:00; A 08–16, B 16–24, C 00–08).
 */

const SEC = 1000
const HOUR = 3600 * SEC
const MAX_SPAN_MS = 24 * HOUR

export interface KpiQuery {
  /** Üretim gününün başlangıcı (ms, dayStartOf ile) */
  day: number
  /** null: tüm gün */
  shift: ShiftId | null
  /** Çevrim trendi gösterilecek istasyon; null ise darboğaz */
  op?: string | null
}

export interface ReportWindow {
  from: number
  /** Şimdiye kırpılmış bitiş */
  to: number
  /** Pencerenin planlı bitişi */
  end: number
  /** Pencere bitti mi (şimdi > bitiş) */
  complete: boolean
  /**
   * Hesabın başladığı an: pencere başı ya da (pencere veri toplanmaya başlamadan önce başlıyorsa)
   * ilk fabrika verisi. Verisiz süre arıza ya da düşük performans gibi görünmesin diye dışarıda kalır.
   */
  calcFrom: number
  /** Pencerenin bir kısmında veri yok */
  partial: boolean
  /** Pencerede hiç veri yok */
  noData: boolean
}

export interface StationWindowStat {
  op: string
  name: string
  targetSec: number
  taktSec: number
  n: number
  meanSec: number
  medianSec: number
  maxSec: number
  /** Takt'ı aşan çevrim sayısı */
  overTakt: number
  faultMin: number
}

export interface ShiftRow {
  shift: Shift
  window: ReportWindow
  /** Henüz başlamamış ya da verisi olmayan vardiyada null */
  kpi: LineKpi | null
}

export interface KpiReport {
  query: KpiQuery
  window: ReportWindow
  /** Uygulama veritabanındaki ilk fabrika verisi (operasyon kaydı) */
  dataFrom: number | null
  kpi: LineKpi
  shifts: ShiftRow[]
  /** Saat başına çıkış ve takt'a göre beklenen */
  hourly: { t: number; output: number; target: number }[]
  stations: StationWindowStat[]
  /** Penceredeki ortalama çevrimi en yüksek istasyon (R-047) */
  bottleneck: string | null
  trend: { op: string; points: { t: number; sec: number; sn: string }[] }
  defects: ParetoItem[]
  alarmSources: ParetoItem[]
}

/** Üretim günü içindeki vardiya penceresi */
export function shiftRange(ix: MasterIndex, day: number, shift: Shift): { from: number; end: number } {
  const offH = (shift.startHour - ix.master.config.dayStartHour + 24) % 24
  const from = day + offH * HOUR
  return { from, end: from + shift.lengthH * HOUR }
}

function windowOf(from: number, end: number, now: number, dataFrom: number | null): ReportWindow {
  const to = Math.max(from, Math.min(end, now))
  // Henüz başlamamış pencere de verisiz sayılır (ekranda "henüz başlamadı" olarak ayrılır)
  const noData = to <= from || dataFrom === null || dataFrom >= to
  const calcFrom = noData ? to : Math.max(from, dataFrom)
  return { from, end, to, complete: now >= end, calcFrom, partial: !noData && calcFrom > from, noData }
}

/** İlk fabrika verisinin zamanı (veri toplanmaya başladığı an) */
export function dataStart(store: Store): number | null {
  return store.first('motor_op', { orderBy: 'start' })?.start ?? null
}

export function reportWindow(ix: MasterIndex, q: KpiQuery, now: number, dataFrom: number | null): ReportWindow {
  const shift = q.shift ? ix.master.config.shifts.find((s) => s.id === q.shift) : null
  if (shift) {
    const r = shiftRange(ix, q.day, shift)
    return windowOf(r.from, r.end, now, dataFrom)
  }
  return windowOf(q.day, q.day + 24 * HOUR, now, dataFrom)
}

const median = (xs: number[]) => {
  if (!xs.length) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Penceredeki tamamlanmış çevrimlerin istasyon bazında özeti (R-046) */
export function stationWindowStats(store: Store, ix: MasterIndex, from: number, to: number): StationWindowStat[] {
  const takt = ix.master.config.taktSec
  return ix.main.map((st) => {
    const cycles = store.find('motor_op', { where: { op: st.op }, notNull: ['end'], range: { field: 'end', gte: from, lt: to } }).map((o) => o.cycleSec!)
    const faults: [number, number][] = store
      .find('station_span', { where: { op: st.op, state: 'fault' }, range: { field: 'start', gte: from - MAX_SPAN_MS, lt: to } })
      .map((s) => [Math.max(s.start, from), Math.min(s.end ?? to, to)])
    return {
      op: st.op,
      name: st.name,
      targetSec: st.targetCycleSec,
      taktSec: takt,
      n: cycles.length,
      meanSec: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : Number.NaN,
      medianSec: median(cycles),
      maxSec: cycles.length ? Math.max(...cycles) : Number.NaN,
      overTakt: cycles.filter((c) => c > takt).length,
      faultMin: unionLength(faults) / 60_000,
    }
  })
}

export function kpiReport(store: Store, ix: MasterIndex, q: KpiQuery, now: number): KpiReport {
  const cfg = ix.master.config
  const dataFrom = dataStart(store)
  const window = reportWindow(ix, q, now, dataFrom)
  const { from, to, calcFrom } = window
  const kpi = lineKpi(store, ix, calcFrom, to)

  const shifts: ShiftRow[] = [...cfg.shifts]
    .map((shift) => ({ shift, r: shiftRange(ix, q.day, shift) }))
    .sort((a, b) => a.r.from - b.r.from)
    .map(({ shift, r }) => {
      const w = windowOf(r.from, r.end, now, dataFrom)
      return { shift, window: w, kpi: w.noData ? null : lineKpi(store, ix, w.calcFrom, w.to) }
    })

  const perHour = HOUR / (cfg.taktSec * SEC)
  const hourly: KpiReport['hourly'] = []
  // Beklenen: saatin veri olan ve geçmiş kısmı kadar
  for (let t = from; t < window.end; t += HOUR) {
    const a = Math.max(t, calcFrom)
    const b = Math.min(t + HOUR, to)
    hourly.push({ t, output: 0, target: b > a ? (perHour * (b - a)) / HOUR : 0 })
  }
  for (const o of store.find('motor_op', { where: { op: ix.lastMainOp, result: 'OK' }, range: { field: 'end', gte: from, lt: to } })) {
    const k = Math.floor((o.end! - from) / HOUR)
    if (hourly[k]) hourly[k].output++
  }

  const stations = stationWindowStats(store, ix, from, to)
  let bottleneck: StationWindowStat | null = null
  for (const s of stations) if (s.n > 0 && (!bottleneck || s.meanSec > bottleneck.meanSec)) bottleneck = s

  const trendOp = q.op && ix.mainIndex.has(q.op) ? q.op : (bottleneck?.op ?? ix.main[0].op)
  const points = store
    .find('motor_op', { where: { op: trendOp }, notNull: ['end'], range: { field: 'end', gte: from, lt: to }, orderBy: 'end' })
    .map((o) => ({ t: o.end!, sec: o.cycleSec!, sn: o.sn }))

  return {
    query: q,
    window,
    dataFrom,
    kpi,
    shifts,
    hourly,
    stations,
    bottleneck: bottleneck?.op ?? null,
    trend: { op: trendOp, points },
    defects: defectPareto(store, from, to),
    alarmSources: alarmPareto(store, from, to, 'source'),
  }
}
