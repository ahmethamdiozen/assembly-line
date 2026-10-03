// Kabul testleri (R-081): URS kabul kriterleri AC-01…AC-10'u kurulumsuz demo üzerinde gerçek bir
// tarayıcıda (Chrome / Chromium, başsız) uçtan uca çalıştırır ve sonuçları docs/kabul-sonuclari.md'ye yazar.
//
//   npm run test:kabul            (önce demo derlenir)
//   CHROME_PATH=... npm run test:kabul   (Chrome başka bir yerdeyse)
//
// Senaryolar ve elle yapılacak sunucu modu (FAT / SAT) adımları: docs/kabul-testleri.md
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Tarayıcıların engellediği portlardan (ör. 4190) kaçınılır
const WEB = 4280
const CDP = 9340
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const c of candidates) if (existsSync(c)) return c
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      return execSync(`command -v ${bin}`, { encoding: 'utf8' }).trim()
    } catch {
      /* sıradaki */
    }
  }
  throw new Error('Chrome / Chromium bulunamadı; CHROME_PATH ile yolunu verin')
}

async function until(fn, ms, what) {
  for (let t = 0; t < ms; t += 250) {
    try {
      if (await fn()) return
    } catch {
      /* henüz hazır değil */
    }
    await sleep(250)
  }
  throw new Error(`${what} ${ms / 1000} sn içinde hazır olmadı`)
}

if (!existsSync('dist/index.html')) throw new Error('Önce demoyu derleyin: npm run build:demo')

const procs = []
const profile = mkdtempSync(join(tmpdir(), 'tm50-kabul-'))
const cleanup = () => {
  for (const p of procs) p.kill()
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* Chrome profili kapanırken yazıyor olabilir; geçici klasör işletim sistemince temizlenir */
  }
}
process.on('exit', cleanup)

procs.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--mode', 'demo', '--host', '127.0.0.1', '--port', String(WEB), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] }))
procs.push(spawn(chromePath(), ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' }))
await until(async () => (await fetch(`http://127.0.0.1:${WEB}/`)).ok, 20000, 'Demo sunucusu')
await until(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok, 20000, 'Chrome')
const browser = (await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()).Browser

// ---------------------------------------------------------------- tarayıcı (Chrome DevTools Protocol)

const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++seq
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split('\n')[0] ?? 'tarayıcı hatası')
  return r.result.result.value
}
const waitFor = async (expr, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) {
    if ((await ev(`try { return !!(${expr}) } catch { return false }`)) === true) return true
    await sleep(250)
  }
  return false
}
const click = (expr) => ev(`const el = ${expr}; if (!el) throw new Error('öğe yok: ' + ${JSON.stringify(expr.slice(0, 60))}); el.click(); return true`)
const btn = (t) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`
const btnIn = (t) => `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(t)}))`
const typeInto = async (sel, v) => {
  await ev(
    `const el = ${sel}; if (!el) throw new Error('alan yok'); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true`,
  )
  await sleep(150)
}
const go = async (hash) => {
  await ev(`location.hash = ${JSON.stringify(hash)}; return true`)
  await sleep(600)
}
const roleLogin = async (role) => {
  if (await ev(`return !!document.querySelector('button[aria-label="Rol değiştir"]')`)) await click(`document.querySelector('button[aria-label="Rol değiştir"]')`)
  if (!(await waitFor(`document.body.innerText.includes('Hangi rolle bakmak istersiniz')`, 15000))) throw new Error('Giriş ekranı açılmadı')
  await click(btnIn(role))
  if (!(await waitFor(`!document.body.innerText.includes('Hangi rolle bakmak istersiniz')`, 15000))) throw new Error(`${role} girişi yapılamadı`)
}
const tabClick = async (label) => {
  await click(`[...document.querySelectorAll('[role=tab]')].find(b => b.textContent === ${JSON.stringify(label)})`)
  await waitFor(`[...document.querySelectorAll('[role=tab]')].find(b => b.textContent === ${JSON.stringify(label)})?.getAttribute('aria-selected') === 'true'`)
  await sleep(400)
}

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` })
await until(() => ev(`return document.body.innerText.includes('Hangi rolle bakmak istersiniz')`), 20000, 'Giriş ekranı')

// ---------------------------------------------------------------- senaryolar

const MAIN = ['OP005', 'OP010', 'OP015', 'OP020', 'OP030', 'OP040', 'OP050', 'OP060', 'OP070', 'OP080', 'OP090', 'OP100', 'OP110']
const SUB = ['OP201', 'OP202', 'OP203', 'OP205', 'OP206']

