/**
 * Alan tipleri. Ana veri (istasyonlar, komponentler, kurallar) admin tarafından yönetilir;
 * üretim kayıtlarını collector fabrikanın SQL Server'ından türetir; alarm / rework / not gibi
 * kayıtları uygulama yazar. Tüm zamanlar epoch ms (UTC); tüm kayıtların benzersiz `id`'si vardır (R-064).
 */
import type { Shift } from './shifts'

// ---------------------------------------------------------------- ana veri

/** auto: tam otomatik · robot: robot hücresi · manual: insanlı */
export type StationType = 'auto' | 'robot' | 'manual'

export const STATION_TYPE_LABEL: Record<StationType, string> = {
  auto: 'Tam otomatik',
  robot: 'Robot',
  manual: 'İnsanlı',
}

/** Tork kullanılan istasyonun sıkma tanımı (Desoutter Pset) */
export interface TighteningSpec {
  pset: string
  joints: string[]
  targetNm: number
  /** ± tolerans */
  tolNm: number
  /** Tipik son açı (°) */
  angleDeg: number
  controllerId: string
  toolId: string
}

export interface Station {
  /** OP kodu, ör. "OP010" */
  op: string
  name: string
  line: 'main' | 'sub'
  /** Hattaki sıra (1'den başlar) */
  seq: number
  type: StationType
  targetCycleSec: number
  plcId: string
  cellId: string
  tool: string
  recipe: string
  checklist: string[]
  /** Sensör / IO sinyal adları */
  signals: string[]
  tightening: TighteningSpec | null
}

/** URS §7'deki 7 seri numaralı komponent */
export type ComponentCode = 'GKS' | 'MBL' | 'KRK' | 'PCS' | 'KBL' | 'ALT' | 'MRS'

export interface ComponentType {
  code: ComponentCode
  name: string
  /** Takıldığı ana hat operasyonu */
  installOp: string
  category: string
}

/** Ön montaj hücresi → ana hat besleme ilişkisi (R-019, R-055) */
export interface SubFeed {
  subOp: string
  mainOp: string
  kit: string
  bufferMin: number
  bufferMax: number
  dailyTarget: number
}

export interface LineConfig {
  taktSec: number
  /** Çalışma süresi takt'ın bu oranını geçince istasyon "Warning / Takt riski" olur */
  warnRatio: number
  /** Çevrim süresi takt'ın bu oranını geçince alarm üretilir */
  alarmRatio: number
  /** Bu süre heartbeat gelmezse cihaz offline sayılır */
  heartbeatTimeoutSec: number
  collectIntervalMin: number
  /** Üretim günü başlangıç saati (sayaçlar sıfırlanır) */
  dayStartHour: number
  shifts: Shift[]
  variant: string
}

export type Team = 'Kalite Ekibi' | 'Bakım Ekibi' | 'Üretim Lideri' | 'Otomasyon' | 'Lojistik'
export const TEAMS: Team[] = ['Kalite Ekibi', 'Bakım Ekibi', 'Üretim Lideri', 'Otomasyon', 'Lojistik']

/** URS §3 rolleri */
export type RoleId = 'technician' | 'supervisor' | 'quality' | 'maintenance' | 'admin'

export const ROLE_LABEL: Record<RoleId, string> = {
  technician: 'Teknisyen',
  supervisor: 'Üretim Lideri / Supervisor',
  quality: 'Kalite',
  maintenance: 'Bakım / Otomasyon',
  admin: 'Admin',
}

export interface Person {
  personnelNo: string
  name: string
  role: RoleId
  /** Vardiya ve istasyon ataması (teknisyenler için) */
  shift: Shift['id'] | null
  station: string | null
  qualifications: string[]
  /** Pasif kullanıcı giriş yapamaz; kayıtlarda adı kalır (tanımsızsa aktif) */
  active?: boolean
}

export type Severity = 'critical' | 'warning' | 'info'
export type AlarmSource = 'PLC' | 'Cycle' | 'Torque' | 'Vision' | 'Material' | 'Operator' | 'System'

export interface AlarmRule {
  code: string
  name: string
  source: AlarmSource
  severity: Severity
  /** "Detected" durumunda bu süre kalırsa eskale olur */
  escalationMin: number
  team: Team
  enabled: boolean
}

export type FaultCategory = 'assembly' | 'sealing' | 'fastening' | 'process' | 'electrical'

export const FAULT_CATEGORY_LABEL: Record<FaultCategory, string> = {
  assembly: 'Montaj / Yönelim',
  sealing: 'Sızdırmazlık',
  fastening: 'Bağlantı / Tork',
  process: 'Proses / Doğrulama',
  electrical: 'Elektrik / Routing',
}

