import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { ArrowUpRight, Check, Info, OctagonX, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ParetoChart } from '@/components/charts/ParetoChart'
import { MotorLink } from '@/components/common/MotorLink'
import { StatStrip } from '@/components/common/StatStrip'
import { WindowPicker } from '@/components/common/WindowPicker'
import { useTimeWindow } from '@/components/common/timeWindow'
import type { WindowKey } from '@/components/common/timeWindow'
import { gridLocale, gridTheme } from '@/components/grid/theme'
import { Chip, OpCode } from '@/components/status/StateBadge'
import type { Tone } from '@/components/status/styles'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useApp, useCan, usePolled } from '@/data/app'
import { ALARM_STATUS_LABEL, ANDON_TYPE_LABEL, TEAMS } from '@/domain/types'
import type { Alarm, AlarmAction, AlarmStatus, Severity } from '@/domain/types'
import { ALARM_SOURCES } from '@/domain/views'
import { fmtDuration, hhmm, hms } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Alarm Merkezi (R-037–R-041): filtrelenebilir alarm listesi, yaşam döngüsü (Detected → Acknowledged →
 * Assigned → Closed), atama ve kapatma, alarmdan motora geçiş, Andon çağrıları ve kaynak Pareto'su.
 */

const SEVERITY: Record<Severity, { label: string; icon: LucideIcon; tone: Tone }> = {
  critical: { label: 'Kritik', icon: OctagonX, tone: 'critical' },
  warning: { label: 'Uyarı', icon: TriangleAlert, tone: 'warning' },
  info: { label: 'Bilgi', icon: Info, tone: 'info' },
}
const STATUS_TONE: Record<AlarmStatus, Tone> = { detected: 'critical', acknowledged: 'warning', assigned: 'info', closed: 'good' }
const SOURCE_LABEL: Record<string, string> = { PLC: 'PLC', Cycle: 'Çevrim', Torque: 'Tork', Vision: 'Vision', Material: 'Malzeme', Operator: 'Operatör / Andon', System: 'Sistem' }

const dayTime = (t: number, now: number) => (now - t < 20 * 3600_000 ? hhmm(t) : new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))

type StatusFilter = 'open' | 'all' | AlarmStatus

