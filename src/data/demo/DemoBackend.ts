import { ackAlarm, advanceReworkBy, assignAlarmTo, closeAlarmBy, createNote, decideHold, holdMotor, openAndon, updateReworkBy } from '@/domain/commands'
import type { CommandContext } from '@/domain/commands'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import type { NoteInput } from '@/domain/notes'
import { buildOverview, stationDetail } from '@/domain/overview'
import type { Overview, StationDetail } from '@/domain/overview'
import { requirePermission } from '@/domain/rbac'
import type { Actor, Permission, RolePermissions } from '@/domain/rbac'
import {
  AUDIT_LIMIT_MAX,
  applyRetention,
  auditCsv,
  auditQuery,
  createPerson,
  loadMaster,
  loadRbac,
  purgeExpired,
  setPersonActive,
  setRolePermissions,
  updateAlarmRule,
  updateBackup,
  updateIntegration,
  updateLineConfig,
  updatePerson,
  updateRetention,
  updateStation,
  updateSubFeed,
} from '@/domain/admin'
import type { AuditFilter, ConfigPatch, FeedPatch, PersonInput, RulePatch, StationPatch } from '@/domain/admin'
import type { RetentionGroup, RoleId, SystemSettings } from '@/domain/types'
import type { ReworkFields } from '@/domain/rework'
import { MemoryStore } from '@/domain/store/MemoryStore'
import { tighteningCsv } from '@/domain/exports'
import { alarmDetail, alarmList, motorDetail, qualityView, searchMotors, tighteningRows, tighteningView } from '@/domain/views'
import type { AlarmDetail, AlarmListView, MotorDetail, MotorSummary, QualityView, TighteningFilter, TighteningView, TimeWindow } from '@/domain/views'
import type { AndonType, Note, ReworkState } from '@/domain/types'
import { maintenanceView, tableCounts } from '@/domain/maintenance'
import type { CollectorRun, IntegrationStatus, LogEntry, LogLevel, MaintenanceView, RawPreview, SystemInfo } from '@/domain/maintenance'
import { kpiReport } from '@/domain/reports'
import type { KpiQuery, KpiReport } from '@/domain/reports'
import { confirmOperation, stationLogin, stationLogout, terminalView } from '@/domain/terminal'
import type { TerminalView } from '@/domain/terminal'
import { TABLE_INDEXES } from '@/domain/store/Store'
import type { TableName } from '@/domain/store/Store'
import { APP_VERSION } from '@/lib/version'
import { RAW_TABLES } from '@/pipeline/rows'
import type { LastIds, RawTable } from '@/pipeline/rows'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'
import { runDemoActors, seedDemoAndons } from '@/sim/demoActors'
import { BackendError } from '../Backend'
import type { AdminApi, AuthState, Backend, BackendEvent, ConnStatus, SimControl } from '../Backend'

/**
 * DEMO MODU — kurulum gerektirmeyen web sürümü. Gerçek sistemde ayrı süreçlerde çalışan zincirin
 * aynısı tarayıcıda çalışır:
 *   LineSim (fabrika) → RawDb ("SQL Server" tabloları) → applyCollected (collector, çekme aralığıyla) → MemoryStore
 * Komutlar sunucudakiyle aynı yetki kontrolü ve audit kaydından geçer; giriş rol seçilerek yapılır.
 * Demo personeli (src/sim/demoActors.ts) koşulu bitmiş eski alarmları vardiya gibi onaylayıp kapatır.
 * Saat simülasyon saatidir; hız kontrolüyle hızlandırılabilir (collector turları da hızlanır).
 */

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const USER_KEY = 'tm50-demo-user'

export class DemoBackend implements Backend {
  readonly kind = 'demo' as const
  private masterData = defaultMaster()
  private ix = indexMaster(this.masterData)
  private store = new MemoryStore()
  private db = new RawDb()
  private lineSim: LineSim | null = null
  private simNow = Date.now()
  private lastPull: number | null = null
  private isReady = false
  private playing = true
  private speed = 1
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<(e: BackendEvent) => void>()
  private actor: Actor | null = null
  private runs: CollectorRun[] = []
  private logRing: LogEntry[] = []
  private bootedAt = Date.now()

  readonly sim: SimControl
  readonly admin: AdminApi

  get master() {
    return this.masterData
  }

  rbac(): RolePermissions {
    return loadRbac(this.store)
  }

  /** Admin değişikliğinden sonra ana veri, indeks ve oturumdaki kullanıcının izinleri yenilenir */
  private reloadMaster(): void {
    this.masterData = loadMaster(this.store)
    this.ix = indexMaster(this.masterData)
    if (this.actor) this.actor = this.actorOf(this.actor.id)
  }

