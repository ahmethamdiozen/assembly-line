import { describe, expect, it } from 'vitest'
import { csvTime, toCsv } from '@/lib/csv'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'
import { advanceReworkBy, decideHold } from './commands'
import { tighteningCsv } from './exports'
import { defaultMaster, indexMaster } from './lineDef'
import { DEFAULT_ROLE_PERMISSIONS } from './rbac'
import { alarmDetail, alarmList, motorDetail, qualityView, searchMotors, tighteningRows, tighteningView } from './views'

const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const HOUR = 3600_000
const ix = indexMaster(defaultMaster())
const raw = new RawDb()
new LineSim({ t0 }).advance(t0, raw)
const store = new MemoryStore()
applyCollected(store, ix, raw.since({}), t0)
const day = { from: t0 - 24 * HOUR, to: t0 }

describe('Motor Takibi (R-027)', () => {
  it('seri no parçasıyla ya da komponent seri numarasıyla bulur; boş aramada son motorlar', () => {
    const recent = searchMotors(store, '')
    expect(recent).toHaveLength(20)
    expect(recent[0].createdAt).toBeGreaterThanOrEqual(recent[1].createdAt)
    const sn = recent[10].sn
    expect(searchMotors(store, sn.slice(-7)).map((m) => m.sn)).toContain(sn)
    const comp = store.find('component_install', { where: { sn } })[0]
    if (comp) {
      const byComp = searchMotors(store, comp.componentSn)
      expect(byComp[0]).toMatchObject({ sn, matchedComponent: comp.componentSn })
    }
    expect(searchMotors(store, 'YOK-123')).toEqual([])
  })

  it('motor ayrıntısı rework adımlarını da içerir', () => {
    const rw = store.find('rework')[0]
    const d = motorDetail(store, ix, rw.sn)!
    expect(d.reworks.map((r) => r.id)).toContain(rw.id)
    expect(d.reworkEvents.length).toBeGreaterThan(0)
    expect(motorDetail(store, ix, 'yok')).toBeNull()
  })
})

describe('Kalite & Rework', () => {
  it('FPY, NOK / HOLD sayıları, açık / kapanan rework, açık HOLD, hata Pareto', () => {
    const q = qualityView(store, day)
    expect(q.firstInspected).toBeGreaterThan(150)
    expect(q.fpy).toBeCloseTo(q.firstPassOk / q.firstInspected)
    expect(q.nok).toBeGreaterThan(0)
    expect(q.reworksOpen.every((r) => r.state !== 'closed')).toBe(true)
    expect(q.reworksClosed.length).toBeGreaterThan(0)
    for (const r of q.reworksOpen) expect(q.events[r.id][0].to).toBe('triage')
    expect(q.defectPareto[0].count).toBeGreaterThanOrEqual(q.defectPareto.at(-1)!.count)
    expect(q.results[0].t).toBeGreaterThanOrEqual(q.results.at(-1)!.t)
  })

  it('rework tezgâhına kök neden ve operatör olmadan geçilemez; HOLD kararı listeden düşer', () => {
    const s = new MemoryStore()
    applyCollected(s, ix, raw.since({}), t0)
    const actor = { id: 'Q-0201', name: 'Aslı Tekin', role: 'quality' as const, permissions: DEFAULT_ROLE_PERMISSIONS.quality }
    const c = { store: s, ix, actor, now: t0 }
    const rw = qualityView(s, day).reworksOpen[0]
    advanceReworkBy(c, rw.id, 'diagnosis', null)
    expect(() => advanceReworkBy(c, rw.id, 'bench', null)).toThrow('kök neden')
    expect(() => advanceReworkBy(c, rw.id, 'bench', null, { rootCause: 'Kelepçe yeri' })).toThrow('rework operatörü')
    expect(advanceReworkBy(c, rw.id, 'bench', null, { rootCause: 'Kelepçe yeri', reworkOperator: 'Aylin Kaya' }).state).toBe('bench')
    s.insert('motor_hold', { id: 'H1', sn: rw.sn, t: t0, source: 'user', reason: 'test', op: null, by: 'x', releasedAt: null, releasedBy: null, resolution: null, alarmKey: null })
    expect(qualityView(s, day).holdsOpen.map((h) => h.id)).toContain('H1')
    decideHold(c, 'H1', 'release', null)
    expect(qualityView(s, day).holdsOpen.map((h) => h.id)).not.toContain('H1')
  })
})

describe('Alarm Merkezi (R-037, R-041)', () => {
  it('penceredeki alarmlar ve pencereden eski ama açık olanlar; sayımlar ve kaynak Pareto', () => {
    const shortWindow = { from: t0 - HOUR, to: t0 }
    const v = alarmList(store, shortWindow)
    const open = store.find('alarm').filter((a) => a.status !== 'closed' && a.t < shortWindow.from)
    expect(open.length).toBeGreaterThan(0)
    for (const a of open) expect(v.alarms.map((x) => x.id)).toContain(a.id)
    expect(v.bySeverity.critical + v.bySeverity.warning + v.bySeverity.info).toBe(v.alarms.length)
    expect(v.alarms[0].t).toBeGreaterThanOrEqual(v.alarms.at(-1)!.t)
  })

  it('alarm ayrıntısı olayları ve ilgili motoru verir', () => {
    const a = store.find('alarm', { where: { code: 'VIS-NOK' } })[0]
    const d = alarmDetail(store, a.id)!
    expect(d.events[0].action).toBe('detected')
    expect(d.motor?.sn).toBe(a.sn)
    expect(alarmDetail(store, 'ALM-yok')).toBeNull()
  })
})

describe('Tork (R-042–R-044)', () => {
  it('filtreler, sayımlar ve controller / tool durumu', () => {
    const all = tighteningView(store, ix, day)
    expect(all.total).toBe(all.ok + all.nok)
    expect(all.stations.map((s) => s.op)).toEqual(['OP020', 'OP030', 'OP050', 'OP080'])
    expect(all.stations.every((s) => s.controller?.online && s.tool?.online)).toBe(true)
    const nok = tighteningView(store, ix, { ...day, result: 'NOK' })
    expect(nok.total).toBe(all.nok)
    expect(nok.rows.every((r) => r.result === 'NOK')).toBe(true)
    const op = tighteningView(store, ix, { ...day, op: 'OP080' })
    expect(op.rows.every((r) => r.op === 'OP080')).toBe(true)
    const sn = all.rows[0].sn
    expect(tighteningRows(store, { ...day, sn: sn.slice(-4) }).every((r) => r.sn.includes(sn.slice(-4)))).toBe(true)
  })

  it('CSV Excel\'in Türkçe ayarlarında açılır: BOM, ";" ayraç, ondalık virgül, tırnaklama', () => {
    const csv = tighteningCsv(tighteningRows(store, { ...day, op: 'OP080' }, 2))
    expect(csv.startsWith('﻿Zaman;Motor S/N;OP;Controller;Tool;Pset;Joint;Hedef (Nm);Min (Nm);Max (Nm);Tork (Nm);Açı (°);Sonuç\r\n')).toBe(true)
    const line = csv.split('\r\n')[1].split(';')
    expect(line[2]).toBe('OP080')
    expect(line[10]).toMatch(/^\d+(,\d)?$/)
    expect(toCsv([{ a: 'x;y "z"', b: 1.5 }], [{ header: 'A', value: (r) => r.a }, { header: 'B', value: (r) => r.b }])).toBe('﻿A;B\r\n"x;y ""z""";1,5\r\n')
    expect(csvTime(new Date(2026, 9, 3, 4, 5, 6).getTime())).toBe('2026-10-03 04:05:06')
  })
})
