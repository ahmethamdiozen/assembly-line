import Fastify, { LogController } from 'fastify'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AlarmTransitionError } from '@/domain/alarms'
import { CommandError, ackAlarm, advanceReworkBy, assignAlarmTo, audit, closeAlarmBy, createNote, decideHold, holdMotor, openAndon, updateReworkBy } from '@/domain/commands'
import type { CommandContext } from '@/domain/commands'
import type { MasterIndex } from '@/domain/lineDef'
import { NoteError } from '@/domain/notes'
import { buildOverview, stationDetail } from '@/domain/overview'
import { ForbiddenError, requirePermission } from '@/domain/rbac'
import type { Actor, RolePermissions } from '@/domain/rbac'
import { ReworkTransitionError } from '@/domain/rework'
import type { Store } from '@/domain/store/Store'
import { tighteningCsv, tighteningCsvName } from '@/domain/exports'
import { alarmDetail, alarmList, motorDetail, qualityView, searchMotors, tighteningRows, tighteningView } from '@/domain/views'
import type { TighteningFilter, TimeWindow } from '@/domain/views'
import { maintenanceView } from '@/domain/maintenance'
import type { BackupInfo, IntegrationStatus, IntegrationTest, LogEntry, LogLevel, RawPreview, SystemInfo } from '@/domain/maintenance'
import { masterRev } from '@/domain/admin'
import { kpiReport } from '@/domain/reports'
import { confirmOperation, stationLogin, stationLogout, terminalView } from '@/domain/terminal'
import { RAW_TABLES } from '@/pipeline/rows'
import type { LastIds, RawTable } from '@/pipeline/rows'
import type { AndonType, MasterData, NoteType, ReworkState } from '@/domain/types'
import { Auth, AuthError, CredentialError } from '../auth/auth'
import { HttpError, body, oneOf, optStr, str } from './http'
import type { Body } from './http'
import { registerAdmin } from './admin'
import type { Collector } from '../collector/Collector'

/**
 * REST / JSON API (R-065; uç noktalar docs/api.md'de). Arayüz bu API'yi 15 sn'de bir yoklar;
 * WebSocket kullanılmaz. Komutlar src/domain/commands.ts üzerinden yetki kontrolü ve audit kaydıyla çalışır.
 */

export const SESSION_COOKIE = 'tm50_session'

export interface AppDeps {
  store: Store
  master: () => MasterData
  ix: () => MasterIndex
  rbac: () => RolePermissions
  auth: Auth
  collector: Pick<Collector, 'status' | 'trigger' | 'runs'> | null
  /** Bakım ekranı için sistem bilgisi, ham fabrika tabloları ve loglar */
  system: {
    source: string
    preview(table: RawTable, limit: number): Promise<RawPreview>
    logs(minLevel: LogLevel): LogEntry[]
    info(): SystemInfo
  }
  /** Ana veri ya da izinler değişince (admin) çağrılır: indeks ve collector aralığı yenilenir */
  onMasterChange: () => void
  backups: { list(): BackupInfo[]; create(now: number): BackupInfo; prune(keep: number): number } | null
  integrationTest: () => Promise<IntegrationTest>
  now?: () => number
  secureCookies?: boolean
  logger?: boolean | { level: string; file?: string }
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null
  }
}

