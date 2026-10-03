import { csvTime, toCsv } from '@/lib/csv'
import { audit, CommandError } from './commands'
import type { CommandContext } from './commands'
import { KNOWN_QUALIFICATIONS, normalizeMaster } from './lineDef'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, requirePermission } from './rbac'
import type { Actor, Permission, RolePermissions } from './rbac'
import type { Shift } from './shifts'
import type { Query, Store, TableName, Tables } from './store/Store'
import { ROLE_LABEL, STATION_TYPE_LABEL, TEAMS } from './types'
import type { AlarmRule, AuditEntry, LineConfig, MasterData, Person, RetentionGroup, RoleId, Severity, Station, SubFeed, SystemSettings } from './types'

/**
 * Admin ve konfigürasyon (R-010, R-053–R-056, R-058). Ana veri ve rol izinleri uygulama
 * veritabanında (kv) tutulur; her değişiklik doğrulanır, kaydedilir ve audit'e önceki / sonraki
 * değerleriyle yazılır. Demo ve sunucu aynı komutları kullanır.
 */

export const MASTER_KEY = 'master'
export const RBAC_KEY = 'rbac'
/** Ana veri ya da izinler her değiştiğinde artar; istemciler bununla tazeler */
export const REV_KEY = 'master:rev'

export const loadMaster = (store: Store): MasterData => normalizeMaster(store.kvGet<MasterData>(MASTER_KEY))
export const loadRbac = (store: Store): RolePermissions => store.kvGet<RolePermissions>(RBAC_KEY) ?? DEFAULT_ROLE_PERMISSIONS
export const masterRev = (store: Store): number => store.kvGet<number>(REV_KEY) ?? 0

/** Zamanlanmış işler (yedek, saklama temizliği) audit'te bu adla görünür */
export const SYSTEM_ACTOR: Actor = { id: 'system', name: 'Sistem (zamanlanmış iş)', role: 'admin', permissions: [...ALL_PERMISSIONS] }

function check(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new CommandError(msg)
}

const intIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const numIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const text = (v: unknown, min = 1, max = 80) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max

/** Sadece değişen alanların önceki ve sonraki değerleri */
export function changes<T extends object>(before: T, after: T): { before: Partial<T>; after: Partial<T> } | null {
  const b: Partial<T> = {}
  const a: Partial<T> = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof T>) {
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue
    b[k] = before[k]
    a[k] = after[k]
  }
  return Object.keys(a).length || Object.keys(b).length ? { before: b, after: a } : null
}

function saveMaster(c: CommandContext, next: MasterData, action: string, entity: string, entityId: string | null, before: object, after: object): MasterData {
  const d = changes(before, after)
  check(d, 'Değişiklik yok')
  c.store.transaction(() => {
    c.store.kvSet(MASTER_KEY, next)
    c.store.kvSet(REV_KEY, masterRev(c.store) + 1)
    audit(c.store, c.actor, c.now, action, entity, entityId, d.before, d.after)
  })
  return next
}

const clone = (m: MasterData): MasterData => structuredClone(m)

// ---------------------------------------------------------------- hat ve istasyonlar (R-053)

export type ConfigPatch = Partial<Pick<LineConfig, 'taktSec' | 'warnRatio' | 'alarmRatio' | 'heartbeatTimeoutSec' | 'dayStartHour' | 'variant' | 'shifts'>>

