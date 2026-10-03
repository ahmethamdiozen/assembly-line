import { describe, expect, it } from 'vitest'
import { DEFAULT_SHIFTS, dayStartOf, shiftHours, shiftOf, shiftWindow } from './shifts'

const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m).getTime()

describe('vardiyalar', () => {
  it('saate göre doğru vardiyayı bulur', () => {
    expect(shiftOf(at(8)).id).toBe('A')
    expect(shiftOf(at(15, 59)).id).toBe('A')
    expect(shiftOf(at(16)).id).toBe('B')
    expect(shiftOf(at(23, 59)).id).toBe('B')
    expect(shiftOf(at(0)).id).toBe('C')
    expect(shiftOf(at(7, 59)).id).toBe('C')
  })

  it('saat aralığını yazar', () => {
    expect(DEFAULT_SHIFTS.map(shiftHours)).toEqual(['08–16', '16–24', '00–08'])
  })
})

describe('vardiya penceresi ve üretim günü', () => {
  it('vardiyanın başlangıç ve bitişini bulur', () => {
    const w = shiftWindow(at(10, 37))
    expect(w.shift.id).toBe('A')
    expect(w.start).toBe(at(8))
    expect(w.end).toBe(at(16))
    const c = shiftWindow(at(3, 5))
    expect(c.shift.id).toBe('C')
    expect(c.start).toBe(at(0))
  })

  it('üretim günü 08:00\'de başlar', () => {
    expect(dayStartOf(at(9))).toBe(at(8))
    expect(dayStartOf(at(7, 59))).toBe(new Date(2026, 9, 2, 8).getTime())
  })
})
