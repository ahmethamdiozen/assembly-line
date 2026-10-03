import { CircleCheck, Lock, OctagonX } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useCan } from '@/data/app'
import type { Permission } from '@/domain/rbac'
import { PERMISSIONS } from '@/domain/rbac'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SaveState } from './form'

/** Admin ekranlarının ortak form parçaları */

export const inputCls = 'h-9 w-full rounded-md border border-border-strong bg-card px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-accent disabled:bg-neutral disabled:text-fg-3'

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...p} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, 'pr-6', className)} {...p}>
      {children}
    </select>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-fg-3">{hint}</span>}
    </label>
  )
}

/** Sayı alanı: boş bırakılırsa NaN döner (doğrulama sunucuda / komutta) */
export function NumberInput({ value, onChange, step = 1, min, max, unit, className, disabled, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; className?: string; disabled?: boolean; label?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        className={cn(inputCls, 'display text-right text-[14px]')}
      />
      {unit && <span className="shrink-0 text-[12px] text-fg-2">{unit}</span>}
    </span>
  )
}

export function SaveMsg({ msg, className }: { msg: SaveState; className?: string }) {
  if (!msg) return null
  return (
    <p role={msg.ok ? 'status' : 'alert'} className={cn('flex items-start gap-1.5 text-[12.5px]', msg.ok ? 'text-good-text' : 'text-critical-text', className)}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0" /> : <OctagonX className="mt-0.5 size-3.5 shrink-0" />}
      {msg.text}
    </p>
  )
}

/** İzin yoksa içerik yerine açıklama gösterir */
export function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const ok = useCan(perm)
  if (ok) return <>{children}</>
  return (
    <Card className="flex items-center gap-3 px-5 py-6 text-[13.5px] text-fg-2">
      <Lock className="size-5 shrink-0" /> Bu bölüm için "{PERMISSIONS[perm]}" izni gerekiyor (varsayılan olarak Admin rolünde).
    </Card>
  )
}

export const th = 'py-1.5 pr-3 text-left text-[11.5px] font-medium text-fg-2'
export const td = 'py-1.5 pr-3 align-middle'
