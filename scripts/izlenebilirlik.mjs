// İzlenebilirlik matrisini üretir: node scripts/izlenebilirlik.mjs → docs/izlenebilirlik-matrisi.md
// İster listesi 01_customer_requirements_clean.md'den okunur; durum ve kanıtlar aşağıda elle tutulur.
// Kural (baseline §18): sadece davranışı gösteren kod kanıtı varsa IMPLEMENTED; kullanıcıya henüz
// görünmeyen ya da eksik kısmı olan davranış PARTIAL.
import { readFileSync, writeFileSync } from 'node:fs'

const PHASE_DONE = 5

/** İster → hedef faz (plan §7) */
function phase(n) {
  if (n === 1) return '0'
  if ([4, 66, 67, 68, 69, 70].includes(n)) return '0, 2'
  if ([11, 16, 59, 60, 61].includes(n)) return '1'
  if (n === 3 || (n >= 12 && n <= 15) || (n >= 17 && n <= 26)) return '2'
  if ([2, 5, 62, 63, 64, 65, 71, 72, 74].includes(n)) return '3'
  if (n === 58) return '3, 6'
  if (n === 7 || n === 8 || (n >= 27 && n <= 44)) return '4'
  if (n === 6 || n === 9 || (n >= 45 && n <= 52) || n === 73) return '5'
  return '6'
}

