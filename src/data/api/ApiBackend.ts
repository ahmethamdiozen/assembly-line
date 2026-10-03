import { defaultMaster } from '@/domain/lineDef'
import type { NoteInput } from '@/domain/notes'
import type { Overview, StationDetail } from '@/domain/overview'
import type { Actor } from '@/domain/rbac'
import type { ReworkFields } from '@/domain/rework'
import type { AlarmDetail, AlarmListView, MotorDetail, MotorSummary, QualityView, TighteningFilter, TighteningView, TimeWindow } from '@/domain/views'
import type { Alarm, Andon, AndonType, MasterData, MotorHold, Note, OpConfirmation, Rework, ReworkState, StationLogin } from '@/domain/types'
import type { IntegrationStatus, LogEntry, LogLevel, MaintenanceView, RawPreview, SystemInfo } from '@/domain/maintenance'
import type { KpiQuery, KpiReport } from '@/domain/reports'
import type { TerminalView } from '@/domain/terminal'
import type { RawTable } from '@/pipeline/rows'
import { BackendError } from '../Backend'
import type { AuthState, Backend, BackendEvent, ConnStatus } from '../Backend'

/**
 * SUNUCU MODU — veri yolu: SQL Server → collector (3–5 dk) → SQLite → bu REST API.
 * Arayüz özet ve ayrıntıları 15 sn'de bir yoklar; veri tazeliği (status) 5 sn'de bir kontrol edilir,
 * yeni collector turu görülünce ekran hemen yenilenir. WebSocket kullanılmaz.
 */

const STATUS_MS = 5000

const tqs = (f: TighteningFilter) =>
  new URLSearchParams(Object.entries({ from: f.from, to: f.to, op: f.op ?? '', result: f.result ?? '', sn: f.sn ?? '' }).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])).toString()
const MIN = 60_000

interface StatusResponse {
  now: number
  watermark: number | null
  intervalMin: number
  lastPullAt: number | null
  lastSuccessAt: number | null
  nextPullAt: number | null
  running: boolean
  error: string | null
}

export class ApiBackend implements Backend {
  readonly kind = 'api' as const
  readonly sim = null
  private masterData: MasterData = defaultMaster()
  private auth: AuthState = 'unknown'
  private actor: Actor | null = null
  private st: StatusResponse | null = null
  private apiError: string | null = null
  private listeners = new Set<(e: BackendEvent) => void>()
  private timers: ReturnType<typeof setInterval>[] = []

  get master(): MasterData {
    return this.masterData
  }

