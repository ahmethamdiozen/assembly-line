import type { MasterIndex } from './lineDef'
import { motorTrace } from './lineState'
import type { MotorTrace } from './lineState'
import { alarmPareto, defectPareto } from './pareto'
import type { ParetoItem } from './pareto'
import type { Store } from './store/Store'
import type { Alarm, AlarmEvent, AlarmSource, Andon, DeviceHealth, Motor, MotorHold, OpConfirmation, QualityResult, Rework, ReworkEvent, Severity, Tightening } from './types'

/**
 * Motor Takibi, Kalite & Rework, Alarm Merkezi ve Tork ekranlarının veri modelleri (saf).
 * Demo bunları doğrudan çağırır; sunucuda API aynı fonksiyonlarla JSON üretir.
 */

export interface TimeWindow {
  from: number
  to: number
}

// ---------------------------------------------------------------- Motor Takibi (R-027–R-032)

export interface MotorSummary {
  sn: string
  status: Motor['status']
  currentOp: string | null
  createdAt: number
  completedAt: number | null
  /** Arama bileşen seri numarasıyla eşleştiyse */
  matchedComponent: string | null
}

const summary = (m: Motor, matchedComponent: string | null = null): MotorSummary => ({ sn: m.id, status: m.status, currentOp: m.currentOp, createdAt: m.createdAt, completedAt: m.completedAt, matchedComponent })

/** Motor seri numarası ya da takılı komponent seri numarasıyla arama; boş aramada son motorlar */
export function searchMotors(store: Store, q: string, limit = 20): MotorSummary[] {
  const term = q.trim()
  if (!term) return store.find('motor', { orderBy: 'createdAt', desc: true, limit }).map((m) => summary(m))
  const out = new Map<string, MotorSummary>()
  for (const m of store.find('motor', { contains: { field: 'id', value: term }, orderBy: 'createdAt', desc: true, limit })) out.set(m.id, summary(m))
  if (out.size < limit) {
    for (const c of store.find('component_install', { contains: { field: 'componentSn', value: term }, orderBy: 't', desc: true, limit })) {
      if (out.has(c.sn)) continue
      const m = store.get('motor', c.sn)
      if (m) out.set(m.id, summary(m, c.componentSn))
      if (out.size >= limit) break
    }
  }
  return [...out.values()]
}

export interface MotorDetail extends MotorTrace {
  reworkEvents: ReworkEvent[]
  /** Teknisyenlerin terminalden verdiği "operasyonu tamamla" onayları */
  confirmations: OpConfirmation[]
}

export function motorDetail(store: Store, ix: MasterIndex, sn: string): MotorDetail | null {
  const t = motorTrace(store, ix, sn)
  if (!t) return null
  const reworkEvents = t.reworks.flatMap((r) => store.find('rework_event', { where: { reworkId: r.id }, orderBy: 't' }))
  return { ...t, reworkEvents, confirmations: store.find('op_confirmation', { where: { sn }, orderBy: 't' }) }
}

// ---------------------------------------------------------------- Kalite & Rework (R-033–R-036, R-048)

export interface QualityView {
  window: TimeWindow
  results: QualityResult[]
  firstInspected: number
  firstPassOk: number
  fpy: number
  nok: number
  hold: number
  reworksOpen: Rework[]
  reworksClosed: Rework[]
  holdsOpen: MotorHold[]
  /** Açık rework'lerin adım geçmişi */
  events: Record<string, ReworkEvent[]>
  defectPareto: ParetoItem[]
}

export function qualityView(store: Store, w: TimeWindow): QualityView {
  const results = store.find('quality_result', { range: { field: 't', gte: w.from, lt: w.to }, orderBy: 't', desc: true })
  const firsts = results.filter((r) => r.attempt === 1)
  const firstPassOk = firsts.filter((r) => r.decision === 'OK').length
  const reworks = store.find('rework', { orderBy: 'openedAt', desc: true })
  const reworksOpen = reworks.filter((r) => r.state !== 'closed')
  const events: Record<string, ReworkEvent[]> = {}
  for (const r of reworksOpen) events[r.id] = store.find('rework_event', { where: { reworkId: r.id }, orderBy: 't' })
  return {
    window: w,
    results: results.slice(0, 300),
    firstInspected: firsts.length,
    firstPassOk,
    fpy: firsts.length ? firstPassOk / firsts.length : Number.NaN,
    nok: results.filter((r) => r.decision === 'NOK').length,
    hold: results.filter((r) => r.decision === 'HOLD').length,
    reworksOpen,
    reworksClosed: reworks.filter((r) => r.state === 'closed' && (r.closedAt ?? 0) >= w.from).slice(0, 50),
    holdsOpen: store.find('motor_hold', { isNull: ['releasedAt'], orderBy: 't' }),
    events,
    defectPareto: defectPareto(store, w.from, w.to),
  }
}

// ---------------------------------------------------------------- Alarm Merkezi (R-037–R-041, R-048)

export interface AlarmListView {
  window: TimeWindow
  /** Penceredeki alarmlar + pencereden eski ama hâlâ açık olanlar (yeni → eski) */
  alarms: Alarm[]
  bySeverity: Record<Severity, number>
  byStatus: Record<Alarm['status'], number>
  sourcePareto: ParetoItem[]
  andons: Andon[]
}

