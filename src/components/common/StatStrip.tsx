import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Stat {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  tone?: 'warning' | 'critical' | 'good'
  icon?: ReactNode
}

/** Sayfa başındaki gösterge şeridi (Kontrol Merkezi'ndeki KPI şeridiyle aynı dil) */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <section className={cn('grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-[0_6px_20px_rgba(42,58,70,0.045)] md:grid-cols-3', stats.length > 4 && 'xl:grid-cols-6', className)}>
      {stats.map((s) => (
        <div key={s.label} className={cn('flex min-w-0 flex-col gap-1 border-b border-r px-4 py-3', s.tone === 'warning' && 'bg-warning-bg/70', s.tone === 'critical' && 'bg-critical-bg/70')}>
          <span className={cn('flex items-center gap-1 text-[12px] font-medium', s.tone === 'warning' ? 'text-warning-text' : s.tone === 'critical' ? 'text-critical-text' : 'text-fg-2')}>
            {s.icon}
            {s.label}
          </span>
          <span className="flex items-baseline gap-1">
            <span className="display text-[28px] font-semibold leading-none tracking-tight">{s.value}</span>
            {s.unit && <span className="display text-[15px] text-fg-3">{s.unit}</span>}
          </span>
          {s.sub && <span className="truncate text-[12px] text-fg-2">{s.sub}</span>}
        </div>
      ))}
    </section>
  )
}
