import { bottleneck, lineKpi, stationCycleStats } from './kpi'
import type { LineKpi, StationCycleStat } from './kpi'
import type { MasterIndex } from './lineDef'
import { activeAlarms, stationViews, subViews } from './lineState'
import type { StationView, SubView } from './lineState'
import { shiftWindow } from './shifts'
import type { Shift } from './shifts'
import type { Store } from './store/Store'
import type {
  Alarm,
  AndonType,
  ComponentInstall,
  DeviceHealth,
  IoState,
  MotorHold,
  MotorOp,
  Note,
  Person,
  QualityResult,
  Rework,
  Severity,
  Station,
  SubFeed,
  Tightening,
} from './types'

/**
 * Kontrol Merkezi'nin ve Seçili İstasyon panelinin veri modelleri (saf). Demo bunları doğrudan
 * çağırır; sunucu modunda API aynı fonksiyonlarla JSON üretir.
 */

const SEC = 1000
const HOUR = 3600 * SEC
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

export interface LineMotor {
  sn: string
  op: string
  seq: number
  /** Sırasıyla OK biten ana hat operasyonu sayısı (illüstrasyonun aşaması) */
  completed: number
  /** İstasyondaki iş bitti, sıradakini bekliyor */
  done: boolean
}

export type LineEventKind = 'complete' | 'quality' | 'alarm' | 'note' | 'rework'

export interface LineEvent {
  id: string
  t: number
  kind: LineEventKind
  tone: 'good' | 'warning' | 'critical' | 'info'
  op: string | null
  sn: string | null
  text: string
}

export interface Overview {
  /** Hesap anı (demoda simülasyon saati) */
  now: number
  /** Bu ana kadarki fabrika verisi işlendi */
  watermark: number | null
  shift: { shift: Shift; start: number; end: number }
  /** Vardiya hedefi = vardiya süresi / takt */
  shiftTarget: number
  kpi: LineKpi
  stations: StationView[]
  subs: SubView[]
  motors: LineMotor[]
  cycles: StationCycleStat[]
  bottleneck: string | null
  alarms: { active: Alarm[]; critical: number }
  reworks: Rework[]
  holds: MotorHold[]
  events: LineEvent[]
}

/** Sırasıyla OK biten ana hat operasyonu sayısı */
function completedInOrder(ops: MotorOp[], ix: MasterIndex): number {
  const ok = new Set(ops.filter((o) => o.result === 'OK').map((o) => o.op))
  let n = 0
  while (n < ix.main.length && ok.has(ix.main[n].op)) n++
  return n
}

export function buildOverview(store: Store, ix: MasterIndex, now: number): Overview {
  const cfg = ix.master.config
  const shift = shiftWindow(now, cfg.shifts)
  const stations = stationViews(store, ix, now)
  const motors: LineMotor[] = []
  for (const v of stations) {
    if (!v.motorSn) continue
    motors.push({ sn: v.motorSn, op: v.station.op, seq: v.station.seq, completed: completedInOrder(store.find('motor_op', { where: { sn: v.motorSn } }), ix), done: v.opDone })
  }
  const cycles = stationCycleStats(store, ix, 8)
  const active = activeAlarms(store).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.t - a.t)
  return {
    now,
    watermark: store.kvGet<number>('watermark'),
    shift,
    shiftTarget: Math.floor((shift.shift.lengthH * 3600) / cfg.taktSec),
    kpi: lineKpi(store, ix, shift.start, Math.min(now, shift.end)),
    stations,
    subs: subViews(store, ix),
    motors,
    cycles,
    bottleneck: bottleneck(cycles)?.op ?? null,
    alarms: { active, critical: active.filter((a) => a.severity === 'critical').length },
    reworks: store
      .find('rework')
      .filter((r) => r.state !== 'closed')
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.openedAt - b.openedAt),
    holds: store.find('motor_hold', { isNull: ['releasedAt'] }),
    events: recentEvents(store, ix, now, 20),
  }
}

