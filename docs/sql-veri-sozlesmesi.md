# SQL Server Veri Sözleşmesi

Bu doküman, fabrikanın SQL Server'ından **hangi verileri beklediğimizi** ve collector'ın bunları **nasıl anlamlandırdığını** tanımlar. Tablo ve kolon adları varsayımdır (`server/sql/schema.sql`). Gerçek şema geldiğinde yalnızca collector'daki SELECT'ler eşlenir. Satır tipleri `src/pipeline/rows.ts`'te, dönüştürücü `src/pipeline/transform.ts`'tedir.

## Genel kurallar

| Kural | Açıklama |
|---|---|
| Sadece okuma | Collector salt-okur bir kullanıcıyla bağlanır; SQL Server'a hiçbir şey yazmaz. |
| Çekme aralığı | 3–5 dk (`COLLECT_INTERVAL_MIN`). Her turda her tablodan yalnızca `Id > son okunan` satırlar okunur. |
| Sadece ekleme | Satırlar güncellenmez ve silinmez; `Id` artan identity'dir. |
| Zaman | UTC, milisaniye hassasiyetli (`datetime2(3)`). Aynı tablodaki satırlar zaman sırasıyla yazılır. |
| Güvenlik payı | Okuma anından 15 sn yakın satırlar bir sonraki tura bırakılır (tablolar arası yazma gecikmesine karşı). |
| Sıra | Bir turda okunan tüm satırlar zamana göre birleştirilip sırayla işlenir. Aynı anda olanlar aşağıdaki tablo sırasıyla işlenir. |
| Tutarlılık | Bir tur tek transaction'dır. Okuma konumu (`sync`) ve veri tazeliği (`watermark`) aynı transaction'da kaydedilir. Collector yeniden başlarsa kaldığı yerden devam eder. |

3 dk'da bir çekmenin tek seferde çekmekle aynı sonucu verdiği testle doğrulanır (`src/pipeline/pipeline.test.ts`).

## Tablolar

### 1. `MotorRegistry` — motor kaydı (OP005)

| Kolon | Tip | Açıklama |
|---|---|---|
| Id | bigint | identity |
| MotorSerial | varchar(30) | `TM50-YYMMDD-NNNN` |
| WorkOrderNo | varchar(30) | iş emri |
| Variant | nvarchar(40) | `TM50 / STD` |
| CreatedUtc | datetime2(3) | |

**Collector:** `motor` kaydı açılır (durum *Hatta*). Kayıt görülmeden operasyon gelirse motor yine oluşturulur, iş emri sonra doldurulur.

### 2. `StationEvents` — istasyon durumu (sadece değişince)

| Kolon | Açıklama |
|---|---|
| StationCode | `OP005`…`OP110`, `OP201`…`OP206` |
| EventUtc | |
| StateCode | 1 RUNNING · 2 STARVED (boş / kit bekliyor) · 3 BLOCKED (çıkış dolu) · 4 FAULT · 5 STOPPED |
| FaultCode, FaultText | FAULT / STOPPED / STARVED nedeni (ör. `PLC-HS`, `MAT-WAIT`, `NO-OPR`) |

**Collector:** `station_span` (başlangıç–bitiş aralıkları). FAULT → **PLC-FLT** alarmı; sonraki durumda koşul temizlenir. Arıza aralıkları Availability hesabına girer.

### 3. `OperationEvents` — operasyon başlangıç / bitiş

| Kolon | Açıklama |
|---|---|
| MotorSerial, StationCode | |
| EventType | START / END |
| EventUtc | |
| OperatorNo | insanlı istasyonda teknisyen sicil no (otomatik / robot: NULL) |
| Result | END'de OK / NOK |

**Collector:**
- START ile `motor_op` açılır, motorun bulunduğu istasyon güncellenir. OP100'de rework'teki ya da HOLD'daki motor görülürse re-QC başlar ve HOLD çözülür.
- END ile çevrim süresi (net işleme süresi = END − START) ve sonuç yazılır. Son istasyonda (OP110) OK ise motor *Tamamlandı* olur.
- Çevrim takt'ın %110'unu aşarsa **CYC-TAKT** alarmı açılır. Çevrim sürerken aşılırsa alarm yoklama anında açılır, bitince koşul temizlenir.
- OP100 dışında NOK biterse **OP-NOK** alarmı açılır.

