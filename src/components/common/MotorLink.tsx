import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Motor seri numarası; tıklanınca Motor Takibi açılır (R-041) */
export function MotorLink({ sn, className, short = false }: { sn: string; className?: string; short?: boolean }) {
  return (
    <Link to={`/motor/${encodeURIComponent(sn)}`} className={cn('display font-semibold text-info-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent', className)} title={`${sn} motor geçmişi`}>
      {short ? sn.slice(5) : sn}
    </Link>
  )
}
