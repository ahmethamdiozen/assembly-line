import type { MasterIndex } from '@/domain/lineDef'
import type { CollectorRun } from '@/domain/maintenance'
import type { Store } from '@/domain/store/Store'
import { RAW_TABLES } from '@/pipeline/rows'
import type { LastIds, RawTable } from '@/pipeline/rows'
import { applyCollected } from '@/pipeline/transform'
import type { RawReader } from './sqlReader'

/**
 * COLLECTOR — fabrikanın SQL Server'ından 3–5 dk'da bir yeni satırları okur ve uygulama veritabanına
 * işler (src/pipeline/transform.ts). Sunucu sürecinin içinde çalışır (SQLite'a tek yazar).
 * Hata olursa ya da henüz hiç veri gelmediyse 15 sn'de bir tekrar dener.
 */

const BATCH = 50_000
const RETRY_MS = 15_000

export type { CollectorRun }

export interface CollectorStatus {
  intervalMin: number
  running: boolean
  lastRun: CollectorRun | null
  lastSuccessAt: number | null
  nextRunAt: number | null
  watermark: number | null
}

export class SourceResetError extends Error {}

export class Collector {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<CollectorRun> | null = null
  private nextRunAt: number | null = null
  private readonly store: Store
  private readonly ix: () => MasterIndex
  private readonly reader: RawReader
  readonly intervalMin: number
  private readonly now: () => number
  private readonly onRun: (r: CollectorRun) => void

  constructor(opts: { store: Store; ix: () => MasterIndex; reader: RawReader; intervalMin: number; now?: () => number; onRun?: (r: CollectorRun) => void }) {
    this.store = opts.store
    this.ix = opts.ix
    this.reader = opts.reader
    this.intervalMin = opts.intervalMin
    this.now = opts.now ?? Date.now
    this.onRun = opts.onRun ?? (() => {})
  }

  start(): void {
    void this.trigger()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Beklemeden bir tur çalıştırır ("Şimdi çek"); süren tur varsa onu bekler */
  async trigger(): Promise<CollectorRun> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const run = await this.runOnce()
    const hasData = this.store.kvGet<number>('watermark') !== null && this.store.count('motor') > 0
    const delay = !run.ok || !hasData ? RETRY_MS : this.intervalMin * 60_000
    this.nextRunAt = this.now() + delay
    if (this.timer === null) this.timer = setTimeout(() => void this.trigger(), delay)
    return run
  }

  runOnce(): Promise<CollectorRun> {
    if (!this.inFlight) this.inFlight = this.doRun().finally(() => (this.inFlight = null))
    return this.inFlight
  }

  private async doRun(): Promise<CollectorRun> {
    const started = this.now()
    const run: CollectorRun = { at: started, ok: false, rows: 0, perTable: {}, durationMs: 0, error: null }
    try {
      const last = this.store.kvGet<LastIds>('sync') ?? {}
      const max = await this.reader.maxIds()
      const behind = RAW_TABLES.filter((t) => (max[t] ?? 0) < (last[t] ?? 0))
      if (behind.length)
        throw new SourceResetError(
          `SQL Server'daki Id'ler okunan konumun gerisinde (${behind.join(', ')}): fabrika veritabanı sıfırlanmış olabilir. Okuma durduruldu; geliştirme ortamında "npm run sim:reset" iki veritabanını birlikte sıfırlar.`,
        )
      // Birikme varsa parça parça oku
      for (;;) {
        const raw = await this.reader.read(this.store.kvGet<LastIds>('sync') ?? {}, BATCH)
        const res = applyCollected(this.store, this.ix(), raw, this.now())
        run.rows += res.rows
        for (const [t, n] of Object.entries(res.perTable)) run.perTable[t as RawTable] = (run.perTable[t as RawTable] ?? 0) + n
        if (!RAW_TABLES.some((t) => raw[t].length === BATCH)) break
      }
      run.ok = true
    } catch (e) {
      run.error = (e as Error).message.split('\n')[0]
    }
    run.durationMs = this.now() - started
    const runs = [run, ...(this.store.kvGet<CollectorRun[]>('collector:runs') ?? [])].slice(0, 50)
    this.store.kvSet('collector:runs', runs)
    this.onRun(run)
    return run
  }

  /** Son 50 tur, en yeni önce */
  runs(): CollectorRun[] {
    return this.store.kvGet<CollectorRun[]>('collector:runs') ?? []
  }

  status(): CollectorStatus {
    const runs = this.store.kvGet<CollectorRun[]>('collector:runs') ?? []
    return {
      intervalMin: this.intervalMin,
      running: this.inFlight !== null,
      lastRun: runs[0] ?? null,
      lastSuccessAt: runs.find((r) => r.ok)?.at ?? null,
      nextRunAt: this.nextRunAt,
      watermark: this.store.kvGet<number>('watermark'),
    }
  }
}
