# İzlenebilirlik Matrisi — R-001…R-081

Kaynak: `01_customer_requirements_clean.md`. Durumlar baseline §18 kurallarıyla verilir: bir ister ancak istenen davranışı gösteren **kod kanıtı** varsa `IMPLEMENTED` sayılır; benzer isimli dosya / bileşen / yorum yeterli değildir. Kullanıcıya henüz görünmeyen davranışlar `PARTIAL`'dır.

| Durum | Anlamı |
|---|---|
| `IMPLEMENTED` | Davranış kodda var ve kullanıcıya sunuluyor; kanıt sütununda gösterildi |
| `PARTIAL` | Bir kısmı var; eksik kısım kanıt sütununda yazılı |
| `MISSING` | Henüz yok |
| `UNCLEAR` | İster netleşmeden değerlendirilemiyor |

**Son güncelleme:** Faz 6 sonu. Faz sütunu plandaki hedef fazı gösterir. Üretmek için: `npm run docs:matrix`.

**Özet:** 81 ister · IMPLEMENTED 73 · PARTIAL 8 · MISSING 0 · UNCLEAR 0

## 1. General System and Users

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-001 | High | The application shall be a web application that runs in modern browsers without requiring additional client installation. | 0 | `IMPLEMENTED` | Vite + React web uygulaması; tarayıcıda kurulumsuz açılır. Demo derlemesi backend gerektirmez (`npm run build:demo`). |
| R-002 | High | Station, motor, alarm and production data shall be updated in real time or near-real time. The target update latency under normal conditions is 1–3 seconds. | 3 | `PARTIAL` | Veri SQL Server'dan 3–5 dk'da bir çekiliyor (kullanıcı kararı); ekran 15 sn'de bir yenilenir, yeni veri gelince hemen güncellenir. URS'deki 1–3 sn hedefinden sapma acik-konular.md A2'de. Sapma: veri SQL Server'dan 3–5 dk'da bir çekilecek; 1–3 sn hedefi karşılanamaz (bkz. acik-konular.md A2). |
| R-003 | High | The main control screen shall be able to show line flow, KPIs, selected-station details, rework and recent events on the same page. | 2 | `IMPLEMENTED` | Kontrol Merkezi tek sayfada hat akışı, KPI şeridi, Seçili İstasyon paneli, rework / HOLD kuyruğu ve son olayları gösterir (`src/pages/ControlCenter.tsx`). |
| R-004 | Medium | The UI shall prioritize 1920×1080 and higher resolutions while remaining usable at lower desktop resolutions. | 0, 2 | `IMPLEMENTED` | 1920×1080 için tasarlandı; 1366×768'de 13 istasyon tek satıra sığıyor (menü 1536 px altında ikonlara iner, hat bandı 1240 px altında kendi içinde kayar). Ekran görüntüleriyle kontrol edildi. |
| R-005 | High | The system shall support role-based access control (RBAC), with separate permissions for Technician, Production Leader / Supervisor, Quality, Maintenance / Automation and Admin roles. | 3 | `IMPLEMENTED` | Teknisyen, Supervisor, Kalite, Bakım / Otomasyon ve Admin için ayrı izinler (`src/domain/rbac.ts`); kontrol sunucuda komut servisinde (`commands.ts`), API testlerinde 403 doğrulandı (`server/api/app.test.ts`). İzin yönetimi ekranı Faz 6. |
| R-006 | — | A Technician shall be able to perform authorized actions such as viewing station/operation information, adding notes, opening Andon calls, requesting material/quality support, placing HOLD and completing operations. | 5 | `IMPLEMENTED` | Teknisyen Terminali: istasyon / operasyon bilgisi, not, Andon (malzeme / kalite / üretim desteği), HOLD ve kontrol listesiyle "operasyonu tamamla" (`src/domain/terminal.ts`, `Terminal.tsx`; birim, API ve tarayıcı testleri). Onay uygulama veritabanına yazılır, fabrika sistemine geri yazılmaz (acik-konular.md A3). |
| R-007 | — | A Supervisor shall be able to view the line, review station performance, acknowledge/assign/close alarms and track rework. | 4 | `IMPLEMENTED` | Supervisor hattı ve istasyon performansını görür (Kontrol Merkezi), alarmları onaylar / atar / kapatır (Alarm Merkezi), rework'ü takip eder (Kalite & Rework). Tarayıcı testiyle doğrulandı. |
| R-008 | — | A Quality user shall be able to access OP100 quality results, nonconformities, motor images, rework records and re-inspection records. | 4 | `PARTIAL` | Kalite rolü OP100 sonuçlarını, NOK / HOLD'ları, rework ve re-QC kayıtlarını görür ve yönetir (Kalite & Rework, Motor Takibi). Motor görüntüleri motora bağlı ama dosyalar görüntü deposu bağlantısı netleşene kadar yer tutucu (acik-konular.md C4). |
| R-009 | — | A Maintenance / Automation user shall be able to access PLC/equipment status, sensor/IO information, alarms and integration-health information. | 5 | `IMPLEMENTED` | Bakım & Entegrasyon: PLC / tork / kamera heartbeat'leri, sensör / IO, istasyon bakım metrikleri, collector ve SQL Server sağlığı, ham fabrika tabloları, uygulama logları (`Maintenance.tsx`, `maintenance.ts`; tarayıcı testi). Alarmlar Alarm Merkezi'nde. |
| R-010 | — | An Admin shall be able to manage station master data, users/roles, routing, alarm rules, integration settings and data-retention settings. | 6 | `IMPLEMENTED` | Admin ekranı (`src/pages/Admin.tsx`, `src/domain/admin.ts`): istasyon ana verisi, kullanıcı / rol / izin, ön montaj besleme, alarm kuralları, entegrasyon (çekme aralığı, bağlantı testi), saklama süreleri ve yedek. Her değişiklik doğrulanır ve audit'e yazılır (birim, API ve tarayıcı testleri; kabul AC-10). |

