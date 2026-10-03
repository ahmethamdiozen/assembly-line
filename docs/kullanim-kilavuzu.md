# Kullanım Kılavuzu

TM50 montaj hattı izleme ve izlenebilirlik yazılımının son kullanıcı ve admin kılavuzu (R-079). Kurulum için [`kurulum.md`](kurulum.md), hesap tanımları için [`kpi-tanimlari.md`](kpi-tanimlari.md).

Denemek için kurulumsuz demo: <https://ahmethamdiozen.github.io/assembly-line/>. Demoda giriş rol seçerek yapılır, hat ve fabrika verisi tarayıcıda simüle edilir.

## 1. Giriş ve ekran düzeni

- **Giriş:** Personel numaranızı yazın ya da kartınızı okutun (kart okuyucu numarayı ilk alana yazar), PIN'inizi girin. 5 hatalı denemede hesap 5 dk kilitlenir; admin kilidi açabilir.
- **Sol menü:** Ekranlar. Geniş ekranda adlarıyla, dar ekranda ikonlarla görünür.
- **Üst çubuk:**
  - **Son fabrika verisi:** Verinin hangi ana kadar işlendiği ve bir sonraki çekme. Fabrika verisi 3–5 dk'da bir gelir; ekran 15 sn'de bir yenilenir.
  - **Uyarılar:** "Veri gecikiyor" fabrika verisinin beklenenden eski olduğunu, "Sunucuya ulaşılamıyor" bağlantının koptuğunu gösterir. İkisinde de eldeki veri ekranda kalır.
  - **Diğer:** Vardiya, saat, kullanıcı adı ve rolü, çıkış.
- **Durum dili:** Her durum renk, ikon ve metinle gösterilir: Running / Normal (yeşil, onay), Warning / Takt riski (sarı, üçgen), Fault / NOK (pembe, sekizgen), Offline (gri, fiş).
- **Bağlantılar:** Ekrandaki motor seri numaraları tıklanınca o motorun geçmişi açılır. Adres çubuğundaki bağlantı paylaşılınca aynı görünüm açılır (ör. bir alarm, bir rapor günü).

Görüntüleme herkese açıktır. Değişiklik yapan işlemler rol iznine bağlıdır; izniniz olmayan düğmeler görünmez.

## 2. Teknisyen

**Teknisyen Terminali** istasyondaki tablet / panel PC içindir.

1. Menüden ya da istasyon tabletindeki kısayoldan terminali açın. Kendi istasyonunuz seçili gelir.
2. **İstasyona giriş:** "İstasyonuna giriş yap". Sistem istasyonun gerektirdiği yetkinlikleri kontrol eder (insanlı istasyon Montaj L2, sıkma yapılan istasyon ayrıca Torque Qualified). Eksikse giriş yapılamaz; üretim liderine başvurun. Vardiya planınızda olmayan bir istasyona girerseniz yedek / takviye olarak kaydedilir.
3. **Aktif görev kartı:**
   - İstasyondaki motor, geçen süre ve tahmini kalan süre. Süre son fabrika verisine göredir ve birkaç dakika gecikmeli olabilir.
   - Kontrol listesi, takılacak parçalar (okutulan seri numarasıyla) ve sıkma noktaları (OK / NOK).
4. **Operasyonu tamamla:** Kontrol listesinin tüm adımlarını işaretleyin, isterseniz not yazın, "Operasyonu tamamla"ya basın. Onay motorun geçmişine adınızla yazılır. Fiziksel bitişi PLC bildirir.
5. **Hızlı aksiyonlar:**
   - **Not ekle:** Bilgi, uyarı ya da hata. Hata notu üretim liderine alarm olarak düşer.
   - **Malzeme talebi / Kalite desteği / Üretim desteği:** Andon çağrısı. İlgili ekibe alarm olarak düşer.
   - **Motoru HOLD'a al:** Nedenini yazın. Kalite kararı bekler.
6. **Vardiya sonu:** "İstasyondan çık". Giriş zaten vardiya bitince geçersiz olur.

