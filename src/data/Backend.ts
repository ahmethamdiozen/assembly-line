import type { NoteInput } from '@/domain/notes'
import type { Overview, StationDetail } from '@/domain/overview'
import type { Actor, Permission } from '@/domain/rbac'
import type { Alarm, Andon, AndonType, MasterData, MotorHold, Note, Rework, ReworkState } from '@/domain/types'
import type { ReworkFields } from '@/domain/rework'
import type { AlarmDetail, AlarmListView, MotorDetail, MotorSummary, QualityView, TighteningFilter, TighteningView, TimeWindow } from '@/domain/views'
import type { IntegrationStatus, LogEntry, LogLevel, MaintenanceView, RawPreview, SystemInfo } from '@/domain/maintenance'
import type { KpiQuery, KpiReport } from '@/domain/reports'
import type { TerminalView } from '@/domain/terminal'
import type { OpConfirmation, StationLogin } from '@/domain/types'
import type { RawTable } from '@/pipeline/rows'
import type { AuditFilter, ConfigPatch, FeedPatch, PersonInput, RetentionCount, RulePatch, StationPatch } from '@/domain/admin'
import type { BackupInfo, IntegrationTest } from '@/domain/maintenance'
import type { RolePermissions } from '@/domain/rbac'
import type { AuditEntry, Person, RetentionGroup, RoleId, SystemSettings } from '@/domain/types'

/**
 * Arayüzün veri sözleşmesi. Demo modunda DemoBackend (tüm zincir tarayıcıda) uygular;
 * sunucu modunda ApiBackend (REST, 15 sn'de bir yoklama) uygular.
 */

/** connecting: ilk veri bekleniyor · live: veri taze · stale: fabrika verisi gecikiyor · offline: API'ye ulaşılamıyor */
export type ConnState = 'connecting' | 'live' | 'stale' | 'offline'

export interface ConnStatus {
  state: ConnState
  /** Bu ana kadarki fabrika verisi işlendi */
  watermark: number | null
  /** Collector'ın son turu */
  lastPullAt: number | null
  /** Bir sonraki collector turu (tahmini) */
  nextPullAt: number | null
  intervalMin: number
  /** Son hata (API'ye ulaşılamadı ya da collector SQL Server'a bağlanamadı) */
  error: string | null
}

/** Demo / test modunda hat simülasyonu kontrolleri (FAL-005, opsiyonel) */
export interface SimControl {
  state(): { playing: boolean; speed: number }
  play(): void
  pause(): void
  setSpeed(speed: number): void
  /** Simülasyonu baştan kurar (son 24 saat yeniden üretilir) */
  reset(): void
}

export type BackendEvent = 'data' | 'clock' | 'auth'

/** unknown: oturum kontrol ediliyor · anonymous: giriş gerekli · authenticated */
export type AuthState = 'unknown' | 'anonymous' | 'authenticated'

export class BackendError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

/** Kullanıcının kimlik bilgisi durumu (sunucu modu; demoda giriş rol seçerek yapıldığı için yok) */
export interface CredentialInfo {
  rfid: string | null
  active: boolean
  locked: boolean
  failedAttempts: number
  updatedAt: number
}

export interface AdminUser extends Person {
  credential: CredentialInfo | null
}

/**
 * Admin ve konfigürasyon (R-010, R-053–R-058). Ana veriyi değiştiren işlemler bittiğinde
 * `Backend.master` ve izinler güncellenmiş olur.
 */
