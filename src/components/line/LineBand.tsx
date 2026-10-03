import { Bot, Cog, RotateCcw, UserRound } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Tm50Engine } from '@/components/engine/Tm50Engine'
import { StateBadge } from '@/components/status/StateBadge'
import { STATE_STYLE } from '@/components/status/styles'
import { useApp } from '@/data/app'
import { FLOW_SHORT } from '@/domain/lineState'
import type { StationView, SubView } from '@/domain/lineState'
import type { Overview } from '@/domain/overview'
import { cn } from '@/lib/utils'

/**
 * Ana hat görseli (R-012–R-015, R-017, R-019): 13 istasyon bölmesi, konveyör üzerinde ilerleyen motorlar
 * ve ana hattı besleyen ön montaj hücreleri. İstasyona ya da motora tıklamak sayfayı değiştirmez;
 * aynı sayfadaki Seçili İstasyon paneli güncellenir (R-014, AC-02).
 */

const GAP = 8
const SUB_GAP = 12
const MIN_WIDTH = 1240
const ENGINE_W = 86

/** 13 eşit sütunun i'inci sütununun merkezi (CSS) */
const colCenter = (i: number, n: number) => `calc((100% - ${(n - 1) * GAP}px) / ${n} * ${i + 0.5} + ${i * GAP}px)`

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export function LineBand({ ov }: { ov: Overview }) {
  const selected = useApp((s) => s.selectedOp)
  const select = useApp((s) => s.select)
  const n = ov.stations.length
  const subs = [...ov.subs].sort((a, b) => seqOf(ov, a.feed.mainOp) - seqOf(ov, b.feed.mainOp))

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative px-1" style={{ minWidth: MIN_WIDTH }}>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {ov.stations.map((v) => (
            <StationBay key={v.station.op} v={v} selected={selected === v.station.op} onSelect={() => select(v.station.op)} bottleneck={ov.bottleneck === v.station.op} />
          ))}
        </div>

        <Conveyor ov={ov} selected={selected} onSelect={select} />

        <FeedLinks subs={subs} ov={ov} />

        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }}>
          {subs.map((s) => (
            <SubCell key={s.station.op} s={s} selected={selected === s.station.op} onSelect={() => select(s.station.op)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function seqOf(ov: Overview, op: string): number {
  return ov.stations.find((v) => v.station.op === op)?.station.seq ?? 0
}

function TypeLine({ v }: { v: StationView }) {
  const st = v.station
  if (st.type === 'manual')
    return (
      <span className="flex min-w-0 items-center gap-1">
        <UserRound className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        <span className="truncate">{v.operator?.name ?? 'Teknisyen yok'}</span>
      </span>
    )
  const Icon = st.type === 'robot' ? Bot : Cog
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Icon className="size-3.5 shrink-0 text-fg-3" aria-hidden />
      <span className="truncate">{st.type === 'robot' ? 'Robot hücresi' : 'Tam otomatik'}</span>
    </span>
  )
}

function StationBay({ v, selected, onSelect, bottleneck }: { v: StationView; selected: boolean; onSelect: () => void; bottleneck: boolean }) {
  const now = useApp((s) => s.now)
  const st = v.station
  const style = STATE_STYLE[v.state]
  const working = v.opStart !== null && !v.opDone
  const elapsed = working ? Math.max(0, (now - v.opStart!) / 1000) : null
  const ratio = elapsed !== null ? elapsed / st.targetCycleSec : 0
  const critical = v.alarms.filter((a) => a.severity === 'critical').length
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${st.op} ${st.name}, ${style.label}`}
      className={cn(
        'group relative flex h-[184px] flex-col overflow-hidden rounded-lg border bg-card px-2.5 pb-2 pt-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'border-accent bg-accent-bg/60 shadow-[0_0_0_1px_var(--accent)]' : 'hover:border-border-strong hover:bg-steel-1/60',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', style.bar)} aria-hidden />
      <span className="flex items-start justify-between gap-1">
        <span className="opcode text-[22px] leading-none">{st.op}</span>
        {v.alarms.length > 0 && (
          <span
            className={cn('display rounded-full px-1.5 text-[12px] font-semibold leading-[18px]', critical ? 'bg-critical-bg text-critical-text' : 'bg-warning-bg text-warning-text')}
            title={`${v.alarms.length} aktif alarm`}
          >
            {v.alarms.length}
          </span>
        )}
      </span>
      <span className="mt-1 line-clamp-2 min-h-[30px] text-[11.5px] leading-[15px] text-fg-2">{st.name}</span>
      <span className="mt-1.5 text-[11.5px] text-fg">
        <TypeLine v={v} />
      </span>
      <span className="mt-2">
        <StateBadge state={v.state} />
      </span>
      <span className="mt-auto">
        <span className="flex items-baseline justify-between gap-1 whitespace-nowrap">
          <span className="display text-[16px] font-semibold leading-none text-fg">{elapsed !== null ? mmss(elapsed) : v.opDone ? 'Bitti' : '—'}</span>
          <span className="display text-[12px] text-fg-3" title="Hedef çevrim">
            / {(st.targetCycleSec / 60).toFixed(1).replace('.', ',')} dk
          </span>
        </span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-steel-1">
          <span
            className={cn('block h-full rounded-full transition-[width] duration-700', ratio > 1 ? 'bg-warning' : 'bg-accent')}
            style={{ width: `${Math.min(1, v.opDone ? 1 : ratio) * 100}%` }}
          />
        </span>
        <span className={cn('mt-1 block truncate text-[11px]', v.state === 'running' ? 'text-fg-3' : style.text)} title={v.reason}>
          {bottleneck && <b className="font-semibold text-warning-text">Darboğaz, </b>}
          {v.state !== 'running' ? v.reason : bottleneck ? FLOW_SHORT[v.flow].toLocaleLowerCase('tr') : FLOW_SHORT[v.flow]}
        </span>
      </span>
    </button>
  )
}

function Conveyor({ ov, selected, onSelect }: { ov: Overview; selected: string | null; onSelect: (op: string) => void }) {
  const n = ov.stations.length
  const selIdx = ov.stations.findIndex((v) => v.station.op === selected)
  const sideLoop = ov.reworks.length + ov.holds.length
  const op100 = ov.stations.findIndex((v) => v.station.op === 'OP100')
  return (
    <div className="relative mt-2 h-[112px]" aria-label="Konveyör üzerindeki motorlar">
      {selIdx >= 0 && (
        <div
          className="absolute top-0 h-full rounded-md bg-accent-bg"
          style={{ left: `calc(${colCenter(selIdx, n)} - (100% - ${(n - 1) * GAP}px) / ${n} / 2)`, width: `calc((100% - ${(n - 1) * GAP}px) / ${n})` }}
          aria-hidden
        />
      )}
      {/* Ray ve makaralar */}
      <div
        className="absolute inset-x-0 top-[66px] h-[16px] rounded-[4px] border border-steel-3/60"
        style={{
          background: 'repeating-linear-gradient(90deg, var(--steel-3) 0 3px, transparent 3px 22px), linear-gradient(var(--steel-1), var(--steel-2))',
        }}
        aria-hidden
      />
      {ov.motors.map((m) => {
        const i = ov.stations.findIndex((v) => v.station.op === m.op)
        return (
          <button
            key={m.sn}
            type="button"
            onClick={() => onSelect(m.op)}
            className="absolute top-0 flex flex-col items-center transition-[left] duration-[1200ms] ease-[cubic-bezier(.22,.61,.36,1)] focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            style={{ left: `calc(${colCenter(i, n)} - ${ENGINE_W / 2}px)`, width: ENGINE_W }}
            title={`${m.sn} · ${m.op} · ${m.completed}/13 operasyon`}
          >
            <Tm50Engine completed={m.completed} active={m.done ? null : i} width={ENGINE_W} />
            <span className="display mt-0.5 rounded-sm border bg-card px-1 text-[11.5px] font-semibold leading-[16px] text-fg">{m.sn.slice(5)}</span>
          </button>
        )
      })}
      {sideLoop > 0 && op100 >= 0 && (
        <div
          className="absolute -bottom-0.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-critical/40 bg-critical-bg px-2 py-0.5 text-[11px] font-semibold text-critical-text"
          style={{ left: colCenter(op100, n) }}
          title="OP100'den çıkan NOK / HOLD motorlar"
        >
          <RotateCcw className="size-3" /> Side-loop: {ov.reworks.length} rework, {ov.holds.length} HOLD
        </div>
      )}
    </div>
  )
}

/** Ön montaj hücresinden beslediği ana hat istasyonuna bağlantı çizgileri */
function FeedLinks({ subs, ov }: { subs: SubView[]; ov: Overview }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const n = ov.stations.length
  const colW = (w - (n - 1) * GAP) / n
  const subW = (w - (subs.length - 1) * SUB_GAP) / subs.length
  const H = 44
  return (
    <div ref={ref} className="relative h-[44px]" aria-hidden>
      {w > 0 && (
        <svg width={w} height={H} className="absolute inset-0">
          {subs.map((s, j) => {
            const i = ov.stations.findIndex((v) => v.station.op === s.feed.mainOp)
            const x1 = j * (subW + SUB_GAP) + subW / 2
            const x2 = i * (colW + GAP) + colW / 2
            const low = s.state !== 'running'
            return (
              <g key={s.station.op}>
                <path d={`M${x1} ${H} C ${x1} ${H / 2}, ${x2} ${H / 2}, ${x2} 2`} fill="none" stroke={low ? 'var(--warning)' : 'var(--steel-3)'} strokeWidth={low ? 2 : 1.4} strokeDasharray="4 4" />
                <circle cx={x2} cy={3} r={3} fill={low ? 'var(--warning)' : 'var(--steel-3)'} />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function SubCell({ s, selected, onSelect }: { s: SubView; selected: boolean; onSelect: () => void }) {
  const style = STATE_STYLE[s.state]
  const f = s.feed
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col gap-1.5 overflow-hidden rounded-lg border bg-card px-3 pb-2.5 pt-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'border-accent bg-accent-bg/60 shadow-[0_0_0_1px_var(--accent)]' : 'hover:border-border-strong hover:bg-steel-1/60',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', style.bar)} aria-hidden />
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="opcode text-[18px] leading-none">{s.station.op}</span>
          <span className="truncate text-[12px] text-fg-2" title={s.station.name}>
            {s.station.name}
          </span>
        </span>
        <StateBadge state={s.state} label={s.state === 'running' ? (s.flow === 'blocked' ? 'Buffer dolu' : 'Normal') : undefined} />
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[11.5px] text-fg-2">Buffer</span>
        <span className="relative h-2 flex-1 overflow-visible rounded-full bg-steel-1">
          <span className={cn('block h-full rounded-full', s.bufferQty < f.bufferMin ? 'bg-warning' : 'bg-accent')} style={{ width: `${Math.min(1, s.bufferQty / f.bufferMax) * 100}%` }} />
          <span className="absolute -top-1 h-4 w-0.5 rounded bg-fg-3" style={{ left: `${(f.bufferMin / f.bufferMax) * 100}%` }} title={`Min ${f.bufferMin}`} />
        </span>
        <span className="display text-[14px] font-semibold text-fg">
          {s.bufferQty}
          <span className="font-medium text-fg-3"> / {f.bufferMax}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 whitespace-nowrap text-[11.5px] text-fg-2">
        <span>
          Bugün <b className="display text-[13px] text-fg">{s.producedToday}</b> / {f.dailyTarget}
        </span>
        <span>
          Son 1 sa <b className="display text-[13px] text-fg">{s.hourlyRate}</b> kit
        </span>
        <span>
          Besler <b className="opcode text-[13px]">{f.mainOp}</b>
        </span>
      </span>
      {s.state !== 'running' && <span className={cn('truncate text-[11px]', style.text)}>{s.reason}</span>}
    </button>
  )
}
