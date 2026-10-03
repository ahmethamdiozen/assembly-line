# Kabul Testi Sonuçları

Otomatik çalıştırma: `npm run test:kabul` (`scripts/kabul-testi.mjs`). Senaryolar ve sunucu modunda elle yapılacak adımlar: [`kabul-testleri.md`](kabul-testleri.md).

| | |
|---|---|
| Tarih | 3 Ekim 2026 23:25 |
| Sürüm | 1.0.0 (commit `83d30f7`) |
| Ortam | Kurulumsuz demo (tüm veri hattı tarayıcıda), Chrome/154.0.8037.93, Node v24.21.0 |
| Sonuç | **10 / 10 senaryo geçti** (9 sn) |

| Kabul | İsterler | Senaryo | Sonuç |
|---|---|---|---|
| AC-01 | R-011, R-016 | 13 ana istasyon ve 5 ön montaj hücresi hat görselinde | Geçti |
| AC-02 | R-014 | İstasyona tıklayınca sayfa değişmeden Seçili İstasyon paneli güncellenir | Geçti |
| AC-03 | R-013 | Her istasyonda OP kodu, tip / teknisyen, durum ve motor seri numarası | Geçti |
| AC-04 | R-030, R-031 | Motor tamamlanma yüzdesi ve operasyon geçmişi | Geçti |
| AC-05 | R-028, R-029 | Takılan parçalar: 7 komponent, Installed / Pending | Geçti |
| AC-06 | R-033, R-034, R-036 | OP100 NOK → rework kuyruğu → re-QC | Geçti |
| AC-07 | R-038 | Alarm yaşam döngüsü: Detected → Acknowledged → Assigned → Closed | Geçti |
| AC-08 | R-025, R-040, R-058 | Teknisyen notu ve Andon; audit kaydı | Geçti |
| AC-09 | R-045 | Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme ve vardiya çıkışı | Geçti |
| AC-10 | R-010, R-053, R-055, R-056, R-057 | Admin: istasyon ana verisi, besleme, alarm kuralı; entegrasyon sağlığı | Geçti |

## Adımlar

### AC-01: 13 ana istasyon ve 5 ön montaj hücresi hat görselinde

İsterler: R-011, R-016 · 0.6 sn

- ✓ 13 ana istasyon OP005–OP110 sırasıyla görünüyor
- ✓ 5 ön montaj hücresi (OP201–OP206) görünüyor

### AC-02: İstasyona tıklayınca sayfa değişmeden Seçili İstasyon paneli güncellenir

İsterler: R-014 · 0.0 sn

- ✓ OP050 paneli açıldı
- ✓ Sayfa değişmedi (Kontrol Merkezi)
- ✓ Başka istasyon seçilince panel güncellendi (OP080)

### AC-03: Her istasyonda OP kodu, tip / teknisyen, durum ve motor seri numarası

İsterler: R-013 · 0.0 sn

- ✓ Her istasyon kutusunda OP kodu ve durum metni var
- ✓ İnsanlı istasyonlarda teknisyen, otomatik istasyonlarda tip yazılı
- ✓ Konveyördeki motorlar seri numarasıyla görünüyor

### AC-04: Motor tamamlanma yüzdesi ve operasyon geçmişi

İsterler: R-030, R-031 · 0.6 sn

- ✓ TM50-261003-0181 için tamamlanma yüzdesi (13 operasyon üzerinden)
- ✓ Operasyon geçmişinde giriş, çıkış, cycle, teknisyen ve sonuç sütunları
- ✓ Tamamlanan operasyonlar OK sonucuyla listelenmiş

### AC-05: Takılan parçalar: 7 komponent, Installed / Pending

İsterler: R-028, R-029 · 0.0 sn

- ✓ 7 seri numaralı komponent listelenmiş ({"n":7,"installed":2,"pending":5})
- ✓ Takılanlar Installed, takılmayanlar Pending (2 Installed, 5 Pending)

### AC-06: OP100 NOK → rework kuyruğu → re-QC

İsterler: R-033, R-034, R-036 · 1.0 sn

- ✓ OP100 sonuçlarında NOK kararı var
- ✓ Rework kuyruğunda hata tipi, kaynak OP, öncelik ve sorumlu ekiple kayıt var
- ✓ Rework "Incoming Triage" adımından "Diagnosis" adımına alındı
- ✓ Re-QC'den OK geçen motorların rework'ü kapanmış

### AC-07: Alarm yaşam döngüsü: Detected → Acknowledged → Assigned → Closed

İsterler: R-038 · 1.3 sn

- ✓ Açık alarmlar listelendi
- ✓ Alarm onaylandı, Bakım Ekibi’ne atandı ve kapanış notuyla kapatıldı
- ✓ Dört adım zaman ve kullanıcıyla işaretli (Detected 23:21 \| Acknowledged 23:24, Levent Acar \| Assigned 23:24, Bakım Ekibi \| Closed 23:24, Levent Acar)

### AC-08: Teknisyen notu ve Andon; audit kaydı

İsterler: R-025, R-040, R-058 · 2.0 sn

- ✓ Teknisyen OP070 istasyonuna giriş yaptı
- ✓ Not kaydedildi ve istasyon notlarında görünüyor
- ✓ Malzeme Andon’u açıldı ve alarm olarak düştü
- ✓ Audit kaydında not ve Andon kullanıcı ve zamanla var

### AC-09: Availability, Performance, FPY, OEE, çıkış / saat, plan gerçekleşme ve vardiya çıkışı

İsterler: R-045 · 0.6 sn

- ✓ KPI göstergeleri hesaplanmış
- ✓ Vardiya çıkışları karşılaştırmalı

### AC-10: Admin: istasyon ana verisi, besleme, alarm kuralı; entegrasyon sağlığı

İsterler: R-010, R-053, R-055, R-056, R-057 · 3.0 sn

- ✓ İstasyon hedef çevrimi değiştirildi (R-053)
- ✓ Ön montaj buffer minimumu değiştirildi (R-055)
- ✓ Alarm kuralının eskalasyon süresi değiştirildi (R-056)
- ✓ Konfigürasyon değişiklikleri audit’te (R-058)
- ✓ Kullanıcı / rol ve veri saklama ayarları yönetilebilir (R-010)
- ✓ PLC, tork, kamera, SQL Server ve veri kanalının durumu görünüyor (R-057)
