# Mimari

## Veri yolu

```
[Hat simülatörü] ─▶ [SQL Server] ─3–5 dk─▶ [Collector] ─▶ [SQLite: uygulama DB'si] ─▶ [API (REST)] ─15 sn─▶ [Ekranlar]
 fabrika tarafı      bize verilecek         artımlı okur,   genealogy, alarm, rework,        ▲
 (gerçekte kalkar)   (salt-okur)            dönüştürür,     not, kullanıcı, audit            │
                                            alarm kuralları                                  │
                     [Kullanıcı komutları: not, Andon, HOLD, alarm, rework, admin] ─ RBAC + audit
```

- **Fabrika tarafı:** PLC, tork controller'ları ve vision sistemi verilerini fabrikanın SQL Server'ına yazar. Geliştirmede bunu simülatör yapar. Gerçek veri geldiğinde simülatör kalkar, geri kalan her şey aynen çalışır.
- **Collector:** sunucu sürecinin içinde zamanlanmış bir iştir. Çekme aralığı Admin → Entegrasyon'dan ayarlanır (3–5 dk; ilk değer `COLLECT_INTERVAL_MIN`). Her turda tablolardan yalnızca yeni satırları (`Id > son okunan`) salt-okur çeker, `src/pipeline/transform.ts` ile anlamlandırır, alarm kurallarını çalıştırır ve sonucu SQLite'a yazar. Yeniden başlarsa kaldığı yerden devam eder.
- **SQLite (uygulama DB'si):** sistemin kalıcı veritabanıdır (`node:sqlite`, WAL). Yapı `PRAGMA user_version` ile ileri doğru migration'larla değişir; veri düşürülmez. SQLite'a yazan tek süreç sunucudur.
- **API:** Fastify, REST/JSON. Arayüz 15 sn'de bir yoklar. WebSocket kullanılmaz. Canlıda derlenmiş arayüzü de aynı adresten sunar (`npm start`).
- **Günlük işler:** sunucu her gün ayarlanan saatten sonra uygulama veritabanını yedekler ve saklama süresi dolan kayıtları temizler.
- **Arayüz:** React. Her ekranda "son fabrika verisi" zamanı ve API bağlantı durumu görünür.

## İki mod

| | Sunucu modu | Demo modu (GitHub Pages) |
|---|---|---|
| Fabrika verisi | Docker'daki SQL Server (simülatör yazar) | Tarayıcı belleğindeki "SQL Server" tabloları |
| Collector | Sunucuda, 3–5 dk'da bir | Tarayıcıda, aynı dönüştürücü, simülasyon saatine göre aynı aralıkla |
| Uygulama DB'si | SQLite dosyası | Bellek içi depo |
| Komutlar (not, Andon, alarm, rework, admin) | API → servisler → SQLite | Aynı servisler → bellek içi depo |
| Kurulum | Node 22.13+ (geliştirmede Docker'daki SQL Server; canlıda fabrikanın SQL Server'ı) | Yok (tarayıcı) |

Ortak kod `src/` altındadır ve saf TypeScript'tir (Node veya DOM API'si kullanmaz). Sunucu bu kodu `@/` alias'ıyla kullanır.

- `src/domain`: tipler, ana veri, KPI ve raporlar, alarm ve rework kuralları, ekran görünümleri, komutlar (RBAC + audit), admin, `Store` arayüzü
- `src/pipeline`: SQL satır tipleri, bellek içi "SQL Server", dönüştürücü
- `src/sim`: simülatör

`Store` senkron bir arayüzdür. `node:sqlite` (`DatabaseSync`) ve bellek içi depo aynı arayüzü uygular.

## Klasörler

```
src/domain/      types, lineDef (tohum ana veri), shifts, alarms, rework, lineState ve views (türetilmiş görünümler),
                 kpi, reports, pareto, maintenance, terminal, qualifications, commands, admin, rbac,
                 store/ (Store arayüzü, MemoryStore, sözleşme testleri)
src/pipeline/    rows.ts (SQL satır tipleri), rawDb.ts (bellek içi SQL Server), transform.ts (anlamlandırma)
src/sim/         deterministik hat simülatörü ve demo hikâyeleri
src/data/        Backend arayüzü, ApiBackend (REST yoklama), DemoBackend (tüm zincir tarayıcıda), zustand store
src/components/  ui/, layout/, line/, engine/ (TM50 motor illüstrasyonu), control/, common/, charts/, grid/
src/pages/       ekranlar; admin/ (Admin sekmeleri)
server/          sql/schema.sql, simulator/, collector/, api/, db/, auth/, shared/
docs/            bu dokümanlar
```