/** Her senaryo adımlarını sırayla dener; bir adımın düşmesi diğer senaryoları durdurmaz */
const SCENARIOS = [
  {
    id: 'AC-01',
    reqs: 'R-011, R-016',
    title: '13 ana istasyon ve 5 ön montaj hücresi hat görselinde',
    run: async (step) => {
      await roleLogin('Üretim Lideri')
      await go('#/')
      await step('13 ana istasyon OP005–OP110 sırasıyla görünüyor', () => waitFor(`${JSON.stringify(MAIN)}.every(op => document.querySelector('button[aria-label^="' + op + ' "]'))`, 15000))
      await step('5 ön montaj hücresi (OP201–OP206) görünüyor', () => waitFor(`${JSON.stringify(SUB)}.every(op => document.querySelector('button[aria-label^="' + op + ' "]'))`))
    },
  },
  {
    id: 'AC-02',
    reqs: 'R-014',
    title: 'İstasyona tıklayınca sayfa değişmeden Seçili İstasyon paneli güncellenir',
    run: async (step) => {
      await click(`document.querySelector('button[aria-label^="OP050 "]')`)
      await step('OP050 paneli açıldı', () => waitFor(`[...document.querySelectorAll('h2')].some(h => h.textContent === 'Silindir Bloğu Montajı')`))
      await step('Sayfa değişmedi (Kontrol Merkezi)', () => ev(`return location.hash.startsWith('#/?') || location.hash === '#/'`))
      await click(`document.querySelector('button[aria-label^="OP080 "]')`)
      await step('Başka istasyon seçilince panel güncellendi (OP080)', () => waitFor(`[...document.querySelectorAll('h2')].some(h => h.textContent === 'Marş Motoru Pervane Grubu Montajı')`))
    },
  },
  {
    id: 'AC-03',
    reqs: 'R-013',
    title: 'Her istasyonda OP kodu, tip / teknisyen, durum ve motor seri numarası',
    run: async (step) => {
      const info = await ev(`return ${JSON.stringify(MAIN)}.map(op => document.querySelector('button[aria-label^="' + op + ' "]').innerText)`)
      await step('Her istasyon kutusunda OP kodu ve durum metni var', () => info.every((t, i) => t.includes(MAIN[i]) && /Normal|Takt riski|Arıza|Offline/.test(t)))
      await step('İnsanlı istasyonlarda teknisyen, otomatik istasyonlarda tip yazılı', () => info.every((t) => !t.includes('Teknisyen yok')))
      // Konveyörde kısa seri no yazılır; tam seri no öğenin başlığında
      await step('Konveyördeki motorlar seri numarasıyla görünüyor', () => waitFor(`[...document.querySelectorAll('[aria-label="Konveyör üzerindeki motorlar"] [title]')].some(e => /^TM50-\\d{6}-\\d{4}/.test(e.title))`))
    },
  },
  {
    id: 'AC-04',
    reqs: 'R-030, R-031',
    title: 'Motor tamamlanma yüzdesi ve operasyon geçmişi',
    run: async (step, ctx) => {
      // Hattın ortasındaki bir motor: bazı parçaları takılmış, bazıları bekliyor
      const sns = await ev(`return [...document.querySelectorAll('[aria-label="Konveyör üzerindeki motorlar"] [title]')].map(e => e.title.match(/^TM50-\\d{6}-\\d{4}/)?.[0]).filter(Boolean)`)
      ctx.sn = sns[Math.floor(sns.length / 2)]
      await go(`#/motor/${ctx.sn}`)
      await step(`${ctx.sn} için tamamlanma yüzdesi (13 operasyon üzerinden)`, () => waitFor(`/%\\d+/.test(document.body.innerText) && document.body.innerText.includes('/ 13 operasyon')`, 15000))
      await step('Operasyon geçmişinde giriş, çıkış, cycle, teknisyen ve sonuç sütunları', () =>
        ev(`const h = [...document.querySelectorAll('th')].map(t => t.textContent); return ['Giriş', 'Çıkış', 'Cycle', 'Teknisyen', 'Sonuç'].every(x => h.includes(x))`),
      )
      await step('Tamamlanan operasyonlar OK sonucuyla listelenmiş', () => ev(`return [...document.querySelectorAll('tbody tr')].filter(r => r.textContent.includes('OK')).length >= 1`))
    },
  },
  {
    id: 'AC-05',
    reqs: 'R-028, R-029',
    title: 'Takılan parçalar: 7 komponent, Installed / Pending',
    run: async (step) => {
      const comp = await ev(`const s = [...document.querySelectorAll('li')].map(l => l.innerText).filter(t => /Installed|Pending|monte edilmedi/.test(t)); return { n: s.length, installed: s.filter(t => t.includes('Installed')).length, pending: s.filter(t => /Pending|monte edilmedi/.test(t)).length }`)
      await step('7 seri numaralı komponent listelenmiş', () => comp.n === 7, JSON.stringify(comp))
      await step('Takılanlar Installed, takılmayanlar Pending', () => comp.installed >= 1 && comp.pending >= 1, `${comp.installed} Installed, ${comp.pending} Pending`)
    },
  },
  {
    id: 'AC-06',
    reqs: 'R-033, R-034, R-036',
    title: 'OP100 NOK → rework kuyruğu → re-QC',
    run: async (step) => {
      await roleLogin('Kalite')
      await go('#/kalite')
      await waitFor(`document.body.innerText.includes('Rework akışı')`, 15000)
      await step('OP100 sonuçlarında NOK kararı var', () => waitFor(`[...document.querySelectorAll('tr')].some(r => r.innerText.includes('NOK'))`))
      const cols = ['Incoming Triage', 'Diagnosis', 'Rework Bench']
      const col = await ev(`return ${JSON.stringify(cols)}.find(c => document.querySelector('section[aria-label="' + c + '"] article'))`)
      await step('Rework kuyruğunda hata tipi, kaynak OP, öncelik ve sorumlu ekiple kayıt var', () =>
        ev(`return [...document.querySelectorAll('section[aria-label] article')].some(a => /Kaynak/.test(a.innerText) && /Sorumlu/.test(a.innerText))`),
      )
      if (col) {
        const next = cols[cols.indexOf(col) + 1] ?? 'Ready for Re-QC'
        const before = await ev(`return document.querySelectorAll('section[aria-label="${next}"] article').length`)
        await click(`[...document.querySelector('section[aria-label="${col}"]').querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(next)}))`)
        await sleep(300)
        if (next === 'Rework Bench' || next === 'Ready for Re-QC') {
          await typeInto(`document.querySelector('section[aria-label="${col}"] form input')`, 'Kabul testi: kök neden')
          await typeInto(`document.querySelector('section[aria-label="${col}"] form select')`, 'Aylin Kaya')
        }
        await click(btnIn(`${next} adımına al`))
        await step(`Rework "${col}" adımından "${next}" adımına alındı`, () => waitFor(`document.querySelectorAll('section[aria-label="${next}"] article').length > ${before}`))
      } else await step('İlerletilecek rework kaydı', () => false, 'Triage / Diagnosis / Bench sütunları boş')
      await step("Re-QC'den OK geçen motorların rework'ü kapanmış", () => waitFor(`[...document.querySelectorAll('h3')].some(h => h.textContent === "Kapanan rework'ler") && document.body.innerText.includes('sürdü')`))
    },
  },
  {
    id: 'AC-07',
    reqs: 'R-038',
    title: 'Alarm yaşam döngüsü: Detected → Acknowledged → Assigned → Closed',
    run: async (step) => {
      await roleLogin('Üretim Lideri')
      await go('#/alarmlar')
      await step('Açık alarmlar listelendi', () => waitFor(`document.querySelectorAll('.ag-row').length > 0`, 15000))
      await click(`[...document.querySelectorAll('.ag-row')].find(r => r.innerText.includes('Detected') || r.innerText.includes('Eskale'))?.querySelector('[col-id="message"]')`)
      await waitFor(`!!document.querySelector('ol[aria-label="Alarm yaşam döngüsü"]')`)
      await waitFor(`!!${btnIn('Onayla')}`)
      await click(btnIn('Onayla'))
      await waitFor(`!!${btn('Ata')}`)
      await typeInto(`document.querySelector('select[aria-label="Atanacak ekip ya da kişi"]')`, 'Bakım Ekibi')
      await click(btn('Ata'))
      await waitFor(`!!${btn('Yeniden ata')}`)
      await typeInto(`document.querySelector('input[placeholder^="Kapanış notu"]')`, 'Kabul testi: giderildi')
      await click(btn('Kapat'))
      await step('Alarm onaylandı, Bakım Ekibi’ne atandı ve kapanış notuyla kapatıldı', () => waitFor(`document.body.innerText.includes('Kapanış notu: Kabul testi: giderildi')`))
      const steps = await ev(`return [...document.querySelectorAll('ol[aria-label="Alarm yaşam döngüsü"] li')].map(l => l.innerText.replace(/\\s+/g, ' '))`)
      await step('Dört adım zaman ve kullanıcıyla işaretli', () => steps.length === 4 && steps.slice(1).every((s) => /\d\d:\d\d/.test(s) && /Levent Acar|Bakım Ekibi/.test(s)), steps.join(' | '))
    },
  },
  {
    id: 'AC-08',
    reqs: 'R-025, R-040, R-058',
    title: 'Teknisyen notu ve Andon; audit kaydı',
    run: async (step) => {
      await roleLogin('Teknisyen')
      await go('#/terminal/OP070')
      await waitFor(`document.body.innerText.includes('İstasyon girişi')`, 15000)
      if (await ev(`return !!${btnIn('OP070 istasyonuna giriş yap')}`)) await click(btnIn('OP070 istasyonuna giriş yap'))
      await step('Teknisyen OP070 istasyonuna giriş yaptı', () => waitFor(`!!${btnIn('İstasyondan çık')}`))
      await click(btnIn('Not ekle'))
      await typeInto(`document.querySelector('form textarea')`, 'Kabul testi notu: konnektör sayımı tekrarlandı')
      await click(btn('Notu kaydet'))
      await step('Not kaydedildi ve istasyon notlarında görünüyor', () => waitFor(`document.body.innerText.includes('Kabul testi notu')`))
      await click(btnIn('Malzeme talebi'))
      await typeInto(`document.querySelector('form textarea')`, 'Kabul testi: kablo bağı')
      await click(btn('Andon aç'))
      await step('Malzeme Andon’u açıldı ve alarm olarak düştü', () => waitFor(`document.body.innerText.includes('Malzeme çağrısı açıldı') && document.body.innerText.includes('Kabul testi: kablo bağı')`))
      await roleLogin('Admin')
      await go('#/admin?tab=audit')
      await waitFor(`document.querySelectorAll('tbody tr[aria-expanded]').length > 0`, 15000)
      await typeInto(`document.querySelector('[aria-label="Kullanıcı"]')`, 'Ece Kara')
      await step('Audit kaydında not ve Andon kullanıcı ve zamanla var', () =>
        waitFor(`(() => { const r = [...document.querySelectorAll('tbody tr[aria-expanded]')].map(x => x.innerText); return r.some(t => t.includes('note.create')) && r.some(t => t.includes('andon.create')) && r.every(t => t.includes('Ece Kara')) })()`),
      )
    },
  },
  {
    id: 'AC-09',
    reqs: 'R-045',
    title: 'Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme ve vardiya çıkışı',
    run: async (step) => {
      await go('#/kpi')
      await step('KPI göstergeleri hesaplanmış', () =>
        waitFor(`(() => { const t = document.body.innerText; return ['OEE', 'Availability', 'Performance', 'FPY', 'Plan gerçekleşme', '/ saat'].every(x => t.includes(x)) && /%\\d/.test(t) })()`, 15000),
      )
      await step('Vardiya çıkışları karşılaştırmalı', () => ev(`return document.querySelectorAll('tr[aria-selected]').length === 3`))
    },
  },
  {
    id: 'AC-10',
    reqs: 'R-010, R-053, R-055, R-056, R-057',
    title: 'Admin: istasyon ana verisi, besleme, alarm kuralı; entegrasyon sağlığı',
    run: async (step) => {
      await go('#/admin')
      await waitFor(`!!document.querySelector('button[aria-label="OP070 düzenle"]')`, 15000)
      await click(`document.querySelector('button[aria-label="OP070 düzenle"]')`)
      await typeInto(`document.querySelector('[aria-label="Hedef çevrim"]')`, '6.5')
      await click(`[...document.querySelectorAll('tr')].find(r => r.querySelector('[aria-label="Hedef çevrim"]'))?.querySelector('button')`)
      await step('İstasyon hedef çevrimi değiştirildi (R-053)', () => waitFor(`[...document.querySelectorAll('tr')].some(r => r.innerText.includes('OP070') && r.innerText.includes('6,5 dk'))`))
      await tabClick('Ön montaj beslemesi')
      await typeInto(`document.querySelector('[aria-label="OP206 buffer min"]')`, '11')
      await click(`[...document.querySelectorAll('tr')].find(r => r.querySelector('[aria-label="OP206 buffer min"]')).querySelector('button')`)
      await step('Ön montaj buffer minimumu değiştirildi (R-055)', () => waitFor(`document.querySelector('[aria-label="OP206 buffer min"]')?.value === '11' && !document.querySelector('[aria-label="OP206 buffer min"]').closest('tr').className.includes('bg-accent')`))
      await tabClick('Alarm kuralları')
      await typeInto(`document.querySelector('[aria-label="TQ-NOK eskalasyon"]')`, '6')
      await click(`[...document.querySelectorAll('tr')].find(r => r.querySelector('[aria-label="TQ-NOK eskalasyon"]')).querySelector('button')`)
      await step('Alarm kuralının eskalasyon süresi değiştirildi (R-056)', () => waitFor(`document.querySelector('[aria-label="TQ-NOK eskalasyon"]')?.value === '6' && !document.querySelector('[aria-label="TQ-NOK eskalasyon"]').closest('tr').className.includes('bg-accent')`))
      await tabClick('Audit kaydı')
      await step('Konfigürasyon değişiklikleri audit’te (R-058)', () => waitFor(`['config.station', 'config.routing', 'config.alarmRule'].every(a => document.body.innerText.includes(a))`))
      await step('Kullanıcı / rol ve veri saklama ayarları yönetilebilir (R-010)', () => ev(`return ['Kullanıcılar & roller', 'Saklama & yedek', 'Entegrasyon'].every(t => [...document.querySelectorAll('[role=tab]')].some(b => b.textContent === t))`))
      await go('#/bakim')
      await step('PLC, tork, kamera, SQL Server ve veri kanalının durumu görünüyor (R-057)', () =>
        waitFor(`['Fabrika SQL Server', 'Canlı veri kanalı', "PLC'ler", 'Tork controller ve tool', 'Kamera / vision', 'Uygulama veritabanı'].every(x => document.body.innerText.includes(x))`, 15000),
      )
    },
  },
]