/** Hattın yakın geçmişi: tamamlanan motorlar, kalite kararları, alarmlar, notlar, rework adımları */
export function recentEvents(store: Store, ix: MasterIndex, now: number, limit = 20): LineEvent[] {
  const from = now - 6 * HOUR
  const range = { gte: from, lt: now + 1 }
  const out: LineEvent[] = []
  for (const o of store.find('motor_op', { where: { op: ix.lastMainOp, result: 'OK' }, range: { field: 'end', ...range } }))
    out.push({ id: `c-${o.id}`, t: o.end!, kind: 'complete', tone: 'good', op: o.op, sn: o.sn, text: `${o.sn} tamamlandı ve hattan indirildi` })
  for (const q of store.find('quality_result', { range: { field: 't', ...range } })) {
    const tone = q.decision === 'OK' ? 'good' : q.decision === 'NOK' ? 'critical' : 'warning'
    const text = q.decision === 'OK' ? `${q.sn} OP100 kaliteden geçti${q.attempt > 1 ? ` (${q.attempt}. muayene)` : ''}` : `${q.sn} OP100 ${q.decision}: ${q.defectText ?? q.defectCode ?? ''}`
    out.push({ id: `q-${q.id}`, t: q.t, kind: 'quality', tone, op: 'OP100', sn: q.sn, text })
  }
  for (const a of store.find('alarm', { range: { field: 't', ...range } })) {
    if (a.code === 'VIS-NOK' || a.code === 'VIS-HOLD') continue // kalite kararıyla zaten görünüyor
    out.push({ id: `a-${a.id}`, t: a.t, kind: 'alarm', tone: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info', op: a.op, sn: a.sn, text: a.message })
  }
  for (const n of store.find('note', { range: { field: 't', ...range } }))
    out.push({ id: `n-${n.id}`, t: n.t, kind: 'note', tone: n.type === 'error' ? 'critical' : n.type === 'warning' ? 'warning' : 'info', op: n.op, sn: n.sn, text: `${n.author}: ${n.text}` })
  for (const e of store.find('rework_event', { range: { field: 't', ...range } })) {
    if (e.by === null) continue // sistem adımları kalite kararıyla görünüyor
    const rw = store.get('rework', e.reworkId)
    out.push({ id: `r-${e.id}`, t: e.t, kind: 'rework', tone: 'info', op: rw?.sourceOp ?? null, sn: rw?.sn ?? null, text: `${rw?.sn ?? e.reworkId} rework: ${e.to} (${e.by})` })
  }
  return out.sort((a, b) => b.t - a.t).slice(0, limit)
}

export interface HistoryRow {
  op: MotorOp
  operator: Person | null
  alarms: Alarm[]
  notes: Note[]
}

export interface MaintMetrics {
  windowH: number
  faults: number
  faultMin: number
  /** Ortalama onarım süresi (dk) */
  mttrMin: number | null
  /** Arızalar arası ortalama çalışma süresi (sa) */
  mtbfH: number | null
  /** Çalışma durumunda geçen sürenin oranı */
  busyRatio: number
}

export interface StationDetail {
  station: Station
  /** Ana hat istasyonu için görünüm; ön montaj hücresinde null */
  view: StationView | null
  sub: SubView | null
  nextStation: Station | null
  /** Bu istasyonu besleyen ön montaj (ana hat) ya da beslediği ana hat istasyonu (ön montaj) */
  feed: SubFeed | null
  motor: { sn: string; completed: number } | null
  /** Aktif motorun bu istasyonda okutulan komponentleri */
  components: ComponentInstall[]
  /** Aktif motorun (henüz yoksa bir önceki motorun) bu istasyondaki sıkma sonuçları */
  tightening: { sn: string; current: boolean; rows: Tightening[] } | null
  /** Son operasyon sonucu ve OP100'de son kalite kararı */
  lastResult: MotorOp | null
  quality: QualityResult | null
  lastAlarm: Alarm | null
  alarms: Alarm[]
  andons: { id: string; t: number; type: AndonType; message: string; by: string }[]
  devices: DeviceHealth[]
  io: IoState[]
  maint: MaintMetrics
  notes: Note[]
  history: HistoryRow[]
  cycles: StationCycleStat | null
}

export function stationDetail(store: Store, ix: MasterIndex, op: string, now: number): StationDetail | null {
  const station = ix.station.get(op)
  if (!station) return null
  const isMain = station.line === 'main'
  const view = isMain ? (stationViews(store, ix, now).find((v) => v.station.op === op) ?? null) : null
  const sub = isMain ? null : (subViews(store, ix).find((s) => s.station.op === op) ?? null)
  const idx = ix.mainIndex.get(op)
  const nextStation = idx !== undefined ? (ix.main[idx + 1] ?? null) : (ix.station.get(ix.feedBySub.get(op)?.mainOp ?? '') ?? null)
  const feed = isMain ? (ix.feedByMain.get(op) ?? null) : (ix.feedBySub.get(op) ?? null)

  const sn = view?.motorSn ?? null
  const motorOps = sn ? store.find('motor_op', { where: { sn } }) : []
  const lastOps = store.find('motor_op', { where: { op }, orderBy: 'start', desc: true, limit: 12 })
  // Aktif motorda henüz sıkma yoksa bir önceki motorun sonuçları gösterilir
  const hasTq = (s: string) => store.count('tightening', { where: { sn: s, op } }) > 0
  const tqSn = sn && hasTq(sn) ? sn : (lastOps.find((o) => o.end !== null)?.sn ?? sn)
  const alarms = store.find('alarm', { where: { op }, orderBy: 't', desc: true, limit: 10 })
  const notes = store.find('note', { where: { op }, orderBy: 't', desc: true, limit: 20 })

  // Bakım metrikleri: son 8 saat
  const windowH = 8
  const from = now - windowH * HOUR
  let faultMs = 0
  let runMs = 0
  let faults = 0
  for (const s of store.find('station_span', { where: { op }, range: { field: 'start', gte: from - 24 * HOUR, lt: now + 1 } })) {
    const a = Math.max(s.start, from)
    const b = Math.min(s.end ?? now, now)
    if (b <= a) continue
    if (s.state === 'fault') {
      faultMs += b - a
      if (s.start >= from) faults++
    } else if (s.state === 'running') runMs += b - a
  }

  return {
    station,
    view,
    sub,
    nextStation,
    feed,
    motor: sn ? { sn, completed: completedInOrder(motorOps, ix) } : null,
    components: sn ? store.find('component_install', { where: { sn, op }, isNull: ['replacedAt'] }) : [],
    tightening: station.tightening && tqSn ? { sn: tqSn, current: tqSn === sn, rows: store.find('tightening', { where: { sn: tqSn, op }, orderBy: 't' }) } : null,
    lastResult: lastOps.find((o) => o.end !== null) ?? null,
    quality: op === 'OP100' ? (store.first('quality_result', { orderBy: 't', desc: true }) ?? null) : null,
    lastAlarm: alarms[0] ?? null,
    alarms,
    andons: store
      .find('andon', { where: { op }, orderBy: 't', desc: true })
      .filter((a) => {
        const al = store.get('alarm', a.alarmId)
        return !al || al.status !== 'closed'
      }),
    devices: store.find('device', { where: { op } }),
    io: store.find('io_state', { where: { op } }),
    maint: {
      windowH,
      faults,
      faultMin: faultMs / 60000,
      mttrMin: faults ? faultMs / 60000 / faults : null,
      mtbfH: faults ? runMs / HOUR / faults : null,
      busyRatio: (runMs / (windowH * HOUR)) || 0,
    },
    notes,
    history: lastOps.map((o) => ({
      op: o,
      operator: o.operatorNo ? (ix.person.get(o.operatorNo) ?? null) : null,
      alarms: alarms.filter((a) => a.sn === o.sn),
      notes: notes.filter((n) => n.sn === o.sn),
    })),
    cycles: stationCycleStats(store, ix, 8).find((c) => c.op === op) ?? null,
  }
}

