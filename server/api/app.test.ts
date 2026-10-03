import { beforeAll, describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { DEFAULT_ROLE_PERMISSIONS } from '@/domain/rbac'
import { dayStartOf } from '@/domain/shifts'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'
import { Auth } from '../auth/auth'
import { SqliteStore } from '../db/SqliteStore'
import { openDatabase } from '../db/sqlite'
import { buildApp } from './app'

const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const master = defaultMaster()
const ix = indexMaster(master)
// Testi hızlı tutmak için sadece birkaç kişiye PIN atanır (scrypt bilerek yavaştır)
const people = master.people.filter((p) => ['T-1044', 'S-0101', 'Q-0201', 'M-0301', 'A-0001'].includes(p.personnelNo))

const db = openDatabase(':memory:')
const store = new SqliteStore(db)
const auth = new Auth({ db, people: () => people, rbac: () => DEFAULT_ROLE_PERMISSIONS })
let pulls = 0
const app = buildApp({
  store,
  master: () => master,
  ix: () => ix,
  rbac: () => DEFAULT_ROLE_PERMISSIONS,
  auth,
  now: () => t0,
  collector: {
    status: () => ({ intervalMin: 3, running: false, lastRun: null, lastSuccessAt: null, nextRunAt: t0 + 180_000, watermark: store.kvGet('watermark') }),
    trigger: async () => {
      pulls++
      return { at: t0, ok: true, rows: 0, perTable: {}, durationMs: 1, error: null }
    },
    runs: () => [{ at: t0 - 60_000, ok: false, rows: 0, perTable: {}, durationMs: 3, error: 'Failed to connect' }],
  },
  system: {
    source: 'SQL Server test:1433/TM50Line',
    preview: async (table) => ({ table, columns: ['id', 't'], rows: [{ id: 1, t: t0 }] }),
    logs: () => [{ t: t0, level: 'error' as const, scope: 'collector', msg: 'Collector hatası', detail: null }],
    info: () => ({ mode: 'server', appDb: { kind: 'SQLite', path: ':memory:', sizeBytes: null, schemaVersion: 2 }, rows: {}, backups: [], logFile: null, startedAt: t0, version: 'test' }),
  },
})

beforeAll(() => {
  const raw = new RawDb()
  new LineSim({ t0, startT: t0 - 2 * 3600_000 }).advance(t0, raw)
  applyCollected(store, ix, raw.since({}), t0)
  auth.seed('1234', t0)
})

async function login(id: string, secret = '1234'): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: id, secret } })
  expect(r.statusCode, r.body).toBe(200)
  const c = String(r.headers['set-cookie'])
  expect(c).toContain('HttpOnly')
  return c.split(';')[0]
}

const get = (url: string, cookie?: string) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })
const post = (url: string, payload: object, cookie: string) => app.inject({ method: 'POST', url, payload, headers: { cookie } })

describe('API: oturum ve yetki (R-005, R-050, NFR-003/004)', () => {
  it('sağlık kontrolü herkese açık; diğer uç noktalar oturum ister', async () => {
    expect((await get('/api/v1/health')).statusCode).toBe(200)
    const r = await get('/api/v1/overview')
    expect(r.statusCode).toBe(401)
    expect(r.json().error).toContain('Oturum')
  })

  it('personel no ya da RFID + PIN ile giriş; hatalı PIN genel mesaj verir ve 5 denemede kilitler', async () => {
    const c = await login('T-1044')
    expect((await get('/api/v1/auth/me', c)).json().user).toMatchObject({ id: 'T-1044', name: 'Ece Kara', role: 'technician' })
    await login('RF1044')
    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'Q-0201', secret: '0000' } })
    expect([bad.statusCode, bad.json().error]).toEqual([401, 'Personel no / kart ya da PIN hatalı'])
    for (let i = 0; i < 4; i++) await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'Q-0201', secret: '0000' } })
    const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'Q-0201', secret: '1234' } })
    expect(locked.statusCode).toBe(401)
    expect(locked.json().error).toContain('Çok fazla hatalı deneme')
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'X-9', secret: '1234' } })).statusCode).toBe(401)
  })

  it('şifreler düz metin saklanmaz', () => {
    const rows = db.prepare('SELECT secret_hash FROM app_user').all() as { secret_hash: string }[]
    expect(rows.length).toBe(5)
    for (const r of rows) {
      expect(r.secret_hash).toMatch(/^scrypt\$/)
      expect(r.secret_hash).not.toContain('1234')
    }
  })

  it('çıkış oturumu kapatır', async () => {
    const c = await login('S-0101')
    expect((await post('/api/v1/auth/logout', {}, c)).statusCode).toBe(200)
    expect((await get('/api/v1/auth/me', c)).statusCode).toBe(401)
  })
})

