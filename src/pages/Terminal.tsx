import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  LogIn,
  LogOut,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  OctagonX,
  Package,
  PauseCircle,
  ShieldAlert,
  Siren,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MotorLink } from '@/components/common/MotorLink'
import { Tm50Engine } from '@/components/engine/Tm50Engine'
import { FreshnessPill } from '@/components/layout/FreshnessPill'
import { Chip, StateBadge } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Meter } from '@/components/ui/meter'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, useCan, usePolled } from '@/data/app'
import { FLOW_LABEL } from '@/domain/lineState'
import { shiftOf } from '@/domain/shifts'
import type { TerminalMotor, TerminalView } from '@/domain/terminal'
import { ANDON_TYPE_LABEL, ROLE_LABEL } from '@/domain/types'
import type { AndonType, NoteType } from '@/domain/types'
import { ago, hhmm, hms, minutes, num } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Teknisyen Terminali (R-006, R-050–R-052). İstasyondaki tablet / panel PC için büyük, dokunmatik
 * hedefler. `?kiosk=1` ile menü ve üst çubuk gizlenir; kiosk çıkışı istasyon girişini ve oturumu kapatır.
 */

const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`

const manualStations = () => backend.master.stations.filter((s) => s.line === 'main' && s.type === 'manual').sort((a, b) => a.seq - b.seq)

export default function Terminal() {
  const { op } = useParams()
  const [params] = useSearchParams()
  const kiosk = params.get('kiosk') === '1'
  const user = useApp((s) => s.user)
  if (!op) {
    const person = backend.master.people.find((p) => p.personnelNo === user?.id)
    const home = manualStations().find((s) => s.op === person?.station)?.op ?? manualStations()[0].op
    return <Navigate to={`/terminal/${home}${kiosk ? '?kiosk=1' : ''}`} replace />
  }
  return <TerminalScreen op={op} kiosk={kiosk} />
}

function TerminalScreen({ op, kiosk }: { op: string; kiosk: boolean }) {
  const v = usePolled(() => backend.terminal(op), [op])
  return (
    <div className={cn('mx-auto max-w-[1700px] space-y-4', kiosk && 'p-4')}>
      {kiosk ? <KioskBar op={op} v={v} /> : <StationPicker op={op} />}
      {!v ? (
        <p className="py-10 text-center text-sm text-fg-2">Yükleniyor…</p>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(360px,1fr)]">
          <TaskCard v={v} />
          <div className="space-y-4">
            <LoginCard v={v} />
            <QuickActions v={v} />
            <SideInfo v={v} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- üst bölüm

function StationPicker({ op }: { op: string }) {
  const navigate = useNavigate()
  return (
    <Card className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <span className="mr-1 text-[12.5px] text-fg-2">İstasyon</span>
      <div role="tablist" aria-label="İstasyon seçimi" className="flex flex-wrap gap-1.5">
        {manualStations().map((s) => (
          <button
            key={s.op}
            type="button"
            role="tab"
            aria-selected={s.op === op}
            onClick={() => navigate(`/terminal/${s.op}`)}
            title={s.name}
            className={cn(
              'opcode h-10 rounded-lg border px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              s.op === op ? 'border-accent-border bg-accent-bg text-info-text' : 'bg-card text-fg-2 hover:bg-wash hover:text-fg',
            )}
          >
            {s.op}
          </button>
        ))}
      </div>
      <Link to={`/terminal/${op}?kiosk=1`} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-wash hover:text-fg" title="Menüsüz tam ekran istasyon görünümü">
        <Maximize2 className="size-4" /> Kiosk modu
      </Link>
    </Card>
  )
}

/** Kiosk modunda tek satırlık üst çubuk: istasyon, veri tazeliği, saat, kullanıcı, çıkış */
function KioskBar({ op, v }: { op: string; v: TerminalView | null }) {
  const now = useApp((s) => s.now)
  const user = useApp((s) => s.user)
  const st = backend.master.stations.find((s) => s.op === op)
  const exit = async () => {
    await backend.stationLogout().catch(() => null)
    await backend.logout()
  }
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5">
      <div className="grid size-10 place-items-center rounded-lg border border-accent-border bg-accent-bg text-[11px] font-extrabold text-info-text">TM50</div>
      <div className="min-w-0">
        <div className="opcode text-[22px] leading-none">{op}</div>
        <div className="truncate text-[12.5px] text-fg-2">{st?.name}</div>
      </div>
      {v && <StateBadge state={v.view.state} long className="text-[12px]" />}
      <div className="ml-auto flex items-center gap-3">
        <FreshnessPill />
        <div className="text-right leading-tight">
          <div className="display text-[20px] font-semibold">{hms(now)}</div>
          <div className="text-[11.5px] text-fg-2">{shiftOf(now, backend.master.config.shifts).name}</div>
        </div>
        {user && (
          <div className="border-l pl-3 text-right leading-tight">
            <div className="text-[14px] font-semibold">{user.name}</div>
            <div className="text-[11.5px] text-fg-2">{ROLE_LABEL[user.role]}</div>
          </div>
        )}
        <Button variant="outline" size="md" onClick={() => void exit()} title="İstasyondan çıkar ve oturumu kapatır">
          <LogOut className="size-4" /> Çıkış
        </Button>
        <Link to={`/terminal/${op}`} className="rounded-md p-2 text-fg-3 hover:bg-wash hover:text-fg" title="Kiosk modundan çık" aria-label="Kiosk modundan çık">
          <Minimize2 className="size-4" />
        </Link>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------- aktif görev kartı (R-051)

function TaskCard({ v }: { v: TerminalView }) {
  const st = v.station
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-4">
        <span className="opcode text-[34px] leading-none">{st.op}</span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-tight">{st.name}</h2>
          <p className="text-[13px] text-fg-2">
            {st.tool} · hedef {minutes(st.targetCycleSec / 60)}
            {st.tightening && ` · ${st.tightening.pset}, ${st.tightening.targetNm} ± ${st.tightening.tolNm} Nm`}
          </p>
        </div>
        <div className="ml-auto text-right">
          <StateBadge state={v.view.state} long className="text-[12.5px]" />
          <p className="mt-1 text-[12.5px] text-fg-2">{v.view.state === 'running' ? FLOW_LABEL[v.view.flow] : v.view.reason}</p>
        </div>
      </div>
      {v.motor ? <MotorTask key={`${v.motor.sn}-${v.motor.opStart}`} v={v} m={v.motor} /> : <NoMotor v={v} />}
    </Card>
  )
}

function NoMotor({ v }: { v: TerminalView }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Tm50Engine completed={0} width={180} className="opacity-50" title="İstasyonda motor yok" />
      <p className="text-[16px] font-medium">İstasyonda motor yok</p>
      {v.next ? (
        <p className="text-[14px] text-fg-2">
          Sıradaki motor <MotorLink sn={v.next.sn} className="text-[15px]" />, {v.next.op} istasyonunda {v.next.done ? 'bitti, transfer bekliyor' : 'işlemde'}.
        </p>
      ) : (
        <p className="text-[14px] text-fg-2">Bir önceki istasyon da boş.</p>
      )}
    </div>
  )
}

function MotorTask({ v, m }: { v: TerminalView; m: TerminalMotor }) {
  const now = useApp((s) => s.now)
  const st = v.station
  const takt = backend.master.config.taktSec
  const idx = backend.master.stations.filter((s) => s.line === 'main').sort((a, b) => a.seq - b.seq).findIndex((s) => s.op === st.op)
  const elapsed = m.opStart !== null && !m.opDone ? (now - m.opStart) / 1000 : null
  const remaining = elapsed !== null ? st.targetCycleSec - elapsed : null
  const [checked, setChecked] = useState<boolean[]>(() => st.checklist.map(() => false))
  const allChecked = checked.every(Boolean)
  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center rounded-xl bg-steel-1/70 px-3 py-4">
          <Tm50Engine completed={m.completed} active={idx} width={200} />
          <span className="mt-1 text-[12.5px] text-fg-2">{m.completed} / 13 operasyon tamam</span>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div>
            <p className="text-[12.5px] text-fg-2">Aktif motor</p>
            <p className="display text-[34px] font-semibold leading-tight tracking-tight">
              <Link to={`/motor/${m.sn}`} className="hover:underline">
                {m.sn}
              </Link>
            </p>
            <p className="text-[13px] text-fg-2">
              İş emri {m.workOrder ?? '—'}
              {m.hold && (
                <Chip tone="warning" className="ml-2 align-middle">
                  <PauseCircle className="size-3" /> HOLD: {m.hold.reason}
                </Chip>
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12.5px] text-fg-2">{elapsed !== null ? 'Geçen süre' : 'Operasyon'}</p>
              <p className={cn('display text-[44px] font-semibold leading-none', elapsed !== null && elapsed > takt && 'text-warning-text')}>
                {elapsed !== null ? mmss(elapsed) : m.opDone ? 'Bitti' : '—'}
              </p>
              <p className="mt-1 text-[13px] text-fg-2">
                hedef {minutes(st.targetCycleSec / 60)} · takt {minutes(takt / 60)}
              </p>
            </div>
            <div>
              <p className="text-[12.5px] text-fg-2">Tahmini kalan</p>
              <p className="display text-[44px] font-semibold leading-none text-fg-2">{remaining === null ? '—' : remaining >= 0 ? mmss(remaining) : `+${mmss(-remaining)}`}</p>
              <p className="mt-1 text-[12px] text-fg-3">Son fabrika verisine göre; veri 3–5 dk gecikmeli gelebilir.</p>
            </div>
          </div>
          {elapsed !== null && <Meter value={elapsed / (takt * 1.2)} marker={st.targetCycleSec / (takt * 1.2)} color={elapsed > takt ? 'var(--warning)' : 'var(--accent)'} height={10} />}
          {m.opDone && <p className="rounded-lg bg-info-bg px-3 py-2 text-[13px] text-info-text">PLC operasyonu bitirdi; motor sonraki istasyona transfer bekliyor.</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Kontrol listesi">
          <h3 className="text-[13px] font-semibold">Kontrol listesi</h3>
          <ul className="mt-2 space-y-2">
            {st.checklist.map((item, i) => (
              <li key={item}>
                <label className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-[14.5px] transition-colors', checked[i] ? 'border-good/40 bg-good-bg/60' : 'bg-card hover:bg-wash')}>
                  <input
                    type="checkbox"
                    checked={checked[i]}
                    disabled={!!m.confirmation}
                    onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))}
                    className="size-5 accent-[var(--good)]"
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-5">
          {m.components.length > 0 && (
            <section aria-label="Takılacak parçalar">
              <h3 className="text-[13px] font-semibold">Takılacak parçalar</h3>
              <ul className="mt-2 space-y-2">
                {m.components.map((c) => (
                  <li key={c.type.code} className="flex min-h-12 items-center gap-3 rounded-lg border px-3">
                    {c.install ? <CircleCheck className="size-5 shrink-0 text-good" /> : <CircleDashed className="size-5 shrink-0 text-fg-3" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{c.type.name}</span>
                      <span className={cn('display block text-[14px]', c.install ? 'text-fg' : 'text-fg-3')}>{c.install ? c.install.componentSn : 'Okutulmadı'}</span>
                    </span>
                    {c.install?.lot && <span className="text-[12px] text-fg-2">{c.install.lot}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {m.tightening && (
            <section aria-label="Sıkmalar">
              <h3 className="flex items-baseline justify-between text-[13px] font-semibold">
                <span>
                  <Wrench className="mr-1 inline size-3.5" />
                  Sıkmalar
                </span>
                <span className="display text-[15px]">
                  {m.tightening.ok} / {m.tightening.total} OK
                </span>
              </h3>
              <ul className="mt-2 grid grid-cols-4 gap-2">
                {m.tightening.joints.map((j) => {
                  const r = j.last?.result
                  return (
                    <li
                      key={j.joint}
                      className={cn('rounded-lg border px-2 py-1.5 text-center', r === 'OK' && 'border-good/40 bg-good-bg/60', r === 'NOK' && 'border-critical/40 bg-critical-bg')}
                      title={j.last ? `${num(j.last.torqueNm, 1)} Nm, ${j.last.angleDeg}°, ${hms(j.last.t)}${j.tries > 1 ? `, ${j.tries} deneme` : ''}` : 'Henüz sıkılmadı'}
                    >
                      <span className="display block text-[15px] font-semibold">{j.joint}</span>
                      <span className={cn('block text-[12px]', r === 'NOK' ? 'font-semibold text-critical-text' : r === 'OK' ? 'text-good-text' : 'text-fg-3')}>
                        {j.last ? `${num(j.last.torqueNm, 1)} Nm ${r}` : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {!m.components.length && !m.tightening && <p className="text-[13px] text-fg-2">Bu istasyonda okutulacak parça ya da sıkma yok.</p>}
        </div>
      </div>

      <Complete v={v} m={m} ready={allChecked} />
    </div>
  )
}

/** "Operasyonu tamamla" (R-006) */
function Complete({ v, m, ready }: { v: TerminalView; m: TerminalMotor; ready: boolean }) {
  const allowed = useCan('op.complete')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (m.confirmation)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-good/40 bg-good-bg px-4 py-3 text-good-text">
        <BadgeCheck className="size-6 shrink-0" />
        <p className="text-[14.5px]">
          <b>Operasyon onaylandı</b>: {m.confirmation.name}, {hhmm(m.confirmation.t)}
          {m.confirmation.note && <span className="text-fg-2"> · {m.confirmation.note}</span>}
        </p>
      </div>
    )
  if (!allowed) return null
  const reason = !v.me?.here ? `Onay için önce ${v.station.op} istasyonuna giriş yapın.` : !ready ? 'Kontrol listesindeki tüm adımları işaretleyin.' : null
  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await backend.confirmOperation({ op: v.station.op, sn: m.sn, note })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" className="h-14 min-w-[220px] flex-1 rounded-xl border border-border-strong bg-card px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-accent" />
        <button
          type="button"
          disabled={!!reason || busy}
          onClick={() => void submit()}
          className="inline-flex h-14 items-center gap-2 rounded-xl border border-good/50 bg-good px-6 text-[16px] font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:border-border disabled:bg-neutral disabled:text-fg-3"
        >
          <CircleCheck className="size-5" /> Operasyonu tamamla
        </button>
      </div>
      <p className={cn('text-[13px]', err ? 'text-critical-text' : 'text-fg-2')}>{err ?? reason ?? 'Onay motorun geçmişine ve audit kaydına adınızla yazılır. Fiziksel bitişi PLC bildirir.'}</p>
    </div>
  )
}

// ---------------------------------------------------------------- istasyon girişi (R-050, R-052)

function LoginCard({ v }: { v: TerminalView }) {
  const canLogin = useCan('station.login')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const me = v.me
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="px-4 py-3.5">
      <h3 className="text-[13px] font-semibold">İstasyon girişi</h3>
      {v.login ? (
        <p className="mt-2 text-[14px]">
          <b>{v.login.name}</b> <span className="text-fg-2">({v.login.personnelNo})</span>
          <span className="block text-[12.5px] text-fg-2">
            Giriş {hhmm(v.login.loginAt)}, {v.login.shiftId} vardiyası{!v.login.rosterMatch && ' · vardiya planı dışında (yedek / takviye)'}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-fg-2">Bu vardiyada istasyona giriş yapılmadı.{v.roster && ` Vardiya planı: ${v.roster.name}.`}</p>
      )}

      {me && canLogin && !me.here && (
        <div className="mt-3 space-y-2">
          <p className="text-[12.5px] font-medium text-fg-2">Yetkinlik kontrolü (R-052)</p>
          <ul className="space-y-1">
            {v.required.map((q) => {
              const miss = me.missing.includes(q)
              return (
                <li key={q} className={cn('flex items-center gap-2 text-[13.5px]', miss ? 'text-critical-text' : 'text-good-text')}>
                  {miss ? <CircleX className="size-4" /> : <CircleCheck className="size-4" />} {q}
                  <span className="text-[12px] text-fg-3">{miss ? 'eksik' : 'var'}</span>
                </li>
              )
            })}
          </ul>
          {me.missing.length > 0 ? (
            <p className="flex gap-2 rounded-lg bg-critical-bg px-3 py-2 text-[13px] text-critical-text">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> Bu istasyonda çalışmak için yetkinliğiniz eksik. Üretim liderine başvurun.
            </p>
          ) : (
            <>
              {!me.rosterMatch && <p className="text-[12.5px] text-warning-text">Vardiya planında bu istasyonda değilsiniz; giriş yedek / takviye olarak kaydedilir.</p>}
              {v.login && <p className="text-[12.5px] text-fg-2">Giriş yaparsanız {v.login.name} istasyondan çıkarılır.</p>}
              {me.elsewhere && <p className="text-[12.5px] text-fg-2">{me.elsewhere.op} girişiniz kapanır.</p>}
            </>
          )}
          <button
            type="button"
            disabled={busy || me.missing.length > 0}
            onClick={() => void run(() => backend.stationLogin(v.station.op))}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-accent-border bg-accent-bg text-[15px] font-semibold text-info-text transition-colors hover:bg-info-bg focus-visible:outline-2 focus-visible:outline-accent disabled:border-border disabled:bg-neutral disabled:text-fg-3"
          >
            <LogIn className="size-5" /> {v.station.op} istasyonuna giriş yap
          </button>
        </div>
      )}
      {me?.here && (
        <Button variant="outline" size="md" className="mt-3 w-full" disabled={busy} onClick={() => void run(() => backend.stationLogout())}>
          <LogOut className="size-4" /> İstasyondan çık
        </Button>
      )}
      {me && !canLogin && <p className="mt-2 text-[12.5px] text-fg-3">Bu rolde istasyon girişi yapılmaz; terminal bilgi amaçlı görüntüleniyor.</p>}
      {err && (
        <p role="alert" className="mt-2 text-[13px] text-critical-text">
          {err}
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- hızlı aksiyonlar (R-006)

type Action = 'note' | AndonType | 'hold'

const ACTIONS: { id: Action; label: string; icon: LucideIcon; perm: 'note.create' | 'andon.create' | 'motor.hold' }[] = [
  { id: 'note', label: 'Not ekle', icon: MessageSquarePlus, perm: 'note.create' },
  { id: 'material', label: 'Malzeme talebi', icon: Package, perm: 'andon.create' },
  { id: 'quality', label: 'Kalite desteği', icon: ShieldAlert, perm: 'andon.create' },
  { id: 'production', label: 'Üretim desteği', icon: Siren, perm: 'andon.create' },
  { id: 'hold', label: "Motoru HOLD'a al", icon: PauseCircle, perm: 'motor.hold' },
]

function QuickActions({ v }: { v: TerminalView }) {
  const user = useApp((s) => s.user)
  const [open, setOpen] = useState<Action | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const actions = ACTIONS.filter((a) => user?.permissions.includes(a.perm))
  if (!actions.length) return null
  return (
    <Card className="px-4 py-3.5">
      <h3 className="text-[13px] font-semibold">Hızlı aksiyonlar</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {actions.map((a) => {
          const disabled = a.id === 'hold' && (!v.motor || !!v.motor.hold)
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              aria-expanded={open === a.id}
              onClick={() => {
                setOpen(open === a.id ? null : a.id)
                setDone(null)
              }}
              className={cn(
                'flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45',
                open === a.id ? 'border-accent-border bg-accent-bg text-info-text' : 'bg-card hover:bg-wash',
                a.id === 'note' && 'col-span-2',
              )}
            >
              <a.icon className="size-5 shrink-0" /> {a.label}
            </button>
          )
        })}
      </div>
      {open && (
        <ActionForm
          key={open}
          action={open}
          v={v}
          onDone={(msg) => {
            setOpen(null)
            setDone(msg)
          }}
        />
      )}
      {done && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] text-good-text">
          <CircleCheck className="size-4" /> {done}
        </p>
      )}
    </Card>
  )
}

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'info', label: 'Bilgi' },
  { value: 'warning', label: 'Uyarı' },
  { value: 'error', label: 'Hata' },
]

function ActionForm({ action, v, onDone }: { action: Action; v: TerminalView; onDone: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<NoteType>('info')
  const [withMotor, setWithMotor] = useState(!!v.motor)
  const [err, setErr] = useState<string | null>(null)
  const sn = v.motor?.sn ?? null
  const op = v.station.op
  const submit = async () => {
    setErr(null)
    try {
      if (action === 'note') {
        await backend.addNote({ op, type, text, sn: withMotor ? sn : null })
        onDone(type === 'error' ? 'Hata notu kaydedildi; üretim liderine alarm olarak düştü.' : 'Not kaydedildi.')
      } else if (action === 'hold') {
        await backend.holdMotor({ sn: sn!, reason: text, op })
        onDone(`${sn} HOLD'a alındı; kalite kararı bekleniyor.`)
      } else {
        await backend.openAndon({ op, type: action, message: text, sn: withMotor ? sn : null })
        onDone(`${ANDON_TYPE_LABEL[action]} çağrısı açıldı; ilgili ekibe alarm olarak düştü.`)
      }
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const required = action === 'note' || action === 'hold'
  return (
    <form
      className="mt-3 space-y-2 rounded-xl border bg-steel-1/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {action === 'note' && <Segmented label="Not tipi" value={type} onChange={setType} options={NOTE_TYPES} />}
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={action === 'note' ? 'Not' : action === 'hold' ? 'HOLD nedeni' : 'Kısa açıklama (isteğe bağlı)'}
        className="block w-full resize-none rounded-lg border border-border-strong bg-card px-3 py-2 text-[15px] focus-visible:outline-2 focus-visible:outline-accent"
      />
      {sn && action !== 'hold' && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={withMotor} onChange={(e) => setWithMotor(e.target.checked)} className="size-4" />
          Motora bağla: <span className="display text-[14px]">{sn}</span>
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant={action === 'note' ? 'primary' : 'danger'} size="md" disabled={required && !text.trim()} className="h-11 flex-1 text-[14px]">
          {action === 'note' ? 'Notu kaydet' : action === 'hold' ? "HOLD'a al" : 'Andon aç'}
        </Button>
      </div>
      {err && <p className="text-[13px] text-critical-text">{err}</p>}
    </form>
  )
}

