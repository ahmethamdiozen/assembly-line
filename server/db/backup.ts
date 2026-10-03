/**
 * Uygulama veritabanı yedekleme ve geri yükleme (R-075).
 *   npm run db:backup                  → backups/tm50-YYYYMMDD-HHMM.db (sunucu çalışırken de alınabilir)
 *   npm run db:restore -- <dosya>      → yedeği geri yükler (sunucu KAPALIYKEN çalıştırın)
 * SQLite'ın VACUUM INTO komutu tutarlı, sıkıştırılmış bir kopya üretir.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { env, log } from '../shared/env'
import { createBackup } from './backupLib'

const say = (...a: unknown[]) => log('yedek', ...a)

if (process.argv.includes('--restore')) {
  const file = process.argv[process.argv.indexOf('--restore') + 1]
  if (!file || !existsSync(file)) {
    say('Geri yüklenecek yedek dosyasını verin: npm run db:restore -- backups/tm50-....db')
    process.exit(1)
  }
  const check = new DatabaseSync(file, { readOnly: true })
  const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check
  check.close()
  if (ok !== 'ok') {
    say('Yedek dosyası bozuk:', ok)
    process.exit(1)
  }
  for (const s of ['-wal', '-shm']) rmSync(env.sqlitePath + s, { force: true })
  copyFileSync(file, env.sqlitePath)
  say(`${file} → ${env.sqlitePath} geri yüklendi. Sunucuyu başlatabilirsiniz.`)
} else {
  if (!existsSync(env.sqlitePath)) {
    say(`Veritabanı yok: ${env.sqlitePath}`)
    process.exit(1)
  }
  const db = new DatabaseSync(env.sqlitePath, { timeout: 10_000 })
  const b = createBackup(db)
  db.close()
  say(`Yedek alındı: ${b.file}`)
}
