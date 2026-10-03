import { beforeAll, describe, expect, it } from 'vitest'
import type { CommandContext } from './commands'
import { defaultMaster, indexMaster } from './lineDef'
import { stationViews } from './lineState'
import { hasQualification, missingQualifications } from './qualifications'
import { DEFAULT_ROLE_PERMISSIONS, ForbiddenError } from './rbac'
import { MemoryStore } from './store/MemoryStore'
import { confirmOperation, stationLogin, stationLogout, terminalView } from './terminal'
import { motorDetail } from './views'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'

const ix = indexMaster(defaultMaster())
// A vardiyası (08–16)
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
let store: MemoryStore

const as = (no: string, now = t0): CommandContext => {
  const p = ix.person.get(no)!
  return { store, ix, actor: { id: p.personnelNo, name: p.name, role: p.role, permissions: DEFAULT_ROLE_PERMISSIONS[p.role] }, now }
}

beforeAll(() => {
  const raw = new RawDb()
  new LineSim({ t0, startT: t0 - 3 * 3600_000 }).advance(t0, raw)
  store = new MemoryStore()
  applyCollected(store, ix, raw.since({}), t0)
})

describe('yetkinlik kuralı (R-052)', () => {
  it('insanlı istasyon Montaj L2, sıkmalı istasyon ayrıca Torque Qualified ister; üst seviye alt seviyeyi karşılar', () => {
    const ece = ix.person.get('T-1044')! // Montaj L2 + L3
    expect(hasQualification({ ...ece, qualifications: ['Montaj L3'] }, 'Montaj L2')).toBe(true)
    expect(hasQualification({ ...ece, qualifications: ['Montaj L1'] }, 'Montaj L2')).toBe(false)
    expect(missingQualifications(ece, ix.station.get('OP070')!)).toEqual([])
    expect(missingQualifications(ece, ix.station.get('OP080')!)).toEqual(['Torque Qualified'])
    expect(missingQualifications(ix.person.get('RW-021')!, ix.station.get('OP070')!)).toEqual(['Montaj L2'])
    expect(missingQualifications(ece, ix.station.get('OP020')!)).toEqual([])
  })

  it('eksik yetkinlikle giriş yapılamaz; deneme audit\'e yazılır', () => {
    expect(() => stationLogin(as('T-1044'), 'OP080')).toThrow(/Torque Qualified/)
    expect(store.count('station_login')).toBe(0)
    const denied = store.find('audit_log', { where: { action: 'station.login.denied' } })
    expect(denied.map((a) => [a.entityId, JSON.parse(a.after!).missing])).toEqual([['OP080', ['Torque Qualified']]])
  })
})

describe('istasyona giriş (R-050)', () => {
  it('teknisyen istasyona girer; Kontrol Merkezi\'nde teknisyen olarak görünür', () => {
    const l = stationLogin(as('T-1044'), 'OP070')
    expect([l.op, l.name, l.shiftId, l.rosterMatch]).toEqual(['OP070', 'Ece Kara', 'A', true])
    const v = stationViews(store, ix, t0).find((x) => x.station.op === 'OP070')!
    expect([v.operator?.name, v.operatorSource]).toEqual(['Ece Kara', 'login'])
  })

  it('otomatik istasyona giriş yapılmaz; başka istasyona geçince önceki giriş kapanır; istasyonda tek teknisyen', () => {
    expect(() => stationLogin(as('T-1044'), 'OP020')).toThrow(/tam otomatik/)
    stationLogin(as('T-1044', t0 + 1000), 'OP060')
    expect(store.find('station_login', { isNull: ['logoutAt'] }).map((l) => l.op)).toEqual(['OP060'])
    const mert = stationLogin(as('T-1061', t0 + 2000), 'OP060')
    expect(mert.rosterMatch).toBe(true)
    expect(store.find('station_login', { isNull: ['logoutAt'] }).map((l) => l.name)).toEqual(['Mert Demir'])
    expect(stationLogout(as('T-1061', t0 + 3000))?.logoutAt).toBe(t0 + 3000)
    expect(store.find('station_login', { isNull: ['logoutAt'] })).toEqual([])
  })

  it('giriş vardiya sonunda geçersiz olur', () => {
    stationLogin(as('T-1044', t0 + 4000), 'OP070')
    expect(terminalView(store, ix, 'OP070', t0 + 5000, 'T-1044')!.login?.name).toBe('Ece Kara')
    const next = new Date(2026, 9, 3, 16, 5).getTime()
    expect(terminalView(store, ix, 'OP070', next, 'T-1044')!.login).toBeNull()
  })
})

describe('aktif görev kartı ve "operasyonu tamamla" (R-051, R-006)', () => {
  it('kart istasyon, motor, takılacak parçalar, sıradaki motor ve kullanıcının durumunu verir', () => {
    const v = terminalView(store, ix, 'OP070', t0 + 5000, 'T-1044')!
    expect(v.required).toEqual(['Montaj L2'])
    expect(v.me).toMatchObject({ here: true, missing: [], rosterMatch: true })
    expect(v.roster?.name).toBe('Ece Kara')
    if (v.motor) {
      expect(v.motor.components.map((c) => c.type.code)).toEqual(['KBL', 'ALT'])
      expect(v.motor.tightening).toBeNull()
    }
    const tq = terminalView(store, ix, 'OP050', t0, null)!
    if (tq.motor) expect(tq.motor.tightening?.total).toBe(8)
    expect(tq.me).toBeNull()
  })

  it('giriş yapan teknisyen istasyondaki motoru bir kez onaylar; onay motor geçmişinde görünür', () => {
    const now = t0 + 6000
    const v = stationViews(store, ix, now).find((x) => x.station.op === 'OP070')!
    expect(v.motorSn).not.toBeNull()
    const sn = v.motorSn!
    expect(() => confirmOperation(as('T-1061', now), { op: 'OP070', sn })).toThrow(/Önce OP070/)
    expect(() => confirmOperation(as('T-1044', now), { op: 'OP070', sn: 'TM50-000000-0000' })).toThrow(/görünmüyor/)
    expect(() => confirmOperation(as('S-0101', now), { op: 'OP070', sn })).toThrow(ForbiddenError)
    const c = confirmOperation(as('T-1044', now), { op: 'OP070', sn, note: '  Konnektörler sayıldı ' })
    expect([c.name, c.note]).toEqual(['Ece Kara', 'Konnektörler sayıldı'])
    expect(() => confirmOperation(as('T-1044', now + 1000), { op: 'OP070', sn })).toThrow(/zaten onaylandı/)
    expect(terminalView(store, ix, 'OP070', now, 'T-1044')!.motor?.confirmation?.id).toBe(c.id)
    expect(motorDetail(store, ix, sn)!.confirmations.map((x) => x.op)).toEqual(['OP070'])
    expect(store.find('audit_log', { where: { action: 'op.confirm' } }).map((a) => a.entityId)).toEqual([sn])
  })
})
