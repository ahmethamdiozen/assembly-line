import { CalendarDays, Gauge, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EChart } from '@/components/charts/EChart'
import { ParetoChart } from '@/components/charts/ParetoChart'
import { baseOption, timeAxisStyle, useChartTokens, valueAxisStyle } from '@/components/charts/theme'
import { StatStrip } from '@/components/common/StatStrip'
import { OpCode } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Meter } from '@/components/ui/meter'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, usePolled } from '@/data/app'
import type { KpiReport, ShiftRow, StationWindowStat } from '@/domain/reports'
import { dayStartOf, shiftHours } from '@/domain/shifts'
import type { ShiftId } from '@/domain/shifts'
import { hhmm, minutes, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * KPI & Raporlar (R-045–R-049). Filtreler adres çubuğunda tutulur (?gun=2026-10-03&vardiya=A&op=OP070);
 * bağlantı paylaşılınca aynı rapor açılır. Formüller Metrik Rehberi'nde.
 */

const DAY = 24 * 3600_000
const pad = (n: number) => String(n).padStart(2, '0')
const dayStr = (day: number) => {
  const d = new Date(day)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const dayOf = (s: string | null, startHour: number): number | null => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), startHour).getTime() : null
}
type Filter = 'gun' | 'vardiya' | 'op'
const dateLabel = (t: number) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })

export default function Kpi() {
  const now = useApp((s) => s.now)
  const cfg = backend.master.config
  const [params, setParams] = useSearchParams()
  // Filtreler React state'inde tutulur ve adres çubuğuna yazılır. setSearchParams güncellemeleri
  // sıraya koymadığı için art arda yapılan seçimlerde öncekinin kaybolmaması gerekir.
  const [f, setF] = useState<Record<Filter, string | null>>(() => ({ gun: params.get('gun'), vardiya: params.get('vardiya'), op: params.get('op') }))
  useEffect(() => {
    setParams(Object.fromEntries(Object.entries(f).filter((e): e is [Filter, string] => !!e[1])), { replace: true })
  }, [f, setParams])
  const set = (k: Filter, v: string | null) => setF((x) => ({ ...x, [k]: v || null }))
  const today = dayStartOf(now, cfg.dayStartHour)
  const day = dayOf(f.gun, cfg.dayStartHour) ?? today
  const shift = cfg.shifts.some((s) => s.id === f.vardiya) ? (f.vardiya as ShiftId) : null
  const op = f.op
  const r = usePolled(() => backend.kpiReport({ day, shift, op }), [day, shift, op])

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <label className="flex items-center gap-2 text-[13px]">
          <CalendarDays className="size-4 text-fg-2" />
          <span className="text-fg-2">Üretim günü</span>
          <input
            type="date"
            value={dayStr(day)}
            max={dayStr(today)}
            onChange={(e) => set('gun', e.target.value && e.target.value !== dayStr(today) ? e.target.value : null)}
            className="h-9 rounded-md border border-border-strong bg-card px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <div className="flex gap-1">
          <Button variant={day === today ? 'primary' : 'outline'} onClick={() => set('gun', null)}>
            Bugün
          </Button>
          <Button variant={day === today - DAY ? 'primary' : 'outline'} onClick={() => set('gun', dayStr(today - DAY))}>
            Dün
          </Button>
        </div>
        <Segmented
          label="Vardiya"
          value={shift ?? 'all'}
          onChange={(v) => set('vardiya', v === 'all' ? null : v)}
          options={[{ value: 'all', label: 'Tüm gün' }, ...cfg.shifts.map((s) => ({ value: s.id as string, label: `${s.id} ${shiftHours(s)}` }))]}
        />
        {r && <WindowText r={r} />}
      </Card>

      {!r ? (
        <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
      ) : r.window.to <= r.window.from ? (
        <Card className="px-6 py-10 text-center text-sm text-fg-2">Bu {shift ? 'vardiya' : 'üretim günü'} henüz başlamadı.</Card>
      ) : r.window.noData ? (
        <Card className="px-6 py-10 text-center text-sm text-fg-2">
          Bu aralıkta fabrika verisi yok.{r.dataFrom && ` Uygulama veritabanındaki ilk veri: ${new Date(r.dataFrom).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`}
        </Card>
      ) : (
        <Report r={r} onShift={(s) => set('vardiya', s)} onOp={(o) => set('op', o)} />
      )}
    </div>
  )
}

