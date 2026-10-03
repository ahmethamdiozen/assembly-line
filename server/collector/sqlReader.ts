import type { ConnectionPool } from 'mssql'
import type { RawPreview } from '@/domain/maintenance'
import { RAW_TABLES, emptyBatch } from '@/pipeline/rows'
import type { LastIds, RawBatch, RawTable } from '@/pipeline/rows'
import { sql } from '../shared/mssql'

/**
 * Fabrikanın SQL Server'ından okuma (salt-okur). GERÇEK VERİYE GEÇİŞTE DEĞİŞECEK TEK YER:
 * aşağıdaki SELECT'ler gerçek tablo / kolon adlarına eşlenir; her satır src/pipeline/rows.ts'teki
 * tiplere dönüştürülür. Okuma her tablodan `Id > son okunan`, Id sırasıyla yapılır.
 */

const ms = (d: Date | null) => (d ? d.getTime() : 0)
const num = (v: unknown) => Number(v)

type Mapper = { sql: string; map: (r: Record<string, unknown>) => unknown }

const QUERIES: Record<RawTable, Mapper> = {
  MotorRegistry: {
    sql: 'SELECT Id, MotorSerial, WorkOrderNo, Variant, CreatedUtc FROM dbo.MotorRegistry',
    map: (r) => ({ id: num(r.Id), motorSerial: r.MotorSerial, workOrderNo: r.WorkOrderNo, variant: r.Variant, t: ms(r.CreatedUtc as Date) }),
  },
  StationEvents: {
    sql: 'SELECT Id, StationCode, EventUtc, StateCode, FaultCode, FaultText FROM dbo.StationEvents',
    map: (r) => ({ id: num(r.Id), stationCode: r.StationCode, t: ms(r.EventUtc as Date), stateCode: num(r.StateCode), faultCode: r.FaultCode ?? null, faultText: r.FaultText ?? null }),
  },
  OperationEvents: {
    sql: 'SELECT Id, MotorSerial, StationCode, EventType, EventUtc, OperatorNo, Result FROM dbo.OperationEvents',
    map: (r) => ({ id: num(r.Id), motorSerial: r.MotorSerial, stationCode: r.StationCode, eventType: r.EventType, t: ms(r.EventUtc as Date), operatorNo: r.OperatorNo ?? null, result: r.Result ?? null }),
  },
  ComponentScans: {
    sql: 'SELECT Id, MotorSerial, StationCode, ComponentType, ComponentSerial, LotNo, ScanUtc, OperatorNo FROM dbo.ComponentScans',
    map: (r) => ({
      id: num(r.Id),
      motorSerial: r.MotorSerial,
      stationCode: r.StationCode,
      componentType: r.ComponentType,
      componentSerial: r.ComponentSerial,
      lotNo: r.LotNo ?? null,
      t: ms(r.ScanUtc as Date),
      operatorNo: r.OperatorNo ?? null,
    }),
  },
  TighteningResults: {
    sql: 'SELECT Id, ResultUtc, MotorSerial, StationCode, ControllerId, ToolId, Pset, JointId, TargetNm, MinNm, MaxNm, TorqueNm, AngleDeg, Result FROM dbo.TighteningResults',
    map: (r) => ({
      id: num(r.Id),
      t: ms(r.ResultUtc as Date),
      motorSerial: r.MotorSerial,
      stationCode: r.StationCode,
      controllerId: r.ControllerId,
      toolId: r.ToolId,
      pset: r.Pset,
      jointId: r.JointId,
      targetNm: num(r.TargetNm),
      minNm: num(r.MinNm),
      maxNm: num(r.MaxNm),
      torqueNm: num(r.TorqueNm),
      angleDeg: num(r.AngleDeg),
      result: r.Result,
    }),
  },
  VisionResults: {
    sql: 'SELECT Id, InspectionId, ResultUtc, MotorSerial, Decision, DefectCode, DefectText FROM dbo.VisionResults',
    map: (r) => ({ id: num(r.Id), inspectionId: r.InspectionId, t: ms(r.ResultUtc as Date), motorSerial: r.MotorSerial, decision: r.Decision, defectCode: r.DefectCode ?? null, defectText: r.DefectText ?? null }),
  },
  VisionImages: {
    sql: 'SELECT Id, InspectionId, CapturedUtc, ViewName, ImagePath FROM dbo.VisionImages',
    map: (r) => ({ id: num(r.Id), inspectionId: r.InspectionId, t: ms(r.CapturedUtc as Date), viewName: r.ViewName, imagePath: r.ImagePath }),
  },
  SubassemblyCounters: {
    sql: 'SELECT Id, CellCode, SampleUtc, ProducedTotal, NokTotal, BufferQty FROM dbo.SubassemblyCounters',
    map: (r) => ({ id: num(r.Id), cellCode: r.CellCode, t: ms(r.SampleUtc as Date), producedTotal: num(r.ProducedTotal), nokTotal: num(r.NokTotal), bufferQty: num(r.BufferQty) }),
  },
  DeviceHeartbeats: {
    sql: 'SELECT Id, DeviceId, DeviceType, StationCode, SampleUtc, Online FROM dbo.DeviceHeartbeats',
    map: (r) => ({ id: num(r.Id), deviceId: r.DeviceId, deviceType: r.DeviceType, stationCode: r.StationCode, t: ms(r.SampleUtc as Date), online: !!r.Online }),
  },
  IoSignals: {
    sql: 'SELECT Id, StationCode, SignalName, Value, SampleUtc FROM dbo.IoSignals',
    map: (r) => ({ id: num(r.Id), stationCode: r.StationCode, signalName: r.SignalName, value: !!r.Value, t: ms(r.SampleUtc as Date) }),
  },
}