export default function Alarms() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('id')
  const [wk, setWk] = useState<WindowKey>('h24')
  const w = useTimeWindow(wk)
  const v = usePolled(() => backend.alarms(w), [w.from, w.to])
  const now = useApp((s) => s.now)
  const [sev, setSev] = useState<Severity | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [source, setSource] = useState<string>('all')
  const [op, setOp] = useState<string>('all')
  const [text, setText] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)

  const rows = useMemo(() => {
    if (!v) return []
    const q = text.trim().toLocaleLowerCase('tr')
    return v.alarms.filter(
      (a) =>
        (sev === 'all' || a.severity === sev) &&
        (status === 'all' || (status === 'open' ? a.status !== 'closed' : a.status === status)) &&
        (source === 'all' || a.source === source) &&
        (op === 'all' || a.op === op) &&
        (!activeOnly || a.clearedAt === null) &&
        (!q || [a.id, a.code, a.message, a.sn ?? '', a.op ?? '', a.assignee ?? ''].some((x) => x.toLocaleLowerCase('tr').includes(q))),
    )
  }, [v, sev, status, source, op, text, activeOnly])

  const select = (id: string) => setParams((p) => (p.set('id', id), p), { replace: true })
  const reset = () => {
    setSev('all')
    setStatus('open')
    setSource('all')
    setOp('all')
    setText('')
    setActiveOnly(false)
  }

  const cols = useMemo<ColDef<Alarm>[]>(
    () => [
      { headerName: 'Önem', field: 'severity', width: 98, cellRenderer: (p: ICellRendererParams<Alarm>) => <SeverityChip s={p.data!.severity} /> },
      { headerName: 'Zaman', field: 't', width: 94, sort: 'desc', valueFormatter: (p) => dayTime(p.value as number, Date.now()), cellClass: 'display' },
      { headerName: 'OP', field: 'op', width: 76, cellRenderer: (p: ICellRendererParams<Alarm>) => (p.data!.op ? <OpCode op={p.data!.op} /> : '—') },
      { headerName: 'Kaynak', field: 'source', width: 100, valueFormatter: (p) => SOURCE_LABEL[p.value as string] ?? (p.value as string) },
      { headerName: 'Alarm', field: 'message', flex: 1, minWidth: 220, tooltipField: 'message' },
      { headerName: 'Motor', field: 'sn', width: 112, cellRenderer: (p: ICellRendererParams<Alarm>) => (p.data!.sn ? <MotorLink sn={p.data!.sn} short /> : '—') },
      {
        headerName: 'Süre',
        colId: 'duration',
        width: 88,
        valueGetter: (p) => ((p.data!.clearedAt ?? Date.now()) - p.data!.t) / 1000,
        valueFormatter: (p) => (p.data!.clearedAt === null ? `${fmtDuration(p.value as number)}+` : fmtDuration(p.value as number)),
        cellClass: 'display',
      },
      { headerName: 'Durum', field: 'status', width: 136, cellRenderer: (p: ICellRendererParams<Alarm>) => <StatusChip a={p.data!} /> },
      { headerName: 'Atanan', colId: 'assignee', width: 124, valueGetter: (p) => p.data!.assignee ?? `(${p.data!.team})`, headerTooltip: 'Parantez içinde: henüz atanmadı, kuraldaki varsayılan ekip' },
    ],
    [],
  )

  if (!v) return <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
  const open = v.alarms.filter((a) => a.status !== 'closed')

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <StatStrip
        stats={[
          { label: 'Açık alarm', value: open.length, sub: 'Kapatılmamış (koşulu bitenler dahil)' },
          { label: 'Kritik (açık)', value: open.filter((a) => a.severity === 'critical').length, tone: open.some((a) => a.severity === 'critical') ? 'critical' : undefined, icon: <OctagonX className="size-4" /> },
          { label: 'Onay bekleyen', value: v.byStatus.detected, sub: `${open.filter((a) => a.escalatedAt !== null && a.status === 'detected').length} tanesi eskale oldu`, tone: v.byStatus.detected ? 'warning' : undefined },
          { label: 'Atanmış', value: v.byStatus.assigned },
          { label: 'Kapatılan', value: v.byStatus.closed, sub: 'seçilen aralıkta' },
          { label: 'Andon', value: v.andons.length, sub: 'son 7 gün' },
        ]}
      />

      <Card className="flex flex-wrap items-end gap-3 px-4 py-3">
        <Filter label="Önem">
          <select value={sev} onChange={(e) => setSev(e.target.value as Severity | 'all')} className={sel}>
            <option value="all">Tümü</option>
            {(Object.keys(SEVERITY) as Severity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY[s].label}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Durum">
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={sel}>
            <option value="open">Açık (kapatılmamış)</option>
            <option value="all">Tümü</option>
            {(Object.keys(ALARM_STATUS_LABEL) as AlarmStatus[]).map((s) => (
              <option key={s} value={s}>
                {ALARM_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Kaynak">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={sel}>
            <option value="all">Tümü</option>
            {ALARM_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="İstasyon">
          <select value={op} onChange={(e) => setOp(e.target.value)} className={sel}>
            <option value="all">Tümü</option>
            {backend.master.stations.map((s) => (
              <option key={s.op} value={s.op}>
                {s.op}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Ara" className="min-w-[220px] flex-1">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Motor S/N, alarm kodu, metin, kişi" className={cn(sel, 'w-full')} />
        </Filter>
        <label className="flex h-9 items-center gap-2 text-[13px]">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Sadece koşulu sürenler
        </label>
        <Button variant="ghost" onClick={reset}>
          Filtreleri temizle
        </Button>
        <div className="ml-auto">
          <WindowPicker value={wk} onChange={setWk} />
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(360px,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
            <h2 className="text-[13px] font-semibold">Alarmlar</h2>
            <span className="text-[12px] text-fg-2">
              {rows.length} / {v.alarms.length} alarm. Satıra tıklayınca ayrıntı açılır.
            </span>
          </div>
          <div style={{ height: 560 }}>
            <AgGridReact<Alarm>
              theme={gridTheme}
              localeText={gridLocale}
              rowData={rows}
              columnDefs={cols}
              getRowId={(p) => p.data.id}
              rowHeight={38}
              headerHeight={36}
              onRowClicked={(e) => e.data && select(e.data.id)}
              rowClassRules={{ 'ag-row-selected-alarm': (p) => p.data?.id === selected }}
              tooltipShowDelay={400}
            />
          </div>
        </Card>
        <AlarmPanel id={selected} now={now} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Alarm kaynakları" subtitle="Seçilen aralıktaki alarmlar kaynağa göre (R-048)" />
          <div className="px-3 pb-3 pt-2">
            <ParetoChart items={v.sourcePareto.map((p) => ({ ...p, label: SOURCE_LABEL[p.label] ?? p.label }))} label="Alarm kaynakları Pareto" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Andon çağrıları" subtitle="Son 7 gün. Teknisyenler istasyon panelinden ve terminalden Andon açar." />
          <ul className="divide-y px-4 pb-3 pt-1">
            {v.andons.length === 0 && <li className="py-4 text-[13px] text-fg-2">Andon çağrısı yok.</li>}
            {v.andons.map((a) => {
              const al = v.alarms.find((x) => x.id === a.alarmId)
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className="display w-11 text-fg-2">{hhmm(a.t)}</span>
                  <OpCode op={a.op} />
                  <span className="font-medium">{ANDON_TYPE_LABEL[a.type]}</span>
                  <span className="text-fg-2">
                    {a.by}
                    {a.message ? `: ${a.message}` : ''}
                  </span>
                  {al && (
                    <button type="button" onClick={() => select(al.id)} className="ml-auto focus-visible:outline-2 focus-visible:outline-accent">
                      <StatusChip a={al} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}

const sel = 'h-9 rounded-md border border-border-strong bg-card px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent'

function Filter({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11.5px] text-fg-2">{label}</span>
      {children}
    </label>
  )
}

function SeverityChip({ s }: { s: Severity }) {
  const x = SEVERITY[s]
  return (
    <Chip tone={x.tone}>
      <x.icon className="size-3.5" /> {x.label}
    </Chip>
  )
}

function StatusChip({ a }: { a: Alarm }) {
  return (
    <Chip tone={STATUS_TONE[a.status]}>{a.escalatedAt !== null && a.status === 'detected' ? 'Eskale oldu' : ALARM_STATUS_LABEL[a.status]}</Chip>
  )
}

const STEPS: { status: AlarmStatus; label: string }[] = [
  { status: 'detected', label: 'Detected' },
  { status: 'acknowledged', label: 'Acknowledged' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'closed', label: 'Closed' },
]
const ORDER: Record<AlarmStatus, number> = { detected: 0, acknowledged: 1, assigned: 2, closed: 3 }
const ACTION_LABEL: Record<AlarmAction, string> = { detected: 'Alarm oluştu', acknowledged: 'Onaylandı', assigned: 'Atandı', closed: 'Kapatıldı', cleared: 'Koşul bitti', escalated: 'Eskale oldu' }

function AlarmPanel({ id, now }: { id: string | null; now: number }) {
  const d = usePolled(() => (id ? backend.alarm(id) : Promise.resolve(null)), [id])
  const canAck = useCan('alarm.ack')
  const canAssign = useCan('alarm.assign')
  const canClose = useCan('alarm.close')
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!id) return <Card className="grid min-h-[300px] place-items-center px-6 text-center text-[13px] text-fg-2">Ayrıntısını görmek ve yönetmek için listeden bir alarm seçin.</Card>
  if (!d) return <Card className="grid min-h-[300px] place-items-center text-[13px] text-fg-2">Alarm bulunamadı.</Card>
  const a = d.alarm
  const run = (p: Promise<unknown>) => {
    setErr(null)
    p.then(() => {
      setNote('')
      setAssignee('')
    }).catch((e: Error) => setErr(e.message))
  }
  const stepTime: Record<AlarmStatus, [number | null, string | null]> = {
    detected: [a.t, null],
    acknowledged: [a.ackAt, a.ackBy],
    assigned: [a.assignedAt, a.assignee],
    closed: [a.closedAt, a.closedBy],
  }
  const assignees = [...TEAMS, ...backend.master.people.filter((p) => p.role !== 'technician' || p.qualifications.includes('Rework L2')).map((p) => p.name)]
  return (
    <Card className="flex flex-col">
      <div className={cn('border-b px-4 pb-3 pt-3.5', a.severity === 'critical' && 'bg-critical-bg/40', a.severity === 'warning' && 'bg-warning-bg/40')}>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip s={a.severity} />
          <span className="text-[12px] font-semibold text-fg-2">
            {a.id}, {a.code}
          </span>
          <StatusChip a={a} />
        </div>
        <h2 className="mt-2 text-[15px] font-semibold leading-snug">{a.message}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
          <div>
            <dt className="text-fg-2">İstasyon</dt>
            <dd>{a.op ? <OpCode op={a.op} /> : '—'}</dd>
          </div>
          <div>
            <dt className="text-fg-2">Kaynak</dt>
            <dd>{SOURCE_LABEL[a.source]}</dd>
          </div>
          <div>
            <dt className="text-fg-2">Oluştu</dt>
            <dd className="display">{hms(a.t)}</dd>
          </div>
          <div>
            <dt className="text-fg-2">Koşul</dt>
            <dd>{a.clearedAt ? `Bitti (${hhmm(a.clearedAt)}, ${fmtDuration((a.clearedAt - a.t) / 1000)})` : `Sürüyor (${fmtDuration((now - a.t) / 1000)})`}</dd>
          </div>
          <div>
            <dt className="text-fg-2">Varsayılan ekip</dt>
            <dd>{a.team}</dd>
          </div>
          <div>
            <dt className="text-fg-2">Eskalasyon</dt>
            <dd>{a.escalatedAt ? `${hhmm(a.escalatedAt)} (onaylanmadı)` : 'Yok'}</dd>
          </div>
        </dl>
        {d.motor && (
          <Link to={`/motor/${encodeURIComponent(d.motor.sn)}`} className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-bg px-2.5 py-1 text-[13px] font-medium text-info-text hover:bg-info-bg">
            Motor geçmişi: <span className="display font-semibold">{d.motor.sn}</span> <ArrowUpRight className="size-3.5" />
          </Link>
        )}
        {d.andon && (
          <p className="mt-2 text-[12.5px]">
            Andon: {ANDON_TYPE_LABEL[d.andon.type]}, {d.andon.by}
            {d.andon.message ? `: ${d.andon.message}` : ''}
          </p>
        )}
      </div>

      <ol className="grid grid-cols-4 gap-1.5 px-4 pt-3" aria-label="Alarm yaşam döngüsü">
        {STEPS.map((s) => {
          const reached = ORDER[a.status] >= ORDER[s.status]
          const [t, by] = stepTime[s.status]
          return (
            <li key={s.status} className={cn('rounded-lg border px-2 py-1.5 text-center', reached ? 'border-good/40 bg-good-bg' : 'border-dashed')}>
              <div className={cn('flex items-center justify-center gap-1 text-[12px] font-semibold', reached ? 'text-good-text' : 'text-fg-3')}>
                {reached && <Check className="size-3.5" />}
                {s.label}
              </div>
              <div className="truncate text-[11px] text-fg-2" title={by ?? undefined}>
                {reached && t ? `${hhmm(t)}${by ? `, ${by}` : ''}` : '—'}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="space-y-2 px-4 pb-1 pt-3">
        {a.status === 'detected' && (canAck ? (
          <Button variant="primary" size="md" onClick={() => run(backend.ackAlarm(a.id))}>
            Onayla (acknowledge)
          </Button>
        ) : (
          <p className="text-[12.5px] text-fg-2">Bu alarmı onaylama yetkiniz yok.</p>
        ))}
        {(a.status === 'acknowledged' || a.status === 'assigned') && canAssign && (
          <div className="flex flex-wrap gap-2">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cn(sel, 'min-w-[200px] flex-1')} aria-label="Atanacak ekip ya da kişi">
              <option value="">Ekip ya da kişi seçin</option>
              {assignees.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <Button variant="outline" size="md" disabled={!assignee} onClick={() => run(backend.assignAlarm(a.id, assignee))}>
              {a.status === 'assigned' ? 'Yeniden ata' : 'Ata'}
            </Button>
          </div>
        )}
        {(a.status === 'acknowledged' || a.status === 'assigned') && canClose && (
          <div className="flex flex-wrap gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kapanış notu: ne yapıldı?" className={cn(sel, 'min-w-[200px] flex-1')} />
            <Button variant="primary" size="md" onClick={() => run(backend.closeAlarm(a.id, note))}>
              Kapat
            </Button>
          </div>
        )}
        {a.status === 'closed' && a.closeNote && <p className="text-[12.5px]">Kapanış notu: {a.closeNote}</p>}
        {err && <p className="text-[12.5px] text-critical-text">{err}</p>}
      </div>

      <div className="px-4 pb-4 pt-2">
        <h3 className="text-[12px] font-semibold text-fg-2">Zaman çizelgesi</h3>
        <ol className="mt-1.5 space-y-1.5 border-l pl-3">
          {d.events.map((e) => (
            <li key={e.id} className="relative text-[12.5px]">
              <span className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-accent" aria-hidden />
              <span className="display mr-2 text-fg-2">{hms(e.t)}</span>
              <span className="font-medium">{ACTION_LABEL[e.action]}</span>
              <span className="text-fg-2">
                {e.by ? `, ${e.by}` : ''}
                {e.detail && e.action !== 'detected' ? `: ${e.detail}` : ''}
              </span>
            </li>
          ))}
        </ol>
        {d.related.length > 0 && (
          <>
            <h3 className="mt-3 text-[12px] font-semibold text-fg-2">Aynı istasyonda son alarmlar</h3>
            <ul className="mt-1 space-y-1 text-[12.5px]">
              {d.related.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span className="display text-fg-2">{hhmm(r.t)}</span>
                  <Link to={`/alarmlar?id=${r.id}`} className="truncate hover:underline">
                    {r.message}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}
