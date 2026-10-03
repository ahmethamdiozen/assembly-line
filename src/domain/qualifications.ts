import type { Person, Station } from './types'

/**
 * İstasyon yetkinlik kuralı (R-052). Varsayım: insanlı istasyonda en az "Montaj L2", sıkma yapılan
 * istasyonda ayrıca "Torque Qualified" gerekir (acik-konular.md). Seviyeli yetkinliklerde üst seviye
 * alt seviyeyi karşılar (Montaj L3 ⊇ Montaj L2).
 */

export function requiredQualifications(st: Station): string[] {
  if (st.type !== 'manual') return []
  return st.tightening ? ['Montaj L2', 'Torque Qualified'] : ['Montaj L2']
}

const level = (q: string) => {
  const m = q.match(/^(.*) L(\d+)$/)
  return m ? { base: m[1], n: Number(m[2]) } : null
}

export function hasQualification(p: Person, required: string): boolean {
  const r = level(required)
  return p.qualifications.some((q) => {
    if (q === required) return true
    const l = level(q)
    return !!(r && l && l.base === r.base && l.n >= r.n)
  })
}

export function missingQualifications(p: Person, st: Station): string[] {
  return requiredQualifications(st).filter((q) => !hasQualification(p, q))
}
