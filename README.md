# TM50 Montaj Hattı — Üretim İzleme ve İzlenebilirlik

TM50 iki zamanlı 4 silindirli motorun montaj hattı için web tabanlı izleme ve izlenebilirlik yazılımı. Kapsam:

- 13 ana operasyon (OP005–OP110) ve 5 ön montaj hücresi (OP201–OP206)
- motor bazında komponent izlenebilirliği
- OP100 kalite kapısı ve rework
- tork
- alarm ve Andon
- KPI
- teknisyen terminali ve admin

Kapsamın kaynağı [`01_customer_requirements_clean.md`](01_customer_requirements_clean.md).

**Kurulumsuz demo:** <https://ahmethamdiozen.github.io/assembly-line/> (rol seçerek giriş; hat ve fabrika verisi tarayıcıda simüle edilir).

> **Durum: 1.0.0 — teslim sürümü (Faz 6).** Bütün ekranlar hazır: Kontrol Merkezi, Motor Takibi, Kalite & Rework, Alarm & Andon, Tork, KPI & Raporlar, Teknisyen Terminali, Bakım & Entegrasyon, Admin ve Metrik Rehberi. Sunucu modunda (SQL Server → collector → SQLite → API) ve kurulumsuz demo olarak çalışıyor. URS kabul kriterleri AC-01…AC-10 otomatik test ediliyor ([`docs/kabul-sonuclari.md`](docs/kabul-sonuclari.md)). İsterlerin durumu: [`docs/izlenebilirlik-matrisi.md`](docs/izlenebilirlik-matrisi.md).

## Çalıştırma

İki mod var:

| | Sunucu modu | Demo modu |
|---|---|---|
| Ne çalışır | SQL Server (Docker) + simülatör + collector + API + arayüz | Her şey tarayıcıda |
| Gereken | Node.js 22.13+ (24 LTS önerilir), Docker Desktop | Node.js (ya da yalnızca derlenmiş dosyalar) |
| Giriş | Personel no / kart + PIN | Rol seçerek |

### Sunucu modu

1. Gereksinimler:
   - [Node.js](https://nodejs.org) **22.13 veya üzeri** (uygulama veritabanı için Node'un yerleşik `node:sqlite` modülü kullanılır).
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/). **Apple Silicon Mac'lerde** Settings → General → *"Use Rosetta for x86_64/amd64 emulation on Apple Silicon"* açık olmalı.
2. Kurulum ve çalıştırma:
   ```bash
   cp .env.example .env     # Windows: copy .env.example .env
   npm install
   npm run db:up            # SQL Server'ı başlatır (ilk seferde ~1,5 GB imaj iner)
   npm run stack            # simülatör + sunucu + arayüz
   ```
3. Tarayıcıda **http://localhost:5173** adresini açın ve giriş yapın. Geliştirme ortamında herkesin ilk PIN'i `1234`'tür (`DEFAULT_PIN`; canlıya almadan önce değiştirin). Örnek kullanıcılar:

| Personel no | Kişi | Rol |
|---|---|---|
| `T-1044` | Ece Kara | Teknisyen (OP070) |
| `S-0101` | Levent Acar | Üretim Lideri / Supervisor |
| `Q-0201` | Aslı Tekin | Kalite |
| `M-0301` | Hasan Yurt | Bakım / Otomasyon |
| `A-0001` | Sistem Yöneticisi | Admin |

Personel no yerine kart numarası da kullanılabilir (geliştirmede `RF` + numaranın rakamları, ör. `RF1044`).

İlk açılışta simülatör son 24 saati SQL Server'a yazar (~0,5 sn), collector onu okur (~1 sn), sonra her şey gerçek saatle akar. Simülatör 5 sn'de bir SQL Server'a yazar. Collector varsayılan olarak 3 dk'da bir okur (`COLLECT_INTERVAL_MIN`, 3–5 arası). Bakım ve admin rolleri "Şimdi çek" ile beklemeden okutabilir.