export type Priority = 'high' | 'medium' | 'low'
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' }

/** OP100 vision hata kodu kataloğu: kaynak operasyon ve kategori rework kaydına buradan gelir */
export interface DefectDef {
  code: string
  text: string
  decision: 'NOK' | 'HOLD'
  sourceOp: string
  category: FaultCategory
  priority: Priority
}

/** PLC arıza kodu kataloğu */
export interface FaultCodeDef {
  code: string
  text: string
}

/** Veri saklama grupları (R-010): her grup kendi süresiyle temizlenir */
export type RetentionGroup = 'trace' | 'tightening' | 'images' | 'events' | 'alarms' | 'audit'

export interface SystemSettings {
  /** Grup başına saklama süresi (gün) */
  retention: Record<RetentionGroup, number>
  /** Otomatik yedek (sunucu modu): her gün `hour`'da, son `keep` yedek tutulur */
  backup: { enabled: boolean; hour: number; keep: number }
}

export interface MasterData {
  config: LineConfig
  settings: SystemSettings
  /** Ana hat (seq sırasıyla) + ön montaj */
  stations: Station[]
  subFeeds: SubFeed[]
  components: ComponentType[]
  rules: AlarmRule[]
  defects: DefectDef[]
  faultCodes: FaultCodeDef[]
  people: Person[]
}

// ---------------------------------------------------------------- üretim kayıtları (collector yazar)

export type MotorStatus = 'in_line' | 'hold' | 'rework' | 'completed'

export const MOTOR_STATUS_LABEL: Record<MotorStatus, string> = {
  in_line: 'Hatta',
  hold: 'HOLD',
  rework: 'Rework',
  completed: 'Tamamlandı',
}

export interface Motor {
  /** Motor seri numarası */
  id: string
  workOrder: string | null
  variant: string | null
  createdAt: number
  status: MotorStatus
  /** Motorun bulunduğu (son başladığı) ana hat istasyonu; hattan çıktıysa null */
  currentOp: string | null
  /** OP100'den ilk denemede OK geçti mi (henüz gelmediyse null) */
  firstPassOk: boolean | null
  completedAt: number | null
}

export type OpResult = 'OK' | 'NOK'

/** Bir motorun bir istasyondaki bir operasyonu (giriş / çıkış / cycle / teknisyen / sonuç, R-031) */
export interface MotorOp {
  id: string
  sn: string
  op: string
  start: number
  end: number | null
  cycleSec: number | null
  operatorNo: string | null
  result: OpResult | null
  /** Aynı istasyondaki kaçıncı deneme (re-QC'de OP100 için 2, 3…) */
  attempt: number
}

export interface ComponentInstall {
  id: string
  sn: string
  type: ComponentCode
  componentSn: string
  lot: string | null
  op: string
  t: number
  operatorNo: string | null
  /** Rework'te sökülüp yenisi takıldıysa */
  replacedAt: number | null
}

export interface Tightening {
  id: string
  t: number
  sn: string
  op: string
  controllerId: string
  toolId: string
  pset: string
  joint: string
  targetNm: number
  minNm: number
  maxNm: number
  torqueNm: number
  angleDeg: number
  result: OpResult
}

export type QualityDecision = 'OK' | 'NOK' | 'HOLD'

export interface QualityResult {
  id: string
  sn: string
  t: number
  decision: QualityDecision
  defectCode: string | null
  defectText: string | null
  /** Motorun kaçıncı OP100 muayenesi */
  attempt: number
  inspectionId: string
}

export interface QualityImage {
  id: string
  resultId: string
  sn: string
  t: number
  view: string
  path: string
}

/** PLC'nin bildirdiği istasyon durumu */
export type PlcState = 'running' | 'starved' | 'blocked' | 'fault' | 'stopped'

export interface StationSpan {
  id: string
  op: string
  start: number
  end: number | null
  state: PlcState
  code: string | null
  text: string | null
}

export interface SubSample {
  id: string
  op: string
  t: number
  /** Üretim günü başından beri (sayaç sıfırlanır) */
  producedTotal: number
  nokTotal: number
  bufferQty: number
}

export type DeviceType = 'plc' | 'controller' | 'tool' | 'camera'

export interface DeviceHealth {
  /** Cihaz kimliği */
  id: string
  type: DeviceType
  op: string
  lastT: number
  online: boolean
  lastOnlineT: number | null
}

export interface IoState {
  /** "OP010|Fikstür kilidi" */
  id: string
  op: string
  signal: string
  value: boolean
  t: number
}

// ---------------------------------------------------------------- uygulama kayıtları

