import { describe, expect, it } from 'vitest'
import { ago, fmtDuration, minutes, num, pct } from './format'

describe('format', () => {
  it('yüzde ve sayılar Türkçe ondalık ayracıyla yazılır', () => {
    expect(pct(0.9234)).toBe('%92,3')
    expect(pct(1, 0)).toBe('%100')
    expect(num(1284)).toBe('1.284')
    expect(minutes(7.5)).toBe('7,5 dk')
  })

  it('geçersiz değerler tire olarak gösterilir', () => {
    expect(pct(Number.NaN)).toBe('—')
    expect(minutes(Number.POSITIVE_INFINITY)).toBe('—')
    expect(fmtDuration(-1)).toBe('—')
  })

  it('süreler okunur biçimde yazılır', () => {
    expect(fmtDuration(45)).toBe('45 sn')
    expect(fmtDuration(12 * 60 + 20)).toBe('12 dk')
    expect(fmtDuration(2 * 3600 + 5 * 60)).toBe('2 sa 5 dk')
    expect(ago(30_000)).toBe('30 sn önce')
    expect(ago(3 * 60_000)).toBe('3 dk önce')
    expect(ago(2 * 3600_000)).toBe('2 sa önce')
  })
})
