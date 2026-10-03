/**
 * SUNUCU — collector (fabrika SQL Server'ı → uygulama veritabanı, 3–5 dk'da bir) + REST API
 * + derlenmiş arayüz (dist/ varsa). Uygulama veritabanına (SQLite) yazan tek süreç budur.
 *
 *   npm run server     (geliştirme; ya da npm run stack: simülatör + sunucu + arayüz birlikte)
 *   npm start          (canlı: npm run build && npm run build:server sonrası; docs/kurulum.md)
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { ConnectionPool } from 'mssql'
import { MASTER_KEY, RBAC_KEY, SYSTEM_ACTOR, loadMaster, loadRbac, masterRev, purgeExpired } from '@/domain/admin'
import { audit } from '@/domain/commands'
import { indexMaster } from '@/domain/lineDef'
import type { MasterIndex } from '@/domain/lineDef'
import { tableCounts } from '@/domain/maintenance'
import type { IntegrationTest } from '@/domain/maintenance'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, mergeNewPermissions } from '@/domain/rbac'
import type { RolePermissions } from '@/domain/rbac'
import type { TableName } from '@/domain/store/Store'
import type { MasterData } from '@/domain/types'
import { APP_VERSION } from '@/lib/version'
import { buildApp } from './api/app'
import { serveStatic } from './api/static'
import { Auth } from './auth/auth'
import { Collector } from './collector/Collector'
import { SqlServerReader } from './collector/sqlReader'
import { SqliteStore } from './db/SqliteStore'
import { createBackup, listBackups, pruneBackups } from './db/backupLib'
import { COLUMNS } from './db/schema'
import { openDatabase } from './db/sqlite'
import { LOG_FILE, readLogTail, rotateIfLarge } from './shared/logs'
import { env, log } from './shared/env'
import { connect } from './shared/mssql'

const say = (...a: unknown[]) => log('server', ...a)
const startedAt = Date.now()

const db = openDatabase(env.sqlitePath)
const store = new SqliteStore(db)

// Ana veri ve rol izinleri uygulama veritabanında; admin ekranından yönetilir. İlk açılışta varsayılanlar
// yazılır (çekme aralığı .env'den); sonraki sürümlerde eklenen alanlar ve kurallar varsayılanlarıyla tamamlanır.
const storedMaster = store.kvGet<MasterData>(MASTER_KEY)
const normalized = loadMaster(store)
if (!storedMaster) normalized.config.collectIntervalMin = env.collectIntervalMin
if (JSON.stringify(normalized) !== JSON.stringify(storedMaster)) store.kvSet(MASTER_KEY, normalized)
else if (process.env.COLLECT_INTERVAL_MIN && env.collectIntervalMin !== normalized.config.collectIntervalMin)
  say(`COLLECT_INTERVAL_MIN (${env.collectIntervalMin}) yalnızca ilk kurulumda kullanılır; geçerli çekme aralığı admin ayarı: ${normalized.config.collectIntervalMin} dk`)

const storedRbac = store.kvGet<RolePermissions>(RBAC_KEY)
if (!storedRbac) store.kvSet(RBAC_KEY, DEFAULT_ROLE_PERMISSIONS)
else {
  // Sonraki sürümlerde eklenen izinler varsayılan rollerine eklenir; admin'in kaldırdıklarına dokunulmaz
  const known = store.kvGet<string[]>('rbac:known') ?? [...new Set(Object.values(storedRbac).flat())]
  const merged = mergeNewPermissions(storedRbac, known)
  if (merged !== storedRbac) {
    store.kvSet(RBAC_KEY, merged)
    say('Yeni izinler varsayılan rollere eklendi:', ALL_PERMISSIONS.filter((p) => !known.includes(p)).join(', '))
  }
}
store.kvSet('rbac:known', ALL_PERMISSIONS)

let master: MasterData = loadMaster(store)
let ix: MasterIndex = indexMaster(master)
let rev = masterRev(store)
const rbac = () => loadRbac(store)

const auth = new Auth({ db, people: () => master.people, rbac })
const seeded = auth.seed(env.defaultSecret, Date.now())
if (seeded) say(`${seeded} kullanıcıya ilk PIN / şifre atandı ("${env.defaultSecret}"). Canlıya almadan önce değiştirin.`)

// SQL Server bağlantısı: kopunca bir sonraki turda yeniden kurulur
let pool: ConnectionPool | null = null
async function getPool(): Promise<ConnectionPool> {
  if (pool?.connected) return pool
  await pool?.close().catch(() => {})
  pool = await connect()
  return pool
}

mkdirSync('logs', { recursive: true })
if (rotateIfLarge()) say(`${LOG_FILE} 20 MB'ı geçti; ${LOG_FILE}.1 olarak saklandı`)

const reader = new SqlServerReader(getPool)
// Collector olayları uygulama loguna da yazılır (Bakım & Entegrasyon ekranı, R-073)
let appLog: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void } | null = null
const collector = new Collector({
  store,
  ix: () => ix,
  reader,
  intervalMin: master.config.collectIntervalMin,
  onRun: (r) => {
    if (!r.ok) {
      say('Collector hatası:', r.error)
      appLog?.error({ scope: 'collector' }, `Collector hatası: ${r.error}`)
    } else if (r.rows > 0) {
      say(`Collector: ${r.rows} satır işlendi (${r.durationMs} ms)`)
      appLog?.info({ scope: 'collector' }, `${r.rows} satır işlendi (${r.durationMs} ms)`)
    }
  },
})

/** Admin ana veriyi ya da izinleri değiştirince: indeks ve collector aralığı hemen yenilenir */
function reloadMaster(): void {
  master = loadMaster(store)
  ix = indexMaster(master)
  rev = masterRev(store)
  collector.setIntervalMin(master.config.collectIntervalMin)
}

