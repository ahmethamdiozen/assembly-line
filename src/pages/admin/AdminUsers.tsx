import { KeyRound, LockOpen, Pencil, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Chip, OpCode } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useApp, usePolled } from '@/data/app'
import type { AdminUser } from '@/data/Backend'
import type { PersonInput } from '@/domain/admin'
import { KNOWN_QUALIFICATIONS } from '@/domain/lineDef'
import { ALL_PERMISSIONS, PERMISSIONS } from '@/domain/rbac'
import type { Permission, RolePermissions } from '@/domain/rbac'
import { ROLE_LABEL } from '@/domain/types'
import type { RoleId } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Field, Guard, Input, SaveMsg, Select, td, th } from './ui'
import { useSave } from './form'

/** Kullanıcılar, kimlik bilgileri, rol → izin eşlemesi (R-054) */
export function AdminUsers() {
  return (
    <Guard perm="admin.users">
      <div className="space-y-4">
        <Users />
        <RoleMatrix />
      </div>
    </Guard>
  )
}

const ROLES = Object.keys(ROLE_LABEL) as RoleId[]
const empty = (): PersonInput => ({ personnelNo: '', name: '', role: 'technician', shift: 'A', station: null, qualifications: ['Montaj L2'] })

function Users() {
  const users = usePolled(() => backend.admin.users(), [])
  const [role, setRole] = useState<RoleId | ''>('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | 'new' | null>(null)
  const rows = (users ?? []).filter((u) => (!role || u.role === role) && (!q.trim() || `${u.personnelNo} ${u.name} ${u.credential?.rfid ?? ''}`.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))))
  const current = open && open !== 'new' ? (users?.find((u) => u.personnelNo === open) ?? null) : null
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
      <Card className="overflow-hidden">
        <CardHeader
          title={`Kullanıcılar (${users?.length ?? 0})`}
          subtitle="Personel no, rol, vardiya ve istasyon ataması, yetkinlikler, kart ve hesap durumu"
          right={
            <Button variant="primary" onClick={() => setOpen('new')}>
              <UserPlus className="size-3.5" /> Yeni kullanıcı
            </Button>
          }
        />
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          <Select aria-label="Rol filtresi" value={role} onChange={(e) => setRole(e.target.value as RoleId | '')} className="w-56">
            <option value="">Tüm roller</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Input aria-label="Kullanıcı ara" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Personel no, ad ya da kart" className="max-w-[280px]" />
        </div>
        <div className="max-h-[620px] overflow-auto px-4 pb-3 pt-2">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b">
                <th className={th}>Personel no</th>
                <th className={th}>Ad soyad</th>
                <th className={th}>Rol</th>
                <th className={th}>Vardiya / istasyon</th>
                <th className={th}>Yetkinlikler</th>
                <th className={th}>Durum</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.personnelNo} className={cn('border-b border-dashed last:border-0', open === u.personnelNo && 'bg-accent-bg/50', u.active === false && 'text-fg-3')}>
                  <td className={cn(td, 'display text-[14px]')}>{u.personnelNo}</td>
                  <td className={td}>{u.name}</td>
                  <td className={td}>{ROLE_LABEL[u.role]}</td>
                  <td className={td}>
                    {u.shift ?? '—'}
                    {u.station && (
                      <>
                        {' · '}
                        <OpCode op={u.station} />
                      </>
                    )}
                  </td>
                  <td className={cn(td, 'max-w-[220px] truncate text-[12px] text-fg-2')} title={u.qualifications.join(', ')}>
                    {u.qualifications.join(', ') || '—'}
                  </td>
                  <td className={td}>
                    <StatusChip u={u} />
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <Button onClick={() => setOpen(u.personnelNo)} aria-label={`${u.personnelNo} düzenle`}>
                      <Pencil className="size-3.5" /> Düzenle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users && !rows.length && <p className="py-6 text-center text-[13px] text-fg-2">Filtreye uyan kullanıcı yok.</p>}
        </div>
      </Card>
      {open === 'new' ? <UserForm key="new" user={null} onClose={() => setOpen(null)} onCreated={(no) => setOpen(no)} /> : current ? <UserForm key={current.personnelNo} user={current} onClose={() => setOpen(null)} /> : <HelpCard />}
    </div>
  )
}

function StatusChip({ u }: { u: AdminUser }) {
  if (u.active === false) return <Chip tone="neutral">Pasif</Chip>
  if (u.credential?.locked) return <Chip tone="critical">Kilitli</Chip>
  if (backend.kind === 'api' && !u.credential) return <Chip tone="warning">PIN yok</Chip>
  return <Chip tone="good">Aktif</Chip>
}

