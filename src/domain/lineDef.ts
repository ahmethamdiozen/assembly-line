/**
 * TM50 hattının varsayılan ana verisi (tohum). Admin ekranından değiştirilebilir (Faz 6).
 *
 * Kaynaklar: operasyon kodları, adları, tipleri ve komponentler URS'den (ister.pdf §4, §5, §7);
 * hedef süreler, Pset / tork değerleri, takt, reçete, ekipman, checklist ve sensör adları müşteri
 * prototipinden (TM50.html); kişi adları kurgusaldır. Netleşmemiş değerler docs/acik-konular.md'de.
 */
import { DEFAULT_SHIFTS } from './shifts'
import type { AlarmRule, ComponentType, DefectDef, FaultCodeDef, LineConfig, MasterData, Person, Station, StationType, SubFeed, SystemSettings, TighteningSpec } from './types'

const MIN = 60

export const DEFAULT_CONFIG: LineConfig = {
  taktSec: 7.5 * MIN,
  warnRatio: 0.9,
  alarmRatio: 1.1,
  heartbeatTimeoutSec: 180,
  collectIntervalMin: 3,
  dayStartHour: 8,
  shifts: DEFAULT_SHIFTS,
  variant: 'TM50 / STD',
}

const tq = (op: string, pset: string, targetNm: number, tolNm: number, angleDeg: number, joints: number): TighteningSpec => ({
  pset,
  joints: Array.from({ length: joints }, (_, i) => `J${i + 1}`),
  targetNm,
  tolNm,
  angleDeg,
  controllerId: `CTRL-${op.slice(2)}`,
  toolId: `TOOL-${op.slice(2)}`,
})

const cellPrefix: Record<StationType, string> = { auto: 'AUTO', robot: 'RB', manual: 'MN' }

function main(
  seq: number,
  op: string,
  name: string,
  type: StationType,
  targetMin: number,
  recipe: string,
  tool: string,
  checklist: string[],
  signals: string[],
  tightening: TighteningSpec | null = null,
): Station {
  return {
    op,
    name,
    line: 'main',
    seq,
    type,
    targetCycleSec: Math.round(targetMin * MIN),
    plcId: `PLC-TM50-${op}`,
    cellId: op === 'OP100' ? 'QC-100' : `${cellPrefix[type]}-${op.slice(2)}`,
    tool,
    recipe,
    checklist,
    signals,
    tightening,
  }
}

function sub(seq: number, op: string, name: string, targetMin: number, recipe: string, tool: string, checklist: string[]): Station {
  return {
    op,
    name,
    line: 'sub',
    seq,
    type: 'manual',
    targetCycleSec: Math.round(targetMin * MIN),
    plcId: `PLC-TM50-${op}`,
    cellId: `SA-${op.slice(2)}`,
    tool,
    recipe,
    checklist,
    signals: ['Parça okutma', 'Fikstür hazır', 'Operatör onayı'],
    tightening: null,
  }
}

