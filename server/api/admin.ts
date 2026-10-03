import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  AUDIT_LIMIT_MAX,
  applyRetention,
  auditCsv,
  auditCsvName,
  auditQuery,
  createPerson,
  masterRev,
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
import type { ConfigPatch, FeedPatch, PersonInput, RulePatch, StationPatch } from '@/domain/admin'
import { audit } from '@/domain/commands'
import type { CommandContext } from '@/domain/commands'
import { requirePermission } from '@/domain/rbac'
import type { Permission } from '@/domain/rbac'
import { ROLE_LABEL } from '@/domain/types'
import type { RetentionGroup, RoleId, SystemSettings } from '@/domain/types'
import type { AppDeps } from './app'
import { HttpError, body, obj, pick, str } from './http'
import type { Body } from './http'

/**
 * Admin ve audit uç noktaları (R-010, R-053–R-058, R-075). Ana veri değişiklikleri
 * src/domain/admin.ts'teki komutlardan geçer; kimlik bilgileri (PIN, kart) sunucuya özeldir.
 * Ana veriyi değiştiren her uç nokta yeni ana veriyi, izinleri ve sürüm numarasını döndürür.
 */

const DAY = 24 * 3600_000

export function registerAdmin(app: FastifyInstance, deps: AppDeps, ctx: (req: FastifyRequest) => CommandContext, now: () => number): void {
  const { store, auth } = deps
  const need = (req: FastifyRequest, p: Permission) => requirePermission(req.actor!, p)
  const changed = () => {
    deps.onMasterChange()
    return { master: deps.master(), rbac: deps.rbac(), rev: masterRev(store) }
  }
  const personOf = (b: Body, personnelNo?: string): PersonInput => ({
    personnelNo: personnelNo ?? str(b, 'personnelNo').trim().toUpperCase(),
    name: str(b, 'name'),
    role: str(b, 'role') as RoleId,
    shift: typeof b.shift === 'string' && b.shift ? b.shift : null,
    station: typeof b.station === 'string' && b.station ? b.station : null,
    qualifications: Array.isArray(b.qualifications) ? b.qualifications.filter((q): q is string => typeof q === 'string') : [],
  })
  const exists = (no: string) => {
    if (!deps.master().people.some((p) => p.personnelNo === no)) throw new HttpError(404, `Kullanıcı bulunamadı: ${no}`)
  }
  type No = { Params: { no: string } }

  // ---------------------------------------------------------------- kullanıcılar ve roller

  app.get('/api/v1/admin/users', async (req) => {
    need(req, 'admin.users')
    const cred = auth.credentials(now())
    return { users: deps.master().people.map((p) => ({ ...p, credential: cred[p.personnelNo] ?? null })) }
  })

  app.post('/api/v1/admin/users', async (req) => {
    const b = body(req)
    const person = personOf(obj(b, 'person'))
    const pin = str(b, 'pin')
    const rfid = typeof b.rfid === 'string' ? b.rfid : null
    need(req, 'admin.users')
    auth.validateNew(person.personnelNo, pin, rfid)
    store.transaction(() => {
      createPerson(ctx(req), person)
      auth.createCredential(person.personnelNo, pin, rfid, now())
    })
    return changed()
  })

  app.put<No>('/api/v1/admin/users/:no', async (req) => {
    updatePerson(ctx(req), personOf(obj(body(req), 'person'), req.params.no))
    return changed()
  })

  app.put<No>('/api/v1/admin/users/:no/card', async (req) => {
    need(req, 'admin.users')
    exists(req.params.no)
    const before = auth.credentials(now())[req.params.no]?.rfid ?? null
    const b = body(req)
    store.transaction(() => {
      const after = auth.setRfid(req.params.no, typeof b.rfid === 'string' ? b.rfid : null, now())
      if (after === before) throw new HttpError(400, 'Değişiklik yok')
      audit(store, req.actor!, now(), 'user.card', 'user', req.params.no, { rfid: before }, { rfid: after })
    })
    return { ok: true }
  })

  app.post<No>('/api/v1/admin/users/:no/active', async (req) => {
    const active = body(req).active
    if (typeof active !== 'boolean') throw new HttpError(400, '"active" true / false olmalı')
    store.transaction(() => {
      setPersonActive(ctx(req), req.params.no, active)
      auth.setActive(req.params.no, active, now())
    })
    return changed()
  })

  app.post<No>('/api/v1/admin/users/:no/pin', async (req) => {
    need(req, 'admin.users')
    exists(req.params.no)
    const pin = str(body(req), 'pin')
    store.transaction(() => {
      if (auth.hasCredential(req.params.no)) auth.setSecret(req.params.no, pin, now())
      else auth.createCredential(req.params.no, pin, null, now())
      // PIN'in kendisi audit'e yazılmaz
      audit(store, req.actor!, now(), 'user.pin', 'user', req.params.no, null, null)
    })
    return { ok: true }
  })

  app.post<No>('/api/v1/admin/users/:no/unlock', async (req) => {
    need(req, 'admin.users')
    exists(req.params.no)
    auth.unlock(req.params.no)
    audit(store, req.actor!, now(), 'user.unlock', 'user', req.params.no, null, null)
    return { ok: true }
  })

  app.put<{ Params: { role: string } }>('/api/v1/admin/roles/:role', async (req) => {
    const role = req.params.role
    if (!(role in ROLE_LABEL)) throw new HttpError(404, `Rol bulunamadı: ${role}`)
    const p = body(req).permissions
    if (!Array.isArray(p)) throw new HttpError(400, '"permissions" liste olmalı')
    setRolePermissions(ctx(req), role as RoleId, p.filter((x): x is string => typeof x === 'string'))
    return changed()
  })

  // ---------------------------------------------------------------- ana veri

  app.put('/api/v1/admin/config', async (req) => {
    updateLineConfig(ctx(req), pick(obj(body(req), 'patch'), ['taktSec', 'warnRatio', 'alarmRatio', 'heartbeatTimeoutSec', 'dayStartHour', 'variant', 'shifts']) as ConfigPatch)
    return changed()
  })

  app.put<{ Params: { op: string } }>('/api/v1/admin/stations/:op', async (req) => {
    updateStation(ctx(req), req.params.op, pick(obj(body(req), 'patch'), ['name', 'type', 'targetCycleSec', 'plcId', 'cellId', 'tool', 'recipe']) as StationPatch)
    return changed()
  })

  app.put<{ Params: { op: string } }>('/api/v1/admin/feeds/:op', async (req) => {
    updateSubFeed(ctx(req), req.params.op, pick(obj(body(req), 'patch'), ['mainOp', 'kit', 'bufferMin', 'bufferMax', 'dailyTarget']) as FeedPatch)
    return changed()
  })

  app.put<{ Params: { code: string } }>('/api/v1/admin/rules/:code', async (req) => {
    updateAlarmRule(ctx(req), req.params.code, pick(obj(body(req), 'patch'), ['name', 'severity', 'escalationMin', 'team', 'enabled']) as RulePatch)
    return changed()
  })

  // ---------------------------------------------------------------- entegrasyon, saklama, yedek

  app.put('/api/v1/admin/integration', async (req) => {
    updateIntegration(ctx(req), { collectIntervalMin: body(req).collectIntervalMin as number })
    return changed()
  })

  app.post('/api/v1/admin/integration/test', async (req) => {
    need(req, 'admin.integration')
    return deps.integrationTest()
  })

  app.put('/api/v1/admin/retention', async (req) => {
    updateRetention(ctx(req), obj(body(req), 'retention') as Record<RetentionGroup, number>)
    return changed()
  })

  app.get('/api/v1/admin/retention/preview', async (req) => {
    need(req, 'admin.retention')
    return { groups: applyRetention(store, deps.master().settings, now(), true) }
  })

  app.post('/api/v1/admin/retention/purge', async (req) => ({ groups: purgeExpired(ctx(req)) }))

  app.put('/api/v1/admin/backup', async (req) => {
    updateBackup(ctx(req), pick(body(req), ['enabled', 'hour', 'keep']) as SystemSettings['backup'])
    return changed()
  })

  app.get('/api/v1/admin/backups', async (req) => {
    need(req, 'admin.retention')
    return { backups: deps.backups?.list() ?? [] }
  })

  app.post('/api/v1/admin/backups', async (req) => {
    need(req, 'admin.retention')
    if (!deps.backups) throw new HttpError(503, 'Yedekleme bu kurulumda kullanılamıyor')
    const b = deps.backups.create(now())
    const pruned = deps.backups.prune(deps.master().settings.backup.keep)
    audit(store, req.actor!, now(), 'backup.create', 'backup', b.file, null, { sizeBytes: b.sizeBytes, pruned })
    return { backup: b, pruned }
  })

  // ---------------------------------------------------------------- audit (R-058)

  type Qs = { Querystring: Record<string, string | undefined> }
  const auditFilter = (qs: Record<string, string | undefined>) => {
    // Varsayılan bitiş şimdinin biraz sonrası: az önce yazılan kayıt da görünsün
    const to = Number(qs.to) || now() + 1000
    const from = Number(qs.from) || to - 7 * DAY
    if (from >= to) throw new HttpError(400, '"from", "to"dan önce olmalı')
    if (to - from > 366 * DAY) throw new HttpError(400, 'Zaman aralığı en fazla 1 yıl olabilir')
    return { from, to, user: qs.user || null, action: qs.action || null, entity: qs.entity || null, entityId: qs.entityId || null }
  }

  app.get<Qs>('/api/v1/audit', async (req) => {
    need(req, 'audit.view')
    return auditQuery(store, { ...auditFilter(req.query), limit: Math.min(AUDIT_LIMIT_MAX, Number(req.query.limit) || 200), offset: Number(req.query.offset) || 0 })
  })

  app.get<Qs>('/api/v1/audit.csv', async (req, reply) => {
    need(req, 'audit.view')
    const f = auditFilter(req.query)
    const { entries } = auditQuery(store, { ...f, limit: Number.MAX_SAFE_INTEGER })
    audit(store, req.actor!, now(), 'audit.export', 'audit', null, null, { ...f, rows: entries.length })
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${auditCsvName(f.from, f.to)}"`).send(auditCsv(entries))
  })
}
