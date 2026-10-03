import { ArrowRight, BadgeCheck, CircleCheck, CircleDashed, OctagonX, PauseCircle, ScanBarcode, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QcImage } from '@/components/common/QcImage'
import { Tm50Engine } from '@/components/engine/Tm50Engine'
import { Chip, OpCode } from '@/components/status/StateBadge'
import type { Tone } from '@/components/status/styles'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useCan, usePolled } from '@/data/app'
import type { ComponentSlot, MotorStep } from '@/domain/lineState'
import { FAULT_CATEGORY_LABEL, MOTOR_STATUS_LABEL, REWORK_STATE_LABEL } from '@/domain/types'
import type { MotorStatus, OpConfirmation, QualityResult } from '@/domain/types'
import type { MotorDetail } from '@/domain/views'
import { hhmm, hms, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Motor Takibi (R-027–R-032): seri numarasıyla motorun güncel durumu ve as-built geçmişi.
 */

const STATUS_TONE: Record<MotorStatus, Tone> = { in_line: 'info', hold: 'warning', rework: 'critical', completed: 'good' }
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const dateTime = (t: number) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function MotorTrace() {
  const { sn } = useParams()
  const navigate = useNavigate()
  const detail = usePolled(() => (sn ? backend.motor(sn) : Promise.resolve(null)), [sn])
  const open = (s: string) => navigate(`/motor/${encodeURIComponent(s)}`)

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <MotorSearch key={sn ?? ''} sn={sn} onOpen={open} />
      {!sn && <RecentMotors onOpen={open} />}
      {sn && detail === null && <Card className="px-4 py-10 text-center text-[14px] text-fg-2">{`${sn} bulunamadı ya da yükleniyor.`}</Card>}
      {sn && detail && <MotorView d={detail} />}
    </div>
  )
}

