import { between, gaussian, mulberry32, pick } from '@/lib/rng'
import type { Rng } from '@/lib/rng'
import { defaultMaster, indexMaster, operatorAt } from '@/domain/lineDef'
import type { MasterIndex } from '@/domain/lineDef'
import { dayStartOf, shiftOf, shiftWindow } from '@/domain/shifts'
import type { DefectDef, MasterData, Station, SubFeed } from '@/domain/types'
import { PLC_STATE } from '@/pipeline/rows'
import type { RawDeviceType, RawSink } from '@/pipeline/rows'
import { DEFAULT_STORIES } from './stories'
import type { Stories } from './stories'

/**
 * HAT SİMÜLATÖRÜ — fabrika tarafı (PLC, tork controller'ları, vision, ağ geçidi). Gerçek veri
 * geldiğinde kalkar. Fabrikanın SQL Server'ına yazacağı satırları üretir; nedenleri yazmaz.
 *
 * Model: asenkron palet akışı (her istasyonda en fazla 1 motor). İstasyon işini bitirince motor,
 * sıradaki istasyon boşsa ona geçer (transfer 12 sn); değilse istasyon "blocked" bekler. OP005 boşaldıkça
 * yeni motor (yeni seri no) başlatır. Ön montaj kiti kullanan istasyon, kit yoksa "starved" bekler.
 * OP100'de NOK / HOLD olan motor hattan side-loop'a çıkar, bir süre sonra OP100'e tekrar girer (re-QC),
 * OP100 boşaldığında re-QC motoru hattan gelen motora göre önceliklidir.
 *
 * Deterministiktir: aynı tohum, t0 ve başlangıçla her yerde (tarayıcı, sunucu, testler) aynı satırlar
 * üretilir; `advance` kaç parçada çağrılırsa çağrılsın sonuç aynıdır.
 */

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const STEP = SEC
const TRANSFER_MS = 12 * SEC
/** Palet istasyondan çıkana kadar istasyon dolu sayılır; boşalma zinciri kademeli ilerler */
const EXIT_MS = 6 * SEC
const RETRY_MS = 25 * SEC
const MTBF_MS = 14 * HOUR
const QC_VIEWS = ['ÖN', 'ARKA', 'SİLİNDİR 1-2', 'SİLİNDİR 3-4', 'ÜST', 'PERVANE TARAFI']

export interface SimOptions {
  /** Hikâyelerin göreli olduğu an (genelde simülatörün ilk başlatıldığı an); dakikaya hizalanır */
  t0: number
  /** Geçmişin başladığı an (varsayılan t0 − 24 sa); hat bu anda boş başlar */
  startT?: number
  seed?: number
  master?: MasterData
  stories?: Stories
}

type Phase = 'empty' | 'exiting' | 'arriving' | 'waitKit' | 'working' | 'fault' | 'done'

interface SimMotor {
  sn: string
  qcAttempts: number
}

type Pending =
  | { t: number; kind: 'scan'; type: string; serial: string; lot: string }
  | { t: number; kind: 'tq'; joint: string; torque: number; angle: number; ok: boolean }
  | { t: number; kind: 'fault'; code: string; durMs: number }

interface MainRt {
  st: Station
  i: number
  rng: Rng
  motor: SimMotor | null
  phase: Phase
  until: number
  pending: Pending[]
  faultCode: string | null
  faultStart: number
  faultUntil: number
  remainingMs: number
  nextFaultAt: number
  reported: string
}

interface SubRt {
  st: Station
  feed: SubFeed
  rng: Rng
  buffer: number
  produced: number
  nok: number
  day: number
  phase: 'working' | 'blocked' | 'stopped'
  until: number
  /** Durdurulduğunda kalan iş (blocked iken durduysa −1) */
  remainingMs: number
  stopCode: string | null
  reported: string
}

interface Device {
  id: string
  type: RawDeviceType
  op: string
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const yymmdd = (t: number) => {
  const d = new Date(t)
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
const isoDate = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const slug = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]!)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
const roundSec = (ms: number) => Math.round(ms / SEC) * SEC
const expMs = (rng: Rng, mean: number) => -Math.log(1 - rng()) * mean
const noise = (rng: Rng, sigma: number) => Math.exp(gaussian(rng) * sigma)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export const alignMinute = (t: number) => Math.floor(t / MIN) * MIN