export interface RawReader {
  read(last: LastIds, limit: number): Promise<RawBatch>
  /** Tablonun son satırları, en yeni önce (Bakım & Entegrasyon ekranı) */
  preview?(table: RawTable, limit: number): Promise<RawPreview>
  /** Her tablonun en büyük Id'si (kaynak sıfırlandı mı kontrolü için) */
  maxIds(): Promise<LastIds>
}

export class SqlServerReader implements RawReader {
  private readonly pool: () => Promise<ConnectionPool>

  constructor(pool: () => Promise<ConnectionPool>) {
    this.pool = pool
  }

  async read(last: LastIds, limit: number): Promise<RawBatch> {
    const p = await this.pool()
    const out = emptyBatch()
    for (const t of RAW_TABLES) {
      const q = QUERIES[t]
      const res = await p
        .request()
        .input('last', sql.BigInt, last[t] ?? 0)
        .input('n', sql.Int, limit)
        .query(`SELECT TOP (@n) * FROM (${q.sql}) x WHERE Id > @last ORDER BY Id`)
      ;(out as Record<RawTable, unknown[]>)[t] = res.recordset.map(q.map)
    }
    return out
  }

  async preview(table: RawTable, limit: number): Promise<RawPreview> {
    const q = QUERIES[table]
    const p = await this.pool()
    const res = await p.request().input('n', sql.Int, limit).query(`SELECT TOP (@n) * FROM (${q.sql}) x ORDER BY Id DESC`)
    return { table, columns: Object.keys(q.map({}) as object), rows: res.recordset.map(q.map) as Record<string, unknown>[] }
  }

  async maxIds(): Promise<LastIds> {
    const p = await this.pool()
    const parts = RAW_TABLES.map((t) => `SELECT '${t}' AS T, ISNULL(MAX(Id), 0) AS M FROM dbo.${t}`).join(' UNION ALL ')
    const res = await p.request().query(parts)
    return Object.fromEntries(res.recordset.map((r: { T: string; M: unknown }) => [r.T, Number(r.M)]))
  }
}
