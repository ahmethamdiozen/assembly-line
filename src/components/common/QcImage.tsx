import qcPlaceholder from '@/assets/tm50-qc.webp'
import { cn } from '@/lib/utils'

/**
 * OP100 kalite görüntüsü. Görüntü dosyaları fabrikanın görüntü deposunda (SQL Server'da yolu var);
 * depo bağlantısı netleşene kadar (acik-konular.md C4) motor görseli yer tutucu olarak gösterilir.
 */
export function QcImage({ view, path, decision, defect }: { view: string; path: string; decision: 'OK' | 'NOK' | 'HOLD'; defect?: string | null }) {
  const bad = decision !== 'OK'
  return (
    <figure className={cn('overflow-hidden rounded-lg border bg-card', decision === 'NOK' && 'border-critical/50', decision === 'HOLD' && 'border-warning/60')}>
      <div className="relative grid aspect-[4/3] place-items-center bg-[radial-gradient(circle_at_50%_45%,#f4f8fa,#dfe7ec)]">
        <img src={qcPlaceholder} alt="" className="h-[82%] w-auto object-contain opacity-90" loading="lazy" />
        <span className="absolute inset-2 rounded border border-dashed border-steel-3/40" aria-hidden />
        <span className="display absolute left-2.5 top-2 text-[12px] font-semibold text-info-text">{view}</span>
        {bad && <span className={cn('absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[11px] font-semibold', decision === 'NOK' ? 'bg-critical-bg text-critical-text' : 'bg-warning-bg text-warning-text')}>{decision}</span>}
      </div>
      <figcaption className="truncate px-2 py-1.5 text-[11.5px] text-fg-2" title={path}>
        {bad && defect ? defect : path.split('/').slice(-2).join('/')}
      </figcaption>
    </figure>
  )
}
