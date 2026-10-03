import { csvTime, toCsv } from '@/lib/csv'
import type { Tightening } from './types'

/** Tork kayıtları dışa aktarımı (R-044). Sunucu ve demo aynı dosyayı üretir. */
export function tighteningCsv(rows: Tightening[]): string {
  return toCsv(rows, [
    { header: 'Zaman', value: (r) => csvTime(r.t) },
    { header: 'Motor S/N', value: (r) => r.sn },
    { header: 'OP', value: (r) => r.op },
    { header: 'Controller', value: (r) => r.controllerId },
    { header: 'Tool', value: (r) => r.toolId },
    { header: 'Pset', value: (r) => r.pset },
    { header: 'Joint', value: (r) => r.joint },
    { header: 'Hedef (Nm)', value: (r) => r.targetNm },
    { header: 'Min (Nm)', value: (r) => r.minNm },
    { header: 'Max (Nm)', value: (r) => r.maxNm },
    { header: 'Tork (Nm)', value: (r) => r.torqueNm },
    { header: 'Açı (°)', value: (r) => r.angleDeg },
    { header: 'Sonuç', value: (r) => r.result },
  ])
}

export const tighteningCsvName = (from: number, to: number) => `tork-${csvTime(from).slice(0, 10)}_${csvTime(to).slice(0, 10)}.csv`
