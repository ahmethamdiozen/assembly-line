import { useSearchParams } from 'react-router-dom'
import { AdminAudit } from './admin/AdminAudit'
import { AdminData, AdminIntegration, AdminRouting, AdminRules } from './admin/AdminConfig'
import { AdminLine } from './admin/AdminLine'
import { AdminUsers } from './admin/AdminUsers'
import { backend } from '@/data/app'
import { cn } from '@/lib/utils'

/**
 * Admin & Konfigürasyon (R-010, R-053–R-058, R-075). Her sekme kendi izniyle korunur; her değişiklik
 * doğrulanır ve audit'e önceki / sonraki değerleriyle yazılır. Sekme adres çubuğunda: #/admin?tab=kullanici
 */

const TABS = [
  { id: 'hat', label: 'Hat & istasyonlar', el: <AdminLine /> },
  { id: 'kullanici', label: 'Kullanıcılar & roller', el: <AdminUsers /> },
  { id: 'besleme', label: 'Ön montaj beslemesi', el: <AdminRouting /> },
  { id: 'alarm', label: 'Alarm kuralları', el: <AdminRules /> },
  { id: 'entegrasyon', label: 'Entegrasyon', el: <AdminIntegration /> },
  { id: 'veri', label: 'Saklama & yedek', el: <AdminData /> },
  { id: 'audit', label: 'Audit kaydı', el: <AdminAudit /> },
] as const

export default function Admin() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]
  return (
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div role="tablist" aria-label="Admin sekmeleri" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab.id === t.id}
            onClick={() => setParams(t.id === 'hat' ? {} : { tab: t.id }, { replace: true })}
            className={cn('-mb-px border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-accent', tab.id === t.id ? 'border-accent text-info-text' : 'border-transparent text-fg-2 hover:text-fg')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {backend.kind === 'demo' && <p className="rounded-lg bg-info-bg px-3 py-2 text-[12.5px] text-info-text">Demo: değişiklikler bu tarayıcı sekmesinde geçerli olur ve audit'e yazılır; simülasyon sıfırlanınca varsayılanlara döner.</p>}
      <div key={tab.id}>{tab.el}</div>
    </div>
  )
}