/** Vardiyalar üretim günü başından itibaren boşluksuz ve çakışmasız 24 saati kaplamalı */
export function validateShifts(shifts: Shift[], dayStartHour: number): void {
  check(shifts.length >= 1 && shifts.length <= 4, 'Vardiya sayısı 1–4 olmalı')
  for (const s of shifts) {
    check(text(s.name, 2, 30), `${s.id} vardiyasının adı yazılmalı`)
    check(intIn(s.startHour, 0, 23), `${s.name}: başlangıç saati 0–23 olmalı`)
    check(intIn(s.lengthH, 1, 12), `${s.name}: süre 1–12 saat olmalı`)
  }
  check(new Set(shifts.map((s) => s.id)).size === shifts.length, 'Vardiya kodları tekrar ediyor')
  const off = (s: Shift) => (s.startHour - dayStartHour + 24) % 24
  const sorted = [...shifts].sort((a, b) => off(a) - off(b))
  let at = 0
  for (const s of sorted) {
    check(off(s) === at, `Vardiyalar üretim günü başından (${dayStartHour}:00) itibaren boşluksuz ve çakışmasız olmalı: ${s.name} ${s.startHour}:00'da başlıyor`)
    at += s.lengthH
  }
  check(at === 24, `Vardiyaların toplamı 24 saat olmalı (şu an ${at} saat)`)
}

export function updateLineConfig(c: CommandContext, patch: ConfigPatch): MasterData {
  requirePermission(c.actor, 'admin.stations')
  const m = clone(c.ix.master)
  const before = m.config
  const cfg: LineConfig = { ...before, ...patch }
  check(intIn(cfg.taktSec, 60, 3600), 'Takt 1–60 dk arasında olmalı')
  check(numIn(cfg.warnRatio, 0.5, 1), 'Uyarı eşiği takt’ın %50–100’ü arasında olmalı')
  check(numIn(cfg.alarmRatio, 1, 2), 'Alarm eşiği takt’ın %100–200’ü arasında olmalı')
  check(intIn(cfg.heartbeatTimeoutSec, 30, 3600), 'Heartbeat zaman aşımı 30–3600 sn olmalı')
  check(intIn(cfg.dayStartHour, 0, 23), 'Üretim günü başlangıcı 0–23 olmalı')
  check(text(cfg.variant, 1, 40), 'Varyant yazılmalı')
  validateShifts(cfg.shifts, cfg.dayStartHour)
  m.config = cfg
  return saveMaster(c, m, 'config.line', 'config', 'line', before, cfg)
}

export type StationPatch = Partial<Pick<Station, 'name' | 'type' | 'targetCycleSec' | 'plcId' | 'cellId' | 'tool' | 'recipe'>>

/**
 * İstasyon ana verisi. OP kodu fabrika verisindeki istasyon koduyla eşleştiği için buradan değişmez
 * (yeni kodla gelen veri eski istasyona bağlanmaz); kod değişikliği collector eşlemesiyle birlikte yapılır.
 */
export function updateStation(c: CommandContext, op: string, patch: StationPatch): MasterData {
  requirePermission(c.actor, 'admin.stations')
  const m = clone(c.ix.master)
  const i = m.stations.findIndex((s) => s.op === op)
  check(i >= 0, `İstasyon bulunamadı: ${op}`)
  const before = m.stations[i]
  const st: Station = { ...before, ...patch }
  check(text(st.name, 3, 80), 'Operasyon adı 3–80 karakter olmalı')
  check(st.type in STATION_TYPE_LABEL, 'İstasyon tipi geçersiz')
  check(intIn(st.targetCycleSec, 30, 3600), 'Hedef çevrim 0,5–60 dk arasında olmalı')
  check(text(st.plcId, 2, 40) && text(st.cellId, 1, 40), 'PLC ve Cell ID yazılmalı')
  check(!m.stations.some((s) => s.op !== op && s.plcId === st.plcId.trim()), `${st.plcId} başka bir istasyonda kullanılıyor`)
  check(text(st.tool, 1, 80) && text(st.recipe, 1, 60), 'Tool / ekipman ve reçete yazılmalı')
  m.stations[i] = { ...st, name: st.name.trim(), plcId: st.plcId.trim(), cellId: st.cellId.trim(), tool: st.tool.trim(), recipe: st.recipe.trim() }
  return saveMaster(c, m, 'config.station', 'station', op, before, m.stations[i])
}

// ---------------------------------------------------------------- kullanıcılar ve roller (R-054)

