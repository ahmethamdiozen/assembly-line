import { raiseAlarm } from './alarms'
import type { MasterIndex } from './lineDef'
import type { Store } from './store/Store'
import type { Note, NoteType } from './types'

/** Teknisyen notu (R-025). Faz 3'te yetki kontrolü ve audit kaydı bu fonksiyonun etrafına eklenir. */

export interface NoteInput {
  op: string
  type: NoteType
  text: string
  author: string
  sn?: string | null
  alarmId?: string | null
  topic?: string | null
}

export class NoteError extends Error {}

export const NOTE_TYPE_LABEL: Record<NoteType, string> = { info: 'Bilgi', warning: 'Uyarı', error: 'Hata' }

export function addNote(store: Store, ix: MasterIndex, input: NoteInput, t: number): Note {
  const text = input.text.trim()
  if (!text) throw new NoteError('Not metni boş olamaz')
  if (!ix.station.has(input.op)) throw new NoteError(`Bilinmeyen istasyon: ${input.op}`)
  if (!input.author.trim()) throw new NoteError('Not yazarı belirtilmeli')
  if (input.alarmId && !store.get('alarm', input.alarmId)) throw new NoteError(`Alarm bulunamadı: ${input.alarmId}`)
  const note: Note = {
    id: `NT-${String(store.nextSeq('note')).padStart(6, '0')}`,
    t,
    op: input.op,
    type: input.type,
    text,
    author: input.author.trim(),
    sn: input.sn ?? null,
    alarmId: input.alarmId ?? null,
    topic: input.topic?.trim() || null,
  }
  store.insert('note', note)
  // Prototipteki kural: "Teknisyen hata notu → alarm üret"
  if (note.type === 'error') {
    raiseAlarm(store, ix, { code: 'NOTE-ERR', key: null, op: note.op, sn: note.sn, message: `${note.op} teknisyen hata notu (${note.author}): ${text.length > 90 ? `${text.slice(0, 90)}…` : text}`, t })
  }
  return note
}