export class LineSim {
  readonly t0: number
  readonly startT: number
  private t: number
  private readonly ix: MasterIndex
  private readonly stories: Stories
  private readonly seed: number
  private readonly mains: MainRt[]
  private readonly subs = new Map<string, SubRt>()
  private readonly devices: Device[] = []
  private readonly visionRng: Rng
  private readonly serialRng: Rng
  private reqc: { motor: SimMotor; returnAt: number }[] = []
  private serialSeq = new Map<string, number>()
  private compSeq = new Map<string, number>()
  private compBase = new Map<string, number>()
  private lastComp = new Map<string, string>()
  private personFactor = new Map<string, number>()
  private consumed = new Set<string>()

  constructor(opts: SimOptions) {
    this.t0 = alignMinute(opts.t0)
    this.startT = alignMinute(opts.startT ?? this.t0 - 24 * HOUR)
    this.t = this.startT
    this.seed = opts.seed ?? 50
    this.ix = indexMaster(opts.master ?? defaultMaster())
    this.stories = opts.stories ?? DEFAULT_STORIES
    this.visionRng = mulberry32(this.seed * 7919 + 1)
    this.serialRng = mulberry32(this.seed * 7919 + 2)

    this.mains = this.ix.main.map((st, i) => {
      const rng = mulberry32(this.seed * 1000 + i)
      return {
        st,
        i,
        rng,
        motor: null,
        phase: 'empty' as Phase,
        until: 0,
        pending: [],
        faultCode: null,
        faultStart: 0,
        faultUntil: 0,
        remainingMs: 0,
        nextFaultAt: this.startT + expMs(rng, MTBF_MS),
        reported: '',
      }
    })
    this.ix.subs.forEach((st, k) => {
      const feed = this.ix.feedBySub.get(st.op)
      if (!feed) return
      const rng = mulberry32(this.seed * 1000 + 500 + k)
      this.subs.set(st.op, {
        st,
        feed,
        rng,
        buffer: feed.bufferMax,
        produced: 0,
        nok: 0,
        day: dayStartOf(this.startT, this.ix.master.config.dayStartHour),
        phase: 'blocked',
        until: 0,
        remainingMs: -1,
        stopCode: null,
        reported: '',
      })
    })
    for (const st of [...this.ix.main, ...this.ix.subs]) {
      this.devices.push({ id: st.plcId, type: 'PLC', op: st.op })
      if (st.tightening) {
        this.devices.push({ id: st.tightening.controllerId, type: 'CONTROLLER', op: st.op })
        this.devices.push({ id: st.tightening.toolId, type: 'TOOL', op: st.op })
      }
      if (st.op === 'OP100') for (let k = 1; k <= 6; k++) this.devices.push({ id: `CAM-100-${k}`, type: 'CAMERA', op: st.op })
    }
  }

  /** Sıradaki işlenmemiş an: bu ana kadarki tüm satırlar yazılmıştır */
  get now(): number {
    return this.t
  }

  /** `until` anına kadar (hariç) simüle eder ve satırları yazar */
  advance(until: number, out: RawSink): void {
    while (this.t + STEP <= until) {
      this.step(this.t, out)
      this.t += STEP
    }
  }

  // ------------------------------------------------------------------ ana döngü

  private step(t: number, out: RawSink): void {
    if (t === this.startT) this.writeInitialIo(t, out)
    this.storyIo(t, out)
    for (const s of this.subs.values()) this.subStep(s, t, out)
    // Akış yönünün tersine: boşalan istasyon aynı adımda yukarıdan motor alabilsin
    for (let i = this.mains.length - 1; i >= 0; i--) this.mainStep(this.mains[i], t, out)
    if (t % MIN === 0) {
      this.writeHeartbeats(t, out)
      this.writeCounters(t, out)
    }
  }

  private mainStep(rt: MainRt, t: number, out: RawSink): void {
    if (rt.phase === 'fault' && t >= rt.faultUntil) this.endFault(rt, t)
    if (rt.phase === 'exiting' && t >= rt.until) rt.phase = 'empty'
    if (rt.phase === 'working') {
      while (rt.pending.length > 0 && rt.pending[0].t <= t) {
        const p = rt.pending.shift()!
        if (p.kind === 'fault') {
          this.startFault(rt, t, p.code, p.durMs)
          break
        }
        this.emitPending(rt, p, t, out)
      }
    }
    if (rt.phase === 'working') {
      const story = this.storyFaultDue(rt, t)
      if (story) this.startFault(rt, t, story.code, story.durSec * SEC)
      else if (t >= rt.nextFaultAt) this.startFault(rt, t, this.randomFaultCode(rt), roundSec(between(rt.rng, 45, 180) * SEC))
      else if (t >= rt.until && rt.pending.length === 0) this.finish(rt, t, out)
    }
    if (rt.phase === 'arriving' && t >= rt.until) this.tryStart(rt, t, out)
    else if (rt.phase === 'waitKit') this.tryStart(rt, t, out)
    if (rt.phase === 'done') this.tryTransfer(rt, t)
    if (rt.phase === 'empty') {
      if (rt.i === 0) this.newMotor(rt, t, out)
      else if (rt.st.op === 'OP100') this.takeReqc(rt, t)
    }
    this.reportMain(rt, t, out)
  }