/** 13 ana hat operasyonu (URS §4, R-011) */
export const MAIN_STATIONS: Station[] = [
  main(1, 'OP005', 'Motor Bilgilerinin Yüklenmesi', 'auto', 3.2, 'TM50-ID-LOAD', 'RFID / barkod / MES yükleyici', ['Taşıyıcı kimliği okundu', 'Motor seri numarası oluşturuldu', 'Üretim reçetesi yüklendi'], ['Taşıyıcı algılama', 'Barkod okuma', 'MES el sıkışma']),
  main(2, 'OP010', 'Motor Bloğunun Bağlanması', 'manual', 5.8, 'TM50-BLOCK-010', 'Motor blok bağlama fikstürü', ['Blok doğrulandı', 'Krank seti yerleştirildi', 'Fikstür kilitlendi'], ['Parça okutma', 'Fikstür kilidi', 'Operatör onayı']),
  main(3, 'OP015', 'Gasket Sealant Uygulanması', 'robot', 3.7, 'TM50-SEAL-015', 'Robotik sealant dozajlama hücresi', ['Yüzey doğrulandı', 'Sealant yolu uygulandı', 'Vision bead kontrolü'], ['Nozul hazır', 'Akış izleme', 'Vision bead']),
  main(4, 'OP020', 'Motor Bloğu Kapatılması', 'auto', 5.2, 'TM50-CLOSE-020', 'Otomatik blok kapama hücresi', ['Kapama yüzeyi doğrulandı', 'Blok kapatıldı', 'Otomatik sıkma tamamlandı'], ['Kelepçe kapalı', 'Yükseklik kontrolü', 'Sıkma tamam'], tq('OP020', 'P20', 24, 2, 76, 8)),
  main(5, 'OP030', 'Askı Grubu Montajı', 'manual', 5.6, 'TM50-HANGER-030', 'Askı grubu montaj aparatı', ['Askı grubu okutuldu', 'Flanş hizalandı', 'Bağlantılar tamamlandı'], ['Parça doğrulama', 'Fikstür hazır', 'Tool hazır'], tq('OP030', 'P30', 18, 2, 69, 4)),
  main(6, 'OP040', 'Motor Döndürme', 'manual', 3.9, 'TM50-ROT-040', 'Motor rotasyon sehpası', ['Kilit serbest bırakıldı', 'Motor döndürüldü', 'Yeni pozisyon kilitlendi'], ['Kilit pimi', 'Açı güvenli', 'Operatör onayı']),
  main(7, 'OP050', 'Silindir Bloğu Montajı', 'manual', 7.0, 'TM50-CYL-050', 'Silindir blok montaj fikstürü', ['Silindir seti doğrulandı', 'Bloklar yerleştirildi', 'Bağlantı sıkmaları tamamlandı'], ['Parça okutma', 'Hizalama', 'Tool hazır'], tq('OP050', 'P50', 22, 2, 82, 8)),
  main(8, 'OP060', 'Hava Emiş Grubu Montajı', 'manual', 6.2, 'TM50-INTAKE-060', 'Emiş grubu montaj tezgâhı', ['Gaz kelebeği seti okutuldu', 'Emiş grubu monte edildi', 'Bağlantılar doğrulandı'], ['Parça doğrulama', 'Konnektör boş', 'Operatör onayı']),
  main(9, 'OP070', 'Kablo ve Alternatör Montajı', 'manual', 6.6, 'TM50-ELEC-070', 'Elektrik montaj tezgâhı', ['Alternatör yerleşimi', 'Kablo routing', 'Konnektör doğrulama'], ['Kablo demeti okutma', 'Konnektör sayımı', 'Operatör onayı']),
  main(10, 'OP080', 'Marş Motoru Pervane Grubu Montajı', 'manual', 6.8, 'TM50-START-080', 'Marş / pervane grubu fikstürü', ['Ön montaj seti okutuldu', 'Marş motoru bağlandı', 'Pervane grubu doğrulandı'], ['Parça okutma', 'Tool hazır', 'Pozisyon OK'], tq('OP080', 'P80', 30, 3, 91, 6)),
  main(11, 'OP090', 'Egzoz Grubu', 'manual', 5.9, 'TM50-EXH-090', 'Egzoz montaj fikstürü', ['Egzoz seti okutuldu', 'Grup hizalandı', 'Bağlantılar tamamlandı'], ['Parça doğrulama', 'Hizalama', 'Operatör onayı']),
  main(12, 'OP100', 'Kalite Kontrol', 'robot', 4.8, 'TM50-QC-100', 'Vision + boyutsal kalite hücresi', ['Görüntü alma', 'Bağlantı / routing kontrolü', 'Kalite kararı'], ['Kamera çevrimiçi', 'Işık kulesi', 'Karar çıkışı']),
  main(13, 'OP110', 'Motoru İndirme / Paketleme', 'manual', 4.5, 'TM50-PACK-110', 'İndirme + paketleme istasyonu', ['Final etiket basıldı', 'Motor hattan indirildi', 'Paketleme tamamlandı'], ['Çıkış boş', 'Etiket baskı', 'Paket onayı']),
]

