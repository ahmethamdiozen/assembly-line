/**
 * HAT SİMÜLATÖRÜ (fabrika tarafı) — PLC, tork controller'ları, vision ve ağ geçidinin yerine
 * fabrikanın SQL Server'ına satır yazar. Gerçek veri geldiğinde bu süreç çalıştırılmaz.
 *
 *   npm run sim          kaldığı yerden devam eder (aradaki boşluğu doldurur)
 *   npm run sim:reset    SQL Server tablolarını ve uygulama veritabanını sıfırlar, son 24 saati yeniden üretir
 *
 * Simülatör deterministiktir: başlangıç (t0) ve tohum dbo.SimState'te saklanır; yeniden başlarken
 * son yazılan ana kadar yazmadan tekrar oynatılır, sonra yazmaya devam edilir.
 */
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ConnectionPool } from 'mssql'
import { LineSim, alignMinute } from '@/sim/lineSim'
import { env, log } from '../shared/env'
import { connect, ensureDatabase, retry, runSqlFile, sql } from '../shared/mssql'
import { BufferSink, nullSink } from './writer'

const SCHEMA_VERSION = 1
const TICK_MS = 5000
const HOUR = 3600 * 1000
const say = (...a: unknown[]) => log('sim', ...a)
const reset = process.argv.includes('--reset')

const TABLES = ['MotorRegistry', 'StationEvents', 'OperationEvents', 'ComponentScans', 'TighteningResults', 'VisionResults', 'VisionImages', 'SubassemblyCounters', 'DeviceHeartbeats', 'IoSignals', 'SchemaInfo', 'SimState']

async function setupSchema(pool: ConnectionPool): Promise<void> {
  const v = await pool.request().query(`IF OBJECT_ID('dbo.SchemaInfo') IS NULL SELECT CAST(NULL AS int) AS Version ELSE SELECT TOP 1 Version FROM dbo.SchemaInfo`)
  const current = v.recordset[0]?.Version ?? null
  if (!reset && current === SCHEMA_VERSION) return
  say(reset ? 'Sıfırlanıyor: SQL Server tabloları yeniden kuruluyor' : `Şema sürümü ${current ?? 'yok'} → ${SCHEMA_VERSION}: tablolar kuruluyor`)
  for (const t of TABLES) await pool.request().batch(`IF OBJECT_ID('dbo.${t}') IS NOT NULL DROP TABLE dbo.${t}`)
  await runSqlFile(pool, fileURLToPath(new URL('../sql/schema.sql', import.meta.url)))
  await pool.request().batch(`INSERT INTO dbo.SchemaInfo (Version) VALUES (${SCHEMA_VERSION})`)
  await pool.request().batch('CREATE TABLE dbo.SimState (Id int NOT NULL PRIMARY KEY, T0Ms bigint NOT NULL, StartMs bigint NOT NULL, Seed int NOT NULL, LastMs bigint NOT NULL)')
  // Uygulama veritabanı da sıfırlanır; aksi halde collector'ın okuma konumu yeni tablolarla uyuşmaz
  for (const suffix of ['', '-wal', '-shm']) rmSync(env.sqlitePath + suffix, { force: true })
  say(`Uygulama veritabanı (${env.sqlitePath}) da sıfırlandı. Sunucu çalışıyorsa yeniden başlatın.`)
}

async function main(): Promise<void> {
  await retry(ensureDatabase, 'SQL Server', say)
  const pool = await retry(connect, `${env.mssql.database} veritabanı`, say)
  await setupSchema(pool)

  let state = (await pool.request().query('SELECT TOP 1 T0Ms, StartMs, Seed, LastMs FROM dbo.SimState')).recordset[0] as { T0Ms: string; StartMs: string; Seed: number; LastMs: string } | undefined
  if (!state) {
    const t0 = alignMinute(Date.now())
    state = { T0Ms: String(t0), StartMs: String(t0 - 24 * HOUR), Seed: 50, LastMs: String(t0 - 24 * HOUR) }
    await pool
      .request()
      .input('t0', sql.BigInt, t0)
      .input('s', sql.BigInt, t0 - 24 * HOUR)
      .query('INSERT INTO dbo.SimState (Id, T0Ms, StartMs, Seed, LastMs) VALUES (1, @t0, @s, 50, @s)')
    say('Yeni simülasyon: son 24 saat üretilecek')
  }
  const sim = new LineSim({ t0: Number(state.T0Ms), startT: Number(state.StartMs), seed: state.Seed })
  const last = Number(state.LastMs)
  if (last > sim.now) {
    const a = Date.now()
    sim.advance(last, nullSink)
    say(`Kaldığı yere kadar tekrar oynatıldı (${Math.round((last - sim.startT) / HOUR)} sa, ${Date.now() - a} ms)`)
  }

  const sink = new BufferSink()
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      sim.advance(Date.now(), sink)
      if (sink.count === 0) return
      const n = sink.count
      const a = Date.now()
      const lastMs = sim.now
      await sink.flush(pool, async (tx) => {
        await new sql.Request(tx).input('l', sql.BigInt, lastMs).query('UPDATE dbo.SimState SET LastMs = @l WHERE Id = 1')
      })
      if (n > 1000) say(`${n} satır yazıldı (${Date.now() - a} ms)`)
    } catch (e) {
      say('Yazma hatası:', (e as Error).message)
    } finally {
      busy = false
    }
  }
  await tick()
  say(`Çalışıyor: ${TICK_MS / 1000} sn'de bir SQL Server'a yazılıyor (${env.mssql.host}:${env.mssql.port}/${env.mssql.database})`)
  const timer = setInterval(() => void tick(), TICK_MS)
  const stop = async () => {
    clearInterval(timer)
    await tick()
    await pool.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}

main().catch((e) => {
  say('Hata:', e)
  process.exit(1)
})
