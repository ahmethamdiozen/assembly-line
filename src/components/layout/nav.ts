import { BookOpen, ChartColumn, HardHat, LayoutDashboard, ScanSearch, ServerCog, Settings, ShieldCheck, Siren, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Sol menüdeki ekranlar */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  title: string
  subtitle: string
  /** Karşıladığı başlıca isterler (01_customer_requirements_clean.md) */
  reqs: string
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Kontrol Merkezi',
    icon: LayoutDashboard,
    title: 'TM50 Montaj Hattı · Kontrol Merkezi',
    subtitle: 'Hat akışı, KPI, seçili istasyon, rework ve son olaylar tek sayfada',
    reqs: 'R-003, R-012–R-026',
  },
  {
    to: '/motor',
    label: 'Motor Takibi',
    icon: ScanSearch,
    title: 'Motor Takibi · As-Built Genealogy',
    subtitle: 'Motor seri numarasıyla güncel durum ve üretim geçmişi',
    reqs: 'R-027–R-032',
  },
  {
    to: '/kalite',
    label: 'Kalite & Rework',
    icon: ShieldCheck,
    title: 'Kalite & Rework',
    subtitle: 'OP100 kalite kapısı, HOLD kararları ve rework akışı',
    reqs: 'R-033–R-036',
  },
  {
    to: '/alarmlar',
    label: 'Alarm & Andon',
    icon: Siren,
    title: 'Alarm Merkezi & Andon',
    subtitle: 'Alarmları filtrele, onayla, ata ve kapat',
    reqs: 'R-037–R-041',
  },
  {
    to: '/tork',
    label: 'Tork',
    icon: Wrench,
    title: 'Tightening / Tork',
    subtitle: 'Sıkma sonuçları ve controller / tool durumu',
    reqs: 'R-042–R-044',
  },
  {
    to: '/kpi',
    label: 'KPI & Raporlar',
    icon: ChartColumn,
    title: 'KPI & Raporlar',
    subtitle: 'Üretim performansı, cycle analizi, darboğaz ve Pareto',
    reqs: 'R-045–R-049',
  },
  {
    to: '/terminal',
    label: 'Teknisyen Terminali',
    icon: HardHat,
    title: 'Teknisyen Terminali',
    subtitle: 'İstasyona giriş, aktif görev ve hızlı aksiyonlar',
    reqs: 'R-006, R-050–R-052',
  },
  {
    to: '/bakim',
    label: 'Bakım & Entegrasyon',
    icon: ServerCog,
    title: 'Bakım & Entegrasyon',
    subtitle: 'Veri hattının, cihazların ve IO\'nun sağlığı',
    reqs: 'R-009, R-024, R-057, R-073',
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: Settings,
    title: 'Admin & Konfigürasyon',
    subtitle: 'Hat, kullanıcı, routing, alarm ve veri ayarları',
    reqs: 'R-010, R-053–R-058',
  },
  {
    to: '/rehber',
    label: 'Metrik Rehberi',
    icon: BookOpen,
    title: 'Metrik Rehberi',
    subtitle: 'KPI\'ların nasıl hesaplandığı ve varsayımlar',
    reqs: 'R-045–R-047',
  },
]

export function navFor(pathname: string): NavItem {
  return NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`))) ?? NAV[0]
}
