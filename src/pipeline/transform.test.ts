import { beforeEach, describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { activeAlarms, motorTrace } from '@/domain/lineState'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { RawDb } from './rawDb'
import { PLC_STATE } from './rows'
import type { NewRow, RawTable } from './rows'
import { SAFETY_MS, applyBatch, applyCollected, cutBatch, evaluate } from './transform'

const ix = indexMaster(defaultMaster())
const SEC = 1000
const MIN = 60 * SEC
const T = new Date(2026, 9, 3, 10, 0).getTime()
const takt = ix.master.config.taktSec * SEC

let db: RawDb
let store: MemoryStore

/** Satırları yazar ve şimdiye kadar yazılanların hepsini işler */
function feed(...rows: [RawTable, NewRow<RawTable>][]) {
  for (const [t, r] of rows) db.write(t, r as never)
  const last = store.kvGet<Record<string, number>>('sync') ?? {}
  const batch = db.since(last)
  applyBatch(store, ix, batch)
  const { lastIds } = cutBatch(batch, Number.POSITIVE_INFINITY, last)
  store.kvSet('sync', lastIds)
}

const reg = (sn: string, t: number): [RawTable, NewRow<'MotorRegistry'>] => ['MotorRegistry', { motorSerial: sn, workOrderNo: 'WO-1', variant: 'TM50 / STD', t }]
const start = (sn: string, op: string, t: number): [RawTable, NewRow<'OperationEvents'>] => ['OperationEvents', { motorSerial: sn, stationCode: op, eventType: 'START', t, operatorNo: 'T-1011', result: null }]
const end = (sn: string, op: string, t: number, result: 'OK' | 'NOK' = 'OK'): [RawTable, NewRow<'OperationEvents'>] => ['OperationEvents', { motorSerial: sn, stationCode: op, eventType: 'END', t, operatorNo: 'T-1011', result }]
const scan = (sn: string, op: string, type: string, serial: string, t: number): [RawTable, NewRow<'ComponentScans'>] => ['ComponentScans', { motorSerial: sn, stationCode: op, componentType: type, componentSerial: serial, lotNo: 'L1', t, operatorNo: null }]
const vision = (sn: string, n: number, decision: 'OK' | 'NOK' | 'HOLD', t: number, defectCode: string | null = null): [RawTable, NewRow<'VisionResults'>] => [
  'VisionResults',
  { inspectionId: `QC-${sn}-${n}`, t, motorSerial: sn, decision, defectCode, defectText: defectCode ? ix.defect.get(defectCode)!.text : null },
]
const tq = (sn: string, joint: string, torque: number, t: number): [RawTable, NewRow<'TighteningResults'>] => [
  'TighteningResults',
  { t, motorSerial: sn, stationCode: 'OP080', controllerId: 'CTRL-080', toolId: 'TOOL-080', pset: 'P80', jointId: joint, targetNm: 30, minNm: 27, maxNm: 33, torqueNm: torque, angleDeg: 90, result: torque >= 27 && torque <= 33 ? 'OK' : 'NOK' },
]
const state = (op: string, code: number, t: number, fault: string | null = null): [RawTable, NewRow<'StationEvents'>] => ['StationEvents', { stationCode: op, t, stateCode: code, faultCode: fault, faultText: fault ? 'Fikstür kilidi algılanmadı' : null }]
const hb = (id: string, online: boolean, t: number): [RawTable, NewRow<'DeviceHeartbeats'>] => ['DeviceHeartbeats', { deviceId: id, deviceType: 'PLC', stationCode: 'OP020', t, online }]
const counter = (op: string, buffer: number, t: number): [RawTable, NewRow<'SubassemblyCounters'>] => ['SubassemblyCounters', { cellCode: op, t, producedTotal: 10, nokTotal: 0, bufferQty: buffer }]

const alarms = (code: string) => store.find('alarm', { where: { code } })

beforeEach(() => {
  db = new RawDb()
  store = new MemoryStore()
})

describe('motor akışı ve izlenebilirlik', () => {
  it('13 operasyonu biten motor tamamlanır; komponentler operasyon bitince Installed olur (R-029, R-030)', () => {
    feed(reg('M1', T))
    let t = T
    for (const st of ix.main) {
      feed(start('M1', st.op, t))
      for (const c of ix.componentsAt.get(st.op) ?? []) feed(scan('M1', st.op, c.code, `${c.code}-TM50-000001`, t + 20 * SEC))
      if (st.op === 'OP050') {
        const mid = motorTrace(store, ix, 'M1')!
        expect(mid.components.find((c) => c.type.code === 'PCS')!.status).toBe('pending') // okutuldu ama operasyon sürüyor
        expect(mid.components.find((c) => c.type.code === 'PCS')!.install).not.toBeNull()
        expect(mid.completion).toBeCloseTo(6 / 13)
      }
      if (st.op === 'OP100') feed(vision('M1', 1, 'OK', t + 4 * MIN))
      feed(end('M1', st.op, t + 4 * MIN))
      t += 5 * MIN
    }
    const tr = motorTrace(store, ix, 'M1')!
    expect(tr.motor.status).toBe('completed')
    expect(tr.motor.firstPassOk).toBe(true)
    expect(tr.completion).toBe(1)
    expect(tr.components.every((c) => c.status === 'installed')).toBe(true)
    expect(tr.steps.every((s) => s.status === 'done' && s.op!.cycleSec === 240)).toBe(true)
  })

  it('kayıt satırı görülmeden gelen motor da izlenir; başlangıcı görülmemiş bitiş sayılır', () => {
    feed(start('X', 'OP010', T))
    expect(store.get('motor', 'X')!.currentOp).toBe('OP010')
    const s = applyBatch(store, ix, { ...db.since({}), OperationEvents: [{ id: 999, motorSerial: 'Y', stationCode: 'OP010', eventType: 'END', t: T, operatorNo: null, result: 'OK' }] } as never)
    expect(s.orphans).toBe(1)
  })

  it('mükerrer komponent S/N alarmı: kayıt değişmez, doğru okutma alarmı temizler', () => {
    feed(reg('M1', T), reg('M2', T), scan('M1', 'OP070', 'KBL', 'KBL-TM50-000001', T))
    feed(scan('M2', 'OP070', 'KBL', 'KBL-TM50-000001', T + MIN))
    expect(alarms('TRC-DUP')).toHaveLength(1)
    expect(alarms('TRC-DUP')[0].clearedAt).toBeNull()
    expect(store.find('component_install', { where: { componentSn: 'KBL-TM50-000001' } }).map((c) => c.sn)).toEqual(['M1'])
    feed(scan('M2', 'OP070', 'KBL', 'KBL-TM50-000002', T + 2 * MIN))
    expect(alarms('TRC-DUP')[0].clearedAt).toBe(T + 2 * MIN)
  })

  it('rework\'te değişen komponentin eskisi "replaced" olarak saklanır', () => {
    feed(reg('M1', T), scan('M1', 'OP070', 'ALT', 'ALT-TM50-000001', T), scan('M1', 'OP070', 'ALT', 'ALT-TM50-000009', T + MIN))
    const all = store.find('component_install', { where: { sn: 'M1', type: 'ALT' } })
    expect(all.map((c) => [c.componentSn, c.replacedAt])).toEqual([
      ['ALT-TM50-000001', T + MIN],
      ['ALT-TM50-000009', null],
    ])
  })
})

describe('alarm kuralları', () => {
  it('takt aşımı: süren çevrimde alarm açılır, çevrim bitince koşul temizlenir', () => {
    feed(reg('M1', T), start('M1', 'OP070', T))
    evaluate(store, ix, T + 1.05 * takt)
    expect(alarms('CYC-TAKT')).toHaveLength(0)
    evaluate(store, ix, T + 1.2 * takt)
    const [a] = alarms('CYC-TAKT')
    expect(a.t).toBe(T + 1.1 * takt)
    expect(a.clearedAt).toBeNull()
    feed(end('M1', 'OP070', T + 1.3 * takt))
    expect(alarms('CYC-TAKT')).toHaveLength(1)
    expect(alarms('CYC-TAKT')[0].clearedAt).toBe(T + 1.3 * takt)
  })

  it('takt aşımı yoklama arasında bittiyse de geçmişe kaydedilir', () => {
    feed(reg('M1', T), start('M1', 'OP070', T), end('M1', 'OP070', T + 1.2 * takt))
    const [a] = alarms('CYC-TAKT')
    expect(a.t).toBe(T + 1.1 * takt)
    expect(a.clearedAt).toBe(T + 1.2 * takt)
    expect(a.message).toContain('9,0 dk (takt 7,5 dk)')
  })

  it('tork NOK alarmı retry OK ile temizlenir', () => {
    feed(reg('M1', T), tq('M1', 'J3', 26.2, T))
    expect(alarms('TQ-NOK')[0].message).toContain('26,2 Nm')
    feed(tq('M1', 'J3', 25.9, T + 25 * SEC))
    expect(alarms('TQ-NOK')).toHaveLength(1)
    feed(tq('M1', 'J3', 30.1, T + 3 * MIN))
    expect(alarms('TQ-NOK')[0].clearedAt).toBe(T + 3 * MIN)
  })

  it('istasyon arızası alarmı bir sonraki durumda temizlenir', () => {
    feed(state('OP010', PLC_STATE.RUNNING, T), state('OP010', PLC_STATE.FAULT, T + MIN, 'FIX-LOCK'))
    expect(alarms('PLC-FLT')[0].message).toContain('Fikstür kilidi')
    feed(state('OP010', PLC_STATE.RUNNING, T + 3 * MIN))
    expect(alarms('PLC-FLT')[0].clearedAt).toBe(T + 3 * MIN)
    expect(store.find('station_span', { where: { op: 'OP010' } }).map((s) => [s.state, s.end])).toEqual([
      ['running', T + MIN],
      ['fault', T + 3 * MIN],
      ['running', null],
    ])
  })

  it('düşük buffer alarmı min seviyenin altında açılır, üstüne çıkınca temizlenir (R-020)', () => {
    feed(counter('OP206', 12, T), counter('OP206', 9, T + MIN), counter('OP206', 8, T + 2 * MIN))
    expect(alarms('BUF-LOW')).toHaveLength(1)
    feed(counter('OP206', 10, T + 3 * MIN))
    expect(alarms('BUF-LOW')[0].clearedAt).toBe(T + 3 * MIN)
  })

  it('heartbeat: offline satırı ya da zaman aşımı alarm açar, gelen heartbeat temizler', () => {
    feed(hb('PLC-TM50-OP020', true, T), hb('PLC-TM50-OP020', false, T + MIN))
    expect(store.get('device', 'PLC-TM50-OP020')!.online).toBe(false)
    feed(hb('PLC-TM50-OP020', true, T + 2 * MIN))
    expect(alarms('HB-LOSS')[0].clearedAt).toBe(T + 2 * MIN)
    // Heartbeat hiç gelmezse
    evaluate(store, ix, T + 2 * MIN + 181 * SEC)
    expect(alarms('HB-LOSS')).toHaveLength(2)
    expect(store.get('device', 'PLC-TM50-OP020')!.online).toBe(false)
    feed(hb('PLC-TM50-OP020', true, T + 6 * MIN))
    expect(activeAlarms(store)).toHaveLength(0)
  })

  it('onaylanmayan alarm kuraldaki sürede eskale olur; zaman damgası eskalasyon anıdır', () => {
    feed(state('OP010', PLC_STATE.FAULT, T, 'FIX-LOCK'))
    evaluate(store, ix, T + MIN)
    expect(alarms('PLC-FLT')[0].escalatedAt).toBeNull()
    evaluate(store, ix, T + 10 * MIN)
    expect(alarms('PLC-FLT')[0].escalatedAt).toBe(T + 2 * MIN) // PLC-FLT: 2 dk
  })
})

describe('OP100 kalite kapısı, rework ve HOLD (AC-06)', () => {
  it('NOK → rework (triage) → OP100\'e dönüş (re-QC) → OK → kapandı', () => {
    feed(reg('M1', T), start('M1', 'OP100', T), vision('M1', 1, 'NOK', T + 5 * MIN, 'VIS-CBL-007'), end('M1', 'OP100', T + 5 * MIN, 'NOK'))
    let m = store.get('motor', 'M1')!
    expect([m.status, m.currentOp, m.firstPassOk]).toEqual(['rework', null, false])
    let [rw] = store.find('rework', { where: { sn: 'M1' } })
    expect([rw.state, rw.sourceOp, rw.category, rw.priority, rw.team]).toEqual(['triage', 'OP070', 'electrical', 'high', 'Kalite Ekibi'])
    expect(alarms('VIS-NOK')[0].clearedAt).toBeNull()

    feed(start('M1', 'OP100', T + 60 * MIN))
    rw = store.get('rework', rw.id)!
    m = store.get('motor', 'M1')!
    expect([rw.state, m.status]).toEqual(['reqc', 'in_line'])
    feed(vision('M1', 2, 'OK', T + 65 * MIN), end('M1', 'OP100', T + 65 * MIN))
    rw = store.get('rework', rw.id)!
    expect([rw.state, rw.closedAt]).toEqual(['closed', T + 65 * MIN])
    expect(alarms('VIS-NOK')[0].clearedAt).toBe(T + 65 * MIN)
    expect(store.get('motor', 'M1')!.firstPassOk).toBe(false) // ilk geçiş başarısız olarak kalır
    expect(store.find('rework_event', { where: { reworkId: rw.id } }).map((e) => e.to)).toEqual(['triage', 'reqc', 'closed'])
  })

  it('re-QC\'de tekrar NOK: aynı rework yeni turla triage\'a döner, eski alarm temizlenir', () => {
    feed(reg('M1', T), start('M1', 'OP100', T), vision('M1', 1, 'NOK', T + 5 * MIN, 'VIS-SEAL-011'), end('M1', 'OP100', T + 5 * MIN, 'NOK'))
    feed(start('M1', 'OP100', T + 60 * MIN), vision('M1', 2, 'NOK', T + 65 * MIN, 'VIS-ORI-004'), end('M1', 'OP100', T + 65 * MIN, 'NOK'))
    const rws = store.find('rework', { where: { sn: 'M1' } })
    expect(rws).toHaveLength(1)
    expect([rws[0].state, rws[0].attempt, rws[0].sourceOp]).toEqual(['triage', 2, 'OP060'])
    const vis = alarms('VIS-NOK')
    expect(vis.map((a) => a.clearedAt === null)).toEqual([false, true])
  })

  it('HOLD → motor bekletilir; OP100\'e tekrar girince HOLD çözülür', () => {
    feed(reg('M1', T), start('M1', 'OP100', T), vision('M1', 1, 'HOLD', T + 5 * MIN, 'VIS-LBL-002'), end('M1', 'OP100', T + 5 * MIN, 'NOK'))
    expect(store.get('motor', 'M1')!.status).toBe('hold')
    expect(store.find('motor_hold', { where: { sn: 'M1' } })[0].releasedAt).toBeNull()
    expect(store.count('rework')).toBe(0)
    feed(start('M1', 'OP100', T + 30 * MIN))
    const [h] = store.find('motor_hold', { where: { sn: 'M1' } })
    expect([h.releasedAt, h.resolution]).toEqual([T + 30 * MIN, 'Tekrar muayene (OP100)'])
    expect(alarms('VIS-HOLD')[0].clearedAt).toBe(T + 30 * MIN)
    expect(store.get('motor', 'M1')!.status).toBe('in_line')
  })

  it('görüntüler muayene kaydına bağlanır (R-032)', () => {
    feed(reg('M1', T), vision('M1', 1, 'OK', T))
    for (const v of ['ÖN', 'ARKA']) db.write('VisionImages', { inspectionId: 'QC-M1-1', t: T, viewName: v, imagePath: `qc/${v}.jpg` })
    feed()
    const imgs = store.find('quality_image', { where: { resultId: store.find('quality_result')[0].id } })
    expect(imgs.map((i) => [i.sn, i.view])).toEqual([
      ['M1', 'ÖN'],
      ['M1', 'ARKA'],
    ])
  })
})

describe('artımlı okuma', () => {
  it('güvenlik payı içindeki satırlar sonraki tura kalır; okuma konumu doğru ilerler', () => {
    db.write('MotorRegistry', { motorSerial: 'A', workOrderNo: 'W', variant: 'V', t: T })
    db.write('MotorRegistry', { motorSerial: 'B', workOrderNo: 'W', variant: 'V', t: T + 10 * SEC })
    const r1 = applyCollected(store, ix, db.since(store.kvGet('sync') ?? {}), T + SAFETY_MS + 5 * SEC)
    expect(r1.rows).toBe(1)
    expect(store.get('motor', 'B')).toBeUndefined()
    expect(store.kvGet('sync')).toEqual({ MotorRegistry: 1 })
    const r2 = applyCollected(store, ix, db.since(store.kvGet('sync') ?? {}), T + SAFETY_MS + 20 * SEC)
    expect(r2.rows).toBe(1)
    expect(store.get('motor', 'B')).toBeDefined()
    expect(store.kvGet('watermark')).toBe(T + 20 * SEC)
  })
})
