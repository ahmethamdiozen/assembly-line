import type { MasterIndex } from './lineDef'
import type { Store } from './store/Store'
import type { Alarm, AlarmAction, Severity } from './types'

/**
 * Alarm motoru. Sistem alarmları anahtarla (`key`) açılır: aynı koşul sürdükçe (clearedAt null)
 * ikinci alarm açılmaz. Koşulun bitmesi (cleared) yaşam döngüsünden bağımsızdır; alarmı insanlar
 * Detected → Acknowledged → Assigned → Closed adımlarıyla yönetir (R-038) ve her adım olay olarak kaydedilir.
 */

const MIN = 60 * 1000
const pad = (n: number, w: number) => String(n).padStart(w, '0')

export interface RaiseInput {
  code: string
  key: string | null
  op: string | null
  sn: string | null
  message: string
  t: number
  /** Kuraldaki önem derecesini ezmek için */
  severity?: Severity
}

function addEvent(store: Store, alarmId: string, t: number, action: AlarmAction, by: string | null, detail: string | null): void {
  store.insert('alarm_event', { id: `AE-${pad(store.nextSeq('alarm_event'), 7)}`, alarmId, t, action, by, detail })
}

/** Kural kapalıysa null; aynı anahtarla süren alarm varsa onu döndürür */
export function raiseAlarm(store: Store, ix: MasterIndex, a: RaiseInput): Alarm | null {
  const rule = ix.rule.get(a.code)
  if (!rule || !rule.enabled) return null
  if (a.key) {
    const open = store.first('alarm', { where: { key: a.key }, isNull: ['clearedAt'] })
    if (open) return open
  }
  const alarm: Alarm = {
    id: `ALM-${pad(store.nextSeq('alarm'), 6)}`,
    key: a.key,
    code: a.code,
    source: rule.source,
    severity: a.severity ?? rule.severity,
    op: a.op,
    sn: a.sn,
    message: a.message,
    t: a.t,
    clearedAt: null,
    status: 'detected',
    team: rule.team,
    assignee: null,
    ackBy: null,
    ackAt: null,
    assignedAt: null,
    closedBy: null,
    closedAt: null,
    closeNote: null,
    escalatedAt: null,
  }
  store.insert('alarm', alarm)
  addEvent(store, alarm.id, a.t, 'detected', null, a.message)
  return alarm
}

/** Alarmı doğuran koşul bitti */
export function clearAlarm(store: Store, key: string | null, t: number): Alarm | null {
  if (!key) return null
  const open = store.first('alarm', { where: { key }, isNull: ['clearedAt'] })
  if (!open) return null
  addEvent(store, open.id, t, 'cleared', null, null)
  return store.update('alarm', open.id, { clearedAt: t })
}

/** Eskalasyon süresi içinde onaylanmayan alarmlar eskale olur. Zaman damgası eskalasyonun gerçek anıdır. */
export function escalateAlarms(store: Store, ix: MasterIndex, now: number): number {
  let n = 0
  for (const a of store.find('alarm', { where: { status: 'detected' }, isNull: ['escalatedAt'] })) {
    const rule = ix.rule.get(a.code)
    if (!rule) continue
    const at = a.t + rule.escalationMin * MIN
    if (now < at) continue
    store.update('alarm', a.id, { escalatedAt: at })
    addEvent(store, a.id, at, 'escalated', null, `${rule.escalationMin} dk içinde onaylanmadı`)
    n++
  }
  return n
}

export class AlarmTransitionError extends Error {}

function load(store: Store, id: string): Alarm {
  const a = store.get('alarm', id)
  if (!a) throw new AlarmTransitionError(`Alarm bulunamadı: ${id}`)
  return a
}

export function acknowledgeAlarm(store: Store, id: string, by: string, t: number): Alarm {
  const a = load(store, id)
  if (a.status !== 'detected') throw new AlarmTransitionError(`${id} zaten onaylanmış (${a.status})`)
  addEvent(store, id, t, 'acknowledged', by, null)
  return store.update('alarm', id, { status: 'acknowledged', ackBy: by, ackAt: t })
}

/** Ekip ya da kişiye atama; atanmış alarm yeniden atanabilir */
export function assignAlarm(store: Store, id: string, assignee: string, by: string, t: number): Alarm {
  const a = load(store, id)
  if (a.status !== 'acknowledged' && a.status !== 'assigned') throw new AlarmTransitionError(`${id} atanmadan önce onaylanmalı (${a.status})`)
  addEvent(store, id, t, 'assigned', by, assignee)
  return store.update('alarm', id, { status: 'assigned', assignee, assignedAt: t })
}

export function closeAlarm(store: Store, id: string, by: string, t: number, note: string | null): Alarm {
  const a = load(store, id)
  if (a.status !== 'acknowledged' && a.status !== 'assigned') throw new AlarmTransitionError(`${id} kapatılmadan önce onaylanmalı (${a.status})`)
  addEvent(store, id, t, 'closed', by, note)
  return store.update('alarm', id, { status: 'closed', closedBy: by, closedAt: t, closeNote: note })
}
