import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, mergeNewPermissions } from './rbac'
import type { RolePermissions } from './rbac'

describe('izinlerin sürümler arası taşınması', () => {
  it('yeni izinler varsayılan rollerine eklenir; admin\'in kaldırdığı eski izinler geri gelmez', () => {
    const fresh = ['system.view', 'station.login']
    const known = ALL_PERMISSIONS.filter((p) => !fresh.includes(p))
    const strip = (xs: string[]) => xs.filter((p) => !fresh.includes(p)) as RolePermissions['admin']
    const stored: RolePermissions = {
      technician: strip(DEFAULT_ROLE_PERMISSIONS.technician),
      // admin supervisor'dan not yazmayı kaldırmış
      supervisor: strip(DEFAULT_ROLE_PERMISSIONS.supervisor).filter((p) => p !== 'note.create'),
      quality: strip(DEFAULT_ROLE_PERMISSIONS.quality),
      maintenance: strip(DEFAULT_ROLE_PERMISSIONS.maintenance),
      admin: strip(DEFAULT_ROLE_PERMISSIONS.admin),
    }
    const m = mergeNewPermissions(stored, known)
    expect(m.technician).toContain('station.login')
    expect(m.maintenance).toContain('system.view')
    expect(m.admin).toEqual(expect.arrayContaining(fresh))
    expect(m.supervisor).not.toContain('note.create')
    expect(m.quality).not.toContain('system.view')
    expect(mergeNewPermissions(m, ALL_PERMISSIONS)).toBe(m)
  })
})
