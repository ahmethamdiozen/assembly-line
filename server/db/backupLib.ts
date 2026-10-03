import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Uygulama veritabanı yedekleri (R-075). SQLite'ın VACUUM INTO komutu çalışan veritabanından
 * tutarlı, sıkıştırılmış bir kopya üretir; sunucu açıkken alınabilir.
 */

export const BACKUP_DIR = 'backups'

export interface BackupInfo {
  file: string
  t: number
  sizeBytes: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function createBackup(db: DatabaseSync, now = Date.now(), dir = BACKUP_DIR): BackupInfo {
  mkdirSync(dir, { recursive: true })
  const d = new Date(now)
  const base = `${dir}/tm50-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  let file = `${base}.db`
  for (let i = 2; existsSync(file); i++) file = `${base}-${i}.db`
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  return { file, t: now, sizeBytes: statSync(file).size }
}

export function listBackups(dir = BACKUP_DIR): BackupInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^tm50-.*\.db$/.test(f))
    .map((f) => {
      const st = statSync(`${dir}/${f}`)
      return { file: `${dir}/${f}`, t: st.mtimeMs, sizeBytes: st.size }
    })
    .sort((a, b) => b.t - a.t)
}

/** En yeni `keep` yedek kalır; silinen dosya sayısını döndürür */
export function pruneBackups(keep: number, dir = BACKUP_DIR): number {
  const old = listBackups(dir).slice(keep)
  for (const b of old) rmSync(b.file, { force: true })
  return old.length
}
