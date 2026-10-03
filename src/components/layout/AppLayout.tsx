import { CloudOff, LoaderCircle, LogOut } from 'lucide-react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { backend, useApp } from '@/data/app'
import { ROLE_LABEL } from '@/domain/types'
import Login from '@/pages/Login'
import { shiftHours, shiftOf } from '@/domain/shifts'
import { hms } from '@/lib/format'
import { FreshnessPill } from './FreshnessPill'
import { navFor } from './nav'
import { Sidebar } from './Sidebar'

/** Uygulama saati (demoda simülasyon saati; hız kontrolüyle hızlanır) */
function Clock() {
  const now = useApp((s) => s.now)
  const sh = shiftOf(now)
  return (
    <div className="flex items-center gap-2.5">
      <div className="whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs font-medium">
        {sh.name} <span className="text-fg-2">{shiftHours(sh)}</span>
      </div>
      <div className="text-right leading-tight">
        <div className="tnum text-[15px] font-semibold">{hms(now)}</div>
        <div className="text-[11px] text-fg-2">{new Date(now).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      </div>
    </div>
  )
}

function UserChip() {
  const user = useApp((s) => s.user)
  if (!user) return null
  return (
    <div className="flex items-center gap-1 border-l pl-3">
      <div className="text-right leading-tight">
        <div className="text-[13px] font-semibold">{user.name}</div>
        <div className="text-[11px] text-fg-2">{ROLE_LABEL[user.role]}</div>
      </div>
      <Button size="icon" onClick={() => void backend.logout()} title={backend.kind === 'demo' ? 'Rol değiştir' : 'Çıkış yap'} aria-label={backend.kind === 'demo' ? 'Rol değiştir' : 'Çıkış yap'}>
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}

/** Oturum kontrol edilirken ya da sunucuya ulaşılamazken */
function Connecting() {
  const conn = useApp((s) => s.conn)
  const offline = conn.state === 'offline'
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md text-center">
        {offline ? <CloudOff className="mx-auto size-8 text-critical-text" /> : <LoaderCircle className="mx-auto size-8 animate-spin text-fg-2" />}
        <h2 className="mt-3 text-base font-semibold">{offline ? 'Sunucuya ulaşılamıyor' : 'Bağlanılıyor'}</h2>
        {offline && (
          <p className="mt-1 text-sm text-fg-2">
            API çalışmıyor olabilir. Geliştirme ortamında <code className="rounded bg-wash px-1">npm run stack</code> ile başlatın; 5 sn'de bir yeniden deneniyor.
          </p>
        )}
      </div>
    </div>
  )
}

/** Tüm ekranların kabı: solda menü, üstte sayfa başlığı, veri tazeliği, vardiya, saat ve kullanıcı. */
export function AppLayout() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const page = navFor(pathname)
  const auth = useApp((s) => s.auth)
  if (auth === 'unknown') return <Connecting />
  if (auth === 'anonymous') return <Login />
  // Teknisyen terminali kiosk modu: menü ve üst çubuk yok, sayfa kendi çubuğunu çizer
  if (pathname.startsWith('/terminal') && params.get('kiosk') === '1')
    return (
      <main className="h-full overflow-auto bg-background">
        <Outlet />
      </main>
    )
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-5">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{page.title}</h1>
            <p className="truncate text-xs text-fg-2">{page.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <FreshnessPill />
            <Clock />
            <UserChip />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