export interface AdminApi {
  users(): Promise<AdminUser[]>
  createUser(person: PersonInput, pin: string, rfid: string | null): Promise<void>
  updateUser(person: PersonInput): Promise<void>
  setCard(personnelNo: string, rfid: string | null): Promise<void>
  setActive(personnelNo: string, active: boolean): Promise<void>
  resetPin(personnelNo: string, pin: string): Promise<void>
  unlock(personnelNo: string): Promise<void>
  setRolePermissions(role: RoleId, permissions: Permission[]): Promise<void>
  saveConfig(patch: ConfigPatch): Promise<void>
  saveStation(op: string, patch: StationPatch): Promise<void>
  saveFeed(subOp: string, patch: FeedPatch): Promise<void>
  saveRule(code: string, patch: RulePatch): Promise<void>
  saveIntegration(collectIntervalMin: number): Promise<void>
  testIntegration(): Promise<IntegrationTest>
  saveRetention(retention: Record<RetentionGroup, number>): Promise<void>
  retentionPreview(): Promise<RetentionCount[]>
  purge(): Promise<RetentionCount[]>
  saveBackup(backup: SystemSettings['backup']): Promise<void>
  backups(): Promise<BackupInfo[]>
  backupNow(): Promise<{ backup: BackupInfo; pruned: number }>
  audit(f: AuditFilter): Promise<{ entries: AuditEntry[]; total: number }>
  auditCsv(f: AuditFilter): Promise<string>
}

export interface Backend {
  readonly kind: 'demo' | 'api'
  readonly master: MasterData
  /** Rol → izin eşlemesi (admin ekranı) */
  rbac(): RolePermissions
  readonly admin: AdminApi
  readonly sim: SimControl | null
  start(): void
  ready(): boolean
  /** Uygulama saati (demoda simülasyon saati) */
  now(): number
  status(): ConnStatus
  subscribe(fn: (e: BackendEvent) => void): () => void

  // Oturum
  authState(): AuthState
  user(): Actor | null
  login(login: string, secret: string): Promise<Actor>
  /** Sadece demo: rol seçerek giriş */
  loginAs?(personnelNo: string): Promise<Actor>
  logout(): Promise<void>

  // Okuma
  overview(): Promise<Overview>
  stationDetail(op: string): Promise<StationDetail | null>
  searchMotors(q: string): Promise<MotorSummary[]>
  motor(sn: string): Promise<MotorDetail | null>
  quality(w: TimeWindow): Promise<QualityView>
  alarms(w: TimeWindow): Promise<AlarmListView>
  alarm(id: string): Promise<AlarmDetail | null>
  tightening(f: TighteningFilter): Promise<TighteningView>
  /** Filtredeki tüm sıkma kayıtları, Excel'de açılan CSV olarak */
  tighteningCsv(f: TighteningFilter): Promise<string>
  kpiReport(q: KpiQuery): Promise<KpiReport>
  /** Teknisyen terminali: istasyonun aktif görev kartı ve kullanıcının giriş durumu */
  terminal(op: string): Promise<TerminalView | null>
  maintenance(): Promise<MaintenanceView>
  integration(): Promise<IntegrationStatus>
  /** Fabrika tablosunun son satırları (izin: system.view) */
  rawPreview(table: RawTable, limit: number): Promise<RawPreview>
  /** Uygulama logları, en yeni önce (izin: system.view) */
  logs(minLevel: LogLevel): Promise<LogEntry[]>
  systemInfo(): Promise<SystemInfo>

  // Komutlar (yetki kontrolü ve audit kaydıyla)
  addNote(input: Omit<NoteInput, 'author'>): Promise<Note>
  ackAlarm(id: string): Promise<Alarm>
  assignAlarm(id: string, assignee: string): Promise<Alarm>
  closeAlarm(id: string, note: string | null): Promise<Alarm>
  openAndon(input: { op: string; type: AndonType; message?: string; sn?: string | null }): Promise<Andon>
  advanceRework(id: string, to: ReworkState, note: string | null, fields?: ReworkFields): Promise<Rework>
  updateRework(id: string, fields: ReworkFields): Promise<Rework>
  holdMotor(input: { sn: string; reason: string; op?: string | null }): Promise<MotorHold>
  decideHold(id: string, decision: 'release' | 'rework', note: string | null): Promise<{ hold: MotorHold; rework: Rework | null }>
  stationLogin(op: string): Promise<StationLogin>
  stationLogout(): Promise<StationLogin | null>
  confirmOperation(input: { op: string; sn: string; note?: string | null }): Promise<OpConfirmation>
  /** Collector'ı beklemeden bir tur çalıştırır ("Şimdi çek") */
  pullNow(): Promise<void>
}

export function can(b: Backend, p: Permission): boolean {
  return !!b.user()?.permissions.includes(p)
}
