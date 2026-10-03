import { useMemo } from 'react'
import { useApp } from '@/data/app'
import { shiftWindow } from '@/domain/shifts'
import type { TimeWindow } from '@/domain/views'

export type WindowKey = 'shift' | 'h24' | 'd7'

export const WINDOW_LABEL: Record<WindowKey, string> = { shift: 'Bu vardiya', h24: 'Son 24 saat', d7: 'Son 7 gün' }

const MIN = 60_000

/** Seçilen pencereyi uygulama saatine göre hesaplar; dakikada bir kayar (sorgular gereksiz yere tekrarlanmasın) */
export function useTimeWindow(key: WindowKey): TimeWindow {
  const now = useApp((s) => s.now)
  const minute = Math.floor(now / MIN) * MIN
  return useMemo(() => {
    const to = minute + MIN
    if (key === 'shift') return { from: shiftWindow(minute).start, to }
    return { from: to - (key === 'h24' ? 24 : 7 * 24) * 60 * MIN, to }
  }, [key, minute])
}