  // ------------------------------------------------------------------ ana hat

  private newMotor(rt: MainRt, t: number, out: RawSink): void {
    const date = yymmdd(t)
    const n = (this.serialSeq.get(date) ?? 0) + 1
    this.serialSeq.set(date, n)
    const sn = `TM50-${date}-${pad(n, 4)}`
    const w = shiftWindow(t, this.ix.master.config.shifts)
    out.write('MotorRegistry', { motorSerial: sn, workOrderNo: `WO-TM50-${yymmdd(w.start)}-${w.shift.id}`, variant: this.ix.master.config.variant, t })
    rt.motor = { sn, qcAttempts: 0 }
    rt.phase = 'arriving'
    rt.until = t + TRANSFER_MS
  }

  private takeReqc(rt: MainRt, t: number): void {
    const k = this.reqc.findIndex((r) => r.returnAt <= t)
    if (k < 0) return
    rt.motor = this.reqc.splice(k, 1)[0].motor
    rt.phase = 'arriving'
    rt.until = t + TRANSFER_MS
  }

  private operatorNo(st: Station, t: number): string | null {
    if (st.type !== 'manual') return null
    return operatorAt(this.ix, st.op, shiftOf(t, this.ix.master.config.shifts).id)?.personnelNo ?? null
  }

  private tryStart(rt: MainRt, t: number, out: RawSink): void {
    const feed = this.ix.feedByMain.get(rt.st.op)
    if (feed) {
      const sub = this.subs.get(feed.subOp)
      if (sub) {
        if (sub.buffer <= 0) {
          rt.phase = 'waitKit'
          return
        }
        sub.buffer--
      }
    }
    const dur = this.workDuration(rt, t)
    rt.phase = 'working'
    rt.until = t + dur
    rt.pending = this.planCycle(rt, t, dur)
    out.write('OperationEvents', { motorSerial: rt.motor!.sn, stationCode: rt.st.op, eventType: 'START', t, operatorNo: this.operatorNo(rt.st, t), result: null })
  }

  private workDuration(rt: MainRt, t: number): number {
    const st = rt.st
    let factor = 0.97
    let sigma = 0.015
    if (st.type === 'manual') {
      const no = this.operatorNo(st, t)
      factor = no ? this.personEfficiency(no) : 1
      sigma = 0.05
    }
    const slow = this.stories.slow.find((s) => s.op === st.op && t >= this.t0 + s.fromMin * MIN && t < this.t0 + s.toMin * MIN)
    return roundSec(st.targetCycleSec * SEC * factor * (slow?.factor ?? 1) * noise(rt.rng, sigma))
  }

  private personEfficiency(personnelNo: string): number {
    let f = this.personFactor.get(personnelNo)
    if (f === undefined) {
      f = between(mulberry32(hash(personnelNo) ^ this.seed), 0.95, 1.03)
      this.personFactor.set(personnelNo, f)
    }
    return f
  }

