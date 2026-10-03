import { minutes } from '@/lib/format'
import type { MasterIndex } from './lineDef'
import { operatorAt } from './lineDef'
import { shiftOf, shiftWindow } from './shifts'
import type { Store } from './store/Store'
import type {
  Alarm,
  ComponentInstall,
  ComponentType,
  Motor,
  MotorHold,
  MotorOp,
  Person,
  QualityImage,
  QualityResult,
  Rework,
  Station,
  StationLogin,
  StationSpan,
  SubFeed,
  Tightening,
} from './types'

/**
 * Uygulama veritabanından türetilen görünümler (saf). Ekranlar ve API bunları kullanır.
 */

const SEC = 1000
const HOUR = 3600 * SEC

/** URS'deki 4 görsel durum (R-015) */
export type DisplayState = 'running' | 'warning' | 'fault' | 'offline'

export const DISPLAY_STATE_LABEL: Record<DisplayState, string> = {
  running: 'Running / Normal',
  warning: 'Warning / Takt riski',
  fault: 'Fault / NOK',
  offline: 'Offline',
}

/** Akış alt durumu (PLC'den) */
export type FlowState = 'working' | 'arriving' | 'starved' | 'material' | 'blocked' | 'stopped' | 'fault' | 'unknown'

export const FLOW_LABEL: Record<FlowState, string> = {
  working: 'Çalışıyor',
  arriving: 'Motor istasyona geliyor',
  starved: 'Boş, motor bekliyor',
  material: 'Ön montaj kiti bekliyor',
  blocked: 'Bloke, sonraki istasyon dolu',
  stopped: 'Durdu',
  fault: 'Arıza',
  unknown: 'Veri yok',
}

/** Dar alanlar (hat bölmeleri) için kısa metinler */
export const FLOW_SHORT: Record<FlowState, string> = {
  working: 'Çalışıyor',
  arriving: 'Motor geliyor',
  starved: 'Boş, motor bekliyor',
  material: 'Kit bekliyor',
  blocked: 'Bloke, çıkış dolu',
  stopped: 'Durdu',
  fault: 'Arıza',
  unknown: 'Veri yok',
}

export function flowOf(span: StationSpan | undefined): FlowState {
  if (!span) return 'unknown'
  switch (span.state) {
    case 'running':
      return 'working'
    case 'starved':
      return span.code === 'MAT-WAIT' ? 'material' : 'starved'
    case 'blocked':
      return 'blocked'
    case 'fault':
      return 'fault'
    case 'stopped':
      return 'stopped'
  }
}

/**
 * İstasyondaki geçerli terminal girişi. Giriş, yapıldığı vardiyanın sonuna kadar geçerlidir
 * (vardiya bitince çıkış yapılmamış olsa da sayılmaz).
 */
export function activeLogin(store: Store, ix: MasterIndex, op: string, now: number): StationLogin | null {
  const l = store.first('station_login', { where: { op }, isNull: ['logoutAt'], orderBy: 'loginAt', desc: true })
  return l && loginValid(l, ix, now) ? l : null
}

export function loginValid(l: StationLogin, ix: MasterIndex, now: number): boolean {
  return l.logoutAt === null && now < shiftWindow(l.loginAt, ix.master.config.shifts).end
}

/** Koşulu süren ve kapatılmamış alarmlar */
export function activeAlarms(store: Store, op?: string): Alarm[] {
  const q = op ? { where: { op } } : {}
  return store.find('alarm', { ...q, isNull: ['clearedAt'] }).filter((a) => a.status !== 'closed')
}

export interface StationView {
  station: Station
  state: DisplayState
  flow: FlowState
  /** Durumun metin açıklaması (renk tek başına durum anlatmaz, R-070) */
  reason: string
  motorSn: string | null
  opStart: number | null
  /** İş bitti, motor sıradaki istasyonu bekliyor */
  opDone: boolean
  elapsedSec: number | null
  /** Hedefe göre kalan süre (tahmin) */
  remainingSec: number | null
  operator: Person | null
  /** login: terminalden istasyona giriş · plc: operasyon kaydındaki operatör no · roster: vardiya planı */
  operatorSource: 'login' | 'plc' | 'roster' | null
  alarms: Alarm[]
  /** İstasyon bu durumda ne zamandan beri */
  since: number | null
}

