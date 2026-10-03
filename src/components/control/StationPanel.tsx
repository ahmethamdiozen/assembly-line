import * as Tabs from '@radix-ui/react-tabs'
import { CircleCheck, MessageSquare, OctagonX, Siren } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { MotorLink } from '@/components/common/MotorLink'
import { Tm50Engine } from '@/components/engine/Tm50Engine'
import { Chip, OpCode, StateBadge } from '@/components/status/StateBadge'
import { STATE_STYLE } from '@/components/status/styles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Meter } from '@/components/ui/meter'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, useCan, useStationDetail } from '@/data/app'
import { DISPLAY_STATE_LABEL, FLOW_LABEL } from '@/domain/lineState'
import { NOTE_TYPE_LABEL } from '@/domain/notes'
import type { StationDetail } from '@/domain/overview'
import { shiftOf } from '@/domain/shifts'
import { ALARM_STATUS_LABEL, ANDON_TYPE_LABEL, STATION_TYPE_LABEL } from '@/domain/types'
import type { Alarm, AndonType, NoteType } from '@/domain/types'
import { ago, fmtDuration, hhmm, hms, minutes, num, pct } from '@/lib/format'
import { cn } from '@/lib/utils'

const OPERATOR_SOURCE = { login: 'terminalden istasyona giriş yaptı', plc: 'operasyon kaydından', roster: 'vardiya planından' } as const

/**
 * Seçili İstasyon paneli (R-021–R-026). Hat görselinde istasyon seçilince aynı sayfada güncellenir.
 */

const TABS = [
  { id: 'genel', label: 'Genel' },
  { id: 'proses', label: 'Proses' },
  { id: 'kalite', label: 'Kalite & Tork' },
  { id: 'varlik', label: 'Varlık & IO' },
  { id: 'notlar', label: 'Notlar' },
  { id: 'gecmis', label: 'Geçmiş' },
] as const

const mmss = (sec: number) => `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`

