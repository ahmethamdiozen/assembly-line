import { unionLength } from './kpi'
import type { MasterIndex } from './lineDef'
import { stationViews } from './lineState'
import type { DisplayState, FlowState } from './lineState'
import type { Store, TableName } from './store/Store'
import type { DeviceHealth, DeviceType, IoState, StationSpan } from './types'
import type { RawTable } from '@/pipeline/rows'

/**
 * Bakım & Entegrasyon (R-009, R-024, R-057, R-073): cihaz heartbeat'leri, IO, istasyon bakım
 * metrikleri ve veri hattının (SQL Server → collector → uygulama veritabanı) sağlığı.
 */

const HOUR = 3600_000
const MAX_SPAN_MS = 24 * HOUR

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  plc: 'PLC',
  controller: 'Tork controller',
  tool: 'Sıkma tool',
  camera: 'Kamera / vision',
}

export interface StationMaint {
  op: string
  name: string
  line: 'main' | 'sub'
  state: DisplayState | null
  flow: FlowState | null
  faults: number
  faultMin: number
  /** Ortalama onarım süresi (dk) */
  mttrMin: number | null
  /** Arızalar arası ortalama çalışma (sa) */
  mtbfH: number | null
  /** Çalışma durumunda geçen sürenin oranı */
  runRatio: number
  lastFault: StationSpan | null
}

export interface MaintenanceView {
  now: number
  windowH: number
  devices: DeviceHealth[]
  /** Cihaz tipine göre online / toplam */
  summary: { type: DeviceType; online: number; total: number }[]
  io: { op: string; name: string; signals: IoState[] }[]
  stations: StationMaint[]
  /** Penceredeki arızalar, en yeni önce */
  faults: StationSpan[]
}

export function maintenanceView(store: Store, ix: MasterIndex, now: number, windowH = 24): MaintenanceView {
  const from = now - windowH * HOUR
  const views = new Map(stationViews(store, ix, now).map((v) => [v.station.op, v]))
  const stations: StationMaint[] = [...ix.main, ...ix.subs].map((st) => {
    let runMs = 0
    let faults = 0
    const faultIv: [number, number][] = []
    let lastFault: StationSpan | null = null
    for (const s of store.find('station_span', { where: { op: st.op }, range: { field: 'start', gte: from - MAX_SPAN_MS, lt: now + 1 }, orderBy: 'start' })) {
      const a = Math.max(s.start, from)
      const b = Math.min(s.end ?? now, now)
      if (b <= a) continue
      if (s.state === 'fault') {
        faultIv.push([a, b])
        if (s.start >= from) faults++
        lastFault = s
      } else if (s.state === 'running') runMs += b - a
    }
    const faultMs = unionLength(faultIv)
    const v = views.get(st.op)
    return {
      op: st.op,
      name: st.name,
      line: st.line,
      state: v?.state ?? null,
      flow: v?.flow ?? null,
      faults,
      faultMin: faultMs / 60_000,
      mttrMin: faults ? faultMs / 60_000 / faults : null,
      mtbfH: faults ? runMs / HOUR / faults : null,
      runRatio: runMs / (windowH * HOUR),
      lastFault,
    }
  })

  const order = new Map([...ix.main, ...ix.subs].map((s, i) => [s.op, i]))
  const TYPE_ORDER: DeviceType[] = ['plc', 'controller', 'tool', 'camera']
  const devices = store.find('device').sort((a, b) => (order.get(a.op) ?? 99) - (order.get(b.op) ?? 99) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
  const ioAll = store.find('io_state')
  return {
    now,
    windowH,
    devices,
    summary: TYPE_ORDER.map((type) => {
      const ds = devices.filter((d) => d.type === type)
      return { type, online: ds.filter((d) => d.online).length, total: ds.length }
    }).filter((s) => s.total > 0),
    io: [...ix.main, ...ix.subs]
      .map((st) => ({ op: st.op, name: st.name, signals: st.signals.map((sig) => ioAll.find((x) => x.op === st.op && x.signal === sig)).filter((x): x is IoState => !!x) }))
      .filter((x) => x.signals.length),
    stations,
    faults: store.find('station_span', { where: { state: 'fault' }, range: { field: 'start', gte: from, lt: now + 1 }, orderBy: 'start', desc: true, limit: 30 }),
  }
}

// ---------------------------------------------------------------- veri hattı ve sistem (sunucu ve demo ayrı doldurur)

/** Collector'ın bir turu */
export interface CollectorRun {
  at: number
  ok: boolean
  rows: number
  perTable: Partial<Record<RawTable, number>>
  durationMs: number
  error: string | null
}

export interface IntegrationStatus {
  mode: 'server' | 'demo'
  /** Fabrika veri kaynağı, ör. "SQL Server localhost:1433/TM50Line" */
  source: string
  intervalMin: number
  running: boolean
  lastRun: CollectorRun | null
  lastSuccessAt: number | null
  nextRunAt: number | null
  /** Bu ana kadarki fabrika verisi işlendi */
  watermark: number | null
  runs: CollectorRun[]
  /** Tablo başına okunan son Id */
  readPosition: { table: RawTable; lastId: number }[]
}

/** Admin'in "Bağlantıyı test et" sonucu */
export interface IntegrationTest {
  ok: boolean
  ms: number
  error: string | null
  /** Tablo başına en büyük Id (bağlantı varsa) */
  maxIds: Partial<Record<RawTable, number>> | null
}

/** Yedek dosyası */
export interface BackupInfo {
  file: string
  t: number
  sizeBytes: number
}

/** Fabrika tablosundan son satırlar (ham, collector'ın okuduğu biçimde) */
export interface RawPreview {
  table: RawTable
  columns: string[]
  rows: Record<string, unknown>[]
}

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  t: number
  level: LogLevel
  /** api, collector, server, demo… */
  scope: string
  msg: string
  detail: string | null
}

export interface SystemInfo {
  mode: 'server' | 'demo'
  appDb: { kind: string; path: string | null; sizeBytes: number | null; schemaVersion: number | null }
  rows: Partial<Record<TableName, number>>
  backups: BackupInfo[]
  logFile: string | null
  startedAt: number
  version: string
}

/** Uygulama veritabanındaki tablo satır sayıları */
export function tableCounts(store: Store, tables: readonly TableName[]): Partial<Record<TableName, number>> {
  return Object.fromEntries(tables.map((t) => [t, store.count(t)]))
}
