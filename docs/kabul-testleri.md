# Kabul Testleri (FAT / SAT)

URS kabul kriterleri AC-01…AC-10 ve isterlerle eşlemeleri (baseline §17) için test senaryoları (R-081). Son otomatik çalıştırmanın sonuçları: [`kabul-sonuclari.md`](kabul-sonuclari.md).

## Nasıl çalıştırılır

| Seviye | Ne | Nasıl |
|---|---|---|
| Birim ve API | Alan mantığı, veri hattı, komutlar, yetki, audit, migration, admin uç noktaları (~150 test) | `npm test` |
| Kabul (otomatik) | AC-01…AC-10, kurulumsuz demoda gerçek tarayıcıda (başsız Chrome) | `npm run test:kabul` → `docs/kabul-sonuclari.md` |
| Sürekli | Her `main` gönderiminde lint, testler ve kabul testleri; biri kalırsa demo yayınlanmaz | GitHub Actions (`.github/workflows/pages.yml`) |
| FAT | Sunucu modu, Docker'daki simüle SQL Server ile; aşağıdaki senaryolar elle | `npm run db:up && npm run stack` |
| SAT | Fabrikada, gerçek SQL Server ve gerçek kullanıcılarla; aşağıdaki senaryolar + SAT-01…SAT-06 | [`kurulum.md`](kurulum.md) sonrası |

FAT ve SAT'ta her senaryo için sonuç (Geçti / Kaldı), tarih, uygulayan ve not bu dokümanın sonundaki tabloya işlenir.

## Senaryolar

### AC-01 — Hat yapısı (R-011, R-016)

- **Ön koşul:** Herhangi bir rolle giriş.
- **Adımlar:** Kontrol Merkezi'ni açın.
- **Beklenen:** 13 ana istasyon (OP005, OP010, OP015, OP020, OP030, OP040, OP050, OP060, OP070, OP080, OP090, OP100, OP110) hat sırasıyla görünür. Altta 5 ön montaj hücresi (OP201, OP202, OP203, OP205, OP206) beslediği ana hat istasyonuyla görünür.
- **Otomatik:** `kabul-testi.mjs` AC-01; `src/domain/lineDef.test.ts`.

### AC-02 — Seçili istasyon (R-014)

- **Adımlar:** Kontrol Merkezi'nde OP050'ye, sonra OP080'e tıklayın.
- **Beklenen:** Sayfa değişmeden sağdaki Seçili İstasyon paneli tıklanan istasyonun bilgisini gösterir. Panelde 6 sekme vardır (Genel, Proses, Kalite & Tork, Varlık & IO, Notlar, Geçmiş).
- **Otomatik:** AC-02.

### AC-03 — İstasyon bilgisi (R-013)

- **Adımlar:** Hat görselindeki istasyon kutularına bakın.
- **Beklenen:** Her kutuda OP kodu, insanlı istasyonda teknisyen adı ya da otomatik / robot tipi, durum (renk + ikon + metin) ve çevrim süresi; konveyörde motorlar seri numarasıyla görünür.
- **Otomatik:** AC-03.

### AC-04 — Motor tamamlanma ve geçmiş (R-030, R-031)

- **Adımlar:** Hattın ortasındaki bir motora tıklayın (Motor Takibi açılır).
- **Beklenen:** Tamamlanma yüzdesi 13 operasyon üzerinden hesaplanır (ör. 6 / 13 = %46). Operasyon geçmişinde her operasyon için giriş, çıkış, cycle, teknisyen, takılan parça ve sonuç vardır.
- **Otomatik:** AC-04; `src/domain/views.test.ts`, `src/pipeline/transform.test.ts`.

### AC-05 — Takılan parçalar (R-028, R-029)

- **Adımlar:** Aynı motorun "Takılan parçalar" bölümüne bakın.
- **Beklenen:**
  - 7 seri numaralı komponent listelenir.
  - Takıldığı operasyon OK bitenler seri numarası ve lotla **Installed** olarak görünür.
  - Diğerleri **Pending** olarak görünür; okutulmuş ama operasyonu sürenler ayrıca belirtilir.
  - Aynı komponent seri numarası ikinci bir motorda okutulursa TRC-DUP alarmı açılır.
- **Otomatik:** AC-05; `transform.test.ts` (mükerrer seri no).

### AC-06 — Kalite kapısı ve rework (R-033, R-034, R-036)

- **Ön koşul:** Kalite rolüyle giriş.
- **Adımlar:**
  1. Kalite & Rework'te OP100 sonuçlarında NOK olan bir motoru bulun.
  2. Rework kartını Diagnosis'e, sonra kök neden ve rework operatörü yazarak Rework Bench'e, sonra Ready for Re-QC'ye alın.
  3. Motor OP100'e tekrar girip OK aldığında "Kapanan rework'ler"e bakın.
- **Beklenen:**
  - NOK motor rework kuyruğuna hata tipi, kaynak OP, öncelik ve sorumlu ekiple girer.
  - Kök neden ve operatör yazılmadan tezgâha geçilemez.
  - Re-QC OK ile kayıt kapanır; NOK ise yeni turla Triage'a döner.
- **Otomatik:** AC-06; `src/domain/lifecycle.test.ts`, `src/pipeline/transform.test.ts`.

