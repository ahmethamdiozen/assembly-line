import { CircleCheck, OctagonX, TriangleAlert, Unplug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DisplayState } from '@/domain/lineState'

/** URS'deki 4 durumun rengi, ikonu ve metni (R-015, R-070: renk tek başına durum anlatmaz) */
export const STATE_STYLE: Record<DisplayState, { icon: LucideIcon; label: string; short: string; badge: string; bar: string; text: string }> = {
  running: { icon: CircleCheck, label: 'Running / Normal', short: 'Normal', badge: 'bg-good-bg text-good-text', bar: 'bg-good', text: 'text-good-text' },
  warning: { icon: TriangleAlert, label: 'Warning / Takt riski', short: 'Takt riski', badge: 'bg-warning-bg text-warning-text', bar: 'bg-warning', text: 'text-warning-text' },
  fault: { icon: OctagonX, label: 'Fault / NOK', short: 'Arıza / NOK', badge: 'bg-critical-bg text-critical-text', bar: 'bg-critical', text: 'text-critical-text' },
  offline: { icon: Unplug, label: 'Offline', short: 'Offline', badge: 'bg-offline-bg text-offline-text', bar: 'bg-offline', text: 'text-offline-text' },
}

export type Tone = 'good' | 'warning' | 'critical' | 'info' | 'neutral'

export const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-good-bg text-good-text',
  warning: 'bg-warning-bg text-warning-text',
  critical: 'bg-critical-bg text-critical-text',
  info: 'bg-info-bg text-info-text',
  neutral: 'bg-neutral text-fg-2',
}