## 2. Main Assembly Line

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-011 | — | The system shall contain the following 13 main operations with the operation names defined in the URS: OP005, OP010, OP015, OP020, OP030, OP040, OP050, OP060, OP070, OP080, OP090, OP100, OP110 | 1 | `IMPLEMENTED` | 13 operasyon URS'deki kod, ad ve tiplerle ana veride (`lineDef.ts`, `lineDef.test.ts`) ve hat görselinde. |
| R-012 | High | The main line shall be visualized horizontally / isometrically. Each station shall show active motor, status, technician/automation type and operation information. | 2 | `IMPLEMENTED` | Yatay hat; her istasyonda aktif motor, durum, teknisyen / otomasyon tipi, operasyon adı ve çevrim süresi (`src/components/line/LineBand.tsx`). |
| R-013 | High | Motors on the line shall be represented with a TM50-like readable motor illustration and motor serial number. | 2 | `IMPLEMENTED` | TM50 boxer-4 motor illüstrasyonu montaj aşamasına göre parça ekler; altında seri numarası (`src/components/engine/Tm50Engine.tsx`). Aşama ile istasyon tutarlılığı testli (`overview.test.ts`). |
| R-014 | High | Clicking a station shall not automatically navigate the user to another page. The selected-station panel, cycle graph and related details on the same screen shall update for the selected station. | 2 | `IMPLEMENTED` | İstasyona ya da motora tıklamak sayfayı değiştirmez; Seçili İstasyon paneli ve çevrim grafiği güncellenir. Tarayıcıda (CDP) tıklama testiyle doğrulandı. |
| R-015 | High | Running/Normal, Warning/Takt Risk, Fault/NOK and Offline states shall be visually distinguishable. | 2 | `IMPLEMENTED` | Running / Warning (takt riski) / Fault-NOK / Offline renk + ikon + metinle (`StateBadge`, `lineState.ts`); kurallar docs/kpi-tanimlari.md. |

