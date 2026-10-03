import { acknowledgeAlarm, assignAlarm, clearAlarm, closeAlarm, raiseAlarm } from './alarms'
import type { MasterIndex } from './lineDef'
import { addNote } from './notes'
import type { NoteInput } from './notes'
import { requirePermission } from './rbac'
import type { Actor } from './rbac'
import { advanceRework, openRework, openReworkOf, updateReworkFields } from './rework'
import type { ReworkFields } from './rework'
import type { Store } from './store/Store'
import type { Alarm, Andon, AndonType, MotorHold, Note, Rework, ReworkState } from './types'

/**
 * Kullanıcı komutları: yetki kontrolü (RBAC) + iş kuralı + audit kaydı (R-058, NFR-007).
 * Demo modu ve sunucu API'si aynı komutları kullanır; zaman damgası her zaman sunucu / uygulama saatidir.
 */

export interface CommandContext {
  store: Store
  ix: MasterIndex
  actor: Actor
  now: number
}

export class CommandError extends Error {}

const pad = (n: number, w: number) => String(n).padStart(w, '0')

export function audit(store: Store, actor: Pick<Actor, 'name' | 'id'>, t: number, action: string, entity: string, entityId: string | null, before: unknown, after: unknown): void {
  store.insert('audit_log', {
    id: `AU-${pad(store.nextSeq('audit'), 8)}`,
    t,
    user: `${actor.name} (${actor.id})`,
    action,
    entity,
    entityId,
    before: before === undefined || before === null ? null : JSON.stringify(before),
    after: after === undefined || after === null ? null : JSON.stringify(after),
  })
}

/** Teknisyen notu; yazar her zaman giriş yapan kullanıcıdır (R-025) */
export function createNote(c: CommandContext, input: Omit<NoteInput, 'author'>): Note {
  requirePermission(c.actor, 'note.create')
  return c.store.transaction(() => {
    const note = addNote(c.store, c.ix, { ...input, author: c.actor.name }, c.now)
    audit(c.store, c.actor, c.now, 'note.create', 'note', note.id, null, note)
    return note
  })
}

export function ackAlarm(c: CommandContext, id: string): Alarm {
  requirePermission(c.actor, 'alarm.ack')
  return c.store.transaction(() => {
    const before = c.store.get('alarm', id)
    const a = acknowledgeAlarm(c.store, id, c.actor.name, c.now)
    audit(c.store, c.actor, c.now, 'alarm.ack', 'alarm', id, { status: before?.status }, { status: a.status })
    return a
  })
}

export function assignAlarmTo(c: CommandContext, id: string, assignee: string): Alarm {
  requirePermission(c.actor, 'alarm.assign')
  if (!assignee.trim()) throw new CommandError('Atanacak ekip ya da kişi seçilmeli')
  return c.store.transaction(() => {
    const before = c.store.get('alarm', id)
    const a = assignAlarm(c.store, id, assignee.trim(), c.actor.name, c.now)
    audit(c.store, c.actor, c.now, 'alarm.assign', 'alarm', id, { status: before?.status, assignee: before?.assignee }, { status: a.status, assignee: a.assignee })
    return a
  })
}

export function closeAlarmBy(c: CommandContext, id: string, note: string | null): Alarm {
  requirePermission(c.actor, 'alarm.close')
  return c.store.transaction(() => {
    const before = c.store.get('alarm', id)
    const a = closeAlarm(c.store, id, c.actor.name, c.now, note?.trim() || null)
    audit(c.store, c.actor, c.now, 'alarm.close', 'alarm', id, { status: before?.status }, { status: a.status, closeNote: a.closeNote })
    return a
  })
}

const ANDON_RULE: Record<AndonType, string> = { material: 'AND-MAT', quality: 'AND-QUA', production: 'AND-PRD' }
const ANDON_TEXT: Record<AndonType, string> = { material: 'malzeme talebi', quality: 'kalite desteği', production: 'üretim desteği' }

/** Andon çağrısı (R-040); her Andon bir alarm kaydı açar ve alarm yaşam döngüsüyle yönetilir */
export function openAndon(c: CommandContext, input: { op: string; type: AndonType; message?: string; sn?: string | null }): Andon {
  requirePermission(c.actor, 'andon.create')
  if (!c.ix.station.has(input.op)) throw new CommandError(`Bilinmeyen istasyon: ${input.op}`)
  return c.store.transaction(() => {
    const msg = input.message?.trim() || ''
    const alarm = raiseAlarm(c.store, c.ix, {
      code: ANDON_RULE[input.type],
      key: null,
      op: input.op,
      sn: input.sn ?? null,
      message: `${input.op} Andon: ${ANDON_TEXT[input.type]} (${c.actor.name})${msg ? `: ${msg}` : ''}`,
      t: c.now,
    })
    if (!alarm) throw new CommandError('Andon alarm kuralı kapalı; admin ayarlarını kontrol edin')
    const andon: Andon = { id: `AN-${pad(c.store.nextSeq('andon'), 6)}`, t: c.now, op: input.op, type: input.type, message: msg, by: c.actor.name, alarmId: alarm.id }
    c.store.insert('andon', andon)
    audit(c.store, c.actor, c.now, 'andon.create', 'andon', andon.id, null, andon)
    return andon
  })
}