### AC-07 — Alarm yaşam döngüsü (R-038)

- **Ön koşul:** Üretim Lideri rolüyle giriş.
- **Adımlar:** Alarm Merkezi'nde Detected durumundaki bir alarmı seçin; Onayla → Ata (Bakım Ekibi) → Kapat (kapanış notuyla).
- **Beklenen:** Dört adım (Detected, Acknowledged, Assigned, Closed) zaman ve kullanıcıyla işaretlenir. Teknisyen alarm onaylayamaz (düğme görünmez, API 403 döner).
- **Otomatik:** AC-07; `src/domain/commands.test.ts`, `server/api/app.test.ts`.

### AC-08 — Not, Andon, audit (R-025, R-040, R-058)

- **Adımlar:**
  1. Teknisyen olarak Teknisyen Terminali'nden OP070'e giriş yapın, not ekleyin ve malzeme Andon'u açın.
  2. Admin olarak Admin → Audit kaydında kullanıcıyı süzün.
- **Beklenen:** Not istasyon notlarında, Andon açık alarmlarda görünür. Audit'te `note.create` ve `andon.create` kayıtları kullanıcı adı ve zamanla vardır.
- **Otomatik:** AC-08; `commands.test.ts`, `app.test.ts`.

### AC-09 — KPI (R-045)

- **Adımlar:** KPI & Raporlar'ı açın; Bugün / Dün ve A / B / C vardiyalarını seçin.
- **Beklenen:** Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme ve vardiya çıkışları hesaplanmış görünür. Formüller Metrik Rehberi'nde açıklanır. Örnek hesap `kpi-tanimlari.md`'deki sentetik örnekle aynıdır.
- **Otomatik:** AC-09; `src/domain/kpi.test.ts`, `src/domain/reports.test.ts`.

### AC-10 — Admin ve entegrasyon sağlığı (R-010, R-053, R-055, R-056, R-057)

- **Ön koşul:** Admin rolüyle giriş.
- **Adımlar:**
  1. Admin → Hat & istasyonlar'da OP070'in hedef çevrimini değiştirin.
  2. Ön montaj beslemesi'nde OP206'nın buffer minimumunu değiştirin.
  3. Alarm kuralları'nda TQ-NOK'un eskalasyon süresini değiştirin.
  4. Audit kaydına bakın; Bakım & Entegrasyon'u açın.
- **Beklenen:**
  - Değişiklikler kaydedilir ve hemen tüm ekranlara uygulanır (ör. Metrik Rehberi yeni değerleri gösterir).
  - Geçersiz değer reddedilir (ör. boşluklu vardiya planı).
  - Her değişiklik audit'te önce / sonra değeriyle görünür.
  - Bakım ekranında fabrika SQL Server'ı, veri kanalı, PLC, tork, kamera ve uygulama veritabanının durumu görünür.
- **Otomatik:** AC-10; `src/domain/admin.test.ts`, `app.test.ts` ("API: Admin ve konfigürasyon").

## SAT ek senaryoları (fabrikada)

| # | Senaryo | Beklenen |
|---|---|---|
| SAT-01 | Gerçek SQL Server'a salt-okur kullanıcıyla bağlanma (Admin → Entegrasyon → Bağlantıyı test et); Bakım → Ham fabrika tabloları | Bağlantı tamam; 10 tablonun son satırları beklenen kolonlarla görünür |
| SAT-02 | Veri gecikmesi: hatta bir motorun OP110'dan çıktığı an ile ekranda tamamlandı görünmesi arasındaki süre | En fazla çekme aralığı + 15 sn (acik-konular.md A2) |
| SAT-03 | Bağlantı kesintisi: sunucunun ağ kablosu ya da servis durdurulur, sonra açılır | "Sunucuya ulaşılamıyor" görünür, eldeki veri kalır; bağlantı gelince kendiliğinden düzelir. SQL Server erişimi kesilince "Veri gecikiyor" görünür. |
| SAT-04 | Yedekten geri yükleme tatbikatı ([`kurulum.md`](kurulum.md) 6) | Geri yüklenen veritabanıyla uygulama açılır; motor geçmişi ve audit yerinde; collector kaldığı yerden devam eder |
| SAT-05 | HTTPS ve oturum: tarayıcıda sertifika uyarısı yok; HTTP adresi kullanılmıyor; oturum çerezi Secure / HttpOnly | Tarayıcı geliştirici araçlarında doğrulanır |
| SAT-06 | Kart okuyucu: teknisyen kartını okutarak giriş yapar; terminalde istasyona girer | Kart no personel no yerine kabul edilir; eksik yetkinlikte giriş reddedilir |
| SAT-07 | Performans: 1920 × 1080 ekranda her ekranın açılması ve istasyon seçimi | 2 sn içinde (R-071) |

## Sonuç tablosu (FAT / SAT)

| Senaryo | Ortam | Tarih | Uygulayan | Sonuç | Not |
|---|---|---|---|---|---|
| AC-01 … AC-10 | Demo (otomatik) | bkz. [`kabul-sonuclari.md`](kabul-sonuclari.md) | CI | | |
| AC-01 … AC-10 | FAT (sunucu, simüle SQL Server) | | | | |
| AC-01 … AC-10, SAT-01 … SAT-07 | SAT (fabrika) | | | | |
