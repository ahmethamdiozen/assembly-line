import type { TableName, Tables } from '@/domain/store/Store'

/**
 * Uygulama veritabanının (SQLite) sütun tanımları. Tip, src/domain/store/Store.ts'teki satır
 * tiplerine bağlıdır: bir alan eklenip burada sütunu yazılmazsa derleme hata verir.
 */

export type Kind = 'text' | 'int' | 'real' | 'bool'

type Columns = { [K in TableName]: { [F in keyof Tables[K]]-?: Kind } }

export const COLUMNS: Columns = {
  motor: { id: 'text', workOrder: 'text', variant: 'text', createdAt: 'int', status: 'text', currentOp: 'text', firstPassOk: 'bool', completedAt: 'int' },
  motor_op: { id: 'text', sn: 'text', op: 'text', start: 'int', end: 'int', cycleSec: 'real', operatorNo: 'text', result: 'text', attempt: 'int' },
  component_install: { id: 'text', sn: 'text', type: 'text', componentSn: 'text', lot: 'text', op: 'text', t: 'int', operatorNo: 'text', replacedAt: 'int' },
  tightening: {
    id: 'text',
    t: 'int',
    sn: 'text',
    op: 'text',
    controllerId: 'text',
    toolId: 'text',
    pset: 'text',
    joint: 'text',
    targetNm: 'real',
    minNm: 'real',
    maxNm: 'real',
    torqueNm: 'real',
    angleDeg: 'real',
    result: 'text',
  },
  quality_result: { id: 'text', sn: 'text', t: 'int', decision: 'text', defectCode: 'text', defectText: 'text', attempt: 'int', inspectionId: 'text' },
  quality_image: { id: 'text', resultId: 'text', sn: 'text', t: 'int', view: 'text', path: 'text' },
  station_span: { id: 'text', op: 'text', start: 'int', end: 'int', state: 'text', code: 'text', text: 'text' },
  sub_sample: { id: 'text', op: 'text', t: 'int', producedTotal: 'int', nokTotal: 'int', bufferQty: 'int' },
  device: { id: 'text', type: 'text', op: 'text', lastT: 'int', online: 'bool', lastOnlineT: 'int' },
  io_state: { id: 'text', op: 'text', signal: 'text', value: 'bool', t: 'int' },
  alarm: {
    id: 'text',
    key: 'text',
    code: 'text',
    source: 'text',
    severity: 'text',
    op: 'text',
    sn: 'text',
    message: 'text',
    t: 'int',
    clearedAt: 'int',
    status: 'text',
    team: 'text',
    assignee: 'text',
    ackBy: 'text',
    ackAt: 'int',
    assignedAt: 'int',
    closedBy: 'text',
    closedAt: 'int',
    closeNote: 'text',
    escalatedAt: 'int',
  },
  alarm_event: { id: 'text', alarmId: 'text', t: 'int', action: 'text', by: 'text', detail: 'text' },
  rework: {
    id: 'text',
    sn: 'text',
    qualityResultId: 'text',
    sourceOp: 'text',
    category: 'text',
    defectCode: 'text',
    defect: 'text',
    rootCause: 'text',
    priority: 'text',
    team: 'text',
    reworkOperator: 'text',
    state: 'text',
    openedAt: 'int',
    closedAt: 'int',
    attempt: 'int',
    alarmKey: 'text',
  },
  rework_event: { id: 'text', reworkId: 'text', t: 'int', from: 'text', to: 'text', by: 'text', note: 'text' },
  motor_hold: { id: 'text', sn: 'text', t: 'int', source: 'text', reason: 'text', op: 'text', by: 'text', releasedAt: 'int', releasedBy: 'text', resolution: 'text', alarmKey: 'text' },
  note: { id: 'text', t: 'int', op: 'text', type: 'text', text: 'text', author: 'text', sn: 'text', alarmId: 'text', topic: 'text' },
  andon: { id: 'text', t: 'int', op: 'text', type: 'text', message: 'text', by: 'text', alarmId: 'text' },
  audit_log: { id: 'text', t: 'int', user: 'text', action: 'text', entity: 'text', entityId: 'text', before: 'text', after: 'text' },
  station_login: { id: 'text', op: 'text', personnelNo: 'text', name: 'text', shiftId: 'text', loginAt: 'int', logoutAt: 'int', rosterMatch: 'bool' },
  op_confirmation: { id: 'text', t: 'int', op: 'text', sn: 'text', personnelNo: 'text', name: 'text', note: 'text' },
}

/** Sorgu desenlerine göre indeksler */
export const INDEXES: { [K in TableName]?: (keyof Tables[K])[][] } = {
  motor: [['status']],
  motor_op: [['sn', 'op'], ['op', 'start'], ['op', 'end'], ['end'], ['start']],
  component_install: [['sn', 'type'], ['componentSn']],
  tightening: [['sn', 'op'], ['t'], ['result', 't']],
  quality_result: [['sn'], ['inspectionId'], ['t']],
  quality_image: [['resultId'], ['sn']],
  station_span: [['op', 'end'], ['op', 'start']],
  sub_sample: [['op', 't']],
  device: [['op']],
  io_state: [['op']],
  alarm: [['key', 'clearedAt'], ['op', 't'], ['sn'], ['t'], ['clearedAt'], ['status']],
  alarm_event: [['alarmId'], ['t']],
  rework: [['sn'], ['state']],
  rework_event: [['reworkId'], ['t']],
  motor_hold: [['sn'], ['releasedAt']],
  note: [['op', 't'], ['t']],
  andon: [['op', 't']],
  audit_log: [['t'], ['entity', 'entityId']],
  station_login: [['op', 'logoutAt'], ['personnelNo', 'logoutAt']],
  op_confirmation: [['op', 't'], ['sn']],
}

const SQL_TYPE: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER' }

export const q = (name: string) => `"${name.replace(/"/g, '""')}"`

/** Uygulama tablolarını ve indekslerini kuran DDL */
export function storeDdl(): string {
  const out: string[] = []
  for (const [table, cols] of Object.entries(COLUMNS) as [TableName, Record<string, Kind>][]) {
    const defs = Object.entries(cols).map(([c, k]) => (c === 'id' ? `${q(c)} TEXT PRIMARY KEY` : `${q(c)} ${SQL_TYPE[k]}`))
    out.push(`CREATE TABLE IF NOT EXISTS ${q(table)} (${defs.join(', ')});`)
    for (const idx of (INDEXES[table] ?? []) as string[][]) out.push(`CREATE INDEX IF NOT EXISTS ${q(`ix_${table}_${idx.join('_')}`)} ON ${q(table)} (${idx.map(q).join(', ')});`)
  }
  out.push('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);')
  return out.join('\n')
}
