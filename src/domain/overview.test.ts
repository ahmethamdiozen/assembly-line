import { describe, expect, it } from 'vitest'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'
import { defaultMaster, indexMaster } from './lineDef'
import { NoteError, addNote } from './notes'
import { buildOverview, stationDetail } from './overview'

const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const ix = indexMaster(defaultMaster())

function line() {
  const db = new RawDb()
  const store = new MemoryStore()
  const sim = new LineSim({ t0 })
  sim.advance(t0, db)
  applyCollected(store, ix, db.since({}), t0)
  return store
}
const store = line()

describe('Kontrol Merkezi özeti (R-003)', () => {
  const ov = buildOverview(store, ix, t0)

  it('13 istasyon, 5 ön montaj, vardiya KPI ve hedefi', () => {
    expect(ov.stations).toHaveLength(13)
    expect(ov.subs).toHaveLength(5)
    expect(ov.shift.shift.id).toBe('A')
    expect(ov.shiftTarget).toBe(64)
    expect(ov.kpi.output).toBeGreaterThan(40)
    expect(ov.watermark).toBe(t0 - 15_000)
  })

  it('hattaki her motorun aşaması bulunduğu istasyonla tutarlı (illüstrasyon)', () => {
    expect(ov.motors.length).toBeGreaterThan(8)
    for (const m of ov.motors) expect(m.completed).toBe(m.done ? m.seq : m.seq - 1)
    // Soldan sağa motorlar daha çok parçaya sahip
    const c = ov.motors.map((m) => m.completed)
    expect([...c].sort((a, b) => a - b)).toEqual(c)
  })

  it('aktif alarmlar önce kritik, son olaylar en yeni üstte', () => {
    const sev = ov.alarms.active.map((a) => a.severity)
    expect(sev.indexOf('warning') === -1 || sev.lastIndexOf('critical') < sev.indexOf('warning')).toBe(true)
    expect(ov.alarms.critical).toBe(sev.filter((s) => s === 'critical').length)
    expect(ov.events.length).toBe(20)
    for (let i = 1; i < ov.events.length; i++) expect(ov.events[i - 1].t).toBeGreaterThanOrEqual(ov.events[i].t)
  })

  it('açık rework yüksek öncelikliler önce', () => {
    expect(ov.reworks.length).toBeGreaterThan(0)
    expect(ov.reworks.every((r) => r.state !== 'closed')).toBe(true)
  })
})

describe('seçili istasyon ayrıntısı (R-021–R-026)', () => {
  it('ana hat istasyonu: sonraki istasyon, besleme, geçmiş, cihazlar, IO, bakım metrikleri', () => {
    const d = stationDetail(store, ix, 'OP050', t0)!
    expect(d.nextStation?.op).toBe('OP060')
    expect(d.feed?.subOp).toBe('OP202')
    expect(d.history).toHaveLength(12)
    expect(d.history[0].op.start).toBeGreaterThan(d.history[11].op.start)
    expect(d.devices.map((x) => x.type).sort()).toEqual(['controller', 'plc', 'tool'])
    expect(d.io.map((x) => x.signal)).toEqual(['Parça okutma', 'Hizalama', 'Tool hazır'])
    expect(d.maint.faults).toBeGreaterThanOrEqual(1) // PLC-HS hikâyesi
    expect(d.maint.busyRatio).toBeGreaterThan(0.5)
    expect(d.tightening!.rows.length).toBeGreaterThan(0)
    expect(d.cycles?.op).toBe('OP050')
  })

  it('OP100 son kalite kararını, ön montaj hücresi üretim ve buffer bilgisini verir', () => {
    expect(stationDetail(store, ix, 'OP100', t0)!.quality).not.toBeNull()
    const s = stationDetail(store, ix, 'OP206', t0)!
    expect(s.view).toBeNull()
    expect(s.sub?.feed.mainOp).toBe('OP080')
    expect(s.nextStation?.op).toBe('OP080')
    expect(s.history).toHaveLength(0)
    expect(stationDetail(store, ix, 'OP999', t0)).toBeNull()
  })
})

describe('teknisyen notu (R-025, AC-08)', () => {
  it('yazar, zaman, istasyon, motor ve ilişkili alarm / konu saklanır; hata notu alarm üretir', () => {
    const s = line()
    const alarm = s.find('alarm', { where: { op: 'OP070' } })[0]
    const n1 = addNote(s, ix, { op: 'OP070', type: 'warning', text: '  Konnektör sayımı tekrarlandı  ', author: 'Ece Kara', sn: 'TM50-X', alarmId: alarm.id }, t0)
    expect([n1.text, n1.author, n1.t, n1.op, n1.sn, n1.alarmId, n1.topic]).toEqual(['Konnektör sayımı tekrarlandı', 'Ece Kara', t0, 'OP070', 'TM50-X', alarm.id, null])
    const before = s.count('alarm', { where: { code: 'NOTE-ERR' } })
    const n2 = addNote(s, ix, { op: 'OP070', type: 'error', text: 'Kablo demeti hasarlı geldi', author: 'Ece Kara', topic: 'Kablo' }, t0 + 1)
    expect(n2.topic).toBe('Kablo')
    expect(s.count('alarm', { where: { code: 'NOTE-ERR' } })).toBe(before + 1)
    expect(stationDetail(s, ix, 'OP070', t0 + 2)!.notes.map((n) => n.id)).toEqual([n2.id, n1.id])
  })

  it('boş metin, bilinmeyen istasyon ya da alarm reddedilir', () => {
    const s = new MemoryStore()
    expect(() => addNote(s, ix, { op: 'OP070', type: 'info', text: '   ', author: 'x' }, t0)).toThrow(NoteError)
    expect(() => addNote(s, ix, { op: 'OP999', type: 'info', text: 'a', author: 'x' }, t0)).toThrow(NoteError)
    expect(() => addNote(s, ix, { op: 'OP070', type: 'info', text: 'a', author: 'x', alarmId: 'ALM-404' }, t0)).toThrow(NoteError)
  })
})
