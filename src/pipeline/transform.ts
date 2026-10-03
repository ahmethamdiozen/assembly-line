import { clearAlarm, escalateAlarms, raiseAlarm } from '@/domain/alarms'
import type { MasterIndex } from '@/domain/lineDef'
import { closeRework, openRework, openReworkOf, reopenRework, startReqc } from '@/domain/rework'
import type { Store } from '@/domain/store/Store'
import type { ComponentCode, DeviceType, Motor } from '@/domain/types'
import { minutes, num } from '@/lib/format'
import { RAW_TABLES, emptyBatch, plcStateOf } from './rows'
import type {
  ComponentScanRow,
  DeviceHeartbeatRow,
  IoSignalRow,
  LastIds,
  MotorRegistryRow,
  OperationEventRow,
  RawBatch,
  RawTable,
  StationEventRow,
  SubassemblyCounterRow,
  TighteningResultRow,
  VisionImageRow,
  VisionResultRow,
} from './rows'

/**
 * COLLECTOR'IN ANLAMLANDIRMA KATMANI (saf, testli). Fabrikanın SQL Server'ından okunan yeni satırları
 * zaman sırasıyla işler ve uygulama veritabanını günceller: motor ve operasyon geçmişi, komponent
 * genealogy'si, tork, OP100 kararı → rework / HOLD, istasyon durumları, ön montaj buffer'ı, cihaz
 * bağlantısı. Alarm kurallarını burada çalıştırır. Aynı kod sunucuda (3–5 dk'da bir) ve web demosunda çalışır.
 */

/** Okuma anına bu kadar yakın satırlar bir sonraki tura bırakılır (tablolar arası yazma gecikmesine karşı) */
export const SAFETY_MS = 15 * 1000

const SEC = 1000

export interface ApplyStats {
  rows: number
  perTable: Partial<Record<RawTable, number>>
  /** Eşi bulunamayan satırlar (ör. başlangıcı görülmemiş operasyonun bitişi) */
  orphans: number
}

export interface CollectResult extends ApplyStats {
  /** Turun çalıştığı an */
  at: number
  /** Bu ana kadarki veri eksiksiz işlendi */
  watermark: number
}

/**
 * Okunan satırlardan `cutoff`'a kadar olanları ayırır. Her tablo Id sırasıyla okunur; zamanı
 * cutoff'u geçen ilk satırda o tablo için durulur (kalan satırlar sonraki turda tekrar okunur).
 */
export function cutBatch(raw: RawBatch, cutoff: number, last: LastIds): { batch: RawBatch; lastIds: LastIds } {
  const batch = emptyBatch()
  const lastIds: LastIds = { ...last }
  for (const t of RAW_TABLES) {
    const rows = raw[t] as { id: number; t: number }[]
    let k = 0
    while (k < rows.length && rows[k].t <= cutoff) k++
    ;(batch as Record<RawTable, unknown[]>)[t] = rows.slice(0, k)
    if (k > 0) lastIds[t] = rows[k - 1].id
  }
  return { batch, lastIds }
}

/**
 * Bir collector turunun senkron kısmı: okunan satırları işler, zaman kurallarını çalıştırır,
 * okuma konumunu ve veri tazeliğini kaydeder. Sunucu SQL Server'dan asenkron okuyup bunu çağırır;
 * demo bellekteki tablolardan okuyup çağırır.
 */
export function applyCollected(store: Store, ix: MasterIndex, raw: RawBatch, now: number): CollectResult {
  const last = store.kvGet<LastIds>('sync') ?? {}
  const watermark = now - SAFETY_MS
  const { batch, lastIds } = cutBatch(raw, watermark, last)
  const stats = store.transaction(() => {
    const s = applyBatch(store, ix, batch)
    evaluate(store, ix, watermark)
    store.kvSet('sync', lastIds)
    store.kvSet('watermark', watermark)
    return s
  })
  const result: CollectResult = { ...stats, at: now, watermark }
  store.kvSet('collector:last', result)
  return result
}

