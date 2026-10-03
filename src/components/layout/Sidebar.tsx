import { NavLink, useLocation } from 'react-router-dom'
import { backend } from '@/data/app'
import { cn } from '@/lib/utils'
import { NAV, navFor } from './nav'

/** Sol menü. 1536 px altında sadece ikonlar görünür; hat görseline yer kalsın (R-004). */
export function Sidebar() {
  const { pathname } = useLocation()
  const active = navFor(pathname)
  return (
    <aside className="flex w-16 shrink-0 flex-col border-r bg-card 2xl:w-60">
      <div className="flex h-16 items-center gap-2.5 border-b px-3 2xl:px-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent-border bg-accent-bg text-[11px] font-extrabold tracking-tight text-info-text">TM50</div>
        <div className="hidden min-w-0 leading-tight 2xl:block">
          <div className="truncate text-sm font-semibold">TM50 Montaj Hattı</div>
          <div className="truncate text-[11px] text-fg-2">Üretim izleme ve izlenebilirlik</div>
        </div>
      </div>
      <nav aria-label="Ekranlar" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV.map((n) => {
          const isActive = n === active
          return (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                isActive ? 'bg-accent-bg text-info-text' : 'text-fg-2 hover:bg-wash hover:text-fg',
              )}
            >
              <n.icon className="size-4.5 shrink-0" strokeWidth={isActive ? 2.3 : 2} />
              <span className="hidden truncate 2xl:inline">{n.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className="hidden border-t p-3 text-[11px] leading-snug text-fg-2 2xl:block">
        {backend.kind === 'demo' ? (
          <>
            <b className="text-fg">Demo modu.</b> Hat ve veri hattı tarayıcıda simüle ediliyor.
          </>
        ) : (
          <>
            <b className="text-fg">Sunucu modu.</b> Fabrika verisi SQL Server'dan periyodik çekilir.
          </>
        )}
      </div>
    </aside>
  )
}