export function StationPanel() {
  const op = useApp((s) => s.selectedOp)
  const d = useStationDetail(op)
  const [params] = useSearchParams()
  const [tab, setTab] = useState<string>(() => (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'genel'))
  if (!d) return <Card className="grid min-h-[420px] place-items-center text-sm text-fg-2">İstasyon seçin</Card>
  const st = d.station
  const state = d.view?.state ?? d.sub?.state ?? 'running'
  return (
    <Card className="flex min-h-[420px] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <OpCode op={st.op} className="text-[24px] leading-none" />
            <h2 className="truncate text-[15px] font-semibold">{st.name}</h2>
          </div>
          <p className="mt-1 text-xs text-fg-2">
            Seçili istasyon. {st.line === 'main' ? `Ana hat ${st.seq}. istasyon, ${STATION_TYPE_LABEL[st.type].toLocaleLowerCase('tr')}.` : 'Ön montaj hücresi.'}
          </p>
        </div>
        <StateBadge state={state} long className="text-[12px]" />
      </div>
      <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
        <Tabs.List aria-label="İstasyon ayrıntıları" className="flex gap-1 overflow-x-auto border-b px-3">
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t.id}
              value={t.id}
              className="relative whitespace-nowrap px-2.5 py-2.5 text-[13px] font-medium text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent data-[state=active]:text-info-text data-[state=active]:after:absolute data-[state=active]:after:inset-x-1 data-[state=active]:after:bottom-0 data-[state=active]:after:h-[2px] data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent"
            >
              {t.label}
              {t.id === 'notlar' && d.notes.length > 0 && <span className="display ml-1 text-fg-3">{d.notes.length}</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="flex-1 p-4">
          <Tabs.Content value="genel">{d.view ? <GeneralMain d={d} /> : <GeneralSub d={d} />}</Tabs.Content>
          <Tabs.Content value="proses">
            <Process d={d} />
          </Tabs.Content>
          <Tabs.Content value="kalite">
            <QualityTorque d={d} />
          </Tabs.Content>
          <Tabs.Content value="varlik">
            <Assets d={d} />
          </Tabs.Content>
          <Tabs.Content value="notlar">
            <Notes key={d.station.op} d={d} />
          </Tabs.Content>
          <Tabs.Content value="gecmis">
            <History d={d} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Card>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 border-b border-dashed pb-2', className)}>
      <dt className="text-[11.5px] text-fg-2">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-fg">{children}</dd>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-fg-2">{children}</p>
}

// ------------------------------------------------------------------ Genel (R-021)

function GeneralMain({ d }: { d: StationDetail }) {
  const now = useApp((s) => s.now)
  const v = d.view!
  const st = d.station
  const takt = d.cycles?.taktSec ?? 450
  const working = v.opStart !== null && !v.opDone
  const elapsed = working ? (now - v.opStart!) / 1000 : null
  const last = d.cycles?.lastSec ?? null
  const dev = elapsed !== null ? elapsed - takt : last !== null ? last - takt : null
  const shift = shiftOf(now)
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-col items-center rounded-lg bg-steel-1/70 px-3 py-4">
        {d.motor ? (
          <>
            <Tm50Engine completed={d.motor.completed} active={v.opDone ? null : st.seq - 1} width={196} />
            <MotorLink sn={d.motor.sn} className="mt-2 text-[20px]" />
            <span className="text-[12px] text-fg-2">
              {d.motor.completed} / 13 operasyon tamam ({pct(d.motor.completed / 13, 0)})
            </span>
          </>
        ) : (
          <span className="py-12 text-[13px] text-fg-2">İstasyonda motor yok</span>
        )}
      </div>
      <dl className="grid content-start gap-x-5 gap-y-3 sm:grid-cols-2">
        <Field label="Durum" className="sm:col-span-2">
          <span className={cn('font-medium', STATE_STYLE[v.state].text)}>{DISPLAY_STATE_LABEL[v.state]}</span>
          <span className="text-fg-2">, {v.state === 'running' ? FLOW_LABEL[v.flow].toLocaleLowerCase('tr') : v.reason}</span>
          {v.since && <span className="text-fg-3"> ({hhmm(v.since)} itibarıyla)</span>}
        </Field>
        <Field label="Aktif motor">{d.motor ? <MotorLink sn={d.motor.sn} className="text-[15px]" /> : 'Boş'}</Field>
        <Field label={st.type === 'manual' ? 'Teknisyen' : 'Otomasyon'}>
          {st.type === 'manual' ? (v.operator ? `${v.operator.name} (${v.operator.personnelNo})` : `${shift.name}: atanmış teknisyen yok`) : STATION_TYPE_LABEL[st.type]}
          {v.operator && v.operatorSource && <span className="block text-[11.5px] text-fg-3">{OPERATOR_SOURCE[v.operatorSource]}</span>}
        </Field>
        <Field label="Çevrim / hedef">
          <span className="display text-[15px] font-semibold">{elapsed !== null ? mmss(elapsed) : v.opDone ? 'Bitti, çıkış bekliyor' : '—'}</span>
          <span className="text-fg-2"> / {minutes(st.targetCycleSec / 60)}</span>
        </Field>
        <Field label={elapsed !== null ? 'Takt sapması (süren çevrim)' : 'Takt sapması (son çevrim)'}>
          {dev === null ? (
            '—'
          ) : (
            <span className={cn('display text-[15px] font-semibold', dev > 0 ? 'text-warning-text' : 'text-good-text')}>
              {dev > 0 ? '+' : ''}
              {mmss(dev)} <span className="font-sans text-[12px] font-normal text-fg-2">{dev > 0 ? "takt'ın üstünde" : 'takt içinde'}</span>
            </span>
          )}
        </Field>
        <Field label="Kalan süre (tahmin)">{v.remainingSec !== null && elapsed !== null ? mmss(Math.max(0, st.targetCycleSec - elapsed)) : '—'}</Field>
        <Field label="Sonraki istasyon">
          {d.nextStation ? (
            <>
              <OpCode op={d.nextStation.op} /> {d.nextStation.name}
            </>
          ) : (
            'Hat sonu'
          )}
        </Field>
        <Field label="Operasyon ilerlemesi" className="sm:col-span-2">
          <div className="flex items-center gap-3">
            <Meter value={elapsed !== null ? elapsed / st.targetCycleSec : v.opDone ? 1 : 0} color={elapsed !== null && elapsed > st.targetCycleSec ? 'var(--warning)' : 'var(--accent)'} height={8} className="flex-1" />
            <span className="display w-12 text-right text-[14px] font-semibold">{elapsed !== null ? pct(Math.min(elapsed / st.targetCycleSec, 9.99), 0) : v.opDone ? '%100' : '—'}</span>
          </div>
        </Field>
        {d.feed && (
          <Field label="Besleyen ön montaj" className="sm:col-span-2">
            <OpCode op={d.feed.subOp} /> {d.feed.kit}
          </Field>
        )}
      </dl>
    </div>
  )
}

