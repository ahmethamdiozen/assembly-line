import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Actor, RolePermissions } from '@/domain/rbac'
import type { Person } from '@/domain/types'

/**
 * Kimlik doğrulama (R-050, R-072, NFR-003/004). Lokal kullanıcı: personel no (ya da RFID kart no)
 * + PIN / şifre. Şifreler scrypt ile tuzlanıp saklanır; oturum anahtarının sadece hash'i tutulur.
 * Kurum kimlik sistemi (Active Directory) proje başında netleşecek (acik-konular.md F1).
 */

const SESSION_MS = 12 * 3600 * 1000
const MAX_FAILS = 5
const LOCK_MS = 5 * 60 * 1000

export class AuthError extends Error {}

/** Admin'in girdiği PIN / kart no geçersiz (400; oturumu düşürmez) */
export class CredentialError extends Error {}

/** Admin ekranında görünen kimlik bilgisi durumu (şifre hash'i asla dışarı çıkmaz) */
export interface Credential {
  rfid: string | null
  active: boolean
  locked: boolean
  failedAttempts: number
  updatedAt: number
}

export function hashSecret(secret: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(secret, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return timingSafeEqual(actual, expected)
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export interface AuthDeps {
  db: DatabaseSync
  people: () => Person[]
  rbac: () => RolePermissions
}

export class Auth {
  private readonly db: DatabaseSync
  private readonly people: () => Person[]
  private readonly rbac: () => RolePermissions

  constructor(deps: AuthDeps) {
    this.db = deps.db
    this.people = deps.people
    this.rbac = deps.rbac
  }

  /** Kimlik bilgisi olmayan kişilere ilk PIN / şifreyi atar (geliştirme tohumu). Atanan kişi sayısını döndürür. */
  seed(defaultSecret: string, now: number): number {
    const has = new Set((this.db.prepare('SELECT personnel_no FROM app_user').all() as { personnel_no: string }[]).map((r) => r.personnel_no))
    const ins = this.db.prepare('INSERT INTO app_user (personnel_no, rfid, secret_hash, active, updated_at) VALUES (?, ?, ?, 1, ?)')
    let n = 0
    for (const p of this.people()) {
      if (has.has(p.personnelNo)) continue
      ins.run(p.personnelNo, `RF${p.personnelNo.replace(/\D/g, '')}`, hashSecret(defaultSecret), now)
      n++
    }
    return n
  }

  /** Yeni kullanıcı kaydedilmeden önce PIN ve kartın geçerliliği */
  validateNew(personnelNo: string, secret: string, rfid: string | null): void {
    this.checkSecret(secret)
    this.checkRfid(personnelNo, rfid)
  }

  hasCredential(personnelNo: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM app_user WHERE personnel_no = ?').get(personnelNo)
  }

  private checkSecret(secret: string): void {
    if (secret.length < 4 || secret.length > 64) throw new CredentialError('PIN / şifre 4–64 karakter olmalı')
  }

  private checkRfid(personnelNo: string, rfid: string | null): string | null {
    const v = rfid?.trim() || null
    if (v === null) return null
    if (!/^[A-Za-z0-9-]{4,32}$/.test(v)) throw new CredentialError('Kart no 4–32 harf / rakam olmalı')
    const other = this.db.prepare('SELECT personnel_no FROM app_user WHERE rfid = ? AND personnel_no <> ?').get(v, personnelNo) as { personnel_no: string } | undefined
    if (other) throw new CredentialError(`Bu kart ${other.personnel_no} kullanıcısına tanımlı`)
    return v
  }

  /** Yeni kullanıcının kimlik bilgisi (admin ekranından) */
  createCredential(personnelNo: string, secret: string, rfid: string | null, now: number): void {
    this.checkSecret(secret)
    const card = this.checkRfid(personnelNo, rfid)
    this.db.prepare('INSERT INTO app_user (personnel_no, rfid, secret_hash, active, updated_at) VALUES (?, ?, ?, 1, ?)').run(personnelNo, card, hashSecret(secret), now)
  }

  /** PIN / şifre sıfırlama: kilit açılır, kullanıcının açık oturumları kapanır */
  setSecret(personnelNo: string, secret: string, now: number): void {
    this.checkSecret(secret)
    const r = this.db.prepare('UPDATE app_user SET secret_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE personnel_no = ?').run(hashSecret(secret), now, personnelNo)
    if (r.changes === 0) throw new CredentialError(`${personnelNo} için kimlik bilgisi yok`)
    this.revokeSessions(personnelNo)
  }

  setRfid(personnelNo: string, rfid: string | null, now: number): string | null {
    const card = this.checkRfid(personnelNo, rfid)
    this.db.prepare('UPDATE app_user SET rfid = ?, updated_at = ? WHERE personnel_no = ?').run(card, now, personnelNo)
    return card
  }

  /** Pasif kullanıcı giriş yapamaz; açık oturumları kapanır */
  setActive(personnelNo: string, active: boolean, now: number): void {
    this.db.prepare('UPDATE app_user SET active = ?, updated_at = ? WHERE personnel_no = ?').run(active ? 1 : 0, now, personnelNo)
    if (!active) this.revokeSessions(personnelNo)
  }

  unlock(personnelNo: string): void {
    this.db.prepare('UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE personnel_no = ?').run(personnelNo)
  }

  revokeSessions(personnelNo: string): void {
    this.db.prepare('DELETE FROM session WHERE personnel_no = ?').run(personnelNo)
  }

  credentials(now: number): Record<string, Credential> {
    const rows = this.db.prepare('SELECT personnel_no, rfid, active, failed_attempts, locked_until, updated_at FROM app_user').all() as {
      personnel_no: string
      rfid: string | null
      active: number
      failed_attempts: number
      locked_until: number | null
      updated_at: number
    }[]
    return Object.fromEntries(rows.map((r) => [r.personnel_no, { rfid: r.rfid, active: !!r.active, locked: !!r.locked_until && r.locked_until > now, failedAttempts: r.failed_attempts, updatedAt: r.updated_at }]))
  }

  actorOf(personnelNo: string): Actor | null {
    const p = this.people().find((x) => x.personnelNo === personnelNo)
    if (!p || p.active === false) return null
    return { id: p.personnelNo, name: p.name, role: p.role, permissions: this.rbac()[p.role] ?? [] }
  }

  /** Personel no ya da RFID kart no + PIN / şifre. Başarılıysa oturum anahtarı döner. */
  login(login: string, secret: string, now: number): { token: string; actor: Actor } {
    const id = login.trim()
    const u = this.db.prepare('SELECT personnel_no, secret_hash, active, failed_attempts, locked_until FROM app_user WHERE personnel_no = ? OR rfid = ?').get(id, id) as
      | { personnel_no: string; secret_hash: string; active: number; failed_attempts: number; locked_until: number | null }
      | undefined
    const generic = new AuthError('Personel no / kart ya da PIN hatalı')
    if (!u || !u.active) throw generic
    if (u.locked_until && u.locked_until > now) throw new AuthError(`Çok fazla hatalı deneme. ${Math.ceil((u.locked_until - now) / 60000)} dk sonra tekrar deneyin.`)
    if (!verifySecret(secret, u.secret_hash)) {
      const fails = u.failed_attempts + 1
      this.db.prepare('UPDATE app_user SET failed_attempts = ?, locked_until = ? WHERE personnel_no = ?').run(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : null, u.personnel_no)
      throw generic
    }
    const actor = this.actorOf(u.personnel_no)
    if (!actor) throw generic
    this.db.prepare('UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE personnel_no = ?').run(u.personnel_no)
    const token = randomBytes(32).toString('base64url')
    this.db.prepare('INSERT INTO session (token_hash, personnel_no, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(sha256(token), u.personnel_no, now, now + SESSION_MS, now)
    return { token, actor }
  }

  /** Geçerli oturumun kullanıcısı; süre her istekte uzar */
  session(token: string | undefined, now: number): Actor | null {
    if (!token) return null
    const h = sha256(token)
    const s = this.db.prepare('SELECT personnel_no, expires_at FROM session WHERE token_hash = ?').get(h) as { personnel_no: string; expires_at: number } | undefined
    if (!s || s.expires_at <= now) return null
    this.db.prepare('UPDATE session SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_MS, h)
    return this.actorOf(s.personnel_no)
  }

  logout(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM session WHERE token_hash = ?').run(sha256(token))
  }

  purgeExpired(now: number): void {
    this.db.prepare('DELETE FROM session WHERE expires_at <= ?').run(now)
  }
}
