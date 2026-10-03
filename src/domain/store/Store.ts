import type {
  Alarm,
  AlarmEvent,
  Andon,
  AuditEntry,
  ComponentInstall,
  DeviceHealth,
  IoState,
  Motor,
  MotorHold,
  MotorOp,
  Note,
  OpConfirmation,
  QualityImage,
  QualityResult,
  Rework,
  ReworkEvent,
  StationLogin,
  StationSpan,
  SubSample,
  Tightening,
} from '../types'

/** Uygulama veritabanının tabloları. Her satırın birincil anahtarı `id`'dir. */
export interface Tables {
  motor: Motor
  motor_op: MotorOp
  component_install: ComponentInstall
  tightening: Tightening
  quality_result: QualityResult
  quality_image: QualityImage
  station_span: StationSpan
  sub_sample: SubSample
  device: DeviceHealth
  io_state: IoState
  alarm: Alarm
  alarm_event: AlarmEvent
  rework: Rework
  rework_event: ReworkEvent
  motor_hold: MotorHold
  note: Note
  andon: Andon
  audit_log: AuditEntry
  station_login: StationLogin
  op_confirmation: OpConfirmation
}

export type TableName = keyof Tables

/** Sık filtrelenen alanlar: bellek deposunda indeks, SQLite'ta CREATE INDEX olur. */
export const TABLE_INDEXES: { [K in TableName]: (keyof Tables[K])[] } = {
  motor: ['status'],
  motor_op: ['sn', 'op'],
  component_install: ['sn', 'componentSn'],
  tightening: ['sn', 'op'],
  quality_result: ['sn', 'inspectionId'],
  quality_image: ['resultId'],
  station_span: ['op'],
  sub_sample: ['op'],
  device: ['op'],
  io_state: ['op'],
  alarm: ['key', 'op', 'sn'],
  alarm_event: ['alarmId'],
  rework: ['sn', 'state'],
  rework_event: ['reworkId'],
  motor_hold: ['sn'],
  note: ['op'],
  andon: ['op'],
  audit_log: ['entity'],
  station_login: ['op', 'personnelNo'],
  op_confirmation: ['op', 'sn'],
}

export interface Query<T> {
  /** Eşitlik koşulları */
  where?: Partial<T>
  /** Alan bu değerlerden biri */
  in?: { [F in keyof T]?: readonly T[F][] }
  isNull?: (keyof T)[]
  notNull?: (keyof T)[]
  /** Sayısal alan aralığı: gte ≤ alan < lt (alan null ise satır elenir) */
  range?: { field: keyof T; gte?: number; lt?: number }
  /** Metin alanı bu parçayı içerir (büyük / küçük harf duyarsız, ASCII) */
  contains?: { field: keyof T; value: string }
  orderBy?: keyof T
  desc?: boolean
  limit?: number
  offset?: number
}

/**
 * Uygulama veritabanı arayüzü. Senkrondur: bellek deposu (demo, testler) ve node:sqlite
 * (sunucu) aynı arayüzü uygular. Dönen satırlar değiştirilmemelidir; güncelleme `update` ile yapılır
 * (yeni nesne üretir).
 */
export interface Store {
  insert<K extends TableName>(table: K, row: Tables[K]): void
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Tables[K]
  /** Varsa günceller, yoksa ekler */
  upsert<K extends TableName>(table: K, row: Tables[K]): void
  get<K extends TableName>(table: K, id: string): Tables[K] | undefined
  find<K extends TableName>(table: K, q?: Query<Tables[K]>): Tables[K][]
  first<K extends TableName>(table: K, q?: Query<Tables[K]>): Tables[K] | undefined
  count<K extends TableName>(table: K, q?: Query<Tables[K]>): number
  kvGet<T>(key: string): T | null
  kvSet(key: string, value: unknown): void
  /** Adlandırılmış sayaç (alarm ve rework numaraları için) */
  nextSeq(name: string): number
  transaction<T>(fn: () => T): T
}