/** 5 ön montaj hücresi (URS §5, R-016). Kit çevrim süreleri varsayımdır (takt'tan kısa; buffer dolu tutulur). */
export const SUB_STATIONS: Station[] = [
  sub(1, 'OP201', 'Krank Seti Ön Montaj', 6.4, 'TM50-SA-CRK', 'Krank seti montaj masası', ['Krank mili okutuldu', 'Rulmanlar yerleştirildi', 'Set doğrulandı']),
  sub(2, 'OP202', 'Silindir Blok Seti Ön Montaj', 6.6, 'TM50-SA-CYL', 'Silindir blok seti masası', ['Silindir seti okutuldu', 'Piston yerleştirildi', 'Set doğrulandı']),
  sub(3, 'OP203', 'Gaz Kelebeği Seti Ön Montaj', 6.2, 'TM50-SA-THR', 'Gaz kelebeği montaj masası', ['Gövde okutuldu', 'Kelebek ayarlandı', 'Set doğrulandı']),
  sub(4, 'OP205', 'Motor Askı ve Devir Sensör Flanşı Ön Montaj', 6.0, 'TM50-SA-HGR', 'Askı / flanş montaj masası', ['Askı okutuldu', 'Devir sensörü takıldı', 'Set doğrulandı']),
  sub(5, 'OP206', 'Marş Dişlisi Pervane Flanşı Ön Montaj', 6.5, 'TM50-SA-STP', 'Marş dişlisi / flanş masası', ['Marş dişlisi okutuldu', 'Pervane flanşı takıldı', 'Set doğrulandı']),
]

/** Ön montaj → ana hat beslemesi (prototipteki ilişkiler; admin'den değiştirilebilir, R-055) */
export const SUB_FEEDS: SubFeed[] = [
  { subOp: 'OP201', mainOp: 'OP010', kit: 'Krank seti', bufferMin: 10, bufferMax: 24, dailyTarget: 192 },
  { subOp: 'OP202', mainOp: 'OP050', kit: 'Silindir blok seti', bufferMin: 10, bufferMax: 24, dailyTarget: 192 },
  { subOp: 'OP203', mainOp: 'OP060', kit: 'Gaz kelebeği seti', bufferMin: 10, bufferMax: 24, dailyTarget: 192 },
  { subOp: 'OP205', mainOp: 'OP030', kit: 'Motor askı + devir sensör flanşı', bufferMin: 10, bufferMax: 24, dailyTarget: 192 },
  { subOp: 'OP206', mainOp: 'OP080', kit: 'Marş dişlisi + pervane flanşı', bufferMin: 10, bufferMax: 20, dailyTarget: 192 },
]

/** 7 seri numaralı komponent (URS §7, R-028), takıldıkları operasyon sırasıyla */
export const COMPONENTS: ComponentType[] = [
  { code: 'MBL', name: 'Motor Bloğu', installOp: 'OP010', category: 'Ana yapı' },
  { code: 'KRK', name: 'Krank Mili', installOp: 'OP010', category: 'Döner grup' },
  { code: 'PCS', name: 'Piston Silindir Seti', installOp: 'OP050', category: 'Silindir grubu' },
  { code: 'GKS', name: 'Gaz Kelebeği Seti', installOp: 'OP060', category: 'Emiş' },
  { code: 'KBL', name: 'Kablo', installOp: 'OP070', category: 'Elektrik' },
  { code: 'ALT', name: 'Alternatör', installOp: 'OP070', category: 'Elektrik' },
  { code: 'MRS', name: 'Marş Motoru', installOp: 'OP080', category: 'Marş' },
]

/** Varsayılan alarm kuralları (prototipteki öncelik ve eskalasyon değerleri; admin'den değişir, R-056) */
export const DEFAULT_ALARM_RULES: AlarmRule[] = [
  { code: 'PLC-FLT', name: 'İstasyon arızası', source: 'PLC', severity: 'critical', escalationMin: 2, team: 'Bakım Ekibi', enabled: true },
  { code: 'HB-LOSS', name: 'Heartbeat / bağlantı kaybı', source: 'System', severity: 'critical', escalationMin: 2, team: 'Otomasyon', enabled: true },
  { code: 'CYC-TAKT', name: 'Takt aşımı', source: 'Cycle', severity: 'warning', escalationMin: 10, team: 'Üretim Lideri', enabled: true },
  { code: 'OP-NOK', name: 'Operasyon NOK', source: 'PLC', severity: 'warning', escalationMin: 10, team: 'Üretim Lideri', enabled: true },
  { code: 'TQ-NOK', name: 'Tork NOK', source: 'Torque', severity: 'warning', escalationMin: 10, team: 'Üretim Lideri', enabled: true },
  { code: 'VIS-NOK', name: 'OP100 kalite reddi', source: 'Vision', severity: 'critical', escalationMin: 2, team: 'Kalite Ekibi', enabled: true },
  { code: 'VIS-HOLD', name: 'OP100 HOLD', source: 'Vision', severity: 'warning', escalationMin: 10, team: 'Kalite Ekibi', enabled: true },
  { code: 'BUF-LOW', name: 'Düşük ön montaj buffer\'ı', source: 'Material', severity: 'warning', escalationMin: 10, team: 'Lojistik', enabled: true },
  { code: 'TRC-DUP', name: 'Mükerrer komponent seri no', source: 'System', severity: 'critical', escalationMin: 2, team: 'Kalite Ekibi', enabled: true },
  { code: 'AND-MAT', name: 'Andon – malzeme', source: 'Operator', severity: 'warning', escalationMin: 5, team: 'Lojistik', enabled: true },
  { code: 'AND-QUA', name: 'Andon – kalite desteği', source: 'Operator', severity: 'warning', escalationMin: 5, team: 'Kalite Ekibi', enabled: true },
  { code: 'AND-PRD', name: 'Andon – üretim desteği', source: 'Operator', severity: 'warning', escalationMin: 5, team: 'Üretim Lideri', enabled: true },
  { code: 'NOTE-ERR', name: 'Teknisyen hata notu', source: 'Operator', severity: 'warning', escalationMin: 10, team: 'Üretim Lideri', enabled: true },
]

