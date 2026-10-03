import { CalendarClock } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { navFor } from '@/components/layout/nav'

/** Henüz yapılmamış ekranın yer tutucusu: hangi fazda geleceğini ve içeriğini gösterir. */
export default function Planned() {
  const page = navFor(useLocation().pathname)
  return (
    <Card className="mx-auto max-w-3xl p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-bg text-info-text">
          <page.icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{page.label}</h2>
          <p className="mt-0.5 text-sm text-fg-2">{page.subtitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 font-medium text-warning-text">
              <CalendarClock className="size-3.5" /> Faz {page.phase}'te gelecek
            </span>
            <span className="rounded-full border px-2 py-0.5 text-fg-2">{page.reqs}</span>
          </div>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        {page.planned.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-info" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