/** Satırları zaman sırasıyla işler (aynı anda olanlar RAW_TABLES sırasıyla) */
export function applyBatch(store: Store, ix: MasterIndex, batch: RawBatch): ApplyStats {
  return new Applier(store, ix).run(batch)
}

/** Zamana bağlı kurallar: süren çevrimde takt aşımı, heartbeat zaman aşımı, eskalasyon */
export function evaluate(store: Store, ix: MasterIndex, now: number): void {
  const cfg = ix.master.config
  const limit = cfg.alarmRatio * cfg.taktSec * SEC
  for (const op of store.find('motor_op', { isNull: ['end'] })) {
    if (!ix.mainIndex.has(op.op) || now - op.start <= limit) continue
    raiseAlarm(store, ix, {
      code: 'CYC-TAKT',
      key: `CYC|${op.op}|${op.sn}|${op.attempt}`,
      op: op.op,
      sn: op.sn,
      message: `${op.op} çevrimi takt'ı aştı, sürüyor (takt ${minutes(cfg.taktSec / 60)})`,
      t: op.start + limit,
    })
  }
  const timeout = cfg.heartbeatTimeoutSec * SEC
  for (const d of store.find('device', { where: { online: true } })) {
    if (now - d.lastT <= timeout) continue
    store.update('device', d.id, { online: false })
    raiseAlarm(store, ix, { code: 'HB-LOSS', key: `HB|${d.id}`, op: d.op, sn: null, message: `${d.id} heartbeat gelmiyor (${d.op})`, t: d.lastT + timeout })
  }
  escalateAlarms(store, ix, now)
}

type Item = { t: number; p: number; id: number; table: RawTable; row: unknown }

class Applier {
  private readonly stats: ApplyStats = { rows: 0, perTable: {}, orphans: 0 }
  private readonly store: Store
  private readonly ix: MasterIndex

  constructor(store: Store, ix: MasterIndex) {
    this.store = store
    this.ix = ix
  }

  run(batch: RawBatch): ApplyStats {
    const items: Item[] = []
    RAW_TABLES.forEach((table, p) => {
      for (const row of batch[table] as { id: number; t: number }[]) items.push({ t: row.t, p, id: row.id, table, row })
    })
    items.sort((a, b) => a.t - b.t || a.p - b.p || a.id - b.id)
    for (const it of items) {
      this.apply(it)
      this.stats.rows++
      this.stats.perTable[it.table] = (this.stats.perTable[it.table] ?? 0) + 1
    }
    return this.stats
  }

  private apply(it: Item): void {
    switch (it.table) {
      case 'MotorRegistry':
        return this.motorRegistry(it.row as MotorRegistryRow)
      case 'StationEvents':
        return this.stationEvent(it.row as StationEventRow)
      case 'OperationEvents': {
        const r = it.row as OperationEventRow
        return r.eventType === 'START' ? this.opStart(r) : this.opEnd(r)
      }
      case 'ComponentScans':
        return this.scan(it.row as ComponentScanRow)
      case 'TighteningResults':
        return this.tightening(it.row as TighteningResultRow)
      case 'VisionResults':
        return this.vision(it.row as VisionResultRow)
      case 'VisionImages':
        return this.visionImage(it.row as VisionImageRow)
      case 'SubassemblyCounters':
        return this.subCounter(it.row as SubassemblyCounterRow)
      case 'DeviceHeartbeats':
        return this.heartbeat(it.row as DeviceHeartbeatRow)
      case 'IoSignals':
        return this.io(it.row as IoSignalRow)
    }
  }

  // ---------------------------------------------------------------- motor ve operasyonlar

  private motorRegistry(r: MotorRegistryRow): void {
    const m = this.store.get('motor', r.motorSerial)
    if (m) {
      if (m.workOrder === null) this.store.update('motor', m.id, { workOrder: r.workOrderNo, variant: r.variant })
      return
    }
    this.store.insert('motor', { id: r.motorSerial, workOrder: r.workOrderNo, variant: r.variant, createdAt: r.t, status: 'in_line', currentOp: null, firstPassOk: null, completedAt: null })
  }

