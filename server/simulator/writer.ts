import type { ConnectionPool, ISqlType, Transaction } from 'mssql'
import { RAW_TABLES } from '@/pipeline/rows'
import type { NewRow, RawRows, RawSink, RawTable } from '@/pipeline/rows'
import { sql } from '../shared/mssql'

/**
 * Simülatörün ürettiği satırları biriktirir ve SQL Server'a toplu ekler (bulk insert).
 * Kolon sırası server/sql/schema.sql ile aynıdır; Id identity olduğu için SQL Server verir.
 */

type Col = [name: string, type: ISqlType | (() => ISqlType), nullable: boolean, value: (r: never) => unknown]

const d = (t: number) => new Date(t)
const VC = (n: number) => sql.VarChar(n)
const NVC = (n: number) => sql.NVarChar(n)

const COLS: { [K in RawTable]: Col[] } = {
  MotorRegistry: [
    ['MotorSerial', VC(30), false, (r: RawRows['MotorRegistry']) => r.motorSerial],
    ['WorkOrderNo', VC(30), false, (r: RawRows['MotorRegistry']) => r.workOrderNo],
    ['Variant', NVC(40), false, (r: RawRows['MotorRegistry']) => r.variant],
    ['CreatedUtc', sql.DateTime2(3), false, (r: RawRows['MotorRegistry']) => d(r.t)],
  ],
  StationEvents: [
    ['StationCode', VC(10), false, (r: RawRows['StationEvents']) => r.stationCode],
    ['EventUtc', sql.DateTime2(3), false, (r: RawRows['StationEvents']) => d(r.t)],
    ['StateCode', sql.TinyInt, false, (r: RawRows['StationEvents']) => r.stateCode],
    ['FaultCode', VC(20), true, (r: RawRows['StationEvents']) => r.faultCode],
    ['FaultText', NVC(100), true, (r: RawRows['StationEvents']) => r.faultText],
  ],
  OperationEvents: [
    ['MotorSerial', VC(30), false, (r: RawRows['OperationEvents']) => r.motorSerial],
    ['StationCode', VC(10), false, (r: RawRows['OperationEvents']) => r.stationCode],
    ['EventType', VC(5), false, (r: RawRows['OperationEvents']) => r.eventType],
    ['EventUtc', sql.DateTime2(3), false, (r: RawRows['OperationEvents']) => d(r.t)],
    ['OperatorNo', VC(20), true, (r: RawRows['OperationEvents']) => r.operatorNo],
    ['Result', VC(3), true, (r: RawRows['OperationEvents']) => r.result],
  ],
  ComponentScans: [
    ['MotorSerial', VC(30), false, (r: RawRows['ComponentScans']) => r.motorSerial],
    ['StationCode', VC(10), false, (r: RawRows['ComponentScans']) => r.stationCode],
    ['ComponentType', VC(10), false, (r: RawRows['ComponentScans']) => r.componentType],
    ['ComponentSerial', VC(40), false, (r: RawRows['ComponentScans']) => r.componentSerial],
    ['LotNo', VC(40), true, (r: RawRows['ComponentScans']) => r.lotNo],
    ['ScanUtc', sql.DateTime2(3), false, (r: RawRows['ComponentScans']) => d(r.t)],
    ['OperatorNo', VC(20), true, (r: RawRows['ComponentScans']) => r.operatorNo],
  ],
  TighteningResults: [
    ['ResultUtc', sql.DateTime2(3), false, (r: RawRows['TighteningResults']) => d(r.t)],
    ['MotorSerial', VC(30), false, (r: RawRows['TighteningResults']) => r.motorSerial],
    ['StationCode', VC(10), false, (r: RawRows['TighteningResults']) => r.stationCode],
    ['ControllerId', VC(30), false, (r: RawRows['TighteningResults']) => r.controllerId],
    ['ToolId', VC(30), false, (r: RawRows['TighteningResults']) => r.toolId],
    ['Pset', VC(10), false, (r: RawRows['TighteningResults']) => r.pset],
    ['JointId', VC(10), false, (r: RawRows['TighteningResults']) => r.jointId],
    ['TargetNm', sql.Decimal(8, 2), false, (r: RawRows['TighteningResults']) => r.targetNm],
    ['MinNm', sql.Decimal(8, 2), false, (r: RawRows['TighteningResults']) => r.minNm],
    ['MaxNm', sql.Decimal(8, 2), false, (r: RawRows['TighteningResults']) => r.maxNm],
    ['TorqueNm', sql.Decimal(8, 2), false, (r: RawRows['TighteningResults']) => r.torqueNm],
    ['AngleDeg', sql.Decimal(8, 1), false, (r: RawRows['TighteningResults']) => r.angleDeg],
    ['Result', VC(3), false, (r: RawRows['TighteningResults']) => r.result],
  ],
  VisionResults: [
    ['InspectionId', VC(50), false, (r: RawRows['VisionResults']) => r.inspectionId],
    ['ResultUtc', sql.DateTime2(3), false, (r: RawRows['VisionResults']) => d(r.t)],
    ['MotorSerial', VC(30), false, (r: RawRows['VisionResults']) => r.motorSerial],
    ['Decision', VC(4), false, (r: RawRows['VisionResults']) => r.decision],
    ['DefectCode', VC(20), true, (r: RawRows['VisionResults']) => r.defectCode],
    ['DefectText', NVC(100), true, (r: RawRows['VisionResults']) => r.defectText],
  ],
  VisionImages: [
    ['InspectionId', VC(50), false, (r: RawRows['VisionImages']) => r.inspectionId],
    ['CapturedUtc', sql.DateTime2(3), false, (r: RawRows['VisionImages']) => d(r.t)],
    ['ViewName', NVC(40), false, (r: RawRows['VisionImages']) => r.viewName],
    ['ImagePath', NVC(260), false, (r: RawRows['VisionImages']) => r.imagePath],
  ],
  SubassemblyCounters: [
    ['CellCode', VC(10), false, (r: RawRows['SubassemblyCounters']) => r.cellCode],
    ['SampleUtc', sql.DateTime2(3), false, (r: RawRows['SubassemblyCounters']) => d(r.t)],
    ['ProducedTotal', sql.Int, false, (r: RawRows['SubassemblyCounters']) => r.producedTotal],
    ['NokTotal', sql.Int, false, (r: RawRows['SubassemblyCounters']) => r.nokTotal],
    ['BufferQty', sql.Int, false, (r: RawRows['SubassemblyCounters']) => r.bufferQty],
  ],
  DeviceHeartbeats: [
    ['DeviceId', VC(30), false, (r: RawRows['DeviceHeartbeats']) => r.deviceId],
    ['DeviceType', VC(12), false, (r: RawRows['DeviceHeartbeats']) => r.deviceType],
    ['StationCode', VC(10), false, (r: RawRows['DeviceHeartbeats']) => r.stationCode],
    ['SampleUtc', sql.DateTime2(3), false, (r: RawRows['DeviceHeartbeats']) => d(r.t)],
    ['Online', sql.Bit, false, (r: RawRows['DeviceHeartbeats']) => r.online],
  ],
  IoSignals: [
    ['StationCode', VC(10), false, (r: RawRows['IoSignals']) => r.stationCode],
    ['SignalName', NVC(40), false, (r: RawRows['IoSignals']) => r.signalName],
    ['Value', sql.Bit, false, (r: RawRows['IoSignals']) => r.value],
    ['SampleUtc', sql.DateTime2(3), false, (r: RawRows['IoSignals']) => d(r.t)],
  ],
}