export interface PersonInput {
  personnelNo: string
  name: string
  role: RoleId
  shift: string | null
  station: string | null
  qualifications: string[]
}

const activeAdmins = (people: Person[]) => people.filter((p) => p.role === 'admin' && p.active !== false)

function validatePerson(m: MasterData, p: PersonInput): Person {
  check(/^[A-Z]{1,3}-\d{3,5}$/.test(p.personnelNo), 'Personel no biçimi: harf(ler) - rakamlar, ör. T-1044')
  check(text(p.name, 3, 60), 'Ad soyad 3–60 karakter olmalı')
  check(p.role in ROLE_LABEL, 'Rol geçersiz')
  check(p.shift === null || m.config.shifts.some((s) => s.id === p.shift), 'Vardiya geçersiz')
  if (p.station !== null) {
    const st = m.stations.find((s) => s.op === p.station)
    check(st && st.line === 'main' && st.type === 'manual', 'İstasyon ataması sadece ana hattaki insanlı istasyonlara yapılır')
    check(p.role === 'technician', 'İstasyon ataması sadece teknisyenlere yapılır')
  }
  const unknown = p.qualifications.filter((q) => !(KNOWN_QUALIFICATIONS as readonly string[]).includes(q))
  check(!unknown.length, `Bilinmeyen yetkinlik: ${unknown.join(', ')}`)
  return { personnelNo: p.personnelNo, name: p.name.trim(), role: p.role, shift: (p.shift as Person['shift']) ?? null, station: p.station, qualifications: [...new Set(p.qualifications)] }
}

export function createPerson(c: CommandContext, input: PersonInput): MasterData {
  requirePermission(c.actor, 'admin.users')
  const m = clone(c.ix.master)
  const p = validatePerson(m, input)
  check(!m.people.some((x) => x.personnelNo === p.personnelNo), `${p.personnelNo} zaten kayıtlı`)
  m.people.push({ ...p, active: true })
  return saveMaster(c, m, 'user.create', 'user', p.personnelNo, {}, m.people.at(-1)!)
}

export function updatePerson(c: CommandContext, input: PersonInput): MasterData {
  requirePermission(c.actor, 'admin.users')
  const m = clone(c.ix.master)
  const i = m.people.findIndex((x) => x.personnelNo === input.personnelNo)
  check(i >= 0, `Kullanıcı bulunamadı: ${input.personnelNo}`)
  const before = m.people[i]
  const p = { ...validatePerson(m, input), active: before.active }
  check(!(input.personnelNo === c.actor.id && before.role === 'admin' && p.role !== 'admin'), 'Kendi admin rolünüzü kaldıramazsınız')
  m.people[i] = p
  check(activeAdmins(m.people).length > 0, 'En az bir aktif admin kalmalı')
  return saveMaster(c, m, 'user.update', 'user', p.personnelNo, before, p)
}

/** Pasif kullanıcı giriş yapamaz; geçmiş kayıtlarda adı kalır */
export function setPersonActive(c: CommandContext, personnelNo: string, active: boolean): MasterData {
  requirePermission(c.actor, 'admin.users')
  const m = clone(c.ix.master)
  const i = m.people.findIndex((x) => x.personnelNo === personnelNo)
  check(i >= 0, `Kullanıcı bulunamadı: ${personnelNo}`)
  check(active || personnelNo !== c.actor.id, 'Kendinizi pasifleştiremezsiniz')
  const before = m.people[i]
  m.people[i] = { ...before, active }
  check(activeAdmins(m.people).length > 0, 'En az bir aktif admin kalmalı')
  return saveMaster(c, m, active ? 'user.activate' : 'user.deactivate', 'user', personnelNo, { active: before.active !== false }, { active })
}

