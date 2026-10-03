/**
 * Excel'in Türkçe ayarlarında doğrudan açılan CSV (R-044): UTF-8 BOM, ";" ayraç, ondalıkta virgül.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null
}

function cell(v: string | number | null): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'))]
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Yerel saat "2026-10-03 14:32:10" (Excel tarih olarak tanır) */
export function csvTime(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
