import { describe, expect, it } from 'vitest'
import { raiseAlarm } from './alarms'
import { ackAlarm, assignAlarmTo, closeAlarmBy, createNote, decideHold, holdMotor, openAndon } from './commands'
import type { CommandContext } from './commands'
import { defaultMaster, indexMaster } from './lineDef'
import { DEFAULT_ROLE_PERMISSIONS, ForbiddenError } from './rbac'
import type { Actor } from './rbac'
import { MemoryStore } from './store/MemoryStore'
import type { RoleId } from './types'

const ix = indexMaster(defaultMaster())
const T = new Date(2026, 9, 3, 10).getTime()
const actor = (role: RoleId, name = 'Test Kullanıcı'): Actor => ({ id: `${role}-1`, name, role, permissions: DEFAULT_ROLE_PERMISSIONS[role] })

function ctx(role: RoleId, store = new MemoryStore(), name?: string): CommandContext {
  return { store, ix, actor: actor(role, name), now: T }
}

describe('komutlar: yetki ve audit (R-005, R-039, R-058)', () => {
  it('teknisyen not ve Andon açabilir; yazar giriş yapan kullanıcıdır; her komut audit\'e yazılır', () => {
    const c = ctx('technician', new MemoryStore(), 'Ece Kara')
    const n = createNote(c, { op: 'OP070', type: 'info', text: 'Konnektör kontrol edildi' })
    expect(n.author).toBe('Ece Kara')
    const a = openAndon(c, { op: 'OP070', type: 'material', message: 'Kablo demeti bitti' })
    const alarm = c.store.get('alarm', a.alarmId)!
    expect([alarm.code, alarm.team, alarm.source]).toEqual(['AND-MAT', 'Lojistik', 'Operator'])
    expect(alarm.message).toContain('Kablo demeti bitti')
    expect(c.store.find('audit_log').map((x) => [x.action, x.user])).toEqual([
      ['note.create', 'Ece Kara (technician-1)'],
      ['andon.create', 'Ece Kara (technician-1)'],
    ])
  })

  it('teknisyen alarm kapatamaz; supervisor onaylar, atar, kapatır (AC-07)', () => {
    const store = new MemoryStore()
    const al = raiseAlarm(store, ix, { code: 'PLC-FLT', key: 'k', op: 'OP010', sn: null, message: 'arıza', t: T })!
    expect(() => ackAlarm(ctx('technician', store), al.id)).toThrow(ForbiddenError)
    const sup = ctx('supervisor', store, 'Levent Acar')
    ackAlarm(sup, al.id)
    assignAlarmTo(sup, al.id, 'Bakım Ekibi')
    const closed = closeAlarmBy(sup, al.id, 'Sensör değişti')
    expect([closed.status, closed.ackBy, closed.assignee]).toEqual(['closed', 'Levent Acar', 'Bakım Ekibi'])
    const log = store.find('audit_log')
    expect(log.map((x) => x.action)).toEqual(['alarm.ack', 'alarm.assign', 'alarm.close'])
    expect(JSON.parse(log[1].after!)).toEqual({ status: 'assigned', assignee: 'Bakım Ekibi' })
  })

  it('HOLD: teknisyen koyar, kalite rework\'e gönderir; teknisyen karar veremez', () => {
    const store = new MemoryStore()
    store.insert('motor', { id: 'M1', workOrder: 'W', variant: 'V', createdAt: T, status: 'in_line', currentOp: 'OP070', firstPassOk: null, completedAt: null })
    const h = holdMotor(ctx('technician', store), { sn: 'M1', reason: 'Kablo hasarlı' })
    expect([h.source, h.op, h.by]).toEqual(['user', 'OP070', 'Test Kullanıcı'])
    expect(() => holdMotor(ctx('technician', store), { sn: 'M1', reason: 'tekrar' })).toThrow('zaten HOLD')
    expect(() => decideHold(ctx('technician', store), h.id, 'rework', null)).toThrow(ForbiddenError)
    const r = decideHold(ctx('quality', store), h.id, 'rework', 'Kablo değişecek')
    expect(r.rework?.state).toBe('triage')
    expect(r.hold.resolution).toContain(r.rework!.id)
    expect(store.get('motor', 'M1')!.status).toBe('rework')
    expect(() => decideHold(ctx('quality', store), h.id, 'release', null)).toThrow('zaten çözülmüş')
  })

  it('admin tüm izinlere sahip; bakım ekibi not ekleyebilir ama Andon açamaz', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin.length).toBeGreaterThan(10)
    const m = ctx('maintenance')
    expect(() => createNote(m, { op: 'OP010', type: 'info', text: 'x' })).not.toThrow()
    expect(() => openAndon(m, { op: 'OP010', type: 'quality' })).toThrow(ForbiddenError)
  })
})