## Güvenlik ve işletim

| Konu | Uygulama |
|---|---|
| Kimlik doğrulama | Personel no ya da RFID kart + PIN / şifre (`server/auth/auth.ts`). Şifreler scrypt ile tuzlanıp saklanır. 5 hatalı denemede 5 dk kilit. Active Directory proje başında netleşecek. |
| Oturum | 32 baytlık rastgele anahtar, `HttpOnly` + `SameSite=Strict` çerez, 12 saat (her istekte uzar). Sunucuda sadece anahtarın SHA-256 hash'i tutulur. |
| Yetki (RBAC) | Rol → izin eşlemesi (`src/domain/rbac.ts`). Görüntüleme tüm kullanıcılara açık, değişiklik yapan her komut izin ister. Kontrol sunucuda (komut servisi) yapılır; arayüz sadece yetkisiz aksiyonları gizler. |
| Audit | Her komut, giriş ve çıkış `audit_log`'a kullanıcı, zaman, önce / sonra bilgisiyle yazılır (`src/domain/commands.ts`). |
| HTTPS | `HTTPS_KEY` / `HTTPS_CERT` verilirse API doğrudan HTTPS sunar; ya da önüne reverse proxy konur. Çerezler HTTPS'te `Secure` olur. |
| Loglar | `logs/app.log` (Fastify / pino JSON): hatalar, 1 sn'den yavaş istekler, collector turları ve hataları, hatalı girişler. Yoklama yüzünden her istek loglanmaz. Açılışta 20 MB'ı geçen dosya `app.log.1` olur. Bakım & Entegrasyon ekranında görüntülenir (izin: `system.view`). |
| Yedekleme | Günlük otomatik yedek ve Admin'den "Şimdi yedek al" (SQLite `VACUUM INTO`, sunucu çalışırken), son N yedek tutulur; geri yükleme komut satırından, sunucu kapalıyken ([`kurulum.md`](kurulum.md)). |
| Kalıcılık | SQLite WAL modunda. Yapı değişiklikleri ileri doğru migration'larla yapılır (`server/db/sqlite.ts`; Faz 5'te sürüm 2: istasyon girişi ve operasyon onayı tabloları). Veri düşürülmez. Yeni sürümle gelen izinler kayıtlı rol ayarlarına varsayılan rollerine göre eklenir; admin'in kaldırdığı izinlere dokunulmaz. |

## Kararlar

| Karar | Gerekçe |
|---|---|
| Veri SQL Server'dan 3–5 dk'da bir çekilir | Müşterinin veri altyapısı ve kullanıcı kararı. Fabrika SQL Server'ına yük bindirmez. URS'deki 1–3 sn hedefinden sapma `acik-konular.md` A2'de yazılı. |
| WebSocket yok, REST yoklama var | 3–5 dk'lık veri tazeliğinde anlık itme gerekmez. Kullanıcı aksiyonları 15 sn'lik yoklamayla diğer kullanıcılara ulaşır. |
| Uygulama DB'si SQLite | Kurulum gerektirmez, tek dosyadır, yedeklemesi kolaydır, bir hattın veri hacmi için yeterlidir. Veri erişimi tek arayüzde (`Store`) toplandığı için ileride PostgreSQL veya SQL Server'a geçilebilir. |
| SQL Server'a sadece okuma | Fabrika sistemine yan etkimiz olmaz. HOLD ve tamamlama bizim DB'mizde tutulur (`acik-konular.md` A3). |
| Kurulumsuz demo modu | Müşteriye link gönderilebilir. Aynı kod tarayıcıda çalıştığı için demo ile gerçek sistem ayrışmaz. |
| Teknoloji yığını factory-monitor ile aynı | Vite + React 19 + TypeScript, Tailwind v4, ECharts, AG Grid, Zustand, Fastify, `mssql`, Vitest, oxlint. Denenmiş, paket sürümleri aynı. |