/** OP100 vision hata kodları (kod ve metinler prototipten uyarlandı; gerçek katalog vision sisteminden gelecek) */
export const DEFECTS: DefectDef[] = [
  { code: 'VIS-ORI-004', text: 'Komponent yönelim uyumsuzluğu', decision: 'NOK', sourceOp: 'OP060', category: 'assembly', priority: 'high' },
  { code: 'VIS-CBL-007', text: 'Kablo demeti routing sapması', decision: 'NOK', sourceOp: 'OP070', category: 'electrical', priority: 'high' },
  { code: 'VIS-SEAL-011', text: 'Sealant bead süreksizliği', decision: 'NOK', sourceOp: 'OP015', category: 'sealing', priority: 'medium' },
  { code: 'VIS-CYL-013', text: 'Silindir bağlantı cıvatası doğrulanamadı', decision: 'NOK', sourceOp: 'OP050', category: 'fastening', priority: 'high' },
  { code: 'VIS-EXH-015', text: 'Egzoz conta hizasızlığı', decision: 'NOK', sourceOp: 'OP090', category: 'assembly', priority: 'medium' },
  { code: 'VIS-FST-020', text: 'Marş grubu bağlantı elemanı doğrulanamadı', decision: 'NOK', sourceOp: 'OP080', category: 'fastening', priority: 'low' },
  { code: 'VIS-LBL-002', text: 'Etiket / işaret okunamadı', decision: 'HOLD', sourceOp: 'OP100', category: 'process', priority: 'low' },
  { code: 'VIS-IMG-009', text: 'Görüntü kalitesi yetersiz, tekrar muayene gerekli', decision: 'HOLD', sourceOp: 'OP100', category: 'process', priority: 'low' },
]

/** PLC arıza / durma kodları (varsayım; gerçek liste PLC tag listesiyle gelecek) */
export const FAULT_CODES: FaultCodeDef[] = [
  { code: 'PLC-HS', text: 'PLC el sıkışma zaman aşımı' },
  { code: 'FIX-LOCK', text: 'Fikstür kilidi algılanmadı' },
  { code: 'TOOL-ERR', text: 'Sıkma tool hatası' },
  { code: 'EMG-STOP', text: 'Acil stop' },
  { code: 'SEAL-FLOW', text: 'Sealant akış hatası' },
  { code: 'CAM-TRIG', text: 'Kamera tetik hatası' },
  { code: 'CONV-JAM', text: 'Konveyör sıkışması' },
  { code: 'SENSOR', text: 'Sensör sinyali yok' },
  { code: 'NO-OPR', text: 'Operatör yok' },
  { code: 'MAT-WAIT', text: 'Ön montaj kiti bekleniyor' },
]

const tech = (personnelNo: string, name: string, shift: 'A' | 'B' | 'C', station: string, extra: string[] = []): Person => ({
  personnelNo,
  name,
  role: 'technician',
  shift,
  station,
  qualifications: ['Montaj L2', ...extra],
})

