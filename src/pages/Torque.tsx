import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { Download, OctagonX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MotorLink } from '@/components/common/MotorLink'
import { StatStrip } from '@/components/common/StatStrip'
import { WindowPicker } from '@/components/common/WindowPicker'
import { useTimeWindow } from '@/components/common/timeWindow'
import type { WindowKey } from '@/components/common/timeWindow'
import { gridLocale, gridTheme } from '@/components/grid/theme'
import { Chip, OpCode, StateBadge } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { backend, useApp, usePolled } from '@/data/app'
import { tighteningCsvName } from '@/domain/exports'
import type { DeviceHealth, Tightening } from '@/domain/types'
import type { TighteningStation } from '@/domain/views'
import { ago, hms, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Tork (R-042–R-044): sıkma sonuçları, controller / tool durumu ve CSV dışa aktarım.
 */

const sel = 'h-9 rounded-md border border-border-strong bg-card px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent'

export default function Torque() {
  const [wk, setWk] = useState<WindowKey>('shift')
  const w = useTimeWindow(wk)
  const [op, setOp] = useState('')
  const [result, setResult] = useState<'' | 'OK' | 'NOK'>('')
  const [sn, setSn] = useState('')
  const [snTerm, setSnTerm] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSnTerm(sn), 300)
    return () => clearTimeout(id)
  }, [sn])
  const filter = useMemo(() => ({ ...w, op: op || null, result: result || null, sn: snTerm || null }), [w, op, result, snTerm])
  const v = usePolled(() => backend.tightening(filter), [filter])
  const now = useApp((s) => s.now)
  const [exporting, setExporting] = useState<string | null>(null)

  const download = async () => {
    setExporting('Hazırlanıyor…')
    try {
      const csv = await backend.tighteningCsv(filter)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = tighteningCsvName(filter.from, filter.to)
      a.click()
      URL.revokeObjectURL(url)
      setExporting(null)
    } catch (e) {
      setExporting((e as Error).message)
    }
  }

  const cols = useMemo<ColDef<Tightening>[]>(
    () => [
      { headerName: 'Zaman', field: 't', width: 100, sort: 'desc', valueFormatter: (p) => hms(p.value as number), cellClass: 'display' },
      { headerName: 'Motor', field: 'sn', width: 160, cellRenderer: (p: ICellRendererParams<Tightening>) => <MotorLink sn={p.data!.sn} /> },
      { headerName: 'OP', field: 'op', width: 86, cellRenderer: (p: ICellRendererParams<Tightening>) => <OpCode op={p.data!.op} /> },
      { headerName: 'Controller / tool', colId: 'tool', flex: 1, minWidth: 180, valueGetter: (p) => `${p.data!.controllerId} / ${p.data!.toolId}` },
      { headerName: 'Pset', field: 'pset', width: 80 },
      { headerName: 'Joint', field: 'joint', width: 80, cellClass: 'display' },
      { headerName: 'Hedef (Nm)', colId: 'target', width: 120, valueGetter: (p) => `${num(p.data!.targetNm, 0)} ± ${num((p.data!.maxNm - p.data!.minNm) / 2, 0)}`, cellClass: 'display' },
      { headerName: 'Tork (Nm)', field: 'torqueNm', width: 110, valueFormatter: (p) => num(p.value as number, 1), cellClass: 'display', type: 'rightAligned' },
      { headerName: 'Açı (°)', field: 'angleDeg', width: 96, cellClass: 'display', type: 'rightAligned' },
      {
        headerName: 'Sonuç',
        field: 'result',
        width: 96,
        cellRenderer: (p: ICellRendererParams<Tightening>) => (
          <Chip tone={p.data!.result === 'OK' ? 'good' : 'critical'}>
            {p.data!.result === 'NOK' && <OctagonX className="size-3" />}
            {p.data!.result}
          </Chip>
        ),
      },
    ],
    [],
  )

  if (!v) return <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
  const devices = v.stations.flatMap((s) => [s.controller, s.tool]).filter((d): d is DeviceHealth => !!d)
  const ctrl = devices.filter((d) => d.type === 'controller')
  const tools = devices.filter((d) => d.type === 'tool')
  const last = v.stations.map((s) => s.last).filter((x): x is Tightening => !!x).sort((a, b) => b.t - a.t)[0]

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <StatStrip
        stats={[
          { label: 'Sıkma', value: num(v.total), sub: 'seçilen aralık ve filtre' },
          { label: 'OK', value: num(v.ok), sub: pct(v.total ? v.ok / v.total : Number.NaN) },
          { label: 'NOK', value: v.nok, sub: pct(v.total ? v.nok / v.total : Number.NaN, 2), tone: v.nok ? 'critical' : undefined },
          { label: 'Controller', value: `${ctrl.filter((d) => d.online).length}/${ctrl.length}`, sub: 'online', tone: ctrl.some((d) => !d.online) ? 'critical' : 'good' },
          { label: 'Tool', value: `${tools.filter((d) => d.online).length}/${tools.length}`, sub: 'online', tone: tools.some((d) => !d.online) ? 'critical' : 'good' },
          { label: 'Son sonuç', value: last ? last.result : '—', sub: last ? `${num(last.torqueNm, 1)} Nm, ${last.op} ${last.joint}, ${hms(last.t)}` : undefined, tone: last?.result === 'NOK' ? 'critical' : undefined },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {v.stations.map((s) => (
          <StationCard key={s.op} s={s} now={now} active={op === s.op} onPick={() => setOp(op === s.op ? '' : s.op)} />
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-fg-2">İstasyon</span>
            <select value={op} onChange={(e) => setOp(e.target.value)} className={sel}>
              <option value="">Tümü</option>
              {v.stations.map((s) => (
                <option key={s.op} value={s.op}>
                  {s.op}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-fg-2">Sonuç</span>
            <select value={result} onChange={(e) => setResult(e.target.value as '' | 'OK' | 'NOK')} className={sel}>
              <option value="">Tümü</option>
              <option value="OK">OK</option>
              <option value="NOK">NOK</option>
            </select>
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-[11.5px] text-fg-2">Motor seri no</span>
            <input value={sn} onChange={(e) => setSn(e.target.value)} placeholder="Ör. 261003-0105" className={cn(sel, 'display text-[14px]')} />
          </label>
          <WindowPicker value={wk} onChange={setWk} />
          <Button variant="primary" size="md" onClick={() => void download()} title="Filtredeki tüm kayıtlar; Excel'de doğrudan açılır">
            <Download className="size-4" /> CSV indir
          </Button>
          {exporting && <span className="text-[12px] text-fg-2">{exporting}</span>}
        </div>
        <div className="flex items-baseline justify-between border-t px-4 py-2 text-[12px] text-fg-2">
          <span>{v.truncated ? `En yeni ${num(v.rows.length)} kayıt gösteriliyor (toplam ${num(v.total)}); CSV tamamını içerir.` : `${num(v.rows.length)} kayıt`}</span>
          <span>Tolerans dışı sıkmalar NOK; aynı joint için retry ayrı satırdır.</span>
        </div>
        <div style={{ height: 560 }}>
          <AgGridReact<Tightening>
            theme={gridTheme}
            localeText={gridLocale}
            rowData={v.rows}
            columnDefs={cols}
            getRowId={(p) => p.data.id}
            rowHeight={36}
            headerHeight={36}
            rowClassRules={{ 'ag-row-nok': (p) => p.data?.result === 'NOK' }}
          />
        </div>
      </Card>
    </div>
  )
}

function DeviceLine({ label, d, now }: { label: string; d: DeviceHealth | null; now: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="truncate">
        {label} <span className="text-fg-2">{d?.id ?? '—'}</span>
      </span>
      {d ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11.5px] text-fg-3">{ago(now - d.lastT)}</span>
          <StateBadge state={d.online ? 'running' : 'offline'} label={d.online ? 'Online' : 'Offline'} />
        </span>
      ) : (
        <span className="text-fg-3">veri yok</span>
      )}
    </div>
  )
}

/** İstasyon başına sıkma özeti ve controller / tool durumu (R-043) */
function StationCard({ s, now, active, onPick }: { s: TighteningStation; now: number; active: boolean; onPick: () => void }) {
  return (
    <Card className={cn('px-4 py-3', active && 'border-accent shadow-[0_0_0_1px_var(--accent)]')}>
      <button type="button" onClick={onPick} className="flex w-full items-baseline justify-between gap-2 text-left focus-visible:outline-2 focus-visible:outline-accent" aria-pressed={active} title="Tabloyu bu istasyona göre filtrele">
        <span className="opcode text-[20px]">{s.op}</span>
        <span className="text-[12px] text-fg-2">
          {s.pset}, {s.targetNm} ± {s.tolNm} Nm, {s.joints} joint
        </span>
      </button>
      <div className="mt-2 flex items-baseline gap-4 text-[12.5px]">
        <span>
          <b className="display text-[20px]">{num(s.total)}</b> sıkma
        </span>
        <span className={s.nok ? 'text-critical-text' : 'text-fg-2'}>
          <b className="display text-[20px]">{s.nok}</b> NOK
        </span>
      </div>
      {s.last && (
        <p className="mt-1 text-[12px] text-fg-2">
          Son: {s.last.joint} <b className="display text-[13px] text-fg">{num(s.last.torqueNm, 1)} Nm</b>, {s.last.angleDeg}°, {s.last.result}, {hms(s.last.t)}
        </p>
      )}
      <div className="mt-2 space-y-1 border-t pt-2">
        <DeviceLine label="Controller" d={s.controller} now={now} />
        <DeviceLine label="Tool" d={s.tool} now={now} />
      </div>
    </Card>
  )
}
