import { CircleCheck, Database, Lock, OctagonX, RefreshCw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OpCode, StateBadge } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, useCan, usePolled } from '@/data/app'
import { DEVICE_TYPE_LABEL } from '@/domain/maintenance'
import type { IntegrationStatus, LogLevel, MaintenanceView } from '@/domain/maintenance'
import { FLOW_LABEL } from '@/domain/lineState'
import type { DeviceType } from '@/domain/types'
import { ago, fmtDuration, hhmm, hms, minutes, num, pct, whenShort } from '@/lib/format'
import { RAW_TABLES } from '@/pipeline/rows'
import type { RawTable } from '@/pipeline/rows'
import { cn } from '@/lib/utils'

/**
 * Bakım & Entegrasyon (R-009, R-024, R-057, R-073): veri hattının, cihazların ve IO'nun sağlığı;
 * fabrika tablolarının ham hali ve uygulama logları (son ikisi system.view izniyle).
 */

const TABS = [
  { id: 'genel', label: 'Genel bakış' },
  { id: 'cihaz', label: 'Cihazlar & IO' },
  { id: 'ham', label: 'Ham fabrika tabloları' },
  { id: 'log', label: 'Loglar & sistem' },
] as const
type TabId = (typeof TABS)[number]['id']

const dateTime = (t: number) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function Maintenance() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'genel') as TabId
  const m = usePolled(() => backend.maintenance(), [])
  const i = usePolled(() => backend.integration(), [])
  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div role="tablist" aria-label="Bakım sekmeleri" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'genel' ? {} : { tab: t.id }, { replace: true })}
            className={cn('-mb-px border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-accent', tab === t.id ? 'border-accent text-info-text' : 'border-transparent text-fg-2 hover:text-fg')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!m || !i ? (
        <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
      ) : tab === 'genel' ? (
        <Overview m={m} i={i} />
      ) : tab === 'cihaz' ? (
        <Devices m={m} />
      ) : tab === 'ham' ? (
        <Restricted>
          <RawTables />
        </Restricted>
      ) : (
        <Restricted>
          <LogsAndSystem />
        </Restricted>
      )}
    </div>
  )
}

function Restricted({ children }: { children: React.ReactNode }) {
  const ok = useCan('system.view')
  if (ok) return <>{children}</>
  return (
    <Card className="flex items-center gap-3 px-5 py-6 text-[13.5px] text-fg-2">
      <Lock className="size-5 shrink-0" /> Bu bölüm Bakım / Otomasyon ve Admin rollerine açık (izin: uygulama logları ve sistem bilgisi).
    </Card>
  )
}

// ---------------------------------------------------------------- genel bakış

type Health = 'ok' | 'warn' | 'down'
const HEALTH: Record<Health, { icon: LucideIcon; cls: string; label: string }> = {
  ok: { icon: CircleCheck, cls: 'text-good-text', label: 'Normal' },
  warn: { icon: TriangleAlert, cls: 'text-warning-text', label: 'Uyarı' },
  down: { icon: OctagonX, cls: 'text-critical-text', label: 'Bağlantı yok' },
}

function HealthTile({ title, health, value, detail }: { title: string; health: Health; value: string; detail: string }) {
  const h = HEALTH[health]
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 border-b border-r px-4 py-3', health === 'warn' && 'bg-warning-bg/60', health === 'down' && 'bg-critical-bg/60')}>
      <span className="text-[12px] font-medium text-fg-2">{title}</span>
      <span className={cn('flex items-center gap-1.5 text-[16px] font-semibold', h.cls)}>
        <h.icon className="size-4 shrink-0" /> {value}
      </span>
      <span className="truncate text-[12px] text-fg-2" title={detail}>
        {detail}
      </span>
    </div>
  )
}

