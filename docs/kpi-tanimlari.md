# KPI, Durum ve Alarm Tanımları

URS bu hesapların formüllerini tanımlamıyor (baseline §16). Aşağıdakiler **varsayımdır** ve müşteriyle netleştirilecektir (`acik-konular.md` E1, E2). Kod: `src/domain/kpi.ts`, `src/domain/lineState.ts`, `src/domain/lineDef.ts`.

## Üretim KPI'ları (R-045)

| KPI | Formül | Not |
|---|---|---|
| Planlı süre | seçilen pencerenin süresi (vardiya başı → şimdi) | Mola / planlı duruş tanımı yok |
| Arıza süresi | ana hat istasyonlarının FAULT aralıklarının **birleşimi** | Seri hatta bir istasyon durursa akış durur. Çakışan arızalar bir kez sayılır. Ön montaj arızaları hattı doğrudan durdurmaz. |
| **Availability (A)** | (planlı süre − arıza süresi) / planlı süre | |
| İdeal çevrim | ana hattaki en uzun **hedef** çevrim (OP050, 7,0 dk) | Hattın tasarım hızı. Takt (7,5 dk) müşteri talebidir; ideal çevrimden uzundur. |
| **Performance (P)** | çıkış × ideal çevrim / çalışma süresi | Çalışma süresi = planlı − arıza |
| **Quality (Q) = FPY** | OP100'den **ilk denemede** OK geçen / OP100'e **ilk kez** gelen | Re-QC denemeleri FPY'ye girmez |
| **OEE** | A × P × Q | |
| Çıkış | OP110'dan OK çıkan motor sayısı | |
| Çıkış / saat | çıkış / planlı saat | |
| **Plan gerçekleşme** | çıkış / (planlı süre / takt) | Prototipteki "42 / 45 beklenen" gösterimi |
| Vardiya çıkışı | vardiya penceresindeki çıkış | Vardiya hedefi = 8 sa / takt = 64 |

Örnek (sentetik test, `src/domain/kpi.test.ts`): 8 saatte 50 dk arıza, 60 çıkış, 53 ilk muayeneden 50 OK →

| | Hesap | Sonuç |
|---|---|---|
| A | 430 / 480 | %89,6 |
| P | 60 × 7 / 430 | %97,7 |
| FPY | 50 / 53 | %94,3 |
| OEE | A × P × FPY | %82,5 |
| Plan gerçekleşme | 60 / 64 | %93,8 |

## Çevrim ve darboğaz (R-046, R-047)

- **Çevrim süresi:** bir motorun istasyondaki net işleme süresi (START → END). Bekleme (starved / blocked) çevrime girmez. Çevrim içindeki arıza süresi ise girer.
- **İstasyon istatistiği:** son 8 tamamlanmış çevrimin ortalaması, son değeri, en kısası ve en uzunu. Hedef ve takt ile karşılaştırılır.
- **Darboğaz:** son 8 çevrim ortalaması en yüksek istasyon. Bu ortalama takt'ı aşıyorsa "takt riski" olarak işaretlenir.

## KPI & Raporlar: tarih ve vardiya (R-045–R-049)

Kod: `src/domain/reports.ts`. Ekran: KPI & Raporlar.

- **Pencere:** seçilen üretim günü (08:00 → ertesi gün 08:00) ya da o günün vardiyası (A 08–16, B 16–24, C ertesi gün 00–08). Süren pencere şimdiye kadar hesaplanır ve "sürüyor" diye işaretlenir.
- **Verisiz süre:** pencere, uygulama veritabanındaki ilk fabrika verisinden önce başlıyorsa hesap o andan başlar. Verisiz süre arıza ya da düşük performans gibi görünmesin diye dışarıda kalır. Ekranda "kısmi veri" uyarısı çıkar; hiç verisi olmayan vardiya "veri yok" olarak gösterilir.
- **Vardiya karşılaştırması:** günün üç vardiyası için çıkış / hedef, FPY, A, P, OEE ve arıza süresi. Hedef vardiya süresi / takt'tır; kısmi veride verinin olduğu süre / takt.
- **Saatlik çıkış:** saat başına OP110 OK çıkışı. Beklenen = 3600 / takt (saatte 8 motor), saatin geçmiş ve verisi olan kısmı kadar.
- **İstasyon çevrimleri:** penceredeki tüm tamamlanmış çevrimlerin ortalaması, medyanı, en uzunu, takt'ı aşan çevrim sayısı ve istasyonun arıza süresi.
- **Darboğaz:** penceredeki ortalama çevrimi en yüksek istasyon. Kontrol Merkezi'ndeki son 8 çevrimlik darboğazdan farklı olabilir: biri anlık, diğeri dönem ortalamasıdır.
- **Çevrim trendi:** seçilen istasyonun her motor için çevrim süresi (bitiş zamanına göre), takt ve hedef çizgileriyle.

## Bakım metrikleri (R-024)

Kod: `src/domain/maintenance.ts`. Bakım & Entegrasyon ekranında son 24 saat için hesaplanır:

