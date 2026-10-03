import type { FastifyRequest } from 'fastify'

/** API'nin istek gövdesi ve hata yardımcıları */

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Body = Record<string, unknown>

export const body = (req: FastifyRequest): Body => (req.body && typeof req.body === 'object' ? (req.body as Body) : {})

export function str(b: Body, k: string, required = true): string {
  const v = b[k]
  if (typeof v === 'string') return v
  if (!required && (v === undefined || v === null)) return ''
  throw new HttpError(400, `"${k}" alanı gerekli`)
}

export const optStr = (b: Body, k: string) => (typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string) : null)

export function oneOf<T extends string>(v: string, allowed: readonly T[], k: string): T {
  if (!(allowed as readonly string[]).includes(v)) throw new HttpError(400, `"${k}" geçersiz: ${v}`)
  return v as T
}

export function obj(b: Body, k: string): Body {
  const v = b[k]
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Body
  throw new HttpError(400, `"${k}" nesne olmalı`)
}

/** Sadece izin verilen alanlar geçer (gövdedeki fazlalık ana veriye yazılmasın) */
export function pick<T extends string>(o: Body, keys: readonly T[]): Partial<Record<T, unknown>> {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) as Partial<Record<T, unknown>>
}