export class BufferSink implements RawSink {
  rows = Object.fromEntries(RAW_TABLES.map((t) => [t, []])) as unknown as { [K in RawTable]: NewRow<K>[] }

  write<K extends RawTable>(table: K, row: NewRow<K>): void {
    ;(this.rows[table] as NewRow<K>[]).push(row)
  }

  get count(): number {
    return RAW_TABLES.reduce((n, t) => n + this.rows[t].length, 0)
  }

  /** Tüm satırları tek transaction'da yazar; tablo başına eklenen satır sayısını döndürür */
  async flush(pool: ConnectionPool, extra?: (tx: Transaction) => Promise<void>): Promise<Partial<Record<RawTable, number>>> {
    const done: Partial<Record<RawTable, number>> = {}
    const tx = new sql.Transaction(pool)
    await tx.begin()
    try {
      for (const t of RAW_TABLES) {
        const rows = this.rows[t]
        if (!rows.length) continue
        const table = new sql.Table(`dbo.${t}`)
        table.create = false
        for (const [name, type, nullable] of COLS[t]) table.columns.add(name, type, { nullable })
        for (const r of rows) table.rows.add(...COLS[t].map(([, , , v]) => (v as (x: unknown) => unknown)(r) as never))
        await new sql.Request(tx).bulk(table)
        done[t] = rows.length
      }
      if (extra) await extra(tx)
      await tx.commit()
    } catch (e) {
      await tx.rollback()
      throw e
    }
    this.rows = Object.fromEntries(RAW_TABLES.map((t) => [t, []])) as unknown as { [K in RawTable]: NewRow<K>[] }
    return done
  }
}

/** Yazmadan simüle etmek için (yeniden başlatmada kaldığı yere kadar tekrar oynatma) */
export const nullSink: RawSink = { write: () => {} }
