# REST API

Arayüz ile sunucu arasındaki JSON API (R-065). Kod: `server/api/app.ts`; testler: `server/api/app.test.ts`.

- **Adres:** `http://<sunucu>:3001/api/v1`. Geliştirmede Vite, `/api` isteklerini buraya yönlendirir.
- **Yoklama:** Arayüz özet ve ayrıntıları 15 sn'de bir, veri tazeliğini (`/status`) 5 sn'de bir yoklar. WebSocket yoktur; fabrika verisi zaten 3–5 dk'da bir geldiği için anlık itme gerekmez.
- **Oturum:** `POST /auth/login` başarılı olunca `tm50_session` çerezi döner. Çerez `HttpOnly` ve `SameSite=Strict`'tir, HTTPS'te `Secure` eklenir. Süre 12 saattir ve her istekte uzar. `health` ve `auth/login` dışındaki her uç nokta oturum ister.
- **Hatalar:** Hata gövdesi her zaman `{ "error": "Türkçe açıklama" }` biçimindedir.

| Kod | Anlamı |
|---|---|
| 400 | Geçersiz istek ya da iş kuralı ihlali (ör. onaylanmamış alarm kapatılamaz) |
| 401 | Oturum yok, süresi dolmuş ya da giriş bilgisi hatalı |
| 403 | Rolün bu işleme izni yok (izinler: `src/domain/rbac.ts`) |
| 404 | Kayıt bulunamadı |
| 500 | Sunucu hatası; ayrıntı `logs/app.log`'da |
| 503 | Bağımlı servise ulaşılamıyor (ör. ham tablo önizlemesinde fabrika SQL Server'ı); mesaj gövdede |

## Sistem ve oturum

| Yöntem | Yol | İzin | Açıklama |
|---|---|---|---|
| GET | `/health` | herkese açık | Sunucu ayakta mı, collector'ın son başarılı turu ve son hatası (izleme için) |
| POST | `/auth/login` | herkese açık | `{ login, secret }`. `login` personel no ya da RFID kart no. Yanıt `{ user }`. 5 hatalı denemede 5 dk kilit. |
| POST | `/auth/logout` | oturum | Oturumu kapatır |
| GET | `/auth/me` | oturum | `{ user: { id, name, role, permissions[] } }` |
| GET | `/master` | oturum | `{ master, rbac, rev }`: ana veri (istasyonlar, besleme, komponentler, kurallar, kişiler, hat ve sistem ayarları), rol izinleri ve ana veri sürümü |
| GET | `/status` | oturum | Veri tazeliği: `watermark` (bu ana kadarki fabrika verisi işlendi), `lastPullAt`, `nextPullAt`, `intervalMin`, `error`; `masterRev` değişince arayüz ana veriyi ve izinleri yeniden yükler |
| POST | `/collector/pull` | `integration.pull` | Collector'ı beklemeden çalıştırır ("Şimdi çek"); `{ run }` |
| GET | `/integration` | oturum | Veri hattı: kaynak, çekme aralığı, son / sonraki tur, son 50 tur (satır, süre, hata), tablo başına okuma konumu (`IntegrationStatus`) |
| GET | `/integration/raw/:table?limit=50` | `system.view` | Fabrika SQL Server tablosunun son satırları (en fazla 200), collector'ın okuduğu biçimde. Tablolar: `docs/sql-veri-sozlesmesi.md` |
| GET | `/system/logs?level=info` | `system.view` | `logs/app.log`'un son kısmı, en yeni önce; `level`: `info`, `warn`, `error` (en az bu seviye) |
| GET | `/system/info` | `system.view` | Sürüm, uygulama veritabanı yolu / boyutu / şema sürümü, tablo satır sayıları, yedekler |

## Okuma

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/overview` | Kontrol Merkezi özeti: istasyonlar, ön montaj, hattaki motorlar, vardiya KPI'ları, çevrim istatistikleri, darboğaz, aktif alarmlar, rework / HOLD, son olaylar (`Overview`, `src/domain/overview.ts`) |
| GET | `/stations/:op` | Seçili istasyon ayrıntısı: genel, proses, kalite & tork, varlık & IO, notlar, geçmiş (`StationDetail`) |
| GET | `/motors?q=&limit=` | Motor arama: seri no parçası ya da takılı komponent seri numarası; boşsa son motorlar (`MotorSummary[]`) |
| GET | `/motors/:sn` | Motorun as-built geçmişi: 13 operasyon, 7 komponent (Installed / Pending), tork, OP100 kararları ve görüntüler, rework / HOLD, alarmlar (`MotorDetail`) |
| GET | `/quality?from=&to=` | OP100 sonuçları, FPY, açık / kapanan rework, açık HOLD'lar, hata Pareto'su (`QualityView`) |
| GET | `/alarms?from=&to=` | Penceredeki alarmlar ve pencereden eski ama açık olanlar, sayımlar, kaynak Pareto'su, Andon'lar (`AlarmListView`) |
| GET | `/alarms/:id` | Alarm ayrıntısı: olay zaman çizelgesi, Andon, ilgili motor, aynı istasyondaki son alarmlar |
| GET | `/tightening?from=&to=&op=&result=&sn=` | Sıkma kayıtları (en yeni 3000), sayımlar, istasyon başına controller / tool durumu (`TighteningView`) |
| GET | `/tightening.csv?…` | Aynı filtredeki tüm kayıtlar; Excel'in Türkçe ayarlarında açılan CSV (UTF-8 BOM, `;`, ondalık virgül). Dışa aktarım audit'e yazılır. |
| GET | `/kpi?day=&shift=&op=` | KPI raporu: `day` üretim günü başlangıcı (ms, 08:00), `shift` A / B / C (boşsa tüm gün), `op` trend istasyonu (boşsa darboğaz). Göstergeler, vardiya karşılaştırması, saatlik çıkış, istasyon çevrimleri, darboğaz, trend, Pareto'lar (`KpiReport`, `src/domain/reports.ts`) |
| GET | `/terminal/:op` | Teknisyen terminali: istasyon durumu, aktif motor (geçen süre, parçalar, sıkmalar, onay), istasyon girişi, gerekli yetkinlikler, giriş yapan kullanıcının yetkinlik kontrolü, sıradaki motor, açık alarmlar, notlar (`TerminalView`) |
| GET | `/maintenance` | Cihaz heartbeat'leri, IO, son 24 saatin istasyon bakım metrikleri (arıza, MTTR, MTBF, çalışma oranı) ve arızalar (`MaintenanceView`) |

Zaman aralığı parametreleri epoch ms'dir; verilmezse son 24 saat alınır, en fazla 31 gün olabilir.

## Komutlar

Her komut yetki kontrolünden geçer ve audit log'a kullanıcı ve zamanla yazılır (R-058). Zaman damgası her zaman sunucu saatidir.

| Yöntem | Yol | İzin | Gövde |
|---|---|---|---|
| POST | `/notes` | `note.create` | `{ op, type: info \| warning \| error, text, sn?, alarmId?, topic? }`. Yazar giriş yapan kullanıcıdır. `error` tipi alarm üretir. |
| POST | `/alarms/:id/ack` | `alarm.ack` | — |
| POST | `/alarms/:id/assign` | `alarm.assign` | `{ assignee }` (ekip ya da kişi; önce onay gerekir) |
| POST | `/alarms/:id/close` | `alarm.close` | `{ note? }` (önce onay gerekir) |
| POST | `/andons` | `andon.create` | `{ op, type: material \| quality \| production, message?, sn? }`. Alarm kaydı da açar. |
| POST | `/reworks/:id/advance` | `rework.manage` | `{ to: diagnosis \| bench \| ready, note?, fields? }` (sadece bir sonraki adım) |
| PATCH | `/reworks/:id` | `rework.manage` | `{ fields: { rootCause?, reworkOperator?, priority?, team? } }` |
| POST | `/holds` | `motor.hold` | `{ sn, reason, op? }` |
| POST | `/holds/:id/decide` | `quality.decide` | `{ decision: release \| rework, note? }` |
| POST | `/terminal/login` | `station.login` | `{ op }`. İnsanlı istasyona giriş; eksik yetkinlikte 400 ve audit'e `station.login.denied`. Önceki girişler kapanır. |
| POST | `/terminal/logout` | oturum | Kullanıcının açık istasyon girişlerini kapatır; `{ login }` |
| POST | `/terminal/confirm` | `op.complete` | `{ op, sn, note? }`. "Operasyonu tamamla": istasyona giriş yapmış olmak ve motorun o istasyonda olması gerekir; motor ve deneme başına bir kez. |

## Admin ve audit (R-010, R-053–R-058, R-075)

Ana veriyi ya da izinleri değiştiren uç noktalar `{ master, rbac, rev }` döndürür. Her değişiklik doğrulanır (geçersizse 400 ve açıklama) ve audit'e sadece değişen alanların önceki / sonraki değerleriyle yazılır. Gövdede tanımsız alanlar yok sayılır.

| Yöntem | Yol | İzin | Gövde / açıklama |
|---|---|---|---|
| PUT | `/admin/config` | `admin.stations` | `{ patch: { taktSec?, warnRatio?, alarmRatio?, heartbeatTimeoutSec?, dayStartHour?, variant?, shifts? } }`. Vardiyalar üretim günü başından boşluksuz 24 saati kaplamalı. |
| PUT | `/admin/stations/:op` | `admin.stations` | `{ patch: { name?, type?, targetCycleSec?, plcId?, cellId?, tool?, recipe? } }`. OP kodu değişmez. |
| GET | `/admin/users` | `admin.users` | Kişiler ve kimlik bilgisi durumu (`credential: { rfid, active, locked, failedAttempts, updatedAt }`); şifre hash'i dönmez |
| POST | `/admin/users` | `admin.users` | `{ person: { personnelNo, name, role, shift, station, qualifications }, pin, rfid? }` |
| PUT | `/admin/users/:no` | `admin.users` | `{ person: { name, role, shift, station, qualifications } }`. Kendi admin rolünüzü kaldıramazsınız; en az bir aktif admin kalır. |
| PUT | `/admin/users/:no/card` | `admin.users` | `{ rfid }` (boş: kart kaldırılır). Aynı kart iki kişide olamaz. |
| POST | `/admin/users/:no/active` | `admin.users` | `{ active }`. Pasif kullanıcı giremez, açık oturumları kapanır; kendinizi pasifleştiremezsiniz. |
| POST | `/admin/users/:no/pin` | `admin.users` | `{ pin }` (4–64 karakter). Açık oturumlar kapanır; PIN audit'e yazılmaz. |
| POST | `/admin/users/:no/unlock` | `admin.users` | Hatalı deneme kilidini açar |
| PUT | `/admin/roles/:role` | `admin.users` | `{ permissions: [...] }`. Admin rolünden `admin.users` kaldırılamaz. Açık oturumlarda hemen geçerli. |
| PUT | `/admin/feeds/:subOp` | `admin.routing` | `{ patch: { mainOp?, kit?, bufferMin?, bufferMax?, dailyTarget? } }`. Bir istasyonu iki hücre besleyemez. |
| PUT | `/admin/rules/:code` | `admin.alarmRules` | `{ patch: { name?, severity?, escalationMin?, team?, enabled? } }` |
| PUT | `/admin/integration` | `admin.integration` | `{ collectIntervalMin }` (3–5). Collector'a hemen uygulanır. |
| POST | `/admin/integration/test` | `admin.integration` | Fabrika SQL Server'ına bağlanıp tablo başına en büyük Id'yi okur: `{ ok, ms, error, maxIds }` |
| PUT | `/admin/retention` | `admin.retention` | `{ retention: { trace, tightening, images, events, alarms, audit } }` (gün; grup başına alt sınır, en fazla 7300) |
| GET | `/admin/retention/preview` | `admin.retention` | Süresi dolmuş kayıt sayıları (grup ve tablo başına) |
| POST | `/admin/retention/purge` | `admin.retention` | Süresi dolanları siler (açık alarm, süren rework / HOLD ve hattaki motor hariç); sayılar audit'e |
| PUT | `/admin/backup` | `admin.retention` | `{ enabled, hour, keep }`: günlük otomatik yedek |
| GET | `/admin/backups` | `admin.retention` | Yedek dosyaları, en yeni önce |
| POST | `/admin/backups` | `admin.retention` | Hemen yedek alır, eski yedekleri `keep`'e göre siler; audit'e yazılır |
| GET | `/audit?from=&to=&user=&action=&entity=&entityId=&limit=&offset=` | `audit.view` | `{ entries, total }`, en yeni önce. `action` işlem adı parçası (ör. `config.`), `user` ad ya da no parçası. Varsayılan son 7 gün, en fazla 1 yıl; sayfa en fazla 1000. |
| GET | `/audit.csv?…` | `audit.view` | Aynı filtredeki tüm kayıtlar (Excel'de açılan CSV); dışa aktarım audit'e yazılır |

## Rol izinleri (varsayılan)

| Rol | İzinler |
|---|---|
| Teknisyen | not, Andon, HOLD, operasyonu tamamla, istasyona giriş |
| Üretim Lideri / Supervisor | not, Andon, HOLD, alarm onay / atama / kapatma, rework yönetimi |
| Kalite | not, HOLD, HOLD kararı, alarm onay / atama / kapatma, rework yönetimi |
| Bakım / Otomasyon | not, alarm onay / atama / kapatma, "Şimdi çek", uygulama logları ve sistem bilgisi |
| Admin | tümü |

Görüntüleme tüm giriş yapmış kullanıcılara açıktır. İzinler Admin → Kullanıcılar & roller'den değiştirilir.
