/**
 * SUNUCU — collector (fabrika SQL Server'ı → uygulama veritabanı, 3–5 dk'da bir) + REST API.
 * Uygulama veritabanına (SQLite) yazan tek süreç budur.
 *
 *   npm run server     (ya da npm run stack: simülatör + sunucu + arayüz birlikte)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import type { ConnectionPool } from 'mssql'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import type { MasterIndex } from '@/domain/lineDef'
import { tableCounts } from '@/domain/maintenance'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, mergeNewPermissions } from '@/domain/rbac'
import type { TableName } from '@/domain/store/Store'
import { APP_VERSION } from '@/lib/version'
import type { RolePermissions } from '@/domain/rbac'
import type { MasterData } from '@/domain/types'
import { buildApp } from './api/app'
import { Auth } from './auth/auth'
import { Collector } from './collector/Collector'
import { SqlServerReader } from './collector/sqlReader'
import { SqliteStore } from './db/SqliteStore'
import { COLUMNS } from './db/schema'
import { openDatabase } from './db/sqlite'
import { LOG_FILE, readLogTail, rotateIfLarge } from './shared/logs'
import { env, log } from './shared/env'
import { connect } from './shared/mssql'

const say = (...a: unknown[]) => log('server', ...a)
const startedAt = Date.now()

const db = openDatabase(env.sqlitePath)
const store = new SqliteStore(db)

// Ana veri ve rol izinleri uygulama veritabanında; ilk açılışta varsayılanlar yazılır (admin Faz 6'da düzenler)
if (!store.kvGet<MasterData>('master')) store.kvSet('master', defaultMaster())
const storedRbac = store.kvGet<RolePermissions>('rbac')
if (!storedRbac) store.kvSet('rbac', DEFAULT_ROLE_PERMISSIONS)
else {
  // Sonraki sürümlerde eklenen izinler varsayılan rollerine eklenir; admin'in kaldırdıklarına dokunulmaz
  const known = store.kvGet<string[]>('rbac:known') ?? [...new Set(Object.values(storedRbac).flat())]
  const merged = mergeNewPermissions(storedRbac, known)
  if (merged !== storedRbac) {
    store.kvSet('rbac', merged)
    say('Yeni izinler varsayılan rollere eklendi:', ALL_PERMISSIONS.filter((p) => !known.includes(p)).join(', '))
  }
}
store.kvSet('rbac:known', ALL_PERMISSIONS)
let master = store.kvGet<MasterData>('master')!
let ix: MasterIndex = indexMaster(master)
const rbac = () => store.kvGet<RolePermissions>('rbac') ?? DEFAULT_ROLE_PERMISSIONS

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
let appLog: { info: (o: object, m: string) => void; error: (o: object, m: string) => void } | null = null
const collector = new Collector({
  store,
  ix: () => ix,
  reader,
  intervalMin: env.collectIntervalMin,
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

const size = (f: string) => (existsSync(f) ? statSync(f).size : 0)
const backups = () =>
  existsSync('backups')
    ? readdirSync('backups')
        .filter((f) => f.endsWith('.db'))
        .map((f) => {
          const st = statSync(`backups/${f}`)
          return { file: `backups/${f}`, t: st.mtimeMs, sizeBytes: st.size }
        })
        .sort((a, b) => b.t - a.t)
    : []
const schemaVersion = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

const https = env.https.key && env.https.cert ? { key: readFileSync(env.https.key), cert: readFileSync(env.https.cert) } : null
const app = buildApp({
  store,
  master: () => master,
  ix: () => ix,
  rbac,
  auth,
  collector,
  secureCookies: !!https,
  logger: { level: 'info', file: LOG_FILE },
  system: {
    source: `SQL Server ${env.mssql.host}:${env.mssql.port}/${env.mssql.database}`,
    preview: (table, limit) => reader.preview(table, limit),
    logs: (minLevel) => readLogTail(LOG_FILE, minLevel),
    info: () => ({
      mode: 'server',
      appDb: { kind: 'SQLite', path: env.sqlitePath, sizeBytes: size(env.sqlitePath) + size(`${env.sqlitePath}-wal`), schemaVersion: schemaVersion() },
      rows: tableCounts(store, Object.keys(COLUMNS) as TableName[]),
      backups: backups(),
      logFile: LOG_FILE,
      startedAt,
      version: APP_VERSION,
    }),
  },
})
appLog = app.log

// Ana veri değişirse (admin) indeks yenilenir
setInterval(() => {
  const m = store.kvGet<MasterData>('master')
  if (m && JSON.stringify(m) !== JSON.stringify(master)) {
    master = m
    ix = indexMaster(m)
  }
  auth.purgeExpired(Date.now())
}, 60_000).unref()

await app.listen({ port: env.apiPort, host: env.apiHost })
say(`API: http${https ? 's' : ''}://${env.apiHost}:${env.apiPort} · uygulama veritabanı: ${env.sqlitePath} · SQL Server: ${env.mssql.host}:${env.mssql.port}/${env.mssql.database} · çekme aralığı ${env.collectIntervalMin} dk`)
collector.start()

const stop = async () => {
  collector.stop()
  await app.close()
  await pool?.close().catch(() => {})
  db.close()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
