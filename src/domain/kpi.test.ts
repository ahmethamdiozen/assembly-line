import { describe, expect, it } from 'vitest'
import { bottleneck, hourlyOutput, lineKpi, stationCycleStats, unionLength } from './kpi'
import { defaultMaster, indexMaster } from './lineDef'
import { alarmPareto, defectPareto, pareto } from './pareto'
import { MemoryStore } from './store/MemoryStore'
import type { MotorOp, QualityResult, StationSpan } from './types'

const ix = indexMaster(defaultMaster())
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const T = new Date(2026, 9, 3, 8).getTime()

const op = (id: string, station: string, start: number, cycleMin: number, result: 'OK' | 'NOK' = 'OK'): MotorOp => ({
  id,
  sn: id,
  op: station,
  start,
  end: start + cycleMin * MIN,
  cycleSec: cycleMin * 60,
  operatorNo: null,
  result,
  attempt: 1,
})
const span = (id: string, station: string, start: number, end: number | null, state: StationSpan['state'] = 'fault'): StationSpan => ({ id, op: station, start, end, state, code: null, text: null })
const qc = (id: string, t: number, decision: QualityResult['decision'], attempt = 1, defectText: string | null = null): QualityResult => ({ id, sn: id, t, decision, defectCode: null, defectText, attempt, inspectionId: id })

describe('KPI', () => {
  it('aralık birleşimi çakışmaları bir kez sayar', () => {
    expect(unionLength([[0, 10], [5, 15], [20, 25], [25, 30], [40, 40]])).toBe(25)
    expect(unionLength([])).toBe(0)
  })

  it('A, P, FPY, OEE, çıkış / saat ve plan gerçekleşme', () => {
    const s = new MemoryStore()
    // 8 saatlik vardiya; iki istasyonda çakışan arızalar: 10:00–10:20 ve 10:10–10:40 → 40 dk; vardiya sonuna taşan arıza 15:50→ (açık) → 10 dk
    s.insert('station_span', span('a', 'OP050', T + 2 * HOUR, T + 2 * HOUR + 20 * MIN))
    s.insert('station_span', span('b', 'OP070', T + 2 * HOUR + 10 * MIN, T + 2 * HOUR + 40 * MIN))
    s.insert('station_span', span('c', 'OP010', T + 7 * HOUR + 50 * MIN, null))
    s.insert('station_span', span('d', 'OP201', T, T + HOUR)) // ön montaj arızası hattı durdurmaz
    s.insert('station_span', span('e', 'OP010', T, T + HOUR, 'blocked'))
    // 60 motor çıkışı (OP110 OK), biri pencere dışında, biri NOK
    for (let i = 0; i < 60; i++) s.insert('motor_op', op(`m${i}`, 'OP110', T + i * 7 * MIN, 4))
    s.insert('motor_op', op('late', 'OP110', T + 8 * HOUR, 4))
    s.insert('motor_op', op('nok', 'OP110', T + HOUR, 4, 'NOK'))
    // OP100 ilk muayeneler: 50 OK + 2 NOK + 1 HOLD; re-QC denemesi FPY'ye girmez
    for (let i = 0; i < 50; i++) s.insert('quality_result', qc(`q${i}`, T + i * 8 * MIN, 'OK'))
    s.insert('quality_result', qc('n1', T + HOUR, 'NOK'))
    s.insert('quality_result', qc('n2', T + 2 * HOUR, 'NOK'))
    s.insert('quality_result', qc('h1', T + 3 * HOUR, 'HOLD'))
    s.insert('quality_result', qc('r1', T + 4 * HOUR, 'OK', 2))

    const k = lineKpi(s, ix, T, T + 8 * HOUR)
    expect(k.plannedSec).toBe(8 * 3600)
    expect(k.faultSec).toBe(50 * 60)
    expect(k.runSec).toBe(8 * 3600 - 50 * 60)
    expect(k.output).toBe(60)
    expect(k.idealCycleSec).toBe(7 * 60) // OP050 hedefi
    expect(k.availability).toBeCloseTo((480 - 50) / 480)
    expect(k.performance).toBeCloseTo((60 * 7) / 430)
    expect(k.firstInspected).toBe(53)
    expect(k.quality).toBeCloseTo(50 / 53)
    expect(k.oee).toBeCloseTo(k.availability * k.performance * k.quality)
    expect(k.outputPerHour).toBeCloseTo(7.5)
    expect(k.expected).toBe(64)
    expect(k.planAttainment).toBeCloseTo(60 / 64)
  })

  it('veri yoksa oranlar tanımsızdır (ekranda "—")', () => {
    const k = lineKpi(new MemoryStore(), ix, T, T + HOUR)
    expect(k.output).toBe(0)
    expect(Number.isNaN(k.quality)).toBe(true)
    expect(Number.isNaN(k.oee)).toBe(true)
  })

  it('istasyon çevrim istatistikleri ve darboğaz (R-046, R-047)', () => {
    const s = new MemoryStore()
    for (let i = 0; i < 10; i++) {
      s.insert('motor_op', op(`a${i}`, 'OP050', T + i * 10 * MIN, 7 + (i % 2) * 0.2))
      s.insert('motor_op', op(`b${i}`, 'OP070', T + i * 10 * MIN, i < 5 ? 6.5 : 7.8))
    }
    s.insert('motor_op', { ...op('open', 'OP070', T + 200 * MIN, 1), end: null, cycleSec: null, result: null })
    const stats = stationCycleStats(s, ix, 8)
    const op070 = stats.find((x) => x.op === 'OP070')!
    expect(op070.n).toBe(8)
    expect(op070.cycles.map((c) => c / 60)).toEqual([6.5, 6.5, 6.5, 7.8, 7.8, 7.8, 7.8, 7.8])
    expect(op070.meanSec / 60).toBeCloseTo(7.3125)
    expect(op070.maxSec).toBe(7.8 * 60)
    expect(stats.find((x) => x.op === 'OP050')!.meanSec / 60).toBeCloseTo(7.1)
    expect(bottleneck(stats)!.op).toBe('OP070')
    expect(stats.find((x) => x.op === 'OP005')!.n).toBe(0)
    // Son 5 çevrim: OP070 7,8 dk > takt 7,5 dk
    expect(stationCycleStats(s, ix, 5).find((x) => x.op === 'OP070')!.overTakt).toBe(true)
    expect(bottleneck([])).toBeNull()
  })

  it('saatlik çıkış', () => {
    const s = new MemoryStore()
    for (let i = 0; i < 20; i++) s.insert('motor_op', op(`m${i}`, 'OP110', T + i * 7 * MIN, 4))
    expect(hourlyOutput(s, ix, T, T + 3 * HOUR).map((h) => h.output)).toEqual([8, 9, 3])
  })
})

