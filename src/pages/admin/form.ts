import { useState } from 'react'
import { num } from '@/lib/format'

/** Admin formlarının ortak durum ve biçim yardımcıları */

export type SaveState = { ok: boolean; text: string } | null

/** Kaydetme işleminin durumu: meşgul, başarı ya da hata mesajı */
export function useSave(): { busy: boolean; msg: SaveState; run: (fn: () => Promise<unknown>, okText?: string) => Promise<boolean>; clear: () => void } {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<SaveState>(null)
  const run = async (fn: () => Promise<unknown>, okText = 'Kaydedildi; değişiklik audit kaydına yazıldı.') => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: okText })
      return true
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, msg, run, clear: () => setMsg(null) }
}

/** "730 gün" → "≈ 2 yıl" */
export const fmtDays = (d: number) => (d >= 365 ? `≈ ${num(d / 365, d % 365 ? 1 : 0)} yıl` : `${d} gün`)