export function setRolePermissions(c: CommandContext, role: RoleId, permissions: string[]): RolePermissions {
  requirePermission(c.actor, 'admin.users')
  check(role in ROLE_LABEL, 'Rol geçersiz')
  const unknown = permissions.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p))
  check(!unknown.length, `Bilinmeyen izin: ${unknown.join(', ')}`)
  check(role !== 'admin' || permissions.includes('admin.users'), 'Admin rolünden kullanıcı ve rol yönetimi izni kaldırılamaz (kimse izinleri geri veremez)')
  const rbac = loadRbac(c.store)
  const before = rbac[role] ?? []
  const after = ALL_PERMISSIONS.filter((p) => permissions.includes(p)) as Permission[]
  const added = after.filter((p) => !before.includes(p))
  const removed = before.filter((p) => !after.includes(p))
  check(added.length || removed.length, 'Değişiklik yok')
  const next = { ...rbac, [role]: after }
  c.store.transaction(() => {
    c.store.kvSet(RBAC_KEY, next)
    c.store.kvSet(REV_KEY, masterRev(c.store) + 1)
    audit(c.store, c.actor, c.now, 'role.permissions', 'role', role, { removed }, { added })
  })
  return next
}

// ---------------------------------------------------------------- ön montaj besleme (R-055)

export type FeedPatch = Partial<Pick<SubFeed, 'mainOp' | 'kit' | 'bufferMin' | 'bufferMax' | 'dailyTarget'>>

export function updateSubFeed(c: CommandContext, subOp: string, patch: FeedPatch): MasterData {
  requirePermission(c.actor, 'admin.routing')
  const m = clone(c.ix.master)
  const i = m.subFeeds.findIndex((f) => f.subOp === subOp)
  check(i >= 0, `Ön montaj hücresi bulunamadı: ${subOp}`)
  const before = m.subFeeds[i]
  const f: SubFeed = { ...before, ...patch }
  const main = m.stations.find((s) => s.op === f.mainOp)
  check(main && main.line === 'main', 'Beslenen istasyon ana hatta olmalı')
  check(!m.subFeeds.some((x) => x.subOp !== subOp && x.mainOp === f.mainOp), `${f.mainOp} zaten başka bir ön montaj hücresinden besleniyor`)
  check(text(f.kit, 2, 60), 'Kit adı yazılmalı')
  check(intIn(f.bufferMin, 0, 500) && intIn(f.bufferMax, 1, 500) && f.bufferMin < f.bufferMax, 'Buffer: 0 ≤ min < max ≤ 500 olmalı')
  check(intIn(f.dailyTarget, 0, 5000), 'Günlük hedef 0–5000 olmalı')
  m.subFeeds[i] = { ...f, kit: f.kit.trim() }
  return saveMaster(c, m, 'config.routing', 'sub_feed', subOp, before, m.subFeeds[i])
}

// ---------------------------------------------------------------- alarm kuralları (R-056)

export type RulePatch = Partial<Pick<AlarmRule, 'name' | 'severity' | 'escalationMin' | 'team' | 'enabled'>>

const SEVERITIES: Severity[] = ['critical', 'warning', 'info']

export function updateAlarmRule(c: CommandContext, code: string, patch: RulePatch): MasterData {
  requirePermission(c.actor, 'admin.alarmRules')
  const m = clone(c.ix.master)
  const i = m.rules.findIndex((r) => r.code === code)
  check(i >= 0, `Alarm kuralı bulunamadı: ${code}`)
  const before = m.rules[i]
  const r: AlarmRule = { ...before, ...patch }
  check(text(r.name, 3, 60), 'Kural adı 3–60 karakter olmalı')
  check(SEVERITIES.includes(r.severity), 'Önem geçersiz')
  check(intIn(r.escalationMin, 1, 480), 'Eskalasyon süresi 1–480 dk olmalı')
  check(TEAMS.includes(r.team), 'Ekip geçersiz')
  check(typeof r.enabled === 'boolean', 'Açık / kapalı geçersiz')
  m.rules[i] = { ...r, name: r.name.trim() }
  return saveMaster(c, m, 'config.alarmRule', 'alarm_rule', code, before, m.rules[i])
}

