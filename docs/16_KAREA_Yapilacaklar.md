# KAREA — Yapılacaklar Listesi

**Güncelleme:** 2026-09-21
**Amaç:** Canlıya çıkmadan önce ve sonra yapılacakları ayırmak, neyin
kimi beklediğini takip etmek.

Durum işaretleri: `[ ]` yapılmadı · `[~]` kısmen · `[x]` tamam · `[!]` engelleyici

---

## A — Şimdi yapılabilir (kod işi, dış bağımlılık yok)

### A0. Geliştirme veritabanının yedeği `[ ]` **öncelik: en yüksek**
Checklist şablonları, hata kodu kataloğu, roller ve izin matrisi,
500 VIN — bunların hepsi **tek bir bilgisayardaki tek bir Postgres
örneğinde** duruyor. Bunlar kod değil, veri; git'te yok. Disk
giderse haftaların yapılandırma emeği gider.

Yapılacak: düzenli `pg_dump`, dosya bilgisayar dışında bir yerde
(bulut disk yeterli). B5'ten farklı — B5 üretim yedekleme
politikası, bu ise bugünkü emeği kaybetmemek.

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

### A4. Giriş denemelerinde hız sınırı `[x]`
Hesap bazlı kademeli kilit (5 hata → 1 dk, 10 → 5 dk, 15 → 15 dk),
IP başına dakikada 100 tavan. Ortak fabrika IP'si arkasındaki
kullanıcıların birbirini kilitlemediği testle kanıtlandı. Var olmayan
kullanıcıya dummy bcrypt (zamanlama sızıntısı yok). Yöneticiye
"giriş kilidini aç" butonu. Migration 0028 + `LOGIN_RATE_LIMITED`
audit olayı; `audit_logs.vin` artık NULL olabiliyor.

Mobil giriş ekranının da kalan süreyi iki dilde gösterdiği ayrıca
doğrulandı.

**Kabul edilen sınır:** Sayaçlar bellekte. Backend yeniden başlayınca
kilitler sıfırlanır. Bkz. B8.

### A5. Vardiya kavramı `[x]` — kapatıldı, ayrı alan gerekmiyor
Önceki değerlendirmem "sonradan eklenemez" yönündeydi; **yanlıştı.**
Vardiya, kaydın oluşturulma saatinden türetilebilir (vardiya saat
aralıkları tanımlandığı sürece geriye dönük de hesaplanır). Ayrı bir
kolon ve operatöre ek soru gerekmiyor. Analiz tarafında istendiğinde
saatten gruplanarak eklenir.

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

### A11. Güvenlik sıkılaştırması (altı madde) `[x]` — 2026-09-21
- `GET /uploads/*` auth + `vehicle.view` (VIN / Karar 11); web/mobil Bearer
- `JWT_SECRET` boş/<32 → süreç başlamaz; zayıf compose varsayılanı yok
- `POST /media` hedef varlığa yazma yetkisi ister
- `document_approve` uykuda: 410, atanamaz izin, kolonlar tarihsel
- Issue açıklaması max 400 + i18n + kalan karakter (web/mobil)
- `users.tokens_valid_from` (0029): pasif/şifre/rol → anında 401
Not: JWT + iptal birlikte herkesin bir kez yeniden girişini gerektirir.
Refresh token hâlâ D3.

---

## B — Canlıya çıkmadan önce ZORUNLU

### B1. HTTPS `[!]`
Her şey `http` üzerinden gidiyor; şifreler ve token'lar açık dolaşıyor.
Bu haliyle canlıya çıkamaz. iOS tarafında ayrıca App Transport Security
düz HTTP'yi engeller.

### B2. Sırların `.env`'den çıkarılması `[!]`
Geliştirmede `JWT_SECRET` bilinçli girilir (boş/<32 süreç başlamaz).
Üretimde sırlar sunucudaki güvenli kaynaktan gelmeli; `.env` ile
dağıtılmamalı.

