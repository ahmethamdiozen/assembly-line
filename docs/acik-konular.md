# Açık Konular ve Varsayımlar

Bu liste müşteriyle yapılacak teknik toplantı için hazırlandı. Cevaplar gelene kadar sistem aşağıdaki **varsayımlarla** çalışır. Her varsayım tek bir yerden (ana veri / admin ekranı ya da collector'daki SQL eşlemesi) değiştirilebilecek şekilde kurulur.

Kaynak kısaltmaları: **URS** = `ister.pdf` (v1.0) · **BL** = `01_customer_requirements_clean.md` · **PR** = müşteri HTML prototipi (`TM50.html`) · **VR** = bizim varsayımımız.

---

## A. Veri ve entegrasyon

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| A1 | Fabrikanın SQL Server'ında hangi tablolar ve kolonlar var? Bize salt-okur bir kullanıcı verilebilir mi? | Tablolar [`sql-veri-sozlesmesi.md`](sql-veri-sozlesmesi.md)'deki gibi (motor kaydı, operasyon başlangıç/bitiş, istasyon durumu, komponent okutma, tork, vision, ön montaj sayaçları, heartbeat, IO). Gerçek şema gelince sadece collector'daki SELECT'ler eşlenir. | VR |
| A2 | **Gecikme:** URS canlı veri için 1–3 sn hedefliyor (R-002, NFR-002). Veri SQL Server'dan 3–5 dk'da bir çekilecek. Bu sapma kabul ediliyor mu? | Ekranlardaki üretim verisi en fazla çekme aralığı kadar eski olur. Ekranda her zaman "son fabrika verisi" zamanı gösterilir. Kullanıcı aksiyonları (not, Andon, alarm onayı) bu sapmadan etkilenmez, en geç 15 sn'de görünür. | Kullanıcı kararı |
| A3 | HOLD ve "operasyonu tamamla" fiziksel hatta nasıl yansıyacak? Fabrika sistemine geri yazmamız gerekiyor mu? | Bizim sistemimiz SQL Server'a **yazmaz**. HOLD ve tamamlama bizim veritabanımızda kayıt + audit olarak tutulur. Fiziksel durdurma ve serbest bırakma operatör / PLC tarafındadır. | VR |
| A4 | PLC, tork controller'ları ve kameralar SQL Server'a hangi sıklıkla yazıyor? Heartbeat verisi var mı? | Olaylar oluştukları anda yazılıyor. Heartbeat satırları en az dakikada bir geliyor. İstasyon "Offline" sayılma eşiği admin'den ayarlanır. | VR |
| A5 | ERP / MES entegrasyonu olacak mı? (iş emri, plan, varyant) | Yok. İş emri ve varyant SQL Server'daki motor kaydından okunur. | BL §16 |

## B. Hat ve üretim

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| B1 | Hat senkron mu (takt ile tüm istasyonlar birlikte ilerler), asenkron mu (her palet işi bitince boşalan istasyona geçer)? Giriş buffer'ı var mı? | Asenkron palet akışı; istasyon başına 1 motor; OP005 öncesi giriş buffer'ı. | VR |
| B2 | Gerçek takt ve istasyon hedef cycle süreleri? | Takt 7,5 dk. Hedefler: OP005 3,2 · OP010 5,8 · OP015 3,7 · OP020 5,2 · OP030 5,6 · OP040 3,9 · OP050 7,0 · OP060 6,2 · OP070 6,6 · OP080 6,8 · OP090 5,9 · OP100 4,8 · OP110 4,5 dk. | PR |
| B3 | Vardiya planı ve molalar (KPI'daki "planlı süre" için)? | A 08–16, B 16–24, C 00–08; mola tanımı yok (planlı süre = vardiya süresi). | PR |
| B4 | Uyarı ve alarm eşikleri? | Çalışma süresi takt'ın %90'ını geçince istasyon "Warning / Takt riski" olur; %110'u geçince alarm üretilir. | PR |
| B5 | Ön montaj buffer min / max seviyeleri, günlük hedefler ve kim ayarlayacak? Ön montaj sayaçları ve supermarket stok sayısı SQL Server'da var mı? | Hedef 192 / gün (3 vardiya × 64); min buffer admin'den ayarlanır (varsayılan 10, max 24; OP206 için 20). Üretim sayaçları kümülatif, buffer stoğu fabrika tarafından sayılıp SQL Server'a yazılıyor (`SubassemblyCounters.BufferQty`). Stok sayısı yoksa "üretilen − ana hatta tüketilen" ile türetilebilir. | PR, VR, BL §16 |
| B6 | Ön montaj → ana hat besleme ilişkileri doğru mu? | OP201 Krank Seti → OP010 · OP202 Silindir Blok Seti → OP050 · OP203 Gaz Kelebeği Seti → OP060 · OP205 Motor Askı ve Devir Sensör Flanşı → OP030 · OP206 Marş Dişlisi Pervane Flanşı → OP080. | PR |

## C. İzlenebilirlik ve kalite

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| C1 | Motor seri numarası ve iş emri formatı? | Motor `TM50-YYMMDD-NNNN`, iş emri `WO-TM50-YYMMDD-NN`. | PR |
| C2 | Komponent seri numarası formatları ve hangi istasyonda okutuldukları? Krank mili OP010'da mı okutuluyor, OP201'de mi? | Format `XXX-TM50-NNNNNN` (GKS, MBL, KRK, PCS, KBL, ALT, MRS). Okutma: MBL ve KRK → OP010, PCS → OP050, GKS → OP060, KBL ve ALT → OP070, MRS → OP080. | URS §7 |
| C3 | Barkod / QR / RFID okuyucu donanımı? | Okutmalar SQL Server'a fabrika tarafından yazılıyor; okuyucuyla doğrudan bağlantımız yok. | BL §16 |
| C4 | OP100: kamera sayısı, görüntülerin saklandığı yer (NAS yolu?), kararı kim veriyor (robot / kalite personeli), HOLD kriterleri? HOLD'daki motor fiziksel olarak nereye gidiyor? | Motor başına 6 görüntü (ön, arka, silindir 1-2, silindir 3-4, üst, pervane tarafı). Karar vision sisteminden OK / NOK / HOLD olarak gelir; görüntü yolları SQL Server'da. NOK ve HOLD motorlar hattan side-loop'a çıkar; motor OP100'e tekrar girince re-QC başlar ve HOLD çözülür. | PR, BL §16 |
| C5 | Rework durumları ve rework sonrası dönüş noktası? | Triage → Diagnosis → Rework Bench → Ready for Re-QC adımlarını kullanıcılar ilerletir; motorun OP100'e geri girdiği SQL verisinden görülür (re-QC) ve sonuç rework'ü kapatır ya da yeni tura alır. Motor her zaman OP100'e döner. Hata kategorileri: Montaj / Yönelim, Sızdırmazlık, Bağlantı / Tork, Proses / Doğrulama, Elektrik / Routing. | URS §8, PR |
| C6 | Komponent ne zaman "Installed" sayılmalı: okutulduğu anda mı, takıldığı operasyon bitince mi? | Operasyon OK bitince (R-029'un ifadesi). Okutulmuş ama operasyonu sürenler ekranda "okutuldu, operasyon sürüyor" notuyla Pending görünür. | BL R-029 |

## D. Tork

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| D1 | Hangi istasyonlarda sıkma var; Pset, joint ve tork aralıkları? | OP020 P20 24±2 Nm · OP030 P30 18±2 Nm · OP050 P50 22±2 Nm · OP080 P80 30±3 Nm. | PR |
| D2 | Controller / tool markası, sayısı ve protokolü? | Desoutter (prototipte geçiyor); sonuçlar SQL Server'a yazılıyor. Tool ve controller online durumu heartbeat tablosundan okunur. | PR, BL §16 |

## E. KPI

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| E1 | OEE, FPY ve plan gerçekleşme nasıl hesaplanmalı? Performans için ideal çevrim ne alınmalı? | OEE = A × P × Q · A = (planlı − arıza birleşimi) / planlı · P = çıkış × ideal çevrim (hattın en uzun hedef çevrimi, 7,0 dk) / çalışma süresi · Q = FPY = OP100'den ilk denemede OK geçen / OP100'e ilk kez gelen · Plan gerçekleşme = çıkış / (planlı süre / takt). Ayrıntılar ve örnek: [`kpi-tanimlari.md`](kpi-tanimlari.md). | VR, BL §16 |
| E2 | Darboğaz nasıl belirlenmeli? | Son 8 çevrimde ortalama net işleme süresi (START → END, bekleme hariç) en yüksek istasyon; takt'ı aşıyorsa "takt riski" olarak işaretlenir. | VR, BL §16 |
| E3 | Raporlarda "gün" ve "vardiya" nasıl tanımlanmalı? Veri toplanmaya başlamadan önceki süre ne olmalı? | Üretim günü 08:00'de başlar ("Tüm gün" = 08:00 → ertesi gün 08:00). Vardiya pencereleri bu güne göre (C vardiyası ertesi takvim gününün 00–08'i). Veri olmayan süre hesaba girmez: o vardiya "veri yok", kısmen verisi olan "kısmi veri" olarak gösterilir; arıza ya da düşük performans gibi görünmez. | VR |

## F. Kullanıcı, güvenlik, işletim

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| F1 | Kimlik doğrulama: lokal kullanıcı mı, Active Directory mi? RFID okuyucu klavye emülasyonu yapıyor mu? Kart numaraları nereden gelecek? | Lokal kullanıcı: personel no ya da RFID kart no + PIN / şifre (scrypt ile hash'li). Kart okuyucunun klavye gibi giriş alanına yazdığı varsayılıyor. Geliştirmede herkesin ilk PIN'i `1234` ve kart no `RF` + personel no rakamları; canlıda kullanıcılar ve kartlar Admin → Kullanıcılar & roller'den tanımlanır, PIN'ler sıfırlanır. | BL §16 |
| F2 | Hangi istasyonlarda teknisyen terminali (tablet / dokunmatik ekran) olacak? | İnsanlı istasyonların hepsinde. | VR |
| F3 | Alarm eskalasyonu nasıl bildirilecek (ekran, e-posta, SMS)? | Sadece ekranda (eskalasyon süresi dolunca alarm öne çıkar ve önem seviyesi gösterilir). | VR |
| F4 | Veri saklama süreleri, yedekleme politikası, sunucu ve HTTPS sertifikası? | Varsayılanlar (prototipten): istasyon olayları 5 yıl, tork 10 yıl, kalite görüntüleri 365 gün, audit 2 yıl. Günlük SQLite yedeği. | PR, BL §16 |
| F5 | 2 sn yanıt ve 1–3 sn canlı veri hedeflerinin ölçüm koşulları? | Yanıt süresi tarayıcı → API isteği olarak ölçülür. Canlı veri hedefi A2'deki sapmaya tabidir. | BL §16 |
| F6 | Hangi istasyon hangi yetkinlikleri ister? Eksik yetkinlikte giriş engellensin mi, üretim lideri onayıyla istisna yapılabilsin mi? | İnsanlı istasyonlar **Montaj L2**, sıkma yapılan istasyonlar (OP030, OP050, OP080) ayrıca **Torque Qualified** ister. Üst seviye alt seviyeyi karşılar (Montaj L3 ⊇ L2). Eksik yetkinlikle giriş **engellenir**, deneme audit'e yazılır. İstisna (override) yok. Kural `src/domain/qualifications.ts`'te tek yerde. | VR |
| F7 | Teknisyen istasyon girişi ne kadar geçerli? Vardiya bitince otomatik çıkış mı? Bir istasyonda iki teknisyen olabilir mi? | Giriş, yapıldığı vardiyanın sonuna kadar geçerli. İstasyonda tek teknisyen: yeni giriş öncekini kapatır; teknisyen başka istasyona girince eski girişi kapanır. Vardiya planı dışındaki giriş "yedek / takviye" olarak işaretlenir. | VR |
| F8 | "Operasyonu tamamla" ne anlama geliyor: PLC'ye bitiş sinyali mi, dijital onay mı? Kontrol listesi zorunlu mu? | Dijital onay. Teknisyen istasyona giriş yapmış olmalı ve kontrol listesindeki tüm adımları işaretlemeli. Onay motorun geçmişine ve audit'e yazılır. Fiziksel bitişi PLC bildirir; fabrika sistemine geri yazılmaz (A3). | VR |
| F9 | Uygulama logları ne kadar saklanmalı? | Her istek loglanmaz (yoklama). Hatalar, yavaş istekler, collector olayları ve hatalı girişler `logs/app.log`'a yazılır. Dosya açılışta 20 MB'ı geçtiyse bir önceki kopya olarak saklanır. Saklama süresi F4 ile birlikte netleşecek. | VR |

## G. Admin ve teslim

| # | Soru | Şu anki varsayım | Kaynak |
|---|---|---|---|
| G1 | OP kodları değişebilir mi? Değişirse fabrika verisindeki istasyon kodu da değişecek mi? | OP kodu fabrika verisindeki istasyon koduyla eşleşir; Admin ekranından değişmez (ad, tip, hedef çevrim, PLC / Cell ID, tool, reçete değişir). Kod değişikliği gerekirse collector eşlemesi ve geçmiş kayıtların taşınmasıyla birlikte bir bakım işlemi olarak yapılır. İstenirse admin ekranına "OP kodunu yeniden adlandır" (geçmişi taşıyarak) eklenir. | VR |
| G2 | Yeni istasyon eklenmesi / çıkarılması (hat değişikliği) | Kapsam dışı: 13 ana + 5 ön montaj istasyonu sabit. Hat yapısı değişirse ana veri, simülatör ve tamamlanma hesabı (13 operasyon) birlikte güncellenir. | URS §4 |
| G3 | Yedekleme politikası: sıklık, saklama, başka konuma kopyalama, geri yükleme yetkisi | Günde bir otomatik yedek (02:00), son 14 yedek aynı diskte; başka diske / NAS'a kopyalama işletim sistemi görevleriyle (kurulum.md 6). Geri yükleme sunucu kapalıyken komut satırından; arayüzden yapılmaz. | VR, BL §16 |
| G4 | Saklama süreleri sonunda veri silinmeli mi, arşive mi alınmalı? | Süresi dolan kayıtlar silinir (her gün, yedekten sonra); arşivleme yok. Yedekler o güne kadarki veriyi içerir. Varsayılan süreler F4'te. | VR |
| G5 | Kullanıcılar silinebilmeli mi? | Silinmez, pasifleştirilir: geçmiş kayıtlarda (operasyon, audit) adı kalır. | VR |
| G6 | Demo ortamı müşteriyle paylaşılabilir mi? | Kurulumsuz demo GitHub Pages'te herkese açık: <https://ahmethamdiozen.github.io/assembly-line/>. Kurgusal kişi adları ve simüle veri içerir. | Kullanıcı kararı |