  /** Kayıt satırı görülmemiş motor için (ör. geçmişin başlangıcından önce oluşmuş) */
  private ensureMotor(sn: string, t: number): Motor {
    const m = this.store.get('motor', sn)
    if (m) return m
    const created: Motor = { id: sn, workOrder: null, variant: null, createdAt: t, status: 'in_line', currentOp: null, firstPassOk: null, completedAt: null }
    this.store.insert('motor', created)
    return created
  }

  private opStart(r: OperationEventRow): void {
    const sn = r.motorSerial
    const op = r.stationCode
    const m = this.ensureMotor(sn, r.t)
    const attempt = this.store.count('motor_op', { where: { sn, op } }) + 1
    this.store.insert('motor_op', { id: `${sn}|${op}|${attempt}`, sn, op, start: r.t, end: null, cycleSec: null, operatorNo: r.operatorNo, result: null, attempt })
    // Motor ilerlediyse önceki istasyondaki NOK koşulu bitmiştir
    for (const a of this.store.find('alarm', { where: { sn, code: 'OP-NOK' }, isNull: ['clearedAt'] })) clearAlarm(this.store, a.key, r.t)
    const patch: Partial<Motor> = { currentOp: op }
    if (op === 'OP100' && (m.status === 'rework' || m.status === 'hold')) {
      const rw = openReworkOf(this.store, sn)
      if (rw) startReqc(this.store, rw, r.t)
      // Kullanıcının koyduğu HOLD'u kullanıcı çözer; vision HOLD'u motor tekrar muayeneye girince çözülür
      const hold = this.store.find('motor_hold', { where: { sn, source: 'vision' }, isNull: ['releasedAt'] })[0]
      if (hold) {
        this.store.update('motor_hold', hold.id, { releasedAt: r.t, releasedBy: null, resolution: 'Tekrar muayene (OP100)' })
        clearAlarm(this.store, hold.alarmKey, r.t)
      }
      patch.status = 'in_line'
    }
    this.store.update('motor', sn, patch)
  }

  private opEnd(r: OperationEventRow): void {
    const sn = r.motorSerial
    const op = r.stationCode
    const open = this.store.find('motor_op', { where: { sn, op }, isNull: ['end'] }).at(-1)
    if (!open) {
      this.stats.orphans++
      return
    }
    const cycleSec = (r.t - open.start) / SEC
    this.store.update('motor_op', open.id, { end: r.t, cycleSec, result: r.result, operatorNo: open.operatorNo ?? r.operatorNo })
    const cfg = this.ix.master.config
    if (this.ix.mainIndex.has(op) && cycleSec > cfg.alarmRatio * cfg.taktSec) {
      const key = `CYC|${op}|${sn}|${open.attempt}`
      raiseAlarm(this.store, this.ix, {
        code: 'CYC-TAKT',
        key,
        op,
        sn,
        message: `${op} çevrim süresi takt'ı aştı: ${minutes(cycleSec / 60)} (takt ${minutes(cfg.taktSec / 60)})`,
        t: open.start + cfg.alarmRatio * cfg.taktSec * SEC,
      })
      clearAlarm(this.store, key, r.t)
    }
    if (r.result === 'NOK' && op !== 'OP100') {
      raiseAlarm(this.store, this.ix, { code: 'OP-NOK', key: `OPNOK|${op}|${sn}|${open.attempt}`, op, sn, message: `${op} operasyonu NOK bitti (${sn})`, t: r.t })
    }
    if (op === this.ix.lastMainOp && r.result === 'OK') this.store.update('motor', sn, { status: 'completed', completedAt: r.t, currentOp: null })
  }

  // ---------------------------------------------------------------- izlenebilirlik