### B3. Demo hesapların temizlenmesi `[!]`
`changeme123` şifreli hesaplar repoda yazılı. Üretim seed'i geliştirme
seed'inden ayrılmalı: sadece gerçek katalog ve gerçek şablonlar.

### B4. Backend servis olarak çalışmalı `[!]`
Şu an elle başlatılıyor, çöktüğünde kendiliğinden kalkmıyor — bu
oturumda defalarca öldüğünü gördük. systemd veya eşdeğeri gerekli.

### B5. Veritabanı yedekleme `[~]`
**Geliştirme:** `database/scripts/backup.sh` + `restore.sh` (DB dump +
uploads arşivi, `backups/`, retention; `docs/09` §6).
**Kalan (üretim):** otomatik zamanlama, off-site saklama, restore drill.

### B6. Üretim veritabanı kurulumu `[~]`
Boş DB + migration yolu net; checklist gerçek içerik `database/seed/03`'te.
500 VIN: `database/scripts/reset_and_load_vins.sql` (seed değil; `docs/09`
§5 üretim adımlarında). Kalan: kontrollü prod koşumu, B3 kullanıcı ayrımı,
migration dirty-state prosedürü.

### B7. Hata izleme ve log toplama `[~]` — sunucu gerektirmeyen kısım yapıldı
**Yapıldı:**
- Panik kurtarma (`recoverPanic`): beklenmeyen çökme süreci öldürmüyor,
  istemciye 500 dönüyor, stack yalnızca loga yazılıyor. Doğrulama için
  panik probe'u eklendi; üretimde 404, kayıtlıyken kimlik doğrulama
  zorunlu (iki testle kanıtlandı).
- Loglar dosyaya yazılıyor, boyut bazlı döndürme, seviye ayarı,
  şifre/token maskeleme (`applog.Redact`).
- Her isteğe request id; 5xx yanıtlarında kullanıcıya "Hata kodu"
  olarak gösteriliyor (4xx'te gösterilmiyor), logdaki id ile aynı
  olduğu testle kanıtlandı.

**Kalan (sunucu gelince):** Sentry veya eşdeğeri dış izleme, merkezi
log toplama, uyarı kuralları. Ayrıca `LOGIN_RATE_LIMITED` audit
olayları şu an hiçbir ekranda görünmüyor — yönetici için güvenlik
olayları görünümü burada ele alınacak.

### B8. Giriş hız sınırı sayaçlarının kalıcı olması `[ ]`
A4'te sayaçlar bellekte tutuluyor. İki koşulda yetersiz kalır:
- Backend birden fazla örnek olarak çalışırsa sınır örnek sayısı
  kadar katlanır (her örneğin kendi sayacı olur)
- Backend sık yeniden başlarsa kilitler sürekli sıfırlanır (B4
  çözülene kadar backend elle başlatılıyor ve düşüyor)
Tek örnek + kararlı servis ile kabul edilebilir; ikisinden biri
değişirse sayaç tabloya taşınmalı.

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

**Tamamlananlar:** A1 (ağ dayanıklılığı), A4 (hız sınırı),
A5 (vardiya — gereksiz çıktı), A11 (güvenlik sıkılaştırması),
B7'nin sunucu gerektirmeyen kısmı

**Şimdi:** A0 (geliştirme veritabanı yedeği — bkz. aşağı) →
**A3 (kritik bildirim)** → A6 (uçtan uca test) → A9 (kalite ekibi
katalog gözden geçirmesi)

**Beklemede:** A2 (veri elde yok)

**Paralel olarak başlat:** C1, C2, C4 (IT talepleri — haftalar sürer,
kod hazır olunca beklemek istemezsin)

**Karar ver:** A5 (vardiya) — sonradan eklenemez, şimdi karar gerekiyor

**Canlıdan hemen önce:** B1–B7
