import { CircleCheck, MessageSquare, OctagonX, PackageCheck, RotateCcw, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MotorLink } from '@/components/common/MotorLink'
import { Card, CardHeader } from '@/components/ui/card'
import { useApp } from '@/data/app'
import type { LineEvent, Overview } from '@/domain/overview'
import { hhmm } from '@/lib/format'
import { cn } from '@/lib/utils'

const TONE_TEXT = { good: 'text-good-text', warning: 'text-warning-text', critical: 'text-critical-text', info: 'text-info-text' } as const

function iconOf(e: LineEvent): LucideIcon {
  if (e.kind === 'complete') return PackageCheck
  if (e.kind === 'quality') return e.tone === 'good' ? ShieldCheck : e.tone === 'critical' ? ShieldX : TriangleAlert
  if (e.kind === 'note') return MessageSquare
  if (e.kind === 'rework') return RotateCcw
  return e.tone === 'critical' ? OctagonX : e.tone === 'good' ? CircleCheck : TriangleAlert
}

/** Son olaylar (R-003): tamamlanan motorlar, kalite kararları, alarmlar, notlar */
export function EventFeed({ ov }: { ov: Overview }) {
  const select = useApp((s) => s.select)
  return (
    <Card className="flex flex-col">
      <CardHeader title="Son olaylar" subtitle="Son 6 saat, en yeni üstte" />
      <ul className="max-h-[380px] flex-1 divide-y overflow-y-auto px-4 pb-2 pt-1.5">
        {ov.events.length === 0 && <li className="py-6 text-center text-[13px] text-fg-2">Henüz olay yok.</li>}
        {ov.events.map((e) => {
          const Icon = iconOf(e)
          return (
            <li key={e.id} className="flex gap-2.5 py-2">
              <span className="display w-10 shrink-0 pt-0.5 text-[13px] text-fg-2">{hhmm(e.t)}</span>
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_TEXT[e.tone])} aria-hidden />
              <span className="min-w-0 flex-1 text-[13px] leading-snug">
                {e.sn && e.text.includes(e.sn)
                  ? e.text.split(e.sn).map((part, i) => (
                      <span key={i}>
                        {i > 0 && <MotorLink sn={e.sn!} className="text-[13px]" />}
                        {part}
                      </span>
                    ))
                  : e.text}
              </span>
              {e.op && (
                <button type="button" onClick={() => select(e.op!)} className="opcode h-fit shrink-0 rounded px-1 text-[12px] text-info-text hover:bg-info-bg focus-visible:outline-2 focus-visible:outline-accent" title={`${e.op} istasyonunu seç`}>
                  {e.op}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
