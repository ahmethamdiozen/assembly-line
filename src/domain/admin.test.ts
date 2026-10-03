import { describe, expect, it } from 'vitest'
import {
  applyRetention,
  auditQuery,
  createPerson,
  loadMaster,
  loadRbac,
  masterRev,
  purgeExpired,
  setPersonActive,
  setRolePermissions,
  updateAlarmRule,
  updateIntegration,
  updateLineConfig,
  updateRetention,
  updateStation,
  updateSubFeed,
} from './admin'
import type { CommandContext } from './commands'
import { defaultMaster, indexMaster, normalizeMaster } from './lineDef'
import { DEFAULT_ROLE_PERMISSIONS, ForbiddenError } from './rbac'
import { MemoryStore } from './store/MemoryStore'
import type { MasterData, RoleId } from './types'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'

const T = new Date(2026, 9, 3, 14, 30).getTime()
const DAY = 24 * 3600_000

function ctx(store: MemoryStore, role: RoleId = 'admin', id = 'A-0001', now = T): CommandContext {
  return { store, ix: indexMaster(loadMaster(store)), actor: { id, name: 'Sistem Yöneticisi', role, permissions: loadRbac(store)[role] }, now }
}
const lastAudit = (s: MemoryStore) => s.find('audit_log', { orderBy: 't', desc: true })[0]

describe('admin: hat ve istasyon ana verisi (R-053)', () => {
  it('takt değişir, sürüm artar; audit sadece değişen alanı önce / sonra yazar', () => {
    const s = new MemoryStore()
    const m = updateLineConfig(ctx(s), { taktSec: 480 })
    expect(m.config.taktSec).toBe(480)
    expect(loadMaster(s).config.taktSec).toBe(480)
    expect(masterRev(s)).toBe(1)
    const a = lastAudit(s)
    expect([a.action, JSON.parse(a.before!), JSON.parse(a.after!)]).toEqual(['config.line', { taktSec: 450 }, { taktSec: 480 }])
    expect(() => updateLineConfig(ctx(s), { taktSec: 480 })).toThrow(/Değişiklik yok/)
  })

  it('geçersiz eşik ve vardiya planı reddedilir; admin olmayan değiştiremez', () => {
    const s = new MemoryStore()
    expect(() => updateLineConfig(ctx(s), { taktSec: 20 })).toThrow(/Takt/)
    expect(() => updateLineConfig(ctx(s), { warnRatio: 1.2 })).toThrow(/Uyarı/)
    const shifts = defaultMaster().config.shifts
    expect(() => updateLineConfig(ctx(s), { shifts: shifts.map((x) => (x.id === 'B' ? { ...x, lengthH: 7 } : x)) })).toThrow(/boşluksuz|24 saat/)
    expect(() => updateLineConfig(ctx(s), { dayStartHour: 6 })).toThrow(/boşluksuz/)
    // Üretim günü ve vardiyalar birlikte kayınca geçerli
    const moved = updateLineConfig(ctx(s), { dayStartHour: 6, shifts: shifts.map((x) => ({ ...x, startHour: (x.startHour + 22) % 24 })) })
    expect(moved.config.shifts.map((x) => x.startHour)).toEqual([6, 14, 22])
    expect(() => updateLineConfig(ctx(s, 'supervisor', 'S-0101'), { taktSec: 500 })).toThrow(ForbiddenError)
  })

  it('istasyon adı, tipi, hedef çevrimi, PLC / Cell ID ve tool değişir; aynı PLC ID iki istasyonda olamaz', () => {
    const s = new MemoryStore()
    const m = updateStation(ctx(s), 'OP070', { name: 'Kablo ve Alternatör Montajı (2)', targetCycleSec: 420, plcId: 'PLC-TM50-OP070B', tool: 'Yeni tezgâh' })
    const st = m.stations.find((x) => x.op === 'OP070')!
    expect([st.name, st.targetCycleSec, st.plcId, st.tool]).toEqual(['Kablo ve Alternatör Montajı (2)', 420, 'PLC-TM50-OP070B', 'Yeni tezgâh'])
    expect(Object.keys(JSON.parse(lastAudit(s).after!)).sort()).toEqual(['name', 'plcId', 'targetCycleSec', 'tool'])
    expect(() => updateStation(ctx(s), 'OP060', { plcId: 'PLC-TM50-OP070B' })).toThrow(/başka bir istasyonda/)
    expect(() => updateStation(ctx(s), 'OP999', { name: 'x' })).toThrow(/bulunamadı/)
    expect(() => updateStation(ctx(s), 'OP070', { targetCycleSec: 5 })).toThrow(/Hedef çevrim/)
  })
})