// ---------------------------------------------------------------- entegrasyon, saklama, yedek

export function updateIntegration(c: CommandContext, patch: { collectIntervalMin: number }): MasterData {
  requirePermission(c.actor, 'admin.integration')
  check(intIn(patch.collectIntervalMin, 3, 5), 'Çekme aralığı 3–5 dk olmalı (fabrika SQL Server’ına yük bindirmemek için)')
  const m = clone(c.ix.master)
  const before = { collectIntervalMin: m.config.collectIntervalMin }
  m.config.collectIntervalMin = patch.collectIntervalMin
  return saveMaster(c, m, 'config.integration', 'config', 'integration', before, { collectIntervalMin: patch.collectIntervalMin })
}

interface RetentionTarget<K extends TableName = TableName> {
  table: K
  field: keyof Tables[K] & string
  /** Sadece kapanmış / bitmiş kayıtlar silinir */
  q?: Query<Tables[K]>
}

export interface RetentionGroupDef {
  label: string
  hint: string
  minDays: number
  targets: RetentionTarget[]
  /** Silinen ana kayıtların bağlı olay kayıtları da silinir */
  linked?: { parent: TableName; child: 'alarm_event' | 'rework_event'; key: 'alarmId' | 'reworkId' }
}

const tgt = <K extends TableName>(table: K, field: keyof Tables[K] & string, q?: Query<Tables[K]>): RetentionTarget => ({ table, field, q }) as unknown as RetentionTarget

export const RETENTION_GROUPS: Record<RetentionGroup, RetentionGroupDef> = {
  trace: {
    label: 'Motor geçmişi ve izlenebilirlik',
    hint: 'Motor, operasyonlar, takılan parçalar, OP100 sonuçları, kapanan rework ve HOLD kayıtları, operasyon onayları',
    minDays: 365,
    targets: [
      tgt('motor', 'createdAt', { notNull: ['completedAt'] }),
      tgt('motor_op', 'start'),
      tgt('component_install', 't'),
      tgt('quality_result', 't'),
      tgt('rework', 'openedAt', { where: { state: 'closed' } }),
      tgt('motor_hold', 't', { notNull: ['releasedAt'] }),
      tgt('op_confirmation', 't'),
    ],
    linked: { parent: 'rework', child: 'rework_event', key: 'reworkId' },
  },
  tightening: { label: 'Tork sonuçları', hint: 'Tüm sıkma kayıtları', minDays: 365, targets: [tgt('tightening', 't')] },
  images: { label: 'Kalite görüntü kayıtları', hint: 'OP100 görüntü kayıtları (dosyalar vision sisteminin deposunda; onların saklaması ayrıca yapılır)', minDays: 30, targets: [tgt('quality_image', 't')] },
  events: { label: 'İstasyon olayları', hint: 'İstasyon durum aralıkları, ön montaj sayaç örnekleri, istasyon girişleri', minDays: 90, targets: [tgt('station_span', 'start', { notNull: ['end'] }), tgt('sub_sample', 't'), tgt('station_login', 'loginAt')] },
  alarms: {
    label: 'Alarm, Andon ve notlar',
    hint: 'Kapanmış alarmlar ve olayları, Andon çağrıları, teknisyen notları',
    minDays: 90,
    targets: [tgt('alarm', 't', { where: { status: 'closed' } }), tgt('andon', 't'), tgt('note', 't')],
    linked: { parent: 'alarm', child: 'alarm_event', key: 'alarmId' },
  },
  audit: { label: 'Audit kaydı', hint: 'Kullanıcı işlemleri ve konfigürasyon değişiklikleri', minDays: 365, targets: [tgt('audit_log', 't')] },
}

export const RETENTION_ORDER: RetentionGroup[] = ['trace', 'tightening', 'images', 'events', 'alarms', 'audit']
const MAX_DAYS = 7300

