# Canlı Kurulum

Bu doküman uygulamanın fabrika sunucusuna kurulmasını, servis olarak çalıştırılmasını, HTTPS'i, yedeklemeyi ve güncellemeyi anlatır (R-072, R-075, R-078). Geliştirme ortamı için [`README.md`](../README.md).

## 1. Hedef ortam

| | Öneri |
|---|---|
| İşletim sistemi | Windows Server 2019 / 2022 (Linux da olur; bkz. 5.2) |
| Donanım | 2 çekirdek, 4 GB bellek, 20 GB disk (bir hat için; veritabanı yılda ~1–2 GB büyür) |
| Yazılım | [Node.js 24 LTS](https://nodejs.org) (22.13 ve üzeri çalışır). Başka veritabanı sunucusu gerekmez: uygulama veritabanı SQLite dosyasıdır. |
| Ağ | Fabrika SQL Server'ına TCP 1433 (ya da tanımlı port) erişimi; kullanıcı bilgisayarlarından ve istasyon tabletlerinden sunucuya HTTPS (443) erişimi |
| Tarayıcı | Güncel Chrome ya da Edge. Önerilen ekran 1920 × 1080; 1366 × 768'de de çalışır. |

Docker canlıda gerekmez; sadece geliştirmede simüle SQL Server için kullanılır.

## 2. Fabrika SQL Server'ında salt-okur kullanıcı

Uygulama fabrika veritabanına **yazmaz**. Sadece okuma izni olan bir kullanıcı açın (SQL Server Management Studio'da, veritabanı yöneticisi):

```sql
CREATE LOGIN tm50_reader WITH PASSWORD = '<güçlü şifre>', CHECK_POLICY = ON;
USE TM50Line;   -- fabrikanın veritabanı adı
CREATE USER tm50_reader FOR LOGIN tm50_reader;
-- Sadece okunacak tablolar (gerçek adlar proje başında eşlenir; docs/sql-veri-sozlesmesi.md)
GRANT SELECT ON dbo.MotorRegistry TO tm50_reader;
GRANT SELECT ON dbo.StationEvents TO tm50_reader;
GRANT SELECT ON dbo.OperationEvents TO tm50_reader;
GRANT SELECT ON dbo.ComponentScans TO tm50_reader;
GRANT SELECT ON dbo.TighteningResults TO tm50_reader;
GRANT SELECT ON dbo.VisionResults TO tm50_reader;
GRANT SELECT ON dbo.VisionImages TO tm50_reader;
GRANT SELECT ON dbo.SubassemblyCounters TO tm50_reader;
GRANT SELECT ON dbo.DeviceHeartbeats TO tm50_reader;
GRANT SELECT ON dbo.IoSignals TO tm50_reader;
```

Gerçek tablo ve kolon adları farklıysa sadece `server/collector/sqlReader.ts`'teki SELECT'ler değişir (bkz. [`sql-veri-sozlesmesi.md`](sql-veri-sozlesmesi.md)).

## 3. Kurulum

Örnekte kurulum klasörü `C:\tm50`. Komutlar PowerShell'de, bu klasörde çalıştırılır.

1. **Kodu alın:** `git clone https://github.com/ahmethamdiozen/assembly-line.git C:\tm50` ya da teslim edilen zip'i açın.
2. **Bağımlılıklar ve derleme:**
   ```powershell
   npm ci
   npm run build          # arayüz → dist/
   npm run build:server   # sunucu → dist-server/
   npm prune --omit=dev   # derleme araçları artık gerekmez
   ```
3. **Ayarlar:** `.env.example`'ı `.env` olarak kopyalayıp düzenleyin:

   | Ayar | Canlı değer |
   |---|---|
   | `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DB` | Fabrika SQL Server'ı |
   | `MSSQL_USER`, `MSSQL_PASSWORD` | 2. adımdaki `tm50_reader` ve şifresi (`sa` kullanmayın) |
   | `SQLITE_PATH` | `data/tm50.db` (yedeklenen disk) |
   | `API_HOST` | `0.0.0.0` (ağdan erişim) |
   | `API_PORT` | `443` (doğrudan HTTPS) ya da `3001` (önünde reverse proxy) |
   | `HTTPS_KEY`, `HTTPS_CERT` | Doğrudan HTTPS'te PEM dosya yolları (bkz. 4) |
   | `COOKIE_SECURE` | HTTPS reverse proxy'de sonlanıyorsa `1` |
   | `COLLECT_INTERVAL_MIN` | `3` (sadece ilk açılışta; sonra Admin → Entegrasyon) |
   | `DEFAULT_PIN` | İlk açılışta herkese atanacak geçici PIN; ilk girişten sonra değiştirilir |

4. **İlk çalıştırma:** `npm start`. Konsolda `API: https://0.0.0.0:443 …` görünür. Tarayıcıda sunucu adresini açın.
   - Arayüz ve API aynı adresten sunulur; ayrı web sunucusu gerekmez.
   - İlk açılışta veritabanı oluşturulur, ana veri ve roller varsayılanlarla yazılır, personel listesindeki herkese `DEFAULT_PIN` atanır.
   - Collector fabrika verisini okumaya başlar. Bağlantı durumu: Bakım & Entegrasyon ekranı.
5. **Kullanıcılar ve PIN'ler:** `A-0001` (Admin) ile girin. Admin → Kullanıcılar & roller'de gerçek personeli tanımlayın, kart numaralarını girin, herkesin PIN'ini sıfırlayın, kullanılmayan örnek kullanıcıları pasifleştirin. Admin'in kendi PIN'ini de değiştirin.
6. **Ana veri:** Admin → Hat & istasyonlar, Ön montaj beslemesi ve Alarm kurallarında takt, hedef süreler, PLC / Cell ID'ler, buffer seviyeleri ve eskalasyon sürelerini gerçek değerlerle doldurun. Her değişiklik audit'e yazılır.

## 4. HTTPS (R-072)

İki yol var:

- **Doğrudan:** Kurumsal CA'dan ya da sunucu sertifikasından PEM biçiminde anahtar ve sertifika alın. `.env`'de `HTTPS_KEY=C:\tm50\certs\server.key`, `HTTPS_CERT=C:\tm50\certs\server.crt`, `API_PORT=443` verin. Oturum çerezi otomatik olarak `Secure` olur.
- **Reverse proxy (IIS ARR ya da nginx):** Uygulama `127.0.0.1:3001`'de HTTP dinler. Proxy 443'te HTTPS'i sonlandırıp isteği iletir. `.env`'de `COOKIE_SECURE=1` verin. Proxy `Host` başlığını korumalı; `/api` ve diğer tüm yollar aynı arka uca gider.

Şifreler ve PIN'ler scrypt ile tuzlanıp saklanır; düz metin tutulmaz. Oturum çerezi `HttpOnly` ve `SameSite=Strict`'tir. Yanıtlarda temel güvenlik başlıkları (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) vardır.

## 5. Servis olarak çalıştırma

### 5.1 Windows (NSSM)

[NSSM](https://nssm.cc) ile Windows servisi olarak kurun; sunucu açılınca başlar, çökerse yeniden başlar:

```powershell
nssm install TM50 "C:\Program Files\nodejs\node.exe" "C:\tm50\dist-server\index.js"
nssm set TM50 AppDirectory C:\tm50
nssm set TM50 AppStdout C:\tm50\logs\service.log
nssm set TM50 AppStderr C:\tm50\logs\service.log
nssm set TM50 AppExit Default Restart
nssm start TM50
```

Durdurmak: `nssm stop TM50`. Uygulama `SIGTERM`'de collector'ı durdurup veritabanını kapatarak çıkar.

### 5.2 Linux (systemd)

```ini
# /etc/systemd/system/tm50.service
[Unit]
Description=TM50 montaj hattı izleme
After=network-online.target

[Service]
WorkingDirectory=/opt/tm50
ExecStart=/usr/bin/node dist-server/index.js
Restart=on-failure
User=tm50

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now tm50`. Uygulama 443 yerine 3001'de dinlesin; önüne nginx konsun (bkz. 4).

## 6. Yedekleme ve geri yükleme (R-075)

- **Otomatik:** Her gün Admin → Saklama & yedek'te ayarlanan saatten sonra (varsayılan 02:00) `backups\tm50-YYYYMMDD-HHMM.db` alınır; son N yedek tutulur (varsayılan 14). Yedek sunucu çalışırken alınır, tutarlıdır (SQLite `VACUUM INTO`). Her yedek audit'e yazılır.
- **Elle:** Admin ekranında "Şimdi yedek al" ya da komut satırında `node dist-server/backup.js`.
- **Başka diske kopyalama:** Yedekler aynı diskte durur. Windows Görev Zamanlayıcı'da her gün örneğin `robocopy C:\tm50\backups \\nas\yedek\tm50 /MIR` çalıştırın.
- **Geri yükleme:** Servisi durdurun, yedeği geri yükleyin, servisi başlatın:
  ```powershell
  nssm stop TM50
  node dist-server/backup.js --restore backups\tm50-20261003-0200.db
  nssm start TM50
  ```
  Geri yükleme öncesinde yedeğin bütünlüğü kontrol edilir (`PRAGMA integrity_check`).
  - **Üretim verisi kaybolmaz:** Yedekten sonra fabrika SQL Server'ına yazılmış veriler (operasyonlar, tork, kalite) collector yedeğin okuma konumundan devam ederek yeniden okur.
  - **Kullanıcı işlemleri geri gelmez:** Yedekten sonra uygulamada yapılan işlemler (notlar, alarm onayları, rework adımları, admin değişiklikleri) yedekte olmadığı için tekrar girilmelidir. Bu yüzden geri yükleme sadece veritabanı bozulduğunda yapılır.
- **Tatbikat:** Devreye almadan önce bir geri yükleme denemesi yapın ve sonucu kabul testi kaydına ekleyin ([`kabul-testleri.md`](kabul-testleri.md) SAT-04).

Veri saklama süreleri (Admin → Saklama & yedek) dolan kayıtlar her gün yedekten sonra temizlenir; açık alarm, süren rework / HOLD ve hattaki motor silinmez.

## 7. Güncelleme

```powershell
nssm stop TM50
node dist-server/backup.js            # önce yedek
git pull                              # ya da yeni zip
npm ci
npm run build
npm run build:server
npm prune --omit=dev
nssm start TM50
```

Veritabanı yapısı açılışta ileri doğru migration'la güncellenir; veri silinmez. Yeni sürümle gelen izinler varsayılan rollerine eklenir, admin'in kaldırdığı izinlere dokunulmaz. Konsolda / `logs\service.log`'da sürüm ve migration mesajları görünür. Sürüm Bakım & Entegrasyon → Loglar & sistem'de de yazar.

## 8. İzleme ve loglar (R-057, R-073)

- **Sağlık kontrolü:** `GET /api/v1/health` (oturum gerektirmez): sunucu ayakta mı, collector'ın son başarılı turu ve son hatası. Kurumsal izleme sistemine bağlanabilir.
- **Uygulama logu:** `logs\app.log` (JSON satırları): hatalar, yavaş istekler, collector turları ve hataları, hatalı girişler, yedek ve temizlik işleri. Dosya açılışta 20 MB'ı geçtiyse `app.log.1` olarak saklanır. Bakım ve Admin rolleri logu Bakım & Entegrasyon → Loglar & sistem'de görür.
- **Veri tazeliği:** Her ekranın üstünde son fabrika verisinin saati görünür. Veri iki çekme aralığından eskiyse "Veri gecikiyor" uyarısı çıkar.

## 9. Sorun giderme

| Belirti | Neden ve çözüm |
|---|---|
| Bakım ekranında "Fabrika SQL Server: Okunamıyor", `Failed to connect` | Ağ, port, kullanıcı ya da şifre. Admin → Entegrasyon → "Bağlantıyı test et". SQL Server'da TCP/IP açık mı, güvenlik duvarı 1433'e izin veriyor mu? |
| `SQL Server'daki Id'ler okunan konumun gerisinde` | Fabrika tabloları sıfırlanmış ya da başka veritabanına bağlanılmış. Collector yanlış veriyi işlememek için durur. Doğru veritabanını kontrol edin; gerçekten sıfırlandıysa uygulama veritabanını yedekleyip okuma konumunu sıfırlamak için destek alın. |
| "Veri gecikiyor" | Collector son turlarda başarısız (yukarıdaki satır) ya da fabrika tarafı SQL Server'a yazmıyor (Bakım → Ham fabrika tabloları'nda son satırların zamanına bakın). |
| Kullanıcı giremiyor, "Çok fazla hatalı deneme" | 5 hatalı denemede 5 dk kilit. Admin → Kullanıcılar → "Kilidi aç" ya da PIN sıfırlama. |
| Port kullanımda (`EADDRINUSE`) | Başka bir süreç aynı portu dinliyor; `API_PORT`'u değiştirin ya da diğer süreci durdurun. |
| Ekran "Sunucuya ulaşılamıyor" | Servis çalışmıyor ya da ağ kesik. `nssm status TM50`, `logs\service.log`. |

## 10. Kurulumsuz demo

`main` dalına her gönderimde GitHub Actions testleri ve kabul testlerini çalıştırır, demoyu derleyip GitHub Pages'te yayınlar: <https://ahmethamdiozen.github.io/assembly-line/>. Demoda bütün veri hattı tarayıcıda simüle edilir; fabrika verisi ve sunucu gerekmez.
