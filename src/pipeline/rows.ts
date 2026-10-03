/**
 * Fabrikanın SQL Server'ındaki satır biçimleri ("bize verilecek olan"; server/sql/schema.sql).
 * Simülatör bunları yazar, collector okur. Tablolar sadece eklemelidir, `id` identity anahtardır,
 * zamanlar epoch ms (SQL'de UTC datetime2). Gerçek şema gelince sadece collector'daki SELECT'ler eşlenir.
 */
import type { PlcState } from '@/domain/types'

/** PLC durum kodları (StationEvents.StateCode) */
export const PLC_STATE = { RUNNING: 1, STARVED: 2, BLOCKED: 3, FAULT: 4, STOPPED: 5 } as const

const STATE_BY_CODE: Record<number, PlcState> = { 1: 'running', 2: 'starved', 3: 'blocked', 4: 'fault', 5: 'stopped' }
export const plcStateOf = (code: number): PlcState => STATE_BY_CODE[code] ?? 'stopped'

/** OP005: motor seri numarası ve iş emri oluşur */
export interface MotorRegistryRow {
  id: number
  motorSerial: string
  workOrderNo: string
  variant: string
  t: number
}

/** Motor × istasyon operasyon başlangıç / bitişi */
export interface OperationEventRow {
  id: number
  motorSerial: string
  stationCode: string
  eventType: 'START' | 'END'
  t: number
  operatorNo: string | null
  /** Sadece END'de */
  result: 'OK' | 'NOK' | null
}

/** İstasyon durum değişimi (sadece değişince yazılır) */
export interface StationEventRow {
  id: number
  stationCode: string
  t: number
  stateCode: number
  faultCode: string | null
  faultText: string | null
}

export interface ComponentScanRow {
  id: number
  motorSerial: string
  stationCode: string
  componentType: string
  componentSerial: string
  lotNo: string | null
  t: number
  operatorNo: string | null
}

/** Tork controller'ının sıkma sonucu (her joint için bir satır; retry ayrı satırdır) */
export interface TighteningResultRow {
  id: number
  t: number
  motorSerial: string
  stationCode: string
  controllerId: string
  toolId: string
  pset: string
  jointId: string
  targetNm: number
  minNm: number
  maxNm: number
  torqueNm: number
  angleDeg: number
  result: 'OK' | 'NOK'
}

/** OP100 vision kararı */
export interface VisionResultRow {
  id: number
  inspectionId: string
  t: number
  motorSerial: string
  decision: 'OK' | 'NOK' | 'HOLD'
  defectCode: string | null
  defectText: string | null
}

export interface VisionImageRow {
  id: number
  inspectionId: string
  t: number
  viewName: string
  imagePath: string
}

/** Ön montaj sayaçları (dakikada bir; üretim günü başında sıfırlanır) ve supermarket buffer stoğu */
export interface SubassemblyCounterRow {
  id: number
  cellCode: string
  t: number
  producedTotal: number
  nokTotal: number
  bufferQty: number
}

export type RawDeviceType = 'PLC' | 'CONTROLLER' | 'TOOL' | 'CAMERA'

/** Ağ geçidinin yazdığı cihaz bağlantı durumu (dakikada bir) */
export interface DeviceHeartbeatRow {
  id: number
  deviceId: string
  deviceType: RawDeviceType
  stationCode: string
  t: number
  online: boolean
}

/** İstasyon sensör / IO sinyali (sadece değişince yazılır) */
export interface IoSignalRow {
  id: number
  stationCode: string
  signalName: string
  value: boolean
  t: number
}

export interface RawRows {
  MotorRegistry: MotorRegistryRow
  StationEvents: StationEventRow
  OperationEvents: OperationEventRow
  ComponentScans: ComponentScanRow
  TighteningResults: TighteningResultRow
  VisionResults: VisionResultRow
  VisionImages: VisionImageRow
  SubassemblyCounters: SubassemblyCounterRow
  DeviceHeartbeats: DeviceHeartbeatRow
  IoSignals: IoSignalRow
}

export type RawTable = keyof RawRows

/** Aynı zaman damgalı satırların işlenme sırası da budur */
export const RAW_TABLES: RawTable[] = [
  'MotorRegistry',
  'StationEvents',
  'OperationEvents',
  'ComponentScans',
  'TighteningResults',
  'VisionResults',
  'VisionImages',
  'SubassemblyCounters',
  'DeviceHeartbeats',
  'IoSignals',
]

export type RawBatch = { [K in RawTable]: RawRows[K][] }
export type NewRow<K extends RawTable> = Omit<RawRows[K], 'id'>
export type LastIds = Partial<Record<RawTable, number>>

export const emptyBatch = (): RawBatch => Object.fromEntries(RAW_TABLES.map((t) => [t, []])) as unknown as RawBatch

/** Simülatörün yazdığı yer: demoda bellekteki tablolar, sunucuda SQL Server */
export interface RawSink {
  write<K extends RawTable>(table: K, row: NewRow<K>): void
}