/** Durum ve kanıt. Listede olmayanlar MISSING. */
const STATUS = {
  'R-052': ['IMPLEMENTED', 'İstasyona girişte yetkinlik kontrolü: insanlı istasyon Montaj L2, sıkmalı istasyon ayrıca Torque Qualified (üst seviye alt seviyeyi karşılar); eksikse giriş engellenir ve deneme audit\'e yazılır (testli). Kural varsayımdır (acik-konular.md F6).'],
  'R-051': ['IMPLEMENTED', 'Aktif görev kartı: istasyon, motor S/N ve illüstrasyonu, geçen / tahmini kalan süre, kontrol listesi, takılacak parçalar, sıkma joint\'leri, onay durumu, sıradaki motor; kiosk modu (`?kiosk=1`).'],
  'R-009': ['IMPLEMENTED', 'Bakım & Entegrasyon: PLC / tork / kamera heartbeat\'leri, sensör / IO, istasyon bakım metrikleri, collector ve SQL Server sağlığı, ham fabrika tabloları, uygulama logları (`Maintenance.tsx`, `maintenance.ts`; tarayıcı testi). Alarmlar Alarm Merkezi\'nde.'],
  'R-044': ['IMPLEMENTED', 'Filtredeki tüm kayıtlar Excel\'de açılan CSV olarak indirilir (BOM, ";", ondalık virgül; tarayıcı testi); dışa aktarım audit\'e yazılır.'],
  'R-037': ['IMPLEMENTED', 'Alarm Merkezi: önem, durum, kaynak, istasyon, metin araması ve zaman aralığı filtreleri.'],
  'R-008': ['PARTIAL', 'Kalite rolü OP100 sonuçlarını, NOK / HOLD\'ları, rework ve re-QC kayıtlarını görür ve yönetir (Kalite & Rework, Motor Takibi). Motor görüntüleri motora bağlı ama dosyalar görüntü deposu bağlantısı netleşene kadar yer tutucu (acik-konular.md C4).'],
  'R-080': ['PARTIAL', 'Kaynak kod ve build / çalıştırma talimatları README\'de; teslim kapsamı sözleşmeye bağlı.'],
  'R-078': ['PARTIAL', 'README\'de geliştirme kurulumu (Mac / Windows, Docker). Canlı kurulum dokümanı Faz 6.'],
  'R-075': ['PARTIAL', 'Yedekleme ve geri yükleme komutları (`npm run db:backup` / `db:restore`, bütünlük kontrolüyle). Yedekleme sıklığı ve saklama politikası netleşmedi.'],
  'R-073': ['IMPLEMENTED', 'Uygulama logu `logs/app.log` (hatalar, yavaş istekler, collector turları ve hataları, hatalı girişler; 20 MB\'ta döndürülür). Bakım & Entegrasyon\'da seviye filtreli log ekranı ve sistem bilgisi (izin: system.view; testli).'],
  'R-072': ['PARTIAL', 'PIN / şifreler scrypt ile hash\'li (testli); oturum çerezi HttpOnly, HTTPS\'te Secure. HTTPS sertifika ayarı var (`HTTPS_KEY` / `HTTPS_CERT`); canlı kurulum dokümanı Faz 6.'],
  'R-071': ['IMPLEMENTED', 'Ölçüm: özet API 8 ms, istasyon ayrıntısı 2 ms, 3 dk\'lık collector turu 6–40 ms, 24 saatlik ilk okuma 0,8 sn. 1 sn\'den yavaş istekler logda işaretlenir.'],
  'R-065': ['PARTIAL', 'REST / JSON API dokümante (docs/api.md). Tercih edilen WebSocket yerine yoklama kullanılıyor (kullanıcı kararı; veri 3–5 dk\'da bir geliyor).'],
  'R-062': ['IMPLEMENTED', 'Uygulama veritabanı SQLite (WAL) + ileri doğru migration (`server/db/sqlite.ts`; sürüm 1 → 2 mevcut veriyi koruyarak test edildi). Sonradan eklenen izinler kayıtlı rol ayarlarına eklenir, admin\'in kaldırdıklarına dokunulmaz.'],
  'R-058': ['PARTIAL', 'Not, alarm, Andon, rework, HOLD, tork dışa aktarımı, giriş / çıkış, istasyon girişi (reddedilenler dahil), operasyon onayı ve "Şimdi çek" audit log\'a yazılır. Konfigürasyon / ana veri değişiklikleri ve audit ekranı Faz 6.'],
  'R-050': ['IMPLEMENTED', 'Personel no ya da RFID kart no + PIN ile giriş (PIN hash\'li, 5 hatalı denemede kilit); Teknisyen Terminali\'nden istasyon / vardiya girişi, vardiya sonuna kadar geçerli, istasyonda tek teknisyen (`terminal.ts`; birim, API ve tarayıcı testleri).'],
  'R-040': ['IMPLEMENTED', 'Teknisyen istasyon panelinden malzeme / kalite / üretim desteği için Andon açar; alarm kaydı oluşur ve kuraldaki ekibe düşer (teknisyen terminalinden de açılabilecek, Faz 5).'],
  'R-007': ['IMPLEMENTED', 'Supervisor hattı ve istasyon performansını görür (Kontrol Merkezi), alarmları onaylar / atar / kapatır (Alarm Merkezi), rework\'ü takip eder (Kalite & Rework). Tarayıcı testiyle doğrulandı.'],
  'R-006': ['IMPLEMENTED', 'Teknisyen Terminali: istasyon / operasyon bilgisi, not, Andon (malzeme / kalite / üretim desteği), HOLD ve kontrol listesiyle "operasyonu tamamla" (`src/domain/terminal.ts`, `Terminal.tsx`; birim, API ve tarayıcı testleri). Onay uygulama veritabanına yazılır, fabrika sistemine geri yazılmaz (acik-konular.md A3).'],
  'R-005': ['IMPLEMENTED', 'Teknisyen, Supervisor, Kalite, Bakım / Otomasyon ve Admin için ayrı izinler (`src/domain/rbac.ts`); kontrol sunucuda komut servisinde (`commands.ts`), API testlerinde 403 doğrulandı (`server/api/app.test.ts`). İzin yönetimi ekranı Faz 6.'],
  'R-002': ['PARTIAL', 'Veri SQL Server\'dan 3–5 dk\'da bir çekiliyor (kullanıcı kararı); ekran 15 sn\'de bir yenilenir, yeni veri gelince hemen güncellenir. URS\'deki 1–3 sn hedefinden sapma acik-konular.md A2\'de.'],
  'R-001': ['IMPLEMENTED', 'Vite + React web uygulaması; tarayıcıda kurulumsuz açılır. Demo derlemesi backend gerektirmez (`npm run build:demo`).'],
  'R-003': ['IMPLEMENTED', 'Kontrol Merkezi tek sayfada hat akışı, KPI şeridi, Seçili İstasyon paneli, rework / HOLD kuyruğu ve son olayları gösterir (`src/pages/ControlCenter.tsx`).'],
  'R-004': ['IMPLEMENTED', '1920×1080 için tasarlandı; 1366×768\'de 13 istasyon tek satıra sığıyor (menü 1536 px altında ikonlara iner, hat bandı 1240 px altında kendi içinde kayar). Ekran görüntüleriyle kontrol edildi.'],
  'R-011': ['IMPLEMENTED', '13 operasyon URS\'deki kod, ad ve tiplerle ana veride (`lineDef.ts`, `lineDef.test.ts`) ve hat görselinde.'],
  'R-012': ['IMPLEMENTED', 'Yatay hat; her istasyonda aktif motor, durum, teknisyen / otomasyon tipi, operasyon adı ve çevrim süresi (`src/components/line/LineBand.tsx`).'],
  'R-013': ['IMPLEMENTED', 'TM50 boxer-4 motor illüstrasyonu montaj aşamasına göre parça ekler; altında seri numarası (`src/components/engine/Tm50Engine.tsx`). Aşama ile istasyon tutarlılığı testli (`overview.test.ts`).'],
  'R-014': ['IMPLEMENTED', 'İstasyona ya da motora tıklamak sayfayı değiştirmez; Seçili İstasyon paneli ve çevrim grafiği güncellenir. Tarayıcıda (CDP) tıklama testiyle doğrulandı.'],
  'R-015': ['IMPLEMENTED', 'Running / Warning (takt riski) / Fault-NOK / Offline renk + ikon + metinle (`StateBadge`, `lineState.ts`); kurallar docs/kpi-tanimlari.md.'],
  'R-016': ['IMPLEMENTED', '5 ön montaj operasyonu ana veride ve hat görselinde.'],
  'R-017': ['IMPLEMENTED', 'Ön montaj hücreleri konveyörden ayrı kartlar olarak gösteriliyor (`SubCell`).'],
  'R-018': ['IMPLEMENTED', 'Her hücrede bugünkü üretim / hedef, son 1 saat, buffer (min işaretli) ve durum.'],
  'R-019': ['IMPLEMENTED', 'Hücreden beslediği ana hat istasyonuna bağlantı çizgisi ve "Besler OPxxx" metni (`FeedLinks`).'],
  'R-020': ['IMPLEMENTED', 'Buffer min altına düşünce BUF-LOW alarmı açılır, hücre Warning olur ve bağlantı çizgisi vurgulanır (`transform.ts`, `lineState.ts`; testli). Min seviyenin admin\'den ayarı Faz 6.'],
  'R-021': ['IMPLEMENTED', 'Genel sekmesi: aktif motor, teknisyen / otomasyon, çevrim / hedef, takt sapması, kalan süre (tahmin), sonraki istasyon, operasyon ilerlemesi.'],
  'R-022': ['IMPLEMENTED', 'Proses sekmesi: reçete, PLC / Cell ID, ekipman / tool, Pset / program, checklist, kritik komponent S/N ve lot.'],
  'R-023': ['IMPLEMENTED', 'Kalite & Tork sekmesi: son kalite sonucu, açık Andon\'lar ve "Andon aç", son alarm, tork hedef / gerçek / açı / sonuç.'],
  'R-024': ['IMPLEMENTED', 'İstasyon panelinde Varlık & IO sekmesi; Bakım & Entegrasyon\'da tüm cihazlar, IO ve son 24 saatin arıza sayısı, arıza süresi, MTTR, MTBF ve çalışma oranı (testli).'],
  'R-025': ['IMPLEMENTED', 'Notlar sekmesi: bilgi / uyarı / hata; yazar giriş yapan kullanıcı, zaman sunucu saati, istasyon, motor, ilişkili alarm / konu kalıcı saklanır; hata notu alarm üretir; audit\'e yazılır (`createNote`; birim, API ve tarayıcı testleri; yeniden başlatma sonrası kalıcılık tarayıcıda doğrulandı).'],
  'R-026': ['IMPLEMENTED', 'Geçmiş sekmesi: son 12 işlem; motor S/N, teknisyen, cycle, sonuç, ilgili alarm / not.'],
  'R-027': ['IMPLEMENTED', 'Motor Takibi: seri no parçası ya da komponent seri numarasıyla arama; güncel durum ve as-built geçmişi (`searchMotors`, `motorDetail`; birim, API ve tarayıcı testleri).'],
  'R-028': ['IMPLEMENTED', '"Takılan parçalar": 7 komponent benzersiz seri numarasıyla motora bağlı; aynı S/N ikinci motorda okutulursa TRC-DUP alarmı.'],
  'R-029': ['IMPLEMENTED', 'Komponent operasyon OK bitene kadar "Henüz monte edilmedi / Pending", sonra seri numarasıyla "Installed"; okutulmuş ama operasyonu süren parça ayrıca belirtilir.'],
  'R-030': ['IMPLEMENTED', 'Tamamlanma 13 operasyon üzerinden yüzde ve 13 parçalı ilerleme çubuğuyla (Motor Takibi).'],
  'R-031': ['IMPLEMENTED', 'Operasyon geçmişi tablosu: her OP için giriş, çıkış, cycle, teknisyen, takılan parça / S/N, sonuç (tekrarlar dahil).'],
  'R-032': ['PARTIAL', 'OP100 görüntüleri muayene kaydı üzerinden motor S/N\'ye bağlı ve görünüm adlarıyla listeleniyor; görüntü dosyaları depo bağlantısı netleşene kadar yer tutucu (C4).'],
  'R-033': ['IMPLEMENTED', 'OP100 kararı OK / NOK / HOLD saklanır ve akışı belirler: NOK → rework, HOLD → kalite kararı, OK → devam (Kalite & Rework, Motor Takibi; testli).'],
  'R-034': ['IMPLEMENTED', 'Rework kuyruğu: hata tipi, kaynak OP, kök neden, öncelik, sorumlu ekip, rework operatörü; ekrandan düzenlenir, tezgâha geçmeden kök neden ve operatör zorunlu.'],
  'R-035': ['IMPLEMENTED', 'Kanban: Incoming Triage → Diagnosis → Rework Bench → Ready for Re-QC → Re-QC (OP100); adım geçişleri yetki + audit\'le (tarayıcı testi).'],
  'R-036': ['IMPLEMENTED', 'Ready for Re-QC olan motor OP100\'e girince re-QC başlar; OK kapanır, NOK yeni turla triage\'a döner (collector; testli).'],
  'R-038': ['IMPLEMENTED', 'Detected → Acknowledged → Assigned → Closed; adımlar zaman ve kullanıcıyla gösterilir (tarayıcı testi).'],
  'R-039': ['IMPLEMENTED', 'Alarm ekip ya da kişiye atanır, yeniden atanabilir; atama ve kapanış alarm olaylarına ve audit log\'a yazılır.'],
  'R-041': ['IMPLEMENTED', 'Alarm ayrıntısındaki "Motor geçmişi" bağlantısı ve tablodaki seri numarası Motor Takibi\'ni açar (tarayıcı testi).'],
  'R-042': ['IMPLEMENTED', 'Tork ekranı: zaman, motor S/N, OP, tool / controller, Pset, joint, hedef, gerçek tork, açı, OK / NOK.'],
  'R-043': ['IMPLEMENTED', 'İstasyon başına controller ve tool online durumu ve son heartbeat (Tork ekranı, istasyon paneli).'],
  'R-045': ['IMPLEMENTED', 'KPI şeridi (süren vardiya) ve KPI & Raporlar: Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme, vardiya çıkışı ve vardiya karşılaştırması (`kpi.ts`, `reports.ts`; testli). Formüller Metrik Rehberi\'nde ve docs/kpi-tanimlari.md\'de; müşteri onayı bekliyor (acik-konular.md E1).'],
  'R-046': ['IMPLEMENTED', 'İstasyon bazında gerçekleşen / hedef / takt grafiği (Kontrol Merkezi: son 8 çevrim; KPI & Raporlar: seçilen pencere) ve zamana göre çevrim trendi.'],
  'R-047': ['IMPLEMENTED', 'Darboğaz çevrim verisinden otomatik: Kontrol Merkezi\'nde son 8 çevrim, raporda seçilen penceredeki ortalama; sıralama ve takt karşılaştırmasıyla (testli). Algoritma varsayımdır (acik-konular.md E2).'],
  'R-048': ['IMPLEMENTED', 'Hata Pareto\'su ve alarm kaynakları Pareto\'su (Kalite & Rework, Alarm Merkezi, KPI & Raporlar).'],
  'R-049': ['IMPLEMENTED', 'KPI & Raporlar üretim günü ve vardiyayla (A / B / C / tüm gün) filtrelenir; filtre adres çubuğunda paylaşılabilir. Veri toplanmadan önceki süre hesaba girmez, ekranda "kısmi veri" olarak işaretlenir (testli).'],
  'R-056': ['PARTIAL', 'Alarm kuralları ana veride: severity, eskalasyon süresi, varsayılan ekip, açık / kapalı (eskalasyon testli). Admin ekranı Faz 6.'],
  'R-057': ['IMPLEMENTED', 'Bakım & Entegrasyon sağlık kutuları: fabrika SQL Server (collector son turu / hatası), canlı veri kanalı (veri tazeliği), PLC, tork controller / tool, kamera, uygulama veritabanı; collector tur geçmişi ve "Şimdi çek" (tarayıcı testi; gerçek SQL Server\'la doğrulandı).'],
  'R-059': ['PARTIAL', 'PLC verisi sözleşmesi tanımlı; collector SQL Server\'dan okuyup işliyor (`server/collector/sqlReader.ts`, Docker\'daki SQL Server ile uçtan uca denendi). Gerçek tablo eşlemesi proje başında.'],
  'R-060': ['PARTIAL', 'Tork verisi sözleşmesi tanımlı; SQL Server\'dan okunup işleniyor. Gerçek eşleme proje başında.'],
  'R-061': ['PARTIAL', 'Vision verisi sözleşmesi tanımlı; SQL Server\'dan okunup işleniyor. Gerçek eşleme proje başında.'],
  'R-063': ['IMPLEMENTED', 'Üretim olayları kaynak zaman damgasını (UTC, ms) taşır; alarm ve kullanıcı işlemleri sunucu saatiyle damgalanır.'],
  'R-064': ['IMPLEMENTED', 'Motor (S/N), iş emri, komponent S/N (tekillik kontrolü), alarm (ALM-…), rework (RW-…), not (NT-…), Andon (AN-…), HOLD (HU-…), audit (AU-…) benzersiz kimlikli.'],
  'R-066': ['IMPLEMENTED', 'Beyaz / kırık beyaz zemin; koyu tema yok (`src/index.css`).'],
  'R-067': ['IMPLEMENTED', 'Açık mavi bilgi ve seçim (seçili istasyon, sekmeler), soft pembe kritik / NOK, pastel sarı uyarı / takt riski ekranlarda kullanılıyor.'],
  'R-068': ['IMPLEMENTED', 'KPI değerleri, tablolar ve panel başlıkları yüksek kontrastlı; metin tonları WCAG AA\'ya göre ayarlı.'],
  'R-069': ['IMPLEMENTED', 'OP kodları ayrı, dar ve kalın yazı yüzüyle (Barlow Semi Condensed) her yerde öne çıkıyor (`.opcode`).'],
  'R-070': ['IMPLEMENTED', 'Durumlar her yerde ikon + metinle; grafikte takt üstü çubuklar etiketli.'],
  'R-074': ['IMPLEMENTED', 'Sunucuya ulaşılamazsa "Sunucuya ulaşılamıyor", fabrika verisi gecikirse "Fabrika verisi gecikiyor" uyarısı; eldeki veri ekranda kalır (tarayıcı testiyle doğrulandı).'],
  'R-076': ['PARTIAL', 'docs/mimari.md, docs/sql-veri-sozlesmesi.md, docs/kpi-tanimlari.md, docs/acik-konular.md. Detay tasarım dokümanı Faz 6.'],
  'R-077': ['PARTIAL', 'Kontrol Merkezi, Motor Takibi, Kalite & Rework, Alarm Merkezi, Tork, KPI & Raporlar, Teknisyen Terminali, Bakım & Entegrasyon ve Metrik Rehberi etkileşimli olarak çalışıyor (kurulumsuz demo dahil). Admin ekranları Faz 6.'],
}