/** Koşulu süren ya da kapatılmamış alarm */
export const isOpenAlarm = (a: Alarm) => a.status !== 'closed'

export function alarmList(store: Store, w: TimeWindow): AlarmListView {
  const inWindow = store.find('alarm', { range: { field: 't', gte: w.from, lt: w.to } })
  const ids = new Set(inWindow.map((a) => a.id))
  const older = store.find('alarm', { range: { field: 't', lt: w.from } }).filter((a) => isOpenAlarm(a) && !ids.has(a.id))
  const alarms = [...inWindow, ...older].sort((a, b) => b.t - a.t)
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 }
  const byStatus: Record<Alarm['status'], number> = { detected: 0, acknowledged: 0, assigned: 0, closed: 0 }
  for (const a of alarms) {
    bySeverity[a.severity]++
    byStatus[a.status]++
  }
  return {
    window: w,
    alarms,
    bySeverity,
    byStatus,
    sourcePareto: alarmPareto(store, w.from, w.to, 'source'),
    andons: store.find('andon', { range: { field: 't', gte: w.from - 7 * 24 * 3600_000, lt: w.to }, orderBy: 't', desc: true }),
  }
}

export interface AlarmDetail {
  alarm: Alarm
  events: AlarmEvent[]
  andon: Andon | null
  /** İlgili motorun durumu (motor izlenebilirliğine geçiş için, R-041) */
  motor: MotorSummary | null
  /** Aynı istasyondaki son alarmlar */
  related: Alarm[]
}

export function alarmDetail(store: Store, id: string): AlarmDetail | null {
  const alarm = store.get('alarm', id)
  if (!alarm) return null
  const m = alarm.sn ? store.get('motor', alarm.sn) : undefined
  return {
    alarm,
    events: store.find('alarm_event', { where: { alarmId: id }, orderBy: 't' }),
    andon: store.find('andon').find((a) => a.alarmId === id) ?? null,
    motor: m ? summary(m) : null,
    related: alarm.op ? store.find('alarm', { where: { op: alarm.op }, orderBy: 't', desc: true, limit: 6 }).filter((a) => a.id !== id).slice(0, 5) : [],
  }
}

export const ALARM_SOURCES: AlarmSource[] = ['PLC', 'Cycle', 'Torque', 'Vision', 'Material', 'Operator', 'System']

// ---------------------------------------------------------------- Tork (R-042–R-044)

export interface TighteningFilter extends TimeWindow {
  op?: string | null
  result?: 'OK' | 'NOK' | null
  /** Motor seri numarası parçası */
  sn?: string | null
}

export interface TighteningStation {
  op: string
  pset: string
  targetNm: number
  tolNm: number
  joints: number
  total: number
  nok: number
  last: Tightening | null
  controller: DeviceHealth | null
  tool: DeviceHealth | null
}

export interface TighteningView {
  filter: TighteningFilter
  rows: Tightening[]
  /** Satır sınırına takıldı mı (dışa aktarım sunucudan tamamı alınır) */
  truncated: boolean
  total: number
  ok: number
  nok: number
  stations: TighteningStation[]
}

export const TIGHTENING_LIMIT = 3000

function tighteningQuery(f: TighteningFilter) {
  return {
    where: { ...(f.op ? { op: f.op } : {}), ...(f.result ? { result: f.result } : {}) },
    range: { field: 't' as const, gte: f.from, lt: f.to },
    ...(f.sn?.trim() ? { contains: { field: 'sn' as const, value: f.sn.trim() } } : {}),
  }
}

export function tighteningRows(store: Store, f: TighteningFilter, limit?: number): Tightening[] {
  return store.find('tightening', { ...tighteningQuery(f), orderBy: 't', desc: true, limit })
}

export function tighteningView(store: Store, ix: MasterIndex, f: TighteningFilter): TighteningView {
  const q = tighteningQuery(f)
  const total = store.count('tightening', q)
  const nok = store.count('tightening', { ...q, where: { ...q.where, result: 'NOK' } })
  const rows = tighteningRows(store, f, TIGHTENING_LIMIT)
  const stations: TighteningStation[] = ix.main
    .filter((s) => s.tightening)
    .map((s) => {
      const spec = s.tightening!
      const sq = { where: { op: s.op }, range: { field: 't' as const, gte: f.from, lt: f.to } }
      return {
        op: s.op,
        pset: spec.pset,
        targetNm: spec.targetNm,
        tolNm: spec.tolNm,
        joints: spec.joints.length,
        total: store.count('tightening', sq),
        nok: store.count('tightening', { ...sq, where: { op: s.op, result: 'NOK' } }),
        last: store.first('tightening', { where: { op: s.op }, orderBy: 't', desc: true }) ?? null,
        controller: store.get('device', spec.controllerId) ?? null,
        tool: store.get('device', spec.toolId) ?? null,
      }
    })
  return { filter: f, rows, truncated: total > rows.length, total, ok: total - nok, nok, stations }
}
