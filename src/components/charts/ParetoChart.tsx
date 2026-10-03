import { useMemo } from 'react'
import { EChart } from './EChart'
import { baseOption, useChartTokens, valueAxisStyle } from './theme'
import type { ParetoItem } from '@/domain/pareto'

/**
 * Basit Pareto (R-048): yatay çubuklar büyükten küçüğe; kümülatif pay çubuk etiketinde.
 * Tek eksen (çift eksenli Pareto yerine), tek renk; değerler metinle yazılır.
 */
export function ParetoChart({ items, label, max = 8 }: { items: ParetoItem[]; label: string; max?: number }) {
  const t = useChartTokens()
  const rows = useMemo(() => {
    const top = items.slice(0, max)
    const rest = items.slice(max).reduce((a, x) => a + x.count, 0)
    return rest ? [...top, { label: 'Diğer', count: rest, share: 0, cumShare: 1 }] : top
  }, [items, max])
  const option = useMemo(
    () => ({
      ...baseOption(t),
      grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...(baseOption(t).tooltip as object), trigger: 'item', formatter: (p: { dataIndex: number }) => `${rows[p.dataIndex].label}<br/><b>${rows[p.dataIndex].count}</b> adet, kümülatif %${Math.round(rows[p.dataIndex].cumShare * 100)}` },
      xAxis: { ...valueAxisStyle(t), minInterval: 1, splitLine: { show: false }, axisLabel: { show: false } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.fg, fontSize: 12, width: 210, overflow: 'truncate' } },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          data: rows.map((r) => ({ value: r.count, itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', color: t.fg2, fontSize: 12, formatter: (p: { dataIndex: number }) => `${rows[p.dataIndex].count}  (%${Math.round(rows[p.dataIndex].cumShare * 100)})` },
        },
      ],
    }),
    [t, rows],
  )
  if (!items.length) return <p className="px-1 py-6 text-center text-[13px] text-fg-2">Bu aralıkta kayıt yok.</p>
  return <EChart option={option} height={Math.max(120, rows.length * 30 + 10)} label={label} />
}