  /** Çevrim içindeki okutma ve sıkma olaylarını planlar; retry'lar çevrimi uzatır */
  private planCycle(rt: MainRt, t: number, dur: number): Pending[] {
    const st = rt.st
    const out: Pending[] = []
    const comps = this.ix.componentsAt.get(st.op) ?? []
    const dup = this.stories.duplicateScan
    const dupNow = dup && dup.op === st.op && !this.consumed.has('dup') && t >= this.t0 + dup.afterMin * MIN
    comps.forEach((c, k) => {
      const at = t + 20 * SEC + k * 8 * SEC
      const lot = `LOT-${yymmdd(t)}-${c.code}`
      if (dupNow && c.code === dup.type && this.lastComp.has(c.code)) {
        this.consumed.add('dup')
        out.push({ t: at, kind: 'scan', type: c.code, serial: this.lastComp.get(c.code)!, lot })
        out.push({ t: at + 45 * SEC, kind: 'scan', type: c.code, serial: this.nextComponentSerial(c.code), lot })
      } else out.push({ t: at, kind: 'scan', type: c.code, serial: this.nextComponentSerial(c.code), lot })
    })

    const spec = st.tightening
    let extra = 0
    if (spec) {
      const story = this.stories.torque
      const storyNow = story && story.op === st.op && !this.consumed.has('torque') && t >= this.t0 + story.afterMin * MIN
      if (storyNow) this.consumed.add('torque')
      const n = spec.joints.length
      const okTorque = () => {
        const v = spec.targetNm + gaussian(rt.rng) * (spec.tolNm / 4)
        return Math.max(spec.targetNm - spec.tolNm * 0.9, Math.min(spec.targetNm + spec.tolNm * 0.9, v))
      }
      const lowTorque = () => spec.targetNm - spec.tolNm * between(rt.rng, 1.1, 1.5)
      const angle = () => spec.angleDeg + gaussian(rt.rng) * 4
      spec.joints.forEach((joint, k) => {
        const base = roundSec(t + dur * (0.4 + (0.5 * k) / Math.max(1, n - 1))) + extra
        if (storyNow && joint === story.joint) {
          out.push({ t: base, kind: 'tq', joint, torque: lowTorque(), angle: angle() - 15, ok: false })
          out.push({ t: base + RETRY_MS, kind: 'tq', joint, torque: lowTorque(), angle: angle() - 12, ok: false })
          out.push({ t: base + RETRY_MS + 5 * SEC, kind: 'fault', code: 'TOOL-ERR', durMs: 2 * MIN })
          out.push({ t: base + 2 * RETRY_MS, kind: 'tq', joint, torque: okTorque(), angle: angle(), ok: true })
          extra += 2 * RETRY_MS
        } else if (rt.rng() < 0.004) {
          out.push({ t: base, kind: 'tq', joint, torque: lowTorque(), angle: angle() - 15, ok: false })
          out.push({ t: base + RETRY_MS, kind: 'tq', joint, torque: okTorque(), angle: angle(), ok: true })
          extra += RETRY_MS
        } else out.push({ t: base, kind: 'tq', joint, torque: okTorque(), angle: angle(), ok: true })
      })
    }
    rt.until += extra
    return out.sort((a, b) => a.t - b.t)
  }

  private nextComponentSerial(code: string): string {
    let base = this.compBase.get(code)
    if (base === undefined) {
      base = 100000 + Math.floor(this.serialRng() * 800000)
      this.compBase.set(code, base)
    }
    const n = (this.compSeq.get(code) ?? 0) + 1
    this.compSeq.set(code, n)
    const serial = `${code}-TM50-${pad(base + n, 6)}`
    this.lastComp.set(code, serial)
    return serial
  }

  private emitPending(rt: MainRt, p: Pending, t: number, out: RawSink): void {
    const sn = rt.motor!.sn
    if (p.kind === 'scan') {
      out.write('ComponentScans', { motorSerial: sn, stationCode: rt.st.op, componentType: p.type, componentSerial: p.serial, lotNo: p.lot, t, operatorNo: this.operatorNo(rt.st, t) })
    } else if (p.kind === 'tq') {
      const spec = rt.st.tightening!
      out.write('TighteningResults', {
        t,
        motorSerial: sn,
        stationCode: rt.st.op,
        controllerId: spec.controllerId,
        toolId: spec.toolId,
        pset: spec.pset,
        jointId: p.joint,
        targetNm: spec.targetNm,
        minNm: spec.targetNm - spec.tolNm,
        maxNm: spec.targetNm + spec.tolNm,
        torqueNm: Math.round(p.torque * 10) / 10,
        angleDeg: Math.round(p.angle),
        result: p.ok ? 'OK' : 'NOK',
      })
    }
  }

