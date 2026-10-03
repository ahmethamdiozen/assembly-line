import { describe, expect, it } from 'vitest'
import { defaultMaster, indexMaster } from './lineDef'

const master = defaultMaster()
const ix = indexMaster(master)

describe('hat ana verisi URS ile birebir (AC-01)', () => {
  it('13 ana hat operasyonu, URS\'deki kod, ad ve tiplerle sıralı (R-011)', () => {
    expect(ix.main.map((s) => [s.op, s.name, s.type])).toEqual([
      ['OP005', 'Motor Bilgilerinin Yüklenmesi', 'auto'],
      ['OP010', 'Motor Bloğunun Bağlanması', 'manual'],
      ['OP015', 'Gasket Sealant Uygulanması', 'robot'],
      ['OP020', 'Motor Bloğu Kapatılması', 'auto'],
      ['OP030', 'Askı Grubu Montajı', 'manual'],
      ['OP040', 'Motor Döndürme', 'manual'],
      ['OP050', 'Silindir Bloğu Montajı', 'manual'],
      ['OP060', 'Hava Emiş Grubu Montajı', 'manual'],
      ['OP070', 'Kablo ve Alternatör Montajı', 'manual'],
      ['OP080', 'Marş Motoru Pervane Grubu Montajı', 'manual'],
      ['OP090', 'Egzoz Grubu', 'manual'],
      ['OP100', 'Kalite Kontrol', 'robot'],
      ['OP110', 'Motoru İndirme / Paketleme', 'manual'],
    ])
    expect(ix.main.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(ix.lastMainOp).toBe('OP110')
  })

  it('5 ön montaj operasyonu, URS\'deki kod ve adlarla (R-016)', () => {
    expect(ix.subs.map((s) => [s.op, s.name, s.type])).toEqual([
      ['OP201', 'Krank Seti Ön Montaj', 'manual'],
      ['OP202', 'Silindir Blok Seti Ön Montaj', 'manual'],
      ['OP203', 'Gaz Kelebeği Seti Ön Montaj', 'manual'],
      ['OP205', 'Motor Askı ve Devir Sensör Flanşı Ön Montaj', 'manual'],
      ['OP206', 'Marş Dişlisi Pervane Flanşı Ön Montaj', 'manual'],
    ])
  })

  it('her ön montaj bir ana hat operasyonunu besler (R-019)', () => {
    for (const sub of ix.subs) {
      const feed = ix.feedBySub.get(sub.op)!
      expect(ix.mainIndex.has(feed.mainOp)).toBe(true)
      expect(feed.bufferMin).toBeLessThan(feed.bufferMax)
    }
    expect(Object.fromEntries(master.subFeeds.map((f) => [f.subOp, f.mainOp]))).toEqual({ OP201: 'OP010', OP202: 'OP050', OP203: 'OP060', OP205: 'OP030', OP206: 'OP080' })
  })

  it('7 seri numaralı komponent URS\'deki operasyonlarda takılır (R-028)', () => {
    expect(Object.fromEntries(master.components.map((c) => [c.code, [c.name, c.installOp]]))).toEqual({
      GKS: ['Gaz Kelebeği Seti', 'OP060'],
      MBL: ['Motor Bloğu', 'OP010'],
      KRK: ['Krank Mili', 'OP010'],
      PCS: ['Piston Silindir Seti', 'OP050'],
      KBL: ['Kablo', 'OP070'],
      ALT: ['Alternatör', 'OP070'],
      MRS: ['Marş Motoru', 'OP080'],
    })
  })

  it('tutarlılık: benzersiz kodlar, kurallar, hata katalogları, kişiler', () => {
    const ops = master.stations.map((s) => s.op)
    expect(new Set(ops).size).toBe(ops.length)
    for (const d of master.defects) expect(ix.station.has(d.sourceOp)).toBe(true)
    for (const p of master.people) if (p.station) expect(ix.mainIndex.has(p.station)).toBe(true)
    // Her insanlı ana hat istasyonunda her vardiyada bir teknisyen var
    for (const st of ix.main.filter((s) => s.type === 'manual'))
      for (const sh of ['A', 'B', 'C']) expect(master.people.filter((p) => p.role === 'technician' && p.station === st.op && p.shift === sh)).toHaveLength(1)
    const personnel = master.people.map((p) => p.personnelNo)
    expect(new Set(personnel).size).toBe(personnel.length)
    for (const code of ['PLC-FLT', 'HB-LOSS', 'CYC-TAKT', 'TQ-NOK', 'VIS-NOK', 'VIS-HOLD', 'BUF-LOW', 'TRC-DUP', 'AND-MAT', 'AND-QUA', 'AND-PRD']) expect(ix.rule.has(code)).toBe(true)
  })

  it('defaultMaster bağımsız kopya döndürür', () => {
    const a = defaultMaster()
    a.stations[0].name = 'değişti'
    expect(defaultMaster().stations[0].name).toBe('Motor Bilgilerinin Yüklenmesi')
  })
})