| Metrik | Hesap |
|---|---|
| Arıza | penceredeki FAULT başlangıç sayısı |
| Arıza süresi | FAULT aralıklarının birleşimi |
| MTTR | arıza süresi / arıza sayısı |
| MTBF | çalışma ("running") süresi / arıza sayısı |
| Çalışma oranı | çalışma süresi / pencere süresi (bekleme ve bloke hariç) |

## İstasyon görsel durumu (R-015)

Öncelik sırasıyla:

| Durum | Koşul |
|---|---|
| **Offline** | İstasyon PLC'sinin heartbeat'i yok (Online=0 ya da 180 sn sessizlik) |
| **Fault / NOK** | İstasyon FAULT durumunda **ya da** üzerindeki motorun açık tork NOK / operasyon NOK alarmı var |
| **Warning / Takt riski** | Süren çevrim takt'ın %90'ını geçti |
| **Running / Normal** | Diğer durumlar |

Alt durum metinle gösterilir: çalışıyor, boş (motor bekliyor), ön montaj kiti bekliyor, bloke (sonraki istasyon dolu), durdu.

Ön montaj hücresinde ayrıca buffer < min ise ya da hücre durmuşsa (ör. operatör yok) durum *Warning* olur.

Kalan süre, hedef çevrim − geçen süre olarak hesaplanır. Veri 3–5 dk'da bir geldiği için ekranda **tahmin** olarak gösterilir.

## Alarm kuralları (R-056; admin'den değiştirilebilir)

| Kod | Ad | Kaynak | Önem | Eskalasyon | Varsayılan ekip | Açılır | Koşul biter |
|---|---|---|---|---|---|---|---|
| PLC-FLT | İstasyon arızası | PLC | critical | 2 dk | Bakım Ekibi | StationEvents FAULT | sonraki durum |
| HB-LOSS | Heartbeat / bağlantı kaybı | System | critical | 2 dk | Otomasyon | Online=0 ya da 180 sn sessizlik | Online=1 |
| CYC-TAKT | Takt aşımı | Cycle | warning | 10 dk | Üretim Lideri | çevrim > takt × %110 | çevrim biter |
| OP-NOK | Operasyon NOK | PLC | warning | 10 dk | Üretim Lideri | END NOK (OP100 dışı) | motor sonraki istasyona geçer |
| TQ-NOK | Tork NOK | Torque | warning | 10 dk | Üretim Lideri | sıkma NOK | aynı joint OK |
| VIS-NOK | OP100 kalite reddi | Vision | critical | 2 dk | Kalite Ekibi | OP100 NOK | rework kapanır (re-QC OK) |
| VIS-HOLD | OP100 HOLD | Vision | warning | 10 dk | Kalite Ekibi | OP100 HOLD | motor OP100'e tekrar girer |
| BUF-LOW | Düşük ön montaj buffer'ı | Material | warning | 10 dk | Lojistik | buffer < min | buffer ≥ min |
| TRC-DUP | Mükerrer komponent seri no | System | critical | 2 dk | Kalite Ekibi | başka motorda takılı S/N okutuldu | doğru parça okutulur |
| AND-MAT / AND-QUA / AND-PRD | Andon (malzeme / kalite / üretim) | Operator | warning | 5 dk | Lojistik / Kalite / Üretim Lideri | teknisyen Andon açar (Faz 3) | — |
| NOTE-ERR | Teknisyen hata notu | Operator | warning | 10 dk | Üretim Lideri | "hata" tipinde not (Faz 3) | — |

**Yaşam döngüsü (R-038):** Detected → Acknowledged → Assigned → Closed. Atama önce onay ister; atanmış alarm yeniden atanabilir. Her adım kullanıcı ve zamanla kaydedilir.

**Koşul ve yaşam döngüsü ayrıdır:** Koşulun bitmesi ("cleared") alarmı kapatmaz; alarmı insanlar kapatır. Koşul sürdükçe aynı anahtar için ikinci alarm açılmaz. Koşul bitip tekrar oluşursa yeni alarm açılır.

**Eskalasyon:** kuraldaki süre içinde *Detected* durumundan çıkmayan (onaylanmayan) alarm eskale olur. Eskalasyon zamanı alarm zamanı + süre olarak kaydedilir.

## Rework akışı (R-034–R-036)

```
OP100 NOK ─▶ Incoming Triage ─▶ Diagnosis ─▶ Rework Bench ─▶ Ready for Re-QC ─▶ (motor OP100'e girer) Re-QC ─▶ OK: Kapandı
              ▲                                                                                              │
              └──────────────────────────────── NOK: yeni tur ◀──────────────────────────────────────────────┘
```

- **Kullanıcı adımları:** Triage → Diagnosis → Rework Bench → Ready for Re-QC. Sadece bir sonraki adıma geçilebilir.
- **Sistem adımları:** Re-QC başlaması, kapanış ve yeni tur collector tarafından yapılır.
- **Kayıttan gelen alanlar:** hata, kaynak OP, kategori, öncelik ve sorumlu ekip hata kataloğundan ve alarm kuralından gelir.
- **Kullanıcının doldurduğu alanlar:** kök neden ve rework operatörü.