/** Alarm yaşam döngüsü (R-038): Detected → Acknowledged → Assigned → Closed */
export type AlarmStatus = 'detected' | 'acknowledged' | 'assigned' | 'closed'

export const ALARM_STATUS_LABEL: Record<AlarmStatus, string> = {
  detected: 'Detected',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  closed: 'Closed',
}

export interface Alarm {
  id: string
  /** Aynı koşul için tekrar alarm açılmaması için anahtar; koşul sürdükçe (clearedAt null) tektir */
  key: string | null
  code: string
  source: AlarmSource
  severity: Severity
  op: string | null
  sn: string | null
  message: string
  t: number
  /** Alarmı doğuran koşulun bittiği an (yaşam döngüsünden bağımsız) */
  clearedAt: number | null
  status: AlarmStatus
  team: Team
  assignee: string | null
  ackBy: string | null
  ackAt: number | null
  assignedAt: number | null
  closedBy: string | null
  closedAt: number | null
  closeNote: string | null
  escalatedAt: number | null
}

export type AlarmAction = 'detected' | 'acknowledged' | 'assigned' | 'closed' | 'cleared' | 'escalated'

export interface AlarmEvent {
  id: string
  alarmId: string
  t: number
  action: AlarmAction
  /** Kullanıcı adı; sistem aksiyonunda null */
  by: string | null
  detail: string | null
}

/** Rework akışı (R-035): Triage → Diagnosis → Rework Bench → Ready for Re-QC → (OP100) → kapandı */
export type ReworkState = 'triage' | 'diagnosis' | 'bench' | 'ready' | 'reqc' | 'closed'

export const REWORK_STATE_LABEL: Record<ReworkState, string> = {
  triage: 'Incoming Triage',
  diagnosis: 'Diagnosis',
  bench: 'Rework Bench',
  ready: 'Ready for Re-QC',
  reqc: 'Re-QC (OP100)',
  closed: 'Kapandı',
}

export interface Rework {
  id: string
  sn: string
  qualityResultId: string
  sourceOp: string
  category: FaultCategory
  defectCode: string | null
  defect: string
  rootCause: string | null
  priority: Priority
  team: Team
  reworkOperator: string | null
  state: ReworkState
  openedAt: number
  closedAt: number | null
  /** Kaçıncı rework turu (re-QC'de tekrar NOK olursa artar) */
  attempt: number
  /** Bu rework'ü doğuran vision alarmının anahtarı */
  alarmKey: string | null
}

export interface ReworkEvent {
  id: string
  reworkId: string
  t: number
  from: ReworkState | null
  to: ReworkState
  by: string | null
  note: string | null
}

export interface MotorHold {
  id: string
  sn: string
  t: number
  source: 'vision' | 'user'
  reason: string
  op: string | null
  by: string | null
  releasedAt: number | null
  releasedBy: string | null
  resolution: string | null
  alarmKey: string | null
}

export type NoteType = 'info' | 'warning' | 'error'

/** Teknisyen notu (R-025) */
export interface Note {
  id: string
  t: number
  op: string
  type: NoteType
  text: string
  author: string
  sn: string | null
  /** İlişkili alarm */
  alarmId: string | null
  /** İlişkili konu (alarm yoksa serbest metin) */
  topic: string | null
}

export type AndonType = 'material' | 'quality' | 'production'

export const ANDON_TYPE_LABEL: Record<AndonType, string> = {
  material: 'Malzeme',
  quality: 'Kalite desteği',
  production: 'Üretim desteği',
}

/** Andon çağrısı (R-040); her Andon bir alarm kaydı da açar */
export interface Andon {
  id: string
  t: number
  op: string
  type: AndonType
  message: string
  by: string
  alarmId: string
}

/**
 * Teknisyenin istasyon / vardiya girişi (R-050). Giriş, istasyonun gerektirdiği yetkinlikler
 * kontrol edilerek yapılır (R-052); vardiya bitince ya da başka giriş yapılınca kapanır.
 */
export interface StationLogin {
  id: string
  op: string
  personnelNo: string
  name: string
  shiftId: string
  loginAt: number
  logoutAt: number | null
  /** Vardiya planında bu istasyona atanan kişi mi (değilse yedek / takviye) */
  rosterMatch: boolean
}

/** Teknisyenin "operasyonu tamamla" onayı (R-006). Fiziksel bitiş PLC verisinden gelir. */
export interface OpConfirmation {
  id: string
  t: number
  op: string
  sn: string
  personnelNo: string
  name: string
  note: string | null
}

/** Audit kaydı (R-058) */
export interface AuditEntry {
  id: string
  t: number
  user: string
  action: string
  entity: string
  entityId: string | null
  before: string | null
  after: string | null
}
