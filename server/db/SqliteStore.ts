import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { Query, Store, TableName, Tables } from '@/domain/store/Store'
import { COLUMNS, q } from './schema'
import type { Kind } from './schema'

/**
 * Store arayüzünün SQLite (node:sqlite) uygulaması — sunucu modunun kalıcı veritabanı.
 * Davranışı bellek deposuyla birebir aynıdır (sıralama, null'lar sonda, ekleme sırası); bu,
 * aynı testlerin iki depoda da çalıştırılmasıyla doğrulanır.
 */

type Row = Record<string, unknown>
type SqlValue = string | number | null

export class SqliteStore implements Store {
  private readonly stmts = new Map<string, StatementSync>()
  private depth = 0
  readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  private stmt(sql: string): StatementSync {
    let s = this.stmts.get(sql)
    if (!s) this.stmts.set(sql, (s = this.db.prepare(sql)))
    return s
  }

  private kinds(table: TableName): Record<string, Kind> {
    return COLUMNS[table] as Record<string, Kind>
  }

  private enc(kind: Kind | undefined, v: unknown): SqlValue {
    if (v === null || v === undefined) return null
    if (kind === 'bool') return v ? 1 : 0
    return v as SqlValue
  }

  private dec(table: TableName, r: Row | undefined): Row | undefined {
    if (!r) return undefined
    const kinds = this.kinds(table)
    const out: Row = {}
    for (const c in kinds) {
      const v = r[c]
      out[c] = v === null || v === undefined ? null : kinds[c] === 'bool' ? v === 1 : v
    }
    return out
  }

  insert<K extends TableName>(table: K, row: Tables[K]): void {
    const kinds = this.kinds(table)
    const cols = Object.keys(kinds)
    const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    const r = row as unknown as Row
    try {
      this.stmt(sql).run(...cols.map((c) => this.enc(kinds[c], r[c])))
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new Error(`${table}: ${String(r.id)} zaten var`)
      throw e
    }
  }

  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Tables[K] {
    const kinds = this.kinds(table)
    const cols = Object.keys(patch).filter((c) => c !== 'id' && c in kinds)
    if (cols.length) {
      const sql = `UPDATE ${q(table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE id = ?`
      const res = this.stmt(sql).run(...cols.map((c) => this.enc(kinds[c], (patch as Row)[c])), id)
      if (res.changes === 0) throw new Error(`${table}: ${id} bulunamadı`)
    }
    const row = this.get(table, id)
    if (!row) throw new Error(`${table}: ${id} bulunamadı`)
    return row
  }

  upsert<K extends TableName>(table: K, row: Tables[K]): void {
    const kinds = this.kinds(table)
    const cols = Object.keys(kinds)
    const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${cols
      .filter((c) => c !== 'id')
      .map((c) => `${q(c)} = excluded.${q(c)}`)
      .join(', ')}`
    const r = row as unknown as Row
    this.stmt(sql).run(...cols.map((c) => this.enc(kinds[c], r[c])))
  }

  get<K extends TableName>(table: K, id: string): Tables[K] | undefined {
    return this.dec(table, this.stmt(`SELECT * FROM ${q(table)} WHERE id = ?`).get(id) as Row | undefined) as Tables[K] | undefined
  }

  private where<K extends TableName>(table: K, qy: Query<Tables[K]>): { sql: string; params: SqlValue[] } {
    const kinds = this.kinds(table)
    const parts: string[] = []
    const params: SqlValue[] = []
    for (const [c, v] of Object.entries(qy.where ?? {})) {
      if (v === null) parts.push(`${q(c)} IS NULL`)
      else {
        parts.push(`${q(c)} = ?`)
        params.push(this.enc(kinds[c], v))
      }
    }
    for (const [c, vs] of Object.entries((qy.in ?? {}) as Record<string, unknown[]>)) {
      if (!vs.length) parts.push('0')
      else {
        parts.push(`${q(c)} IN (${vs.map(() => '?').join(', ')})`)
        params.push(...vs.map((v) => this.enc(kinds[c], v)))
      }
    }
    for (const c of qy.isNull ?? []) parts.push(`${q(String(c))} IS NULL`)
    for (const c of qy.notNull ?? []) parts.push(`${q(String(c))} IS NOT NULL`)
    if (qy.contains) {
      parts.push(`${q(String(qy.contains.field))} LIKE ? ESCAPE '\\'`)
      params.push(`%${qy.contains.value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    }
    if (qy.range) {
      const f = q(String(qy.range.field))
      parts.push(`${f} IS NOT NULL`)
      if (qy.range.gte !== undefined) {
        parts.push(`${f} >= ?`)
        params.push(qy.range.gte)
      }
      if (qy.range.lt !== undefined && Number.isFinite(qy.range.lt)) {
        parts.push(`${f} < ?`)
        params.push(qy.range.lt)
      }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params }
  }

  find<K extends TableName>(table: K, qy: Query<Tables[K]> = {}): Tables[K][] {
    const w = this.where(table, qy)
    let sql = `SELECT * FROM ${q(table)}${w.sql}`
    if (qy.orderBy) {
      const f = q(String(qy.orderBy))
      sql += ` ORDER BY (${f} IS NULL), ${f} ${qy.desc ? 'DESC' : 'ASC'}, rowid ASC`
    } else sql += ` ORDER BY rowid ${qy.desc ? 'DESC' : 'ASC'}`
    const params = [...w.params]
    if (qy.limit !== undefined || qy.offset) {
      sql += ' LIMIT ? OFFSET ?'
      params.push(qy.limit ?? -1, qy.offset ?? 0)
    }
    return (this.stmt(sql).all(...params) as Row[]).map((r) => this.dec(table, r)) as unknown as Tables[K][]
  }

  first<K extends TableName>(table: K, qy: Query<Tables[K]> = {}): Tables[K] | undefined {
    return this.find(table, { ...qy, limit: 1 })[0]
  }

  count<K extends TableName>(table: K, qy: Query<Tables[K]> = {}): number {
    const w = this.where(table, qy)
    return (this.stmt(`SELECT COUNT(*) AS n FROM ${q(table)}${w.sql}`).get(...w.params) as { n: number }).n
  }

  deleteWhere<K extends TableName>(table: K, qy: Query<Tables[K]>): number {
    const w = this.where(table, qy)
    // Koşulsuz silme kazara tabloyu boşaltmasın
    if (!w.sql) throw new Error(`${table}: koşulsuz silme yapılmaz`)
    return Number(this.stmt(`DELETE FROM ${q(table)}${w.sql}`).run(...w.params).changes)
  }

  kvGet<T>(key: string): T | null {
    const r = this.stmt('SELECT v FROM kv WHERE k = ?').get(key) as { v: string } | undefined
    return r ? (JSON.parse(r.v) as T) : null
  }

  kvSet(key: string, value: unknown): void {
    this.stmt('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').run(key, JSON.stringify(value))
  }

  nextSeq(name: string): number {
    return this.transaction(() => {
      const n = (this.kvGet<number>(`seq:${name}`) ?? 0) + 1
      this.kvSet(`seq:${name}`, n)
      return n
    })
  }

  /** İç içe çağrılabilir; sadece en dıştaki çağrı commit / rollback yapar */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++
      try {
        return fn()
      } finally {
        this.depth--
      }
    }
    this.db.exec('BEGIN IMMEDIATE')
    this.depth = 1
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    } finally {
      this.depth = 0
    }
  }
}