  private finish(rt: MainRt, t: number, out: RawSink): void {
    const m = rt.motor!
    const op = rt.st.op
    if (op === 'OP100') {
      const { decision, defect } = this.decide(m, t)
      m.qcAttempts++
      const inspectionId = `QC-${m.sn}-${m.qcAttempts}`
      out.write('OperationEvents', { motorSerial: m.sn, stationCode: op, eventType: 'END', t, operatorNo: null, result: decision === 'OK' ? 'OK' : 'NOK' })
      out.write('VisionResults', { inspectionId, t, motorSerial: m.sn, decision, defectCode: defect?.code ?? null, defectText: defect?.text ?? null })
      for (const v of QC_VIEWS) out.write('VisionImages', { inspectionId, t, viewName: v, imagePath: `qc/${isoDate(t)}/${m.sn}/${m.qcAttempts}/${slug(v)}.jpg` })
      if (decision !== 'OK') {
        const back = decision === 'NOK' ? between(this.visionRng, 35, 75) : between(this.visionRng, 15, 35)
        this.reqc.push({ motor: m, returnAt: roundSec(t + back * MIN) })
        this.reqc.sort((a, b) => a.returnAt - b.returnAt)
        rt.motor = null
        rt.phase = 'empty'
        return
      }
      rt.phase = 'done'
      return
    }
    out.write('OperationEvents', { motorSerial: m.sn, stationCode: op, eventType: 'END', t, operatorNo: this.operatorNo(rt.st, t), result: 'OK' })
    if (op === this.ix.lastMainOp) {
      rt.motor = null
      rt.phase = 'empty'
      return
    }
    rt.phase = 'done'
  }

  private decide(m: SimMotor, t: number): { decision: 'OK' | 'NOK' | 'HOLD'; defect: DefectDef | null } {
    if (m.qcAttempts === 0) {
      for (const [k, s] of this.stories.vision.entries()) {
        const key = `vision${k}`
        if (!this.consumed.has(key) && t >= this.t0 + s.afterMin * MIN) {
          this.consumed.add(key)
          return { decision: s.decision, defect: this.ix.defect.get(s.defectCode) ?? null }
        }
      }
    }
    const r = this.visionRng()
    const nokP = m.qcAttempts === 0 ? 0.012 : 0.08
    const holdP = m.qcAttempts === 0 ? 0.005 : 0
    const defects = this.ix.master.defects
    if (r < nokP) return { decision: 'NOK', defect: pick(this.visionRng, defects.filter((d) => d.decision === 'NOK')) }
    if (r < nokP + holdP) return { decision: 'HOLD', defect: pick(this.visionRng, defects.filter((d) => d.decision === 'HOLD')) }
    return { decision: 'OK', defect: null }
  }

  private tryTransfer(rt: MainRt, t: number): void {
    const next = this.mains[rt.i + 1]
    if (!next || next.phase !== 'empty') return
    next.motor = rt.motor
    next.phase = 'arriving'
    next.until = t + TRANSFER_MS
    rt.motor = null
    rt.phase = 'exiting'
    rt.until = t + EXIT_MS
  }

  // ------------------------------------------------------------------ arızalar

  private storyFaultDue(rt: MainRt, t: number) {
    for (const [k, f] of this.stories.faults.entries()) {
      const key = `fault${k}`
      const at = this.t0 + f.atMin * MIN
      if (f.op === rt.st.op && !this.consumed.has(key) && t >= at && t < at + 10 * MIN) {
        this.consumed.add(key)
        return f
      }
    }
    return null
  }

  private randomFaultCode(rt: MainRt): string {
    const st = rt.st
    if (st.tightening) return pick(rt.rng, ['TOOL-ERR', 'FIX-LOCK', 'SENSOR'])
    if (st.op === 'OP015') return pick(rt.rng, ['SEAL-FLOW', 'CONV-JAM', 'SENSOR'])
    if (st.op === 'OP100') return pick(rt.rng, ['CAM-TRIG', 'CONV-JAM', 'SENSOR'])
    if (st.type === 'auto') return pick(rt.rng, ['CONV-JAM', 'SENSOR', 'EMG-STOP'])
    return pick(rt.rng, ['FIX-LOCK', 'CONV-JAM', 'SENSOR'])
  }

  private startFault(rt: MainRt, t: number, code: string, durMs: number): void {
    rt.phase = 'fault'
    rt.faultCode = code
    rt.faultStart = t
    rt.faultUntil = t + durMs
    rt.remainingMs = Math.max(0, rt.until - t)
  }

  private endFault(rt: MainRt, t: number): void {
    const d = t - rt.faultStart
    rt.phase = 'working'
    rt.until = t + rt.remainingMs
    for (const p of rt.pending) p.t += d
    rt.faultCode = null
    rt.nextFaultAt = t + expMs(rt.rng, MTBF_MS)
  }

  // ------------------------------------------------------------------ ön montaj

