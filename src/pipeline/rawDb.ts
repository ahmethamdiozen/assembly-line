import { RAW_TABLES } from './rows'
import type { LastIds, NewRow, RawBatch, RawRows, RawSink, RawTable } from './rows'

/**
 * Bellek içi "fabrika SQL Server'ı": web demosu ve testlerde simülatör buraya yazar,
 * collector buradan `Id > son okunan` ile okur. Sunucu modunda yerini gerçek SQL Server alır.
 */
export class RawDb implements RawSink {
  readonly tables = Object.fromEntries(RAW_TABLES.map((t) => [t, []])) as unknown as { [K in RawTable]: RawRows[K][] }
  private lastId = Object.fromEntries(RAW_TABLES.map((t) => [t, 0])) as Record<RawTable, number>

  write<K extends RawTable>(table: K, row: NewRow<K>): void {
    const id = ++this.lastId[table]
    ;(this.tables[table] as RawRows[K][]).push({ ...row, id } as RawRows[K])
  }

  /** Her tablodan Id'si `last`'tan büyük satırlar (Id sırasıyla) */
  since(last: LastIds, limit = Infinity): RawBatch {
    const out = {} as RawBatch
    for (const t of RAW_TABLES) {
      const rows = this.tables[t] as { id: number }[]
      const from = firstAbove(rows, last[t] ?? 0)
      ;(out as Record<RawTable, unknown[]>)[t] = rows.slice(from, Math.min(rows.length, from + limit))
    }
    return out
  }

  total(table: RawTable): number {
    return this.lastId[table]
  }

  /** Her tablonun en büyük Id'si */
  lastIds(): LastIds {
    return { ...this.lastId }
  }

  /** `t`'den eski satırları atar (uzun açık kalan demo sekmesinde bellek sınırı) */
  trimBefore(t: number): void {
    for (const name of RAW_TABLES) {
      const rows = this.tables[name] as { t: number }[]
      let k = 0
      while (k < rows.length && rows[k].t < t) k++
      if (k > 0) rows.splice(0, k)
    }
  }
}

/** Id'ye göre sıralı dizide Id'si `id`'den büyük ilk satırın indeksi */
function firstAbove(rows: { id: number }[], id: number): number {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid].id <= id) lo = mid + 1
    else hi = mid
  }
  return lo
}