- **Kapatmak:** `Ctrl + C`. SQL Server'ı kapatmak için `npm run db:down` (veriler Docker volume'ünde kalır).
- **Sıfırlamak:** stack kapalıyken `npm run sim:reset` çalıştırın. SQL Server tabloları **ve** uygulama veritabanı (`data/tm50.db`) silinir, son 24 saat yeniden üretilir. Sunumdan hemen önce önerilir.
- **Sunucu kapanırsa:** ekranda "Sunucuya ulaşılamıyor" uyarısı çıkar ve eldeki veri gösterilmeye devam eder. Collector SQL Server'a ulaşamazsa "Fabrika verisi gecikiyor" uyarısı çıkar.

**Windows:** Docker Desktop for Windows'u kurun (WSL 2 ister). PowerShell'de yukarıdaki adımları uygulayın. Docker kurmak istemezseniz SQL Server 2022 Express de kullanılabilir:
- Kurulumda Mixed Mode seçin ve TCP/IP'yi 1433 portunda açın.
- `.env`'deki `MSSQL_*` değerlerini kendi kurulumunuza göre ayarlayın.
- `npm run db:up` adımını atlayın.

### Demo modu

```bash
npm run dev:demo   # http://localhost:5173 — backend gerekmez
```

- **Veri:** Simülasyon tarayıcıda son 24 saati üretir. Fabrika verisi gerçek sistemdeki gibi 3 dk'da bir "çekilir".
- **Kontroller:** Kontrol Merkezi'ndeki hız düğmeleri (1x–10x) zamanı hızlandırır, **Sıfırla** simülasyonu baştan kurar.
- **Doğrudan bağlantı:**
  - `#/?op=OP070&tab=notlar` istasyonu ve sekmeyi seçili açar (sekmeler: `genel`, `proses`, `kalite`, `varlik`, `notlar`, `gecmis`).
  - `#/motor/<seri no>` motorun geçmişini, `#/alarmlar?id=<ALM-…>` alarmı açar.
  - `#/kpi?gun=2026-10-03&vardiya=A&op=OP070` raporu o gün, vardiya ve trend istasyonuyla açar.
  - `#/terminal/OP070?kiosk=1` istasyon tableti için menüsüz terminal görünümüdür. Kiosk'tan "Çıkış", istasyon girişini ve oturumu birlikte kapatır.
  - `#/bakim?tab=ham` ham fabrika tablolarını, `tab=log` uygulama loglarını açar (Bakım ve Admin rolleri).
- **Demo personeli:** Demoda koşulu bitmiş eski alarmları vardiya amiri onaylar, ilgili ekip kapatır; iki örnek Andon çağrısı vardır (`src/sim/demoActors.ts`). Sunucu modunda bu yoktur; alarmları gerçek kullanıcılar yönetir.

### Canlı kurulum

Fabrika sunucusuna kurulum, servis olarak çalıştırma, HTTPS, yedek ve güncelleme: [`docs/kurulum.md`](docs/kurulum.md). Kısaca:

```bash
npm ci && npm run build && npm run build:server
npm start          # arayüz ve API aynı adreste; dist/ ve dist-server/
```

### Yedekleme

Sunucu her gün Admin → Saklama & yedek'te ayarlanan saatte otomatik yedek alır; Admin ekranından "Şimdi yedek al" da var. Komut satırından:

```bash
npm run db:backup                          # backups/tm50-YYYYMMDD-HHMM.db (sunucu çalışırken de alınabilir)
npm run db:restore -- backups/tm50-....db  # sunucu KAPALIYKEN
```

Sunucu logları `logs/app.log` dosyasına yazılır (JSON satırları). Her istek loglanmaz; hatalar, 1 sn'den yavaş istekler, collector turları ve hatalı girişler yazılır. Dosya açılışta 20 MB'ı geçtiyse `logs/app.log.1` olarak saklanır. Bakım ve Admin rolleri logları Bakım & Entegrasyon ekranında görür.

