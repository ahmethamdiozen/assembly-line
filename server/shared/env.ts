import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

/** Çekme aralığı 3–5 dk ile sınırlıdır (fabrika SQL Server'ına yük bindirmemek için). */
function collectIntervalMin(): number {
  const v = Number(process.env.COLLECT_INTERVAL_MIN ?? 3)
  return Number.isFinite(v) ? Math.min(5, Math.max(3, v)) : 3
}

export const env = {
  mssql: {
    host: process.env.MSSQL_HOST ?? 'localhost',
    port: Number(process.env.MSSQL_PORT ?? 1433),
    user: process.env.MSSQL_USER ?? 'sa',
    password: process.env.MSSQL_SA_PASSWORD ?? 'Tm50!Assembly2026',
    database: process.env.MSSQL_DB ?? 'TM50Line',
  },
  collectIntervalMin: collectIntervalMin(),
  sqlitePath: process.env.SQLITE_PATH ?? 'data/tm50.db',
  apiPort: Number(process.env.API_PORT ?? 3001),
  /** Dışarıdan erişim için 0.0.0.0 (üretimde reverse proxy / güvenlik duvarı ile) */
  apiHost: process.env.API_HOST ?? '127.0.0.1',
  /** HTTPS (R-072): sertifika yolları verilirse API doğrudan HTTPS sunar; yoksa önüne reverse proxy konur */
  https: { key: process.env.HTTPS_KEY ?? '', cert: process.env.HTTPS_CERT ?? '' },
  /** İlk açılışta kullanıcılara atanan PIN / şifre (geliştirme tohumu; canlıda değiştirilmeli) */
  defaultSecret: process.env.DEFAULT_PIN ?? '1234',
}

export const log = (scope: string, ...args: unknown[]) =>
  console.log(`${new Date().toLocaleTimeString('tr-TR')} [${scope}]`, ...args)