describe('API: okuma', () => {
  it('özet, istasyon ayrıntısı, veri tazeliği, ana veri', async () => {
    const c = await login('T-1044')
    const ov = (await get('/api/v1/overview', c)).json()
    expect(ov.stations).toHaveLength(13)
    expect(ov.watermark).toBe(t0 - 15_000)
    expect((await get('/api/v1/stations/OP070', c)).json().station.op).toBe('OP070')
    expect((await get('/api/v1/stations/OP999', c)).statusCode).toBe(404)
    const st = (await get('/api/v1/status', c)).json()
    expect([st.watermark, st.intervalMin, st.nextPullAt]).toEqual([t0 - 15_000, 3, t0 + 180_000])
    const m = (await get('/api/v1/master', c)).json()
    expect(m.master.stations).toHaveLength(18)
    expect(m.rbac.technician).toContain('note.create')
  })
})

describe('API: komutlar, yetki ve audit (R-025, R-038, R-039, R-040, R-058)', () => {
  it('teknisyen not ekler (yazar = giriş yapan); geçersiz istek 400', async () => {
    const c = await login('T-1044')
    const r = await post('/api/v1/notes', { op: 'OP070', type: 'warning', text: 'Konnektör sayımı tekrarlandı', author: 'Başkası' }, c)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ author: 'Ece Kara', op: 'OP070', type: 'warning', t: t0 })
    expect((await post('/api/v1/notes', { op: 'OP070', type: 'kötü', text: 'x' }, c)).statusCode).toBe(400)
    expect((await post('/api/v1/notes', { op: 'OP070', type: 'info', text: '  ' }, c)).statusCode).toBe(400)
    expect((await post('/api/v1/notes', { type: 'info', text: 'x' }, c)).json().error).toBe('"op" alanı gerekli')
  })

  it('teknisyen alarm onaylayamaz (403); supervisor onaylar, atar, kapatır', async () => {
    const alarm = store.find('alarm', { isNull: ['clearedAt'] })[0]
    const tech = await login('T-1044')
    const denied = await post(`/api/v1/alarms/${alarm.id}/ack`, {}, tech)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error).toContain('Alarm onaylama')
    const sup = await login('S-0101')
    expect((await post(`/api/v1/alarms/${alarm.id}/close`, {}, sup)).statusCode).toBe(400) // önce onay
    expect((await post(`/api/v1/alarms/${alarm.id}/ack`, {}, sup)).json().status).toBe('acknowledged')
    expect((await post(`/api/v1/alarms/${alarm.id}/assign`, { assignee: 'Bakım Ekibi' }, sup)).json().assignee).toBe('Bakım Ekibi')
    const closed = (await post(`/api/v1/alarms/${alarm.id}/close`, { note: 'Giderildi' }, sup)).json()
    expect([closed.status, closed.closedBy, closed.closeNote]).toEqual(['closed', 'Levent Acar', 'Giderildi'])
  })

  it('Andon: teknisyen açar, alarm üretir; bakım ekibi açamaz', async () => {
    const r = await post('/api/v1/andons', { op: 'OP030', type: 'material', message: 'Askı kiti bitti' }, await login('T-1044'))
    expect(r.statusCode, r.body).toBe(200)
    expect(store.get('alarm', r.json().alarmId)!.code).toBe('AND-MAT')
    expect((await post('/api/v1/andons', { op: 'OP030', type: 'quality' }, await login('M-0301'))).statusCode).toBe(403)
  })

  it('"Şimdi çek" bakım ekibine açık, teknisyene kapalı', async () => {
    expect((await post('/api/v1/collector/pull', {}, await login('T-1044'))).statusCode).toBe(403)
    expect((await post('/api/v1/collector/pull', {}, await login('M-0301'))).statusCode).toBe(200)
    expect(pulls).toBe(1)
  })

  it('her komut ve giriş audit log\'a kullanıcı ve zamanla yazılır; audit sadece yetkiliye açık', async () => {
    expect((await get('/api/v1/audit', await login('T-1044'))).statusCode).toBe(403)
    const entries = (await get('/api/v1/audit?limit=500', await login('A-0001'))).json().entries as { action: string; user: string; t: number }[]
    const actions = new Set(entries.map((e) => e.action))
    for (const a of ['auth.login', 'auth.logout', 'note.create', 'alarm.ack', 'alarm.assign', 'alarm.close', 'andon.create', 'collector.pull']) expect(actions.has(a), a).toBe(true)
    expect(entries.every((e) => e.t === t0 && e.user.includes('('))).toBe(true)
  })
})