// ---------------------------------------------------------------- yan bilgiler

function SideInfo({ v }: { v: TerminalView }) {
  const now = useApp((s) => s.now)
  const items: ReactNode[] = []
  for (const a of v.alarms.slice(0, 5))
    items.push(
      <li key={a.id} className="flex gap-2 text-[13px]">
        {a.severity === 'critical' ? <OctagonX className="mt-0.5 size-4 shrink-0 text-critical" /> : <Siren className="mt-0.5 size-4 shrink-0 text-warning" />}
        <span className="min-w-0">
          {a.message}
          <span className="block text-[11.5px] text-fg-3">
            {hhmm(a.t)} · {a.status === 'detected' ? 'onay bekliyor' : (a.assignee ?? a.team)}
          </span>
        </span>
      </li>,
    )
  return (
    <Card className="px-4 py-3.5">
      <h3 className="text-[13px] font-semibold">Sıradaki motor</h3>
      <p className="mt-1.5 text-[13.5px]">
        {v.next ? (
          <>
            <MotorLink sn={v.next.sn} /> <ArrowRight className="mx-1 inline size-3.5 text-fg-3" />
            <span className="text-fg-2">
              {v.next.op} istasyonunda {v.next.done ? 'bitti, transfer bekliyor' : 'işlemde'}
            </span>
          </>
        ) : (
          <span className="text-fg-2">Bir önceki istasyon boş.</span>
        )}
      </p>
      <h3 className="mt-4 text-[13px] font-semibold">Açık alarmlar ve Andon</h3>
      {items.length ? <ul className="mt-1.5 space-y-2">{items}</ul> : <p className="mt-1.5 text-[13px] text-fg-2">İstasyonda açık alarm yok.</p>}
      <h3 className="mt-4 text-[13px] font-semibold">Son notlar</h3>
      {v.notes.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {v.notes.slice(0, 4).map((n) => (
            <li key={n.id} className="text-[13px]">
              <span className={cn('font-medium', n.type === 'error' ? 'text-critical-text' : n.type === 'warning' ? 'text-warning-text' : 'text-fg')}>{n.author}</span>: {n.text}
              <span className="block text-[11.5px] text-fg-3">{ago(now - n.t)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-fg-2">Bu istasyonda not yok.</p>
      )}
    </Card>
  )
}
