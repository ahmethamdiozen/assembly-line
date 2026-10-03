/** Türkçe sayı / süre / zaman biçimleri. Tüm ekranlar bunları kullanır. */

export const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d).replace('.', ',')}` : '—')

export const num = (x: number, d = 0) =>
  Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

/** Dakika cinsinden süre: "7,5 dk" */
export const minutes = (min: number, d = 1) => (Number.isFinite(min) ? `${num(min, d)} dk` : '—')

/** Saniye cinsinden süre: "45 sn", "12 dk", "2 sa 5 dk" */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} sa ${m} dk`
  if (m > 0) return `${m} dk`
  return `${s} sn`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Yerel saat "14:32" */
export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Yerel saat "14:32:10" */
export const hms = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Bugünse "14:32", değilse "2 Eki 14:32" (dünden kalan kayıt bugünküyle karışmasın) */
export function whenShort(t: number, now: number): string {
  const a = new Date(t)
  if (a.toDateString() === new Date(now).toDateString()) return hhmm(t)
  return `${a.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${hhmm(t)}`
}

/** Geçen süre: "12 sn önce", "3 dk önce", "2 sa önce" */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} sn önce`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} dk önce` : `${Math.round(m / 60)} sa önce`
}