describe('API: Faz 4 ekranları', () => {
  it('motor arama ve ayrıntı (R-027–R-031)', async () => {
    const c = await login('S-0101')
    const motors = (await get('/api/v1/motors?q=', c)).json().motors as { sn: string }[]
    expect(motors.length).toBeGreaterThan(5)
    const sn = motors[5].sn
    expect((await get(`/api/v1/motors?q=${sn.slice(-6)}`, c)).json().motors.map((m: { sn: string }) => m.sn)).toContain(sn)
    const d = (await get(`/api/v1/motors/${sn}`, c)).json()
    expect(d.motor.id).toBe(sn)
    expect(d.steps).toHaveLength(13)
    expect(d.components).toHaveLength(7)
    expect((await get('/api/v1/motors/YOK', c)).statusCode).toBe(404)
  })

  it('kalite, alarm listesi ve ayrıntısı; zaman aralığı doğrulanır', async () => {
    const c = await login('S-0101')
    const q = (await get(`/api/v1/quality?from=${t0 - 2 * 3600_000}&to=${t0}`, c)).json()
    expect(q.firstInspected).toBeGreaterThan(0)
    const al = (await get(`/api/v1/alarms?from=${t0 - 2 * 3600_000}&to=${t0}`, c)).json()
    expect(al.alarms.length).toBeGreaterThan(0)
    const d = (await get(`/api/v1/alarms/${al.alarms[0].id}`, c)).json()
    expect(d.events[0].action).toBe('detected')
    expect((await get(`/api/v1/alarms?from=${t0}&to=${t0 - 1}`, c)).statusCode).toBe(400)
    expect((await get(`/api/v1/alarms?from=${t0 - 40 * 24 * 3600_000}&to=${t0}`, c)).statusCode).toBe(400)
  })

  it('tork listesi ve CSV dışa aktarımı (R-042–R-044); dışa aktarım audit\'e yazılır', async () => {
    const c = await login('S-0101')
    const v = (await get(`/api/v1/tightening?from=${t0 - 2 * 3600_000}&to=${t0}&op=OP080`, c)).json()
    expect(v.rows.length).toBeGreaterThan(0)
    expect(v.rows.every((r: { op: string }) => r.op === 'OP080')).toBe(true)
    expect(v.stations).toHaveLength(4)
    expect((await get(`/api/v1/tightening?result=YANLIS`, c)).statusCode).toBe(400)
    const csv = await get(`/api/v1/tightening.csv?from=${t0 - 2 * 3600_000}&to=${t0}&op=OP080`, c)
    expect(csv.statusCode).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(String(csv.headers['content-disposition'])).toMatch(/attachment; filename="tork-.*\.csv"/)
    expect(csv.body.startsWith('﻿Zaman;Motor S/N;OP')).toBe(true)
    expect(csv.body.trim().split('\r\n')).toHaveLength(v.total + 1)
    expect(store.find('audit_log', { where: { action: 'tightening.export' } })).toHaveLength(1)
  })
})