export function updateRetention(c: CommandContext, retention: Record<RetentionGroup, number>): MasterData {
  requirePermission(c.actor, 'admin.retention')
  for (const g of RETENTION_ORDER) {
    const def = RETENTION_GROUPS[g]
    check(intIn(retention[g], def.minDays, MAX_DAYS), `${def.label}: ${def.minDays}–${MAX_DAYS} gün olmalı`)
  }
  const m = clone(c.ix.master)
  const before = m.settings.retention
  m.settings.retention = Object.fromEntries(RETENTION_ORDER.map((g) => [g, retention[g]])) as Record<RetentionGroup, number>
  return saveMaster(c, m, 'config.retention', 'config', 'retention', before, m.settings.retention)
}

export function updateBackup(c: CommandContext, backup: SystemSettings['backup']): MasterData {
  requirePermission(c.actor, 'admin.retention')
  check(typeof backup.enabled === 'boolean', 'Otomatik yedek açık / kapalı geçersiz')
  check(intIn(backup.hour, 0, 23), 'Yedek saati 0–23 olmalı')
  check(intIn(backup.keep, 1, 90), 'Saklanacak yedek sayısı 1–90 olmalı')
  const m = clone(c.ix.master)
  const before = m.settings.backup
  m.settings.backup = { enabled: backup.enabled, hour: backup.hour, keep: backup.keep }
  return saveMaster(c, m, 'config.backup', 'config', 'backup', before, m.settings.backup)
}

export interface RetentionCount {
  group: RetentionGroup
  cutoff: number
  rows: number
  perTable: Partial<Record<TableName, number>>
}

const DAY = 24 * 3600_000
const CHUNK = 500

/** Tablo adı çalışma anında seçildiği için temizlik deponun tipsiz görünümüyle çalışır */
interface LooseStore {
  find(table: TableName, q: object): { id: string }[]
  count(table: TableName, q: object): number
  deleteWhere(table: TableName, q: object): number
}

/** Süresi dolan kayıt sayıları (dryRun) ya da siler. Açık alarm, süren rework / HOLD ve hattaki motor silinmez. */
export function applyRetention(store: Store, settings: SystemSettings, now: number, dryRun: boolean): RetentionCount[] {
  const s = store as unknown as LooseStore
  return RETENTION_ORDER.map((group) => {
    const def = RETENTION_GROUPS[group]
    const cutoff = now - settings.retention[group] * DAY
    const perTable: Partial<Record<TableName, number>> = {}
    const qOf = (t: RetentionTarget) => ({ ...t.q, range: { field: t.field, lt: cutoff } })
    if (def.linked) {
      const { parent, child, key } = def.linked
      const ids = s.find(parent, qOf(def.targets.find((t) => t.table === parent)!)).map((r) => r.id)
      let n = 0
      for (let i = 0; i < ids.length; i += CHUNK) {
        const q = { in: { [key]: ids.slice(i, i + CHUNK) } }
        n += dryRun ? s.count(child, q) : s.deleteWhere(child, q)
      }
      perTable[child] = n
    }
    for (const t of def.targets) perTable[t.table] = dryRun ? s.count(t.table, qOf(t)) : s.deleteWhere(t.table, qOf(t))
    return { group, cutoff, rows: Object.values(perTable).reduce((a, b) => a + (b ?? 0), 0), perTable }
  })
}

/** Saklama temizliği (elle ya da zamanlanmış); silinen satır sayıları audit'e yazılır */
export function purgeExpired(c: CommandContext): RetentionCount[] {
  requirePermission(c.actor, 'admin.retention')
  return c.store.transaction(() => {
    const out = applyRetention(c.store, c.ix.master.settings, c.now, false)
    audit(c.store, c.actor, c.now, 'retention.purge', 'retention', null, null, Object.fromEntries(out.map((r) => [r.group, r.rows])))
    return out
  })
}

// ---------------------------------------------------------------- audit görüntüleyici (R-058)

