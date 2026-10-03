import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, usePolled } from '@/data/app'
import { AUDIT_ACTION_LABEL, auditCsvName } from '@/domain/admin'
import type { AuditFilter } from '@/domain/admin'
import type { AuditEntry } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Guard, Input, Select, td, th } from './ui'

/** Audit görüntüleyici (R-058): kim, ne zaman, neyi, önce / sonra */

const ACTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm işlemler' },
  { value: 'config.', label: 'Konfigürasyon ve ana veri' },
  { value: 'user.', label: 'Kullanıcı' },
  { value: 'role.', label: 'Rol izinleri' },
  { value: 'auth.', label: 'Giriş / çıkış' },
  { value: 'alarm.', label: 'Alarm' },
  { value: 'andon.', label: 'Andon' },
  { value: 'note.', label: 'Not' },
  { value: 'rework.', label: 'Rework' },
  { value: 'hold', label: 'HOLD' },
  { value: 'station.', label: 'İstasyon girişi' },
  { value: 'op.confirm', label: 'Operasyon onayı' },
  { value: 'backup', label: 'Yedek' },
  { value: 'retention', label: 'Saklama temizliği' },
  { value: 'export', label: 'Dışa aktarım' },
  { value: 'collector', label: '"Şimdi çek"' },
]

const WINDOWS = { d1: { label: 'Son 24 saat', days: 1 }, d7: { label: 'Son 7 gün', days: 7 }, d30: { label: 'Son 30 gün', days: 30 }, d365: { label: 'Son 1 yıl', days: 365 } } as const
type WindowKey = keyof typeof WINDOWS
const PAGE = 100
const DAY = 24 * 3600_000
const dateTime = (t: number) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function AdminAudit() {
  return (
    <Guard perm="audit.view">
      <AuditView />
    </Guard>
  )
}

function AuditView() {
  const now = useApp((s) => s.now)
  const [wk, setWk] = useState<WindowKey>('d7')
  const [action, setAction] = useState('')
  const [user, setUser] = useState('')
  const [entityId, setEntityId] = useState('')
  const [terms, setTerms] = useState({ user: '', entityId: '' })
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setTerms({ user, entityId }), 300)
    return () => clearTimeout(id)
  }, [user, entityId])
  // Pencere dakikada bir kayar; yeni kayıt dakika içinde görünür
  const minute = Math.floor(now / 60_000) * 60_000
  const f: AuditFilter = useMemo(
    () => ({ from: minute + 60_000 - WINDOWS[wk].days * DAY, to: minute + 60_000, action: action || null, user: terms.user || null, entityId: terms.entityId || null, limit: PAGE, offset: page * PAGE }),
    [minute, wk, action, terms, page],
  )
  const r = usePolled(() => backend.admin.audit(f), [f])
  const download = async () => {
    setErr(null)
    try {
      const csv = await backend.admin.auditCsv({ ...f, limit: undefined, offset: undefined })
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = auditCsvName(f.from, f.to)
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const pages = r ? Math.max(1, Math.ceil(r.total / PAGE)) : 1
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(0)
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Audit kaydı" subtitle="Kullanıcı işlemleri, alarm ve rework değişiklikleri, konfigürasyon / ana veri değişiklikleri; kullanıcı ve zamanla. Satıra tıklayınca önce / sonra açılır." />
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Segmented label="Zaman aralığı" value={wk} onChange={reset(setWk)} options={(Object.keys(WINDOWS) as WindowKey[]).map((k) => ({ value: k, label: WINDOWS[k].label }))} />
        <Select aria-label="İşlem" value={action} onChange={(e) => reset(setAction)(e.target.value)} className="w-56">
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <Input aria-label="Kullanıcı" value={user} onChange={(e) => reset(setUser)(e.target.value)} placeholder="Kullanıcı adı ya da no" className="w-52" />
        <Input aria-label="Kayıt no" value={entityId} onChange={(e) => reset(setEntityId)(e.target.value)} placeholder="Kayıt no (ör. OP070, ALM-…, motor S/N)" className="w-72" />
        <Button variant="primary" className="ml-auto" onClick={() => void download()} title="Filtredeki tüm kayıtlar; Excel'de açılır">
          <Download className="size-3.5" /> CSV indir
        </Button>
      </div>
      {err && <p className="px-4 pt-2 text-[12.5px] text-critical-text">{err}</p>}
      <div className="overflow-x-auto px-4 pb-2 pt-2">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b">
              <th className={th}>Zaman</th>
              <th className={th}>Kullanıcı</th>
              <th className={th}>İşlem</th>
              <th className={th}>Kayıt</th>
              <th className={th}>Değişiklik</th>
            </tr>
          </thead>
          <tbody>
            {r?.entries.map((e) => (
              <AuditRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </tbody>
        </table>
        {r && !r.entries.length && <p className="py-6 text-center text-[13px] text-fg-2">Bu filtrede kayıt yok.</p>}
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-[12.5px] text-fg-2">
        <span>{r ? `${r.total} kayıt${r.total > PAGE ? `, sayfa ${page + 1} / ${pages}` : ''}` : 'Yükleniyor…'}</span>
        <span className="flex gap-1">
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Önceki
          </Button>
          <Button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Sonraki
          </Button>
        </span>
      </div>
    </Card>
  )
}

/** Audit'teki alan adlarının okunur karşılıkları (değerler kayıttaki birimle) */
const FIELD_LABEL: Record<string, string> = {
  taktSec: 'Takt (sn)',
  warnRatio: 'Uyarı eşiği (takt oranı)',
  alarmRatio: 'Alarm eşiği (takt oranı)',
  heartbeatTimeoutSec: 'Heartbeat zaman aşımı (sn)',
  dayStartHour: 'Üretim günü başlangıcı (saat)',
  shifts: 'Vardiyalar',
  variant: 'Varyant',
  name: 'Ad',
  type: 'Tip',
  targetCycleSec: 'Hedef çevrim (sn)',
  plcId: 'PLC ID',
  cellId: 'Cell ID',
  tool: 'Tool / ekipman',
  recipe: 'Reçete',
  mainOp: 'Beslenen istasyon',
  kit: 'Kit',
  bufferMin: 'Buffer min',
  bufferMax: 'Buffer max',
  dailyTarget: 'Günlük hedef',
  severity: 'Önem',
  escalationMin: 'Eskalasyon (dk)',
  team: 'Ekip',
  enabled: 'Açık',
  collectIntervalMin: 'Çekme aralığı (dk)',
  trace: 'İzlenebilirlik (gün)',
  tightening: 'Tork (gün)',
  images: 'Kalite görüntüleri (gün)',
  events: 'İstasyon olayları (gün)',
  alarms: 'Alarm / not (gün)',
  audit: 'Audit (gün)',
  hour: 'Yedek saati',
  keep: 'Saklanacak yedek',
  role: 'Rol',
  shift: 'Vardiya',
  station: 'İstasyon',
  qualifications: 'Yetkinlikler',
  active: 'Aktif',
  rfid: 'Kart no',
  added: 'Eklenen izinler',
  removed: 'Kaldırılan izinler',
  status: 'Durum',
  assignee: 'Atanan',
  state: 'Adım',
}
const label = (k: string) => FIELD_LABEL[k] ?? k

type Json = Record<string, unknown> | null

function parse(s: string | null): Json {
  if (!s) return null
  try {
    const v = JSON.parse(s) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { değer: v }
  } catch {
    return { değer: s }
  }
}

const show = (v: unknown) => (v === undefined ? '—' : v === null ? 'boş' : typeof v === 'string' ? v : JSON.stringify(v))

/** Önce / sonra alanları: değişen alanlar "önce → sonra" olarak */
function diffRows(e: AuditEntry): { key: string; before: unknown; after: unknown }[] {
  const b = parse(e.before)
  const a = parse(e.after)
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])]
  return keys.map((key) => ({ key, before: b?.[key], after: a?.[key] }))
}