describe('admin: kullanıcılar ve roller (R-054)', () => {
  const person = { personnelNo: 'T-1099', name: 'Yeni Teknisyen', role: 'technician' as RoleId, shift: 'A', station: 'OP070', qualifications: ['Montaj L2'] }

  it('kullanıcı eklenir; biçim, tekrar, istasyon ataması ve yetkinlik doğrulanır', () => {
    const s = new MemoryStore()
    const m = createPerson(ctx(s), person)
    expect(m.people.find((p) => p.personnelNo === 'T-1099')).toMatchObject({ name: 'Yeni Teknisyen', active: true, station: 'OP070' })
    expect(lastAudit(s).action).toBe('user.create')
    expect(() => createPerson(ctx(s), person)).toThrow(/zaten kayıtlı/)
    expect(() => createPerson(ctx(s), { ...person, personnelNo: '1099' })).toThrow(/biçimi/)
    expect(() => createPerson(ctx(s), { ...person, personnelNo: 'Q-0299', role: 'quality' })).toThrow(/sadece teknisyenlere/)
    expect(() => createPerson(ctx(s), { ...person, personnelNo: 'T-1098', station: 'OP020' })).toThrow(/insanlı/)
    expect(() => createPerson(ctx(s), { ...person, personnelNo: 'T-1098', qualifications: ['Kaynak L9'] })).toThrow(/Bilinmeyen yetkinlik/)
  })

  it('pasifleştirme: kendini ve son admini pasifleştiremez', () => {
    const s = new MemoryStore()
    expect(() => setPersonActive(ctx(s), 'A-0001', false)).toThrow(/Kendinizi/)
    const m = setPersonActive(ctx(s), 'T-1044', false)
    expect(m.people.find((p) => p.personnelNo === 'T-1044')!.active).toBe(false)
    expect(lastAudit(s).action).toBe('user.deactivate')
    createPerson(ctx(s), { ...person, personnelNo: 'A-0002', role: 'admin', station: null, qualifications: [] })
    setPersonActive(ctx(s, 'admin', 'A-0002'), 'A-0001', false)
    expect(() => setPersonActive(ctx(s, 'admin', 'A-0001'), 'A-0002', false)).toThrow(/aktif admin/)
  })

  it('rol izinleri değişir; admin rolünden kullanıcı yönetimi kaldırılamaz; eklenen / kaldırılan izin audit\'te', () => {
    const s = new MemoryStore()
    const r = setRolePermissions(ctx(s), 'supervisor', [...DEFAULT_ROLE_PERMISSIONS.supervisor.filter((p) => p !== 'note.create'), 'audit.view'])
    expect(r.supervisor).toContain('audit.view')
    expect(loadRbac(s).supervisor).not.toContain('note.create')
    expect([JSON.parse(lastAudit(s).before!), JSON.parse(lastAudit(s).after!)]).toEqual([{ removed: ['note.create'] }, { added: ['audit.view'] }])
    expect(() => setRolePermissions(ctx(s), 'admin', ['audit.view'])).toThrow(/kaldırılamaz/)
    expect(() => setRolePermissions(ctx(s), 'technician', ['uçmak'])).toThrow(/Bilinmeyen izin/)
  })
})

describe('admin: besleme, alarm kuralları, entegrasyon (R-055, R-056)', () => {
  it('ön montaj beslemesi ve buffer sınırları; bir istasyonu iki hücre besleyemez', () => {
    const s = new MemoryStore()
    const m = updateSubFeed(ctx(s), 'OP206', { bufferMin: 12, bufferMax: 22 })
    expect(indexMaster(m).feedBySub.get('OP206')).toMatchObject({ bufferMin: 12, bufferMax: 22, mainOp: 'OP080' })
    expect(() => updateSubFeed(ctx(s), 'OP206', { mainOp: 'OP010' })).toThrow(/başka bir ön montaj/)
    expect(() => updateSubFeed(ctx(s), 'OP206', { bufferMin: 30 })).toThrow(/Buffer/)
    expect(() => updateSubFeed(ctx(s), 'OP206', { mainOp: 'OP201' })).toThrow(/ana hatta/)
  })

  it('alarm kuralının önemi, eskalasyonu, ekibi ve açık / kapalı durumu değişir', () => {
    const s = new MemoryStore()
    const m = updateAlarmRule(ctx(s), 'CYC-TAKT', { severity: 'critical', escalationMin: 5, team: 'Bakım Ekibi', enabled: false })
    expect(m.rules.find((r) => r.code === 'CYC-TAKT')).toMatchObject({ severity: 'critical', escalationMin: 5, team: 'Bakım Ekibi', enabled: false })
    expect(() => updateAlarmRule(ctx(s), 'CYC-TAKT', { escalationMin: 0 })).toThrow(/Eskalasyon/)
    expect(() => updateAlarmRule(ctx(s, 'maintenance', 'M-0301'), 'CYC-TAKT', { escalationMin: 9 })).toThrow(ForbiddenError)
  })

  it('çekme aralığı 3–5 dk', () => {
    const s = new MemoryStore()
    expect(updateIntegration(ctx(s), { collectIntervalMin: 5 }).config.collectIntervalMin).toBe(5)
    expect(() => updateIntegration(ctx(s), { collectIntervalMin: 1 })).toThrow(/3–5/)
  })
})