export function advanceReworkBy(c: CommandContext, id: string, to: ReworkState, note: string | null, fields: ReworkFields = {}): Rework {
  requirePermission(c.actor, 'rework.manage')
  return c.store.transaction(() => {
    const before = c.store.get('rework', id)
    const rw = advanceRework(c.store, id, to, c.actor.name, c.now, note, fields)
    audit(c.store, c.actor, c.now, 'rework.advance', 'rework', id, { state: before?.state }, { state: rw.state, ...fields })
    return rw
  })
}

export function updateReworkBy(c: CommandContext, id: string, fields: ReworkFields): Rework {
  requirePermission(c.actor, 'rework.manage')
  return c.store.transaction(() => {
    const before = c.store.get('rework', id)
    const rw = updateReworkFields(c.store, id, c.actor.name, c.now, fields)
    const pick = (r: Rework | undefined) => r && Object.fromEntries(Object.keys(fields).map((k) => [k, r[k as keyof Rework]]))
    audit(c.store, c.actor, c.now, 'rework.update', 'rework', id, pick(before), pick(rw))
    return rw
  })
}

/** Kullanıcının motoru HOLD'a alması (R-006). Fiziksel durdurma operatör / PLC tarafındadır. */
export function holdMotor(c: CommandContext, input: { sn: string; reason: string; op?: string | null }): MotorHold {
  requirePermission(c.actor, 'motor.hold')
  if (!c.store.get('motor', input.sn)) throw new CommandError(`Motor bulunamadı: ${input.sn}`)
  if (!input.reason.trim()) throw new CommandError('HOLD nedeni yazılmalı')
  if (c.store.find('motor_hold', { where: { sn: input.sn }, isNull: ['releasedAt'] }).length) throw new CommandError(`${input.sn} zaten HOLD'da`)
  return c.store.transaction(() => {
    const hold: MotorHold = {
      id: `HU-${pad(c.store.nextSeq('hold'), 6)}`,
      sn: input.sn,
      t: c.now,
      source: 'user',
      reason: input.reason.trim(),
      op: input.op ?? c.store.get('motor', input.sn)!.currentOp,
      by: c.actor.name,
      releasedAt: null,
      releasedBy: null,
      resolution: null,
      alarmKey: null,
    }
    c.store.insert('motor_hold', hold)
    audit(c.store, c.actor, c.now, 'motor.hold', 'motor_hold', hold.id, null, hold)
    return hold
  })
}

/** HOLD kararı: serbest bırak ya da rework'e gönder (Kalite) */
export function decideHold(c: CommandContext, holdId: string, decision: 'release' | 'rework', note: string | null): { hold: MotorHold; rework: Rework | null } {
  requirePermission(c.actor, 'quality.decide')
  const hold = c.store.get('motor_hold', holdId)
  if (!hold) throw new CommandError(`HOLD kaydı bulunamadı: ${holdId}`)
  if (hold.releasedAt !== null) throw new CommandError(`${holdId} zaten çözülmüş`)
  return c.store.transaction(() => {
    let rework: Rework | null = null
    if (decision === 'rework') {
      if (openReworkOf(c.store, hold.sn)) throw new CommandError(`${hold.sn} için açık rework zaten var`)
      const qr = c.store.first('quality_result', { where: { sn: hold.sn }, orderBy: 't', desc: true })
      rework = openRework(c.store, { sn: hold.sn, qualityResultId: qr?.id ?? '', defect: null, defectText: `HOLD: ${hold.reason}`, t: c.now, team: 'Kalite Ekibi', alarmKey: null })
      c.store.update('motor', hold.sn, { status: 'rework', currentOp: null })
    }
    const resolution = decision === 'release' ? `Serbest bırakıldı${note ? `: ${note}` : ''}` : `Rework'e gönderildi (${rework!.id})${note ? `: ${note}` : ''}`
    const updated = c.store.update('motor_hold', holdId, { releasedAt: c.now, releasedBy: c.actor.name, resolution })
    clearAlarm(c.store, hold.alarmKey, c.now)
    if (decision === 'release' && hold.source === 'vision') c.store.update('motor', hold.sn, { status: 'in_line' })
    audit(c.store, c.actor, c.now, `hold.${decision}`, 'motor_hold', holdId, { releasedAt: null }, { resolution })
    return { hold: updated, rework }
  })
}