  private scan(r: ComponentScanRow): void {
    const sn = r.motorSerial
    const type = r.componentType as ComponentCode
    const dupKey = `DUP|${sn}|${type}`
    const existing = this.store.first('component_install', { where: { componentSn: r.componentSerial }, isNull: ['replacedAt'] })
    if (existing) {
      if (existing.sn === sn) return // aynı parçanın tekrar okutulması
      raiseAlarm(this.store, this.ix, {
        code: 'TRC-DUP',
        key: dupKey,
        op: r.stationCode,
        sn,
        message: `${r.componentSerial} zaten ${existing.sn} motorunda takılı; ${sn} için okutuldu (${r.stationCode})`,
        t: r.t,
      })
      return
    }
    const prev = this.store.find('component_install', { where: { sn, type }, isNull: ['replacedAt'] })[0]
    if (prev) this.store.update('component_install', prev.id, { replacedAt: r.t })
    this.store.insert('component_install', { id: `CI-${r.id}`, sn, type, componentSn: r.componentSerial, lot: r.lotNo, op: r.stationCode, t: r.t, operatorNo: r.operatorNo, replacedAt: null })
    clearAlarm(this.store, dupKey, r.t)
  }

  private tightening(r: TighteningResultRow): void {
    this.store.insert('tightening', {
      id: `TQ-${r.id}`,
      t: r.t,
      sn: r.motorSerial,
      op: r.stationCode,
      controllerId: r.controllerId,
      toolId: r.toolId,
      pset: r.pset,
      joint: r.jointId,
      targetNm: r.targetNm,
      minNm: r.minNm,
      maxNm: r.maxNm,
      torqueNm: r.torqueNm,
      angleDeg: r.angleDeg,
      result: r.result,
    })
    const key = `TQ|${r.motorSerial}|${r.stationCode}|${r.jointId}`
    if (r.result === 'NOK') {
      raiseAlarm(this.store, this.ix, {
        code: 'TQ-NOK',
        key,
        op: r.stationCode,
        sn: r.motorSerial,
        message: `${r.stationCode} ${r.jointId} tork NOK: ${num(r.torqueNm, 1)} Nm (hedef ${num(r.targetNm, 0)} ± ${num((r.maxNm - r.minNm) / 2, 0)} Nm)`,
        t: r.t,
      })
    } else clearAlarm(this.store, key, r.t)
  }

  // ---------------------------------------------------------------- kalite

  private vision(r: VisionResultRow): void {
    const sn = r.motorSerial
    this.ensureMotor(sn, r.t)
    const attempt = this.store.count('quality_result', { where: { sn } }) + 1
    const resultId = `QC-${r.id}`
    this.store.insert('quality_result', { id: resultId, sn, t: r.t, decision: r.decision, defectCode: r.defectCode, defectText: r.defectText, attempt, inspectionId: r.inspectionId })
    const patch: Partial<Motor> = {}
    if (attempt === 1) patch.firstPassOk = r.decision === 'OK'
    const defect = r.defectCode ? (this.ix.defect.get(r.defectCode) ?? null) : null
    const rw = openReworkOf(this.store, sn)

    if (r.decision === 'OK') {
      if (rw) {
        closeRework(this.store, rw, r.t)
        clearAlarm(this.store, rw.alarmKey, r.t)
      }
    } else if (r.decision === 'NOK') {
      const key = `VIS|${sn}|${attempt}`
      raiseAlarm(this.store, this.ix, { code: 'VIS-NOK', key, op: 'OP100', sn, message: `${sn} OP100 kalite reddi: ${r.defectText ?? r.defectCode ?? 'hata'}`, t: r.t })
      if (rw) {
        clearAlarm(this.store, rw.alarmKey, r.t)
        reopenRework(this.store, rw, r.t, resultId, defect, r.defectText, key)
      } else {
        openRework(this.store, { sn, qualityResultId: resultId, defect, defectText: r.defectText, t: r.t, team: this.ix.rule.get('VIS-NOK')?.team ?? 'Kalite Ekibi', alarmKey: key })
      }
      patch.status = 'rework'
      patch.currentOp = null
    } else {
      const key = `HOLD|${sn}|${attempt}`
      raiseAlarm(this.store, this.ix, { code: 'VIS-HOLD', key, op: 'OP100', sn, message: `${sn} OP100'de HOLD: ${r.defectText ?? r.defectCode ?? 'kalite kararı bekleniyor'}`, t: r.t })
      this.store.insert('motor_hold', { id: `HOLD-${r.id}`, sn, t: r.t, source: 'vision', reason: r.defectText ?? 'Kalite kararı bekleniyor', op: 'OP100', by: null, releasedAt: null, releasedBy: null, resolution: null, alarmKey: key })
      patch.status = 'hold'
      patch.currentOp = null
    }
    this.store.update('motor', sn, patch)
  }

