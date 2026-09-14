# KAREA — Yapılacaklar Listesi

**Güncelleme:** 2026-09-14
**Amaç:** Canlıya çıkmadan önce ve sonra yapılacakları ayırmak, neyin
kimi beklediğini takip etmek.

Durum işaretleri: `[ ]` yapılmadı · `[~]` kısmen · `[x]` tamam · `[!]` engelleyici

---

## A — Şimdi yapılabilir (kod işi, dış bağımlılık yok)

### A1. Mobilde ağ kesintisi dayanıklılığı `[ ]` **öncelik: yüksek**
Fabrika Wi-Fi'ı kesintili. Operatör formu doldurup fotoğraf çekip
kaydete bastığında istek başarısız olursa veri kayboluyor.
- Başarısız kayıtlar cihazda kuyruğa alınsın
- Bağlantı gelince otomatik gönderilsin
- Kullanıcıya "bekleyen kayıt var" göstergesi
- Fotoğraflar da kuyrukta saklanmalı
**Neden önemli:** Sistemin sahada benimsenip benimsenmemesini belirler.

### A2. Eski 1619 kaydın aktarılması `[ ]` **öncelik: yüksek**
Analiz sayfası şu an boş sayılır; sistemde birkaç test kaydı var.
- CSV'den içe aktarma
- Kelime eşleştirmesiyle otomatik sınıflandırma ön ataması
- Kalite ekibi gözden geçirir
**Neden önemli:** Analiz ilk günden anlamlı olur, altı ay veri birikmesini
beklemeye gerek kalmaz.

### A3. Kritik hata bildirimi `[ ]` **öncelik: yüksek**
Kritik bir hata açıldığında kimsenin haberi olmuyor.
- En azından uygulama içi bildirim
- SMTP gelince mail bildirimi eklenir
**Neden önemli:** Sistemin var oluş sebebi tam da bunu yakalamak.

### A4. Giriş denemelerinde hız sınırı `[ ]` **öncelik: yüksek**
Kaba kuvvet saldırısına tamamen açık. IP/hesap başına dakikada N deneme
sınırı. Kod işi, şimdi yapılabilir.

### A5. Vardiya kavramı `[ ]` **öncelik: orta — ama zamanlaması kritik**
"Hangi vardiya daha çok hata üretiyor" sorusu sorulacaksa vardiya
bilgisi kayıt anında tutulmalı. **Sonradan geriye dönük eklenemez.**
Şimdi karar verilmeli: gerekli mi, değil mi?

### A6. Uçtan uca test `[ ]` **öncelik: orta**
Kritik akışları kapsayan otomatik testler: giriş, hata bildirme,
checklist işaretleme, sevk kapıları, onay akışı.
**Neden önemli:** Bu projede aynı sınıf hatanın tekrar ettiği birkaç
durum yaşandı (filtrenin bazı grafikleri etkilememesi, yanlış rozet
bileşeni, mobilin webden ayrışması).

### A7. Issue'ya yorum/not `[ ]` **öncelik: orta**
Şu an sadece açıklama ve çözüm var, ileri geri yazışma yok. Kalite
"bu fotoğraf yetersiz" diyemiyor.

### A8. Ayrı izinler: `issue.classify` ve `vehicle.hold` `[ ]` **öncelik: düşük**
Şu an sınıflandırma düzeltme onay izinlerine, beklemeye alma
`admin.manage_masters`'a bağlı. Gerçek ihtiyaç doğduğunda matris
ekranından 10 dakikalık iş. Şimdilik not.

### A9. Kalite ekibi katalog gözden geçirmesi `[ ]` **öncelik: orta**
`docs/15_KAREA_Hata_Kodu_Katalogu_Taslak.md` içindeki beş soru:
parça adları sahadaki dille uyuşuyor mu, elektrik grubu yeterli mi,
sorumlu süreç atamaları doğru mu.

### A10. Mobil doğrulamalar (kullanıcı gözüyle) `[~]`
Kodda var ama gerçek cihazda görülmedi:
- Oturumu açık tut
- Drawer ikonları
- Klavye "Bitti" çubuğu
- Yeni sınıflandırma formu
- Filtre düzeni

---

## B — Canlıya çıkmadan önce ZORUNLU