function cookieOf(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const now = deps.now ?? Date.now
  // Her isteği loglamak yoklama yüzünden dosyayı şişirir; yavaş istekler ve hatalar loglanır
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 64 * 1024, logController: new LogController({ disableRequestLogging: true }) })
  const { store, auth } = deps

  app.decorateRequest('actor', null)

  const PUBLIC = new Set(['/api/v1/health', '/api/v1/auth/login'])
  app.addHook('onRequest', async (req) => {
    req.actor = auth.session(cookieOf(req, SESSION_COOKIE), now())
    const path = req.url.split('?')[0]
    if (path.startsWith('/api/') && !PUBLIC.has(path) && !req.actor) throw new HttpError(401, 'Oturum açılmamış ya da süresi dolmuş')
  })

  // Temel güvenlik başlıkları (R-072)
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'same-origin').header('X-Frame-Options', 'SAMEORIGIN')
  })

  // Yavaş istekler loglanır (NFR-001: standart etkileşimler 2 sn içinde)
  app.addHook('onResponse', async (req, reply) => {
    if (reply.elapsedTime > 1000) req.log.warn({ url: req.url, ms: Math.round(reply.elapsedTime) }, 'yavaş istek')
  })

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    let status = 500
    if (err instanceof HttpError) status = err.status
    else if (err instanceof AuthError) status = 401
    else if (err instanceof ForbiddenError) status = 403
    else if (err instanceof CredentialError || err instanceof NoteError || err instanceof CommandError || err instanceof AlarmTransitionError || err instanceof ReworkTransitionError) status = 400
    else if (err.statusCode && err.statusCode < 500) status = err.statusCode
    // Kendi ürettiğimiz hatalar (HttpError) mesajıyla döner; beklenmeyen hatanın ayrıntısı sadece loga yazılır
    const ours = err instanceof HttpError
    if (status >= 500 && !ours) req.log.error({ scope: 'api', err, url: req.url }, 'istek hatası')
    else if (status >= 500) req.log.warn({ scope: 'api', url: req.url }, err.message)
    else if (err instanceof AuthError) req.log.warn({ scope: 'auth' }, err.message)
    void reply.code(status).send({ error: status >= 500 && !ours ? 'Sunucu hatası; ayrıntı uygulama logunda.' : err.message })
  })

  const ctx = (req: FastifyRequest): CommandContext => ({ store, ix: deps.ix(), actor: req.actor!, now: now() })
  const setCookie = (reply: FastifyReply, value: string, maxAge: number) =>
    void reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${deps.secureCookies ? '; Secure' : ''}`)

  // ---------------------------------------------------------------- sistem ve oturum

  app.get('/api/v1/health', async () => {
    const c = deps.collector?.status() ?? null
    return { ok: true, time: now(), collector: c && { lastSuccessAt: c.lastSuccessAt, lastError: c.lastRun?.ok === false ? c.lastRun.error : null, watermark: c.watermark } }
  })

  app.post('/api/v1/auth/login', async (req, reply) => {
    const b = body(req)
    const { token, actor } = auth.login(str(b, 'login'), str(b, 'secret'), now())
    audit(store, actor, now(), 'auth.login', 'user', actor.id, null, null)
    setCookie(reply, token, 12 * 3600)
    return { user: actor }
  })

  app.post('/api/v1/auth/logout', async (req, reply) => {
    auth.logout(cookieOf(req, SESSION_COOKIE))
    audit(store, req.actor!, now(), 'auth.logout', 'user', req.actor!.id, null, null)
    setCookie(reply, '', 0)
    return { ok: true }
  })

  app.get('/api/v1/auth/me', async (req) => ({ user: req.actor }))

  app.get('/api/v1/master', async () => ({ master: deps.master(), rbac: deps.rbac(), rev: masterRev(store) }))

  app.get('/api/v1/status', async () => {
    const c = deps.collector?.status()
    const run = c?.lastRun ?? null
    return {
      now: now(),
      watermark: store.kvGet<number>('watermark'),
      intervalMin: c?.intervalMin ?? deps.master().config.collectIntervalMin,
      lastPullAt: run?.at ?? null,
      lastSuccessAt: c?.lastSuccessAt ?? null,
      nextPullAt: c?.nextRunAt ?? null,
      running: c?.running ?? false,
      error: run && !run.ok ? run.error : null,
      masterRev: masterRev(store),
    }
  })

  app.post('/api/v1/collector/pull', async (req) => {
    requirePermission(req.actor!, 'integration.pull')
    if (!deps.collector) throw new HttpError(503, 'Collector çalışmıyor')
    const run = await deps.collector.trigger()
    audit(store, req.actor!, now(), 'collector.pull', 'collector', null, null, { rows: run.rows, ok: run.ok })
    return { run }
  })

  // ---------------------------------------------------------------- okuma

  app.get('/api/v1/overview', async () => buildOverview(store, deps.ix(), now()))

  app.get<{ Params: { op: string } }>('/api/v1/stations/:op', async (req) => {
    const d = stationDetail(store, deps.ix(), req.params.op, now())
    if (!d) throw new HttpError(404, `İstasyon bulunamadı: ${req.params.op}`)
    return d
  })

  const DAY = 24 * 3600_000
  /** ?from=&to= (ms); varsayılan son 24 saat, en fazla 31 gün */
  const windowOf = (qs: Record<string, string | undefined>): TimeWindow => {
    const to = Number(qs.to) || now()
    const from = Number(qs.from) || to - DAY
    if (from >= to) throw new HttpError(400, '"from", "to"dan önce olmalı')
    if (to - from > 31 * DAY) throw new HttpError(400, 'Zaman aralığı en fazla 31 gün olabilir')
    return { from, to }
  }
  const tighteningFilter = (qs: Record<string, string | undefined>): TighteningFilter => ({
    ...windowOf(qs),
    op: qs.op || null,
    result: qs.result ? oneOf(qs.result, ['OK', 'NOK'] as const, 'result') : null,
    sn: qs.sn || null,
  })
  type Qs = { Querystring: Record<string, string | undefined> }

  app.get<Qs>('/api/v1/motors', async (req) => ({ motors: searchMotors(store, req.query.q ?? '', Math.min(100, Number(req.query.limit) || 20)) }))

  app.get<{ Params: { sn: string } }>('/api/v1/motors/:sn', async (req) => {
    const d = motorDetail(store, deps.ix(), req.params.sn)
    if (!d) throw new HttpError(404, `Motor bulunamadı: ${req.params.sn}`)
    return d
  })

  app.get<Qs>('/api/v1/quality', async (req) => qualityView(store, windowOf(req.query)))

  app.get<Qs>('/api/v1/alarms', async (req) => alarmList(store, windowOf(req.query)))

  app.get<{ Params: { id: string } }>('/api/v1/alarms/:id', async (req) => {
    const d = alarmDetail(store, req.params.id)
    if (!d) throw new HttpError(404, `Alarm bulunamadı: ${req.params.id}`)
    return d
  })

  app.get<Qs>('/api/v1/tightening', async (req) => tighteningView(store, deps.ix(), tighteningFilter(req.query)))

  app.get<Qs>('/api/v1/tightening.csv', async (req, reply) => {
    const f = tighteningFilter(req.query)
    const csv = tighteningCsv(tighteningRows(store, f))
    audit(store, req.actor!, now(), 'tightening.export', 'tightening', null, null, { from: f.from, to: f.to, op: f.op, result: f.result, sn: f.sn })
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${tighteningCsvName(f.from, f.to)}"`)
      .send(csv)
  })

  app.get<{ Querystring: { day?: string; shift?: string; op?: string } }>('/api/v1/kpi', async (req) => {
    const day = Number(req.query.day)
    if (!Number.isFinite(day) || day <= 0) throw new HttpError(400, '"day" (üretim günü başlangıcı, ms) gerekli')
    const shift = req.query.shift ? oneOf(req.query.shift, deps.master().config.shifts.map((s) => s.id), 'shift') : null
    return kpiReport(store, deps.ix(), { day, shift, op: req.query.op || null }, now())
  })

  app.get<{ Params: { op: string } }>('/api/v1/terminal/:op', async (req) => {
    const v = terminalView(store, deps.ix(), req.params.op, now(), req.actor!.id)
    if (!v) throw new HttpError(404, `İstasyon bulunamadı: ${req.params.op}`)
    return v
  })

  app.get('/api/v1/maintenance', async () => maintenanceView(store, deps.ix(), now()))

  app.get('/api/v1/integration', async (): Promise<IntegrationStatus> => {
    const c = deps.collector?.status()
    const sync = store.kvGet<LastIds>('sync') ?? {}
    const runs = deps.collector?.runs() ?? []
    return {
      mode: 'server',
      source: deps.system.source,
      intervalMin: c?.intervalMin ?? deps.master().config.collectIntervalMin,
      running: c?.running ?? false,
      lastRun: c?.lastRun ?? null,
      lastSuccessAt: c?.lastSuccessAt ?? null,
      nextRunAt: c?.nextRunAt ?? null,
      watermark: store.kvGet<number>('watermark'),
      runs,
      readPosition: RAW_TABLES.map((table) => ({ table, lastId: sync[table] ?? 0 })),
    }
  })

  app.get<{ Params: { table: string }; Querystring: { limit?: string } }>('/api/v1/integration/raw/:table', async (req) => {
    requirePermission(req.actor!, 'system.view')
    const table = oneOf(req.params.table, RAW_TABLES, 'table')
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    try {
      return await deps.system.preview(table, limit)
    } catch (e) {
      throw new HttpError(503, `Fabrika veritabanına ulaşılamıyor: ${(e as Error).message.split('\n')[0]}`)
    }
  })

  app.get<{ Querystring: { level?: string } }>('/api/v1/system/logs', async (req) => {
    requirePermission(req.actor!, 'system.view')
    const level = req.query.level ? oneOf(req.query.level, ['info', 'warn', 'error'] as const, 'level') : 'info'
    return { entries: deps.system.logs(level) }
  })

  app.get('/api/v1/system/info', async (req) => {
    requirePermission(req.actor!, 'system.view')
    return deps.system.info()
  })

  // ---------------------------------------------------------------- komutlar

  app.post('/api/v1/notes', async (req) => {
    const b = body(req)
    return createNote(ctx(req), {
      op: str(b, 'op'),
      type: oneOf<NoteType>(str(b, 'type'), ['info', 'warning', 'error'], 'type'),
      text: str(b, 'text'),
      sn: optStr(b, 'sn'),
      alarmId: optStr(b, 'alarmId'),
      topic: optStr(b, 'topic'),
    })
  })

  app.post<{ Params: { id: string } }>('/api/v1/alarms/:id/ack', async (req) => ackAlarm(ctx(req), req.params.id))
  app.post<{ Params: { id: string } }>('/api/v1/alarms/:id/assign', async (req) => assignAlarmTo(ctx(req), req.params.id, str(body(req), 'assignee')))
  app.post<{ Params: { id: string } }>('/api/v1/alarms/:id/close', async (req) => closeAlarmBy(ctx(req), req.params.id, optStr(body(req), 'note')))

  app.post('/api/v1/andons', async (req) => {
    const b = body(req)
    return openAndon(ctx(req), { op: str(b, 'op'), type: oneOf<AndonType>(str(b, 'type'), ['material', 'quality', 'production'], 'type'), message: optStr(b, 'message') ?? '', sn: optStr(b, 'sn') })
  })

  const reworkFields = (b: Body) => {
    const f = (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Body
    const out: Record<string, unknown> = {}
    if ('rootCause' in f) out.rootCause = optStr(f, 'rootCause')
    if ('reworkOperator' in f) out.reworkOperator = optStr(f, 'reworkOperator')
    if ('priority' in f) out.priority = oneOf(str(f, 'priority'), ['high', 'medium', 'low'], 'priority')
    if ('team' in f) out.team = oneOf(str(f, 'team'), ['Kalite Ekibi', 'Bakım Ekibi', 'Üretim Lideri', 'Otomasyon', 'Lojistik'], 'team')
    return out
  }
  app.post<{ Params: { id: string } }>('/api/v1/reworks/:id/advance', async (req) => {
    const b = body(req)
    return advanceReworkBy(ctx(req), req.params.id, oneOf<ReworkState>(str(b, 'to'), ['diagnosis', 'bench', 'ready'], 'to'), optStr(b, 'note'), reworkFields(b))
  })
  app.patch<{ Params: { id: string } }>('/api/v1/reworks/:id', async (req) => updateReworkBy(ctx(req), req.params.id, reworkFields(body(req))))

  app.post('/api/v1/terminal/login', async (req) => stationLogin(ctx(req), str(body(req), 'op')))
  app.post('/api/v1/terminal/logout', async (req) => ({ login: stationLogout(ctx(req)) }))
  app.post('/api/v1/terminal/confirm', async (req) => {
    const b = body(req)
    return confirmOperation(ctx(req), { op: str(b, 'op'), sn: str(b, 'sn'), note: optStr(b, 'note') })
  })

  app.post('/api/v1/holds', async (req) => {
    const b = body(req)
    return holdMotor(ctx(req), { sn: str(b, 'sn'), reason: str(b, 'reason'), op: optStr(b, 'op') })
  })
  app.post<{ Params: { id: string } }>('/api/v1/holds/:id/decide', async (req) => {
    const b = body(req)
    return decideHold(ctx(req), req.params.id, oneOf(str(b, 'decision'), ['release', 'rework'] as const, 'decision'), optStr(b, 'note'))
  })

  registerAdmin(app, deps, ctx, now)

  return app
}
