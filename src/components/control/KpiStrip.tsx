import { OctagonX, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Overview } from '@/domain/overview'
import { minutes, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Vardiya göstergeleri (R-045): tek bir gösterge şeridi */
export function KpiStrip({ ov }: { ov: Overview }) {
  const k = ov.kpi
  const bn = ov.cycles.find((c) => c.op === ov.bottleneck)
  const taktMin = (bn?.taktSec ?? 450) / 60
  const pctPlain = (x: number) => (Number.isFinite(x) ? num(x * 100, 1) : '—')
  return (
    <section aria-label="Vardiya göstergeleri" className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-[0_6px_20px_rgba(42,58,70,0.045)] md:grid-cols-4 xl:grid-cols-7">
      <Cell label={`${ov.shift.shift.name} çıkışı`} value={k.output} unit={`/ ${ov.shiftTarget}`}>
        Plan <b className="text-fg">{pct(k.planAttainment, 0)}</b>, beklenen {num(k.expected, 0)}
      </Cell>
      <Cell label="OEE" value={pct(k.oee)}>
        A {pctPlain(k.availability)} &nbsp; P {pctPlain(k.performance)} &nbsp; Q {pctPlain(k.quality)}
      </Cell>
      <Cell label="FPY (ilk geçiş)" value={pct(k.quality)}>
        {k.firstPassOk} / {k.firstInspected} ilk muayene OK
      </Cell>
      <Cell label="Çıkış / saat" value={num(k.outputPerHour, 1)}>
        Takt hedefi {num(60 / taktMin, 1)}
      </Cell>
      <Cell
        label="Darboğaz"
        value={ov.bottleneck ?? '—'}
        valueClass="opcode"
        tone={bn?.overTakt ? 'warning' : undefined}
        icon={bn?.overTakt ? <TriangleAlert className="size-4" aria-hidden /> : undefined}
      >
        {bn ? (
          <>
            Ort. <b className="text-fg">{minutes(bn.meanSec / 60)}</b>, takt {minutes(taktMin)}
          </>
        ) : (
          'Çevrim verisi yok'
        )}
      </Cell>
      <Cell label="Aktif alarm" value={ov.alarms.active.length} tone={ov.alarms.critical ? 'critical' : undefined} icon={ov.alarms.critical ? <OctagonX className="size-4" aria-hidden /> : undefined}>
        {ov.alarms.critical ? `${ov.alarms.critical} kritik` : 'Kritik alarm yok'}
      </Cell>
      <Cell label="Rework / HOLD" value={ov.reworks.length} unit={`/ ${ov.holds.length}`}>
        Hattaki motor {ov.motors.length}
      </Cell>
    </section>
  )
}

function Cell({ label, value, unit, children, tone, icon, valueClass }: { label: string; value: ReactNode; unit?: string; children: ReactNode; tone?: 'warning' | 'critical'; icon?: ReactNode; valueClass?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 border-b border-r px-4 py-3', tone === 'warning' && 'bg-warning-bg/70', tone === 'critical' && 'bg-critical-bg/70')}>
      <span className={cn('flex items-center gap-1 text-[12px] font-medium', tone === 'warning' ? 'text-warning-text' : tone === 'critical' ? 'text-critical-text' : 'text-fg-2')}>
        {icon}
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className={cn('display text-[32px] font-semibold leading-none tracking-tight text-fg', valueClass)}>{value}</span>
        {unit && <span className="display text-[17px] font-medium text-fg-3">{unit}</span>}
      </span>
      <span className="truncate text-[12px] text-fg-2">{children}</span>
    </div>
  )
}