## 3. Subassembly

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-016 | — | The system shall contain the following subassembly operations with the operation names defined in the URS: OP201, OP202, OP203, OP205, OP206 | 1 | `IMPLEMENTED` | 5 ön montaj operasyonu ana veride ve hat görselinde. |
| R-017 | High | Subassembly stations shall be shown as independent work cells/tables separate from the main conveyor. | 2 | `IMPLEMENTED` | Ön montaj hücreleri konveyörden ayrı kartlar olarak gösteriliyor (`SubCell`). |
| R-018 | High | Each subassembly cell shall track daily production, hourly rate, buffer stock, target and status. | 2 | `IMPLEMENTED` | Her hücrede bugünkü üretim / hedef, son 1 saat, buffer (min işaretli) ve durum. |
| R-019 | High | The system shall show which main-line operation each subassembly feeds. | 2 | `IMPLEMENTED` | Hücreden beslediği ana hat istasyonuna bağlantı çizgisi ve "Besler OPxxx" metni (`FeedLinks`). |
| R-020 | High | A warning shall be generated when buffer quantity falls below the configured minimum level. | 2 | `IMPLEMENTED` | Buffer min altına düşünce BUF-LOW alarmı açılır, hücre Warning olur ve bağlantı çizgisi vurgulanır (`transform.ts`, `lineState.ts`; testli). Min seviyenin admin'den ayarı Faz 6. |

## 4. Selected Station Detail

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-021 | High | The selected station shall show active motor, technician/automation type, cycle/target, takt deviation, remaining time, next station and operation progress. | 2 | `IMPLEMENTED` | Genel sekmesi: aktif motor, teknisyen / otomasyon, çevrim / hedef, takt sapması, kalan süre (tahmin), sonraki istasyon, operasyon ilerlemesi. |
| R-022 | High | Process detail shall be able to show recipe, PLC/Cell ID, equipment/tool, Pset/program, checklist and critical component/lot information. | 2 | `IMPLEMENTED` | Proses sekmesi: reçete, PLC / Cell ID, ekipman / tool, Pset / program, checklist, kritik komponent S/N ve lot. |
| R-023 | High | Quality/tightening detail shall show quality result, Andon, latest alarm and, where applicable, torque target/actual/angle/result. | 2 | `IMPLEMENTED` | Kalite & Tork sekmesi: son kalite sonucu, açık Andon'lar ve "Andon aç", son alarm, tork hedef / gerçek / açı / sonuç. |
| R-024 | High | PLC connection, tool status, heartbeat, sensor/IO states and basic maintenance metrics shall be displayable. | 2 | `IMPLEMENTED` | İstasyon panelinde Varlık & IO sekmesi; Bakım & Entegrasyon'da tüm cihazlar, IO ve son 24 saatin arıza sayısı, arıza süresi, MTTR, MTBF ve çalışma oranı (testli). |
| R-025 | High | Information/warning/error type notes shall be addable to a station. Author, timestamp and related alarm/topic shall be stored. | 2 | `IMPLEMENTED` | Notlar sekmesi: bilgi / uyarı / hata; yazar giriş yapan kullanıcı, zaman sunucu saati, istasyon, motor, ilişkili alarm / konu kalıcı saklanır; hata notu alarm üretir; audit'e yazılır (`createNote`; birim, API ve tarayıcı testleri; yeniden başlatma sonrası kalıcılık tarayıcıda doğrulandı). |
| R-026 | High | Station history shall list motor serial number, technician, cycle, result and related note/alarm. | 2 | `IMPLEMENTED` | Geçmiş sekmesi: son 12 işlem; motor S/N, teknisyen, cycle, sonuç, ilgili alarm / not. |