function deviceHealth(m: MaintenanceView, types: DeviceType[]): { health: Health; value: string; detail: string } {
  const s = m.summary.filter((x) => types.includes(x.type))
  const total = s.reduce((a, x) => a + x.total, 0)
  const online = s.reduce((a, x) => a + x.online, 0)
  const off = m.devices.filter((d) => types.includes(d.type) && !d.online)
  return {
    health: total === 0 ? 'warn' : online === total ? 'ok' : online === 0 ? 'down' : 'warn',
    value: `${online} / ${total} online`,
    detail: off.length ? `Offline: ${off.map((d) => d.id).join(', ')}` : 'Tüm cihazlar heartbeat gönderiyor',
  }
}

function Overview({ m, i }: { m: MaintenanceView; i: IntegrationStatus }) {
  const conn = useApp((s) => s.conn)
  const now = useApp((s) => s.now)
  const last = i.lastRun
  const sql: { health: Health; value: string; detail: string } =
    i.mode === 'demo'
      ? { health: 'ok', value: 'Simülasyon', detail: i.source }
      : !last
        ? { health: 'warn', value: 'Henüz okunmadı', detail: i.source }
        : last.ok
          ? { health: 'ok', value: 'Bağlı', detail: `${i.source} · son tur ${hhmm(last.at)}` }
          : { health: 'down', value: 'Okunamıyor', detail: last.error ?? i.source }
  const live: { health: Health; value: string; detail: string } =
    conn.state === 'offline'
      ? { health: 'down', value: "API'ye ulaşılamıyor", detail: conn.error ?? '' }
      : conn.state === 'stale'
        ? { health: 'warn', value: 'Veri gecikiyor', detail: conn.watermark ? `Son fabrika verisi ${hhmm(conn.watermark)} (${ago(now - conn.watermark)})` : 'Henüz veri yok' }
        : { health: 'ok', value: 'Taze', detail: conn.watermark ? `Son fabrika verisi ${hhmm(conn.watermark)}, ${i.intervalMin} dk'da bir çekiliyor` : '' }
  return (
    <>
      <section aria-label="Entegrasyon sağlığı (R-057)" className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-[0_6px_20px_rgba(42,58,70,0.045)] md:grid-cols-3 xl:grid-cols-6">
        <HealthTile title="Fabrika SQL Server" {...sql} />
        <HealthTile title="Canlı veri kanalı" {...live} />
        <HealthTile title="PLC'ler" {...deviceHealth(m, ['plc'])} />
        <HealthTile title="Tork controller ve tool" {...deviceHealth(m, ['controller', 'tool'])} />
        <HealthTile title="Kamera / vision" {...deviceHealth(m, ['camera'])} />
        <HealthTile title="Uygulama veritabanı" health="ok" value={i.mode === 'demo' ? 'Bellek (demo)' : 'SQLite'} detail={i.mode === 'demo' ? 'Sekme kapanınca sıfırlanır' : 'Yazma ve okuma çalışıyor'} />
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <CollectorCard i={i} />
        <FaultList m={m} />
      </div>
      <StationMaintTable m={m} />
    </>
  )
}

