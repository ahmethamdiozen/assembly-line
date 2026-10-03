import type { EChartsCoreOption } from 'echarts/core'
import { useMemo } from 'react'

/** Grafiklerin renkleri CSS token'larından okunur (src/index.css); tek, açık tema vardır. */
export interface ChartTokens {
  fg: string
  fg2: string
  fg3: string
  grid: string
  axis: string
  card: string
  border: string
  series: string[]
  good: string
  warning: string
  warningText: string
  critical: string
  info: string
  offline: string
  accent: string
}

export function readTokens(): ChartTokens {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    fg: v('--fg'),
    fg2: v('--fg-2'),
    fg3: v('--fg-3'),
    grid: v('--grid'),
    axis: v('--axis'),
    card: v('--card'),
    border: v('--border'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    good: v('--good'),
    warning: v('--warning'),
    warningText: v('--warning-text'),
    critical: v('--critical'),
    info: v('--info'),
    offline: v('--offline'),
    accent: v('--accent'),
  }
}

export function useChartTokens(): ChartTokens {
  return useMemo(() => readTokens(), [])
}

export function baseOption(t: ChartTokens): EChartsCoreOption {
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: t.fg2, fontFamily: 'Inter Variable, system-ui, sans-serif', fontSize: 12 },
    tooltip: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.fg, fontSize: 12 },
      extraCssText: 'box-shadow: 0 6px 20px rgba(42,58,70,.12); border-radius: 8px;',
    },
  }
}

export function timeAxisStyle(t: ChartTokens) {
  return {
    type: 'time' as const,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.fg3, hideOverlap: true, formatter: '{HH}:{mm}' },
    splitLine: { show: false },
  }
}

export function valueAxisStyle(t: ChartTokens) {
  return {
    type: 'value' as const,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.fg3 },
    splitLine: { lineStyle: { color: t.grid } },
  }
}

export function categoryAxisStyle(t: ChartTokens, data: string[]) {
  return {
    type: 'category' as const,
    data,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.fg2 },
  }
}