## 5. Motor Tracking and Traceability

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-027 | High | A user shall be able to search by motor serial number and access the motor's current state and as-built history. | 4 | `IMPLEMENTED` | Motor Takibi: seri no parçası ya da komponent seri numarasıyla arama; güncel durum ve as-built geçmişi (`searchMotors`, `motorDetail`; birim, API ve tarayıcı testleri). |
| R-028 | High | The following serialized components shall be associated with the motor using unique serial numbers: Throttle Set, Motor Block, Crankshaft, Piston Cylinder Set, Cable, Alternator, Starter Motor | 4 | `IMPLEMENTED` | "Takılan parçalar": 7 komponent benzersiz seri numarasıyla motora bağlı; aynı S/N ikinci motorda okutulursa TRC-DUP alarmı. |
| R-029 | High | If the related operation has not yet been completed, the component shall be shown as `Pending / Not Yet Installed`; after completion it shall be shown as `Installed` with its serial number. | 4 | `IMPLEMENTED` | Komponent operasyon OK bitene kadar "Henüz monte edilmedi / Pending", sonra seri numarasıyla "Installed"; okutulmuş ama operasyonu süren parça ayrıca belirtilir. |
| R-030 | High | Motor completion percentage shall be calculated over the 13 main operations and shown as a percentage/progress bar. | 4 | `IMPLEMENTED` | Tamamlanma 13 operasyon üzerinden yüzde ve 13 parçalı ilerleme çubuğuyla (Motor Takibi). |
| R-031 | High | For every operation completed by a motor, the system shall retain entry time, exit time, cycle, technician, installed part/serial number and quality result. | 4 | `IMPLEMENTED` | Operasyon geçmişi tablosu: her OP için giriş, çıkış, cycle, teknisyen, takılan parça / S/N, sonuç (tekrarlar dahil). |
| R-032 | Medium | Images captured at the OP100 quality station shall be associable with the motor serial number. | 4 | `PARTIAL` | OP100 görüntüleri muayene kaydı üzerinden motor S/N'ye bağlı ve görünüm adlarıyla listeleniyor; görüntü dosyaları depo bağlantısı netleşene kadar yer tutucu (C4). |

## 6. Quality and Rework

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-033 | High | OP100 quality result shall be stored as OK/NOK/HOLD and shall be able to affect the motor's subsequent routing decision. | 4 | `IMPLEMENTED` | OP100 kararı OK / NOK / HOLD saklanır ve akışı belirler: NOK → rework, HOLD → kalite kararı, OK → devam (Kalite & Rework, Motor Takibi; testli). |
| R-034 | High | NOK/HOLD motors shall enter a rework queue containing fault type, source operation, root cause, priority, responsible party and rework operator. | 4 | `IMPLEMENTED` | Rework kuyruğu: hata tipi, kaynak OP, kök neden, öncelik, sorumlu ekip, rework operatörü; ekrandan düzenlenir, tezgâha geçmeden kök neden ve operatör zorunlu. |
| R-035 | High | The rework process shall support a state flow similar to Triage → Diagnosis → Rework Bench → Ready for Re-QC. | 4 | `IMPLEMENTED` | Kanban: Incoming Triage → Diagnosis → Rework Bench → Ready for Re-QC → Re-QC (OP100); adım geçişleri yetki + audit'le (tarayıcı testi). |
| R-036 | High | A motor that has completed rework shall be able to be routed back to OP100 quality control. | 4 | `IMPLEMENTED` | Ready for Re-QC olan motor OP100'e girince re-QC başlar; OK kapanır, NOK yeni turla triage'a döner (collector; testli). |

## 7. Alarm and Andon

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-037 | High | The alarm list shall be filterable by severity, status, source, operation and search criteria. | 4 | `IMPLEMENTED` | Alarm Merkezi: önem, durum, kaynak, istasyon, metin araması ve zaman aralığı filtreleri. |
| R-038 | High | Alarm lifecycle shall support Detected → Acknowledged → Assigned → Closed. | 4 | `IMPLEMENTED` | Detected → Acknowledged → Assigned → Closed; adımlar zaman ve kullanıcıyla gösterilir (tarayıcı testi). |
| R-039 | High | An alarm shall be assignable to a team or user. Assignment and closure actions shall be written to the audit trail. | 4 | `IMPLEMENTED` | Alarm ekip ya da kişiye atanır, yeniden atanabilir; atama ve kapanış alarm olaylarına ve audit log'a yazılır. |
| R-040 | High | A technician shall be able to create an Andon call for material, quality or production support. | 4 | `IMPLEMENTED` | Teknisyen istasyon panelinden malzeme / kalite / üretim desteği için Andon açar; alarm kaydı oluşur ve kuraldaki ekibe düşer (teknisyen terminalinden de açılabilecek, Faz 5). |
| R-041 | High | The user shall be able to navigate from an alarm detail to the related motor's traceability view. | 4 | `IMPLEMENTED` | Alarm ayrıntısındaki "Motor geçmişi" bağlantısı ve tablodaki seri numarası Motor Takibi'ni açar (tarayıcı testi). |

