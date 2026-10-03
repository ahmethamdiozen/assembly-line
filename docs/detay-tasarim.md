# Detay Tasarım

Analiz ve detay tasarım dokümanı (R-076). Üst düzey mimari ve kararlar [`mimari.md`](mimari.md)'de, fabrika veri sözleşmesi [`sql-veri-sozlesmesi.md`](sql-veri-sozlesmesi.md)'de, hesap tanımları [`kpi-tanimlari.md`](kpi-tanimlari.md)'de, REST API [`api.md`](api.md)'de, açık konular ve varsayımlar [`acik-konular.md`](acik-konular.md)'de.

## 1. Bileşenler ve sorumluluklar

| Bileşen | Kod | Sorumluluk |
|---|---|---|
| Ana veri | `src/domain/lineDef.ts`, `types.ts` | 13 ana + 5 ön montaj istasyonu, besleme ilişkileri, 7 komponent, alarm kuralları, hata kodları, kişiler, hat ayarları, sistem ayarları (saklama, yedek). Uygulama veritabanında (`kv.master`) tutulur; `normalizeMaster` eski kayıtları yeni alanlarla tamamlar. |
| Veri hattı | `src/pipeline/` | Fabrika satır tipleri (`rows.ts`), bellek içi "SQL Server" (`rawDb.ts`, demo ve testler), dönüştürücü (`transform.ts`): satırları zaman sırasıyla işleyip motor, operasyon, komponent, tork, kalite, istasyon durumu, cihaz ve IO kayıtlarını üretir; alarm kurallarını çalıştırır. |
| Collector | `server/collector/` | 3–5 dk'da bir `Id > son okunan` ile salt-okur okuma (`sqlReader.ts`), parça parça işleme, tur kaydı, hata ve kaynak sıfırlanma kontrolü (`Collector.ts`). |
| Depo | `src/domain/store/`, `server/db/` | Senkron `Store` arayüzü: `MemoryStore` (demo, testler) ve `SqliteStore` (sunucu). Aynı sözleşme testlerinden geçer. Migration'lar `server/db/sqlite.ts`, sütunlar `schema.ts`. |
| Görünümler | `src/domain/lineState.ts`, `overview.ts`, `views.ts`, `reports.ts`, `maintenance.ts`, `terminal.ts` | Ekranların veri modelleri; saf fonksiyonlar. Demo doğrudan çağırır, API aynı fonksiyonlarla JSON üretir. |
| Komutlar | `src/domain/commands.ts`, `terminal.ts`, `admin.ts` | Yetki kontrolü + iş kuralı + audit; tek transaction. Demo ve API aynı komutları kullanır. |
| Yetki | `src/domain/rbac.ts` | İzin listesi, varsayılan rol → izin eşlemesi, sürümler arası izin taşıma. |
| Kimlik | `server/auth/auth.ts` | PIN / şifre (scrypt), kart no, kilit, oturum (hash'li anahtar), kimlik bilgisi yönetimi. |
| API | `server/api/` | Fastify REST; oturum kontrolü, hata eşlemesi, güvenlik başlıkları, derlenmiş arayüzün sunulması (`static.ts`), admin uç noktaları (`admin.ts`). |
| Sunucu işleri | `server/index.ts`, `server/db/backupLib.ts`, `server/shared/logs.ts` | Ana veri yenileme, günlük yedek ve saklama temizliği, log döndürme. |
| Arayüz | `src/pages/`, `src/components/`, `src/data/` | React ekranları; `Backend` arayüzü (`ApiBackend` REST yoklama, `DemoBackend` tüm zincir tarayıcıda). |
| Simülatör | `src/sim/`, `server/simulator/` | Deterministik hat simülasyonu ve demo hikâyeleri; geliştirmede fabrika tarafının yerini tutar. |

## 2. Uygulama veritabanı

SQLite (WAL). Tüm satırların benzersiz `id`'si vardır (R-064). Zamanlar epoch ms (UTC).

| Tablo | İçerik | Yazan |
|---|---|---|
| `motor` | Seri no, iş emri, varyant, durum (hatta / HOLD / rework / tamamlandı), bulunduğu istasyon, ilk geçiş sonucu | collector |
| `motor_op` | Motor × istasyon operasyonu: giriş, çıkış, cycle, operatör no, sonuç, deneme no | collector |
| `component_install` | Takılan komponent seri no, lot, istasyon, zaman; rework'te sökülenler | collector |
| `tightening` | Sıkma: controller, tool, Pset, joint, hedef / min / max, tork, açı, sonuç | collector |
| `quality_result`, `quality_image` | OP100 kararı (OK / NOK / HOLD), hata kodu, deneme no; görüntü kayıtları | collector |
| `station_span` | İstasyon durum aralıkları (çalışıyor, boş, bloke, arıza, durdu) ve arıza kodu | collector |
| `sub_sample` | Ön montaj sayaç örnekleri (üretilen, NOK, buffer) | collector |
| `device`, `io_state` | Cihazların son heartbeat'i ve online durumu; istasyon sinyallerinin son değeri | collector |
| `alarm`, `alarm_event` | Alarm (koşul + yaşam döngüsü) ve olayları | collector, kullanıcı |
| `rework`, `rework_event` | Rework kaydı ve adım geçişleri | collector, kullanıcı |
| `motor_hold` | HOLD (vision ya da kullanıcı) ve kararı | collector, kullanıcı |
| `note`, `andon` | Teknisyen notları ve Andon çağrıları | kullanıcı |
| `station_login`, `op_confirmation` | Teknisyen istasyon girişleri; "operasyonu tamamla" onayları | kullanıcı |
| `audit_log` | Kullanıcı, zaman, işlem, kayıt, önce / sonra (JSON) | tüm komutlar |
| `kv` | Ana veri (`master`), rol izinleri (`rbac`), ana veri sürümü, okuma konumu (`sync`), veri tazeliği (`watermark`), collector turları, sayaçlar, günlük iş işaretleri | sistem |
| `app_user`, `session` | Kimlik bilgileri (PIN hash'i, kart no, aktiflik, kilit) ve oturumlar (anahtar hash'i) | kimlik |

İndeksler sık süzülen alanlardadır (`server/db/schema.ts`). Migration sürümleri: 1 uygulama tabloları ve kimlik; 2 istasyon girişi ve operasyon onayı.

## 3. Akışlar

### 3.1 Collector turu

1. Okuma konumunu (`kv.sync`, tablo başına son Id) al. SQL Server'daki en büyük Id'ler okunan konumun gerisindeyse dur (kaynak sıfırlanmış olabilir).
2. Her tablodan `Id > son` en fazla 50 000 satır oku.
3. Okuma anından 15 sn yakın satırları sonraki tura bırak (tablolar arası yazma gecikmesine karşı). Kalanları zaman sırasıyla birleştir.
4. Tek transaction'da işle: motor / operasyon / komponent / tork / kalite / durum / cihaz / IO kayıtları; alarm koşullarını aç / kapat; rework ve HOLD'un sistem adımları (re-QC başlangıcı ve sonucu); okuma konumu ve veri tazeliği.
5. Tur kaydını yaz (zaman, satır, süre, hata). Birikme varsa 2'ye dön.
6. Sonraki tur: başarılıysa çekme aralığı sonra, hata varsa 15 sn sonra.

Artımlı okumanın tek seferde okumayla aynı sonucu verdiği testle doğrulanır (`src/pipeline/pipeline.test.ts`).

### 3.2 Kullanıcı komutu

```
Arayüz ─(REST)─▶ API: oturum → actor (rol izinleri her istekte güncel) ─▶ komut
komut: izin kontrolü (403) → iş kuralı (400) → transaction { kayıt + audit } → sonuç
Arayüz: veri olayı → açık ekranlar yeniden sorgular; diğer kullanıcılar ≤ 15 sn'de görür
```

Ana veriyi değiştiren admin komutları ayrıca ana veri sürümünü artırır. Sunucu indeksi ve collector aralığını hemen yeniler; diğer kullanıcıların arayüzü durum yoklamasında sürüm değişikliğini görüp ana veriyi ve izinlerini yeniden yükler.

### 3.3 Rework

```
OP100 NOK ─▶ Triage ─▶ Diagnosis ─▶ Rework Bench ─▶ Ready for Re-QC ─▶ (OP100'e giriş) Re-QC ─▶ OK: kapandı
               ▲   kullanıcı adımları; tezgâha geçmeden kök neden ve operatör          sistem      │
               └──────────────────────────────── NOK: yeni tur ◀───────────────────────────────────┘
```

### 3.4 Alarm

Koşul (açık / bitti) ile yaşam döngüsü (Detected → Acknowledged → Assigned → Closed) ayrıdır. Koşul sürdükçe aynı anahtar için ikinci alarm açılmaz. Kuraldaki sürede onaylanmayan alarm eskale olur.

### 3.5 Teknisyen terminali

İstasyona giriş → yetkinlik kontrolü (eksikse ret + audit) → önceki girişler kapanır → aktif görev kartı → kontrol listesi → "operasyonu tamamla" (istasyondaki motor ve deneme başına bir kez). Giriş vardiya sonunda geçersiz olur.

## 4. Varsayılan rol izinleri

| İzin | Teknisyen | Üretim Lideri | Kalite | Bakım | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Not ekleme | ✓ | ✓ | ✓ | ✓ | ✓ |
| Andon açma | ✓ | ✓ | | | ✓ |
| Motoru HOLD'a alma | ✓ | ✓ | ✓ | | ✓ |
| Operasyonu tamamlama, istasyona giriş | ✓ | | | | ✓ |
| Alarm onay / atama / kapatma | | ✓ | ✓ | ✓ | ✓ |
| Rework yönetimi | | ✓ | ✓ | | ✓ |
| HOLD kararı | | | ✓ | | ✓ |
| "Şimdi çek", loglar ve sistem bilgisi | | | | ✓ | ✓ |
| Audit görüntüleme | | | | | ✓ |
| Yönetim (istasyon, kullanıcı / rol, besleme, alarm kuralı, entegrasyon, saklama) | | | | | ✓ |

Görüntüleme tüm giriş yapmış kullanıcılara açıktır. Matris Admin → Kullanıcılar & roller'den değiştirilir; admin rolünden kullanıcı yönetimi izni kaldırılamaz.

## 5. Ekranlar

| Ekran | Kod | İsterler |
|---|---|---|
| Giriş | `src/pages/Login.tsx` | R-005, R-050 |
| Kontrol Merkezi | `ControlCenter.tsx`, `components/line/`, `components/control/` | R-003, R-012–R-026 |
| Motor Takibi | `MotorTrace.tsx` | R-027–R-032 |
| Kalite & Rework | `QualityRework.tsx` | R-033–R-036, R-048 |
| Alarm & Andon | `Alarms.tsx` | R-037–R-041 |
| Tork | `Torque.tsx` | R-042–R-044 |
| KPI & Raporlar | `Kpi.tsx` | R-045–R-049 |
| Teknisyen Terminali | `Terminal.tsx` | R-006, R-050–R-052 |
| Bakım & Entegrasyon | `Maintenance.tsx` | R-009, R-024, R-057, R-073 |
| Admin | `Admin.tsx`, `pages/admin/` | R-010, R-053–R-058, R-075 |
| Metrik Rehberi | `Guide.tsx` | R-045–R-047 |

Görsel dil: açık tema, beyaz / kırık beyaz zemin; açık mavi bilgi ve seçim, soft pembe kritik / NOK, pastel sarı uyarı; durum her zaman renk + ikon + metin (R-066–R-070). OP kodları ve sayılar dar yüzlü (Barlow Semi Condensed) yazılır.

## 6. Hata yönetimi

| Durum | Davranış |
|---|---|
| Yetkisiz işlem | 403; arayüz yetkisiz düğmeleri zaten gizler |
| Geçersiz istek / iş kuralı | 400 ve Türkçe açıklama (ör. "Kök neden yazılmalı", "Vardiyalar 24 saati kaplamalı") |
| Oturum yok / süresi doldu | 401; arayüz giriş ekranına döner |
| Fabrika SQL Server'ına ulaşılamıyor | Collector hatayı tur kaydına ve loga yazar, 15 sn'de bir dener; ekranlarda "Veri gecikiyor" |
| API'ye ulaşılamıyor | Arayüz "Sunucuya ulaşılamıyor" gösterir, eldeki veriyi tutar, 5 sn'de bir yeniden dener |
| Beklenmeyen hata | 500, ayrıntı sadece uygulama logunda |

## 7. Test stratejisi

- **Birim:** Alan mantığı (KPI, rework, alarm, yetkinlik, admin doğrulamaları), dönüştürücü, simülatör determinizmi.
- **Sözleşme:** Aynı testler bellek ve SQLite deposunda.
- **Veri hattı:** Artımlı okuma = tek seferde okuma; SQLite ve bellek deposu aynı sonuç.
- **API:** `fastify.inject` ile geçici SQLite üzerinde oturum, yetki, komutlar, admin, audit, CSV.
- **Kabul:** AC-01…AC-10 başsız Chrome'la ([`kabul-testleri.md`](kabul-testleri.md)).
- **Sürekli:** GitHub Actions her gönderimde hepsini çalıştırır.