function GeneralSub({ d }: { d: StationDetail }) {
  const s = d.sub!
  const f = s.feed
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
      <Field label="Durum" className="sm:col-span-2">
        <span className={cn('font-medium', STATE_STYLE[s.state].text)}>{DISPLAY_STATE_LABEL[s.state]}</span>
        <span className="text-fg-2">, {s.reason.toLocaleLowerCase('tr')}</span>
      </Field>
      <Field label="Bugün üretilen / hedef">
        <span className="display text-[15px] font-semibold">{s.producedToday}</span> / {f.dailyTarget} kit ({s.nokToday} NOK)
      </Field>
      <Field label="Son 1 saatte">
        <span className="display text-[15px] font-semibold">{s.hourlyRate}</span> kit
      </Field>
      <Field label="Buffer stoğu" className="sm:col-span-2">
        <div className="flex items-center gap-3">
          <Meter value={s.bufferQty / f.bufferMax} marker={f.bufferMin / f.bufferMax} color={s.bufferQty < f.bufferMin ? 'var(--warning)' : 'var(--accent)'} height={8} className="flex-1" />
          <span className="display text-[15px] font-semibold">
            {s.bufferQty} / {f.bufferMax}
          </span>
        </div>
        <span className="text-[12px] text-fg-2">Min seviye {f.bufferMin}; altına düşünce uyarı üretilir.</span>
      </Field>
      <Field label="Beslediği ana hat istasyonu">
        <OpCode op={f.mainOp} /> {d.nextStation?.name}
      </Field>
      <Field label="Kit">{f.kit}</Field>
      <Field label="Son sayaç okuması">{s.lastT ? hms(s.lastT) : '—'}</Field>
    </dl>
  )
}

// ------------------------------------------------------------------ Proses (R-022)

