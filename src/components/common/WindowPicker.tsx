import { Segmented } from '@/components/ui/segmented'
import { WINDOW_LABEL } from './timeWindow'
import type { WindowKey } from './timeWindow'

export function WindowPicker({ value, onChange }: { value: WindowKey; onChange: (k: WindowKey) => void }) {
  return <Segmented label="Zaman aralığı" value={value} onChange={onChange} options={(Object.keys(WINDOW_LABEL) as WindowKey[]).map((k) => ({ value: k, label: WINDOW_LABEL[k] }))} />
}
