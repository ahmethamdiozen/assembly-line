import { Pause, Play, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { backend, useApp, useCan } from '@/data/app'

/**
 * Hat kontrolleri. "Şimdi çek" collector'ı beklemeden çalıştırır (bakım / admin yetkisi).
 * Demo modunda ayrıca simülasyon kontrolleri vardır (FAL-005, opsiyonel); hız, collector turlarını da hızlandırır.
 */
export function SimControls() {
  useApp((s) => s.now) // oynat / duraklat durumu için saniyede bir çiz
  const canPull = useCan('integration.pull')
  const [msg, setMsg] = useState<string | null>(null)
  const sim = backend.sim
  const pull = async () => {
    setMsg('Çekiliyor…')
    try {
      await backend.pullNow()
      setMsg(null)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  const pullButton = canPull && (
    <Button variant="outline" onClick={() => void pull()} title="Collector'ı beklemeden SQL Server'dan veri çek">
      <RefreshCw className="size-3.5" /> Şimdi çek
    </Button>
  )
  if (!sim)
    return (
      <div className="flex items-center gap-2">
        {msg && <span className="text-[12px] text-fg-2">{msg}</span>}
        {pullButton}
      </div>
    )
  const { playing, speed } = sim.state()
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Simülasyon kontrolleri">
      <span className="text-[12px] text-fg-2">Simülasyon</span>
      {playing ? (
        <Button variant="outline" onClick={() => sim.pause()} title="Duraklat">
          <Pause className="size-3.5" /> Duraklat
        </Button>
      ) : (
        <Button variant="primary" onClick={() => sim.play()} title="Oynat">
          <Play className="size-3.5" /> Oynat
        </Button>
      )}
      <Segmented label="Simülasyon hızı" value={speed} onChange={(v) => sim.setSpeed(v)} options={[1, 2, 4, 10].map((v) => ({ value: v, label: `${v}x` }))} />
      {pullButton}
      <Button variant="ghost" onClick={() => sim.reset()} title="Simülasyonu baştan kur">
        <RotateCcw className="size-3.5" /> Sıfırla
      </Button>
      {msg && <span className="text-[12px] text-critical-text">{msg}</span>}
    </div>
  )
}
