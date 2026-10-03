import { BookOpen, ChartColumn, HardHat, LayoutDashboard, ScanSearch, ServerCog, Settings, ShieldCheck, Siren, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Sol menüdeki ekranlar. Henüz yapılmamış ekranlar (Admin) hangi fazda geleceğini ve içeriğini gösterir. */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  title: string
  subtitle: string
  /** Ekranın geleceği faz (plan §7) */
  phase: number
  /** Karşıladığı başlıca isterler (01_customer_requirements_clean.md) */
  reqs: string
  planned: string[]
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Kontrol Merkezi',
    icon: LayoutDashboard,
    title: 'TM50 Montaj Hattı · Kontrol Merkezi',
    subtitle: 'Hat akışı, KPI, seçili istasyon, rework ve son olaylar tek sayfada',
    phase: 2,
    reqs: 'R-003, R-012–R-026',
    planned: [
      'KPI şeridi: vardiya çıkışı, FPY, OEE, takt, darboğaz',
      '13 ana istasyonluk yatay hat; her istasyonda OP kodu, tip, teknisyen, durum ve motor (S/N ile)',
      '5 ön montaj hücresi: buffer seviyesi, hedef ve beslediği ana hat OP\'si',
      'Seçili İstasyon paneli (Genel / Proses / Kalite & Tork / Varlık & IO / Notlar / Geçmiş); istasyona tıklamak sayfa değiştirmez',
      'Cycle grafiği (actual / target / takt), rework kuyruğu, son olaylar, veri tazeliği',
    ],
  },
  {
    to: '/motor',
    label: 'Motor Takibi',
    icon: ScanSearch,
    title: 'Motor Takibi · As-Built Genealogy',
    subtitle: 'Motor seri numarasıyla güncel durum ve üretim geçmişi',
    phase: 4,
    reqs: 'R-027–R-032',
    planned: [
      'Seri numarası araması, tamamlanma yüzdesi (13 OP) ve ilerleme çubuğu',
      'Takılan Parçalar: 7 seri numaralı komponent, Installed / Pending',
      'Build Status haritası, OP bazında giriş / çıkış / cycle / teknisyen / sonuç',
      'Motorun tork kayıtları, OP100 görüntüleri ve rework geçmişi',
    ],
  },
  {
    to: '/kalite',
    label: 'Kalite & Rework',
    icon: ShieldCheck,
    title: 'Kalite & Rework',
    subtitle: 'OP100 kalite kapısı, HOLD kararları ve rework akışı',
    phase: 4,
    reqs: 'R-033–R-036',
    planned: [
      'OP100 sonuçları (OK / NOK / HOLD)',
      'Rework kanbanı: Triage → Diagnosis → Rework Bench → Ready for Re-QC',
      'Hata tipi, kaynak OP, kök neden, öncelik, sorumlu, rework operatörü',
      'Re-QC\'ye gönderme ve HOLD kararları',
    ],
  },
  {
    to: '/alarmlar',
    label: 'Alarm & Andon',
    icon: Siren,
    title: 'Alarm Merkezi & Andon',
    subtitle: 'Alarmları filtrele, onayla, ata ve kapat',
    phase: 4,
    reqs: 'R-037–R-041',
    planned: [
      'Severity, durum, kaynak, OP ve metin filtreleri',
      'Yaşam döngüsü: Detected → Acknowledged → Assigned → Closed (audit kaydıyla)',
      'Alarm detayından motor izlenebilirliğine geçiş',
      'Andon çağrıları: malzeme, kalite, üretim',
    ],
  },
  {
    to: '/tork',
    label: 'Tork',
    icon: Wrench,
    title: 'Tightening / Tork',
    subtitle: 'Sıkma sonuçları ve controller / tool durumu',
    phase: 4,
    reqs: 'R-042–R-044',
    planned: [
      'Zaman, motor S/N, OP, tool / controller, Pset, joint, hedef, tork, açı, OK / NOK',
      'Controller ve tool online / available durumu',
      'CSV dışa aktarım',
    ],
  },
  {
    to: '/kpi',
    label: 'KPI & Raporlar',
    icon: ChartColumn,
    title: 'KPI & Raporlar',
    subtitle: 'Üretim performansı, cycle analizi, darboğaz ve Pareto',
    phase: 5,
    reqs: 'R-045–R-049',
    planned: [
      'Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme, vardiya çıkışı',
      'İstasyon bazında actual / target / takt ve son çevrim trendi',
      'Otomatik darboğaz tespiti',
      'Kalite hataları ve alarm kaynakları Pareto\'su, vardiya / tarih filtresi',
    ],
  },
  {
    to: '/terminal',
    label: 'Teknisyen Terminali',
    icon: HardHat,
    title: 'Teknisyen Terminali',
    subtitle: 'İstasyona giriş, aktif görev ve hızlı aksiyonlar',
    phase: 5,
    reqs: 'R-006, R-050–R-052',
    planned: [
      'Personel no + PIN (RFID okuyucu aynı alana yazar) ile istasyon / vardiya girişi',
      'Aktif istasyon, motor ve görev tek kartta; yetkinlik kontrolü',
      'Not, Andon, malzeme talebi, kalite desteği, HOLD, operasyonu tamamla',
    ],
  },
  {
    to: '/bakim',
    label: 'Bakım & Entegrasyon',
    icon: ServerCog,
    title: 'Bakım & Entegrasyon',
    subtitle: 'Veri hattının, cihazların ve IO\'nun sağlığı',
    phase: 5,
    reqs: 'R-009, R-024, R-057, R-073',
    planned: [
      'SQL Server bağlantısı, son çekme zamanı, okunan satır, collector hataları, "Şimdi çek"',
      'PLC / tork controller / kamera heartbeat\'leri, istasyon sensör / IO durumu',
      'SQL Server\'daki ham tablolar ve hata logları',
    ],
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: Settings,
    title: 'Admin & Konfigürasyon',
    subtitle: 'Hat, kullanıcı, routing, alarm ve veri ayarları',
    phase: 6,
    reqs: 'R-010, R-053–R-058',
    planned: [
      'İstasyon ana verisi: OP kodu, ad, tip, hedef cycle, PLC / Cell ID, tool; takt ve vardiyalar',
      'Kullanıcılar, roller ve izinler',
      'Ön montaj → ana hat besleme ilişkileri ve buffer min seviyeleri',
      'Alarm kuralları (severity, eskalasyon, varsayılan ekip), saklama süreleri, audit log',
    ],
  },
  {
    to: '/rehber',
    label: 'Metrik Rehberi',
    icon: BookOpen,
    title: 'Metrik Rehberi',
    subtitle: 'KPI\'ların nasıl hesaplandığı ve varsayımlar',
    phase: 5,
    reqs: 'R-045–R-047',
    planned: [
      'OEE, FPY, plan gerçekleşme ve darboğaz formülleri',
      'Müşteriyle netleştirilecek varsayımlar',
    ],
  },
]

export function navFor(pathname: string): NavItem {
  return NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`))) ?? NAV[0]
}
