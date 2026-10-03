/**
 * Vardiya planı. Varsayılan değerler müşteri prototipinden alındı (A 08–16, B 16–24, C 00–08);
 * gerçek vardiya planı proje başında kesinleşecek ve admin ekranından değiştirilebilecek.
 */

export type ShiftId = 'A' | 'B' | 'C'

export interface Shift {
  id: ShiftId
  name: string
  /** Başlangıç saati (yerel saat, 0–23) */
  startHour: number
  /** Süre (saat) */
  lengthH: number
}

export const DEFAULT_SHIFTS: Shift[] = [
  { id: 'A', name: 'A Vardiyası', startHour: 8, lengthH: 8 },
  { id: 'B', name: 'B Vardiyası', startHour: 16, lengthH: 8 },
  { id: 'C', name: 'C Vardiyası', startHour: 0, lengthH: 8 },
]

/** t anındaki vardiya */
export function shiftOf(t: number, shifts: Shift[] = DEFAULT_SHIFTS): Shift {
  const d = new Date(t)
  const h = d.getHours() + d.getMinutes() / 60
  return shifts.find((s) => (h - s.startHour + 24) % 24 < s.lengthH) ?? shifts[0]
}

/** "08–16" */
export function shiftHours(s: Shift): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const end = s.startHour + s.lengthH
  return `${p(s.startHour)}–${p(end === 24 ? 24 : end % 24)}`
}

const HOUR = 3600 * 1000

/** t anının içinde bulunduğu vardiyanın başlangıcı ve bitişi */
export function shiftWindow(t: number, shifts: Shift[] = DEFAULT_SHIFTS): { shift: Shift; start: number; end: number } {
  const shift = shiftOf(t, shifts)
  const d = new Date(t)
  d.setMinutes(0, 0, 0)
  // Vardiya başlangıcına geri git (gece yarısını geçen vardiyalar dahil)
  const back = (d.getHours() - shift.startHour + 24) % 24
  const start = d.getTime() - back * HOUR
  return { shift, start, end: start + shift.lengthH * HOUR }
}

/** Üretim gününün başlangıcı (varsayılan 08:00; sayaçlar bu saatte sıfırlanır) */
export function dayStartOf(t: number, dayStartHour = 8): number {
  const d = new Date(t)
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1)
  d.setHours(dayStartHour, 0, 0, 0)
  return d.getTime()
}
