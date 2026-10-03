import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { storeDdl } from './schema'

/**
 * Uygulama veritabanını açar ve ileri doğru migration'ları uygular (PRAGMA user_version).
 * Veri asla düşürülmez: yapı değişikliği yeni bir migration olarak eklenir (R-062).
 */

type Migration = (db: DatabaseSync) => void

const MIGRATIONS: Migration[] = [
  // 1: uygulama tabloları + kullanıcı kimlik bilgileri + oturumlar
  (db) => {
    db.exec(storeDdl())
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_user (
        personnel_no TEXT PRIMARY KEY,
        rfid TEXT UNIQUE,
        secret_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session (
        token_hash TEXT PRIMARY KEY,
        personnel_no TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_session_expires ON session (expires_at);
    `)
  },
  // 2: teknisyen terminali — istasyon girişleri ve operasyon onayları (yeni tablolar; mevcut veri korunur)
  (db) => db.exec(storeDdl()),
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  // timeout: yedekleme gibi başka bir bağlantı kilitliyse beklesin
  const db = new DatabaseSync(path, { timeout: 10_000 })
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

export function migrate(db: DatabaseSync): void {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (current > MIGRATIONS.length) throw new Error(`Veritabanı sürümü (${current}) uygulamadan yeni (${MIGRATIONS.length}); uygulamayı güncelleyin`)
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      MIGRATIONS[v](db)
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}