  private subStep(s: SubRt, t: number, out: RawSink): void {
    const day = dayStartOf(t, this.ix.master.config.dayStartHour)
    if (day !== s.day) {
      s.day = day
      s.produced = 0
      s.nok = 0
    }
    const stop = this.stories.subStop.find((x) => x.op === s.st.op && t >= this.t0 + x.fromMin * MIN && t < this.t0 + x.toMin * MIN)
    if (stop && s.phase !== 'stopped') {
      s.remainingMs = s.phase === 'working' ? Math.max(0, s.until - t) : -1
      s.phase = 'stopped'
      s.stopCode = stop.code
    } else if (!stop && s.phase === 'stopped') {
      s.stopCode = null
      if (s.remainingMs >= 0) {
        s.phase = 'working'
        s.until = t + s.remainingMs
      } else s.phase = 'blocked'
    }
    if (s.phase === 'working' && t >= s.until) {
      s.produced++
      if (s.rng() < 0.01) s.nok++
      else s.buffer = Math.min(s.feed.bufferMax, s.buffer + 1)
      if (s.buffer >= s.feed.bufferMax) s.phase = 'blocked'
      else s.until = t + this.kitDuration(s, t)
    }
    if (s.phase === 'blocked' && s.buffer < s.feed.bufferMax) {
      s.phase = 'working'
      s.until = t + this.kitDuration(s, t)
    }
    const [code, fault] = s.phase === 'working' ? [PLC_STATE.RUNNING, null] : s.phase === 'blocked' ? [PLC_STATE.BLOCKED, null] : [PLC_STATE.STOPPED, s.stopCode]
    const key = `${code}|${fault}`
    if (key !== s.reported) {
      s.reported = key
      out.write('StationEvents', { stationCode: s.st.op, t, stateCode: code, faultCode: fault, faultText: fault ? (this.ix.fault.get(fault)?.text ?? null) : null })
    }
  }

  private kitDuration(s: SubRt, t: number): number {
    const slow = this.stories.subSlow.find((x) => x.op === s.st.op && t >= this.t0 + x.fromMin * MIN && t < this.t0 + x.toMin * MIN)
    return roundSec(s.st.targetCycleSec * SEC * 0.97 * (slow?.factor ?? 1) * noise(s.rng, 0.06))
  }

  // ------------------------------------------------------------------ durum, heartbeat, sayaç, IO

  private reportMain(rt: MainRt, t: number, out: RawSink): void {
    let code: number = PLC_STATE.RUNNING
    let fault: string | null = null
    if (rt.phase === 'empty' || rt.phase === 'exiting') code = PLC_STATE.STARVED
    else if (rt.phase === 'waitKit') {
      code = PLC_STATE.STARVED
      fault = 'MAT-WAIT'
    } else if (rt.phase === 'fault') {
      code = PLC_STATE.FAULT
      fault = rt.faultCode
    } else if (rt.phase === 'done') code = PLC_STATE.BLOCKED
    const key = `${code}|${fault}`
    if (key === rt.reported) return
    rt.reported = key
    out.write('StationEvents', { stationCode: rt.st.op, t, stateCode: code, faultCode: fault, faultText: fault ? (this.ix.fault.get(fault)?.text ?? null) : null })
  }

  private writeHeartbeats(t: number, out: RawSink): void {
    for (const d of this.devices) {
      const down = this.stories.offline.some((o) => o.deviceId === d.id && t >= this.t0 + o.fromMin * MIN && t < this.t0 + o.toMin * MIN)
      out.write('DeviceHeartbeats', { deviceId: d.id, deviceType: d.type, stationCode: d.op, t, online: !down })
    }
  }

  private writeCounters(t: number, out: RawSink): void {
    for (const s of this.subs.values()) out.write('SubassemblyCounters', { cellCode: s.st.op, t, producedTotal: s.produced, nokTotal: s.nok, bufferQty: s.buffer })
  }

  private writeInitialIo(t: number, out: RawSink): void {
    for (const st of [...this.ix.main, ...this.ix.subs]) for (const sig of st.signals) out.write('IoSignals', { stationCode: st.op, signalName: sig, value: true, t })
  }

  private storyIo(t: number, out: RawSink): void {
    for (const s of this.stories.io) {
      const from = this.t0 + s.fromMin * MIN
      const to = this.t0 + s.toMin * MIN
      if (t === from && from > this.startT) out.write('IoSignals', { stationCode: s.op, signalName: s.signal, value: false, t })
      if (t === to && to > this.startT) out.write('IoSignals', { stationCode: s.op, signalName: s.signal, value: true, t })
    }
  }
}
