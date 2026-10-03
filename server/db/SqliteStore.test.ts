import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from '@/domain/lineDef'
import { MemoryStore } from '@/domain/store/MemoryStore'
import type { Store, TableName } from '@/domain/store/Store'
import { storeContract } from '@/domain/store/storeContract'
import { RawDb } from '@/pipeline/rawDb'
import { applyCollected } from '@/pipeline/transform'
import { LineSim } from '@/sim/lineSim'
import { SqliteStore } from './SqliteStore'
import { COLUMNS } from './schema'
import { SCHEMA_VERSION, migrate, openDatabase } from './sqlite'
import { DatabaseSync } from 'node:sqlite'
import { storeDdl } from './schema'

const dir = mkdtempSync(join(tmpdir(), 'tm50-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

storeContract('SqliteStore', () => new SqliteStore(openDatabase(':memory:')))

const ix = indexMaster(defaultMaster())
const t0 = new Date(2026, 9, 3, 14, 30).getTime()
const HOUR = 3600_000

function fill(store: Store, hours = 8) {
  const db = new RawDb()
  const sim = new LineSim({ t0, startT: t0 - hours * HOUR })
  // İlk tur geçmişi, sonra 3 dk'da bir
  sim.advance(t0 - HOUR, db)
  applyCollected(store, ix, db.since(store.kvGet('sync') ?? {}), t0 - HOUR)
  for (let t = t0 - HOUR + 180_000; t <= t0; t += 180_000) {
    sim.advance(t, db)
    applyCollected(store, ix, db.since(store.kvGet('sync') ?? {}), t)
  }
}

const dump = (s: Store, table: TableName) => s.find(table).map((r) => JSON.stringify(r))

describe('SqliteStore', () => {
  it('veri hattı SQLite\'ta bellek deposuyla birebir aynı sonucu üretir', () => {
    const mem = new MemoryStore()
    const sql = new SqliteStore(openDatabase(':memory:'))
    fill(mem)
    fill(sql)
    for (const table of Object.keys(COLUMNS) as TableName[]) expect(dump(sql, table), table).toEqual(dump(mem, table))
    expect(sql.kvGet('sync')).toEqual(mem.kvGet('sync'))
    expect(sql.count('motor_op')).toBeGreaterThan(500)
  })

  it('veri yeniden başlatmadan sonra korunur; migration tekrar çalışmaz (R-062)', () => {
    const path = join(dir, 'tm50.db')
    const a = openDatabase(path)
    const s1 = new SqliteStore(a)
    fill(s1, 3)
    const motors = s1.count('motor')
    const alarms = dump(s1, 'alarm')
    a.close()
    const b = openDatabase(path)
    expect((b.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION)
    const s2 = new SqliteStore(b)
    expect(s2.count('motor')).toBe(motors)
    expect(dump(s2, 'alarm')).toEqual(alarms)
    expect(s2.nextSeq('alarm')).toBe(alarms.length + 1)
    b.close()
  })

  it('transaction hata olursa geri alınır; iç içe çağrılar dıştakine katılır', () => {
    const s = new SqliteStore(openDatabase(':memory:'))
    expect(() =>
      s.transaction(() => {
        s.kvSet('a', 1)
        s.transaction(() => s.kvSet('b', 2))
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect([s.kvGet('a'), s.kvGet('b')]).toEqual([null, null])
    s.transaction(() => s.transaction(() => s.kvSet('c', 3)))
    expect(s.kvGet('c')).toBe(3)
  })
})

describe('migration (R-062)', () => {
  it('sürüm 1 veritabanı sürüm 2\'ye yükselir; mevcut veri korunur, yeni tablolar eklenir', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(storeDdl())
    db.exec('DROP TABLE station_login; DROP TABLE op_confirmation; PRAGMA user_version = 1;')
    db.prepare('INSERT INTO motor (id, createdAt, status) VALUES (?, ?, ?)').run('TM50-261003-0001', t0, 'in_line')
    migrate(db)
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION)
    const s = new SqliteStore(db)
    expect(s.get('motor', 'TM50-261003-0001')?.status).toBe('in_line')
    s.insert('station_login', { id: 'SL-1', op: 'OP070', personnelNo: 'T-1044', name: 'Ece Kara', shiftId: 'A', loginAt: t0, logoutAt: null, rosterMatch: true })
    expect(s.find('station_login', { isNull: ['logoutAt'] })[0].rosterMatch).toBe(true)
    db.exec('PRAGMA user_version = 99')
    expect(() => migrate(db)).toThrow(/uygulamadan yeni/)
  })
})