**Kiosk modu:** Terminalde "Kiosk modu" menüyü ve üst çubuğu gizler (adres: `#/terminal/OP070?kiosk=1`). Kiosktaki "Çıkış" hem istasyon girişini hem oturumu kapatır; sıradaki teknisyen kendi kartıyla girer.

Kontrol Merkezi'nde istasyon panelinin **Notlar** sekmesinden de not eklenebilir; **Kalite & Tork** sekmesinden Andon açılabilir.

## 3. Üretim Lideri / Supervisor

**Kontrol Merkezi** hattın tamamını tek sayfada gösterir:

- **KPI şeridi (süren vardiya):** Çıkış / hedef, plan gerçekleşme, OEE, FPY, takt, darboğaz.
- **Hat:** 13 ana istasyon, istasyonlardaki motorlar ve altta 5 ön montaj hücresi (buffer seviyesi ve beslediği istasyon). İstasyona tıklayınca sayfa değişmeden **Seçili İstasyon** paneli güncellenir.
- **Seçili İstasyon paneli sekmeleri:**
  - **Genel:** Durum, teknisyen, çevrim, takt sapması.
  - **Proses:** Reçete, kontrol listesi, komponentler.
  - **Kalite & Tork:** Son kalite sonucu, sıkmalar, Andon.
  - **Varlık & IO:** Bağlantı, heartbeat, sensörler, bakım metrikleri.
  - **Notlar:** İstasyon notları ve not ekleme.
  - **Geçmiş:** İstasyondaki son motorlar.
- **Diğer kartlar:** Çevrim grafiği, rework kuyruğu, son olaylar.

**Alarm & Andon:**

1. Alarmları önem, durum, kaynak, istasyon ve metinle süzün. Satıra tıklayınca sağda ayrıntı açılır.
2. **Onayla** → **Ata** (ekip ya da kişi; gerekirse yeniden atanır) → **Kapat** (kapanış notu). Her adım adınız ve zamanla yaşam döngüsünde görünür.
3. Kuraldaki sürede onaylanmayan alarm "eskale" olur ve öne çıkar.
4. Alarm bir motora bağlıysa "Motor geçmişi" bağlantısı motoru açar.

**KPI & Raporlar:**

- Üretim günü ve vardiya seçin (Bugün / Dün / tarih, A / B / C / tüm gün).
- Göstergeler: OEE, Availability, Performance, FPY, çıkış / saat, plan gerçekleşme. Ayrıca vardiya karşılaştırması, saatlik çıkış, istasyon çevrimleri ve darboğaz.
- Bir istasyonun çubuğuna tıklayınca çevrim trendi o istasyona geçer. Kalite hataları ve alarm kaynakları Pareto'su da bu ekrandadır.
- Veri toplanmadan önceki süre hesaba girmez ("kısmi veri" uyarısı).

## 4. Kalite

**Kalite & Rework:**

- **OP100 sonuçları ve FPY:** Seçilen aralık için.
- **Rework akışı:** Incoming Triage → Diagnosis → Rework Bench → Ready for Re-QC.
  - Kart üzerindeki düğme sıradaki adıma alır.
  - Tezgâha (Rework Bench) geçmeden kök neden ve rework operatörü yazılmalı.
  - Öncelik ve sorumlu ekip kart üzerinden değiştirilebilir.
- **Re-QC:** Motor OP100'e tekrar girince kendiliğinden başlar. OK çıkarsa kayıt kapanır, NOK çıkarsa yeni turla Triage'a döner.
- **HOLD kararları:** "Serbest bırak" ya da "Rework'e gönder".
- **Hata Pareto'su:** OP100 NOK / HOLD nedenleri ve tork NOK'ları.

**Motor Takibi:**

- Seri numarası ya da takılı bir parçanın seri numarasıyla arayın.
- Ekranda şunlar görünür: tamamlanma yüzdesi, takılan parçalar (Installed / Pending), operasyon geçmişi (giriş, çıkış, cycle, teknisyen, onay, sonuç), OP100 kararları ve görüntüler, rework / HOLD geçmişi, sıkmalar ve alarmlar.
- "HOLD'a al" düğmesi de buradadır.