## Komutlar

```bash
npm test             # birim, veri hattı, depo ve API testleri (Vitest)
npm run test:kabul   # kabul testleri AC-01…AC-10: demoyu derler, başsız Chrome'la çalıştırır → docs/kabul-sonuclari.md
npm run typecheck    # arayüz + sunucu TypeScript kontrolü
npm run lint         # oxlint
npm run build        # dist/ — arayüz
npm run build:server # dist-server/ — sunucu (npm start)
npm run build:demo   # kurulumsuz demo
npm run docs:matrix  # izlenebilirlik matrisini yeniden üret
```

`main` dalına her gönderimde GitHub Actions lint, testler ve kabul testlerini çalıştırır, geçerse demoyu GitHub Pages'te yayınlar (`.github/workflows/pages.yml`).

## Dokümanlar

| Doküman | İçerik |
|---|---|
| [`docs/kullanim-kilavuzu.md`](docs/kullanim-kilavuzu.md) | Rollere göre kullanım ve admin kılavuzu |
| [`docs/kurulum.md`](docs/kurulum.md) | Canlı kurulum, servis, HTTPS, yedek / geri yükleme, güncelleme, sorun giderme |
| [`docs/mimari.md`](docs/mimari.md) | Veri yolu, iki mod, klasörler, güvenlik, kararlar |
| [`docs/detay-tasarim.md`](docs/detay-tasarim.md) | Bileşenler, uygulama veritabanı, akışlar, rol izinleri, ekranlar, hata yönetimi |
| [`docs/acik-konular.md`](docs/acik-konular.md) | Müşteriye sorulacaklar ve cevap gelene kadar geçerli varsayımlar |
| [`docs/sql-veri-sozlesmesi.md`](docs/sql-veri-sozlesmesi.md) | Fabrika SQL Server'ından beklenen tablolar ve collector'ın her birini nasıl işlediği |
| [`docs/kpi-tanimlari.md`](docs/kpi-tanimlari.md) | KPI formülleri, istasyon durumları, alarm kuralları, rework akışı |
| [`docs/api.md`](docs/api.md) | REST API uç noktaları, oturum, rol izinleri |
| [`docs/kabul-testleri.md`](docs/kabul-testleri.md) | AC-01…AC-10 ve SAT senaryoları |
| [`docs/kabul-sonuclari.md`](docs/kabul-sonuclari.md) | Son otomatik kabul testi sonuçları |
| [`docs/izlenebilirlik-matrisi.md`](docs/izlenebilirlik-matrisi.md) | R-001…R-081 → durum ve kod kanıtı |

## Proje yapısı

```
src/domain/     ana veri (lineDef), tipler, depo arayüzü (Store, MemoryStore), alarm ve rework kuralları,
                ekran görünümleri, KPI ve raporlar, komutlar (RBAC + audit), terminal, admin   ← sunucu ve tarayıcı ortak
src/pipeline/   SQL Server satır tipleri (rows), bellek içi "SQL Server" (rawDb), collector dönüştürücüsü (transform)
src/sim/        deterministik hat simülatörü ve demo hikâyeleri
src/data/       Backend arayüzü: ApiBackend (REST) ve DemoBackend (tüm zincir tarayıcıda)
src/components/, src/pages/   arayüz (src/pages/admin/: Admin sekmeleri)
server/         simulator/ (SQL Server'a yazar), collector/ (SQL Server'dan okur), api/ (Fastify),
                auth/ (giriş, oturum, kimlik bilgileri), db/ (SQLite deposu, migration, yedek), sql/schema.sql (fabrika şeması)
scripts/        izlenebilirlik matrisi üreticisi, kabul testi koşucusu
docs/           dokümanlar
```

Stack: Vite + React 19 + TypeScript · Tailwind v4 · Apache ECharts · AG Grid Community · Zustand · Fastify · mssql · node:sqlite.
