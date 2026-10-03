import { describe, expect, it } from 'vitest'
import { AlarmTransitionError, acknowledgeAlarm, assignAlarm, clearAlarm, closeAlarm, raiseAlarm } from './alarms'
import { defaultMaster, indexMaster } from './lineDef'
import { ReworkTransitionError, advanceRework, nextUserState, openRework, updateReworkFields } from './rework'
import { MemoryStore } from './store/MemoryStore'

const T = new Date(2026, 9, 3, 10).getTime()

describe('alarm yaşam döngüsü (R-038, R-039, AC-07)', () => {
  it('Detected → Acknowledged → Assigned → Closed; her adım olay olarak kaydedilir', () => {
    const ix = indexMaster(defaultMaster())
    const s = new MemoryStore()
    const a = raiseAlarm(s, ix, { code: 'PLC-FLT', key: 'k1', op: 'OP010', sn: null, message: 'arıza', t: T })!
    expect([a.status, a.severity, a.team, a.source]).toEqual(['detected', 'critical', 'Bakım Ekibi', 'PLC'])
    expect(a.id).toMatch(/^ALM-\d{6}$/)
    // Aynı koşul sürerken ikinci alarm açılmaz
    expect(raiseAlarm(s, ix, { code: 'PLC-FLT', key: 'k1', op: 'OP010', sn: null, message: 'arıza', t: T + 1 })!.id).toBe(a.id)

    expect(() => assignAlarm(s, a.id, 'Bakım Ekibi', 'Levent Acar', T + 1)).toThrow(AlarmTransitionError)
    expect(() => closeAlarm(s, a.id, 'Levent Acar', T + 1, null)).toThrow(AlarmTransitionError)
    acknowledgeAlarm(s, a.id, 'Levent Acar', T + 10)
    expect(() => acknowledgeAlarm(s, a.id, 'Levent Acar', T + 11)).toThrow(AlarmTransitionError)
    assignAlarm(s, a.id, 'Bakım Ekibi', 'Levent Acar', T + 20)
    assignAlarm(s, a.id, 'Hasan Yurt', 'Levent Acar', T + 30)
    const closed = closeAlarm(s, a.id, 'Hasan Yurt', T + 40, 'Fikstür sensörü değiştirildi')
    expect([closed.status, closed.ackBy, closed.assignee, closed.closedBy, closed.closeNote]).toEqual(['closed', 'Levent Acar', 'Hasan Yurt', 'Hasan Yurt', 'Fikstür sensörü değiştirildi'])
    expect(s.find('alarm_event', { where: { alarmId: a.id } }).map((e) => [e.action, e.by, e.detail])).toEqual([
      ['detected', null, 'arıza'],
      ['acknowledged', 'Levent Acar', null],
      ['assigned', 'Levent Acar', 'Bakım Ekibi'],
      ['assigned', 'Levent Acar', 'Hasan Yurt'],
      ['closed', 'Hasan Yurt', 'Fikstür sensörü değiştirildi'],
    ])
  })

  it('kapatılmış ama koşulu süren alarm yeniden açılmaz; koşul bitip tekrar oluşursa yeni alarm açılır', () => {
    const ix = indexMaster(defaultMaster())
    const s = new MemoryStore()
    const a = raiseAlarm(s, ix, { code: 'BUF-LOW', key: 'BUF|OP206', op: 'OP206', sn: null, message: '', t: T })!
    acknowledgeAlarm(s, a.id, 'x', T + 1)
    closeAlarm(s, a.id, 'x', T + 2, null)
    expect(raiseAlarm(s, ix, { code: 'BUF-LOW', key: 'BUF|OP206', op: 'OP206', sn: null, message: '', t: T + 3 })!.id).toBe(a.id)
    clearAlarm(s, 'BUF|OP206', T + 4)
    expect(raiseAlarm(s, ix, { code: 'BUF-LOW', key: 'BUF|OP206', op: 'OP206', sn: null, message: '', t: T + 5 })!.id).not.toBe(a.id)
  })

  it('kapalı kural alarm üretmez', () => {
    const m = defaultMaster()
    m.rules.find((r) => r.code === 'CYC-TAKT')!.enabled = false
    expect(raiseAlarm(new MemoryStore(), indexMaster(m), { code: 'CYC-TAKT', key: 'k', op: 'OP070', sn: null, message: '', t: T })).toBeNull()
  })
})

describe('rework akışı (R-034, R-035)', () => {
  it('kullanıcı sadece bir sonraki adıma taşıyabilir; alanlar doldurulur', () => {
    const s = new MemoryStore()
    const ix = indexMaster(defaultMaster())
    const rw = openRework(s, { sn: 'M1', qualityResultId: 'QC-1', defect: ix.defect.get('VIS-CBL-007')!, defectText: null, t: T, team: 'Kalite Ekibi', alarmKey: null })
    expect([rw.state, rw.defect, rw.sourceOp]).toEqual(['triage', 'Kablo demeti routing sapması', 'OP070'])
    expect(nextUserState('triage')).toBe('diagnosis')
    expect(nextUserState('ready')).toBeNull()
    expect(nextUserState('reqc')).toBeNull()
    expect(() => advanceRework(s, rw.id, 'bench', 'Aslı Tekin', T + 1, null)).toThrow(ReworkTransitionError)
    advanceRework(s, rw.id, 'diagnosis', 'Aslı Tekin', T + 1, null, { reworkOperator: 'Aylin Kaya' })
    updateReworkFields(s, rw.id, 'Aslı Tekin', T + 2, { rootCause: 'Kablo kelepçesi yanlış noktada' })
    advanceRework(s, rw.id, 'bench', 'Aylin Kaya', T + 3, null)
    const r = advanceRework(s, rw.id, 'ready', 'Aylin Kaya', T + 4, 'Routing düzeltildi')
    expect([r.state, r.reworkOperator, r.rootCause]).toEqual(['ready', 'Aylin Kaya', 'Kablo kelepçesi yanlış noktada'])
    expect(() => advanceRework(s, rw.id, 'reqc', 'Aylin Kaya', T + 5, null)).toThrow(ReworkTransitionError) // re-QC'yi sistem başlatır
    expect(s.find('rework_event', { where: { reworkId: rw.id } }).map((e) => `${e.from ?? '-'}→${e.to}`)).toEqual(['-→triage', 'triage→diagnosis', 'diagnosis→diagnosis', 'diagnosis→bench', 'bench→ready'])
  })
})
