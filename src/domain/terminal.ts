import { audit, CommandError } from './commands'
import type { CommandContext } from './commands'
import { stationCycleStats } from './kpi'
import type { StationCycleStat } from './kpi'
import type { MasterIndex } from './lineDef'
import { operatorAt } from './lineDef'
import { activeAlarms, activeLogin, loginValid, stationViews } from './lineState'
import type { StationView } from './lineState'
import { missingQualifications, requiredQualifications } from './qualifications'
import { requirePermission } from './rbac'
import { shiftOf } from './shifts'
import type { Store } from './store/Store'
import type { Alarm, Andon, ComponentInstall, ComponentType, MotorHold, Note, OpConfirmation, Person, Station, StationLogin, Tightening } from './types'

/**
 * Teknisyen Terminali (R-006, R-050–R-052): istasyona giriş, yetkinlik kontrolü, aktif görev kartı
 * ve "operasyonu tamamla" onayı. Fiziksel operasyon bitişi PLC verisinden gelir; onay uygulama
 * veritabanına yazılır, fabrika sistemine geri yazılmaz (acik-konular.md).
 */

const pad = (n: number, w: number) => String(n).padStart(w, '0')

/** Terminal kullanan istasyonlar: ana hattaki insanlı istasyonlar */
export const terminalStations = (ix: MasterIndex): Station[] => ix.main.filter((s) => s.type === 'manual')

function personOf(c: CommandContext): Person {
  const p = c.ix.person.get(c.actor.id)
  if (!p) throw new CommandError('Kullanıcı personel listesinde yok')
  return p
}

function openLogins(store: Store, field: 'op' | 'personnelNo', value: string): StationLogin[] {
  return store.find('station_login', { where: { [field]: value }, isNull: ['logoutAt'] })
}

/** İstasyona giriş (R-050). Eksik yetkinlik varsa giriş yapılmaz ve deneme audit'e yazılır (R-052). */
export function stationLogin(c: CommandContext, op: string): StationLogin {
  requirePermission(c.actor, 'station.login')
  const st = c.ix.station.get(op)
  if (!st || st.line !== 'main') throw new CommandError(`Bilinmeyen istasyon: ${op}`)
  if (st.type !== 'manual') throw new CommandError(`${op} ${st.type === 'robot' ? 'robot hücresi' : 'tam otomatik'}; teknisyen girişi yapılmaz`)
  const person = personOf(c)
  const missing = missingQualifications(person, st)
  if (missing.length) {
    audit(c.store, c.actor, c.now, 'station.login.denied', 'station', op, null, { required: requiredQualifications(st), missing })
    throw new CommandError(`${op} için yetkinliğiniz eksik: ${missing.join(', ')}. Üretim liderine başvurun.`)
  }
  const shift = shiftOf(c.now, c.ix.master.config.shifts)
  return c.store.transaction(() => {
    // Kişinin başka istasyondaki ve istasyondaki başka kişinin açık girişi kapanır (istasyon başına bir teknisyen)
    const close = [...openLogins(c.store, 'personnelNo', person.personnelNo), ...openLogins(c.store, 'op', op)]
    for (const l of new Map(close.map((x) => [x.id, x])).values()) c.store.update('station_login', l.id, { logoutAt: c.now })
    const login: StationLogin = {
      id: `SL-${pad(c.store.nextSeq('station_login'), 6)}`,
      op,
      personnelNo: person.personnelNo,
      name: person.name,
      shiftId: shift.id,
      loginAt: c.now,
      logoutAt: null,
      rosterMatch: person.station === op && person.shift === shift.id,
    }
    c.store.insert('station_login', login)
    audit(c.store, c.actor, c.now, 'station.login', 'station', op, close.length ? { closed: close.map((x) => `${x.name} @ ${x.op}`) } : null, { shift: shift.id, rosterMatch: login.rosterMatch })
    return login
  })
}

/** Kullanıcının açık istasyon girişlerini kapatır */
export function stationLogout(c: CommandContext): StationLogin | null {
  const open = openLogins(c.store, 'personnelNo', c.actor.id)
  if (!open.length) return null
  return c.store.transaction(() => {
    let last: StationLogin | null = null
    for (const l of open) {
      last = c.store.update('station_login', l.id, { logoutAt: c.now })
      audit(c.store, c.actor, c.now, 'station.logout', 'station', l.op, null, null)
    }
    return last
  })
}

/**
 * "Operasyonu tamamla" (R-006): teknisyen, istasyondaki motorun operasyonunu (kontrol listesi dahil)
 * tamamladığını onaylar. İstasyona giriş yapmış olmak gerekir; aynı motor ve deneme için bir kez yapılır.
 */
export function confirmOperation(c: CommandContext, input: { op: string; sn: string; note?: string | null }): OpConfirmation {
  requirePermission(c.actor, 'op.complete')
  const login = activeLogin(c.store, c.ix, input.op, c.now)
  if (!login || login.personnelNo !== c.actor.id) throw new CommandError(`Önce ${input.op} istasyonuna giriş yapın`)
  const view = stationViews(c.store, c.ix, c.now).find((v) => v.station.op === input.op)
  if (!view || view.motorSn !== input.sn) throw new CommandError(`${input.sn} şu an ${input.op} istasyonunda görünmüyor`)
  if (confirmationOf(c.store, input.op, input.sn, view.opStart)) throw new CommandError(`${input.sn} için ${input.op} operasyonu zaten onaylandı`)
  return c.store.transaction(() => {
    const conf: OpConfirmation = {
      id: `OC-${pad(c.store.nextSeq('op_confirmation'), 6)}`,
      t: c.now,
      op: input.op,
      sn: input.sn,
      personnelNo: login.personnelNo,
      name: login.name,
      note: input.note?.trim() || null,
    }
    c.store.insert('op_confirmation', conf)
    audit(c.store, c.actor, c.now, 'op.confirm', 'motor', input.sn, null, { op: input.op, note: conf.note })
    return conf
  })
}