describe('Pareto (R-048)', () => {
  it('sayılara göre azalan sırada, kümülatif paylarla', () => {
    const p = pareto(new Map([['b', 2], ['a', 5], ['c', 3]]))
    expect(p.map((x) => [x.label, x.count])).toEqual([['a', 5], ['c', 3], ['b', 2]])
    expect(p.map((x) => x.cumShare)).toEqual([0.5, 0.8, 1])
  })

  it('kalite hataları: OP100 nedenleri ve tork NOK\'ları; alarm kaynakları', () => {
    const s = new MemoryStore()
    s.insert('quality_result', qc('1', T, 'NOK', 1, 'Kablo demeti routing sapması'))
    s.insert('quality_result', qc('2', T, 'NOK', 1, 'Kablo demeti routing sapması'))
    s.insert('quality_result', qc('3', T, 'HOLD', 1, 'Etiket / işaret okunamadı'))
    s.insert('quality_result', qc('4', T, 'OK'))
    s.insert('tightening', { id: 't', t: T, sn: 'x', op: 'OP080', controllerId: '', toolId: '', pset: 'P80', joint: 'J3', targetNm: 30, minNm: 27, maxNm: 33, torqueNm: 26, angleDeg: 80, result: 'NOK' })
    expect(defectPareto(s, T, T + 1).map((x) => [x.label, x.count])).toEqual([
      ['Kablo demeti routing sapması', 2],
      ['Etiket / işaret okunamadı', 1],
      ['Tork NOK · OP080', 1],
    ])
    expect(alarmPareto(s, T, T + 1)).toEqual([])
  })
})