## 8. Tightening / Torque

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-042 | High | Tightening records shall retain timestamp, motor serial number, operation, tool/controller, Pset, joint, target torque, actual torque, angle and OK/NOK result. | 4 | `IMPLEMENTED` | Tork ekranı: zaman, motor S/N, OP, tool / controller, Pset, joint, hedef, gerçek tork, açı, OK / NOK. |
| R-043 | High | Online/available status of tightening controllers and tools shall be displayable. | 4 | `IMPLEMENTED` | İstasyon başına controller ve tool online durumu ve son heartbeat (Tork ekranı, istasyon paneli). |
| R-044 | Medium | Tightening records shall be exportable in a CSV/Excel-like format. | 4 | `IMPLEMENTED` | Filtredeki tüm kayıtlar Excel'de açılan CSV olarak indirilir (BOM, ";", ondalık virgül; tarayıcı testi); dışa aktarım audit'e yazılır. |

## 9. KPI and Reporting

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-045 | High | The system shall display Availability, Performance, Quality/FPY, OEE, output/hour, plan attainment and shift output. | 5 | `IMPLEMENTED` | KPI şeridi (süren vardiya) ve KPI & Raporlar: Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme, vardiya çıkışı ve vardiya karşılaştırması (`kpi.ts`, `reports.ts`; testli). Formüller Metrik Rehberi'nde ve docs/kpi-tanimlari.md'de; müşteri onayı bekliyor (acik-konular.md E1). |
| R-046 | High | The system shall show station-level actual/target/takt comparison and recent cycle trend. | 5 | `IMPLEMENTED` | İstasyon bazında gerçekleşen / hedef / takt grafiği (Kontrol Merkezi: son 8 çevrim; KPI & Raporlar: seçilen pencere) ve zamana göre çevrim trendi. |
| R-047 | High | The bottleneck station shall be automatically determinable from cycle-time data. | 5 | `IMPLEMENTED` | Darboğaz çevrim verisinden otomatik: Kontrol Merkezi'nde son 8 çevrim, raporda seçilen penceredeki ortalama; sıralama ve takt karşılaştırmasıyla (testli). Algoritma varsayımdır (acik-konular.md E2). |
| R-048 | High | A basic Pareto view shall be available for quality defects and alarm sources. | 5 | `IMPLEMENTED` | Hata Pareto'su ve alarm kaynakları Pareto'su (Kalite & Rework, Alarm Merkezi, KPI & Raporlar). |
| R-049 | Medium | KPI and report views shall be filterable by shift and date. | 5 | `IMPLEMENTED` | KPI & Raporlar üretim günü ve vardiyayla (A / B / C / tüm gün) filtrelenir; filtre adres çubuğunda paylaşılabilir. Veri toplanmadan önceki süre hesaba girmez, ekranda "kısmi veri" olarak işaretlenir (testli). |