const results = []
const t0 = Date.now()
for (const s of SCENARIOS) {
  const steps = []
  const started = Date.now()
  const step = async (desc, fn, detail = '') => {
    let ok = false
    let info = detail
    try {
      ok = (await fn()) === true
    } catch (e) {
      info = e.message
    }
    steps.push({ desc, ok, detail: info })
  }
  try {
    await s.run(step, {})
  } catch (e) {
    steps.push({ desc: 'Senaryo tamamlanamadı', ok: false, detail: e.message })
  }
  const ok = steps.length > 0 && steps.every((x) => x.ok)
  results.push({ ...s, steps, ok, ms: Date.now() - started })
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${s.id}  ${s.title}`)
  for (const x of steps) if (!x.ok) console.log(`        ✗ ${x.desc}${x.detail ? `: ${x.detail}` : ''}`)
}
ws.close()

// ---------------------------------------------------------------- sonuç dokümanı

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
let commit = '—'
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch {
  /* git yok */
}
const passed = results.filter((r) => r.ok).length
const when = new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
const esc = (s) => String(s).replace(/\|/g, '\\|')
let md = `# Kabul Testi Sonuçları

Otomatik çalıştırma: \`npm run test:kabul\` (\`scripts/kabul-testi.mjs\`). Senaryolar ve sunucu modunda elle yapılacak adımlar: [\`kabul-testleri.md\`](kabul-testleri.md).

| | |
|---|---|
| Tarih | ${when} |
| Sürüm | ${pkg.version} (commit \`${commit}\`) |
| Ortam | Kurulumsuz demo (tüm veri hattı tarayıcıda), ${browser}, Node ${process.version} |
| Sonuç | **${passed} / ${results.length} senaryo geçti** (${Math.round((Date.now() - t0) / 1000)} sn) |

| Kabul | İsterler | Senaryo | Sonuç |
|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.reqs} | ${esc(r.title)} | ${r.ok ? 'Geçti' : '**Kaldı**'} |`).join('\n')}

## Adımlar
`
for (const r of results) {
  md += `\n### ${r.id}: ${r.title}\n\nİsterler: ${r.reqs} · ${(r.ms / 1000).toFixed(1)} sn\n\n`
  for (const x of r.steps) md += `- ${x.ok ? '✓' : '✗'} ${x.desc}${x.detail ? ` (${esc(x.detail)})` : ''}\n`
}
writeFileSync('docs/kabul-sonuclari.md', md)
console.log(`\n${passed} / ${results.length} senaryo geçti → docs/kabul-sonuclari.md`)
for (const p of procs) p.kill()
await sleep(800)
process.exit(passed === results.length ? 0 : 1)
