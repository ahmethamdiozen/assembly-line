import { CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useApp } from '@/data/app'
import { ago, hhmm } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Veri tazeliği (R-074). Fabrika verisi SQL Server'dan 3–5 dk'da bir çekildiği için ekranda her zaman
 * son verinin zamanı ve bir sonraki çekme gösterilir; veri gecikir ya da bağlantı koparsa uyarı çıkar.
 */
export function FreshnessPill() {
  const conn = useApp((s) => s.conn)
  const now = useApp((s) => s.now)

  if (conn.state === 'connecting')
    return (
      <Pill className="text-fg-2">
        <LoaderCircle className="size-3.5 animate-spin" /> Veri hazırlanıyor
      </Pill>
    )
  if (conn.state === 'offline')
    return (
      <Pill className="bg-critical-bg text-critical-text" title={conn.error ?? undefined}>
        <CloudOff className="size-3.5" /> Sunucuya ulaşılamıyor, son veri {conn.watermark ? hhmm(conn.watermark) : '—'}
      </Pill>
    )
  const next = conn.nextPullAt ? Math.max(0, conn.nextPullAt - now) : null
  return (
    <Pill className={conn.state === 'stale' ? 'bg-warning-bg text-warning-text' : 'text-fg-2'} title={conn.error ? `Collector: ${conn.error}` : `Fabrika verisi ${conn.intervalMin} dk'da bir çekilir`}>
      {conn.state === 'stale' ? <TriangleAlert className="size-3.5" /> : <span className="pulse-dot size-2 rounded-full bg-good" />}
      <span>
        {conn.state === 'stale' ? 'Fabrika verisi gecikiyor, son' : 'Son fabrika verisi'} <b className="display text-[13px] text-fg">{conn.watermark ? hhmm(conn.watermark) : '—'}</b>
        {conn.watermark && <span className="text-fg-3"> ({ago(now - conn.watermark)})</span>}
      </span>
      {next !== null && conn.state !== 'stale' && <span className="hidden text-fg-3 xl:inline">sonraki çekme {next < 60_000 ? `${Math.ceil(next / 1000)} sn` : `${Math.ceil(next / 60_000)} dk`} içinde</span>}
    </Pill>
  )
}

function Pill({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <div role="status" title={title} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-xs font-medium', className)}>
      {children}
    </div>
  )
}
