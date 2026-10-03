import { describe, expect, it } from 'vitest'
import type { MotorOp } from '../types'
import type { Store } from './Store'

/**
 * Store arayüzünün davranış sözleşmesi. Bellek deposu ve SQLite deposu aynı testlerden geçer;
 * böylece demo ile sunucu modu aynı sonuçları verir.
 */

const op = (id: string, sn: string, station: string, start: number, end: number | null = null): MotorOp => ({
  id,
  sn,
  op: station,
  start,
  end,
  cycleSec: end === null ? null : (end - start) / 1000,
  operatorNo: null,
  result: end === null ? null : 'OK',
  attempt: 1,
})

export function storeContract(name: string, make: () => Store): void {
  describe(`Store sözleşmesi: ${name}`, () => {
    it('ekler, bulur, günceller; dönen eski satır değişmez; çift ekleme hata verir', () => {
      const s = make()
      s.insert('motor_op', op('a', 'M1', 'OP010', 100))
      s.insert('motor_op', op('b', 'M2', 'OP010', 200))
      s.insert('motor_op', op('c', 'M1', 'OP015', 300))
      expect(s.find('motor_op', { where: { sn: 'M1' } }).map((r) => r.id)).toEqual(['a', 'c'])
      expect(s.find('motor_op', { where: { op: 'OP010' }, isNull: ['end'] }).map((r) => r.id)).toEqual(['a', 'b'])
      const before = s.get('motor_op', 'a')!
      const after = s.update('motor_op', 'a', { op: 'OP020', end: 150 })
      expect(before.op).toBe('OP010')
      expect([after.op, after.end, after.sn]).toEqual(['OP020', 150, 'M1'])
      expect(s.find('motor_op', { where: { op: 'OP010' } }).map((r) => r.id)).toEqual(['b'])
      expect(() => s.insert('motor_op', op('a', 'X', 'OP010', 1))).toThrow()
      expect(() => s.update('motor_op', 'yok', { end: 1 })).toThrow()
      expect(s.get('motor_op', 'yok')).toBeUndefined()
    })

    it('aralık, "in", sıralama (null\'lar sonda, eşitlikte ekleme sırası), sayfalama', () => {
      const s = make()
      for (let i = 0; i < 10; i++) s.insert('motor_op', op(`r${i}`, `M${i % 3}`, 'OP010', i * 10, i % 4 === 0 ? null : i * 10 + 5))
      expect(s.find('motor_op', { range: { field: 'start', gte: 20, lt: 50 } }).map((r) => r.start)).toEqual([20, 30, 40])
      expect(s.find('motor_op', { range: { field: 'end', gte: 0 } }).length).toBe(7)
      expect(s.count('motor_op', { in: { sn: ['M0', 'M1'] } })).toBe(7)
      expect(s.count('motor_op', { in: { sn: [] } })).toBe(0)
      expect(s.find('motor_op', { orderBy: 'start', desc: true, limit: 2 }).map((r) => r.start)).toEqual([90, 80])
      expect(s.find('motor_op', { orderBy: 'start', offset: 8 }).map((r) => r.start)).toEqual([80, 90])
      expect(s.find('motor_op', { orderBy: 'end', desc: true }).map((r) => r.id)).toEqual(['r9', 'r7', 'r6', 'r5', 'r3', 'r2', 'r1', 'r0', 'r4', 'r8'])
      expect(s.find('motor_op', { orderBy: 'end' }).map((r) => r.id).slice(-3)).toEqual(['r0', 'r4', 'r8'])
      expect(s.first('motor_op', { where: { sn: 'M2' }, desc: true })!.id).toBe('r8')
      expect(s.find('motor_op', { where: { sn: 'M1' }, notNull: ['end'], orderBy: 'start', desc: true, limit: 1 })[0].id).toBe('r7')
    })

    it('"içerir" araması büyük / küçük harf duyarsız; % ve _ karakterleri düz metin sayılır', () => {
      const s = make()
      s.insert('motor_op', op('x1', 'TM50-261003-0105', 'OP010', 1))
      s.insert('motor_op', op('x2', 'TM50-261003-0110', 'OP010', 2))
      s.insert('motor_op', op('x3', 'TM50_261003%0110', 'OP010', 3))
      expect(s.find('motor_op', { contains: { field: 'sn', value: '0110' } }).map((r) => r.id)).toEqual(['x2', 'x3'])
      expect(s.find('motor_op', { contains: { field: 'sn', value: 'tm50-261003-01' } }).map((r) => r.id)).toEqual(['x1', 'x2'])
      expect(s.find('motor_op', { contains: { field: 'sn', value: '_261003%' } }).map((r) => r.id)).toEqual(['x3'])
      expect(s.count('motor_op', { contains: { field: 'sn', value: 'yok' } })).toBe(0)
    })

    it('boolean ve null alanlar korunur; upsert ekleme sırasını bozmaz', () => {
      const s = make()
      s.upsert('device', { id: 'D1', type: 'plc', op: 'OP010', lastT: 1, online: true, lastOnlineT: 1 })
      s.upsert('device', { id: 'D2', type: 'tool', op: 'OP010', lastT: 1, online: false, lastOnlineT: null })
      s.upsert('device', { id: 'D1', type: 'plc', op: 'OP010', lastT: 2, online: false, lastOnlineT: 1 })
      expect(s.find('device').map((d) => [d.id, d.online, d.lastT, d.lastOnlineT])).toEqual([
        ['D1', false, 2, 1],
        ['D2', false, 1, null],
      ])
      expect(s.find('device', { where: { online: false } }).length).toBe(2)
      s.update('device', 'D2', { online: true })
      expect(s.find('device', { where: { online: true } }).map((d) => d.id)).toEqual(['D2'])
    })

    it('anahtar-değer ve sayaçlar', () => {
      const s = make()
      expect(s.kvGet('x')).toBeNull()
      s.kvSet('x', { a: 1, b: [1, 2] })
      expect(s.kvGet('x')).toEqual({ a: 1, b: [1, 2] })
      expect([s.nextSeq('alarm'), s.nextSeq('alarm'), s.nextSeq('rework')]).toEqual([1, 2, 1])
    })
  })
}