### B1. HTTPS `[!]`
Her şey `http` üzerinden gidiyor; şifreler ve token'lar açık dolaşıyor.
Bu haliyle canlıya çıkamaz. iOS tarafında ayrıca App Transport Security
düz HTTP'yi engeller.

### B2. Sırların `.env`'den çıkarılması `[!]`
`JWT_SECRET`, veritabanı şifresi repoda. Üretimde sunucudaki güvenli
bir kaynaktan gelmeli.

### B3. Demo hesapların temizlenmesi `[!]`
`changeme123` şifreli hesaplar repoda yazılı. Üretim seed'i geliştirme
seed'inden ayrılmalı: sadece gerçek katalog ve gerçek şablonlar.

### B4. Backend servis olarak çalışmalı `[!]`
Şu an elle başlatılıyor, çöktüğünde kendiliğinden kalkmıyor — bu
oturumda defalarca öldüğünü gördük. systemd veya eşdeğeri gerekli.

### B5. Veritabanı yedekleme `[!]`
Tanımlı bir yedekleme politikası yok.

### B6. Üretim veritabanı kurulumu `[ ]`
Boş DB, migration'ların kontrollü çalıştırılması, 500 VIN'in yüklenmesi.
Migration'ların idempotent olması (0013'te yaşadığımız dirty durumun
tekrarını önlemek için).

### B7. Hata izleme ve log toplama `[ ]`
Canlıda bir şey patlarsa kimsenin haberi olmuyor.

---

## C — Dış bağımlılık bekleyenler

### C1. SMTP bilgileri `[ ]` — IT'den
Davet maili ve self-servis şifre sıfırlama için. Kod tarafı hazır
bekliyor; SMTP gelince tek aşamada eklenir.

### C2. Sunucu ve veritabanı `[ ]` — IT'den
Linux VM, sabit adres, PostgreSQL örneği, ağ/firewall izinleri.

### C3. Apple Developer hesabı `[ ]` — D-U-N-S ile başvuru sürecinde
Geldiğinde: EAS ile development build → TestFlight → dağıtım.
Şu an Expo Go'ya bağımlıyız ve sürüm güncellemeleri bizi vuruyor
(SDK 54 → 57 geçişini bu yüzden yaptık).

### C4. HTTPS sertifikası `[ ]` — IT'den (B1 ile aynı)

---

## D — Canlı sonrası / opsiyonel

### D1. CI/CD `[ ]`
Her push'ta otomatik derleme ve test; deployment hattı.

### D2. Yük testi `[ ]`
Şu an 500 araç × 104 madde = 52 bin satır. Binlerce araçta bazı
sorgular gözden geçirilmeli.

### D3. Refresh token `[ ]`
"Beni hatırla" işaretli olsa bile token 24 saatte doluyor, kullanıcı
her gün tekrar giriş yapıyor. Gerçek çözüm kısa ömürlü erişim token'ı
+ uzun ömürlü yenileme token'ı.

### D4. Model bazlı şablonlar `[ ]`
Altyapı var (`vehicle_model_id`) ama kullanılmıyor, tüm araçlarda model
boş. İkinci bir araç modeli çıkınca devreye girer.

### D5. Bundle boyutu `[ ]`
Web bundle 500 kB uyarısı veriyor. LAN'da sorun değil, uzaktan
erişimde yavaşlık hissedilirse bakılır.

### D6. Tekrar eden hata analizinin derinleştirilmesi `[ ]`
Şu an aynı araç + aynı kod üzerinden sezgisel. Fotoğraf/açıklama
analiziyle geliştirilebilir.

### D7. Test verisinin temizlenmesi `[ ]`
Geliştirme ortamındaki test araçları ve şablon maddeleri. Üretim
sıfırdan kurulacağı için oraya taşınmayacak; sadece geliştirme
ortamındaki dağınıklık meselesi.

---

## Önerilen sıra

**Şimdi:** A1 (ağ dayanıklılığı) → A2 (eski veri aktarımı) → A4 (hız
sınırı) → A3 (kritik bildirim)

**Paralel olarak başlat:** C1, C2, C4 (IT talepleri — haftalar sürer,
kod hazır olunca beklemek istemezsin)

**Karar ver:** A5 (vardiya) — sonradan eklenemez, şimdi karar gerekiyor

**Canlıdan hemen önce:** B1–B7
