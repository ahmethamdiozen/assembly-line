import { ArrowRight, PauseCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { ParetoChart } from '@/components/charts/ParetoChart'
import { MotorLink } from '@/components/common/MotorLink'
import { StatStrip } from '@/components/common/StatStrip'
import { WindowPicker } from '@/components/common/WindowPicker'
import { useTimeWindow } from '@/components/common/timeWindow'
import type { WindowKey } from '@/components/common/timeWindow'
import { Chip, OpCode } from '@/components/status/StateBadge'
import type { Tone } from '@/components/status/styles'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useApp, useCan, usePolled } from '@/data/app'
import { nextUserState } from '@/domain/rework'
import { FAULT_CATEGORY_LABEL, PRIORITY_LABEL, REWORK_STATE_LABEL, TEAMS } from '@/domain/types'
import type { MotorHold, Priority, QualityResult, Rework, ReworkEvent, ReworkState, Team } from '@/domain/types'
import { fmtDuration, hhmm, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Kalite & Rework (R-033–R-036): OP100 sonuçları, rework akışı (Triage → Diagnosis → Rework Bench →
 * Ready for Re-QC → OP100), HOLD kararları ve hata Pareto'su.
 */

const COLUMNS: { state: ReworkState; hint: string }[] = [
  { state: 'triage', hint: 'NOK motor kabul ve ön sınıflama' },
  { state: 'diagnosis', hint: 'Hata analizi, kök neden' },
  { state: 'bench', hint: 'Düzeltici operasyon' },
  { state: 'ready', hint: 'OP100\'e gönderildi' },
  { state: 'reqc', hint: 'OP100\'de tekrar muayene' },
]
const PRIORITY_TONE: Record<Priority, Tone> = { high: 'critical', medium: 'warning', low: 'neutral' }
const DECISION_TONE: Record<QualityResult['decision'], Tone> = { OK: 'good', NOK: 'critical', HOLD: 'warning' }

export default function QualityRework() {
  const [wk, setWk] = useState<WindowKey>('h24')
  const w = useTimeWindow(wk)
  const v = usePolled(() => backend.quality(w), [w.from, w.to])
  const now = useApp((s) => s.now)
  if (!v) return <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
  const byState = (s: ReworkState) => v.reworksOpen.filter((r) => r.state === s)

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-2">OP100 sonuçları ve FPY seçilen aralık için; rework kuyruğu ve HOLD'lar her zaman güncel.</p>
        <WindowPicker value={wk} onChange={setWk} />
      </div>
      <StatStrip
        stats={[
          { label: 'İlk muayene', value: v.firstInspected, sub: `${v.results.length} muayene (re-QC dahil)` },
          { label: 'FPY (ilk geçiş)', value: pct(v.fpy), sub: `${v.firstPassOk} motor ilk denemede OK` },
          { label: 'NOK', value: v.nok, tone: v.nok ? 'critical' : undefined },
          { label: 'HOLD', value: v.hold, tone: v.hold ? 'warning' : undefined },
          { label: 'Açık rework', value: v.reworksOpen.length, sub: `${byState('ready').length + byState('reqc').length} tanesi re-QC aşamasında` },
          { label: 'HOLD kararı bekleyen', value: v.holdsOpen.length, tone: v.holdsOpen.length ? 'warning' : undefined },
        ]}
      />

      <Card>
        <CardHeader title="Rework akışı" subtitle="NOK motorlar soldan sağa ilerler. Re-QC, motor OP100'e tekrar girince kendiliğinden başlar; OK çıkarsa kayıt kapanır, NOK çıkarsa yeni turla triage'a döner." />
        <div className="grid gap-3 overflow-x-auto p-4 lg:grid-cols-5">
          {COLUMNS.map((c) => {
            const list = byState(c.state)
            return (
              <section key={c.state} className="flex min-w-[240px] flex-col gap-2 rounded-xl bg-steel-1/60 p-2.5" aria-label={REWORK_STATE_LABEL[c.state]}>
                <header className="flex items-baseline justify-between px-1">
                  <span className="text-[13px] font-semibold">{REWORK_STATE_LABEL[c.state]}</span>
                  <span className="display text-[16px] font-semibold text-fg-2">{list.length}</span>
                </header>
                <p className="px-1 text-[11.5px] text-fg-2">{c.hint}</p>
                {list.map((r) => (
                  <ReworkCard key={r.id} r={r} events={v.events[r.id] ?? []} now={now} />
                ))}
                {list.length === 0 && <p className="rounded-lg border border-dashed px-2 py-4 text-center text-[12px] text-fg-3">Boş</p>}
              </section>
            )
          })}
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Holds holds={v.holdsOpen} now={now} />
        <Card>
          <CardHeader title="Hata Pareto" subtitle="OP100 NOK / HOLD nedenleri ve tork NOK'ları, seçilen aralıkta (R-048)" />
          <div className="px-3 pb-3 pt-2">
            <ParetoChart items={v.defectPareto} label="Kalite hataları Pareto" />
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="OP100 sonuçları" subtitle="En yeni üstte" />
          <div className="max-h-[420px] overflow-auto px-4 pb-4 pt-2">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-[11.5px] text-fg-2">
                  <th className="pb-1.5 font-medium">Zaman</th>
                  <th className="pb-1.5 font-medium">Motor</th>
                  <th className="pb-1.5 font-medium">Muayene</th>
                  <th className="pb-1.5 font-medium">Karar</th>
                  <th className="pb-1.5 font-medium">Hata</th>
                </tr>
              </thead>
              <tbody>
                {v.results.map((q) => (
                  <tr key={q.id} className="border-t border-dashed">
                    <td className="display py-1 text-fg-2">{hhmm(q.t)}</td>
                    <td className="py-1">
                      <MotorLink sn={q.sn} />
                    </td>
                    <td className="py-1">{q.attempt === 1 ? 'İlk' : `${q.attempt}. (re-QC)`}</td>
                    <td className="py-1">
                      <Chip tone={DECISION_TONE[q.decision]}>{q.decision}</Chip>
                    </td>
                    <td className="py-1 text-fg-2">{q.defectText ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Kapanan rework'ler" subtitle="Re-QC'den OK geçen motorlar" />
          <ul className="divide-y px-4 pb-3 pt-1">
            {v.reworksClosed.length === 0 && <li className="py-4 text-[13px] text-fg-2">Bu aralıkta kapanan rework yok.</li>}
            {v.reworksClosed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <MotorLink sn={r.sn} />
                <span className="text-fg-2">{r.defect}</span>
                <span className="ml-auto text-[12px] text-fg-2">
                  {fmtDuration(((r.closedAt ?? r.openedAt) - r.openedAt) / 1000)} sürdü{r.attempt > 1 ? `, ${r.attempt} tur` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

const reworkOperators = () => backend.master.people.filter((p) => p.qualifications.includes('Rework L2')).map((p) => p.name)

function ReworkCard({ r, events, now }: { r: Rework; events: ReworkEvent[]; now: number }) {
  const canManage = useCan('rework.manage')
  const [editing, setEditing] = useState(false)
  const next = nextUserState(r.state)
  const last = events.at(-1)
  return (
    <article className="rounded-lg border bg-card px-3 py-2.5 shadow-[0_2px_8px_rgba(42,58,70,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <MotorLink sn={r.sn} className="text-[14.5px]" />
        <Chip tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABEL[r.priority]}</Chip>
      </div>
      <p className="mt-1 text-[13px] leading-snug">{r.defect}</p>
      <p className="mt-0.5 text-[12px] text-fg-2">
        Kaynak <OpCode op={r.sourceOp} className="text-[12px]" />, {FAULT_CATEGORY_LABEL[r.category]}
        {r.attempt > 1 ? `, ${r.attempt}. tur` : ''}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-[12px]">
        <div className="flex gap-1">
          <dt className="text-fg-2">Kök neden:</dt>
          <dd className={r.rootCause ? '' : 'text-fg-3'}>{r.rootCause ?? 'belirlenmedi'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-fg-2">Rework operatörü:</dt>
          <dd className={r.reworkOperator ? '' : 'text-fg-3'}>{r.reworkOperator ?? 'atanmadı'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-fg-2">Sorumlu:</dt>
          <dd>{r.team}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-[11.5px] text-fg-3">
        Açık {fmtDuration((now - r.openedAt) / 1000)}
        {last && last.by ? `, son adım ${last.by}` : ''}
      </p>
      {canManage && r.state !== 'reqc' && r.state !== 'ready' && (editing ? <ReworkForm r={r} next={next} onDone={() => setEditing(false)} /> : (
        <div className="mt-2 flex gap-1.5">
          {next && (
            <Button variant="primary" onClick={() => setEditing(true)} className="flex-1">
              {REWORK_STATE_LABEL[next]} <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      {r.state === 'ready' && <p className="mt-2 rounded-md bg-info-bg px-2 py-1 text-[12px] text-info-text">OP100'e gönderildi; motor girince re-QC başlar.</p>}
      {r.state === 'reqc' && (
        <p className="mt-2 flex items-center gap-1 rounded-md bg-info-bg px-2 py-1 text-[12px] text-info-text">
          <ShieldCheck className="size-3.5" /> OP100'de tekrar muayene ediliyor
        </p>
      )}
    </article>
  )
}

/** Bir sonraki adıma geçiş; Diagnosis → Rework Bench için kök neden ve operatör zorunlu */
function ReworkForm({ r, next, onDone }: { r: Rework; next: ReworkState | null; onDone: () => void }) {
  const [rootCause, setRootCause] = useState(r.rootCause ?? '')
  const [operator, setOperator] = useState(r.reworkOperator ?? '')
  const [priority, setPriority] = useState<Priority>(r.priority)
  const [team, setTeam] = useState<Team>(r.team)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const needs = next === 'bench'
  const submit = async () => {
    setErr(null)
    try {
      const fields = { rootCause: rootCause.trim() || null, reworkOperator: operator || null, priority, team }
      if (next) await backend.advanceRework(r.id, next, note.trim() || null, fields)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const input = 'mt-0.5 block w-full rounded-md border border-border-strong bg-card px-2 py-1 text-[12.5px]'
  return (
    <form
      className="mt-2 space-y-1.5 rounded-md bg-steel-1/70 p-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="block text-[11.5px] text-fg-2">
        Kök neden{needs && ' (zorunlu)'}
        <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={input} placeholder="Ör. Kablo kelepçesi yanlış noktada" />
      </label>
      <label className="block text-[11.5px] text-fg-2">
        Rework operatörü{needs && ' (zorunlu)'}
        <select value={operator} onChange={(e) => setOperator(e.target.value)} className={input}>
          <option value="">Seçin</option>
          {reworkOperators().map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-[11.5px] text-fg-2">
          Öncelik
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={input}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11.5px] text-fg-2">
          Sorumlu ekip
          <select value={team} onChange={(e) => setTeam(e.target.value as Team)} className={input}>
            {TEAMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-[11.5px] text-fg-2">
        Not
        <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
      </label>
      {err && <p className="text-[12px] text-critical-text">{err}</p>}
      <div className="flex gap-1.5">
        <Button type="submit" variant="primary" className="flex-1">
          {next ? `${REWORK_STATE_LABEL[next]} adımına al` : 'Kaydet'}
        </Button>
        <Button onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  )
}

function Holds({ holds, now }: { holds: MotorHold[]; now: number }) {
  const canDecide = useCan('quality.decide')
  return (
    <Card>
      <CardHeader title="HOLD kararları" subtitle="OP100'de HOLD'a alınan ya da kullanıcının durdurduğu motorlar" />
      <ul className="divide-y px-4 pb-3 pt-1">
        {holds.length === 0 && <li className="py-4 text-[13px] text-fg-2">Karar bekleyen HOLD yok.</li>}
        {holds.map((h) => (
          <HoldRow key={h.id} h={h} now={now} canDecide={canDecide} />
        ))}
      </ul>
    </Card>
  )
}

function HoldRow({ h, now, canDecide }: { h: MotorHold; now: number; canDecide: boolean }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (d: 'release' | 'rework') => backend.decideHold(h.id, d, note.trim() || null).catch((e: Error) => setErr(e.message))
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <PauseCircle className="size-4 text-warning-text" />
        <MotorLink sn={h.sn} />
        <span>{h.reason}</span>
        <span className="text-[12px] text-fg-2">
          {h.source === 'vision' ? 'OP100 vision' : `${h.by}, ${h.op ?? ''}`}, {fmtDuration((now - h.t) / 1000)} önce
        </span>
      </div>
      {canDecide && (
        <div className={cn('mt-2 flex flex-wrap items-center gap-2')}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Karar notu (isteğe bağlı)" className="h-8 min-w-[200px] flex-1 rounded-md border border-border-strong px-2 text-[13px]" />
          <Button variant="outline" onClick={() => void decide('release')}>
            Serbest bırak
          </Button>
          <Button variant="danger" onClick={() => void decide('rework')}>
            Rework'e gönder
          </Button>
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-critical-text">{err}</p>}
    </li>
  )
}