## 10. Technician Terminal

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-050 | High | A technician shall be able to log into a station/shift using RFID/personnel number + PIN or an existing enterprise identity system. | 5 | `IMPLEMENTED` | Personel no ya da RFID kart no + PIN ile giriş (PIN hash'li, 5 hatalı denemede kilit); Teknisyen Terminali'nden istasyon / vardiya girişi, vardiya sonuna kadar geçerli, istasyonda tek teknisyen (`terminal.ts`; birim, API ve tarayıcı testleri). Kimlik doğrulama yöntemi (lokal / Active Directory) netleşmedi (baseline §16); şu an lokal kullanıcı. |
| R-051 | High | The technician's active station, motor and task shall be shown in a single card/view. | 5 | `IMPLEMENTED` | Aktif görev kartı: istasyon, motor S/N ve illüstrasyonu, geçen / tahmini kalan süre, kontrol listesi, takılacak parçalar, sıkma joint'leri, onay durumu, sıradaki motor; kiosk modu (`?kiosk=1`). |
| R-052 | Medium | Technician qualification/competency information shall be checkable during station assignment. | 5 | `IMPLEMENTED` | İstasyona girişte yetkinlik kontrolü: insanlı istasyon Montaj L2, sıkmalı istasyon ayrıca Torque Qualified (üst seviye alt seviyeyi karşılar); eksikse giriş engellenir ve deneme audit'e yazılır (testli). Kural varsayımdır (acik-konular.md F6). |

## 11. Admin and Configuration

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-053 | High | Admin shall be able to manage OP code, operation name, station type, target cycle, PLC/Cell ID and tool information. | 6 | `PARTIAL` | Admin → Hat & istasyonlar: operasyon adı, istasyon tipi, hedef çevrim, PLC / Cell ID, tool, reçete; takt, eşikler ve vardiyalar (testli). OP kodu fabrika verisindeki istasyon koduyla eşleştiği için ekrandan değişmez; değişiklik collector eşlemesiyle birlikte yapılır (acik-konular.md G1). |
| R-054 | High | Users, roles and their permissions shall be manageable. | 6 | `IMPLEMENTED` | Admin → Kullanıcılar & roller: kullanıcı ekleme / güncelleme / pasifleştirme, istasyon ve vardiya ataması, yetkinlikler, kart, PIN sıfırlama (oturumlar kapanır), kilit açma; rol → izin matrisi açık oturumlarda hemen geçerli. Kilitlenmeye karşı korumalar (son admin, kendi rolü) testli. |
| R-055 | High | Subassembly → main-line feed/routing relationships shall be configurable. | 6 | `IMPLEMENTED` | Admin → Ön montaj beslemesi: beslenen istasyon, kit, buffer min / max, günlük hedef; bir istasyonu iki hücre besleyemez (testli, kabul AC-10). |
| R-056 | High | Alarm rules such as severity, escalation time and default responsible team shall be configurable. | 6 | `IMPLEMENTED` | Admin → Alarm kuralları: önem, eskalasyon süresi, varsayılan ekip, açık / kapalı; değişiklik yeni alarmlara hemen uygulanır (testli, kabul AC-10). |
| R-057 | High | Connection/heartbeat status of PLC, tightening, database, live-data channel and camera/vision integrations shall be displayable. | 6 | `IMPLEMENTED` | Bakım & Entegrasyon sağlık kutuları: fabrika SQL Server (collector son turu / hatası), canlı veri kanalı (veri tazeliği), PLC, tork controller / tool, kamera, uygulama veritabanı; collector tur geçmişi ve "Şimdi çek" (tarayıcı testi; gerçek SQL Server'la doğrulandı). |
| R-058 | High | Critical user actions, alarm changes, rework assignments and configuration/master-data changes shall be written to an audit log with user and timestamp information. | 3, 6 | `IMPLEMENTED` | Kullanıcı işlemleri, alarm ve rework değişiklikleri, istasyon girişleri, operasyon onayları, dışa aktarımlar ve tüm konfigürasyon / ana veri değişiklikleri audit'e kullanıcı, zaman ve önce / sonra değerleriyle yazılır. Admin → Audit kaydı: filtre, önce / sonra farkı, CSV (testli, kabul AC-08, AC-10). |

## 12. Data and Integration

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-059 | — | PLC / Automation integration shall be able to provide station state, cycle start/finish, motor ID, sensor/IO, fault and heartbeat data. | 1 | `PARTIAL` | PLC verisi sözleşmesi tanımlı; collector SQL Server'dan okuyup işliyor (`server/collector/sqlReader.ts`, Docker'daki SQL Server ile uçtan uca denendi). Gerçek tablo eşlemesi proje başında. |
| R-060 | — | Tightening integration shall be able to provide torque/angle, Pset, joint, result and tool/controller identity. | 1 | `PARTIAL` | Tork verisi sözleşmesi tanımlı; SQL Server'dan okunup işleniyor. Gerçek eşleme proje başında. |
| R-061 | — | Vision integration shall be able to provide OP100 image, quality decision and motor serial-number association. | 1 | `PARTIAL` | Vision verisi sözleşmesi tanımlı; SQL Server'dan okunup işleniyor. Gerçek eşleme proje başında. |
| R-062 | High | Motor genealogy, quality and audit data shall be stored persistently and shall survive application/system restart. | 3 | `IMPLEMENTED` | Uygulama veritabanı SQLite (WAL) + ileri doğru migration (`server/db/sqlite.ts`; sürüm 1 → 2 mevcut veriyi koruyarak test edildi). Sonradan eklenen izinler kayıtlı rol ayarlarına eklenir, admin'in kaldırdıklarına dokunulmaz. |
| R-063 | High | Production events, alarms and user actions shall contain reliable timestamps. | 3 | `IMPLEMENTED` | Üretim olayları kaynak zaman damgasını (UTC, ms) taşır; alarm ve kullanıcı işlemleri sunucu saatiyle damgalanır. |
| R-064 | High | Motor, work order, part serial number, alarm, rework record and user-action records shall have unique identifiers. | 3 | `IMPLEMENTED` | Motor (S/N), iş emri, komponent S/N (tekillik kontrolü), alarm (ALM-…), rework (RW-…), not (NT-…), Andon (AN-…), HOLD (HU-…), audit (AU-…) benzersiz kimlikli. |
| R-065 | Medium | A documented REST/JSON API between frontend and production data and a WebSocket-like channel for live data are preferred. | 3 | `PARTIAL` | REST / JSON API dokümante (docs/api.md). Tercih edilen WebSocket yerine yoklama kullanılıyor (kullanıcı kararı; veri 3–5 dk'da bir geliyor). Tercih edilen WebSocket kullanılmayacak (kullanıcı kararı); REST + yoklama. |

## 13. Visual and Usability

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-066 | — | The main background shall be white/off-white/very light gray. Dense dark backgrounds shall not be used as the primary theme. | 0, 2 | `IMPLEMENTED` | Beyaz / kırık beyaz zemin; koyu tema yok (`src/index.css`). |
| R-067 | — | Light blue shall be used for information/active selection, soft pink for critical error/NOK emphasis, and pastel yellow for warning/takt-risk emphasis. | 0, 2 | `IMPLEMENTED` | Açık mavi bilgi ve seçim (seçili istasyon, sekmeler), soft pembe kritik / NOK, pastel sarı uyarı / takt riski ekranlarda kullanılıyor. |
| R-068 | — | KPI cards, tables and panel headings shall have high readability. | 0, 2 | `IMPLEMENTED` | KPI değerleri, tablolar ve panel başlıkları yüksek kontrastlı; metin tonları WCAG AA'ya göre ayarlı. |
| R-069 | — | OP codes shall be easy to distinguish in the visual hierarchy. | 0, 2 | `IMPLEMENTED` | OP kodları ayrı, dar ve kalın yazı yüzüyle (Barlow Semi Condensed) her yerde öne çıkıyor (`.opcode`). |
| R-070 | — | Critical states shall not be communicated using color alone; text and/or icons shall also be used. | 0, 2 | `IMPLEMENTED` | Durumlar her yerde ikon + metinle; grafikte takt üstü çubuklar etiketli. |

## 14. Non-Functional Requirements

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-071 | — | Standard page/screen interactions shall respond to user action within 2 seconds. | 3 | `IMPLEMENTED` | Ölçüm: özet API 8 ms, istasyon ayrıntısı 2 ms, 3 dk'lık collector turu 6–40 ms, 24 saatlik ilk okuma 0,8 sn. 1 sn'den yavaş istekler logda işaretlenir. |
| R-072 | — | HTTPS shall be used and user passwords shall not be stored in plain text. | 3 | `IMPLEMENTED` | HTTPS doğrudan (`HTTPS_KEY` / `HTTPS_CERT`) ya da reverse proxy ile (`COOKIE_SECURE`), kurulum adımı olarak (docs/kurulum.md 4). PIN / şifreler scrypt ile hash'li (testli); oturum çerezi HttpOnly, SameSite=Strict, HTTPS'te Secure; temel güvenlik başlıkları. |
| R-073 | — | Application and database error logs shall be retained and accessible to the maintenance team. | 5 | `IMPLEMENTED` | Uygulama logu `logs/app.log` (hatalar, yavaş istekler, collector turları ve hataları, hatalı girişler; 20 MB'ta döndürülür). Bakım & Entegrasyon'da seviye filtreli log ekranı ve sistem bilgisi (izin: system.view; testli). |
| R-074 | — | When the data connection is temporarily interrupted, the connection state shall be clearly shown to the user. | 3 | `IMPLEMENTED` | Sunucuya ulaşılamazsa "Sunucuya ulaşılamıyor", fabrika verisi gecikirse "Fabrika verisi gecikiyor" uyarısı; eldeki veri ekranda kalır (tarayıcı testiyle doğrulandı). |
| R-075 | — | A data backup and restore mechanism shall be defined before commissioning. | 6 | `IMPLEMENTED` | Günlük otomatik yedek (saat ve sayı Admin'den), "Şimdi yedek al", geri yükleme komutu (bütünlük kontrolüyle), başka diske kopyalama ve tatbikat adımları docs/kurulum.md 6'da. Yedek politikası müşteriyle netleşecek (acik-konular.md G3). |

## 15. Supplier Deliverables

| İster | Öncelik | Özet | Faz | Durum | Kanıt / not |
|---|---|---|---|---|---|
| R-076 | — | Analysis and detailed design documentation shall be delivered. | 6 | `IMPLEMENTED` | docs/detay-tasarim.md (bileşenler, veritabanı, akışlar, izinler, ekranlar, hata yönetimi, test stratejisi), docs/mimari.md, docs/sql-veri-sozlesmesi.md, docs/kpi-tanimlari.md, docs/api.md, docs/acik-konular.md. |
| R-077 | — | Approved UI/UX screen designs or an interactive prototype shall be delivered. | 6 | `IMPLEMENTED` | Bütün ekranlar etkileşimli olarak çalışıyor ve kurulumsuz demo olarak yayında: https://ahmethamdiozen.github.io/assembly-line/ (her gönderimde testlerden sonra GitHub Pages'e). |
| R-078 | — | Installation/deployment documentation shall be delivered. | 6 | `IMPLEMENTED` | docs/kurulum.md: hedef ortam, salt-okur SQL Server kullanıcısı, kurulum, HTTPS, Windows servisi (NSSM) / systemd, yedek ve geri yükleme, güncelleme, izleme, sorun giderme. Geliştirme kurulumu README'de. |
| R-079 | — | Admin and end-user documentation shall be delivered. | 6 | `IMPLEMENTED` | docs/kullanim-kilavuzu.md: rollere göre kullanım (teknisyen, üretim lideri, kalite, bakım) ve admin kılavuzu, sık sorulanlar. |
| R-080 | — | Source code and build/deployment instructions shall be delivered if included in the contract scope. | 6 | `IMPLEMENTED` | Kaynak kod GitHub'da (https://github.com/ahmethamdiozen/assembly-line); derleme ve çalıştırma README ve docs/kurulum.md'de; CI iş akışı `.github/workflows/pages.yml`. |
| R-081 | — | FAT/SAT or equivalent acceptance-test scenarios and test results shall be delivered. | 6 | `IMPLEMENTED` | docs/kabul-testleri.md: AC-01…AC-10 senaryoları (adımlar, beklenen sonuç, otomatik karşılık) ve SAT ek senaryoları; `npm run test:kabul` başsız Chrome'la çalıştırır, sonuçlar docs/kabul-sonuclari.md'de; CI her gönderimde çalıştırır. |