/** Kişiler (kurgusal). A vardiyası teknisyenleri prototipteki isimlerdir. */
export const PEOPLE: Person[] = [
  tech('T-1011', 'Banu Karaca', 'A', 'OP010', ['Montaj L3']),
  tech('T-1031', 'Emre Güneş', 'A', 'OP030', ['Torque Qualified']),
  tech('T-1041', 'Selim Yıldız', 'A', 'OP040'),
  tech('T-1051', 'Rıza Aydın', 'A', 'OP050', ['Montaj L3', 'Torque Qualified']),
  tech('T-1061', 'Mert Demir', 'A', 'OP060'),
  tech('T-1044', 'Ece Kara', 'A', 'OP070', ['Montaj L3']),
  tech('T-1082', 'Derya Akın', 'A', 'OP080', ['Montaj L3', 'Torque Qualified']),
  tech('T-1091', 'Ozan Tunç', 'A', 'OP090'),
  tech('T-1111', 'Burak Çetin', 'A', 'OP110'),
  tech('T-2011', 'Cem Arslan', 'B', 'OP010', ['Montaj L3']),
  tech('T-2031', 'Elif Doğan', 'B', 'OP030', ['Torque Qualified']),
  tech('T-2041', 'Murat Koç', 'B', 'OP040'),
  tech('T-2051', 'Hakan Polat', 'B', 'OP050', ['Torque Qualified']),
  tech('T-2061', 'Zeynep Aksoy', 'B', 'OP060'),
  tech('T-2071', 'Gökhan Şimşek', 'B', 'OP070'),
  tech('T-2081', 'Seda Yalçın', 'B', 'OP080', ['Torque Qualified']),
  tech('T-2091', 'Onur Kılıç', 'B', 'OP090'),
  tech('T-2111', 'Tolga Erdem', 'B', 'OP110'),
  tech('T-3011', 'Kaan Özdemir', 'C', 'OP010'),
  tech('T-3031', 'Merve Aydemir', 'C', 'OP030', ['Torque Qualified']),
  tech('T-3041', 'Serkan Uçar', 'C', 'OP040'),
  tech('T-3051', 'Pınar Ateş', 'C', 'OP050', ['Montaj L3', 'Torque Qualified']),
  tech('T-3061', 'Volkan Kurt', 'C', 'OP060'),
  tech('T-3071', 'Gizem Taş', 'C', 'OP070'),
  tech('T-3081', 'Barış Yavuz', 'C', 'OP080', ['Torque Qualified']),
  tech('T-3091', 'Ceren Bulut', 'C', 'OP090'),
  tech('T-3111', 'Umut Sarı', 'C', 'OP110'),
  // Rework operatörleri (prototipteki isimler)
  { personnelNo: 'RW-021', name: 'Aylin Kaya', role: 'technician', shift: 'A', station: null, qualifications: ['Rework L2', 'Torque Qualified'] },
  { personnelNo: 'RW-022', name: 'Kerem Şahin', role: 'technician', shift: 'A', station: null, qualifications: ['Rework L2'] },
  { personnelNo: 'RW-023', name: 'Mina Çelik', role: 'technician', shift: 'B', station: null, qualifications: ['Rework L2'] },
  { personnelNo: 'RW-024', name: 'Tuna Aras', role: 'technician', shift: 'B', station: null, qualifications: ['Rework L2'] },
  { personnelNo: 'RW-025', name: 'Sude Polat', role: 'technician', shift: 'C', station: null, qualifications: ['Rework L2'] },
  // Diğer roller
  { personnelNo: 'S-0101', name: 'Levent Acar', role: 'supervisor', shift: 'A', station: null, qualifications: [] },
  { personnelNo: 'S-0102', name: 'Nihan Çakır', role: 'supervisor', shift: 'B', station: null, qualifications: [] },
  { personnelNo: 'S-0103', name: 'Oğuz Er', role: 'supervisor', shift: 'C', station: null, qualifications: [] },
  { personnelNo: 'Q-0201', name: 'Aslı Tekin', role: 'quality', shift: null, station: null, qualifications: ['Quality Authorized'] },
  { personnelNo: 'Q-0202', name: 'Furkan Bozkurt', role: 'quality', shift: null, station: null, qualifications: ['Quality Authorized'] },
  { personnelNo: 'M-0301', name: 'Hasan Yurt', role: 'maintenance', shift: null, station: null, qualifications: [] },
  { personnelNo: 'M-0302', name: 'İrem Sezer', role: 'maintenance', shift: null, station: null, qualifications: [] },
  { personnelNo: 'A-0001', name: 'Sistem Yöneticisi', role: 'admin', shift: null, station: null, qualifications: [] },
]

