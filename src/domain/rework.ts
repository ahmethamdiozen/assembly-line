import type { Store } from './store/Store'
import type { DefectDef, FaultCategory, Priority, Rework, ReworkState, Team } from './types'

/**
 * Rework durum makinesi (R-035, R-036).
 *   Kullanıcı adımları: triage → diagnosis → bench → ready (sadece bir ileri)
 *   Sistem adımları (collector): motor OP100'e tekrar girince → reqc; OP100 OK → closed;
 *   OP100 tekrar NOK → yeni turda triage.
 */

export const USER_FLOW: ReworkState[] = ['triage', 'diagnosis', 'bench', 'ready']

const pad = (n: number, w: number) => String(n).padStart(w, '0')

export function nextUserState(s: ReworkState): ReworkState | null {
  const i = USER_FLOW.indexOf(s)
  return i >= 0 && i < USER_FLOW.length - 1 ? USER_FLOW[i + 1] : null
}

export class ReworkTransitionError extends Error {}

function addEvent(store: Store, reworkId: string, t: number, from: ReworkState | null, to: ReworkState, by: string | null, note: string | null): void {
  store.insert('rework_event', { id: `RE-${pad(store.nextSeq('rework_event'), 7)}`, reworkId, t, from, to, by, note })
}

export interface OpenReworkInput {
  sn: string
  qualityResultId: string
  defect: DefectDef | null
  defectText: string | null
  t: number
  team: Team
  alarmKey: string | null
}

const UNKNOWN: { sourceOp: string; category: FaultCategory; priority: Priority } = { sourceOp: 'OP100', category: 'process', priority: 'medium' }

/** OP100 NOK → yeni rework kaydı (Incoming Triage) */
export function openRework(store: Store, a: OpenReworkInput): Rework {
  const d = a.defect ?? UNKNOWN
  const rw: Rework = {
    id: `RW-${pad(store.nextSeq('rework'), 5)}`,
    sn: a.sn,
    qualityResultId: a.qualityResultId,
    sourceOp: d.sourceOp,
    category: d.category,
    defectCode: a.defect?.code ?? null,
    defect: a.defectText ?? a.defect?.text ?? 'Belirtilmemiş hata',
    rootCause: null,
    priority: d.priority,
    team: a.team,
    reworkOperator: null,
    state: 'triage',
    openedAt: a.t,
    closedAt: null,
    attempt: 1,
    alarmKey: a.alarmKey,
  }
  store.insert('rework', rw)
  addEvent(store, rw.id, a.t, null, 'triage', null, 'OP100 kalite reddi')
  return rw
}

/** Motorun açık rework kaydı */
export function openReworkOf(store: Store, sn: string): Rework | undefined {
  return store.find('rework', { where: { sn } }).find((r) => r.state !== 'closed')
}

export function startReqc(store: Store, rw: Rework, t: number): Rework {
  addEvent(store, rw.id, t, rw.state, 'reqc', null, 'Motor OP100\'e tekrar girdi')
  return store.update('rework', rw.id, { state: 'reqc' })
}

export function closeRework(store: Store, rw: Rework, t: number): Rework {
  addEvent(store, rw.id, t, rw.state, 'closed', null, 'Re-QC OK')
  return store.update('rework', rw.id, { state: 'closed', closedAt: t })
}

/** Re-QC'de tekrar NOK: aynı kayıt yeni turla triage'a döner */
export function reopenRework(store: Store, rw: Rework, t: number, qualityResultId: string, defect: DefectDef | null, defectText: string | null, alarmKey: string | null): Rework {
  addEvent(store, rw.id, t, rw.state, 'triage', null, 'Re-QC NOK, yeni rework turu')
  return store.update('rework', rw.id, {
    state: 'triage',
    attempt: rw.attempt + 1,
    qualityResultId,
    defectCode: defect?.code ?? rw.defectCode,
    defect: defectText ?? rw.defect,
    sourceOp: defect?.sourceOp ?? rw.sourceOp,
    category: defect?.category ?? rw.category,
    alarmKey,
  })
}

export interface ReworkFields {
  rootCause?: string | null
  reworkOperator?: string | null
  priority?: Priority
  team?: Team
}

/** Kullanıcının rework'ü bir sonraki adıma taşıması (ve alanları doldurması) */
export function advanceRework(store: Store, id: string, to: ReworkState, by: string, t: number, note: string | null, fields: ReworkFields = {}): Rework {
  const rw = store.get('rework', id)
  if (!rw) throw new ReworkTransitionError(`Rework bulunamadı: ${id}`)
  if (nextUserState(rw.state) !== to) throw new ReworkTransitionError(`${rw.state} → ${to} geçişi yapılamaz`)
  // Rework tezgâhına geçmeden önce kök neden ve rework operatörü belli olmalı (R-034)
  if (to === 'bench') {
    if (!(fields.rootCause ?? rw.rootCause)?.trim()) throw new ReworkTransitionError('Rework tezgâhına geçmeden önce kök neden yazılmalı')
    if (!(fields.reworkOperator ?? rw.reworkOperator)?.trim()) throw new ReworkTransitionError('Rework tezgâhına geçmeden önce rework operatörü atanmalı')
  }
  addEvent(store, id, t, rw.state, to, by, note)
  return store.update('rework', id, { ...fields, state: to })
}

/** Durum değiştirmeden alanları günceller (kök neden, operatör, öncelik, ekip) */
export function updateReworkFields(store: Store, id: string, by: string, t: number, fields: ReworkFields): Rework {
  const rw = store.get('rework', id)
  if (!rw) throw new ReworkTransitionError(`Rework bulunamadı: ${id}`)
  if (rw.state === 'closed') throw new ReworkTransitionError(`${id} kapalı`)
  addEvent(store, id, t, rw.state, rw.state, by, Object.keys(fields).join(', ') + ' güncellendi')
  return store.update('rework', id, fields)
}
