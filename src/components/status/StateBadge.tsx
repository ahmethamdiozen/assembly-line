import type { DisplayState } from '@/domain/lineState'
import { cn } from '@/lib/utils'
import { STATE_STYLE, TONE_CLASS } from './styles'
import type { Tone } from './styles'

export function StateBadge({ state, label, className, long = false }: { state: DisplayState; label?: string; className?: string; long?: boolean }) {
  const s = STATE_STYLE[state]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', s.badge, className)}>
      <s.icon className="size-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
      {label ?? (long ? s.label : s.short)}
    </span>
  )
}

export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONE_CLASS[tone], className)}>{children}</span>
}

export function OpCode({ op, className }: { op: string; className?: string }) {
  return <span className={cn('opcode text-[13px] text-fg', className)}>{op}</span>
}
