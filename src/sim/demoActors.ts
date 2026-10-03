import { mulberry32, pick } from '@/lib/rng'
import { acknowledgeAlarm, assignAlarm, closeAlarm, raiseAlarm } from '@/domain/alarms'
import { audit } from '@/domain/commands'
import type { MasterIndex } from '@/domain/lineDef'
import { shiftOf } from '@/domain/shifts'
import type { Store } from '@/domain/store/Store'
import type { Alarm, Team } from '@/domain/types'

/**
 * SADECE DEMO: vardiya personelinin alarmlara verdiği tepkileri canlandırır. Koşulu bitmiş ve
 * yarım saatten eski alarmları vardiyanın üretim lideri onaylar, kuraldaki ekibe atar; ekipten biri
 * kapanış notuyla kapatır. Böylece demo ekranları gerçek bir vardiya gibi görünür. Kayıtlar normal
 * yaşam döngüsü fonksiyonlarından geçer ve audit'e yazılır. Sunucu modunda bu yoktur; orada
 * alarmları gerçek kullanıcılar yönetir.
 */

const MIN = 60_000
const AFTER_MS = 30 * MIN

const CLOSE_NOTES: Record<string, string[]> = {
  'PLC-FLT': ['Arıza giderildi, istasyon çalışıyor', 'Sensör temizlendi, kontrol edildi', 'Fikstür ayarı yapıldı'],
  'HB-LOSS': ['Ağ geçidi bağlantısı normale döndü', 'Switch portu yeniden başlatıldı'],
  'CYC-TAKT': ['Çevrim normale döndü; teknisyenle konuşuldu', 'Ek doğrulama adımı nedeniyle; izleniyor'],
  'TQ-NOK': ['Retry OK, tool kontrol edildi', 'Joint tekrar sıkıldı, sonuç OK'],
  'BUF-LOW': ['Buffer tamamlandı', 'Ön montaja ek personel verildi'],
  'TRC-DUP': ['Doğru etiket okutuldu, kayıt düzeltildi'],
  'VIS-NOK': ['Motor rework\'te, re-QC OK'],
  'VIS-HOLD': ['Tekrar muayenede OK'],
  'OP-NOK': ['Operasyon tekrarlandı, OK'],
}

const TEAM_PEOPLE: Record<Team, string[]> = {
  'Kalite Ekibi': ['Aslı Tekin', 'Furkan Bozkurt'],
  'Bakım Ekibi': ['Hasan Yurt', 'İrem Sezer'],
  Otomasyon: ['İrem Sezer', 'Hasan Yurt'],
  'Üretim Lideri': [],
  Lojistik: ['Lojistik'],
}

function supervisorAt(ix: MasterIndex, t: number): string {
  const sh = shiftOf(t, ix.master.config.shifts).id
  return ix.master.people.find((p) => p.role === 'supervisor' && p.shift === sh)?.name ?? 'Üretim Lideri'
}

/**
 * Demo açılışında iki Andon çağrısı: biri çözülmüş (OP206 buffer azalırken OP080'den malzeme talebi),
 * biri açık (OP070'te kablo routing için kalite desteği). Hikâyelerle uyumludur (src/sim/stories.ts).
 */
export function seedDemoAndons(store: Store, ix: MasterIndex, t0: number): void {
  if (store.count('andon') > 0) return
  const tech = (op: string) => ix.master.people.find((p) => p.role === 'technician' && p.station === op && p.shift === shiftOf(t0, ix.master.config.shifts).id)
  const mk = (op: string, type: 'material' | 'quality', message: string, t: number) => {
    const p = tech(op)
    if (!p) return null
    const actor = { id: p.personnelNo, name: p.name, role: p.role, permissions: [] }
    const code = type === 'material' ? 'AND-MAT' : 'AND-QUA'
    const text = type === 'material' ? 'malzeme talebi' : 'kalite desteği'
    const alarm = raiseAlarm(store, ix, { code, key: null, op, sn: null, message: `${op} Andon: ${text} (${p.name}): ${message}`, t })
    if (!alarm) return null
    const id = `AN-${String(store.nextSeq('andon')).padStart(6, '0')}`
    store.insert('andon', { id, t, op, type, message, by: p.name, alarmId: alarm.id })
    audit(store, actor, t, 'andon.create', 'andon', id, null, { op, type, message })
    return alarm
  }
  const first = mk('OP080', 'material', 'Marş dişlisi kiti azaldı', t0 - 40 * MIN)
  if (first) {
    const sup = supervisorAt(ix, first.t)
    acknowledgeAlarm(store, first.id, sup, first.t + 2 * MIN)
    assignAlarm(store, first.id, 'Lojistik', sup, first.t + 3 * MIN)
    closeAlarm(store, first.id, 'Lojistik', first.t + 14 * MIN, 'Kit OP080 supermarket noktasına getirildi')
  }
  mk('OP070', 'quality', 'Kablo routing için kalite onayı gerekiyor', t0 - 8 * MIN)
}

export function runDemoActors(store: Store, ix: MasterIndex, now: number): number {
  let n = 0
  for (const a of store.find('alarm', { notNull: ['clearedAt'], range: { field: 'clearedAt', lt: now - AFTER_MS } })) {
    if (a.status === 'closed') continue
    handle(store, ix, a)
    n++
  }
  return n
}

function handle(store: Store, ix: MasterIndex, a: Alarm): void {
  const rng = mulberry32(Number(a.id.replace(/\D/g, '')) * 2654435761)
  const sup = supervisorAt(ix, a.t)
  const actor = (name: string) => ({ id: 'demo', name })
  const ackAt = a.t + Math.round((1 + rng() * 5) * MIN)
  if (a.status === 'detected') {
    acknowledgeAlarm(store, a.id, sup, ackAt)
    audit(store, actor(sup), ackAt, 'alarm.ack', 'alarm', a.id, { status: 'detected' }, { status: 'acknowledged' })
  }
  const team = a.team
  const assignAt = ackAt + Math.round((1 + rng() * 2) * MIN)
  if (store.get('alarm', a.id)!.status === 'acknowledged') {
    assignAlarm(store, a.id, team, sup, assignAt)
    audit(store, actor(sup), assignAt, 'alarm.assign', 'alarm', a.id, { status: 'acknowledged' }, { status: 'assigned', assignee: team })
  }
  const closer = TEAM_PEOPLE[team].length ? pick(rng, TEAM_PEOPLE[team]) : sup
  const closeAt = Math.max(assignAt, a.clearedAt!) + Math.round((2 + rng() * 8) * MIN)
  const note = pick(rng, CLOSE_NOTES[a.code] ?? ['Kontrol edildi, kapatıldı'])
  closeAlarm(store, a.id, closer, closeAt, note)
  audit(store, actor(closer), closeAt, 'alarm.close', 'alarm', a.id, { status: 'assigned' }, { status: 'closed', closeNote: note })
}