/** 13 ana hat istasyonunun anlık görünümü. `now`: hesap anı (veri tazeliği ayrıca gösterilir). */
export function stationViews(store: Store, ix: MasterIndex, now: number): StationView[] {
  const cfg = ix.master.config
  const shift = shiftOf(now, cfg.shifts)
  return ix.main.map((st) => {
    const span = store.first('station_span', { where: { op: st.op }, isNull: ['end'] })
    const last = store.first('motor_op', { where: { op: st.op }, orderBy: 'start', desc: true })
    let current: MotorOp | null = null
    let opDone = false
    if (last) {
      if (last.end === null) current = last
      else {
        const m = store.get('motor', last.sn)
        if (m && m.status === 'in_line' && m.currentOp === st.op) {
          current = last
          opDone = true
        }
      }
    }
    const alarms = activeAlarms(store, st.op)
    const device = store.get('device', st.plcId)
    // Palet transferi sırasında PLC "çalışıyor" der ama operasyon henüz başlamamıştır
    const flow = flowOf(span) === 'working' && !current ? 'arriving' : flowOf(span)
    const elapsedSec = current && !opDone ? Math.max(0, (now - current.start) / SEC) : null
    const nok = current ? alarms.find((a) => a.sn === current.sn && (a.code === 'TQ-NOK' || a.code === 'OP-NOK')) : undefined

    let state: DisplayState = 'running'
    let reason = FLOW_LABEL[flow]
    if (device && !device.online) {
      state = 'offline'
      reason = 'PLC bağlantısı yok'
    } else if (span?.state === 'fault') {
      state = 'fault'
      reason = `Arıza: ${span.text ?? span.code ?? 'bilinmiyor'}`
    } else if (nok) {
      state = 'fault'
      reason = nok.message
    } else if (elapsedSec !== null && elapsedSec > cfg.warnRatio * cfg.taktSec) {
      state = 'warning'
      reason = `Çevrim ${minutes(elapsedSec / 60)}, takt ${minutes(cfg.taktSec / 60)}`
    }

    const login = st.type === 'manual' ? activeLogin(store, ix, st.op, now) : null
    const roster = st.type === 'manual' ? (operatorAt(ix, st.op, shift.id)?.personnelNo ?? null) : null
    const opNo = login?.personnelNo ?? current?.operatorNo ?? roster
    const operatorSource = login ? 'login' : current?.operatorNo ? 'plc' : roster ? 'roster' : null
    return {
      station: st,
      state,
      flow,
      reason,
      motorSn: current?.sn ?? null,
      opStart: current?.start ?? null,
      opDone,
      elapsedSec,
      remainingSec: elapsedSec === null ? null : Math.max(0, st.targetCycleSec - elapsedSec),
      operator: opNo ? (ix.person.get(opNo) ?? null) : null,
      operatorSource,
      alarms,
      since: span?.start ?? null,
    }
  })
}

export interface SubView {
  station: Station
  feed: SubFeed
  state: DisplayState
  flow: FlowState
  reason: string
  producedToday: number
  nokToday: number
  /** Son 60 dk'da üretilen kit */
  hourlyRate: number
  bufferQty: number
  lastT: number | null
}

export function subViews(store: Store, ix: MasterIndex): SubView[] {
  const out: SubView[] = []
  for (const st of ix.subs) {
    const feed = ix.feedBySub.get(st.op)
    if (!feed) continue
    const lastS = store.first('sub_sample', { where: { op: st.op }, orderBy: 't', desc: true })
    let hourlyRate = 0
    if (lastS) {
      const back = store.first('sub_sample', { where: { op: st.op }, range: { field: 't', lt: lastS.t - HOUR + 1 }, orderBy: 't', desc: true })
      if (back) hourlyRate = lastS.producedTotal >= back.producedTotal ? lastS.producedTotal - back.producedTotal : lastS.producedTotal
    }
    const span = store.first('station_span', { where: { op: st.op }, isNull: ['end'] })
    const device = store.get('device', st.plcId)
    const flow = flowOf(span)
    const buffer = lastS?.bufferQty ?? 0
    let state: DisplayState = 'running'
    let reason = flow === 'blocked' ? 'Buffer dolu, bekliyor' : FLOW_LABEL[flow]
    if (device && !device.online) {
      state = 'offline'
      reason = 'PLC bağlantısı yok'
    } else if (span?.state === 'fault') {
      state = 'fault'
      reason = `Arıza: ${span.text ?? span.code ?? 'bilinmiyor'}`
    } else if (lastS && buffer < feed.bufferMin) {
      state = 'warning'
      reason = `Düşük buffer: ${buffer} < min ${feed.bufferMin}`
    } else if (span?.state === 'stopped') {
      state = 'warning'
      reason = `Durdu: ${span.text ?? span.code ?? ''}`.trim()
    }
    out.push({ station: st, feed, state, flow, reason, producedToday: lastS?.producedTotal ?? 0, nokToday: lastS?.nokTotal ?? 0, hourlyRate, bufferQty: buffer, lastT: lastS?.t ?? null })
  }
  return out
}