/** Motorun istasyondaki son denemesine ait onay (deneme başlangıcından sonra verilmiş) */
export function confirmationOf(store: Store, op: string, sn: string, since: number | null): OpConfirmation | null {
  return store.find('op_confirmation', { where: { sn, op }, orderBy: 't', desc: true }).find((x) => since === null || x.t >= since) ?? null
}

// ---------------------------------------------------------------- aktif görev kartı (R-051)

export interface TerminalMotor {
  sn: string
  workOrder: string | null
  /** Sırasıyla OK biten ana hat operasyonu */
  completed: number
  opStart: number | null
  opDone: boolean
  elapsedSec: number | null
  remainingSec: number | null
  /** Bu istasyonda takılacak komponentler ve okutulan parça */
  components: { type: ComponentType; install: ComponentInstall | null }[]
  /** Bu istasyondaki sıkmalar: joint başına son sonuç */
  tightening: { joints: { joint: string; last: Tightening | null; tries: number }[]; ok: number; total: number } | null
  confirmation: OpConfirmation | null
  hold: MotorHold | null
}

export interface TerminalView {
  station: Station
  view: StationView
  required: string[]
  /** İstasyondaki geçerli giriş */
  login: StationLogin | null
  /** Vardiya planında bu istasyonun teknisyeni */
  roster: Person | null
  motor: TerminalMotor | null
  /** Sıradaki motor: bir önceki istasyondaki */
  next: { sn: string; op: string; done: boolean } | null
  alarms: Alarm[]
  andons: Andon[]
  notes: Note[]
  cycles: StationCycleStat | null
  /** Ekrandaki kullanıcı için: giriş durumu ve yetkinlik kontrolü */
  me: { person: Person | null; missing: string[]; rosterMatch: boolean; here: boolean; elsewhere: StationLogin | null } | null
}

export function terminalView(store: Store, ix: MasterIndex, op: string, now: number, personnelNo: string | null): TerminalView | null {
  const station = ix.station.get(op)
  if (!station || station.line !== 'main') return null
  const views = stationViews(store, ix, now)
  const idx = views.findIndex((v) => v.station.op === op)
  const view = views[idx]
  const shift = shiftOf(now, ix.master.config.shifts)
  const login = activeLogin(store, ix, op, now)

  let motor: TerminalMotor | null = null
  if (view.motorSn) {
    const sn = view.motorSn
    const m = store.get('motor', sn)
    const ops = store.find('motor_op', { where: { sn } })
    const ok = new Set(ops.filter((o) => o.result === 'OK').map((o) => o.op))
    let completed = 0
    while (completed < ix.main.length && ok.has(ix.main[completed].op)) completed++
    const installs = store.find('component_install', { where: { sn, op }, isNull: ['replacedAt'] })
    const tq = station.tightening
    const rows = tq ? store.find('tightening', { where: { sn, op }, orderBy: 't' }) : []
    const joints = tq?.joints.map((j) => {
      const tries = rows.filter((r) => r.joint === j)
      return { joint: j, last: tries.at(-1) ?? null, tries: tries.length }
    })
    motor = {
      sn,
      workOrder: m?.workOrder ?? null,
      completed,
      opStart: view.opStart,
      opDone: view.opDone,
      elapsedSec: view.elapsedSec,
      remainingSec: view.remainingSec,
      components: (ix.componentsAt.get(op) ?? []).map((type) => ({ type, install: installs.find((c) => c.type === type.code) ?? null })),
      tightening: joints ? { joints, ok: joints.filter((j) => j.last?.result === 'OK').length, total: joints.length } : null,
      confirmation: confirmationOf(store, op, sn, view.opStart),
      hold: store.first('motor_hold', { where: { sn }, isNull: ['releasedAt'] }) ?? null,
    }
  }
  const prev = idx > 0 ? views[idx - 1] : null

  let me: TerminalView['me'] = null
  if (personnelNo) {
    const person = ix.person.get(personnelNo) ?? null
    const mine = store.find('station_login', { where: { personnelNo }, isNull: ['logoutAt'], orderBy: 'loginAt', desc: true }).find((l) => loginValid(l, ix, now)) ?? null
    me = {
      person,
      missing: person ? missingQualifications(person, station) : [],
      rosterMatch: !!person && person.station === op && person.shift === shift.id,
      here: mine?.op === op,
      elsewhere: mine && mine.op !== op ? mine : null,
    }
  }

  return {
    station,
    view,
    required: requiredQualifications(station),
    login,
    roster: station.type === 'manual' ? (operatorAt(ix, op, shift.id) ?? null) : null,
    motor,
    next: prev?.motorSn ? { sn: prev.motorSn, op: prev.station.op, done: prev.opDone } : null,
    alarms: activeAlarms(store, op).sort((a, b) => b.t - a.t),
    andons: store.find('andon', { where: { op }, orderBy: 't', desc: true, limit: 10 }).filter((a) => store.get('alarm', a.alarmId)?.status !== 'closed'),
    notes: store.find('note', { where: { op }, orderBy: 't', desc: true, limit: 6 }),
    cycles: stationCycleStats(store, ix, 8).find((c) => c.op === op) ?? null,
    me,
  }
}