function summary(e: AuditEntry): string {
  const rows = diffRows(e)
  if (!rows.length) return ''
  return rows
    .slice(0, 3)
    .map((r) => (r.before === undefined ? `${label(r.key)}: ${show(r.after)}` : r.after === undefined ? `${label(r.key)}: ${show(r.before)}` : `${label(r.key)}: ${show(r.before)} → ${show(r.after)}`))
    .join(' · ')
}

function AuditRow({ e, open, onToggle }: { e: AuditEntry; open: boolean; onToggle: () => void }) {
  const rows = diffRows(e)
  return (
    <>
      <tr onClick={onToggle} className={cn('cursor-pointer border-b border-dashed hover:bg-wash', open && 'bg-accent-bg/50')} aria-expanded={open}>
        <td className={cn(td, 'whitespace-nowrap tabular-nums text-fg-2')}>{dateTime(e.t)}</td>
        <td className={cn(td, 'whitespace-nowrap')}>{e.user}</td>
        <td className={td}>
          {AUDIT_ACTION_LABEL[e.action] ?? e.action} <span className="text-[11.5px] text-fg-3">{e.action}</span>
        </td>
        <td className={cn(td, 'whitespace-nowrap')}>
          {e.entity}
          {e.entityId && <span className="display ml-1 text-[13.5px]">{e.entityId}</span>}
        </td>
        <td className={cn(td, 'max-w-[420px] truncate text-[12.5px] text-fg-2')} title={summary(e)}>
          {summary(e) || '—'}
        </td>
      </tr>
      {open && (
        <tr className="bg-accent-bg/30">
          <td colSpan={5} className="px-3 pb-3 pt-1">
            {rows.length ? (
              <table className="text-[12.5px]">
                <thead>
                  <tr>
                    <th className={th}>Alan</th>
                    <th className={th}>Önce</th>
                    <th className={th}>Sonra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className={cn(td, 'font-medium')}>
                        {label(r.key)} {FIELD_LABEL[r.key] && <span className="text-[11px] font-normal text-fg-3">{r.key}</span>}
                      </td>
                      <td className={cn(td, 'max-w-[420px] break-words text-fg-2')}>{show(r.before)}</td>
                      <td className={cn(td, 'max-w-[420px] break-words')}>{show(r.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12.5px] text-fg-2">Bu işlem önce / sonra bilgisi içermiyor.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
