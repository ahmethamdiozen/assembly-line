import { describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { RawDb } from '@/pipeline/rawDb'
import { RAW_TABLES } from '@/pipeline/rows'
import { LineSim } from './lineSim'
import { NO_STORIES } from './stories'

const MIN = 60_000
const HOUR = 60 * MIN
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const ix = indexMaster(defaultMaster())

function run(opts: Partial<ConstructorParameters<typeof LineSim>[0]> = {}, until = t0) {
  const db = new RawDb()
  const sim = new LineSim({ t0, ...opts })
  sim.advance(until, db)
  return db
}

// Testler arasında paylaşılan 24 saatlik çalışma
const day = run()

describe('LineSim', () => {
  it('deterministik: aynı tohumla aynı satırlar; parça parça ilerletmek sonucu değiştirmez', () => {
    const a = run({ startT: t0 - 4 * HOUR })
    const db = new RawDb()
    const sim = new LineSim({ t0, startT: t0 - 4 * HOUR })
    for (let t = t0 - 4 * HOUR; t <= t0; t += 7 * MIN + 13_000) sim.advance(t, db)
    sim.advance(t0, db)
    for (const t of RAW_TABLES) expect(db.tables[t]).toEqual(a.tables[t])
    const other = run({ startT: t0 - 4 * HOUR, seed: 99 })
    expect(other.tables.OperationEvents).not.toEqual(a.tables.OperationEvents)
  })

  it('hat bir günde takt planına yakın üretir', () => {
    const done = day.tables.OperationEvents.filter((r) => r.eventType === 'END' && r.stationCode === 'OP110')
    // Takt 7,5 dk → 24 saatte 192; dolum, arızalar ve rework ile biraz altı
    expect(done.length).toBeGreaterThan(165)
    expect(done.length).toBeLessThan(200)
  })

  it('her motor istasyonları sırayla gezer; her bitişin bir başlangıcı vardır', () => {
    const open = new Map<string, number>()
    const lastSeq = new Map<string, number>()
    for (const r of day.tables.OperationEvents) {
      const k = `${r.motorSerial}|${r.stationCode}`
      if (r.eventType === 'START') {
        expect(open.has(k)).toBe(false)
        open.set(k, r.t)
        const seq = ix.mainIndex.get(r.stationCode)!
        const prev = lastSeq.get(r.motorSerial) ?? -1
        // İleri gider; sadece re-QC için OP100 tekrarlanır
        expect(seq > prev || (r.stationCode === 'OP100' && prev === seq)).toBe(true)
        lastSeq.set(r.motorSerial, seq)
      } else {
        expect(open.has(k)).toBe(true)
        expect(r.t).toBeGreaterThan(open.get(k)!)
        open.delete(k)
      }
    }
  })

  it('istasyonda aynı anda en fazla bir motor çalışır', () => {
    const busy = new Map<string, string>()
    for (const r of day.tables.OperationEvents) {
      if (r.eventType === 'START') {
        expect(busy.get(r.stationCode)).toBeUndefined()
        busy.set(r.stationCode, r.motorSerial)
      } else busy.delete(r.stationCode)
    }
  })

  it('seri numarası biçimleri (URS §7)', () => {
    for (const r of day.tables.MotorRegistry) {
      expect(r.motorSerial).toMatch(/^TM50-\d{6}-\d{4}$/)
      expect(r.workOrderNo).toMatch(/^WO-TM50-\d{6}-[ABC]$/)
    }
    for (const r of day.tables.ComponentScans) expect(r.componentSerial).toMatch(new RegExp(`^${r.componentType}-TM50-\\d{6}$`))
  })

  it('tamamlanan her motora 7 komponent okutulur, takıldığı istasyonda', () => {
    const done = new Set(day.tables.OperationEvents.filter((r) => r.eventType === 'END' && r.stationCode === 'OP110').map((r) => r.motorSerial))
    const types = new Map<string, Set<string>>()
    for (const r of day.tables.ComponentScans) {
      expect(ix.master.components.find((c) => c.code === r.componentType)!.installOp).toBe(r.stationCode)
      if (!types.has(r.motorSerial)) types.set(r.motorSerial, new Set())
      types.get(r.motorSerial)!.add(r.componentType)
    }
    for (const sn of done) expect(types.get(sn)?.size).toBe(7)
  })

  it('tork sonuçları tolerans dışındaysa NOK, içindeyse OK', () => {
    expect(day.tables.TighteningResults.length).toBeGreaterThan(1000)
    for (const r of day.tables.TighteningResults) {
      const inside = r.torqueNm >= r.minNm && r.torqueNm <= r.maxNm
      expect(r.result).toBe(inside ? 'OK' : 'NOK')
    }
  })

  it('her OP100 kararıyla 6 görüntü yazılır', () => {
    const imgs = new Map<string, number>()
    for (const r of day.tables.VisionImages) imgs.set(r.inspectionId, (imgs.get(r.inspectionId) ?? 0) + 1)
    for (const r of day.tables.VisionResults) expect(imgs.get(r.inspectionId)).toBe(6)
  })

  it('demo hikâyeleri: vision reddi, tork, mükerrer okutma, bağlantı kaybı, düşük buffer', () => {
    const at = (min: number) => t0 + min * MIN
    const nok = day.tables.VisionResults.find((r) => r.defectCode === 'VIS-CBL-007' && r.t >= at(-20))
    expect(nok?.decision).toBe('NOK')
    const j3 = day.tables.TighteningResults.filter((r) => r.stationCode === 'OP080' && r.jointId === 'J3' && r.t >= at(-12))
    expect(j3.slice(0, 3).map((r) => r.result)).toEqual(['NOK', 'NOK', 'OK'])
    expect(day.tables.StationEvents.some((r) => r.stationCode === 'OP080' && r.faultCode === 'TOOL-ERR' && r.t >= at(-12))).toBe(true)
    const kbl = day.tables.ComponentScans.filter((r) => r.componentType === 'KBL')
    const serials = kbl.map((r) => r.componentSerial)
    expect(serials.length - new Set(serials).size).toBe(1)
    const off = day.tables.DeviceHeartbeats.filter((r) => !r.online)
    expect(off.length).toBeGreaterThan(0)
    expect(off.every((r) => r.deviceId === 'PLC-TM50-OP020' && r.t >= at(-5))).toBe(true)
    const op206 = day.tables.SubassemblyCounters.filter((r) => r.cellCode === 'OP206')
    expect(op206.at(-1)!.bufferQty).toBeLessThan(10)
    expect(Math.min(...op206.map((r) => r.bufferQty))).toBeGreaterThan(0)
  })

  it('hikâyesiz çalışmada bu olaylar görülmez', () => {
    const plain = run({ startT: t0 - 6 * HOUR, stories: NO_STORIES })
    expect(plain.tables.DeviceHeartbeats.every((r) => r.online)).toBe(true)
    const serials = plain.tables.ComponentScans.map((r) => r.componentSerial)
    expect(new Set(serials).size).toBe(serials.length)
  })
})
