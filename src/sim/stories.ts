/**
 * Demo hikâyeleri: simülatörün başladığı ana (t0) göre dakika cinsinden kurgulanmış olaylar.
 * Ekran açıldığında anlatılacak bir durum olsun diye bazıları "şu an" sürer, bazıları geçmişte
 * kalmış ve kapanmıştır. Simülatör nedenleri SQL'e yazmaz; sadece fabrikanın göreceği satırlar oluşur.
 */

export interface SlowStory {
  op: string
  fromMin: number
  toMin: number
  /** Çalışma süresi çarpanı */
  factor: number
}

export interface FaultStory {
  op: string
  atMin: number
  durSec: number
  code: string
}

export interface VisionStory {
  /** Bu andan sonra OP100'den ilk kez çıkan motor */
  afterMin: number
  decision: 'NOK' | 'HOLD'
  defectCode: string
}

export interface Stories {
  /** İstasyonda yavaşlama (takt riski) */
  slow: SlowStory[]
  /** Belirli anda istasyon arızası */
  faults: FaultStory[]
  /** Bu andan sonra istasyonda başlayan ilk çevrimde joint iki kez NOK, ardından tool hatası, sonra OK */
  torque: { op: string; afterMin: number; joint: string } | null
  vision: VisionStory[]
  /** Bu andan sonra istasyonda başlayan ilk çevrimde önceki motorun komponent S/N'si okutulur, sonra doğrusu */
  duplicateScan: { op: string; afterMin: number; type: string } | null
  /** Ön montaj hücresinde yavaşlama ve durma */
  subSlow: SlowStory[]
  subStop: { op: string; fromMin: number; toMin: number; code: string }[]
  /** Cihaz bağlantı kaybı */
  offline: { deviceId: string; fromMin: number; toMin: number }[]
  /** Sensör / IO sinyali düşer */
  io: { op: string; signal: string; fromMin: number; toMin: number }[]
}

export const DEFAULT_STORIES: Stories = {
  // OP070: kablo routing'de ek doğrulama → çevrim takt'ı aşıyor, darboğaz OP070'e kayıyor
  slow: [{ op: 'OP070', fromMin: -150, toMin: 60, factor: 1.25 }],
  // OP050: ölçüm tezgâhı el sıkışma gecikmesi (prototipteki 4:36)
  faults: [{ op: 'OP050', atMin: -45, durSec: 276, code: 'PLC-HS' }],
  // OP080: J3'te düşük tork, tool kontrolü, retry OK
  torque: { op: 'OP080', afterMin: -12, joint: 'J3' },
  vision: [
    // Geçmişte açılıp re-QC ile kapanmış bir rework
    { afterMin: -150, decision: 'NOK', defectCode: 'VIS-SEAL-011' },
    // Geçmişte HOLD'a alınıp tekrar muayeneyle çözülmüş bir motor
    { afterMin: -75, decision: 'HOLD', defectCode: 'VIS-LBL-002' },
    // Şu an rework kuyruğunda olan motor
    { afterMin: -20, decision: 'NOK', defectCode: 'VIS-CBL-007' },
  ],
  // OP070: kablo demeti etiketi yanlış okutuldu (mükerrer S/N), operatör doğrusunu okuttu
  duplicateScan: { op: 'OP070', afterMin: -30, type: 'KBL' },
  // OP206: personel eksikliği → yavaşladı ve bir süre durdu; buffer min seviyenin altında
  subSlow: [{ op: 'OP206', fromMin: -150, toMin: 20, factor: 2.1 }],
  subStop: [{ op: 'OP206', fromMin: -100, toMin: -55, code: 'NO-OPR' }],
  // OP020 PLC'si ile bağlantı kopuk
  offline: [{ deviceId: 'PLC-TM50-OP020', fromMin: -5, toMin: 4 }],
  io: [{ op: 'OP070', signal: 'Konnektör sayımı', fromMin: -10, toMin: 5 }],
}

export const NO_STORIES: Stories = {
  slow: [],
  faults: [],
  torque: null,
  vision: [],
  duplicateScan: null,
  subSlow: [],
  subStop: [],
  offline: [],
  io: [],
}
