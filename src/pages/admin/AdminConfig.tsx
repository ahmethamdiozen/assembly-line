import { DatabaseBackup, PlugZap, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { OpCode } from '@/components/status/StateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, usePolled } from '@/data/app'
import { RETENTION_GROUPS, RETENTION_ORDER } from '@/domain/admin'
import type { FeedPatch, RetentionCount, RulePatch } from '@/domain/admin'
import type { IntegrationTest } from '@/domain/maintenance'
import { TEAMS } from '@/domain/types'
import type { AlarmRule, RetentionGroup, Severity, SubFeed, Team } from '@/domain/types'
import { hms, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Field, Guard, Input, NumberInput, SaveMsg, Select, td, th } from './ui'
import { fmtDays, useSave } from './form'

// ---------------------------------------------------------------- ön montaj besleme (R-055)

export function AdminRouting() {
  useApp((s) => s.dataVersion)
  const feeds = backend.master.subFeeds
  return (
    <Guard perm="admin.routing">
      <Card className="overflow-hidden">
        <CardHeader
          title="Ön montaj → ana hat beslemesi"
          subtitle="Her ön montaj hücresinin beslediği ana hat istasyonu, kit, buffer seviyeleri ve günlük hedef. Buffer minimumun altına düşünce BUF-LOW alarmı açılır; Kontrol Merkezi'ndeki besleme okları buna göre çizilir."
        />
        <div className="overflow-x-auto px-4 pb-3 pt-2">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b">
                <th className={th}>Hücre</th>
                <th className={th}>Beslediği istasyon</th>
                <th className={th}>Kit</th>
                <th className={th}>Buffer min</th>
                <th className={th}>Buffer max</th>
                <th className={th}>Günlük hedef</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {feeds.map((f) => (
                <FeedRow key={`${f.subOp}-${JSON.stringify(f)}`} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  )
}

function FeedRow({ f }: { f: SubFeed }) {
  const [d, setD] = useState(f)
  const save = useSave()
  const main = backend.master.stations.filter((s) => s.line === 'main').sort((a, b) => a.seq - b.seq)
  const name = backend.master.stations.find((s) => s.op === f.subOp)?.name
  const patch: FeedPatch = {}
  for (const k of ['mainOp', 'kit', 'bufferMin', 'bufferMax', 'dailyTarget'] as const) if (d[k] !== f[k]) (patch as Record<string, unknown>)[k] = d[k]
  const dirty = Object.keys(patch).length > 0
  return (
    <>
      <tr className={cn('border-b border-dashed', dirty && 'bg-accent-bg/40')}>
        <td className={td}>
          <OpCode op={f.subOp} /> <span className="text-[12px] text-fg-2">{name}</span>
        </td>
        <td className={td}>
          <Select aria-label={`${f.subOp} beslediği istasyon`} value={d.mainOp} onChange={(e) => setD({ ...d, mainOp: e.target.value })} className="w-60">
            {main.map((s) => (
              <option key={s.op} value={s.op}>
                {s.op} {s.name}
              </option>
            ))}
          </Select>
        </td>
        <td className={td}>
          <Input aria-label={`${f.subOp} kit`} value={d.kit} onChange={(e) => setD({ ...d, kit: e.target.value })} />
        </td>
        <td className={td}>
          <NumberInput label={`${f.subOp} buffer min`} value={d.bufferMin} onChange={(v) => setD({ ...d, bufferMin: v })} className="w-24" />
        </td>
        <td className={td}>
          <NumberInput label={`${f.subOp} buffer max`} value={d.bufferMax} onChange={(v) => setD({ ...d, bufferMax: v })} className="w-24" />
        </td>
        <td className={td}>
          <NumberInput label={`${f.subOp} günlük hedef`} value={d.dailyTarget} onChange={(v) => setD({ ...d, dailyTarget: v })} className="w-28" />
        </td>
        <td className={cn(td, 'whitespace-nowrap text-right')}>
          <Button variant="primary" disabled={!dirty || save.busy} onClick={() => void save.run(() => backend.admin.saveFeed(f.subOp, patch))}>
            Kaydet
          </Button>
          <Button disabled={!dirty} onClick={() => setD(f)}>
            Vazgeç
          </Button>
        </td>
      </tr>
      {save.msg && !save.msg.ok && (
        <tr>
          <td />
          <td colSpan={6} className="pb-2">
            <SaveMsg msg={save.msg} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------- alarm kuralları (R-056)

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

export function AdminRules() {
  useApp((s) => s.dataVersion)
  return (
    <Guard perm="admin.alarmRules">
      <Card className="overflow-hidden">
        <CardHeader
          title="Alarm kuralları"
          subtitle="Önem, eskalasyon süresi (bu sürede onaylanmayan alarm eskale olur) ve varsayılan sorumlu ekip. Kapalı kural yeni alarm açmaz; açık alarmlar yaşam döngüsünü tamamlar."
        />
        <div className="overflow-x-auto px-4 pb-3 pt-2">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-b">
                <th className={th}>Kod</th>
                <th className={th}>Ad</th>
                <th className={th}>Kaynak</th>
                <th className={th}>Önem</th>
                <th className={th}>Eskalasyon</th>
                <th className={th}>Varsayılan ekip</th>
                <th className={th}>Açık</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {backend.master.rules.map((r) => (
                <RuleRow key={`${r.code}-${JSON.stringify(r)}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  )
}

function RuleRow({ r }: { r: AlarmRule }) {
  const [d, setD] = useState(r)
  const save = useSave()
  const patch: RulePatch = {}
  for (const k of ['name', 'severity', 'escalationMin', 'team', 'enabled'] as const) if (d[k] !== r[k]) (patch as Record<string, unknown>)[k] = d[k]
  const dirty = Object.keys(patch).length > 0
  return (
    <>
      <tr className={cn('border-b border-dashed', dirty && 'bg-accent-bg/40', !d.enabled && 'text-fg-3')}>
        <td className={cn(td, 'display text-[14px]')}>{r.code}</td>
        <td className={td}>
          <Input aria-label={`${r.code} adı`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </td>
        <td className={td}>{r.source}</td>
        <td className={td}>
          <Select aria-label={`${r.code} önem`} value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Severity })} className="w-28">
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </Select>
        </td>
        <td className={td}>
          <NumberInput label={`${r.code} eskalasyon`} value={d.escalationMin} onChange={(v) => setD({ ...d, escalationMin: v })} unit="dk" className="w-24" />
        </td>
        <td className={td}>
          <Select aria-label={`${r.code} ekip`} value={d.team} onChange={(e) => setD({ ...d, team: e.target.value as Team })} className="w-40">
            {TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </td>
        <td className={td}>
          <input type="checkbox" aria-label={`${r.code} açık`} checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} className="size-4" />
        </td>
        <td className={cn(td, 'whitespace-nowrap text-right')}>
          <Button variant="primary" disabled={!dirty || save.busy} onClick={() => void save.run(() => backend.admin.saveRule(r.code, patch))}>
            Kaydet
          </Button>
          <Button disabled={!dirty} onClick={() => setD(r)}>
            Vazgeç
          </Button>
        </td>
      </tr>
      {save.msg && !save.msg.ok && (
        <tr>
          <td />
          <td colSpan={7} className="pb-2">
            <SaveMsg msg={save.msg} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------- entegrasyon

export function AdminIntegration() {
  useApp((s) => s.dataVersion)
  const cfg = backend.master.config
  const i = usePolled(() => backend.integration(), [])
  const [min, setMin] = useState(cfg.collectIntervalMin)
  const save = useSave()
  const [test, setTest] = useState<IntegrationTest | null>(null)
  const [testing, setTesting] = useState(false)
  return (
    <Guard perm="admin.integration">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="px-4 py-3.5">
          <h3 className="text-[13px] font-semibold">Fabrika SQL Server'ı</h3>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-fg-2">Kaynak</dt>
            <dd>{i?.source ?? '—'}</dd>
            <dt className="text-fg-2">Erişim</dt>
            <dd>Salt okunur; uygulama fabrika sistemine yazmaz</dd>
            <dt className="text-fg-2">Bağlantı bilgisi</dt>
            <dd>{backend.kind === 'demo' ? 'Demo: tarayıcı içi simülasyon' : <>Sunucudaki <code className="rounded bg-wash px-1">.env</code> dosyasında (MSSQL_*); şifre ekrana getirilmez</>}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="md"
              disabled={testing}
              onClick={() => {
                setTesting(true)
                void backend.admin
                  .testIntegration()
                  .then(setTest, (e: Error) => setTest({ ok: false, ms: 0, error: e.message, maxIds: null }))
                  .finally(() => setTesting(false))
              }}
            >
              <PlugZap className="size-4" /> Bağlantıyı test et
            </Button>
            {test && (
              <span className={cn('text-[13px]', test.ok ? 'text-good-text' : 'text-critical-text')}>
                {test.ok ? `Bağlantı tamam (${test.ms} ms); ${Object.keys(test.maxIds ?? {}).length} tablo okunabiliyor` : `Bağlanılamadı: ${test.error}`}
              </span>
            )}
          </div>
          <p className="mt-3 text-[12px] text-fg-2">
            Veri hattının ayrıntılı durumu (turlar, okuma konumu, cihazlar):{' '}
            <Link to="/bakim" className="text-info-text hover:underline">
              Bakım & Entegrasyon
            </Link>
          </p>
        </Card>
        <Card className="px-4 py-3.5">
          <h3 className="text-[13px] font-semibold">Çekme aralığı</h3>
          <p className="mt-1 text-[12.5px] text-fg-2">Collector fabrika verisini bu aralıkla okur. 3–5 dk ile sınırlıdır (fabrika SQL Server'ına yük bindirmemek için). Değişiklik bir sonraki turdan geçerli olur.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented label="Çekme aralığı" value={min} onChange={setMin} options={[3, 4, 5].map((v) => ({ value: v, label: `${v} dk` }))} />
            <Button variant="primary" disabled={min === cfg.collectIntervalMin || save.busy} onClick={() => void save.run(() => backend.admin.saveIntegration(min))}>
              Kaydet
            </Button>
            <SaveMsg msg={save.msg} />
          </div>
          {i?.nextRunAt && <p className="mt-2 text-[12px] text-fg-3">Sonraki tur {hms(i.nextRunAt)}</p>}
          <p className="mt-3 text-[12px] text-fg-2">Heartbeat zaman aşımı ve durum eşikleri "Hat & istasyonlar" sekmesinde.</p>
        </Card>
      </div>
    </Guard>
  )
}

// ---------------------------------------------------------------- veri saklama ve yedek (R-010, R-075)

export function AdminData() {
  return (
    <Guard perm="admin.retention">
      <div className="space-y-4">
        <Retention />
        <Backups />
      </div>
    </Guard>
  )
}

function Retention() {
  useApp((s) => s.dataVersion)
  const stored = backend.master.settings.retention
  const [d, setD] = useState<Record<RetentionGroup, number>>(() => ({ ...stored }))
  const preview = usePolled(() => backend.admin.retentionPreview(), [])
  const save = useSave()
  const purge = useSave()
  const [purged, setPurged] = useState<RetentionCount[] | null>(null)
  const [confirm, setConfirm] = useState(false)
  const dirty = RETENTION_ORDER.some((g) => d[g] !== stored[g])
  const due = preview?.reduce((a, g) => a + g.rows, 0) ?? 0
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Veri saklama süreleri"
        subtitle="Süresi dolan kayıtlar her gün otomatik temizlenir (sunucu modunda, yedekten sonra). Açık alarm, süren rework / HOLD ve hattaki motor silinmez. Silme işlemi audit'e yazılır."
      />
      <div className="overflow-x-auto px-4 pb-3 pt-2">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b">
              <th className={th}>Veri</th>
              <th className={th}>Saklama süresi</th>
              <th className={cn(th, 'text-right')}>Süresi dolmuş kayıt</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION_ORDER.map((g) => {
              const def = RETENTION_GROUPS[g]
              const p = preview?.find((x) => x.group === g)
              return (
                <tr key={g} className="border-b border-dashed last:border-0">
                  <td className={td}>
                    <span className="font-medium">{def.label}</span>
                    <span className="block text-[12px] text-fg-2">{def.hint}</span>
                  </td>
                  <td className={td}>
                    <span className="flex items-center gap-2">
                      <NumberInput label={`${def.label} saklama süresi`} value={d[g]} onChange={(v) => setD({ ...d, [g]: v })} unit="gün" className="w-32" />
                      <span className="w-16 text-[12px] text-fg-3">{Number.isFinite(d[g]) ? fmtDays(d[g]) : ''}</span>
                    </span>
                    <span className="text-[11.5px] text-fg-3">en az {def.minDays} gün</span>
                  </td>
                  <td className={cn(td, 'display text-right text-[14px]')}>{p ? num(p.rows) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <Button variant="primary" size="md" disabled={!dirty || save.busy} onClick={() => void save.run(() => backend.admin.saveRetention(d))}>
          Süreleri kaydet
        </Button>
        <Button size="md" disabled={!dirty} onClick={() => setD({ ...stored })}>
          Vazgeç
        </Button>
        <SaveMsg msg={save.msg} />
        <span className="ml-auto flex items-center gap-2">
          {confirm ? (
            <>
              <span className="text-[12.5px] text-critical-text">{num(due)} kayıt kalıcı olarak silinecek.</span>
              <Button
                variant="danger"
                disabled={purge.busy}
                onClick={() =>
                  void purge
                    .run(async () => setPurged(await backend.admin.purge()), 'Temizlik tamamlandı.')
                    .then(() => setConfirm(false))
                }
              >
                Sil
              </Button>
              <Button onClick={() => setConfirm(false)}>Vazgeç</Button>
            </>
          ) : (
            <Button variant="outline" disabled={!due || dirty} onClick={() => setConfirm(true)} title={dirty ? 'Önce süreleri kaydedin' : undefined}>
              <Trash2 className="size-3.5" /> Şimdi temizle
            </Button>
          )}
        </span>
      </div>
      {(purge.msg || purged) && (
        <div className="border-t px-4 py-2.5">
          <SaveMsg msg={purge.msg} />
          {purged && <p className="text-[12.5px] text-fg-2">Silinen: {purged.map((g) => `${RETENTION_GROUPS[g.group].label} ${num(g.rows)}`).join(' · ')}</p>}
        </div>
      )}
    </Card>
  )
}

function Backups() {
  useApp((s) => s.dataVersion)
  const stored = backend.master.settings.backup
  const [d, setD] = useState(() => ({ ...stored }))
  const list = usePolled(() => backend.admin.backups(), [])
  const save = useSave()
  const now = useSave()
  const dirty = d.enabled !== stored.enabled || d.hour !== stored.hour || d.keep !== stored.keep
  const demo = backend.kind === 'demo'
  return (
    <Card className="px-4 py-3.5">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
        <DatabaseBackup className="size-4" /> Yedekleme (R-075)
      </h3>
      <p className="mt-1 text-[12.5px] text-fg-2">
        Uygulama veritabanının tutarlı kopyası (SQLite VACUUM INTO) sunucu çalışırken alınır. Geri yükleme sunucu kapalıyken <code className="rounded bg-wash px-1">npm run db:restore -- &lt;dosya&gt;</code> ile yapılır (docs/kurulum.md).
      </p>
      {demo && <p className="mt-2 rounded-md bg-info-bg px-3 py-2 text-[12.5px] text-info-text">Demoda veri tarayıcı sekmesinde tutulur; yedek alınmaz. Ayarlar kaydedilir ve audit'e yazılır.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} className="size-4" /> Her gün otomatik yedek al
        </label>
        <Field label="Saat">
          <NumberInput label="Yedek saati" value={d.hour} onChange={(v) => setD({ ...d, hour: v })} unit=":00" className="w-24" />
        </Field>
        <Field label="Saklanacak yedek">
          <NumberInput label="Saklanacak yedek sayısı" value={d.keep} onChange={(v) => setD({ ...d, keep: v })} unit="adet" className="w-28" />
        </Field>
        <Button variant="primary" size="md" disabled={!dirty || save.busy} onClick={() => void save.run(() => backend.admin.saveBackup(d))}>
          Kaydet
        </Button>
        <Button variant="outline" size="md" disabled={demo || now.busy} onClick={() => void now.run(async () => (await backend.admin.backupNow()).backup, 'Yedek alındı.')}>
          Şimdi yedek al
        </Button>
      </div>
      <SaveMsg msg={save.msg ?? now.msg} className="mt-2" />
      {!demo && (
        <div className="mt-3">
          <p className="text-[12px] font-medium text-fg-2">Mevcut yedekler</p>
          {list?.length ? (
            <ul className="mt-1 space-y-1 text-[12.5px]">
              {list.map((b) => (
                <li key={b.file} className="flex justify-between gap-3 border-b border-dashed pb-1 last:border-0">
                  <span className="display text-[13.5px]">{b.file}</span>
                  <span className="text-fg-2">
                    {new Date(b.t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {num(b.sizeBytes / 1024 / 1024, 1)} MB
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-fg-2">Henüz yedek yok.</p>
          )}
        </div>
      )}
    </Card>
  )
}
