import type { MasterIndex } from './lineDef'
import type { Store } from './store/Store'

/**
 * KPI hesapları (R-045–R-047). URS formülleri tanımlamıyor; buradaki tanımlar varsayımdır ve
 * docs/kpi-tanimlari.md'de açıklanır:
 *   Planlı süre       = pencere süresi (mola tanımı yok)
 *   Arıza süresi      = ana hat istasyonlarının arıza aralıklarının birleşimi (seri hatta biri durursa akış durur)
 *   Availability (A)  = (planlı − arıza) / planlı
 *   İdeal çevrim      = ana hattaki en uzun hedef çevrim (hattın tasarım darboğazı)
 *   Performance (P)   = çıkış × ideal çevrim / çalışma süresi
 *   Quality (Q) = FPY = OP100'den ilk denemede OK geçen / OP100'e ilk kez gelen
 *   OEE               = A × P × Q
 *   Plan gerçekleşme  = çıkış / (planlı süre / takt)
 */

const SEC = 1000
const HOUR = 3600 * SEC
/** Bir arıza aralığı bundan uzun sürmez varsayımı (sorguyu zaman aralığıyla sınırlamak için) */
const MAX_SPAN_MS = 24 * HOUR

export interface LineKpi {
  from: number
  to: number
  plannedSec: number
  /** Performans hesabındaki ideal çevrim (sn) */
  idealCycleSec: number
  faultSec: number
  runSec: number
  /** Son istasyondan (OP110) OK çıkan motor */
  output: number
  /** Planlı süreye göre beklenen çıkış */
  expected: number
  firstInspected: number
  firstPassOk: number
  availability: number
  performance: number
  /** = FPY */
  quality: number
  oee: number
  outputPerHour: number
  planAttainment: number
}

/** [a1, a2) aralıklarının birleşiminin uzunluğu */
export function unionLength(intervals: [number, number][]): number {
  const s = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0
  let cur: [number, number] | null = null
  for (const [a, b] of s) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0]
      cur = [a, b]
    } else cur[1] = Math.max(cur[1], b)
  }
  if (cur) total += cur[1] - cur[0]
  return total
}

export function lineKpi(store: Store, ix: MasterIndex, from: number, to: number): LineKpi {
  const takt = ix.master.config.taktSec
  const idealCycleSec = Math.max(...ix.main.map((s) => s.targetCycleSec))
  const plannedSec = Math.max(0, (to - from) / SEC)
  const faults: [number, number][] = []
  for (const st of ix.main) {
    for (const s of store.find('station_span', { where: { op: st.op, state: 'fault' }, range: { field: 'start', gte: from - MAX_SPAN_MS, lt: to } })) {
      const a = Math.max(s.start, from)
      const b = Math.min(s.end ?? to, to)
      if (b > a) faults.push([a, b])
    }
  }
  const faultSec = unionLength(faults) / SEC
  const runSec = Math.max(0, plannedSec - faultSec)
  const output = store.count('motor_op', { where: { op: ix.lastMainOp, result: 'OK' }, range: { field: 'end', gte: from, lt: to } })
  const firsts = store.find('quality_result', { where: { attempt: 1 }, range: { field: 't', gte: from, lt: to } })
  const firstPassOk = firsts.filter((q) => q.decision === 'OK').length
  const availability = plannedSec > 0 ? runSec / plannedSec : Number.NaN
  const performance = runSec > 0 ? (output * idealCycleSec) / runSec : Number.NaN
  const quality = firsts.length > 0 ? firstPassOk / firsts.length : Number.NaN
  const expected = plannedSec / takt
  return {
    from,
    to,
    plannedSec,
    idealCycleSec,
    faultSec,
    runSec,
    output,
    expected,
    firstInspected: firsts.length,
    firstPassOk,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    outputPerHour: plannedSec > 0 ? output / (plannedSec / 3600) : Number.NaN,
    planAttainment: expected > 0 ? output / expected : Number.NaN,
  }
}

export interface StationCycleStat {
  op: string
  name: string
  targetSec: number
  taktSec: number
  /** Son n tamamlanmış çevrim (eski → yeni, sn) */
  cycles: number[]
  n: number
  meanSec: number
  lastSec: number
  minSec: number
  maxSec: number
  /** Ortalama takt'ı aşıyor */
  overTakt: boolean
}

/** İstasyon bazında son n çevrimin (net işleme süresi: START → END) özeti (R-046) */
export function stationCycleStats(store: Store, ix: MasterIndex, n = 8, until = Number.POSITIVE_INFINITY): StationCycleStat[] {
  const takt = ix.master.config.taktSec
  return ix.main.map((st) => {
    const done = store.find('motor_op', { where: { op: st.op }, notNull: ['end'], range: { field: 'end', lt: until }, orderBy: 'end', desc: true, limit: n })
    const cycles = done.map((o) => o.cycleSec!).reverse()
    const meanSec = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : Number.NaN
    return {
      op: st.op,
      name: st.name,
      targetSec: st.targetCycleSec,
      taktSec: takt,
      cycles,
      n: cycles.length,
      meanSec,
      lastSec: cycles.at(-1) ?? Number.NaN,
      minSec: cycles.length ? Math.min(...cycles) : Number.NaN,
      maxSec: cycles.length ? Math.max(...cycles) : Number.NaN,
      overTakt: meanSec > takt,
    }
  })
}

/** Darboğaz: son çevrimlerde ortalama net işleme süresi en yüksek istasyon (R-047) */
export function bottleneck(stats: StationCycleStat[]): StationCycleStat | null {
  let best: StationCycleStat | null = null
  for (const s of stats) if (s.n > 0 && (!best || s.meanSec > best.meanSec)) best = s
  return best
}

/** Saatlik çıkış (pencere saat başlarına bölünür) */
export function hourlyOutput(store: Store, ix: MasterIndex, from: number, to: number): { t: number; output: number }[] {
  const start = Math.floor(from / HOUR) * HOUR
  const out: { t: number; output: number }[] = []
  for (let t = start; t < to; t += HOUR) out.push({ t, output: 0 })
  for (const o of store.find('motor_op', { where: { op: ix.lastMainOp, result: 'OK' }, range: { field: 'end', gte: from, lt: to } })) {
    const k = Math.floor((o.end! - start) / HOUR)
    if (out[k]) out[k].output++
  }
  return out
}
