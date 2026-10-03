import { MotorLink } from '@/components/common/MotorLink'
import { Chip, OpCode } from '@/components/status/StateBadge'
import type { Tone } from '@/components/status/styles'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/card'
import type { Overview } from '@/domain/overview'
import { FAULT_CATEGORY_LABEL, PRIORITY_LABEL, REWORK_STATE_LABEL } from '@/domain/types'
import type { Priority, ReworkState } from '@/domain/types'
import { fmtDuration, hhmm } from '@/lib/format'

const PRIORITY_TONE: Record<Priority, Tone> = { high: 'critical', medium: 'warning', low: 'neutral' }
const STATE_TONE: Record<ReworkState, Tone> = { triage: 'critical', diagnosis: 'warning', bench: 'warning', ready: 'info', reqc: 'info', closed: 'good' }

/** OP100 sonrası side-loop: rework kuyruğu ve HOLD'daki motorlar (R-003, R-034) */
export function ReworkQueue({ ov }: { ov: Overview }) {
  const empty = ov.reworks.length === 0 && ov.holds.length === 0
  return (
    <Card>
      <CardHeader title="Rework ve HOLD" subtitle="OP100'de NOK ya da HOLD kararı alan motorlar ve kullanıcı HOLD'ları. Adımlar Kalite & Rework ekranından yönetilir." right={<Link to="/kalite" className="text-[12.5px] font-medium text-info-text hover:underline">Kalite & Rework</Link>} />
      <div className="overflow-x-auto px-4 pb-4 pt-3">
        {empty ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[13px] text-fg-2">Side-loop boş. OP100'den NOK ya da HOLD çıkan motor yok.</p>
        ) : (
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-fg-2">
                <th className="pb-1.5 font-medium">Motor</th>
                <th className="pb-1.5 font-medium">Kaynak OP</th>
                <th className="pb-1.5 font-medium">Hata</th>
                <th className="pb-1.5 font-medium">Öncelik</th>
                <th className="pb-1.5 font-medium">Adım</th>
                <th className="pb-1.5 font-medium">Rework operatörü</th>
                <th className="pb-1.5 text-right font-medium">Bekleme</th>
              </tr>
            </thead>
            <tbody>
              {ov.reworks.map((r) => (
                <tr key={r.id} className="border-t border-dashed align-top">
                  <td className="py-2">
                    <MotorLink sn={r.sn} className="text-[14px]" />
                    <div className="text-[11.5px] text-fg-3">
                      {r.id}
                      {r.attempt > 1 ? `, ${r.attempt}. tur` : ''}
                    </div>
                  </td>
                  <td className="py-2">
                    <OpCode op={r.sourceOp} />
                  </td>
                  <td className="py-2">
                    <div>{r.defect}</div>
                    <div className="text-[11.5px] text-fg-2">{FAULT_CATEGORY_LABEL[r.category]}</div>
                  </td>
                  <td className="py-2">
                    <Chip tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABEL[r.priority]}</Chip>
                  </td>
                  <td className="py-2">
                    <Chip tone={STATE_TONE[r.state]}>{REWORK_STATE_LABEL[r.state]}</Chip>
                  </td>
                  <td className="py-2 text-fg-2">{r.reworkOperator ?? 'Atanmadı'}</td>
                  <td className="display py-2 text-right text-[14px]">{fmtDuration((ov.now - r.openedAt) / 1000)}</td>
                </tr>
              ))}
              {ov.holds.map((h) => (
                <tr key={h.id} className="border-t border-dashed align-top">
                  <td className="py-2">
                    <MotorLink sn={h.sn} className="text-[14px]" />
                    <div className="text-[11.5px] text-fg-3">{hhmm(h.t)}</div>
                  </td>
                  <td className="py-2">
                    <OpCode op={h.op ?? 'OP100'} />
                  </td>
                  <td className="py-2">{h.reason}</td>
                  <td className="py-2">—</td>
                  <td className="py-2">
                    <Chip tone="warning">HOLD, kalite kararı bekliyor</Chip>
                  </td>
                  <td className="py-2 text-fg-2">—</td>
                  <td className="display py-2 text-right text-[14px]">{fmtDuration((ov.now - h.t) / 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