async function integrationTest(): Promise<IntegrationTest> {
  const t = Date.now()
  try {
    const maxIds = await reader.maxIds()
    return { ok: true, ms: Date.now() - t, error: null, maxIds }
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: (e as Error).message.split('\n')[0], maxIds: null }
  }
}

const size = (f: string) => (existsSync(f) ? statSync(f).size : 0)
const schemaVersion = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

const https = env.https.key && env.https.cert ? { key: readFileSync(env.https.key), cert: readFileSync(env.https.cert) } : null
const app = buildApp({
  store,
  master: () => master,
  ix: () => ix,
  rbac,
  auth,
  collector,
  secureCookies: !!https || env.cookieSecure,
  logger: { level: 'info', file: LOG_FILE },
  onMasterChange: reloadMaster,
  backups: { list: () => listBackups(), create: (now) => createBackup(db, now), prune: (keep) => pruneBackups(keep) },
  integrationTest,
  system: {
    source: `SQL Server ${env.mssql.host}:${env.mssql.port}/${env.mssql.database}`,
    preview: (table, limit) => reader.preview(table, limit),
    logs: (minLevel) => readLogTail(LOG_FILE, minLevel),
    info: () => ({
      mode: 'server',
      appDb: { kind: 'SQLite', path: env.sqlitePath, sizeBytes: size(env.sqlitePath) + size(`${env.sqlitePath}-wal`), schemaVersion: schemaVersion() },
      rows: tableCounts(store, Object.keys(COLUMNS) as TableName[]),
      backups: listBackups(),
      logFile: LOG_FILE,
      startedAt,
      version: APP_VERSION,
    }),
  },
})
appLog = app.log
// Derlenmiş arayüz (npm run build) aynı adresten sunulur; geliştirmede arayüzü Vite sunar
if (existsSync('dist/index.html')) serveStatic(app, 'dist')

/**
 * Günlük işler (R-075, R-010): ayarlanan saatten sonra günde bir kez yedek alınır (son N yedek tutulur)
 * ve süresi dolan kayıtlar temizlenir. Sunucu o saatte kapalıysa açıldığında yapılır.
 */
function dailyJobs(): void {
  const now = Date.now()
  const d = new Date(now)
  const today = d.toDateString()
  const s = master.settings
  if (d.getHours() < s.backup.hour) return
  if (s.backup.enabled && store.kvGet<string>('job:backup') !== today) {
    try {
      const b = createBackup(db, now)
      const pruned = pruneBackups(s.backup.keep)
      audit(store, SYSTEM_ACTOR, now, 'backup.create', 'backup', b.file, null, { sizeBytes: b.sizeBytes, pruned })
      appLog?.info({ scope: 'yedek' }, `Otomatik yedek: ${b.file} (${Math.round(b.sizeBytes / 1024)} KB), ${pruned} eski yedek silindi`)
    } catch (e) {
      appLog?.error({ scope: 'yedek' }, `Otomatik yedek alınamadı: ${(e as Error).message}`)
    }
    store.kvSet('job:backup', today)
  }
  if (store.kvGet<string>('job:retention') !== today) {
    try {
      const out = purgeExpired({ store, ix, actor: SYSTEM_ACTOR, now })
      const rows = out.reduce((a, g) => a + g.rows, 0)
      if (rows) appLog?.info({ scope: 'saklama' }, `Saklama temizliği: ${rows} satır silindi`)
    } catch (e) {
      appLog?.error({ scope: 'saklama' }, `Saklama temizliği yapılamadı: ${(e as Error).message}`)
    }
    store.kvSet('job:retention', today)
  }
}

setInterval(() => {
  // Ana veri başka bir yoldan (ör. geri yükleme sonrası) değiştiyse de yenilenir
  if (masterRev(store) !== rev) reloadMaster()
  auth.purgeExpired(Date.now())
}, 60_000).unref()
setInterval(dailyJobs, 10 * 60_000).unref()

await app.listen({ port: env.apiPort, host: env.apiHost })
say(`API: http${https ? 's' : ''}://${env.apiHost}:${env.apiPort} · uygulama veritabanı: ${env.sqlitePath} · SQL Server: ${env.mssql.host}:${env.mssql.port}/${env.mssql.database} · çekme aralığı ${master.config.collectIntervalMin} dk`)
collector.start()
dailyJobs()

const stop = async () => {
  collector.stop()
  await app.close()
  await pool?.close().catch(() => {})
  db.close()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