function WindowText({ r }: { r: KpiReport }) {
  const w = r.window
  return (
    <p className="ml-auto text-right text-[13px] text-fg-2">
      <span className="font-medium text-fg">{dateLabel(w.from)}</span> {hhmm(w.from)}–{w.complete ? hhmm(w.end) : `${hhmm(w.to)}, sürüyor`}
      {w.partial && (
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-warning-text">
          <TriangleAlert className="size-3.5" /> Veri {hhmm(w.calcFrom)} itibarıyla var; hesap bu saatten başlıyor
        </span>
      )}
    </p>
  )
}

function Report({ r, onShift, onOp }: { r: KpiReport; onShift: (s: ShiftId | null) => void; onOp: (op: string) => void }) {
  const k = r.kpi
  const bn = r.stations.find((s) => s.op === r.bottleneck) ?? null
  return (
    <>
      <StatStrip
        stats={[
          { label: 'OEE', value: pct(k.oee), sub: 'A × P × FPY', icon: <Gauge className="size-3.5" /> },
          { label: 'Availability', value: pct(k.availability), sub: `${num(k.faultSec / 60)} dk arıza / ${num(k.plannedSec / 3600, 1)} sa planlı` },
          { label: 'Performance', value: pct(k.performance), sub: `ideal çevrim ${minutes(k.idealCycleSec / 60)}` },
          { label: 'FPY (Quality)', value: pct(k.quality), sub: `${k.firstPassOk} / ${k.firstInspected} ilk muayenede OK`, tone: k.quality < 0.95 ? 'warning' : undefined },
          { label: 'Çıkış', value: k.output, unit: 'motor', sub: `${num(k.outputPerHour, 1)} / saat` },
          { label: 'Plan gerçekleşme', value: pct(k.planAttainment), sub: `${k.output} / ${Math.floor(k.expected)} beklenen`, tone: k.planAttainment < 0.9 ? 'warning' : undefined },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Saatlik çıkış" subtitle={`OP110'dan OK çıkan motorlar; işaret takt'a göre beklenen (saatte ${num(3600 / backend.master.config.taktSec)})`} />
          <HourlyChart rows={r.hourly} />
        </Card>
        <Card>
          <CardHeader title="Vardiya karşılaştırması" subtitle="Seçilen üretim günü; satıra tıklayınca rapor o vardiyaya geçer (R-045, R-049)" />
          <ShiftTable rows={r.shifts} selected={r.query.shift} onPick={onShift} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader title="İstasyon çevrimleri: gerçekleşen, hedef ve takt" subtitle="Penceredeki tamamlanmış çevrimlerin ortalaması; çubuğa tıklayınca aşağıdaki trend o istasyona geçer (R-046)" />
          <WindowCycleChart stats={r.stations} bottleneck={r.bottleneck} selected={r.trend.op} onSelect={onOp} />
        </Card>
        <Card className="px-4 py-3.5">
          <h3 className="text-[13px] font-semibold">Darboğaz (R-047)</h3>
          {bn ? <Bottleneck bn={bn} stations={r.stations} onOp={onOp} /> : <p className="mt-3 text-[13px] text-fg-2">Bu aralıkta tamamlanmış çevrim yok.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`${r.trend.op} çevrim trendi`}
          subtitle="Her nokta bir motor; kesikli çizgi takt, düz çizgi istasyon hedefi. Takt'ı aşanlar sarı."
          right={
            <select value={r.trend.op} onChange={(e) => onOp(e.target.value)} aria-label="Trend istasyonu" className="h-8 rounded-md border border-border-strong bg-card px-2 text-[13px]">
              {r.stations.map((s) => (
                <option key={s.op} value={s.op}>
                  {s.op} {s.name}
                </option>
              ))}
            </select>
          }
        />
        <TrendChart r={r} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Kalite hataları" subtitle="OP100 NOK / HOLD nedenleri ve tork NOK'ları; çubuk etiketinde kümülatif pay (R-048)" />
          <div className="px-3 pb-3 pt-2">
            <ParetoChart items={r.defects} label="Kalite hataları Pareto" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Alarm kaynakları" subtitle="Penceredeki alarmlar kaynağa göre" right={<Link to="/alarmlar" className="text-[12px] text-info-text hover:underline">Alarm Merkezi</Link>} />
          <div className="px-3 pb-3 pt-2">
            <ParetoChart items={r.alarmSources} label="Alarm kaynakları Pareto" />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="İstasyon tablosu" subtitle="Penceredeki çevrim istatistikleri ve arıza süreleri" />
        <StationTable stats={r.stations} bottleneck={r.bottleneck} />
      </Card>
    </>
  )
}

function ShiftTable({ rows, selected, onPick }: { rows: ShiftRow[]; selected: ShiftId | null; onPick: (s: ShiftId | null) => void }) {
  const taktSec = backend.master.config.taktSec
  return (
    <div className="overflow-x-auto px-4 pb-3 pt-2">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[11.5px] text-fg-2">
          <tr className="border-b">
            <th className="py-1.5 font-medium">Vardiya</th>
            <th className="py-1.5 text-right font-medium">Çıkış / hedef</th>
            <th className="py-1.5 text-right font-medium">FPY</th>
            <th className="py-1.5 text-right font-medium">A</th>
            <th className="py-1.5 text-right font-medium">P</th>
            <th className="py-1.5 text-right font-medium">OEE</th>
            <th className="py-1.5 text-right font-medium">Arıza</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ shift, window: w, kpi }) => {
            // Kısmi veride hedef, verinin olduğu süreye göre
            const target = kpi && w.partial ? Math.floor(kpi.expected) : Math.floor((shift.lengthH * 3600) / taktSec)
            return (
              <tr
                key={shift.id}
                onClick={() => onPick(selected === shift.id ? null : shift.id)}
                className={cn('cursor-pointer border-b last:border-0 hover:bg-wash', selected === shift.id && 'bg-accent-bg/60')}
                aria-selected={selected === shift.id}
              >
                <td className="py-2">
                  <span className="font-medium">{shift.name}</span> <span className="text-fg-2">{shiftHours(shift)}</span>
                  {kpi && !w.complete && <span className="ml-1.5 rounded-full bg-info-bg px-1.5 py-px text-[11px] font-semibold text-info-text">sürüyor</span>}
                  {kpi && w.partial && (
                    <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-px text-[11px] font-semibold text-warning-text" title={`Veri ${hhmm(w.calcFrom)} itibarıyla var`}>
                      kısmi veri
                    </span>
                  )}
                </td>
                {kpi ? (
                  <>
                    <td className="display py-2 text-right text-[14px]">
                      <b>{kpi.output}</b> <span className="text-fg-3">/ {target}</span>
                    </td>
                    <td className="display py-2 text-right text-[14px]">{pct(kpi.quality)}</td>
                    <td className="display py-2 text-right text-[14px]">{pct(kpi.availability)}</td>
                    <td className="display py-2 text-right text-[14px]">{pct(kpi.performance)}</td>
                    <td className="display py-2 text-right text-[14px] font-semibold">{pct(kpi.oee)}</td>
                    <td className="display py-2 text-right text-[14px]">{minutes(kpi.faultSec / 60, 0)}</td>
                  </>
                ) : (
                  <td colSpan={6} className="py-2 text-right text-fg-3">
                    {w.from >= w.to ? 'henüz başlamadı' : 'veri yok'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Bottleneck({ bn, stations, onOp }: { bn: StationWindowStat; stations: StationWindowStat[]; onOp: (op: string) => void }) {
  const ranked = stations.filter((s) => s.n).sort((a, b) => b.meanSec - a.meanSec).slice(0, 5)
  const max = Math.max(bn.meanSec, bn.taktSec) * 1.05
  return (
    <div className="mt-2">
      <p className="text-[13px] leading-relaxed">
        <OpCode op={bn.op} className="text-[18px]" /> <span className="font-medium">{bn.name}</span>
        <br />
        <span className="text-fg-2">
          Ortalama <b className="text-fg">{minutes(bn.meanSec / 60, 2)}</b>, hedef {minutes(bn.targetSec / 60)}, takt {minutes(bn.taktSec / 60)}. {bn.n} çevrimin {bn.overTakt}'i takt'ı aştı.
        </span>
      </p>
      {bn.meanSec > bn.taktSec && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md bg-warning-bg px-2 py-1 text-[12.5px] text-warning-text">
          <TriangleAlert className="size-3.5 shrink-0" /> Ortalama takt'ın üstünde: hat bu istasyonun hızında akıyor.
        </p>
      )}
      <ol className="mt-3 space-y-2" aria-label="Ortalama çevrime göre sıralama">
        {ranked.map((s) => (
          <li key={s.op}>
            <button type="button" onClick={() => onOp(s.op)} className="w-full text-left focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex items-baseline justify-between text-[12.5px]">
                <span>
                  <OpCode op={s.op} /> <span className="text-fg-2">{s.name}</span>
                </span>
                <span className="display text-[13px] font-semibold">{minutes(s.meanSec / 60, 2)}</span>
              </span>
              <Meter value={s.meanSec / max} marker={s.taktSec / max} color={s.meanSec > s.taktSec ? 'var(--warning)' : 'var(--accent)'} className="mt-1" />
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11.5px] text-fg-3">Çizgi: takt. Sıralama penceredeki ortalama net işleme süresine göre.</p>
    </div>
  )
}

function StationTable({ stats, bottleneck }: { stats: StationWindowStat[]; bottleneck: string | null }) {
  return (
    <div className="overflow-x-auto px-4 pb-3 pt-2">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[11.5px] text-fg-2">
          <tr className="border-b">
            <th className="py-1.5 font-medium">OP</th>
            <th className="py-1.5 font-medium">İstasyon</th>
            <th className="py-1.5 text-right font-medium">Çevrim</th>
            <th className="py-1.5 text-right font-medium">Ortalama</th>
            <th className="py-1.5 text-right font-medium">Medyan</th>
            <th className="py-1.5 text-right font-medium">En uzun</th>
            <th className="py-1.5 text-right font-medium">Hedef</th>
            <th className="py-1.5 text-right font-medium">Takt üstü</th>
            <th className="py-1.5 text-right font-medium">Arıza</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.op} className="border-b last:border-0">
              <td className="py-1.5">
                <OpCode op={s.op} />
              </td>
              <td className="py-1.5">
                {s.name}
                {s.op === bottleneck && <span className="ml-1.5 rounded-full bg-warning-bg px-1.5 py-px text-[11px] font-semibold text-warning-text">darboğaz</span>}
              </td>
              <td className="display py-1.5 text-right text-[14px]">{s.n}</td>
              <td className={cn('display py-1.5 text-right text-[14px] font-semibold', s.meanSec > s.taktSec && 'text-warning-text')}>{minutes(s.meanSec / 60, 2)}</td>
              <td className="display py-1.5 text-right text-[14px]">{minutes(s.medianSec / 60, 2)}</td>
              <td className="display py-1.5 text-right text-[14px]">{minutes(s.maxSec / 60, 1)}</td>
              <td className="display py-1.5 text-right text-[14px] text-fg-2">{minutes(s.targetSec / 60)}</td>
              <td className="display py-1.5 text-right text-[14px]">{s.n ? `${s.overTakt} (${pct(s.overTakt / s.n, 0)})` : '—'}</td>
              <td className="display py-1.5 text-right text-[14px]">{s.faultMin ? minutes(s.faultMin, 0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- grafikler

function HourlyChart({ rows }: { rows: KpiReport['hourly'] }) {
  const t = useChartTokens()
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 30, right: 14, top: 30, bottom: 24 },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: t.fg2, fontSize: 12 }, data: ['Çıkış', "Takt'a göre beklenen"] },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(61,141,184,0.08)' } },
        formatter: (ps: { dataIndex: number }[]) => {
          const h = rows[ps[0].dataIndex]
          return `<b>${hhmm(h.t)}–${hhmm(h.t + 3600_000)}</b><br/>Çıkış: <b>${h.output}</b><br/>Beklenen: ${num(h.target, 1)}`
        },
      },
      xAxis: { type: 'category', data: rows.map((h) => hhmm(h.t)), axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.fg3 } },
      yAxis: { ...valueAxisStyle(t), min: 0, minInterval: 1 },
      series: [
        { name: 'Çıkış', type: 'bar', barWidth: '55%', data: rows.map((h) => ({ value: h.output, itemStyle: { color: t.accent, borderRadius: [4, 4, 0, 0] } })) },
        { name: "Takt'a göre beklenen", type: 'scatter', symbol: 'rect', symbolSize: [18, 3], itemStyle: { color: t.fg }, z: 5, data: rows.map((h) => (h.target > 0 ? +h.target.toFixed(2) : null)) },
      ],
    }),
    [t, rows],
  )
  return <EChart option={option} height={240} label="Saatlik çıkış ve takt'a göre beklenen" />
}

function WindowCycleChart({ stats, bottleneck, selected, onSelect }: { stats: StationWindowStat[]; bottleneck: string | null; selected: string; onSelect: (op: string) => void }) {
  const t = useChartTokens()
  const takt = (stats[0]?.taktSec ?? 450) / 60
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 30, right: 64, top: 36, bottom: 26 },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: t.fg2, fontSize: 12 }, data: ['Ortalama çevrim', 'İstasyon hedefi'] },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(61,141,184,0.08)' } },
        formatter: (ps: { dataIndex: number }[]) => {
          const s = stats[ps[0].dataIndex]
          if (!s.n) return `<b>${s.op}</b><br/>Çevrim verisi yok`
          return `<b>${s.op}</b> ${s.name}<br/>Ortalama (${s.n} çevrim): <b>${minutes(s.meanSec / 60, 2)}</b><br/>Medyan: ${minutes(s.medianSec / 60, 2)} · en uzun: ${minutes(s.maxSec / 60, 1)}<br/>Hedef: ${minutes(s.targetSec / 60)} · Takt: ${minutes(s.taktSec / 60)}<br/>Takt üstü: ${s.overTakt} çevrim`
        },
      },
      xAxis: {
        type: 'category',
        data: stats.map((s) => s.op),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.fg2, fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, interval: 0 },
      },
      yAxis: { ...valueAxisStyle(t), min: 0 },
      series: [
        {
          name: 'Ortalama çevrim',
          type: 'bar',
          barWidth: '56%',
          data: stats.map((s) => ({
            value: s.n ? +(s.meanSec / 60).toFixed(2) : null,
            itemStyle: {
              color: s.meanSec > s.taktSec ? t.warning : t.accent,
              borderRadius: [4, 4, 0, 0],
              borderColor: s.op === selected ? t.fg : 'transparent',
              borderWidth: s.op === selected ? 2 : 0,
            },
            label: { show: s.op === bottleneck, position: 'top', color: t.fg2, fontSize: 11, fontWeight: 600, formatter: 'Darboğaz' },
          })),
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: t.fg2, type: [5, 4], width: 1.5 },
            label: { position: 'end', color: t.fg2, fontSize: 11, formatter: `Takt ${String(takt).replace('.', ',')} dk` },
            data: [{ yAxis: takt }],
          },
        },
        { name: 'İstasyon hedefi', type: 'scatter', symbol: 'rect', symbolSize: [16, 3], itemStyle: { color: t.fg }, z: 5, data: stats.map((s) => +(s.targetSec / 60).toFixed(2)) },
      ],
    }),
    [t, stats, bottleneck, selected, takt],
  )
  return (
    <EChart
      option={option}
      height={260}
      label="İstasyon bazında ortalama çevrim, hedef ve takt"
      onPointClick={(p) => {
        if (p.dataIndex !== undefined && stats[p.dataIndex]) onSelect(stats[p.dataIndex].op)
      }}
    />
  )
}

