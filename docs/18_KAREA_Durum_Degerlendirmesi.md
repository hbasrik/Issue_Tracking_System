# KAREA — Durum Değerlendirmesi

**Tarih:** 2026-09-18
**Not (2026-09-24):** Bu dosya 18 Eylül anlık değerlendirmesidir.
O tarihten sonraki tamamlanan işler, açık maddeler ve öncelik sırası
için **`docs/16_KAREA_Yapilacaklar.md`** bakın; burayı yeniden yazmayın.
**Kapsam:** Uygulamanın bugünkü hali, açıklar, riskler ve öncelik önerisi.
**Kaynak:** Bu değerlendirme, Cursor'un raporları ve mimari kararlar
üzerinden yazıldı. Kod tabanı bağımsız olarak taranmadı — bölüm 7'deki
denetim promptu tam olarak bunun için.

---

## 1. Tek cümlelik özet

Uygulama işlevsel olarak büyük ölçüde tamam ve mimarisi sağlam; asıl
açıklar kodda değil, **doğrulama ağının zayıflığında, üretim
altyapısının hiç kurulmamış olmasında ve sistemin henüz gerçek
operatörle buluşmamış olmasında.**

---

## 2. Sağlam olan taraflar

Bunlar gerçekten iyi durumda ve bir daha dönüp bakılması gerekmeyecek
şeyler:

**Veri modeli ve iş kuralları.** Araç durum makinesi tek yönlü ve hem
veritabanı trigger'ında hem uygulamada zorlanıyor; ikisinin ayrışmasını
bir parity test kilitliyor. Sevk kapıları, depo çıkışı, teslim akışı
aynı disiplinle kurulu. Bu, projenin en sağlam katmanı.

**Geçmişin korunması.** Snapshot pattern sayesinde katalog veya şablon
metni değiştiğinde eski kayıtlar değişmiyor. Kalite verisinde bu kritik
bir özellik ve baştan doğru kuruldu.

**Migration disiplini.** 0013 ve 0020'de yaşanan "dirty" durumdan sonra
`verify_migrations.sh` yazıldı; migration'lar idempotent ve dört
senaryoda (taze kurulum, ikinci kez çalıştırma, yeniden uygulama,
geri alma) test ediliyor.

**Yetkilendirme.** Tablo tabanlı RBAC, arayüz rol adına değil izne
bakıyor. Yeni rol veya izin eklemek şema değişikliği değil.

**Ortak kod.** Web ve mobilin ayrışmasını önlemek için `shared/`
klasörü kuruldu (durum mantığı, kapı kuralları, hata sınıflandırma,
i18n, ana ekran istatistikleri). Bu projede en çok tekrar eden hata
sınıfı buydu; yapısal olarak kapatıldı.

**Çevrimdışı dayanıklılık.** Mobilde kuyruk, referans önbelleği,
idempotency anahtarı, taşıma/ret hatası ayrımı. Cihazda doğrulandı.