/** Hattaki motorlar ve konumları (hat görseli için) */
export function motorsOnLine(store: Store, ix: MasterIndex): { sn: string; op: string; seq: number }[] {
  return store
    .find('motor', { where: { status: 'in_line' } })
    .filter((m) => m.currentOp !== null && ix.mainIndex.has(m.currentOp))
    .map((m) => ({ sn: m.id, op: m.currentOp!, seq: ix.mainIndex.get(m.currentOp!)! }))
    .sort((a, b) => a.seq - b.seq)
}

export type StepStatus = 'done' | 'active' | 'nok' | 'pending'

export interface MotorStep {
  station: Station
  status: StepStatus
  /** Son deneme */
  op: MotorOp | null
  attempts: MotorOp[]
}

export interface ComponentSlot {
  type: ComponentType
  /** Takıldığı operasyon OK bitmeden "Installed" sayılmaz (R-029) */
  status: 'installed' | 'pending'
  /** Okutulan parça; operasyon sürerken de dolu olabilir (status yine 'pending') */
  install: ComponentInstall | null
  /** Rework'te sökülenler */
  replaced: ComponentInstall[]
}

export interface MotorTrace {
  motor: Motor
  /** OK biten ana hat operasyonu sayısı */
  completedOps: number
  totalOps: number
  /** Tamamlanma oranı 0–1 (R-030) */
  completion: number
  steps: MotorStep[]
  components: ComponentSlot[]
  tightening: Tightening[]
  quality: QualityResult[]
  images: QualityImage[]
  reworks: Rework[]
  holds: MotorHold[]
  alarms: Alarm[]
}

/** Motorun as-built geçmişi (R-027–R-032) */
export function motorTrace(store: Store, ix: MasterIndex, sn: string): MotorTrace | null {
  const motor = store.get('motor', sn)
  if (!motor) return null
  const ops = store.find('motor_op', { where: { sn }, orderBy: 'start' })
  const steps: MotorStep[] = ix.main.map((station) => {
    const attempts = ops.filter((o) => o.op === station.op)
    const op = attempts.at(-1) ?? null
    let status: StepStatus = 'pending'
    if (op) status = op.end === null ? 'active' : op.result === 'NOK' ? 'nok' : 'done'
    return { station, status, op, attempts }
  })
  const installs = store.find('component_install', { where: { sn }, orderBy: 't' })
  const opDone = new Set(steps.filter((s) => s.attempts.some((o) => o.result === 'OK')).map((s) => s.station.op))
  const components: ComponentSlot[] = ix.master.components.map((type) => {
    const all = installs.filter((c) => c.type === type.code)
    const install = all.find((c) => c.replacedAt === null) ?? null
    return { type, status: install && opDone.has(type.installOp) ? 'installed' : 'pending', install, replaced: all.filter((c) => c.replacedAt !== null) }
  })
  return {
    motor,
    completedOps: opDone.size,
    totalOps: ix.main.length,
    completion: opDone.size / ix.main.length,
    steps,
    components,
    tightening: store.find('tightening', { where: { sn }, orderBy: 't' }),
    quality: store.find('quality_result', { where: { sn }, orderBy: 't' }),
    images: store.find('quality_image', { where: { sn }, orderBy: 't' }),
    reworks: store.find('rework', { where: { sn }, orderBy: 'openedAt' }),
    holds: store.find('motor_hold', { where: { sn }, orderBy: 't' }),
    alarms: store.find('alarm', { where: { sn }, orderBy: 't' }),
  }
}
