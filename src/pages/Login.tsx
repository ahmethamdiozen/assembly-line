import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { Tm50Engine } from '@/components/engine/Tm50Engine'
import { Button } from '@/components/ui/button'
import { backend } from '@/data/app'
import { ROLE_LABEL } from '@/domain/types'
import { cn } from '@/lib/utils'

/** Demo modunda rol seçerek giriş: her rol URS §3'teki yetkileriyle */
const DEMO_USERS: { no: string; can: string }[] = [
  { no: 'T-1044', can: 'İstasyon bilgisi, not, Andon, malzeme / kalite desteği, HOLD' },
  { no: 'S-0101', can: 'Hat görünümü, alarm onay / atama / kapatma, rework takibi' },
  { no: 'Q-0201', can: 'OP100 sonuçları, rework, HOLD kararı, tekrar kontrol' },
  { no: 'M-0301', can: 'PLC / ekipman, sensör / IO, entegrasyon sağlığı, "Şimdi çek"' },
  { no: 'A-0001', can: 'Tüm yetkiler: ana veri, kullanıcılar, routing, alarm kuralları' },
]

/** Giriş ekranı (R-050): personel no ya da RFID kart + PIN / şifre */
export default function Login() {
  return (
    <div className="grid min-h-full place-items-center bg-background p-6">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-2xl border bg-card shadow-[0_20px_60px_rgba(42,58,70,0.10)] md:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col justify-between gap-6 bg-steel-1 px-8 py-8">
          <div>
            <div className="opcode text-[13px] text-info-text">TM50</div>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">Montaj hattı izleme ve izlenebilirlik</h1>
            <p className="mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-fg-2">13 ana istasyon, 5 ön montaj hücresi ve her motorun as-built geçmişi tek ekranda.</p>
          </div>
          <Tm50Engine completed={13} width={340} className="mx-auto" title="TM50 iki zamanlı 4 silindirli motor" />
          <p className="text-[12px] text-fg-3">{backend.kind === 'demo' ? 'Demo: hat ve fabrika verisi tarayıcıda simüle ediliyor.' : 'Fabrika verisi SQL Server\'dan periyodik çekilir.'}</p>
        </div>
        <div className="px-8 py-8">{backend.kind === 'demo' ? <DemoLogin /> : <ServerLogin />}</div>
      </div>
    </div>
  )
}

function ServerLogin() {
  const [login, setLogin] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await backend.login(login, secret)
    } catch (e) {
      setError((e as Error).message)
      setSecret('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex h-full flex-col justify-center gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div>
        <h2 className="text-[18px] font-semibold">Giriş yap</h2>
        <p className="mt-1 text-[13px] text-fg-2">Kart okuyucu kullanıyorsanız ilk alana kartınızı okutun.</p>
      </div>
      <label className="block">
        <span className="text-[12.5px] text-fg-2">Personel no ya da kart</span>
        <input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-accent" placeholder="Ör. T-1044" />
      </label>
      <label className="block">
        <span className="text-[12.5px] text-fg-2">PIN / şifre</span>
        <input type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-accent" />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-critical-bg px-3 py-2 text-[13px] text-critical-text">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="md" disabled={!login.trim() || !secret || busy} className="h-11 text-[14px]">
        <LogIn className="size-4" /> {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </Button>
    </form>
  )
}

function DemoLogin() {
  const people = backend.master.people
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-[18px] font-semibold">Hangi rolle bakmak istersiniz?</h2>
        <p className="mt-1 text-[13px] text-fg-2">Her rol kendi yetkileriyle girer; aksiyonlar ve audit kaydı gerçek sistemdeki gibi çalışır. Rolü sonra üst çubuktan değiştirebilirsiniz.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {DEMO_USERS.map((u) => {
          const p = people.find((x) => x.personnelNo === u.no)!
          return (
            <li key={u.no}>
              <button
                type="button"
                onClick={() => void backend.loginAs!(u.no)}
                className={cn('flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-bg/50 focus-visible:outline-2 focus-visible:outline-accent')}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold">{ROLE_LABEL[p.role]}</span>
                    <span className="truncate text-[12.5px] text-fg-2">
                      {p.name}
                      {p.station ? `, ${p.station}` : ''}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-fg-2">{u.can}</span>
                </span>
                <LogIn className="size-4 shrink-0 text-fg-3" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