function TrendChart({ r }: { r: KpiReport }) {
  const t = useChartTokens()
  const st = r.stations.find((s) => s.op === r.trend.op)!
  const takt = st.taktSec / 60
  const target = st.targetSec / 60
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 34, right: 16, top: 14, bottom: 26 },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const x = r.trend.points[p.dataIndex]
          return `<b>${x.sn}</b><br/>Bitiş ${hhmm(x.t)}<br/>Çevrim: <b>${minutes(x.sec / 60, 2)}</b>`
        },
      },
      xAxis: { ...timeAxisStyle(t), min: r.window.from, max: r.window.to },
      yAxis: { ...valueAxisStyle(t), min: 0, max: (v: { max: number }) => Math.ceil(Math.max(v.max, takt) * 1.15) },
      series: [
        {
          type: 'line',
          data: r.trend.points.map((x) => [x.t, +(x.sec / 60).toFixed(2)]),
          showSymbol: true,
          symbolSize: 8,
          lineStyle: { color: t.accent, width: 1.5, opacity: 0.5 },
          itemStyle: { color: (p: { value: [number, number] }) => (p.value[1] > takt ? t.warning : t.accent), borderColor: t.card, borderWidth: 2 },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { show: false },
            data: [
              { yAxis: takt, lineStyle: { color: t.fg2, type: [5, 4], width: 1.5 } },
              { yAxis: target, lineStyle: { color: t.fg, type: 'solid', width: 1 } },
            ],
          },
        },
      ],
    }),
    [t, r, takt, target],
  )
  if (!r.trend.points.length) return <p className="px-4 py-10 text-center text-sm text-fg-2">Bu istasyonda bu aralıkta tamamlanmış çevrim yok.</p>
  return (
    <>
      <EChart option={option} height={230} label={`${r.trend.op} çevrim süreleri zamana göre`} />
      <p className="px-4 pb-3 text-[11.5px] text-fg-3">
        Takt {minutes(takt)} · hedef {minutes(target)} · {r.trend.points.length} çevrim, {r.trend.points.filter((p) => p.sec / 60 > takt).length} tanesi takt üstü
      </p>
    </>
  )
}
