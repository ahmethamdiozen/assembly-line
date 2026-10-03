import { useMemo } from 'react'
import { EChart } from '@/components/charts/EChart'
import { baseOption, useChartTokens, valueAxisStyle } from '@/components/charts/theme'
import type { StationCycleStat } from '@/domain/kpi'
import { minutes } from '@/lib/format'

/**
 * İstasyon çevrim süreleri (R-046): son 8 çevrimin ortalaması, istasyon hedefi ve takt. Takt'ı aşan
 * çubuklar uyarı renginde ve etiketli (renk tek başına anlam taşımaz). Çubuğa tıklamak istasyonu seçer.
 */
export function StationCycleChart({ cycles, selected, bottleneck, onSelect }: { cycles: StationCycleStat[]; selected: string | null; bottleneck: string | null; onSelect: (op: string) => void }) {
  const t = useChartTokens()
  const takt = (cycles[0]?.taktSec ?? 450) / 60
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 30, right: 64, top: 36, bottom: 26 },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: t.fg2, fontSize: 12 }, data: ['Son 8 çevrim ortalaması', 'İstasyon hedefi'] },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(61,141,184,0.08)' } },
        formatter: (ps: { dataIndex: number }[]) => {
          const c = cycles[ps[0].dataIndex]
          if (!c.n) return `<b>${c.op}</b><br/>Çevrim verisi yok`
          return `<b>${c.op}</b> ${c.name}<br/>Ortalama (son ${c.n}): <b>${minutes(c.meanSec / 60, 2)}</b><br/>Son çevrim: ${minutes(c.lastSec / 60, 2)}<br/>En kısa / en uzun: ${minutes(c.minSec / 60, 1)} / ${minutes(c.maxSec / 60, 1)}<br/>Hedef: ${minutes(c.targetSec / 60, 1)} · Takt: ${minutes(c.taktSec / 60, 1)}`
        },
      },
      xAxis: {
        type: 'category',
        data: cycles.map((c) => c.op),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.fg2, fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, interval: 0 },
      },
      yAxis: { ...valueAxisStyle(t), min: 0 },
      series: [
        {
          name: 'Son 8 çevrim ortalaması',
          type: 'bar',
          barWidth: '56%',
          data: cycles.map((c) => ({
            value: c.n ? +(c.meanSec / 60).toFixed(2) : null,
            itemStyle: {
              color: c.overTakt ? t.warning : t.accent,
              borderRadius: [4, 4, 0, 0],
              borderColor: c.op === selected ? t.fg : 'transparent',
              borderWidth: c.op === selected ? 2 : 0,
            },
            label: {
              show: c.op === bottleneck || c.overTakt,
              position: 'top',
              color: c.overTakt ? t.warningText : t.fg2,
              fontSize: 11,
              fontWeight: 600,
              formatter: c.op === bottleneck ? 'Darboğaz' : 'Takt üstü',
            },
          })),
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: t.fg2, type: [5, 4], width: 1.5 },
            label: { position: 'end', color: t.fg2, fontSize: 11, formatter: `Takt ${String(takt).replace('.', ',')} dk` },
            data: [{ yAxis: takt }],
          },
        },
        {
          name: 'İstasyon hedefi',
          type: 'scatter',
          symbol: 'rect',
          symbolSize: [16, 3],
          itemStyle: { color: t.fg },
          z: 5,
          data: cycles.map((c) => +(c.targetSec / 60).toFixed(2)),
        },
      ],
    }),
    [t, cycles, selected, bottleneck, takt],
  )
  return (
    <EChart
      option={option}
      height={250}
      label="İstasyon bazında son 8 çevrim ortalaması, hedef ve takt"
      onPointClick={(p) => {
        if (p.dataIndex !== undefined && cycles[p.dataIndex]) onSelect(cycles[p.dataIndex].op)
      }}
    />
  )
}

/** Seçili istasyonun son çevrimleri (R-014, R-046) */
export function StationCycleTrend({ stat }: { stat: StationCycleStat }) {
  const t = useChartTokens()
  const takt = stat.taktSec / 60
  const target = stat.targetSec / 60
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 30, right: 16, top: 14, bottom: 24 },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(61,141,184,0.08)' } },
        formatter: (ps: { dataIndex: number; value: number }[]) => `${ps[0].dataIndex + 1}. çevrim (eski → yeni): <b>${minutes(ps[0].value, 2)}</b>`,
      },
      xAxis: { type: 'category', data: stat.cycles.map((_, i) => String(i + 1)), axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.fg3 } },
      yAxis: { ...valueAxisStyle(t), min: 0, max: (v: { max: number }) => Math.ceil((Math.max(v.max, takt) * 1.1) / 2) * 2, interval: 2 },
      series: [
        {
          type: 'bar',
          barWidth: '50%',
          data: stat.cycles.map((s) => ({ value: +(s / 60).toFixed(2), itemStyle: { color: s / 60 > takt ? t.warning : t.accent, borderRadius: [4, 4, 0, 0] } })),
          // Çizgilerin açıklaması kart alt başlığında (takt ile hedef yakın olunca etiketler çakışmasın)
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
    [t, stat, takt, target],
  )
  if (!stat.n) return <p className="px-4 py-8 text-center text-sm text-fg-2">Bu istasyonda henüz tamamlanmış çevrim yok.</p>
  return <EChart option={option} height={170} label={`${stat.op} son ${stat.n} çevrim süresi`} />
}
