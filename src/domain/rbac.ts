import type { RoleId } from './types'

/**
 * Rol bazlı yetki (R-005–R-010, NFR-003). Varsayılan rol → izin eşlemesi URS §3'e göre kuruldu;
 * admin ekranından değiştirilebilir (Faz 6). Görüntüleme tüm giriş yapmış kullanıcılara açıktır;
 * izinler değişiklik yapan aksiyonları ve yönetim ekranlarını korur.
 */

export const PERMISSIONS = {
  'note.create': 'Teknisyen notu ekleme',
  'andon.create': 'Andon açma (malzeme, kalite, üretim desteği)',
  'motor.hold': 'Motoru HOLD\'a alma',
  'op.complete': 'Operasyonu tamamlama',
  'station.login': 'İstasyona giriş (teknisyen terminali)',
  'alarm.ack': 'Alarm onaylama',
  'alarm.assign': 'Alarm atama',
  'alarm.close': 'Alarm kapatma',
  'rework.manage': 'Rework adımlarını yönetme',
  'quality.decide': 'HOLD kararı (serbest bırak / rework\'e gönder)',
  'integration.pull': 'Collector\'ı elle çalıştırma',
  'system.view': 'Uygulama logları ve sistem bilgisi',
  'audit.view': 'Audit log görüntüleme',
  'admin.stations': 'İstasyon ana verisi',
  'admin.users': 'Kullanıcı ve rol yönetimi',
  'admin.routing': 'Ön montaj besleme ilişkileri',
  'admin.alarmRules': 'Alarm kuralları',
  'admin.integration': 'Entegrasyon ayarları',
  'admin.retention': 'Veri saklama ayarları',
} as const

export type Permission = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export type RolePermissions = Record<RoleId, Permission[]>

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  // R-006: istasyon / operasyon bilgisi, not, Andon, malzeme / kalite desteği, HOLD, operasyonu tamamlama
  technician: ['note.create', 'andon.create', 'motor.hold', 'op.complete', 'station.login'],
  // R-007: hat ve performans, alarm onay / atama / kapatma, rework takibi
  supervisor: ['note.create', 'andon.create', 'motor.hold', 'alarm.ack', 'alarm.assign', 'alarm.close', 'rework.manage'],
  // R-008: OP100 sonuçları, uygunsuzluk, görüntüler, rework ve tekrar kontrol
  quality: ['note.create', 'alarm.ack', 'alarm.assign', 'alarm.close', 'rework.manage', 'quality.decide', 'motor.hold'],
  // R-009: PLC / ekipman, sensör / IO, alarmlar, entegrasyon sağlığı
  maintenance: ['note.create', 'alarm.ack', 'alarm.assign', 'alarm.close', 'integration.pull', 'system.view'],
  // R-010: tüm yönetim
  admin: [...ALL_PERMISSIONS],
}

/** İşlemi yapan kullanıcı */
export interface Actor {
  id: string
  name: string
  role: RoleId
  permissions: Permission[]
}

export class ForbiddenError extends Error {
  readonly permission: Permission
  constructor(permission: Permission) {
    super(`Bu işlem için yetkiniz yok: ${PERMISSIONS[permission]}`)
    this.permission = permission
  }
}

/**
 * Kayıtlı rol izinlerine, kaydedildikleri sırada bilinmeyen (sonradan eklenen) izinlerin
 * varsayılanlarını ekler; admin'in bilerek kaldırdığı izinlere dokunmaz.
 */
export function mergeNewPermissions(stored: RolePermissions, known: string[], defaults: RolePermissions = DEFAULT_ROLE_PERMISSIONS): RolePermissions {
  const fresh = ALL_PERMISSIONS.filter((p) => !known.includes(p))
  if (!fresh.length) return stored
  const out = { ...stored }
  for (const role of Object.keys(defaults) as (keyof RolePermissions)[]) {
    out[role] = [...new Set([...(stored[role] ?? []), ...defaults[role].filter((p) => fresh.includes(p))])]
  }
  return out
}

export function can(actor: Actor | null | undefined, p: Permission): boolean {
  return !!actor && actor.permissions.includes(p)
}

export function requirePermission(actor: Actor, p: Permission): void {
  if (!can(actor, p)) throw new ForbiddenError(p)
}