function CollectorCard({ i }: { i: IntegrationStatus }) {
  const canPull = useCan('integration.pull')
  const now = useApp((s) => s.now)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pull = async () => {
    setBusy(true)
    setErr(null)
    try {
      await backend.pullNow()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader
        title="Collector (SQL Server → uygulama veritabanı)"
        subtitle={`${i.intervalMin} dk'da bir yeni satırları okur; hata olursa 15 sn'de bir tekrar dener`}
        right={
          canPull && (
            <Button variant="primary" onClick={() => void pull()} disabled={busy || i.running}>
              <RefreshCw className={cn('size-3.5', (busy || i.running) && 'animate-spin')} /> Şimdi çek
            </Button>
          )
        }
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pt-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-[11.5px] text-fg-2">Son tur</dt>
          <dd>{i.lastRun ? `${hms(i.lastRun.at)} (${ago(now - i.lastRun.at)})` : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-fg-2">Son başarılı</dt>
          <dd>{i.lastSuccessAt ? hms(i.lastSuccessAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-fg-2">Sonraki tur</dt>
          <dd>{i.nextRunAt ? `${hms(i.nextRunAt)} (${fmtDuration(Math.max(0, (i.nextRunAt - now) / 1000))} sonra)` : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-fg-2">İşlenen veri</dt>
          <dd>{i.watermark ? `${hms(i.watermark)}'e kadar` : '—'}</dd>
        </div>
      </dl>
      {err && <p className="px-4 pt-2 text-[12.5px] text-critical-text">{err}</p>}
      <div className="mt-2 max-h-[290px] overflow-auto px-4 pb-3">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-card text-left text-[11.5px] text-fg-2">
            <tr className="border-b">
              <th className="py-1.5 font-medium">Zaman</th>
              <th className="py-1.5 font-medium">Sonuç</th>
              <th className="py-1.5 text-right font-medium">Satır</th>
              <th className="py-1.5 text-right font-medium">Süre</th>
              <th className="py-1.5 pl-3 font-medium">Ayrıntı</th>
            </tr>
          </thead>
          <tbody>
            {i.runs.slice(0, 30).map((r) => (
              <tr key={r.at} className="border-b last:border-0">
                <td className="py-1.5 tabular-nums">{hms(r.at)}</td>
                <td className="py-1.5">
                  {r.ok ? (
                    <span className="inline-flex items-center gap-1 text-good-text">
                      <CircleCheck className="size-3.5" /> Tamam
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-critical-text">
                      <OctagonX className="size-3.5" /> Hata
                    </span>
                  )}
                </td>
                <td className="display py-1.5 text-right text-[13px]">{num(r.rows)}</td>
                <td className="display py-1.5 text-right text-[13px]">{r.durationMs} ms</td>
                <td className="max-w-[340px] truncate py-1.5 pl-3 text-fg-2" title={r.error ?? undefined}>
                  {r.error ??
                    (Object.entries(r.perTable)
                      .filter(([, n]) => n)
                      .map(([t, n]) => `${t} ${n}`)
                      .join(', ') ||
                      'yeni satır yok')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!i.runs.length && <p className="py-4 text-center text-[13px] text-fg-2">Henüz tur yok.</p>}
      </div>
      <details className="border-t px-4 py-2.5 text-[12.5px]">
        <summary className="cursor-pointer text-fg-2">Okuma konumu (tablo başına son okunan Id)</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {i.readPosition.map((p) => (
            <li key={p.table} className="flex justify-between gap-2">
              <span className="text-fg-2">{p.table}</span>
              <span className="display text-[13px]">{num(p.lastId)}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

function FaultList({ m }: { m: MaintenanceView }) {
  const now = useApp((s) => s.now)
  return (
    <Card>
      <CardHeader title={`Son arızalar (${m.windowH} sa)`} subtitle="PLC'nin bildirdiği FAULT durumları, en yeni önce" />
      <ul className="max-h-[400px] space-y-1.5 overflow-auto px-4 pb-3 pt-2">
        {m.faults.map((f) => (
          <li key={f.id} className="flex items-baseline gap-2 text-[13px]">
            <span className="w-[76px] shrink-0 tabular-nums text-fg-2">{whenShort(f.start, now)}</span>
            <OpCode op={f.op} className="w-14 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{f.text ?? f.code}</span>
            <span className={cn('shrink-0 text-[12px]', f.end === null ? 'font-semibold text-critical-text' : 'text-fg-2')}>{f.end === null ? 'sürüyor' : fmtDuration((f.end - f.start) / 1000)}</span>
          </li>
        ))}
        {!m.faults.length && <li className="py-4 text-center text-[13px] text-fg-2">Bu aralıkta arıza yok.</li>}
      </ul>
    </Card>
  )
}

function StationMaintTable({ m }: { m: MaintenanceView }) {
  const now = useApp((s) => s.now)
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`İstasyon bakım metrikleri (son ${m.windowH} saat, R-024)`} subtitle="MTTR: ortalama arıza süresi · MTBF: arızalar arası ortalama çalışma · çalışma oranı: PLC'nin 'çalışıyor' bildirdiği süre" />
      <div className="overflow-x-auto px-4 pb-3 pt-2">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11.5px] text-fg-2">
            <tr className="border-b">
              <th className="py-1.5 font-medium">OP</th>
              <th className="py-1.5 font-medium">İstasyon</th>
              <th className="py-1.5 font-medium">Durum</th>
              <th className="py-1.5 text-right font-medium">Arıza</th>
              <th className="py-1.5 text-right font-medium">Arıza süresi</th>
              <th className="py-1.5 text-right font-medium">MTTR</th>
              <th className="py-1.5 text-right font-medium">MTBF</th>
              <th className="py-1.5 text-right font-medium">Çalışma oranı</th>
              <th className="py-1.5 pl-4 font-medium">Son arıza</th>
            </tr>
          </thead>
          <tbody>
            {m.stations.map((s) => (
              <tr key={s.op} className="border-b last:border-0">
                <td className="py-1.5">
                  <OpCode op={s.op} />
                </td>
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5">{s.state ? <StateBadge state={s.state} /> : <span className="text-[12px] text-fg-3">ön montaj</span>}</td>
                <td className="display py-1.5 text-right text-[14px]">{s.faults || '—'}</td>
                <td className="display py-1.5 text-right text-[14px]">{s.faultMin ? minutes(s.faultMin, 0) : '—'}</td>
                <td className="display py-1.5 text-right text-[14px]">{s.mttrMin !== null ? minutes(s.mttrMin, 1) : '—'}</td>
                <td className="display py-1.5 text-right text-[14px]">{s.mtbfH !== null ? `${num(s.mtbfH, 1)} sa` : '—'}</td>
                <td className="display py-1.5 text-right text-[14px]">{pct(s.runRatio, 0)}</td>
                <td className="max-w-[260px] truncate py-1.5 pl-4 text-[12.5px] text-fg-2">{s.lastFault ? `${whenShort(s.lastFault.start, now)} ${s.lastFault.text ?? s.lastFault.code ?? ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- cihazlar ve IO

function Devices({ m }: { m: MaintenanceView }) {
  const now = useApp((s) => s.now)
  const [only, setOnly] = useState<'all' | 'offline'>('all')
  const rows = m.devices.filter((d) => only === 'all' || !d.online)
  const name = (op: string) => backend.master.stations.find((s) => s.op === op)?.name ?? ''
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Cihaz heartbeat'leri (R-057)"
          subtitle="PLC, tork controller / tool ve kamera; heartbeat gelmeyen cihaz offline sayılır"
          right={<Segmented label="Cihaz filtresi" value={only} onChange={setOnly} options={[{ value: 'all', label: `Tümü (${m.devices.length})` }, { value: 'offline', label: `Offline (${m.devices.filter((d) => !d.online).length})` }]} />}
        />
        <div className="max-h-[640px] overflow-auto px-4 pb-3 pt-2">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card text-left text-[11.5px] text-fg-2">
              <tr className="border-b">
                <th className="py-1.5 font-medium">Cihaz</th>
                <th className="py-1.5 font-medium">Tip</th>
                <th className="py-1.5 font-medium">İstasyon</th>
                <th className="py-1.5 font-medium">Durum</th>
                <th className="py-1.5 text-right font-medium">Son heartbeat</th>
                <th className="py-1.5 text-right font-medium">Son online</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={cn('border-b last:border-0', !d.online && 'bg-critical-bg/50')}>
                  <td className="display py-1.5 text-[14px]">{d.id}</td>
                  <td className="py-1.5 text-fg-2">{DEVICE_TYPE_LABEL[d.type]}</td>
                  <td className="py-1.5" title={name(d.op)}>
                    <OpCode op={d.op} />
                  </td>
                  <td className="py-1.5">
                    <StateBadge state={d.online ? 'running' : 'offline'} label={d.online ? 'Online' : 'Offline'} />
                  </td>
                  <td className="py-1.5 text-right text-fg-2">{ago(now - d.lastT)}</td>
                  <td className="py-1.5 text-right text-fg-2">{d.lastOnlineT ? whenShort(d.lastOnlineT, now) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-6 text-center text-[13px] text-fg-2">Offline cihaz yok.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="İstasyon sensör / IO durumu (R-024)" subtitle="Son okunan değer; 1 = aktif" />
        <div className="grid gap-2 px-4 pb-3 pt-2 sm:grid-cols-2">
          {m.io.map((st) => {
            const sv = m.stations.find((s) => s.op === st.op)
            return (
              <div key={st.op} className="rounded-lg border px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <OpCode op={st.op} /> <span className="text-[12px] text-fg-2">{st.name}</span>
                  </span>
                  {sv?.flow && <span className="shrink-0 text-[11.5px] text-fg-3">{FLOW_LABEL[sv.flow]}</span>}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {st.signals.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate">{s.signal}</span>
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold', s.value ? 'bg-good-bg text-good-text' : 'bg-neutral text-fg-2')} title={`Son değişim ${hms(s.t)}`}>
                        {s.value ? <CircleCheck className="size-3" /> : <span className="size-3 rounded-full border border-current" />}
                        {s.value ? '1' : '0'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- ham tablolar

function RawTables() {
  const [table, setTable] = useState<RawTable>('OperationEvents')
  const [err, setErr] = useState<string | null>(null)
  const p = usePolled(
    () =>
      backend.rawPreview(table, 50).then(
        (x) => {
          setErr(null)
          return x
        },
        (e: Error) => {
          setErr(e.message)
          throw e
        },
      ),
    [table],
  )
  const rows = p?.table === table ? p.rows : []
  const cell = (k: string, v: unknown) => (v === null || v === undefined || v === '' ? '—' : k === 't' && typeof v === 'number' ? dateTime(v) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Fabrika SQL Server tabloları (salt okunur)"
        subtitle="Her tablonun son 50 satırı, collector'ın okuduğu biçimde. Gerçek şemaya geçişte sadece server/collector/sqlReader.ts'teki SELECT'ler eşlenir."
        right={
          <select value={table} onChange={(e) => setTable(e.target.value as RawTable)} aria-label="Tablo" className="h-8 rounded-md border border-border-strong bg-card px-2 text-[13px]">
            {RAW_TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        }
      />
      {err && <p className="px-4 pt-2 text-[13px] text-critical-text">{err}</p>}
      <div className="max-h-[640px] overflow-auto px-4 pb-3 pt-2">
        {p && p.table === table && (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-card text-left text-[11.5px] text-fg-2">
              <tr className="border-b">
                {p.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap py-1.5 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b last:border-0">
                  {p.columns.map((c) => (
                    <td key={c} className="whitespace-nowrap py-1 pr-3 tabular-nums">
                      {cell(c, r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {p && p.table === table && !rows.length && <p className="py-6 text-center text-[13px] text-fg-2">Tabloda satır yok.</p>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- loglar ve sistem

const LEVEL_STYLE: Record<LogLevel, string> = { info: 'bg-info-bg text-info-text', warn: 'bg-warning-bg text-warning-text', error: 'bg-critical-bg text-critical-text' }
const LEVEL_LABEL: Record<LogLevel, string> = { info: 'Bilgi', warn: 'Uyarı', error: 'Hata' }

function LogsAndSystem() {
  const [level, setLevel] = useState<LogLevel>('info')
  const logs = usePolled(() => backend.logs(level), [level])
  const info = usePolled(() => backend.systemInfo(), [])
  const now = useApp((s) => s.now)
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Uygulama logu (R-073)"
          subtitle={info?.logFile ? `${info.logFile} dosyasının sonu, en yeni önce` : 'Demo: bu sekmedeki collector turları ve reddedilen komutlar'}
          right={
            <Segmented
              label="Log seviyesi"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'info', label: 'Tümü' },
                { value: 'warn', label: 'Uyarı ve hata' },
                { value: 'error', label: 'Hata' },
              ]}
            />
          }
        />
        <ul className="max-h-[640px] divide-y overflow-auto px-4 pb-3 pt-2">
          {logs?.map((l, k) => (
            <li key={`${l.t}-${k}`} className="flex items-baseline gap-2 py-1.5 text-[12.5px]">
              <span className="w-[118px] shrink-0 tabular-nums text-fg-2">{dateTime(l.t)}</span>
              <span className={cn('w-12 shrink-0 rounded-full px-1.5 py-px text-center text-[11px] font-semibold', LEVEL_STYLE[l.level])}>{LEVEL_LABEL[l.level]}</span>
              <span className="w-20 shrink-0 text-fg-2">{l.scope}</span>
              <span className="min-w-0 flex-1">
                {l.msg}
                {l.detail && <span className="block truncate text-[12px] text-fg-3">{l.detail}</span>}
              </span>
            </li>
          ))}
          {logs && !logs.length && <li className="py-6 text-center text-[13px] text-fg-2">Bu seviyede log yok.</li>}
        </ul>
      </Card>
      {info && (
        <Card className="px-4 py-3.5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Database className="size-4" /> Sistem
          </h3>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-fg-2">Mod</dt>
            <dd>{info.mode === 'demo' ? 'Demo (tarayıcı)' : 'Sunucu'}</dd>
            <dt className="text-fg-2">Sürüm</dt>
            <dd>{info.version}</dd>
            <dt className="text-fg-2">Çalışıyor</dt>
            <dd>{fmtDuration((now - info.startedAt) / 1000)}</dd>
            <dt className="text-fg-2">Uygulama veritabanı</dt>
            <dd className="truncate" title={info.appDb.path ?? undefined}>
              {info.appDb.kind}
              {info.appDb.path && ` · ${info.appDb.path}`}
            </dd>
            {info.appDb.sizeBytes !== null && (
              <>
                <dt className="text-fg-2">Boyut</dt>
                <dd>{num(info.appDb.sizeBytes / 1024 / 1024, 1)} MB</dd>
              </>
            )}
            {info.appDb.schemaVersion !== null && (
              <>
                <dt className="text-fg-2">Şema sürümü</dt>
                <dd>{info.appDb.schemaVersion}</dd>
              </>
            )}
          </dl>
          <h4 className="mt-4 text-[12.5px] font-semibold">Yedekler</h4>
          {info.backups.length ? (
            <ul className="mt-1 space-y-1 text-[12.5px]">
              {info.backups.slice(0, 6).map((b) => (
                <li key={b.file} className="flex justify-between gap-2">
                  <span className="truncate">{b.file}</span>
                  <span className="shrink-0 text-fg-2">
                    {dateTime(b.t)} · {num(b.sizeBytes / 1024 / 1024, 1)} MB
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-fg-2">{info.mode === 'demo' ? 'Demoda yedek yok.' : <>Yedek yok. <code className="rounded bg-wash px-1">npm run db:backup</code> ile alınır.</>}</p>
          )}
          <h4 className="mt-4 text-[12.5px] font-semibold">Tablo satır sayıları</h4>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px]">
            {Object.entries(info.rows).map(([t, n]) => (
              <li key={t} className="flex justify-between gap-2">
                <span className="truncate text-fg-2">{t}</span>
                <span className="display text-[13px]">{num(n ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