describe('API: Faz 5 ekranları', () => {
  it('KPI raporu tarih ve vardiyayla (R-045–R-049)', async () => {
    const c = await login('S-0101')
    expect((await get('/api/v1/kpi', c)).statusCode).toBe(400)
    expect((await get(`/api/v1/kpi?day=${dayStartOf(t0)}&shift=X`, c)).statusCode).toBe(400)
    const r = (await get(`/api/v1/kpi?day=${dayStartOf(t0)}&shift=A&op=OP070`, c)).json()
    expect([r.window.from, r.window.to]).toEqual([dayStartOf(t0), t0])
    expect(r.trend.op).toBe('OP070')
    expect(r.shifts.map((s: { shift: { id: string } }) => s.shift.id)).toEqual(['A', 'B', 'C'])
  })

  it('terminal: yetkinlik kontrollü giriş, aktif görev, operasyonu tamamla (R-006, R-050–R-052)', async () => {
    const c = await login('T-1044')
    const before = (await get('/api/v1/terminal/OP070', c)).json()
    expect(before.me).toMatchObject({ here: false, missing: [] })
    const denied = await post('/api/v1/terminal/login', { op: 'OP080' }, c)
    expect(denied.statusCode).toBe(400)
    expect(denied.json().error).toContain('Torque Qualified')
    expect((await post('/api/v1/terminal/login', { op: 'OP070' }, c)).json().rosterMatch).toBe(true)
    const v = (await get('/api/v1/terminal/OP070', c)).json()
    expect([v.login.name, v.me.here]).toEqual(['Ece Kara', true])
    expect(v.motor).not.toBeNull()
    const ok = await post('/api/v1/terminal/confirm', { op: 'OP070', sn: v.motor.sn, note: 'Kontrol listesi tamam' }, c)
    expect(ok.statusCode, ok.body).toBe(200)
    expect((await post('/api/v1/terminal/confirm', { op: 'OP070', sn: v.motor.sn }, c)).statusCode).toBe(400)
    expect((await post('/api/v1/terminal/confirm', { op: 'OP070', sn: v.motor.sn }, await login('S-0101'))).statusCode).toBe(403)
    expect((await get(`/api/v1/motors/${v.motor.sn}`, c)).json().confirmations[0].name).toBe('Ece Kara')
    expect((await post('/api/v1/terminal/logout', {}, c)).json().login.logoutAt).toBe(t0)
    expect((await get('/api/v1/terminal/YOK', c)).statusCode).toBe(404)
  })

  it('bakım ve entegrasyon herkese açık; ham tablolar, loglar ve sistem bilgisi system.view ister (R-057, R-073)', async () => {
    const tech = await login('T-1044')
    const m = (await get('/api/v1/maintenance', tech)).json()
    expect(m.devices.length).toBeGreaterThan(18)
    const i = (await get('/api/v1/integration', tech)).json()
    expect([i.mode, i.source, i.runs[0].error]).toEqual(['server', 'SQL Server test:1433/TM50Line', 'Failed to connect'])
    expect(i.readPosition).toHaveLength(10)
    for (const u of ['/api/v1/integration/raw/OperationEvents', '/api/v1/system/logs', '/api/v1/system/info']) expect((await get(u, tech)).statusCode).toBe(403)
    const mt = await login('M-0301')
    expect((await get('/api/v1/integration/raw/OperationEvents?limit=5', mt)).json().rows).toHaveLength(1)
    expect((await get('/api/v1/integration/raw/Yok', mt)).statusCode).toBe(400)
    expect((await get('/api/v1/system/logs?level=error', mt)).json().entries[0].scope).toBe('collector')
    expect((await get('/api/v1/system/logs?level=debug', mt)).statusCode).toBe(400)
    expect((await get('/api/v1/system/info', mt)).json().appDb.schemaVersion).toBe(2)
  })
})