  private async req<T>(method: string, url: string, body?: unknown): Promise<T> {
    let r: Response
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    try {
      r = await fetch(`/api/v1${url}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctrl.signal,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new BackendError('Sunucuya ulaşılamıyor', 0)
    } finally {
      clearTimeout(t)
    }
    const data = (await r.json().catch(() => ({}))) as { error?: string }
    // Proxy / ağ geçidi hatası (API kapalı): gövdede bizim hata mesajımız yoksa bağlantı kopuk sayılır
    if (r.status >= 500 && !data.error) throw new BackendError('Sunucuya ulaşılamıyor', 0)
    if (r.status === 401 && url !== '/auth/login') this.setAnonymous()
    if (!r.ok) throw new BackendError(data.error ?? `${r.status} ${r.statusText}`, r.status)
    return data as T
  }

  private setAnonymous(): void {
    if (this.auth === 'anonymous') return
    this.auth = 'anonymous'
    this.actor = null
    this.emit('auth')
  }

  private emit(e: BackendEvent): void {
    for (const fn of this.listeners) fn(e)
  }

  start(): void {
    if (this.timers.length) return
    void this.checkSession()
    this.timers.push(setInterval(() => void this.pollStatus(), STATUS_MS))
    this.timers.push(setInterval(() => this.emit('clock'), 1000))
  }

  private async checkSession(): Promise<void> {
    try {
      const r = await this.req<{ user: Actor }>('GET', '/auth/me')
      await this.onLogin(r.user)
    } catch (e) {
      if ((e as BackendError).status === 0) {
        this.apiError = (e as Error).message
        this.emit('data')
        setTimeout(() => void this.checkSession(), STATUS_MS)
      } else this.setAnonymous()
    }
  }

  private async onLogin(user: Actor): Promise<void> {
    const m = await this.req<{ master: MasterData }>('GET', '/master')
    this.masterData = m.master
    this.actor = user
    this.auth = 'authenticated'
    await this.pollStatus()
    this.emit('auth')
    this.emit('data')
  }

  private async pollStatus(): Promise<void> {
    if (this.auth !== 'authenticated') return
    try {
      const prev = this.st?.watermark
      this.st = await this.req<StatusResponse>('GET', '/status')
      const wasDown = this.apiError !== null
      this.apiError = null
      if (this.st.watermark !== prev || wasDown) this.emit('data')
    } catch (e) {
      if ((e as BackendError).status === 0) {
        this.apiError = (e as Error).message
        this.emit('data')
      }
    }
  }

  ready(): boolean {
    return this.auth === 'authenticated' && this.st !== null
  }

  now(): number {
    return Date.now()
  }

  status(): ConnStatus {
    const s = this.st
    const intervalMin = s?.intervalMin ?? this.masterData.config.collectIntervalMin
    const base = { watermark: s?.watermark ?? null, lastPullAt: s?.lastPullAt ?? null, nextPullAt: s?.nextPullAt ?? null, intervalMin }
    if (this.apiError) return { ...base, state: 'offline', error: this.apiError }
    if (!s) return { ...base, state: 'connecting', error: null }
    const stale = s.watermark === null || Date.now() - s.watermark > 2 * intervalMin * MIN + MIN
    return { ...base, state: stale ? 'stale' : 'live', error: s.error }
  }

  subscribe(fn: (e: BackendEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  authState(): AuthState {
    return this.auth
  }

  user(): Actor | null {
    return this.actor
  }

  async login(login: string, secret: string): Promise<Actor> {
    const r = await this.req<{ user: Actor }>('POST', '/auth/login', { login, secret })
    await this.onLogin(r.user)
    return r.user
  }

  async logout(): Promise<void> {
    await this.req('POST', '/auth/logout').catch(() => {})
    this.setAnonymous()
  }

  overview(): Promise<Overview> {
    return this.req('GET', '/overview')
  }

  async stationDetail(op: string): Promise<StationDetail | null> {
    try {
      return await this.req<StationDetail>('GET', `/stations/${encodeURIComponent(op)}`)
    } catch (e) {
      if ((e as BackendError).status === 404) return null
      throw e
    }
  }

  private async orNull<T>(url: string): Promise<T | null> {
    try {
      return await this.req<T>('GET', url)
    } catch (e) {
      if ((e as BackendError).status === 404) return null
      throw e
    }
  }

  async searchMotors(q: string): Promise<MotorSummary[]> {
    return (await this.req<{ motors: MotorSummary[] }>('GET', `/motors?q=${encodeURIComponent(q)}`)).motors
  }
  motor(sn: string): Promise<MotorDetail | null> {
    return this.orNull(`/motors/${encodeURIComponent(sn)}`)
  }
  quality(w: TimeWindow): Promise<QualityView> {
    return this.req('GET', `/quality?from=${w.from}&to=${w.to}`)
  }
  alarms(w: TimeWindow): Promise<AlarmListView> {
    return this.req('GET', `/alarms?from=${w.from}&to=${w.to}`)
  }
  alarm(id: string): Promise<AlarmDetail | null> {
    return this.orNull(`/alarms/${encodeURIComponent(id)}`)
  }
  tightening(f: TighteningFilter): Promise<TighteningView> {
    return this.req('GET', `/tightening?${tqs(f)}`)
  }
  async tighteningCsv(f: TighteningFilter): Promise<string> {
    const r = await fetch(`/api/v1/tightening.csv?${tqs(f)}`, { credentials: 'same-origin', cache: 'no-store' })
    if (!r.ok) throw new BackendError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `${r.status}`, r.status)
    return r.text()
  }

  kpiReport(q: KpiQuery): Promise<KpiReport> {
    return this.req('GET', `/kpi?day=${q.day}&shift=${q.shift ?? ''}&op=${q.op ?? ''}`)
  }
  terminal(op: string): Promise<TerminalView | null> {
    return this.orNull(`/terminal/${encodeURIComponent(op)}`)
  }
  maintenance(): Promise<MaintenanceView> {
    return this.req('GET', '/maintenance')
  }
  integration(): Promise<IntegrationStatus> {
    return this.req('GET', '/integration')
  }
  rawPreview(table: RawTable, limit: number): Promise<RawPreview> {
    return this.req('GET', `/integration/raw/${table}?limit=${limit}`)
  }
  async logs(minLevel: LogLevel): Promise<LogEntry[]> {
    return (await this.req<{ entries: LogEntry[] }>('GET', `/system/logs?level=${minLevel}`)).entries
  }
  systemInfo(): Promise<SystemInfo> {
    return this.req('GET', '/system/info')
  }

  private async cmd<T>(method: string, url: string, body?: unknown): Promise<T> {
    const out = await this.req<T>(method, url, body ?? {})
    this.emit('data')
    return out
  }

  addNote(input: Omit<NoteInput, 'author'>): Promise<Note> {
    return this.cmd('POST', '/notes', input)
  }
  ackAlarm(id: string): Promise<Alarm> {
    return this.cmd('POST', `/alarms/${id}/ack`)
  }
  assignAlarm(id: string, assignee: string): Promise<Alarm> {
    return this.cmd('POST', `/alarms/${id}/assign`, { assignee })
  }
  closeAlarm(id: string, note: string | null): Promise<Alarm> {
    return this.cmd('POST', `/alarms/${id}/close`, { note })
  }
  openAndon(input: { op: string; type: AndonType; message?: string; sn?: string | null }): Promise<Andon> {
    return this.cmd('POST', '/andons', input)
  }
  advanceRework(id: string, to: ReworkState, note: string | null, fields?: ReworkFields): Promise<Rework> {
    return this.cmd('POST', `/reworks/${id}/advance`, { to, note, fields })
  }
  updateRework(id: string, fields: ReworkFields): Promise<Rework> {
    return this.cmd('PATCH', `/reworks/${id}`, { fields })
  }
  holdMotor(input: { sn: string; reason: string; op?: string | null }): Promise<MotorHold> {
    return this.cmd('POST', '/holds', input)
  }
  decideHold(id: string, decision: 'release' | 'rework', note: string | null): Promise<{ hold: MotorHold; rework: Rework | null }> {
    return this.cmd('POST', `/holds/${id}/decide`, { decision, note })
  }
  stationLogin(op: string): Promise<StationLogin> {
    return this.cmd('POST', '/terminal/login', { op })
  }
  async stationLogout(): Promise<StationLogin | null> {
    return (await this.cmd<{ login: StationLogin | null }>('POST', '/terminal/logout')).login
  }
  confirmOperation(input: { op: string; sn: string; note?: string | null }): Promise<OpConfirmation> {
    return this.cmd('POST', '/terminal/confirm', input)
  }
  async pullNow(): Promise<void> {
    await this.cmd('POST', '/collector/pull')
    await this.pollStatus()
  }
}
