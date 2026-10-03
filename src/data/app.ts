import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Overview, StationDetail } from '@/domain/overview'
import type { Actor, Permission } from '@/domain/rbac'
import { ApiBackend } from './api/ApiBackend'
import type { AuthState, Backend, ConnStatus } from './Backend'
import { DemoBackend } from './demo/DemoBackend'
import { IS_DEMO } from './mode'

/**
 * Tek veri kaynağı örneği (HMR'de yeniden oluşmasın).
 * Demo derlemesinde tüm zincir tarayıcıda çalışır; normalde sunucu API'si kullanılır.
 */
const g = globalThis as unknown as { __tm50Backend?: Backend }
export const backend: Backend = (g.__tm50Backend ??= IS_DEMO ? new DemoBackend() : new ApiBackend())

/** Arayüz özet ve ayrıntıları bu aralıkla yeniler (sunucu modunda REST yoklama) */
export const POLL_MS = 15_000

interface AppState {
  ready: boolean
  auth: AuthState
  user: Actor | null
  /** Veri her değiştiğinde artar (collector turu, kullanıcı komutu) */
  dataVersion: number
  /** Uygulama saati, saniyede bir */
  now: number
  conn: ConnStatus
  /** Kontrol Merkezi'nde seçili istasyon */
  selectedOp: string | null
  select: (op: string) => void
}

export const useApp = create<AppState>((set) => ({
  ready: backend.ready(),
  auth: backend.authState(),
  user: backend.user(),
  dataVersion: 0,
  now: backend.now(),
  conn: backend.status(),
  selectedOp: null,
  select: (op) => set({ selectedOp: op }),
}))

backend.subscribe((e) =>
  useApp.setState((s) => ({
    ready: backend.ready(),
    auth: backend.authState(),
    user: backend.user(),
    now: backend.now(),
    conn: backend.status(),
    dataVersion: e === 'data' || e === 'auth' ? s.dataVersion + 1 : s.dataVersion,
  })),
)
backend.start()

/** Veri değişince ve POLL_MS'de bir yenilenen sorgu */
export function usePolled<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const version = useApp((s) => s.dataVersion)
  const ready = useApp((s) => s.ready)
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    const run = () =>
      void load()
        .then((v) => alive && setValue(v))
        .catch(() => {
          /* bağlantı hatası durum göstergesinde görünür; eldeki veri ekranda kalır */
        })
    run()
    const id = setInterval(run, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready, ...deps])
  return value
}

export function useOverview(): Overview | null {
  return usePolled(() => backend.overview(), [])
}

export function useStationDetail(op: string | null): StationDetail | null {
  return usePolled(() => (op ? backend.stationDetail(op) : Promise.resolve(null)), [op])
}

/** Giriş yapan kullanıcının izni var mı (arayüzde aksiyonları göstermek için; asıl kontrol komutta) */
export function useCan(p: Permission): boolean {
  const user = useApp((s) => s.user)
  return !!user?.permissions.includes(p)
}