/** Bilinen yetkinlikler (admin ekranındaki seçenekler; istasyon kuralı: src/domain/qualifications.ts) */
export const KNOWN_QUALIFICATIONS = ['Montaj L1', 'Montaj L2', 'Montaj L3', 'Torque Qualified', 'Rework L2', 'Quality Authorized'] as const

/**
 * Varsayılan saklama süreleri: istasyon olayları 5 yıl, tork 10 yıl, kalite görüntü kayıtları 365 gün,
 * audit 2 yıl (prototip); izlenebilirlik 10 yıl ve alarm / not 2 yıl varsayımdır (acik-konular.md F4).
 */
export const DEFAULT_SETTINGS: SystemSettings = {
  retention: { trace: 3650, tightening: 3650, images: 365, events: 1825, alarms: 730, audit: 730 },
  backup: { enabled: true, hour: 2, keep: 14 },
}

/** Varsayılan ana verinin bağımsız bir kopyası */
export function defaultMaster(): MasterData {
  return structuredClone({
    config: DEFAULT_CONFIG,
    settings: DEFAULT_SETTINGS,
    stations: [...MAIN_STATIONS, ...SUB_STATIONS],
    subFeeds: SUB_FEEDS,
    components: COMPONENTS,
    rules: DEFAULT_ALARM_RULES,
    defects: DEFECTS,
    faultCodes: FAULT_CODES,
    people: PEOPLE,
  })
}

/**
 * Kayıtlı ana veriyi bu sürümün beklediği biçime tamamlar: sonradan eklenen alanlar ve kurallar
 * varsayılanlarıyla eklenir, admin'in değiştirdiği değerlere dokunulmaz.
 */
export function normalizeMaster(stored: Partial<MasterData> | null): MasterData {
  const d = defaultMaster()
  if (!stored) return d
  const m = { ...d, ...stored } as MasterData
  m.config = { ...d.config, ...stored.config }
  m.settings = {
    retention: { ...d.settings.retention, ...stored.settings?.retention },
    backup: { ...d.settings.backup, ...stored.settings?.backup },
  }
  const codes = new Set(m.rules.map((r) => r.code))
  m.rules = [...m.rules, ...d.rules.filter((r) => !codes.has(r.code))]
  return m
}

/** Ana veriye hızlı erişim için indeksler */
export interface MasterIndex {
  master: MasterData
  main: Station[]
  subs: Station[]
  station: Map<string, Station>
  /** Ana hat istasyonunun sırası (0'dan) */
  mainIndex: Map<string, number>
  lastMainOp: string
  feedBySub: Map<string, SubFeed>
  feedByMain: Map<string, SubFeed>
  componentsAt: Map<string, ComponentType[]>
  rule: Map<string, AlarmRule>
  defect: Map<string, DefectDef>
  fault: Map<string, FaultCodeDef>
  person: Map<string, Person>
}

export function indexMaster(master: MasterData): MasterIndex {
  const main = master.stations.filter((s) => s.line === 'main').sort((a, b) => a.seq - b.seq)
  const subs = master.stations.filter((s) => s.line === 'sub').sort((a, b) => a.seq - b.seq)
  const componentsAt = new Map<string, ComponentType[]>()
  for (const c of master.components) componentsAt.set(c.installOp, [...(componentsAt.get(c.installOp) ?? []), c])
  return {
    master,
    main,
    subs,
    station: new Map(master.stations.map((s) => [s.op, s])),
    mainIndex: new Map(main.map((s, i) => [s.op, i])),
    lastMainOp: main[main.length - 1].op,
    feedBySub: new Map(master.subFeeds.map((f) => [f.subOp, f])),
    feedByMain: new Map(master.subFeeds.map((f) => [f.mainOp, f])),
    componentsAt,
    rule: new Map(master.rules.map((r) => [r.code, r])),
    defect: new Map(master.defects.map((d) => [d.code, d])),
    fault: new Map(master.faultCodes.map((f) => [f.code, f])),
    person: new Map(master.people.map((p) => [p.personnelNo, p])),
  }
}

/** t anında istasyonun başındaki teknisyen (vardiya atamasından) */
export function operatorAt(ix: MasterIndex, op: string, shiftId: string): Person | undefined {
  return ix.master.people.find((p) => p.role === 'technician' && p.station === op && p.shift === shiftId)
}
