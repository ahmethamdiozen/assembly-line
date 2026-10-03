import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        ghost: 'text-fg-2 hover:bg-wash hover:text-fg',
        outline: 'border border-border-strong bg-card text-fg hover:bg-wash',
        primary: 'border border-accent-border bg-accent-bg text-info-text hover:bg-info-bg',
        danger: 'border border-critical/40 bg-critical-bg text-critical-text hover:bg-critical-bg/70',
      },
      size: { sm: 'h-8 px-2.5', md: 'h-10 px-3.5 text-sm', icon: 'h-8 w-8' },
    },
    defaultVariants: { variant: 'ghost', size: 'sm' },
  },
)

/** Varsayılan tip "button": form içinde yanlışlıkla gönderim yapmasın */
export function Button({ className, variant, size, type = 'button', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...p} />
}