/** Motor ya da komponent seri numarasıyla arama (R-027) */
function MotorSearch({ sn, onOpen: open }: { sn: string | undefined; onOpen: (sn: string) => void }) {
  const [q, setQ] = useState(sn ?? '')
  const [term, setTerm] = useState(sn ?? '')
  useEffect(() => {
    const id = setTimeout(() => setTerm(q), 250)
    return () => clearTimeout(id)
  }, [q])
  const results = usePolled(() => backend.searchMotors(term === sn ? '' : term), [term, sn])
  const submit = () => {
    const exact = results?.find((m) => m.sn === q.trim() || m.matchedComponent === q.trim())
    if (exact) open(exact.sn)
    else if (results?.length === 1) open(results[0].sn)
  }

  return (
      <Card className="px-4 py-3.5">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="relative min-w-[320px] flex-1">
            <span className="sr-only">Motor ya da komponent seri numarası</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Motor seri no (TM50-261003-0105) ya da komponent seri no (KBL-TM50-…)"
              className="display h-11 w-full rounded-lg border border-border-strong bg-card pl-9 pr-3 text-[16px] focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <Button type="submit" variant="primary" size="md" className="h-11">
            Motoru aç
          </Button>
        </form>
        {results && term.trim() && term !== sn && (
          <ul className="mt-2 divide-y rounded-lg border">
            {results.length === 0 && <li className="px-3 py-2.5 text-[13px] text-fg-2">Bu aramayla eşleşen motor yok. Seri numarasını ya da komponent numarasını kontrol edin.</li>}
            {results.map((m) => (
              <li key={m.sn}>
                <button type="button" onClick={() => open(m.sn)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-wash focus-visible:outline-2 focus-visible:outline-accent">
                  <span className="display text-[15px] font-semibold">{m.sn}</span>
                  <Chip tone={STATUS_TONE[m.status]}>{MOTOR_STATUS_LABEL[m.status]}</Chip>
                  {m.currentOp && <OpCode op={m.currentOp} />}
                  {m.matchedComponent && <span className="text-[12px] text-fg-2">komponent {m.matchedComponent}</span>}
                  <span className="ml-auto text-[12px] text-fg-3">{dateTime(m.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
  )
}

function RecentMotors({ onOpen }: { onOpen: (sn: string) => void }) {
  const recent = usePolled(() => backend.searchMotors(''), [])
  return (
    <Card>
      <CardHeader title="Son motorlar" subtitle="Hatta en son başlatılan motorlar. Seri numarası yazarak ya da bir motor seçerek geçmişini açın." />
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {recent?.map((m) => (
          <button key={m.sn} type="button" onClick={() => onOpen(m.sn)} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left hover:border-accent hover:bg-accent-bg/50 focus-visible:outline-2 focus-visible:outline-accent">
            <span className="display text-[15px] font-semibold">{m.sn}</span>
            <span className="flex items-center gap-1.5">
              {m.currentOp && <OpCode op={m.currentOp} className="text-[12px]" />}
              <Chip tone={STATUS_TONE[m.status]}>{MOTOR_STATUS_LABEL[m.status]}</Chip>
            </span>
          </button>
        ))}
      </div>
    </Card>
  )
}

function MotorView({ d }: { d: MotorDetail }) {
  const m = d.motor
  const canHold = useCan('motor.hold')
  const openHold = d.holds.find((h) => h.releasedAt === null)
  const activeIdx = d.steps.findIndex((s) => s.status === 'active')
  const currentStation = m.currentOp ? d.steps.find((s) => s.station.op === m.currentOp)?.station : null
  return (
    <>
      <Card className="grid gap-6 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="grid place-items-center rounded-xl bg-steel-1/70 p-3">
          <Tm50Engine completed={d.completedOps} active={activeIdx >= 0 ? activeIdx : null} width={240} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display text-[30px] font-semibold leading-none">{m.id}</h2>
            <Chip tone={STATUS_TONE[m.status]} className="text-[12px]">
              {MOTOR_STATUS_LABEL[m.status]}
            </Chip>
            {openHold && (
              <Chip tone="warning" className="text-[12px]">
                <PauseCircle className="size-3.5" /> HOLD: {openHold.reason}
              </Chip>
            )}
            {canHold && m.status !== 'completed' && !openHold && <HoldButton sn={m.id} />}
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 xl:grid-cols-4">
            <Fact label="İş emri">{m.workOrder ?? '—'}</Fact>
            <Fact label="Varyant">{m.variant ?? '—'}</Fact>
            <Fact label="Hatta başladı">{dateTime(m.createdAt)}</Fact>
            <Fact label={m.completedAt ? 'Tamamlandı' : 'Bulunduğu istasyon'}>
              {m.completedAt ? dateTime(m.completedAt) : currentStation ? `${currentStation.op} ${currentStation.name}` : m.status === 'rework' ? 'Rework side-loop' : m.status === 'hold' ? 'HOLD alanı' : '—'}
            </Fact>
            <Fact label="İlk geçiş (OP100)">{m.firstPassOk === null ? 'Henüz muayene edilmedi' : m.firstPassOk ? 'OK' : 'NOK / HOLD'}</Fact>
            <Fact label="Takılı komponent">
              {d.components.filter((c) => c.status === 'installed').length} / {d.components.length}
            </Fact>
            <Fact label="Sıkma (OK / toplam)">
              {d.tightening.filter((t) => t.result === 'OK').length} / {d.tightening.length}
            </Fact>
            <Fact label="Rework turu">{d.reworks.length ? d.reworks.reduce((a, r) => a + r.attempt, 0) : 'Yok'}</Fact>
          </dl>
          <Completion d={d} />
        </div>
      </Card>

      <BuildStatus components={d.components} steps={d.steps} />

      <Card>
        <CardHeader title="Operasyon geçmişi" subtitle="Her istasyon için giriş, çıkış, cycle, teknisyen, takılan parça ve sonuç (R-031). Rozet: teknisyenin terminalden verdiği onay." />
        <div className="overflow-x-auto px-4 pb-4 pt-2">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-fg-2">
                <th className="pb-1.5 font-medium">OP</th>
                <th className="pb-1.5 font-medium">Operasyon</th>
                <th className="pb-1.5 font-medium">Giriş</th>
                <th className="pb-1.5 font-medium">Çıkış</th>
                <th className="pb-1.5 text-right font-medium">Cycle</th>
                <th className="pb-1.5 pl-4 font-medium">Teknisyen</th>
                <th className="pb-1.5 font-medium">Takılan parça</th>
                <th className="pb-1.5 font-medium">Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {d.steps.flatMap((s) => (s.attempts.length ? s.attempts : [null]).map((o, k) => <StepRow key={`${s.station.op}-${k}`} step={s} op={o} components={d.components} retry={k > 0} confirmation={confirmationFor(d, s.station.op, o, s.attempts[k + 1] ?? null)} />))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <QualitySection d={d} />
        <ReworkSection d={d} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TorqueSection d={d} />
        <Card>
          <CardHeader title="Alarmlar" subtitle="Bu motorla ilişkili alarmlar" />
          <ul className="divide-y px-4 pb-3 pt-1">
            {d.alarms.length === 0 && <li className="py-4 text-[13px] text-fg-2">Bu motorla ilişkili alarm yok.</li>}
            {d.alarms.map((a) => (
              <li key={a.id} className="flex items-start gap-2 py-2 text-[13px]">
                <span className="display w-11 shrink-0 text-fg-2">{hhmm(a.t)}</span>
                <span className="min-w-0 flex-1">{a.message}</span>
                <Link to={`/alarmlar?id=${a.id}`} className="shrink-0 text-[12px] font-medium text-info-text hover:underline">
                  {a.id}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-fg-2">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  )
}

const STEP_CLASS: Record<MotorStep['status'], string> = { done: 'bg-good', active: 'bg-accent', nok: 'bg-critical', pending: 'bg-steel-1 border border-border' }

/** 13 operasyon üzerinden tamamlanma (R-030) */
function Completion({ d }: { d: MotorDetail }) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-fg-2">Tamamlanma</span>
        <span>
          <span className="display text-[26px] font-semibold">{pct(d.completion, 0)}</span>
          <span className="ml-2 text-[13px] text-fg-2">
            {d.completedOps} / {d.totalOps} operasyon
          </span>
        </span>
      </div>
      <ol className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${d.steps.length}, minmax(0, 1fr))` }} aria-label="Operasyon ilerlemesi">
        {d.steps.map((s) => (
          <li key={s.station.op} title={`${s.station.op} ${s.station.name}: ${s.status === 'done' ? 'tamamlandı' : s.status === 'active' ? 'sürüyor' : s.status === 'nok' ? 'NOK' : 'bekliyor'}`}>
            <span className={cn('block h-2.5 rounded-sm', STEP_CLASS[s.status])} />
            <span className={cn('opcode mt-1 block text-center text-[10.5px]', s.status === 'pending' ? 'text-fg-3' : 'text-fg-2')}>{s.station.op.slice(2)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Takılan Parçalar / Build Status (R-028, R-029; URS §20 önerisi) */
function BuildStatus({ components, steps }: { components: ComponentSlot[]; steps: MotorStep[] }) {
  const nextIdx = components.findIndex((c) => c.status === 'pending')
  return (
    <Card>
      <CardHeader title="Takılan parçalar" subtitle="7 seri numaralı komponent. Parça, takıldığı operasyon OK bitince Installed sayılır." />
      <ul className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {components.map((c, i) => {
          const scanning = c.status === 'pending' && c.install
          const next = i === nextIdx
          const stepActive = steps.find((s) => s.station.op === c.type.installOp)?.status === 'active'
          const Icon = c.status === 'installed' ? CircleCheck : scanning ? ScanBarcode : next ? ArrowRight : CircleDashed
          return (
            <li key={c.type.code} className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2.5', c.status === 'installed' ? 'bg-card' : next ? 'border-accent-border bg-accent-bg/40' : 'border-dashed bg-card')}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Icon className={cn('size-4', c.status === 'installed' ? 'text-good' : next ? 'text-info-text' : 'text-fg-3')} aria-hidden />
                  {c.type.name}
                </span>
                <OpCode op={c.type.installOp} className="text-[12px]" />
              </span>
              {c.install ? (
                <span className="display text-[15px] font-semibold">{c.install.componentSn}</span>
              ) : (
                <span className="text-[13px] text-fg-3">Henüz monte edilmedi</span>
              )}
              <span className="text-[11.5px] text-fg-2">
                {c.status === 'installed' && c.install ? `Installed, ${c.install.lot ?? 'lot yok'}, ${hhmm(c.install.t)}` : scanning ? 'Okutuldu, operasyon sürüyor (Pending)' : next ? (stepActive ? 'Operasyon sürüyor' : 'Sıradaki parça (Pending)') : 'Pending'}
              </span>
              {c.replaced.length > 0 && <span className="text-[11.5px] text-warning-text">{c.replaced.length} kez değiştirildi (rework)</span>}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Denemeye ait terminal onayı: deneme başladıktan sonra, bir sonraki deneme başlamadan önce verilmiş */
function confirmationFor(d: MotorDetail, op: string, attempt: MotorStep['op'], next: MotorStep['op']): OpConfirmation | null {
  if (!attempt) return null
  return d.confirmations.find((c) => c.op === op && c.t >= attempt.start && (!next || c.t < next.start)) ?? null
}

function StepRow({ step, op, components, retry, confirmation }: { step: MotorStep; op: MotorStep['op']; components: ComponentSlot[]; retry: boolean; confirmation: OpConfirmation | null }) {
  const parts = components.filter((c) => c.type.installOp === step.station.op && c.install)
  const tech = op?.operatorNo ? (backend.master.people.find((p) => p.personnelNo === op.operatorNo)?.name ?? op.operatorNo) : null
  return (
    <tr className={cn('border-t border-dashed align-top', !op && 'text-fg-3')}>
      <td className="py-1.5">
        <OpCode op={step.station.op} className={!op ? 'text-fg-3' : undefined} />
        {retry && <span className="ml-1 text-[11px] text-fg-2">tekrar</span>}
      </td>
      <td className="py-1.5">{step.station.name}</td>
      <td className="display py-1.5 text-[14px]">{op ? hms(op.start) : '—'}</td>
      <td className="display py-1.5 text-[14px]">{op?.end ? hms(op.end) : op ? 'sürüyor' : '—'}</td>
      <td className="display py-1.5 text-right text-[14px]">{op?.cycleSec != null ? mmss(op.cycleSec) : '—'}</td>
      <td className="py-1.5 pl-4">
        {op ? (tech ?? <span className="text-fg-3">{step.station.type === 'robot' ? 'Robot' : 'Otomatik'}</span>) : '—'}
        {confirmation && (
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-good-text" title={confirmation.note ?? undefined}>
            <BadgeCheck className="size-3.5" /> Onay: {confirmation.name}, {hhmm(confirmation.t)}
          </span>
        )}
      </td>
      <td className="py-1.5">
        {parts.map((c) => (
          <div key={c.type.code}>
            {c.type.name} <span className="display text-[13.5px] font-semibold">{c.install!.componentSn}</span>
          </div>
        ))}
      </td>
      <td className="py-1.5">{op?.result ? <Chip tone={op.result === 'OK' ? 'good' : 'critical'}>{op.result}</Chip> : op ? <Chip tone="info">Sürüyor</Chip> : <span className="text-[12px]">Bekliyor</span>}</td>
    </tr>
  )
}

const DECISION_TONE: Record<QualityResult['decision'], Tone> = { OK: 'good', NOK: 'critical', HOLD: 'warning' }

function QualitySection({ d }: { d: MotorDetail }) {
  const [sel, setSel] = useState<string | null>(null)
  const current = d.quality.find((q) => q.id === sel) ?? d.quality.at(-1) ?? null
  const images = useMemo(() => d.images.filter((i) => i.resultId === current?.id), [d.images, current])
  return (
    <Card>
      <CardHeader title="OP100 kalite kontrol" subtitle="Muayene kararları ve görüntüler (R-032, R-033)" />
      {d.quality.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-fg-2">Motor henüz OP100'e gelmedi.</p>
      ) : (
        <div className="space-y-3 px-4 pb-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {d.quality.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSel(q.id)}
                aria-pressed={q.id === current?.id}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-accent', q.id === current?.id ? 'border-accent bg-accent-bg/60' : 'hover:bg-wash')}
              >
                <span className="font-medium">{q.attempt}. muayene</span>
                <Chip tone={DECISION_TONE[q.decision]}>{q.decision}</Chip>
                <span className="display text-fg-2">{hhmm(q.t)}</span>
              </button>
            ))}
          </div>
          {current?.defectText && (
            <p className="text-[13px]">
              Hata: <b>{current.defectText}</b> <span className="text-fg-2">({current.defectCode})</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {images.map((i) => (
              <QcImage key={i.id} view={i.view} path={i.path} decision={current!.decision} defect={current!.defectText} />
            ))}
          </div>
          <p className="text-[11.5px] text-fg-3">Görüntüler fabrikanın görüntü deposundan gelecek; bağlantı netleşene kadar yer tutucu gösteriliyor.</p>
        </div>
      )}
    </Card>
  )
}

function ReworkSection({ d }: { d: MotorDetail }) {
  return (
    <Card>
      <CardHeader title="Rework ve HOLD geçmişi" />
      <div className="space-y-3 px-4 pb-4 pt-2 text-[13px]">
        {d.reworks.length === 0 && d.holds.length === 0 && <p className="text-fg-2">Bu motor rework'e ya da HOLD'a girmedi.</p>}
        {d.reworks.map((r) => (
          <div key={r.id} className="rounded-lg border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.id}</span>
              <Chip tone={r.state === 'closed' ? 'good' : 'warning'}>{REWORK_STATE_LABEL[r.state]}</Chip>
              <span className="text-fg-2">
                {r.defect}, kaynak <OpCode op={r.sourceOp} /> ({FAULT_CATEGORY_LABEL[r.category]})
              </span>
            </div>
            {(r.rootCause || r.reworkOperator) && (
              <p className="mt-1 text-fg-2">
                {r.rootCause && `Kök neden: ${r.rootCause}. `}
                {r.reworkOperator && `Rework operatörü: ${r.reworkOperator}.`}
              </p>
            )}
            <ol className="mt-1.5 space-y-0.5">
              {d.reworkEvents
                .filter((e) => e.reworkId === r.id)
                .map((e) => (
                  <li key={e.id} className="flex gap-2 text-[12.5px]">
                    <span className="display w-11 shrink-0 text-fg-2">{hhmm(e.t)}</span>
                    <span>
                      {REWORK_STATE_LABEL[e.to]}
                      <span className="text-fg-2">
                        {e.by ? `, ${e.by}` : ', sistem'}
                        {e.note ? `: ${e.note}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          </div>
        ))}
        {d.holds.map((h) => (
          <div key={h.id} className="rounded-lg border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <PauseCircle className="size-4 text-warning-text" />
              <span className="font-semibold">HOLD</span>
              <span className="text-fg-2">{dateTime(h.t)}</span>
              <span>{h.reason}</span>
            </div>
            <p className="mt-1 text-fg-2">{h.releasedAt ? `${dateTime(h.releasedAt)}: ${h.resolution}${h.releasedBy ? ` (${h.releasedBy})` : ''}` : 'Kalite kararı bekleniyor'}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function TorqueSection({ d }: { d: MotorDetail }) {
  return (
    <Card>
      <CardHeader title="Sıkma kayıtları" subtitle="Bu motordaki tüm tork sonuçları (R-042)" />
      <div className="max-h-[360px] overflow-auto px-4 pb-4 pt-2">
        {d.tightening.length === 0 ? (
          <p className="text-[13px] text-fg-2">Henüz sıkma yok.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-[11.5px] text-fg-2">
                <th className="pb-1.5 font-medium">Zaman</th>
                <th className="pb-1.5 font-medium">OP</th>
                <th className="pb-1.5 font-medium">Joint</th>
                <th className="pb-1.5 font-medium">Pset</th>
                <th className="pb-1.5 text-right font-medium">Hedef</th>
                <th className="pb-1.5 text-right font-medium">Tork</th>
                <th className="pb-1.5 text-right font-medium">Açı</th>
                <th className="pb-1.5 pl-3 font-medium">Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {d.tightening.map((t) => (
                <tr key={t.id} className={cn('border-t border-dashed', t.result === 'NOK' && 'bg-critical-bg/50')}>
                  <td className="display py-1 text-fg-2">{hms(t.t)}</td>
                  <td className="py-1">
                    <OpCode op={t.op} />
                  </td>
                  <td className="display py-1 font-semibold">{t.joint}</td>
                  <td className="py-1">{t.pset}</td>
                  <td className="display py-1 text-right">
                    {num(t.targetNm, 0)} ± {num((t.maxNm - t.minNm) / 2, 0)}
                  </td>
                  <td className="display py-1 text-right font-semibold">{num(t.torqueNm, 1)} Nm</td>
                  <td className="display py-1 text-right">{t.angleDeg}°</td>
                  <td className="py-1 pl-3">
                    <Chip tone={t.result === 'OK' ? 'good' : 'critical'}>{t.result === 'NOK' && <OctagonX className="size-3" />}{t.result}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

function HoldButton({ sn }: { sn: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PauseCircle className="size-3.5" /> HOLD'a al
      </Button>
    )
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        backend
          .holdMotor({ sn, reason })
          .then(() => setOpen(false))
          .catch((x: Error) => setErr(x.message))
      }}
    >
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="HOLD nedeni" className="h-8 w-56 rounded-md border border-border-strong px-2 text-[13px]" />
      <Button type="submit" variant="danger" disabled={!reason.trim()}>
        HOLD'a al
      </Button>
      <Button onClick={() => setOpen(false)}>Vazgeç</Button>
      {err && <span className="text-[12px] text-critical-text">{err}</span>}
    </form>
  )
}