  constructor() {
    this.admin = this.makeAdmin()
    this.sim = {
      state: () => ({ playing: this.playing, speed: this.speed }),
      play: () => {
        this.playing = true
        this.emit('clock')
      },
      pause: () => {
        this.playing = false
        this.emit('clock')
      },
      setSpeed: (s) => {
        this.speed = s
        this.emit('clock')
      },
      reset: () => this.boot(),
    }
    try {
      const no = sessionStorage.getItem(USER_KEY)
      if (no) this.actor = this.actorOf(no)
    } catch {
      /* oturum belleği yoksa giriş ekranı açılır */
    }
  }

  private get intervalMs(): number {
    return this.master.config.collectIntervalMin * MIN
  }

  start(): void {
    if (this.timer) return
    this.boot()
    this.timer = setInterval(() => this.tick(), SEC)
  }

  /** Simülasyonu kurar: son 24 saat üretilir ve tek turda okunur */
  private boot(): void {
    this.isReady = false
    this.emit('data')
    setTimeout(() => {
      const t0 = Date.now()
      this.store = new MemoryStore()
      this.reloadMaster()
      this.db = new RawDb()
      this.runs = []
      this.logRing = []
      this.lineSim = new LineSim({ t0 })
      this.simNow = this.lineSim.t0
      this.bootedAt = this.simNow
      this.lineSim.advance(this.simNow, this.db)
      this.pull()
      seedDemoAndons(this.store, this.ix, this.simNow)
      this.isReady = true
      this.emit('data')
    }, 30)
  }

  private tick(): void {
    if (!this.isReady || !this.lineSim || !this.playing) return
    this.simNow += SEC * this.speed
    this.lineSim.advance(this.simNow, this.db)
    if (this.lastPull === null || this.simNow - this.lastPull >= this.intervalMs) this.pull()
    else this.emit('clock')
  }

  private pull(): void {
    const started = performance.now()
    const res = applyCollected(this.store, this.ix, this.db.since(this.store.kvGet('sync') ?? {}), this.simNow)
    const run: CollectorRun = { at: this.simNow, ok: true, rows: res.rows, perTable: res.perTable, durationMs: Math.round(performance.now() - started), error: null }
    this.runs = [run, ...this.runs].slice(0, 50)
    this.log('info', 'collector', `${res.rows} satır işlendi (${run.durationMs} ms)`)
    runDemoActors(this.store, this.ix, this.simNow)
    this.lastPull = this.simNow
    this.db.trimBefore(this.simNow - 26 * HOUR)
    this.emit('data')
  }

  private log(level: LogLevel, scope: string, msg: string, detail: string | null = null): void {
    this.logRing = [{ t: this.simNow, level, scope, msg, detail }, ...this.logRing].slice(0, 300)
  }

  private emit(e: BackendEvent): void {
    for (const fn of this.listeners) fn(e)
  }

  ready(): boolean {
    return this.isReady
  }

  now(): number {
    return this.simNow
  }

  status(): ConnStatus {
    const watermark = this.isReady ? this.store.kvGet<number>('watermark') : null
    const stale = watermark !== null && this.simNow - watermark > 2 * this.intervalMs + MIN
    return {
      state: !this.isReady ? 'connecting' : stale ? 'stale' : 'live',
      watermark,
      lastPullAt: this.lastPull,
      nextPullAt: this.lastPull === null ? null : this.lastPull + this.intervalMs,
      intervalMin: this.master.config.collectIntervalMin,
      error: null,
    }
  }