### 4. `ComponentScans` — seri numaralı komponent okutma

| Kolon | Açıklama |
|---|---|
| MotorSerial, StationCode | |
| ComponentType | GKS, MBL, KRK, PCS, KBL, ALT, MRS |
| ComponentSerial | `XXX-TM50-NNNNNN` |
| LotNo, ScanUtc, OperatorNo | |

**Collector:** `component_install` (motor ↔ komponent genealogy'si).
- Aynı seri no başka bir motorda takılıysa kayıt değişmez ve **TRC-DUP** alarmı açılır. Doğru parça okutulunca alarm temizlenir.
- Aynı motora aynı tipte yeni parça okutulursa (rework'te değişim) eskisi "söküldü" olarak saklanır.
- Komponent, takıldığı operasyon OK bitene kadar ekranlarda *Pending* görünür (R-029).

### 5. `TighteningResults` — tork sonuçları

Kolonlar: ResultUtc, MotorSerial, StationCode, ControllerId, ToolId, Pset, JointId, TargetNm, MinNm, MaxNm, TorqueNm, AngleDeg, Result.

**Collector:** `tightening`. NOK → **TQ-NOK** alarmı (motor + istasyon + joint için tek alarm). Aynı joint'in OK retry'ı koşulu temizler.

### 6. `VisionResults` ve `VisionImages` — OP100

| Kolon | Açıklama |
|---|---|
| InspectionId | vision sisteminin muayene kimliği; görüntüleri sonuca bağlar |
| MotorSerial, ResultUtc | |
| Decision | OK / NOK / HOLD |
| DefectCode, DefectText | hata kataloğundaki kod (kaynak OP, kategori ve öncelik buradan bulunur) |
| ViewName, ImagePath | görüntü (görüntü dosyası fabrikanın deposunda; biz yolunu saklarız) |

**Collector:** `quality_result`, `quality_image`.
- **OK:** açık rework varsa kapanır.
- **NOK:** **VIS-NOK** alarmı açılır, rework kaydı (Incoming Triage) oluşur ve motor *Rework* olur. Re-QC'de tekrar NOK olursa aynı rework yeni turla triage'a döner.
- **HOLD:** **VIS-HOLD** alarmı ve HOLD kaydı oluşur, motor *HOLD* olur.
- İlk muayene sonucu FPY'ye girer.

### 7. `SubassemblyCounters` — ön montaj (dakikada bir)

Kolonlar: CellCode, SampleUtc, ProducedTotal, NokTotal (üretim günü başında sıfırlanır), BufferQty (supermarket stoğu).

**Collector:** `sub_sample`. Günlük üretim, son 60 dk hızı ve buffer gösterilir. BufferQty < min → **BUF-LOW** alarmı açılır, min'e dönünce temizlenir.

### 8. `DeviceHeartbeats` — cihaz bağlantısı (dakikada bir)

Kolonlar: DeviceId, DeviceType (PLC / CONTROLLER / TOOL / CAMERA), StationCode, SampleUtc, Online.

**Collector:** `device`. Online=0 satırı ya da 180 sn heartbeat gelmemesi → **HB-LOSS** alarmı ve istasyon *Offline* olur. Online=1 geldiğinde temizlenir.

### 9. `IoSignals` — sensör / IO (sadece değişince)

Kolonlar: StationCode, SignalName, Value, SampleUtc.

**Collector:** `io_state` (istasyon başına son değer); Varlık & IO sekmesinde gösterilir.

## Gerçek veriye geçiş

1. `.env`'deki SQL Server bağlantısını fabrikanın sunucusuna çevir ve simülatörü çalıştırma.
2. Collector'daki SELECT'leri gerçek tablo ve kolon adlarına eşle. Gelen her satır yukarıdaki satır tiplerine dönüştürülmelidir.
3. Durum ve arıza kodlarını, hata kataloğunu ve komponent tiplerini ana veride (admin) gerçek değerlere göre güncelle.
4. Gerçek sistemde olmayan veri (ör. heartbeat, IO) varsa ilgili ekran bölümü "veri yok" gösterir; diğer her şey çalışmaya devam eder.