**Tork:** Sıkma kayıtları, controller / tool durumu. "CSV indir" filtredeki tüm kayıtları Excel'de açılan dosyaya verir.

## 5. Bakım / Otomasyon

**Bakım & Entegrasyon:**

- **Genel bakış:**
  - Fabrika SQL Server'ı, canlı veri kanalı, PLC, tork, kamera ve uygulama veritabanının durumu.
  - Collector turları ve "Şimdi çek" (3–5 dk beklemeden okutur).
  - Son arızalar ve istasyon bakım metrikleri (arıza, MTTR, MTBF, çalışma oranı).
- **Cihazlar & IO:** Heartbeat'ler (sadece offline olanları süzebilirsiniz), istasyon sensör / IO durumları.
- **Ham fabrika tabloları:** SQL Server'daki son 50 satır, collector'ın okuduğu biçimde. Veri gelmiyorsa ilk bakılacak yer.
- **Loglar & sistem:** Uygulama logu (seviye filtresi), sürüm, veritabanı boyutu, tablo satır sayıları, yedekler.

Alarm Merkezi'nde arıza ve bağlantı alarmlarını onaylayıp kapatabilirsiniz.

## 6. Admin

**Admin** ekranı sekmelerden oluşur. Her değişiklik doğrulanır (ör. vardiyalar 24 saati boşluksuz kaplamalı, aynı PLC ID iki istasyonda olamaz) ve audit kaydına önceki / sonraki değerleriyle yazılır.

| Sekme | Ne yapılır |
|---|---|
| Hat & istasyonlar | Takt, uyarı / alarm eşikleri, heartbeat zaman aşımı, üretim günü başlangıcı, vardiyalar; istasyon adı, tipi, hedef çevrimi, PLC / Cell ID, tool, reçete. OP kodu fabrika verisiyle eşleştiği için buradan değişmez. |
| Kullanıcılar & roller | Kullanıcı ekleme (ilk PIN ve kart), rol, vardiya, istasyon ataması, yetkinlikler; kart tanımlama, PIN sıfırlama (kullanıcının açık oturumları kapanır), kilit açma, pasifleştirme (kullanıcı silinmez; kayıtlarda adı kalır). Rol izinleri matrisi: değişiklik açık oturumlarda hemen geçerli olur. Admin rolünden kullanıcı yönetimi izni kaldırılamaz; kendinizi pasifleştiremezsiniz; en az bir aktif admin kalır. |
| Ön montaj beslemesi | Her hücrenin beslediği ana hat istasyonu, kit, buffer min / max, günlük hedef. |
| Alarm kuralları | Önem, eskalasyon süresi, varsayılan ekip, açık / kapalı. |
| Entegrasyon | Fabrika SQL Server bağlantısını test etme; çekme aralığı (3–5 dk). |
| Saklama & yedek | Veri grubu başına saklama süresi (dolanlar her gün temizlenir; "Şimdi temizle" önce kaç kaydın silineceğini gösterir), otomatik yedek saati ve sayısı, "Şimdi yedek al", mevcut yedekler. |
| Audit kaydı | Kim, ne zaman, neyi değiştirdi: zaman aralığı, işlem, kullanıcı ve kayıt no ile süzme; satıra tıklayınca önce / sonra; CSV. |

## 7. Sık sorulanlar

- **Ekrandaki veri neden birkaç dakika geride?** Fabrika verisi SQL Server'dan 3–5 dk'da bir çekilir (fabrika veritabanına yük bindirmemek için). Kullanıcı işlemleri (not, Andon, alarm onayı) bu gecikmeden etkilenmez; diğer ekranlarda en geç 15 sn'de görünür.
- **"Kalan süre" neden tahmin?** Süre son fabrika verisindeki operasyon başlangıcına göre hesaplanır; operasyon o arada bitmiş olabilir.
- **PIN'imi unuttum.** Admin PIN'inizi sıfırlar.
- **Hesabım kilitlendi.** 5 dk bekleyin ya da admin'e kilidi açtırın.
- **Bir istasyona giremiyorum.** Yetkinliğiniz eksik olabilir; terminal eksik yetkinliği yazar. Üretim liderine ya da admin'e başvurun.