describe('admin: veri saklama (R-010)', () => {
  it('süreler alt sınırların altına inemez', () => {
    const s = new MemoryStore()
    const r = { ...defaultMaster().settings.retention, images: 10 }
    expect(() => updateRetention(ctx(s), r)).toThrow(/Kalite görüntü/)
    expect(updateRetention(ctx(s), { ...r, images: 30 }).settings.retention.images).toBe(30)
  })

  it('süresi dolan kayıtlar silinir; açık alarm, süren rework ve hattaki motor kalır; önizleme ile sonuç aynı', () => {
    const raw = new RawDb()
    new LineSim({ t0: T, startT: T - 12 * 3600_000 }).advance(T, raw)
    const s = new MemoryStore()
    const ix = indexMaster(defaultMaster())
    applyCollected(s, ix, raw.since({}), T)
    const later = T + 400 * DAY
    // Tüm gruplar alt sınırda: 400 gün sonra hepsinin süresi dolmuş olur
    const settings = { ...defaultMaster().settings, retention: { trace: 365, tightening: 365, images: 30, events: 90, alarms: 90, audit: 365 } }
    updateRetention(ctx(s), settings.retention)
    const openAlarms = s.count('alarm', { where: {} }) - s.count('alarm', { where: { status: 'closed' } })
    const inLine = s.count('motor') - s.count('motor', { notNull: ['completedAt'] })
    const openReworks = s.find('rework').filter((r) => r.state !== 'closed').length
    const preview = applyRetention(s, settings, later, true)
    const byGroup = Object.fromEntries(preview.map((p) => [p.group, p.rows]))
    expect(byGroup.images).toBe(s.count('quality_image'))
    expect(byGroup.tightening).toBe(s.count('tightening'))
    expect(byGroup.events).toBe(s.count('station_span', { notNull: ['end'] }) + s.count('sub_sample') + s.count('station_login'))
    // Saklama ayarının kendi audit kaydı da 400 gün önce yazıldı
    expect(byGroup.audit).toBe(1)
    const done = purgeExpired({ ...ctx(s), now: later })
    expect(done.map((d) => d.rows)).toEqual(preview.map((p) => p.rows))
    expect([s.count('quality_image'), s.count('tightening')]).toEqual([0, 0])
    expect(s.count('alarm')).toBe(openAlarms)
    expect(s.count('motor')).toBe(inLine)
    expect(s.find('rework').length).toBe(openReworks)
    expect(s.find('rework_event').every((e) => s.get('rework', e.reworkId))).toBe(true)
    expect(s.find('alarm_event').every((e) => s.get('alarm', e.alarmId))).toBe(true)
    expect(lastAudit(s).action).toBe('retention.purge')
  })
})

describe('audit görüntüleyici (R-058)', () => {
  it('zaman, kullanıcı, işlem ve kayıt filtresi; sayfalama', () => {
    const s = new MemoryStore()
    updateLineConfig(ctx(s, 'admin', 'A-0001', T), { taktSec: 480 })
    updateStation(ctx(s, 'admin', 'A-0001', T + 1000), 'OP070', { targetCycleSec: 420 })
    updateStation(ctx(s, 'admin', 'A-0001', T + 2000), 'OP060', { targetCycleSec: 400 })
    const all = auditQuery(s, { from: T - 1, to: T + 10_000 })
    expect([all.total, all.entries[0].entityId]).toEqual([3, 'OP060'])
    expect(auditQuery(s, { from: T - 1, to: T + 10_000, action: 'config.station' }).total).toBe(2)
    expect(auditQuery(s, { from: T - 1, to: T + 10_000, entity: 'station', entityId: '070' }).entries.map((e) => e.entityId)).toEqual(['OP070'])
    expect(auditQuery(s, { from: T - 1, to: T + 10_000, user: 'yöneticisi' }).total).toBe(3)
    expect(auditQuery(s, { from: T - 1, to: T + 10_000, user: 'Levent' }).total).toBe(0)
    expect(auditQuery(s, { from: T - 1, to: T + 10_000, limit: 2, offset: 2 }).entries.map((e) => e.entityId)).toEqual(['line'])
    expect(auditQuery(s, { from: T + 1500, to: T + 10_000 }).total).toBe(1)
  })
})

describe('ana verinin sürümler arası taşınması', () => {
  it('eski kayıtta olmayan ayarlar ve kurallar varsayılanlarla eklenir; admin değerleri korunur', () => {
    const old = defaultMaster() as Partial<MasterData>
    delete old.settings
    old.config = { ...old.config!, taktSec: 480 }
    old.rules = old.rules!.filter((r) => r.code !== 'NOTE-ERR')
    const m = normalizeMaster(old)
    expect(m.settings.backup.keep).toBe(14)
    expect(m.config.taktSec).toBe(480)
    expect(m.rules.map((r) => r.code)).toContain('NOTE-ERR')
    expect(normalizeMaster(null).config.taktSec).toBe(450)
  })
})