  private visionImage(r: VisionImageRow): void {
    const res = this.store.first('quality_result', { where: { inspectionId: r.inspectionId } })
    if (!res) {
      this.stats.orphans++
      return
    }
    this.store.insert('quality_image', { id: `IMG-${r.id}`, resultId: res.id, sn: res.sn, t: r.t, view: r.viewName, path: r.imagePath })
  }

  // ---------------------------------------------------------------- istasyon, ön montaj, cihazlar

  private stationEvent(r: StationEventRow): void {
    const op = r.stationCode
    const state = plcStateOf(r.stateCode)
    const open = this.store.first('station_span', { where: { op }, isNull: ['end'] })
    if (open) {
      this.store.update('station_span', open.id, { end: r.t })
      if (open.state === 'fault') clearAlarm(this.store, `FLT|${op}|${open.id}`, r.t)
    }
    const id = `SP-${r.id}`
    this.store.insert('station_span', { id, op, start: r.t, end: null, state, code: r.faultCode, text: r.faultText })
    if (state === 'fault') {
      raiseAlarm(this.store, this.ix, { code: 'PLC-FLT', key: `FLT|${op}|${id}`, op, sn: null, message: `${op} arıza: ${r.faultText ?? r.faultCode ?? 'bilinmiyor'}`, t: r.t })
    }
  }

  private subCounter(r: SubassemblyCounterRow): void {
    this.store.insert('sub_sample', { id: `SUB-${r.id}`, op: r.cellCode, t: r.t, producedTotal: r.producedTotal, nokTotal: r.nokTotal, bufferQty: r.bufferQty })
    const feed = this.ix.feedBySub.get(r.cellCode)
    if (!feed) return
    const key = `BUF|${r.cellCode}`
    if (r.bufferQty < feed.bufferMin) {
      raiseAlarm(this.store, this.ix, {
        code: 'BUF-LOW',
        key,
        op: r.cellCode,
        sn: null,
        message: `${r.cellCode} buffer ${r.bufferQty} adet (min ${feed.bufferMin}); ${feed.mainOp} beslemesi risk altında`,
        t: r.t,
      })
    } else clearAlarm(this.store, key, r.t)
  }

  private heartbeat(r: DeviceHeartbeatRow): void {
    const prev = this.store.get('device', r.deviceId)
    this.store.upsert('device', {
      id: r.deviceId,
      type: r.deviceType.toLowerCase() as DeviceType,
      op: r.stationCode,
      lastT: r.t,
      online: r.online,
      lastOnlineT: r.online ? r.t : (prev?.lastOnlineT ?? null),
    })
    const key = `HB|${r.deviceId}`
    if (!r.online) raiseAlarm(this.store, this.ix, { code: 'HB-LOSS', key, op: r.stationCode, sn: null, message: `${r.deviceId} bağlantısı yok (${r.stationCode})`, t: r.t })
    else if (!prev || !prev.online) clearAlarm(this.store, key, r.t)
  }

  private io(r: IoSignalRow): void {
    this.store.upsert('io_state', { id: `${r.stationCode}|${r.signalName}`, op: r.stationCode, signal: r.signalName, value: r.value, t: r.t })
  }
}