  subscribe(fn: (e: BackendEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  // ---------------------------------------------------------------- oturum (demo: rol seçerek)

  private actorOf(personnelNo: string): Actor | null {
    const p = this.masterData.people.find((x) => x.personnelNo === personnelNo)
    return p && p.active !== false ? { id: p.personnelNo, name: p.name, role: p.role, permissions: loadRbac(this.store)[p.role] ?? [] } : null
  }

  authState(): AuthState {
    return this.actor ? 'authenticated' : 'anonymous'
  }

  user(): Actor | null {
    return this.actor
  }

  async login(): Promise<Actor> {
    throw new BackendError('Demo modunda rol seçerek giriş yapılır')
  }

  async loginAs(personnelNo: string): Promise<Actor> {
    const a = this.actorOf(personnelNo)
    if (!a) throw new BackendError('Kullanıcı bulunamadı')
    this.actor = a
    try {
      sessionStorage.setItem(USER_KEY, personnelNo)
    } catch {
      /* yoksay */
    }
    this.emit('auth')
    return a
  }

  async logout(): Promise<void> {
    this.actor = null
    try {
      sessionStorage.removeItem(USER_KEY)
    } catch {
      /* yoksay */
    }
    this.emit('auth')
  }

  // ---------------------------------------------------------------- okuma

  async overview(): Promise<Overview> {
    return buildOverview(this.store, this.ix, this.simNow)
  }

  async stationDetail(op: string): Promise<StationDetail | null> {
    return stationDetail(this.store, this.ix, op, this.simNow)
  }

  async searchMotors(q: string): Promise<MotorSummary[]> {
    return searchMotors(this.store, q)
  }

  async motor(sn: string): Promise<MotorDetail | null> {
    return motorDetail(this.store, this.ix, sn)
  }

  async quality(w: TimeWindow): Promise<QualityView> {
    return qualityView(this.store, w)
  }

  async alarms(w: TimeWindow): Promise<AlarmListView> {
    return alarmList(this.store, w)
  }

  async alarm(id: string): Promise<AlarmDetail | null> {
    return alarmDetail(this.store, id)
  }

  async tightening(f: TighteningFilter): Promise<TighteningView> {
    return tighteningView(this.store, this.ix, f)
  }

  async tighteningCsv(f: TighteningFilter): Promise<string> {
    return tighteningCsv(tighteningRows(this.store, f))
  }

  async kpiReport(q: KpiQuery): Promise<KpiReport> {
    return kpiReport(this.store, this.ix, q, this.simNow)
  }

  async terminal(op: string): Promise<TerminalView | null> {
    return terminalView(this.store, this.ix, op, this.simNow, this.actor?.id ?? null)
  }

  async maintenance(): Promise<MaintenanceView> {
    return maintenanceView(this.store, this.ix, this.simNow)
  }

  async integration(): Promise<IntegrationStatus> {
    const sync = this.store.kvGet<LastIds>('sync') ?? {}
    const s = this.status()
    return {
      mode: 'demo',
      source: 'Tarayıcı içi fabrika simülasyonu (demo)',
      intervalMin: s.intervalMin,
      running: false,
      lastRun: this.runs[0] ?? null,
      lastSuccessAt: this.runs.find((r) => r.ok)?.at ?? null,
      nextRunAt: s.nextPullAt,
      watermark: s.watermark,
      runs: this.runs,
      readPosition: RAW_TABLES.map((table) => ({ table, lastId: sync[table] ?? 0 })),
    }
  }

  private requireView(): void {
    if (!this.actor) throw new BackendError('Oturum açılmamış', 401)
    try {
      requirePermission(this.actor, 'system.view')
    } catch (e) {
      throw new BackendError((e as Error).message, 403)
    }
  }

  async rawPreview(table: RawTable, limit: number): Promise<RawPreview> {
    this.requireView()
    const rows = (this.db.tables[table] as unknown as Record<string, unknown>[]).slice(-limit).reverse()
    return { table, columns: rows.length ? Object.keys(rows[0]) : [], rows }
  }

  async logs(minLevel: LogLevel): Promise<LogEntry[]> {
    this.requireView()
    const rank = { info: 0, warn: 1, error: 2 }
    return this.logRing.filter((l) => rank[l.level] >= rank[minLevel])
  }

  async systemInfo(): Promise<SystemInfo> {
    this.requireView()
    return {
      mode: 'demo',
      appDb: { kind: 'Bellek (tarayıcı sekmesi)', path: null, sizeBytes: null, schemaVersion: null },
      rows: tableCounts(this.store, Object.keys(TABLE_INDEXES) as TableName[]),
      backups: [],
      logFile: null,
      startedAt: this.bootedAt,
      version: APP_VERSION,
    }
  }

  // ---------------------------------------------------------------- komutlar

  private run<T>(fn: (c: CommandContext) => T): Promise<T> {
    if (!this.actor) return Promise.reject(new BackendError('Oturum açılmamış', 401))
    try {
      const out = fn({ store: this.store, ix: this.ix, actor: this.actor, now: this.simNow })
      this.emit('data')
      return Promise.resolve(out)
    } catch (e) {
      this.log('warn', 'komut', (e as Error).message, this.actor.name)
      // Engellenen deneme de audit'e yazılmış olabilir (ör. yetkinlik kontrolü)
      this.emit('data')
      return Promise.reject(new BackendError((e as Error).message, 400))
    }
  }

  addNote(input: Omit<NoteInput, 'author'>): Promise<Note> {
    return this.run((c) => createNote(c, input))
  }
  ackAlarm(id: string) {
    return this.run((c) => ackAlarm(c, id))
  }
  assignAlarm(id: string, assignee: string) {
    return this.run((c) => assignAlarmTo(c, id, assignee))
  }
  closeAlarm(id: string, note: string | null) {
    return this.run((c) => closeAlarmBy(c, id, note))
  }
  openAndon(input: { op: string; type: AndonType; message?: string; sn?: string | null }) {
    return this.run((c) => openAndon(c, input))
  }
  advanceRework(id: string, to: ReworkState, note: string | null, fields?: ReworkFields) {
    return this.run((c) => advanceReworkBy(c, id, to, note, fields))
  }
  updateRework(id: string, fields: ReworkFields) {
    return this.run((c) => updateReworkBy(c, id, fields))
  }
  holdMotor(input: { sn: string; reason: string; op?: string | null }) {
    return this.run((c) => holdMotor(c, input))
  }
  decideHold(id: string, decision: 'release' | 'rework', note: string | null) {
    return this.run((c) => decideHold(c, id, decision, note))
  }
  stationLogin(op: string) {
    return this.run((c) => stationLogin(c, op))
  }
  stationLogout() {
    return this.run((c) => stationLogout(c))
  }
  confirmOperation(input: { op: string; sn: string; note?: string | null }) {
    return this.run((c) => confirmOperation(c, input))
  }
  // ---------------------------------------------------------------- admin (demo: değişiklikler bu sekmede kalır)

  private makeAdmin(): AdminApi {
    const change = (fn: (c: CommandContext) => unknown) =>
      this.run(fn).then(() => {
        this.reloadMaster()
        this.emit('auth')
        this.emit('data')
      })
    const view = <T>(p: Permission, fn: () => T): Promise<T> => {
      if (!this.actor) return Promise.reject(new BackendError('Oturum açılmamış', 401))
      if (!this.actor.permissions.includes(p)) return Promise.reject(new BackendError('Bu işlem için yetkiniz yok', 403))
      return Promise.resolve(fn())
    }
    const serverOnly = (what: string) => Promise.reject(new BackendError(`Demoda ${what} yok; giriş rol seçerek yapılır. Sunucu modunda çalışır.`, 400))
    return {
      users: () => view('admin.users', () => this.masterData.people.map((p) => ({ ...p, credential: null }))),
      createUser: (person: PersonInput) => change((c) => createPerson(c, person)),
      updateUser: (person: PersonInput) => change((c) => updatePerson(c, person)),
      setCard: () => serverOnly('kart tanımı'),
      setActive: (no: string, active: boolean) => change((c) => setPersonActive(c, no, active)),
      resetPin: () => serverOnly('PIN'),
      unlock: () => serverOnly('giriş kilidi'),
      setRolePermissions: (role: RoleId, perms: Permission[]) => change((c) => setRolePermissions(c, role, perms)),
      saveConfig: (patch: ConfigPatch) => change((c) => updateLineConfig(c, patch)),
      saveStation: (op: string, patch: StationPatch) => change((c) => updateStation(c, op, patch)),
      saveFeed: (subOp: string, patch: FeedPatch) => change((c) => updateSubFeed(c, subOp, patch)),
      saveRule: (code: string, patch: RulePatch) => change((c) => updateAlarmRule(c, code, patch)),
      saveIntegration: (min: number) => change((c) => updateIntegration(c, { collectIntervalMin: min })),
      testIntegration: () => view('admin.integration', () => ({ ok: true, ms: 0, error: null, maxIds: this.db.lastIds() })),
      saveRetention: (r: Record<RetentionGroup, number>) => change((c) => updateRetention(c, r)),
      retentionPreview: () => view('admin.retention', () => applyRetention(this.store, this.masterData.settings, this.simNow, true)),
      purge: () => this.run((c) => purgeExpired(c)),
      saveBackup: (b: SystemSettings['backup']) => change((c) => updateBackup(c, b)),
      backups: () => view('admin.retention', () => []),
      backupNow: () => serverOnly('yedek'),
      audit: (f: AuditFilter) => view('audit.view', () => auditQuery(this.store, { ...f, limit: Math.min(AUDIT_LIMIT_MAX, f.limit ?? 200) })),
      auditCsv: (f: AuditFilter) => view('audit.view', () => auditCsv(auditQuery(this.store, { ...f, limit: Number.MAX_SAFE_INTEGER }).entries)),
    }
  }

  async pullNow(): Promise<void> {
    if (!this.actor) throw new BackendError('Oturum açılmamış', 401)
    requirePermission(this.actor, 'integration.pull')
    if (this.isReady) this.pull()
  }
}