export interface AuditFilter {
  from: number
  to: number
  user?: string | null
  /** İşlem adı parçası, ör. "alarm" ya da "config." */
  action?: string | null
  entity?: string | null
  entityId?: string | null
  limit?: number
  offset?: number
}

/** Ekranda bir sayfada en fazla bu kadar kayıt (CSV sınırsız) */
export const AUDIT_LIMIT_MAX = 1000

export function auditQuery(store: Store, f: AuditFilter): { entries: AuditEntry[]; total: number } {
  const user = f.user?.trim().toLocaleLowerCase('tr')
  const id = f.entityId?.trim().toLocaleLowerCase('tr')
  const rows = store
    .find('audit_log', {
      where: f.entity ? { entity: f.entity } : undefined,
      contains: f.action?.trim() ? { field: 'action', value: f.action.trim() } : undefined,
      range: { field: 't', gte: f.from, lt: f.to },
      orderBy: 't',
      desc: true,
    })
    .filter((e) => (!user || e.user.toLocaleLowerCase('tr').includes(user)) && (!id || (e.entityId ?? '').toLocaleLowerCase('tr').includes(id)))
  const offset = Math.max(0, f.offset ?? 0)
  const limit = Math.max(1, f.limit ?? 200)
  return { total: rows.length, entries: rows.slice(offset, offset + limit) }
}

/** Audit işlemlerinin Türkçe adları (bilinmeyen işlem kendi koduyla gösterilir) */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Giriş',
  'auth.logout': 'Çıkış',
  'note.create': 'Not',
  'alarm.ack': 'Alarm onayı',
  'alarm.assign': 'Alarm ataması',
  'alarm.close': 'Alarm kapatma',
  'andon.create': 'Andon',
  'rework.advance': 'Rework adımı',
  'rework.update': 'Rework güncelleme',
  'motor.hold': 'HOLD',
  'hold.release': 'HOLD serbest bırakma',
  'hold.rework': "HOLD → rework",
  'station.login': 'İstasyon girişi',
  'station.login.denied': 'İstasyon girişi reddedildi',
  'station.logout': 'İstasyon çıkışı',
  'op.confirm': 'Operasyon onayı',
  'tightening.export': 'Tork dışa aktarımı',
  'audit.export': 'Audit dışa aktarımı',
  'collector.pull': '"Şimdi çek"',
  'config.line': 'Hat ayarları',
  'config.station': 'İstasyon ana verisi',
  'config.routing': 'Ön montaj beslemesi',
  'config.alarmRule': 'Alarm kuralı',
  'config.integration': 'Entegrasyon ayarı',
  'config.retention': 'Saklama süreleri',
  'config.backup': 'Yedek ayarı',
  'role.permissions': 'Rol izinleri',
  'user.create': 'Kullanıcı ekleme',
  'user.update': 'Kullanıcı güncelleme',
  'user.activate': 'Kullanıcı aktifleştirme',
  'user.deactivate': 'Kullanıcı pasifleştirme',
  'user.pin': 'PIN sıfırlama',
  'user.unlock': 'Kilit açma',
  'retention.purge': 'Saklama temizliği',
  'backup.create': 'Yedek',
}

export function auditCsv(entries: AuditEntry[]): string {
  return toCsv(entries, [
    { header: 'Zaman', value: (e) => csvTime(e.t) },
    { header: 'Kullanıcı', value: (e) => e.user },
    { header: 'İşlem', value: (e) => AUDIT_ACTION_LABEL[e.action] ?? e.action },
    { header: 'İşlem kodu', value: (e) => e.action },
    { header: 'Kayıt', value: (e) => e.entity },
    { header: 'Kayıt no', value: (e) => e.entityId },
    { header: 'Önce', value: (e) => e.before },
    { header: 'Sonra', value: (e) => e.after },
  ])
}

export const auditCsvName = (from: number, to: number) => `audit-${csvTime(from).slice(0, 10)}_${csvTime(to).slice(0, 10)}.csv`