function Process({ d }: { d: StationDetail }) {
  const st = d.station
  const tq = st.tightening
  const expected = backend.master.components.filter((c) => c.installOp === st.op)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <dl className="grid content-start gap-3">
        <Field label="Reçete">{st.recipe}</Field>
        <Field label="PLC / Cell ID">
          {st.plcId} / {st.cellId}
        </Field>
        <Field label="Ekipman / tool">{st.tool}</Field>
        <Field label="Pset / program">{tq ? `${tq.pset} (${tq.joints.length} joint, ${tq.targetNm} ± ${tq.tolNm} Nm)` : 'Bu istasyonda sıkma programı yok'}</Field>
        {d.feed && (
          <Field label={st.line === 'main' ? 'Ön montaj kiti' : 'Ürettiği kit'}>
            {d.feed.kit} (<OpCode op={st.line === 'main' ? d.feed.subOp : d.feed.mainOp} />)
          </Field>
        )}
      </dl>
      <div className="space-y-4">
        <div>
          <h3 className="text-[12px] font-semibold text-fg-2">Checklist</h3>
          <ol className="mt-1.5 space-y-1.5">
            {st.checklist.map((c, i) => (
              <li key={c} className="flex gap-2 text-[13px]">
                <span className="display grid size-5 shrink-0 place-items-center rounded-full bg-steel-1 text-[12px] font-semibold text-fg-2">{i + 1}</span>
                {c}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-[12px] font-semibold text-fg-2">Kritik komponent / lot</h3>
          {expected.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-fg-2">Bu istasyonda seri numaralı komponent takılmıyor.</p>
          ) : (
            <table className="mt-1.5 w-full text-[13px]">
              <tbody>
                {expected.map((c) => {
                  const inst = d.components.find((x) => x.type === c.code)
                  return (
                    <tr key={c.code} className="border-b border-dashed last:border-0">
                      <td className="py-1.5 pr-2">{c.name}</td>
                      <td className="display py-1.5 pr-2 text-[14px] font-semibold">{inst?.componentSn ?? <span className="font-sans text-[12px] font-normal text-fg-3">okutulmadı</span>}</td>
                      <td className="py-1.5 text-right text-[12px] text-fg-2">{inst ? `${inst.lot ?? '—'}, ${hhmm(inst.t)}` : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Kalite & Tork (R-023)

function AlarmLine({ a }: { a: Alarm }) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      {a.severity === 'critical' ? <OctagonX className="mt-0.5 size-4 shrink-0 text-critical-text" /> : <Siren className="mt-0.5 size-4 shrink-0 text-warning-text" />}
      <div className="min-w-0">
        <div>{a.message}</div>
        <div className="text-[12px] text-fg-2">
          {hhmm(a.t)}, {ALARM_STATUS_LABEL[a.status]}
          {a.clearedAt ? ', koşul bitti' : ', koşul sürüyor'}
        </div>
      </div>
    </div>
  )
}

function QualityTorque({ d }: { d: StationDetail }) {
  const tq = d.station.tightening
  const q = d.quality
  const r = d.lastResult
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <dl className="grid content-start gap-3">
        <Field label={d.station.op === 'OP100' ? 'Son kalite kararı' : 'Son operasyon sonucu'}>
          {q ? (
            <span className="flex flex-wrap items-center gap-2">
              <Chip tone={q.decision === 'OK' ? 'good' : q.decision === 'NOK' ? 'critical' : 'warning'}>{q.decision}</Chip>
              <span className="display text-[14px] font-semibold">{q.sn}</span>
              <span className="text-fg-2">{hhmm(q.t)}</span>
              {q.defectText && <span className="w-full text-fg-2">{q.defectText}</span>}
            </span>
          ) : r ? (
            <span className="flex items-center gap-2">
              <Chip tone={r.result === 'OK' ? 'good' : 'critical'}>{r.result}</Chip>
              <span className="display text-[14px] font-semibold">{r.sn}</span>
              <span className="text-fg-2">
                {hhmm(r.end!)}, {minutes((r.cycleSec ?? 0) / 60, 1)}
              </span>
            </span>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Andon">
          {d.andons.length ? d.andons.map((a) => <div key={a.id}>{`${ANDON_TYPE_LABEL[a.type]}${a.message ? `: ${a.message}` : ''} (${a.by}, ${hhmm(a.t)})`}</div>) : <span className="text-fg-2">Açık Andon çağrısı yok</span>}
          <AndonForm op={d.station.op} sn={d.motor?.sn ?? null} />
        </Field>
        <Field label="Son alarm">{d.lastAlarm ? <AlarmLine a={d.lastAlarm} /> : <span className="text-fg-2">Bu istasyonda alarm kaydı yok</span>}</Field>
      </dl>
      <div>
        <h3 className="text-[12px] font-semibold text-fg-2">Tork</h3>
        {!tq ? (
          <p className="mt-1.5 text-[13px] text-fg-2">Bu istasyonda sıkma yapılmıyor.</p>
        ) : !d.tightening || d.tightening.rows.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-fg-2">Aktif motorda henüz sıkma sonucu yok.</p>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-fg-2">
              {!d.tightening.current && 'Aktif motorda henüz sıkma yok; önceki motor '}
              <span className="display text-[13px] font-semibold text-fg">{d.tightening.sn}</span>, Pset {tq.pset}, hedef {tq.targetNm} ± {tq.tolNm} Nm, {tq.controllerId} / {tq.toolId}
            </p>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-fg-2">
                  <th className="pb-1 font-medium">Joint</th>
                  <th className="pb-1 font-medium">Zaman</th>
                  <th className="pb-1 text-right font-medium">Tork</th>
                  <th className="pb-1 text-right font-medium">Açı</th>
                  <th className="pb-1 text-right font-medium">Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {d.tightening.rows.map((t) => (
                  <tr key={t.id} className={cn('border-t border-dashed', t.result === 'NOK' && 'bg-critical-bg/50')}>
                    <td className="display py-1 font-semibold">{t.joint}</td>
                    <td className="py-1 text-fg-2">{hms(t.t)}</td>
                    <td className="display py-1 text-right text-[14px]">{num(t.torqueNm, 1)} Nm</td>
                    <td className="display py-1 text-right text-[14px]">{t.angleDeg}°</td>
                    <td className="py-1 text-right">
                      <Chip tone={t.result === 'OK' ? 'good' : 'critical'}>{t.result}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

/** Andon çağrısı (R-040): malzeme, kalite desteği, üretim desteği; alarm kaydı da açar */
function AndonForm({ op, sn }: { op: string; sn: string | null }) {
  const allowed = useCan('andon.create')
  const [type, setType] = useState<AndonType>('material')
  const [message, setMessage] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!allowed) return null
  const submit = async () => {
    try {
      await backend.openAndon({ op, type, message, sn })
      setMessage('')
      setMsg({ ok: true, text: `${ANDON_TYPE_LABEL[type]} çağrısı açıldı; ilgili ekibe alarm olarak düştü.` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Segmented label="Andon tipi" value={type} onChange={setType} options={(Object.keys(ANDON_TYPE_LABEL) as AndonType[]).map((t) => ({ value: t, label: ANDON_TYPE_LABEL[t] }))} />
      <div className="flex gap-1.5">
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Kısa açıklama (isteğe bağlı)" className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-card px-2 text-[13px]" />
        <Button type="submit" variant="danger">
          <Siren className="size-3.5" /> Andon aç
        </Button>
      </div>
      {msg && <p className={cn('text-[12px]', msg.ok ? 'text-good-text' : 'text-critical-text')}>{msg.text}</p>}
    </form>
  )
}

// ------------------------------------------------------------------ Varlık & IO (R-024)

const DEVICE_LABEL = { plc: 'PLC', controller: 'Tork controller', tool: 'Sıkma tool', camera: 'Kamera' } as const

function Assets({ d }: { d: StationDetail }) {
  const now = useApp((s) => s.now)
  const m = d.maint
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h3 className="text-[12px] font-semibold text-fg-2">Bağlantı ve heartbeat</h3>
          <ul className="mt-1.5 divide-y divide-dashed">
            {d.devices.map((dev) => (
              <li key={dev.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                <span>
                  {DEVICE_LABEL[dev.type]} <span className="text-fg-2">{dev.id}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[12px] text-fg-2">{ago(now - dev.lastT)}</span>
                  <StateBadge state={dev.online ? 'running' : 'offline'} label={dev.online ? 'Online' : 'Offline'} />
                </span>
              </li>
            ))}
            {d.devices.length === 0 && <li className="py-2 text-[13px] text-fg-2">Heartbeat verisi yok</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-[12px] font-semibold text-fg-2">Sensör / IO</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {d.io.map((s) => (
              <span key={s.id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]', s.value ? 'text-fg' : 'border-critical/40 bg-critical-bg text-critical-text')}>
                {s.value ? <CircleCheck className="size-3.5 text-good" /> : <OctagonX className="size-3.5" />}
                {s.signal}
                {!s.value && <span className="font-semibold">: sinyal yok</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-[12px] font-semibold text-fg-2">Bakım metrikleri (son {m.windowH} saat)</h3>
        <dl className="mt-1.5 grid grid-cols-2 gap-3">
          <Field label="Arıza sayısı">
            <span className="display text-[18px] font-semibold">{m.faults}</span>
          </Field>
          <Field label="Toplam arıza süresi">
            <span className="display text-[18px] font-semibold">{fmtDuration(m.faultMin * 60)}</span>
          </Field>
          <Field label="MTTR (ortalama onarım)">
            <span className="display text-[18px] font-semibold">{m.mttrMin === null ? '—' : minutes(m.mttrMin, 1)}</span>
          </Field>
          <Field label="MTBF (arızalar arası çalışma)">
            <span className="display text-[18px] font-semibold">{m.mtbfH === null ? '—' : `${num(m.mtbfH, 1)} sa`}</span>
          </Field>
          <Field label="Kullanım (çalışma oranı)" className="col-span-2">
            <div className="flex items-center gap-3">
              <Meter value={m.busyRatio} height={8} className="flex-1" />
              <span className="display text-[15px] font-semibold">{pct(m.busyRatio, 0)}</span>
            </div>
          </Field>
        </dl>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Notlar (R-025)

const NOTE_TONE = { info: 'info', warning: 'warning', error: 'critical' } as const

function Notes({ d }: { d: StationDetail }) {
  const user = useApp((s) => s.user)
  const allowed = useCan('note.create')
  const [type, setType] = useState<NoteType>('info')
  const [text, setText] = useState('')
  const [alarmId, setAlarmId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    setBusy(true)
    try {
      await backend.addNote({ op: d.station.op, type, text, sn: d.motor?.sn ?? null, alarmId: alarmId || null, topic: alarmId ? null : topic })
      setText('')
      setTopic('')
      setAlarmId('')
      setMsg({ ok: true, text: type === 'error' ? 'Not kaydedildi ve hata notu alarmı açıldı.' : 'Not kaydedildi.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Not kaydedilemedi.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      {!allowed ? (
        <Empty>Not ekleme yetkiniz yok. Notları sağdaki listede görebilirsiniz.</Empty>
      ) : (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-fg-2">Not tipi</span>
          <Segmented label="Not tipi" value={type} onChange={setType} options={(['info', 'warning', 'error'] as NoteType[]).map((t) => ({ value: t, label: NOTE_TYPE_LABEL[t] }))} />
        </div>
        <label className="block">
          <span className="text-[12px] text-fg-2">Not</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-border-strong bg-card px-2.5 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent" placeholder="Ör. Konnektör sayımı tekrarlandı, kelepçe yeri kontrol edildi." />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] text-fg-2">İlişkili alarm</span>
            <select value={alarmId} onChange={(e) => setAlarmId(e.target.value)} className="mt-1 block w-full rounded-md border border-border-strong bg-card px-2 py-1.5 text-[13px]">
              <option value="">Yok</option>
              {d.alarms.map((a) => (
                <option key={a.id} value={a.id}>
                  {hhmm(a.t)} {a.message.slice(0, 48)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] text-fg-2">Konu (alarm yoksa)</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!!alarmId} className="mt-1 block w-full rounded-md border border-border-strong bg-card px-2 py-1.5 text-[13px] disabled:opacity-50" placeholder="Ör. Kablo routing" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" disabled={!text.trim() || busy}>
            <MessageSquare className="size-4" /> Notu kaydet
          </Button>
          <span className="text-[12px] text-fg-2">Yazar: {user?.name}</span>
          {msg && <span className={cn('text-[12px]', msg.ok ? 'text-good-text' : 'text-critical-text')}>{msg.text}</span>}
        </div>
      </form>
      )}
      <div>
        <h3 className="text-[12px] font-semibold text-fg-2">İstasyon notları</h3>
        {d.notes.length === 0 ? (
          <div className="mt-1.5">
            <Empty>Bu istasyonda not yok. Vardiyada fark ettiğiniz bir durumu buraya yazın.</Empty>
          </div>
        ) : (
          <ul className="mt-1.5 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {d.notes.map((n) => (
              <li key={n.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-2">
                  <Chip tone={NOTE_TONE[n.type]}>{NOTE_TYPE_LABEL[n.type]}</Chip>
                  <span className="font-medium text-fg">{n.author}</span>
                  <span>{hhmm(n.t)}</span>
                  {n.sn && <span className="display text-[13px]">{n.sn}</span>}
                </div>
                <p className="mt-1 text-[13px]">{n.text}</p>
                {(n.alarmId || n.topic) && <p className="mt-0.5 text-[12px] text-fg-2">{n.alarmId ? `İlişkili alarm: ${n.alarmId}` : `Konu: ${n.topic}`}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Geçmiş (R-026)

function History({ d }: { d: StationDetail }) {
  if (d.station.line === 'sub') return <Empty>Ön montaj hücreleri motor bazında değil, kit adedi olarak izlenir. Üretim ve buffer bilgisi Genel sekmesindedir.</Empty>
  if (d.history.length === 0) return <Empty>Bu istasyonda henüz işlem kaydı yok.</Empty>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-fg-2">
            <th className="pb-1.5 font-medium">Başlangıç</th>
            <th className="pb-1.5 font-medium">Motor</th>
            <th className="pb-1.5 font-medium">Teknisyen</th>
            <th className="pb-1.5 text-right font-medium">Cycle</th>
            <th className="pb-1.5 pl-3 font-medium">Sonuç</th>
            <th className="pb-1.5 font-medium">Not / alarm</th>
          </tr>
        </thead>
        <tbody>
          {d.history.map(({ op, operator, alarms, notes }) => (
            <tr key={op.id} className="border-t border-dashed align-top">
              <td className="py-1.5 text-fg-2">{hms(op.start)}</td>
              <td className="display py-1.5 text-[14px] font-semibold">{op.sn}</td>
              <td className="py-1.5">{operator?.name ?? <span className="text-fg-3">{STATION_TYPE_LABEL[d.station.type]}</span>}</td>
              <td className={cn('display py-1.5 text-right text-[14px]', op.cycleSec !== null && op.cycleSec > (d.cycles?.taktSec ?? 450) && 'font-semibold text-warning-text')}>{op.cycleSec !== null ? mmss(op.cycleSec) : 'sürüyor'}</td>
              <td className="py-1.5 pl-3">{op.result ? <Chip tone={op.result === 'OK' ? 'good' : 'critical'}>{op.result}</Chip> : <Chip tone="info">Sürüyor</Chip>}</td>
              <td className="py-1.5 text-[12px] text-fg-2">
                {[...alarms.map((a) => a.message), ...notes.map((n) => `Not: ${n.text}`)].slice(0, 2).map((x) => (
                  <div key={x} className="max-w-[260px] truncate" title={x}>
                    {x}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
