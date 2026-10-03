import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { OpCode } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useApp } from '@/data/app'
import type { ConfigPatch, StationPatch } from '@/domain/admin'
import type { Shift } from '@/domain/shifts'
import { STATION_TYPE_LABEL } from '@/domain/types'
import type { Station, StationType } from '@/domain/types'
import { minutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Field, Guard, Input, NumberInput, SaveMsg, Select, td, th } from './ui'
import { useSave } from './form'

/** Hat ayarları ve istasyon ana verisi (R-053) */
export function AdminLine() {
  return (
    <Guard perm="admin.stations">
      <div className="space-y-4">
        <LineConfigForm />
        <Stations />
      </div>
    </Guard>
  )
}

const round2 = (x: number) => Math.round(x * 100) / 100

function LineConfigForm() {
  useApp((s) => s.dataVersion)
  const cfg = backend.master.config
  const initial = () => ({ taktMin: round2(cfg.taktSec / 60), warnPct: round2(cfg.warnRatio * 100), alarmPct: round2(cfg.alarmRatio * 100), hb: cfg.heartbeatTimeoutSec, dayStart: cfg.dayStartHour, variant: cfg.variant, shifts: cfg.shifts.map((s) => ({ ...s })) })
  const [f, setF] = useState(initial)
  const save = useSave()
  // Form değişince önceki kayıt mesajı kalkar (düzeltilmiş hata ekranda kalmasın)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }))
    save.clear()
  }
  const setShift = (i: number, p: Partial<Shift>) => {
    setF((x) => ({ ...x, shifts: x.shifts.map((s, j) => (j === i ? { ...s, ...p } : s)) }))
    save.clear()
  }
  const patch: ConfigPatch = {}
  if (Math.round(f.taktMin * 60) !== cfg.taktSec) patch.taktSec = Math.round(f.taktMin * 60)
  if (round2(f.warnPct / 100) !== cfg.warnRatio) patch.warnRatio = round2(f.warnPct / 100)
  if (round2(f.alarmPct / 100) !== cfg.alarmRatio) patch.alarmRatio = round2(f.alarmPct / 100)
  if (f.hb !== cfg.heartbeatTimeoutSec) patch.heartbeatTimeoutSec = f.hb
  if (f.dayStart !== cfg.dayStartHour) patch.dayStartHour = f.dayStart
  if (f.variant !== cfg.variant) patch.variant = f.variant
  if (JSON.stringify(f.shifts) !== JSON.stringify(cfg.shifts)) patch.shifts = f.shifts
  const dirty = Object.keys(patch).length > 0
  return (
    <Card>
      <CardHeader title="Hat ayarları" subtitle="Takt, durum eşikleri, heartbeat zaman aşımı, üretim günü ve vardiyalar. Değişiklik hemen tüm ekranlara ve KPI hesaplarına uygulanır." />
      <form
        className="space-y-4 px-4 pb-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save.run(() => backend.admin.saveConfig(patch))
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Field label="Takt" hint={Number.isFinite(f.taktMin) ? `Vardiyada ${Math.floor((8 * 60) / f.taktMin)} motor` : undefined}>
            <NumberInput label="Takt" value={f.taktMin} onChange={(v) => set('taktMin', v)} step={0.1} unit="dk" />
          </Field>
          <Field label="Uyarı eşiği" hint={`Süren çevrim ${minutes((f.taktMin * f.warnPct) / 100, 2)} → Takt riski`}>
            <NumberInput label="Uyarı eşiği" value={f.warnPct} onChange={(v) => set('warnPct', v)} unit="% takt" />
          </Field>
          <Field label="Alarm eşiği" hint={`Çevrim ${minutes((f.taktMin * f.alarmPct) / 100, 2)} → CYC-TAKT alarmı`}>
            <NumberInput label="Alarm eşiği" value={f.alarmPct} onChange={(v) => set('alarmPct', v)} unit="% takt" />
          </Field>
          <Field label="Heartbeat zaman aşımı" hint="Bu süre sinyal gelmezse cihaz Offline">
            <NumberInput label="Heartbeat zaman aşımı" value={f.hb} onChange={(v) => set('hb', v)} step={10} unit="sn" />
          </Field>
          <Field label="Üretim günü başlangıcı" hint="Günlük sayaçlar bu saatte sıfırlanır">
            <NumberInput label="Üretim günü başlangıcı" value={f.dayStart} onChange={(v) => set('dayStart', v)} unit=":00" />
          </Field>
          <Field label="Varyant">
            <Input value={f.variant} onChange={(e) => set('variant', e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="text-[12px] font-medium text-fg-2">Vardiyalar</p>
          <p className="text-[11.5px] text-fg-3">Üretim günü başından itibaren boşluksuz ve çakışmasız 24 saati kaplamalı.</p>
          <table className="mt-1.5 text-[13px]">
            <thead>
              <tr>
                <th className={th}>Kod</th>
                <th className={th}>Ad</th>
                <th className={th}>Başlangıç</th>
                <th className={th}>Süre</th>
              </tr>
            </thead>
            <tbody>
              {f.shifts.map((s, i) => (
                <tr key={s.id}>
                  <td className={cn(td, 'opcode')}>{s.id}</td>
                  <td className={td}>
                    <Input aria-label={`${s.id} vardiya adı`} value={s.name} onChange={(e) => setShift(i, { name: e.target.value })} className="w-44" />
                  </td>
                  <td className={td}>
                    <NumberInput label={`${s.id} başlangıç saati`} value={s.startHour} onChange={(v) => setShift(i, { startHour: v })} unit=":00" className="w-28" />
                  </td>
                  <td className={td}>
                    <NumberInput label={`${s.id} süresi`} value={s.lengthH} onChange={(v) => setShift(i, { lengthH: v })} unit="sa" className="w-24" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button type="submit" variant="primary" size="md" disabled={!dirty || save.busy}>
            Hat ayarlarını kaydet
          </Button>
          <Button
            size="md"
            disabled={!dirty}
            onClick={() => {
              setF(initial())
              save.clear()
            }}
          >
            Vazgeç
          </Button>
          <SaveMsg msg={save.msg} />
        </div>
      </form>
    </Card>
  )
}

const TYPES = Object.keys(STATION_TYPE_LABEL) as StationType[]

function Stations() {
  useApp((s) => s.dataVersion)
  const [edit, setEdit] = useState<string | null>(null)
  const stations = backend.master.stations
  const groups = [
    { title: 'Ana hat', rows: stations.filter((s) => s.line === 'main').sort((a, b) => a.seq - b.seq) },
    { title: 'Ön montaj hücreleri', rows: stations.filter((s) => s.line === 'sub').sort((a, b) => a.seq - b.seq) },
  ]
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="İstasyon ana verisi"
        subtitle="Operasyon adı, istasyon tipi, hedef çevrim, PLC / Cell ID, tool ve reçete. OP kodu fabrika verisindeki istasyon koduyla eşleştiği için burada değişmez; kod değişikliği collector eşlemesiyle birlikte yapılır."
      />
      <div className="overflow-x-auto px-4 pb-3 pt-2">
        <table className="w-full min-w-[1100px] text-[13px]">
          <thead>
            <tr className="border-b">
              <th className={th}>OP</th>
              <th className={th}>Operasyon adı</th>
              <th className={th}>Tip</th>
              <th className={cn(th, 'text-right')}>Hedef çevrim</th>
              <th className={th}>PLC ID</th>
              <th className={th}>Cell ID</th>
              <th className={th}>Tool / ekipman</th>
              <th className={th}>Reçete</th>
              <th className={th} />
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <td colSpan={9} className="pb-1 pt-3 text-[12px] font-semibold text-fg-2">
                  {g.title}
                </td>
              </tr>
              {g.rows.map((s) => (edit === s.op ? <StationEditRow key={s.op} s={s} onDone={() => setEdit(null)} /> : <StationRow key={s.op} s={s} onEdit={() => setEdit(s.op)} />))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  )
}

function StationRow({ s, onEdit }: { s: Station; onEdit: () => void }) {
  return (
    <tr className="border-b border-dashed last:border-0">
      <td className={td}>
        <OpCode op={s.op} />
      </td>
      <td className={td}>{s.name}</td>
      <td className={td}>{STATION_TYPE_LABEL[s.type]}</td>
      <td className={cn(td, 'display text-right text-[14px]')}>{minutes(s.targetCycleSec / 60)}</td>
      <td className={cn(td, 'display text-[14px]')}>{s.plcId}</td>
      <td className={cn(td, 'display text-[14px]')}>{s.cellId}</td>
      <td className={cn(td, 'max-w-[220px] truncate')} title={s.tool}>
        {s.tool}
      </td>
      <td className={cn(td, 'display text-[14px]')}>{s.recipe}</td>
      <td className={cn(td, 'text-right')}>
        <Button onClick={onEdit} aria-label={`${s.op} düzenle`}>
          <Pencil className="size-3.5" /> Düzenle
        </Button>
      </td>
    </tr>
  )
}

function StationEditRow({ s, onDone }: { s: Station; onDone: () => void }) {
  const [f, setF] = useState({ name: s.name, type: s.type, targetMin: round2(s.targetCycleSec / 60), plcId: s.plcId, cellId: s.cellId, tool: s.tool, recipe: s.recipe })
  const save = useSave()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const patch: StationPatch = {}
  if (f.name !== s.name) patch.name = f.name
  if (f.type !== s.type) patch.type = f.type
  if (Math.round(f.targetMin * 60) !== s.targetCycleSec) patch.targetCycleSec = Math.round(f.targetMin * 60)
  for (const k of ['plcId', 'cellId', 'tool', 'recipe'] as const) if (f[k] !== s[k]) patch[k] = f[k]
  const dirty = Object.keys(patch).length > 0
  return (
    <>
      <tr className="bg-accent-bg/40">
        <td className={td}>
          <OpCode op={s.op} />
        </td>
        <td className={td}>
          <Input aria-label="Operasyon adı" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </td>
        <td className={td}>
          <Select aria-label="İstasyon tipi" value={f.type} onChange={(e) => set('type', e.target.value as StationType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {STATION_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </td>
        <td className={td}>
          <NumberInput label="Hedef çevrim" value={f.targetMin} onChange={(v) => set('targetMin', v)} step={0.1} unit="dk" className="w-28" />
        </td>
        <td className={td}>
          <Input aria-label="PLC ID" value={f.plcId} onChange={(e) => set('plcId', e.target.value)} />
        </td>
        <td className={td}>
          <Input aria-label="Cell ID" value={f.cellId} onChange={(e) => set('cellId', e.target.value)} />
        </td>
        <td className={td}>
          <Input aria-label="Tool / ekipman" value={f.tool} onChange={(e) => set('tool', e.target.value)} />
        </td>
        <td className={td}>
          <Input aria-label="Reçete" value={f.recipe} onChange={(e) => set('recipe', e.target.value)} />
        </td>
        <td className={cn(td, 'whitespace-nowrap text-right')}>
          <Button variant="primary" disabled={!dirty || save.busy} onClick={() => void save.run(() => backend.admin.saveStation(s.op, patch)).then((ok) => ok && onDone())}>
            Kaydet
          </Button>
          <Button onClick={onDone}>Vazgeç</Button>
        </td>
      </tr>
      {(save.msg || f.type !== s.type) && (
        <tr className="bg-accent-bg/40">
          <td />
          <td colSpan={8} className="pb-2">
            {f.type !== s.type && <p className="text-[12px] text-warning-text">Tip değişince teknisyen terminali ve vardiya ataması bu tipe göre davranır{f.type !== 'manual' ? ' (otomatik / robot istasyonda teknisyen girişi yapılmaz)' : ''}.</p>}
            <SaveMsg msg={save.msg} />
          </td>
        </tr>
      )}
    </>
  )
}