**Temel güvenlik önlemleri.** Giriş hız sınırı (hesap bazlı, ortak
IP'yi kilitlemeden), zamanlama saldırısına karşı dummy bcrypt, panik
kurtarma, log maskeleme.

---

## 3. Teknik açıklar

### 3.1 Regresyon ağı yok — **en büyük yapısal açık**

Şu ana kadar her düzeltme, o düzeltme için yazılmış özel bir betikle
bir kez doğrulandı. Kritik akışları (giriş, hata bildirme, checklist
işaretleme, sevk kapıları, onay akışı, çevrimdışı kuyruk) baştan sona
koşan ve **her değişiklikte tekrar çalışan** bir test takımı yok.

Bunun pratik sonucu: bugün çalıştığını kanıtladığımız bir şeyin yarın
başka bir değişiklikle bozulduğunu kimse fark etmez. Bu projede aynı
sınıf hatanın tekrar ettiği en az dört vaka yaşandı (filtrelerin bazı
grafikleri etkilememesi, mobilin webden ayrışması, kapının eksik
maddeleri geçirmesi, KPI'ın hep sıfır dönmesi). Ağ olmadan bu tekrar
edecek.

**Kapatma yolu:** A6. Tam kapsam gerekmiyor; 8-10 kritik akış yeterli.

### 3.2 Doğrulamaların bir kısmı davranışı değil kaynak kodu ölçüyor

Bazı doğrulama satırları `setSendingIds runs before while (flushLock)`
gibi kaynak kod sırası iddiaları. Bunlar kırılgan: kod yeniden
düzenlendiğinde davranış aynı kalsa bile test kırılır, ya da tersi —
davranış bozulsa bile test geçer. Kanıt değeri göründüğünden düşük.

**Kapatma yolu:** A6 kapsamında bu tür kontroller gerçek davranış
testine dönüştürülmeli.

### 3.3 Üretim altyapısının hiçbir parçası kurulu değil

HTTPS yok, sırlar `.env` içinde ve repoda, demo hesaplar bilinen
şifrelerle duruyor, backend elle başlatılıyor ve düştüğünde kalkmıyor,
yedekleme yok, hata izleme yok. Hepsi B listesinde ve doğru şekilde
ertelendi — ama şunu net söylemek gerekir: **uygulama bugünkü haliyle
LAN dışına açılamaz.**

Ayrıca bunların hiçbiri denenmemiş parçalar. Üretime geçiş, daha önce
hiç bir araya getirilmemiş yedi parçanın ilk kez birleştirilmesi
olacak. Bu tür geçişlerde sorun çıkması istisna değil, kural.

### 3.4 Tek ortam, tek makine, staging yok

Her şey tek bir bilgisayarda çalışıyor. Geliştirme veritabanı test
verisiyle karışık. Üretim öncesi deneme yapılabilecek ayrı bir ortam
yok. CI yok (bilinçli erteleme).

### 3.5 Yedek yok — **acil**

Checklist şablonları, hata kodu kataloğu, izin matrisi, 500 VIN: bunlar
kod değil **veri**, git'te durmuyor, tek bir Postgres örneğinde
yaşıyorlar. Disk giderse haftaların yapılandırma emeği gider. Bu bir
üretim konusu değil, bugünün konusu.

**Kapatma yolu:** A0. Düzenli `pg_dump` + dosyanın bilgisayar dışında
tutulması. Bir saatlik iş.

### 3.6 Uyarı mekanizması yok

Log dosyası var ama birinin bakması gerekiyor. Bir şey patladığında
haber veren bir şey yok. Ayrıca cihazda oluşan çökmeler (beyaz ekran,
uygulama kapanması) sunucu loglarına hiç düşmüyor.

### 3.7 Mobil dağıtım Expo Go'ya bağımlı

Apple Developer hesabı gelene kadar (C3) uygulamayı operatörlerin
telefonuna düzgün kuramıyoruz. Expo'nun sürüm güncellemeleri bizi
vuruyor — SDK 54 → 57 geçişi bu yüzden zorunlu oldu.

### 3.8 Küçük ve bilinen kalemler

- Giriş hız sınırı sayaçları bellekte (B8): backend yeniden başlayınca
  sıfırlanır, birden fazla örnek çalışırsa sınır katlanır
- `LOGIN_RATE_LIMITED` audit olayları hiçbir ekranda görünmüyor
- Toplu araç içe aktarma uç noktası var ama ekranı yok; ayrıca 500
  kayıtta sessiz kesilme sorunu duruyor
- Refresh token yok (D3): "beni hatırla" işaretli olsa bile 24 saatte
  tekrar giriş
- Issue üzerinde yorum/yazışma yok (A7): kalite "bu fotoğraf yetersiz"
  diyemiyor
- Web bundle 500 kB uyarısı (D5) — LAN'da sorun değil

---

## 4. Ürün ve süreç açıkları

Bunlar teknik açıklardan daha önemli olabilir, çünkü teknik borç
ödenebilir; yanlış tasarlanmış bir sınıflandırma sistemi aylarca
değersiz veri üretir.

### 4.1 Katalog hiçbir operatörle buluşmadı — **en büyük ürün riski**

Parça listesi ve kusur tipleri, eski 1619 kaydın metin analizinden
türetildi. Yani **benim çıkarımım**, sahanın dili değil. Kalite ekibi
henüz gözden geçirmedi (A9).

Riskin somut hali şudur: parça adları sahada kullanılan adlarla
uyuşmazsa operatör aradığını bulamaz ve her şeye "Diğer" der. O noktada
tüm sınıflandırma çabası boşa gider ve bunu altı ay sonra fark
edersin. Analiz sayfası dolu görünür ama içi anlamsızdır.

Sorulması gereken beş soru `15_KAREA_Hata_Kodu_Katalogu_Taslak.md`
içinde hazır bekliyor. Bu bir toplantılık iş ve kod yazmaktan önce
gelmeli.

### 4.2 Sistemi henüz gerçek kullanıcı kullanmadı

Bütün testleri geliştiren kişi yaptı. Operatörün eldivenle, kötü ışıkta,
aceleyle, hattın gürültüsünde nasıl kullandığını kimse görmedi.
Kullanılabilirlik sorunları ancak orada çıkar.

**Öneri:** Üretime geçmeden önce 2-3 operatörle, birkaç günlük, gerçek
araçlar üzerinde bir pilot. Bu pilot, kalan teknik işlerden daha çok
şey öğretir.

### 4.3 Doğrulama zinciri tek kaynağa dayanıyor

Kodun durumunu Cursor'un raporlarından biliyoruz. En az iki kez
raporda yazılan bir iddianın doğru olmadığı ortaya çıktı: "girişten
sonra kuyruk yeniden deneniyor" (backoff yüzünden denemiyordu) ve
yazdırma doğrulamasında "13 SVG bulundu" (çıktıya bakılmadan sayılmıştı).

`reporting.mdc` kuralı bunu azalttı ama tamamen çözmedi. Fark
edilmeyen başkaları olması ihtimal dahilinde. Bölüm 7'deki bağımsız
denetim bunun içindir.

### 4.4 Dokümantasyon eksiği (bilinçli erteleme)

PRD, BRD, kapsamlı test dokümanı ve use case'ler henüz yazılmadı;
senin talebinle ertelendi. Terimler sözlüğü (doc 17) ve mimari
mutabakat (doc 11) bu işin altyapısı olarak hazır.

---

## 5. Genel işleyiş: çalışma şeklimizde sorun var mı?

Çalışma disiplini iyi: kök neden aranmadan düzeltme yapılmıyor, her
sayı SQL ile çapraz kontrol ediliyor, negatif testler isteniyor,
yıkıcı işlemler yasaklandı ve raporlama kuralı yazıldı. Bu, çoğu
projede olmayan bir seviye.

İki zayıf nokta var:

**İleriye doğru düzeltiyoruz, arkaya ağ germiyoruz.** Her tur bir
sorunu kapatıyor ve kendi özel doğrulama betiğini bırakıyor. Bu
betikler birikiyor ama bir takım oluşturmuyorlar. A6 bunu çözer.

**Kapsam sürekli genişliyor.** Her turda yeni bir iyileştirme fikri
çıkıyor ve haklı olarak yapılıyor. Ama "canlıya çıkacak kadar iyi"
tanımı netleşmezse bu liste hiç bitmez. Bir kesim noktası
belirlemekte fayda var: pilot için gereken minimum ne?

---

## 6. Öncelik önerisi

**Bu hafta (küçük, yüksek etkili):**

1. **A0 — Veritabanı yedeği.** Bir saat, geri dönülemez kaybı önler.
2. **A9 — Kalite ekibiyle katalog toplantısı.** Kod değil, toplantı.
   Ne kadar geç yapılırsa o kadar çok yanlış veri birikir.
3. **A3 — Kritik hata bildirimi.** Sistemin varlık sebebi tam da bunu
   yakalamak; şu an kritik bir hata açıldığında kimsenin haberi olmuyor.

**Sonra:**

4. **A6 — Uçtan uca testler.** 8-10 kritik akış. Bundan sonraki her
   değişikliğin maliyetini düşürür.
5. **Pilot.** 2-3 operatör, birkaç gün, gerçek araçlar.
6. **A7 — Issue yorumları** (pilot geri bildirimine göre önceliklenir)

**Paralel başlatılacak (IT'den, haftalar sürer):**

7. C1 (SMTP), C2 (sunucu + veritabanı), C4 (HTTPS sertifikası),
   C3 (Apple Developer — D-U-N-S süreci devam ediyor)

**Canlıdan hemen önce:** B1–B8

**Ertelenebilir:** A2 (veri elde yok), A8, D grubu

---

## 7. Cursor'a sorulacak bağımsız denetim

Bu rapor Cursor'un kendi raporlarına dayanıyor. Kod tabanının gerçek
durumunu bağımsız görmek için aşağıdaki promptu ayrı bir turda gönder.
Amaç düzeltme yaptırmak değil, **envanter çıkarmak** — bu yüzden
promptta açıkça "kod değiştirme" deniyor.

```
Bu turda HİÇBİR KOD DEĞİŞİKLİĞİ YAPMA. Yalnızca oku, tara ve raporla.
Amaç bağımsız bir durum envanteri çıkarmak. Bulduğun sorunları
düzeltme, sadece listele.

Aşağıdaki başlıklarda kod tabanını tara ve her madde için dosya ve
satır referansı ver. Bulgu yoksa "bulgu yok" yaz — boş geçme.

## 1. Ölü ve tutarsız kod
- Hiçbir yerden çağrılmayan fonksiyon, bileşen, endpoint
- Artık var olmayan alanlara referans veren kod (daha önce
  document_approved ve vehicle_number kaldırıldığında bu tür
  kalıntılar çıkmıştı)
- Kullanılmayan import, ölü dosya, yorum satırına alınmış kod blokları
- TODO / FIXME / HACK yorumları — hepsini listele

## 2. Web ve mobil arasında ayrışma
- Aynı işi yapan ama shared/ altında olmayan, iki yerde ayrı yazılmış
  mantık
- shared/ altındaki bir modülün yalnızca bir tarafta kullanıldığı,
  diğer tarafın hâlâ kendi kopyasını çalıştırdığı yerler
- Aynı API yanıtını farklı yorumlayan web/mobil kodu

## 3. Hata yönetimi
- Kullanıcıya ham teknik metin gösterilebilecek yerler
- Yutulan hatalar: catch bloğu boş, ya da hata loglanıp kullanıcıya
  başarı gösteriliyor
- Sessizce başarısız olabilecek işlemler: 0 satır etkileyip başarı
  dönen sorgular, boş liste dönüp hata saymayan çağrılar
  (daha önce InsertPendingForVehicles'ta bu sınıftan bir hata çıktı)

## 4. Yetkilendirme
- İzin kontrolü yapmayan endpoint var mı? Her endpoint için hangi
  iznin arandığını tablo halinde çıkar
- Rol ADINA bakan (izne değil) kod kaldı mı?
- Arayüzde gizlenen ama API'de korunmayan işlemler

## 5. Veritabanı
- Reference DDL (docs/12) ile gerçek şema arasındaki fark:
  migration'ları taze bir veritabanına uygulayıp docs/12 ile
  karşılaştır, farkları listele
- Index'i olmayan ve sık sorgulanan kolonlar
- Trigger'daki iş kuralı ile uygulama katmanındaki karşılığının
  ayrıştığı yerler
- FK'si olmayan ama mantıken olması gereken ilişkiler

## 6. Test kapsamı
- Hangi kritik akışların hiç otomatik testi yok? Şu akışları tek tek
  değerlendir: giriş, hata bildirme, hata sınıflandırma, checklist
  işaretleme, şablon değişikliği, sevk kapıları, depo çıkışı,
  teslim, kullanıcı yönetimi, çevrimdışı kuyruk
- Kaynak kod yapısını (davranışı değil) ölçen kırılgan testler
  hangileri?

## 7. Güvenlik
- Repoda duran sır, şifre, token, anahtar
- Loglanan hassas veri
- Kimlik doğrulaması olmayan endpoint
- Girdi doğrulaması yapılmayan yerler

## 8. Performans
- N+1 sorgu desenleri
- Sayfalama olmadan tüm tabloyu çeken sorgular
- 500 araç × 104 madde ölçeğinde sorun çıkarabilecek yerler

## Rapor formatı
Her başlık altında: bulgu, dosya:satır, ciddiyet (yüksek/orta/düşük),
önerilen aksiyon. Sonunda "en acil 10 madde" diye özet bir liste.

Tekrar: bu turda kod değiştirme, commit atma. Sadece rapor.
```
