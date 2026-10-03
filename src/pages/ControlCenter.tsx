import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StationCycleChart, StationCycleTrend } from '@/components/control/CycleCharts'
import { EventFeed } from '@/components/control/EventFeed'
import { KpiStrip } from '@/components/control/KpiStrip'
import { ReworkQueue } from '@/components/control/ReworkQueue'
import { SimControls } from '@/components/control/SimControls'
import { StationPanel } from '@/components/control/StationPanel'
import { LineBand } from '@/components/line/LineBand'
import { STATE_STYLE } from '@/components/status/styles'
import { Card, CardHeader } from '@/components/ui/card'
import { backend, useApp, useOverview } from '@/data/app'
import type { DisplayState } from '@/domain/lineState'
import type { Overview } from '@/domain/overview'
import { minutes } from '@/lib/format'

/**
 * Kontrol Merkezi (R-003): hat akışı, KPI'lar, seçili istasyon, rework ve son olaylar tek sayfada.
 */
export default function ControlCenter() {
  const ov = useOverview()
  const selected = useApp((s) => s.selectedOp)
  const select = useApp((s) => s.select)
  const [params] = useSearchParams()

  // Bağlantıyla gelinen istasyon (?op=OP070)
  useEffect(() => {
    const op = params.get('op')
    if (op && backend.master.stations.some((s) => s.op === op)) select(op)
  }, [params, select])

  // İlk açılışta dikkat isteyen istasyonu seç: arıza, sonra takt riski, yoksa darboğaz
  useEffect(() => {
    if (!ov || selected) return
    const pick = ov.stations.find((v) => v.state === 'fault') ?? ov.stations.find((v) => v.state === 'warning') ?? ov.stations.find((v) => v.station.op === ov.bottleneck)
    select(pick?.station.op ?? ov.stations[0].station.op)
  }, [ov, selected, select])

  if (!ov) return <Loading />
  const stat = ov.cycles.find((c) => c.op === selected) ?? null

  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <KpiStrip ov={ov} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Ana hat ve ön montaj</h2>
            <p className="mt-0.5 text-xs text-fg-2">
              13 istasyon, takt {minutes(ov.cycles[0]?.taktSec ? ov.cycles[0].taktSec / 60 : 7.5)}. İstasyona ya da motora tıklayınca aşağıdaki panel güncellenir.
            </p>
          </div>
          <SimControls />
        </div>
        <Legend ov={ov} />
        <div className="px-3 pb-4 pt-2">
          <LineBand ov={ov} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <StationPanel />
        <div className="space-y-4">
          <Card>
            <CardHeader title="İstasyon çevrim süreleri (dk)" subtitle="Son 8 çevrim ortalaması. Çubuğa tıklayınca istasyon seçilir." />
            <div className="px-3 pb-2 pt-1">
              <StationCycleChart cycles={ov.cycles} selected={selected} bottleneck={ov.bottleneck} onSelect={select} />
            </div>
          </Card>
          {stat && (
            <Card>
              <CardHeader
                title={`${stat.op} son çevrimler (dk)`}
                subtitle={`Eskiden yeniye. Kesikli çizgi takt (${minutes(stat.taktSec / 60)}), düz çizgi istasyon hedefi (${minutes(stat.targetSec / 60)}). Takt'ı aşan çevrimler uyarı renginde.`}
              />
              <div className="px-3 pb-2 pt-1">
                <StationCycleTrend stat={stat} />
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ReworkQueue ov={ov} />
        <EventFeed ov={ov} />
      </div>
    </div>
  )
}

function Legend({ ov }: { ov: Overview }) {
  const counts = ov.stations.reduce<Record<DisplayState, number>>((m, v) => ((m[v.state] += 1), m), { running: 0, warning: 0, fault: 0, offline: 0 })
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-[12px] text-fg-2" aria-label="Durum açıklaması">
      {(Object.keys(STATE_STYLE) as DisplayState[]).map((s) => {
        const st = STATE_STYLE[s]
        return (
          <li key={s} className="flex items-center gap-1">
            <st.icon className={`size-3.5 ${st.text}`} aria-hidden />
            {st.label}
            <span className="display text-[13px] font-semibold text-fg">{counts[s]}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Loading() {
  return (
    <div className="grid h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <LoaderCircle className="mx-auto size-8 animate-spin text-fg-2" />
        <h2 className="mt-3 text-base font-semibold">Hat verisi hazırlanıyor</h2>
        <p className="mt-1 text-sm text-fg-2">Son 24 saat simüle ediliyor ve collector tarafından okunuyor.</p>
      </div>
    </div>
  )
}
