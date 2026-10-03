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
| GET | `/master` | oturum | Ana veri (istasyonlar, komponentler, kurallar, kişiler) ve rol izinleri |
| GET | `/status` | oturum | Veri tazeliği: `watermark` (bu ana kadarki fabrika verisi işlendi), `lastPullAt`, `nextPullAt`, `intervalMin`, `error` |
| POST | `/collector/pull` | `integration.pull` | Collector'ı beklemeden çalıştırır ("Şimdi çek"); `{ run }` |
| GET | `/audit?limit=100` | `audit.view` | Audit kayıtları, en yeni önce (en fazla 500) |
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

## Rol izinleri (varsayılan)

| Rol | İzinler |
|---|---|
| Teknisyen | not, Andon, HOLD, operasyonu tamamla, istasyona giriş |
| Üretim Lideri / Supervisor | not, Andon, HOLD, alarm onay / atama / kapatma, rework yönetimi |
| Kalite | not, HOLD, HOLD kararı, alarm onay / atama / kapatma, rework yönetimi |
| Bakım / Otomasyon | not, alarm onay / atama / kapatma, "Şimdi çek", uygulama logları ve sistem bilgisi |
| Admin | tümü (yönetim ekranları Faz 6) |

Görüntüleme tüm giriş yapmış kullanıcılara açıktır. İzinler admin ekranından değiştirilebilecek (Faz 6).