const NOTES = {
  'R-002': 'Sapma: veri SQL Server\'dan 3–5 dk\'da bir çekilecek; 1–3 sn hedefi karşılanamaz (bkz. acik-konular.md A2).',
  'R-065': 'Tercih edilen WebSocket kullanılmayacak (kullanıcı kararı); REST + yoklama.',
  'R-050': 'Kimlik doğrulama yöntemi (lokal / Active Directory) netleşmedi (baseline §16); şu an lokal kullanıcı.',
  'R-075': 'Teknik kapsam netleşmedi (baseline §16).',
  'R-080': 'Sözleşme kapsamına bağlı.',
}

const src = readFileSync('01_customer_requirements_clean.md', 'utf8').split('\n')
const reqs = []
let section = ''
for (let i = 0; i < src.length; i++) {
  const h = src[i].match(/^# (\d+)\. (.+)$/)
  if (h) section = `${h[1]}. ${h[2]}`
  const m = src[i].match(/^- \*\*(R-\d{3})(?: \[(High|Medium)\])?\*\* (.+)$/)
  if (!m) continue
  let text = m[3]
  const subs = []
  while (src[i + 1]?.startsWith('  - ')) subs.push(src[++i].slice(4).trim())
  if (subs.length) text += ' ' + subs.join(', ')
  reqs.push({ id: m[1], prio: m[2] ?? '—', text, section })
}

const esc = (s) => s.replace(/\|/g, '\\|')
const counts = { IMPLEMENTED: 0, PARTIAL: 0, MISSING: 0, UNCLEAR: 0 }
let body = ''
let cur = ''
for (const r of reqs) {
  if (r.section !== cur) {
    cur = r.section
    body += `\n## ${cur}\n\n| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |\n|---|---|---|---|---|---|\n`
  }
  const [st, ev] = STATUS[r.id] ?? ['MISSING', '']
  counts[st]++
  const note = [ev, NOTES[r.id]].filter(Boolean).join(' ')
  body += `| ${r.id} | ${r.prio} | ${esc(r.text)} | ${phase(Number(r.id.slice(2)))} | \`${st}\` | ${esc(note)} |\n`
}

const out = `# İzlenebilirlik Matrisi — R-001…R-081

Kaynak: \`01_customer_requirements_clean.md\`. Durumlar baseline §18 kurallarıyla verilir: bir ister ancak istenen davranışı gösteren **kod kanıtı** varsa \`IMPLEMENTED\` sayılır; benzer isimli dosya / bileşen / yorum yeterli değildir. Kullanıcıya henüz görünmeyen davranışlar \`PARTIAL\`'dır.

| Durum | Anlamı |
|---|---|
| \`IMPLEMENTED\` | Davranış kodda var ve kullanıcıya sunuluyor; kanıt sütununda gösterildi |
| \`PARTIAL\` | Bir kısmı var; eksik kısım kanıt sütununda yazılı |
| \`MISSING\` | Henüz yok |
| \`UNCLEAR\` | İster netleşmeden değerlendirilemiyor |

**Son güncelleme:** Faz ${PHASE_DONE} sonu. Faz sütunu plandaki hedef fazı gösterir. Üretmek için: \`npm run docs:matrix\`.

**Özet:** ${reqs.length} ister · IMPLEMENTED ${counts.IMPLEMENTED} · PARTIAL ${counts.PARTIAL} · MISSING ${counts.MISSING} · UNCLEAR ${counts.UNCLEAR}
${body}`
writeFileSync('docs/izlenebilirlik-matrisi.md', out)
console.log(`${reqs.length} ister`, counts)
