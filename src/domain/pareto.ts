import type { Store } from './store/Store'
import type { Alarm } from './types'

/** Basit Pareto görünümleri (R-048) */

export interface ParetoItem {
  label: string
  count: number
  /** Toplam içindeki pay (0–1) */
  share: number
  /** Kümülatif pay (0–1) */
  cumShare: number
}

export function pareto(counts: Map<string, number>): ParetoItem[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  let cum = 0
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .map(([label, count]) => {
      cum += count
      return { label, count, share: total ? count / total : 0, cumShare: total ? cum / total : 0 }
    })
}

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/** Kalite hataları: OP100 NOK / HOLD nedenleri ve tork NOK'ları */
export function defectPareto(store: Store, from: number, to: number): ParetoItem[] {
  const m = new Map<string, number>()
  for (const q of store.find('quality_result', { range: { field: 't', gte: from, lt: to } })) {
    if (q.decision !== 'OK') inc(m, q.defectText ?? q.defectCode ?? 'Belirtilmemiş')
  }
  for (const t of store.find('tightening', { where: { result: 'NOK' }, range: { field: 't', gte: from, lt: to } })) inc(m, `Tork NOK · ${t.op}`)
  return pareto(m)
}

/** Alarm kaynakları (kaynak, kod ya da istasyona göre) */
export function alarmPareto(store: Store, from: number, to: number, by: 'source' | 'code' | 'op' = 'source'): ParetoItem[] {
  const m = new Map<string, number>()
  for (const a of store.find('alarm', { range: { field: 't', gte: from, lt: to } })) inc(m, String((a as Alarm)[by] ?? '—'))
  return pareto(m)
}
