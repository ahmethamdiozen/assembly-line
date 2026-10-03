import { TABLE_INDEXES } from './Store'
import type { Query, Store, TableName, Tables } from './Store'

type AnyRow = { id: string } & Record<string, unknown>

class MemTable {
  readonly rows = new Map<string, AnyRow>()
  /** Ekleme sırası: indeksli aramada da tablo sırası korunur */
  readonly order = new Map<string, number>()
  readonly idx = new Map<string, Map<unknown, Set<string>>>()
  seq = 0

  constructor(indexed: string[]) {
    for (const f of indexed) this.idx.set(f, new Map())
  }

  addIdx(row: AnyRow): void {
    for (const [f, m] of this.idx) {
      const v = row[f]
      let set = m.get(v)
      if (!set) m.set(v, (set = new Set()))
      set.add(row.id)
    }
  }

  delIdx(row: AnyRow): void {
    for (const [f, m] of this.idx) m.get(row[f])?.delete(row.id)
  }
}

function matches<T>(row: AnyRow, q: Query<T>): boolean {
  if (q.where) for (const k in q.where) if (row[k] !== (q.where as Record<string, unknown>)[k]) return false
  if (q.in) for (const k in q.in) if (!(q.in as Record<string, readonly unknown[]>)[k].includes(row[k])) return false
  if (q.isNull) for (const k of q.isNull) if (row[k as string] !== null) return false
  if (q.notNull) for (const k of q.notNull) if (row[k as string] === null) return false
  if (q.contains) {
    const v = row[q.contains.field as string]
    if (typeof v !== 'string' || !v.toLowerCase().includes(q.contains.value.toLowerCase())) return false
  }
  if (q.range) {
    const v = row[q.range.field as string]
    if (typeof v !== 'number') return false
    if (q.range.gte !== undefined && v < q.range.gte) return false
    if (q.range.lt !== undefined && v >= q.range.lt) return false
  }
  return true
}

/** Bellek içi depo: web demosu ve testler. */
export class MemoryStore implements Store {
  private tables = new Map<string, MemTable>()
  private kv = new Map<string, string>()

  private t(name: TableName): MemTable {
    let tb = this.tables.get(name)
    if (!tb) this.tables.set(name, (tb = new MemTable(TABLE_INDEXES[name] as string[])))
    return tb
  }

  insert<K extends TableName>(table: K, row: Tables[K]): void {
    const tb = this.t(table)
    const r = { ...(row as unknown as AnyRow) }
    if (tb.rows.has(r.id)) throw new Error(`${table}: ${r.id} zaten var`)
    tb.rows.set(r.id, r)
    tb.order.set(r.id, tb.seq++)
    tb.addIdx(r)
  }

  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Tables[K] {
    const tb = this.t(table)
    const old = tb.rows.get(id)
    if (!old) throw new Error(`${table}: ${id} bulunamadı`)
    const next = { ...old, ...(patch as Record<string, unknown>), id }
    tb.delIdx(old)
    tb.rows.set(id, next)
    tb.addIdx(next)
    return next as unknown as Tables[K]
  }

  upsert<K extends TableName>(table: K, row: Tables[K]): void {
    const id = (row as unknown as AnyRow).id
    if (this.t(table).rows.has(id)) this.update(table, id, row)
    else this.insert(table, row)
  }

  get<K extends TableName>(table: K, id: string): Tables[K] | undefined {
    return this.t(table).rows.get(id) as unknown as Tables[K] | undefined
  }

  find<K extends TableName>(table: K, q: Query<Tables[K]> = {}): Tables[K][] {
    const tb = this.t(table)
    let candidates: Iterable<AnyRow> = tb.rows.values()
    // İndeksli bir eşitlik / "in" koşulu varsa adayları daralt
    const idxField = Object.keys(q.where ?? {}).find((f) => tb.idx.has(f)) ?? Object.keys(q.in ?? {}).find((f) => tb.idx.has(f))
    if (idxField) {
      const m = tb.idx.get(idxField)!
      const values = q.where && idxField in q.where ? [(q.where as Record<string, unknown>)[idxField]] : (q.in as Record<string, unknown[]>)[idxField]
      const ids = new Set<string>()
      for (const v of values) for (const id of m.get(v) ?? []) ids.add(id)
      candidates = [...ids].sort((a, b) => tb.order.get(a)! - tb.order.get(b)!).map((id) => tb.rows.get(id)!)
    }
    let out: AnyRow[] = []
    for (const r of candidates) if (matches(r, q)) out.push(r)
    if (q.orderBy) {
      const f = q.orderBy as string
      const dir = q.desc ? -1 : 1
      out.sort((a, b) => {
        const x = a[f] as number | string | null
        const y = b[f] as number | string | null
        if (x === y) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (x < y ? -1 : 1) * dir
      })
    } else if (q.desc) out.reverse()
    if (q.offset) out = out.slice(q.offset)
    if (q.limit !== undefined) out = out.slice(0, q.limit)
    return out as unknown as Tables[K][]
  }

  first<K extends TableName>(table: K, q: Query<Tables[K]> = {}): Tables[K] | undefined {
    return this.find(table, { ...q, limit: 1 })[0]
  }

  count<K extends TableName>(table: K, q: Query<Tables[K]> = {}): number {
    return this.find(table, { ...q, limit: undefined, offset: undefined }).length
  }

  kvGet<T>(key: string): T | null {
    const v = this.kv.get(key)
    return v === undefined ? null : (JSON.parse(v) as T)
  }

  kvSet(key: string, value: unknown): void {
    this.kv.set(key, JSON.stringify(value))
  }

  nextSeq(name: string): number {
    const n = (this.kvGet<number>(`seq:${name}`) ?? 0) + 1
    this.kvSet(`seq:${name}`, n)
    return n
  }

  transaction<T>(fn: () => T): T {
    return fn()
  }
}