function HelpCard() {
  return (
    <Card className="px-4 py-4 text-[13px] leading-relaxed text-fg-2">
      <p className="font-medium text-fg">Kullanıcı yönetimi</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Düzenlemek için listeden bir kullanıcı seçin.</li>
        <li>Pasif kullanıcı giriş yapamaz; geçmiş kayıtlarda adı kalır. Kullanıcı silinmez.</li>
        <li>PIN sıfırlanınca kullanıcının açık oturumları kapanır. PIN audit kaydına yazılmaz.</li>
        <li>İstasyon ataması ve yetkinlikler teknisyen terminalindeki giriş kontrolünde kullanılır.</li>
      </ul>
      {backend.kind === 'demo' && <p className="mt-3 rounded-md bg-info-bg px-3 py-2 text-info-text">Demoda giriş rol seçerek yapıldığı için PIN ve kart alanları kullanılmaz; değişiklikler bu sekmede kalır.</p>}
    </Card>
  )
}

function UserForm({ user, onClose, onCreated }: { user: AdminUser | null; onClose: () => void; onCreated?: (no: string) => void }) {
  const me = useApp((s) => s.user)
  const isNew = user === null
  const stations = backend.master.stations.filter((s) => s.line === 'main' && s.type === 'manual').sort((a, b) => a.seq - b.seq)
  const shifts = backend.master.config.shifts
  const [f, setF] = useState<PersonInput>(() => (user ? { personnelNo: user.personnelNo, name: user.name, role: user.role, shift: user.shift, station: user.station, qualifications: [...user.qualifications] } : empty()))
  const [pin, setPin] = useState('')
  const [card, setCard] = useState(user?.credential?.rfid ?? '')
  const save = useSave()
  const side = useSave()
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const toggleQ = (q: string) => set('qualifications', f.qualifications.includes(q) ? f.qualifications.filter((x) => x !== q) : [...f.qualifications, q])
  const dirty = isNew || JSON.stringify(f) !== JSON.stringify({ personnelNo: user.personnelNo, name: user.name, role: user.role, shift: user.shift, station: user.station, qualifications: user.qualifications })
  const server = backend.kind === 'api'
  const submit = () =>
    save.run(async () => {
      const person = { ...f, station: f.role === 'technician' ? f.station : null }
      if (isNew) {
        await backend.admin.createUser({ ...person, personnelNo: person.personnelNo.trim().toUpperCase() }, pin, card.trim() || null)
        onCreated?.(person.personnelNo.trim().toUpperCase())
      } else await backend.admin.updateUser(person)
    }, isNew ? 'Kullanıcı eklendi.' : undefined)
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{isNew ? 'Yeni kullanıcı' : `${user.name} (${user.personnelNo})`}</h3>
        <Button onClick={onClose}>Kapat</Button>
      </div>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Personel no" hint={isNew ? 'Ör. T-1099; sonradan değişmez' : undefined}>
            <Input value={f.personnelNo} disabled={!isNew} onChange={(e) => set('personnelNo', e.target.value)} />
          </Field>
          <Field label="Ad soyad">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Rol">
            <Select value={f.role} onChange={(e) => set('role', e.target.value as RoleId)} disabled={!isNew && user.personnelNo === me?.id}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vardiya">
            <Select value={f.shift ?? ''} onChange={(e) => set('shift', e.target.value || null)}>
              <option value="">Vardiya yok</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {f.role === 'technician' && (
            <Field label="İstasyon ataması" hint="Vardiya planındaki istasyonu (terminalde plan dışı giriş yedek sayılır)">
              <Select value={f.station ?? ''} onChange={(e) => set('station', e.target.value || null)}>
                <option value="">Atama yok (rework / yedek)</option>
                {stations.map((s) => (
                  <option key={s.op} value={s.op}>
                    {s.op} {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <fieldset>
          <legend className="text-[12px] font-medium text-fg-2">Yetkinlikler</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {KNOWN_QUALIFICATIONS.map((q) => (
              <label key={q} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px]', f.qualifications.includes(q) ? 'border-accent-border bg-accent-bg text-info-text' : 'bg-card text-fg-2')}>
                <input type="checkbox" checked={f.qualifications.includes(q)} onChange={() => toggleQ(q)} className="size-3.5" />
                {q}
              </label>
            ))}
          </div>
        </fieldset>
        {isNew && server && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="İlk PIN / şifre" hint="En az 4 karakter; kullanıcıya ayrıca iletilir">
              <Input type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>
            <Field label="Kart no (isteğe bağlı)" hint="RFID okuyucunun yazdığı numara">
              <Input value={card} onChange={(e) => setCard(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="submit" variant="primary" size="md" disabled={!dirty || save.busy || (isNew && server && pin.length < 4)}>
            {isNew ? 'Kullanıcıyı ekle' : 'Değişiklikleri kaydet'}
          </Button>
          <SaveMsg msg={save.msg} />
        </div>
      </form>

      {!isNew && (
        <div className="mt-4 space-y-3 border-t pt-3">
          {server && (
            <>
              <div className="flex items-end gap-2">
                <Field label="Kart no" className="flex-1">
                  <Input value={card} onChange={(e) => setCard(e.target.value)} placeholder="Kart tanımlı değil" />
                </Field>
                <Button variant="outline" size="md" disabled={card.trim() === (user.credential?.rfid ?? '') || side.busy} onClick={() => void side.run(() => backend.admin.setCard(user.personnelNo, card.trim() || null), 'Kart kaydedildi.')}>
                  Kartı kaydet
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Field label="Yeni PIN / şifre" className="flex-1" hint="Kaydedilince kullanıcının açık oturumları kapanır">
                  <Input type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
                </Field>
                <Button
                  variant="outline"
                  size="md"
                  disabled={pin.length < 4 || side.busy}
                  onClick={() =>
                    void side.run(() => backend.admin.resetPin(user.personnelNo, pin), 'PIN sıfırlandı; açık oturumlar kapatıldı.').then((ok) => {
                      if (ok) setPin('')
                    })
                  }
                >
                  <KeyRound className="size-3.5" /> PIN'i sıfırla
                </Button>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {user.credential?.locked && (
              <Button variant="outline" onClick={() => void side.run(() => backend.admin.unlock(user.personnelNo), 'Kilit açıldı.')}>
                <LockOpen className="size-3.5" /> Kilidi aç
              </Button>
            )}
            {user.personnelNo !== me?.id && (
              <Button
                variant={user.active === false ? 'primary' : 'danger'}
                onClick={() => void side.run(() => backend.admin.setActive(user.personnelNo, user.active === false), user.active === false ? 'Kullanıcı aktifleştirildi.' : 'Kullanıcı pasifleştirildi; açık oturumları kapatıldı.')}
              >
                {user.active === false ? 'Aktifleştir' : 'Pasifleştir'}
              </Button>
            )}
          </div>
          <SaveMsg msg={side.msg} />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- rol → izin matrisi

const GROUPS: { title: string; perms: Permission[] }[] = [
  { title: 'Saha', perms: ['note.create', 'andon.create', 'motor.hold', 'op.complete', 'station.login'] },
  { title: 'Alarm ve kalite', perms: ['alarm.ack', 'alarm.assign', 'alarm.close', 'rework.manage', 'quality.decide'] },
  { title: 'Bakım ve sistem', perms: ['integration.pull', 'system.view', 'audit.view'] },
  { title: 'Yönetim', perms: ['admin.stations', 'admin.users', 'admin.routing', 'admin.alarmRules', 'admin.integration', 'admin.retention'] },
]

function RoleMatrix() {
  useApp((s) => s.dataVersion)
  const stored = backend.rbac()
  const [draft, setDraft] = useState<RolePermissions>(() => structuredClone(stored))
  const save = useSave()
  const changed = useMemo(() => ROLES.filter((r) => [...draft[r]].sort().join() !== [...stored[r]].sort().join()), [draft, stored])
  const toggle = (r: RoleId, p: Permission) => setDraft((d) => ({ ...d, [r]: d[r].includes(p) ? d[r].filter((x) => x !== p) : [...d[r], p] }))
  const missing = ALL_PERMISSIONS.filter((p) => !GROUPS.some((g) => g.perms.includes(p)))
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Rol izinleri" subtitle="Görüntüleme tüm kullanıcılara açık; izinler değişiklik yapan işlemleri ve yönetim ekranlarını korur. Değişiklik açık oturumlarda hemen geçerli olur." />
      <div className="overflow-x-auto px-4 pb-3 pt-2">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b">
              <th className={th}>İzin</th>
              {ROLES.map((r) => (
                <th key={r} className={cn(th, 'text-center')}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...GROUPS, ...(missing.length ? [{ title: 'Diğer', perms: missing }] : [])].map((g) => (
              <RoleGroup key={g.title} title={g.title} perms={g.perms} draft={draft} toggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <Button
          variant="primary"
          size="md"
          disabled={!changed.length || save.busy}
          onClick={() =>
            void save.run(async () => {
              for (const r of changed) await backend.admin.setRolePermissions(r, draft[r])
            })
          }
        >
          {changed.length ? `${changed.length} rolün izinlerini kaydet` : 'İzinleri kaydet'}
        </Button>
        <Button size="md" disabled={!changed.length} onClick={() => setDraft(structuredClone(stored))}>
          Vazgeç
        </Button>
        <SaveMsg msg={save.msg} />
      </div>
    </Card>
  )
}

function RoleGroup({ title, perms, draft, toggle }: { title: string; perms: Permission[]; draft: RolePermissions; toggle: (r: RoleId, p: Permission) => void }) {
  return (
    <>
      <tr>
        <td colSpan={ROLES.length + 1} className="pb-1 pt-3 text-[12px] font-semibold text-fg-2">
          {title}
        </td>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-b border-dashed last:border-0">
          <td className={td}>
            {PERMISSIONS[p]} <span className="text-[11.5px] text-fg-3">{p}</span>
          </td>
          {ROLES.map((r) => {
            const lockedCell = r === 'admin' && p === 'admin.users'
            return (
              <td key={r} className={cn(td, 'text-center')}>
                <input
                  type="checkbox"
                  aria-label={`${ROLE_LABEL[r]}: ${PERMISSIONS[p]}`}
                  checked={draft[r].includes(p)}
                  disabled={lockedCell}
                  title={lockedCell ? 'Admin rolünden kullanıcı ve rol yönetimi kaldırılamaz' : undefined}
                  onChange={() => toggle(r, p)}
                  className="size-4"
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
