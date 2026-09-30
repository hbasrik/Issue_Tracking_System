# KAREA — Canlıya Alma Planı

**Amaç:** Bugünkü geliştirme ortamından canlı ortama geçişin tüm
adımlarını, verilecek kararları ve projede yapılması gereken
değişiklikleri tek yerde toplamak.

**Durum:** Taslak. IT görüşmesinden sonra netleşecek maddeler
işaretlendi.

---

## 1. Bugün nasıl çalışıyor, canlıda nasıl çalışacak

**Bugün:** PostgreSQL Docker konteynerinde, backend elle
başlatılıyor (`go run`), web Vite geliştirme sunucusunda, mobil
Expo Go ile telefonda. Her şey tek bilgisayarda, şifresiz HTTP
üzerinden, yerel ağda.

**Canlıda:** Üç katman olacak.

```
İnternet / fabrika ağı
        │  HTTPS
        ▼
    ┌─────────┐
    │  nginx  │  TLS sonlandırma, statik dosyalar, /api yönlendirme
    └────┬────┘
         │  HTTP (yalnızca sunucu içi)
         ▼
    ┌─────────┐
    │ backend │  Go, servis olarak çalışır, çökerse kendiliğinden kalkar
    └────┬────┘
         │
         ▼
    ┌──────────┐
    │ Postgres │
    └──────────┘
```

**nginx neden var:** Sertifikayı o taşıyor, web arayüzünün derlenmiş
dosyalarını o dağıtıyor, `/api` isteklerini backend'e o yönlendiriyor.
Backend'in kendisi HTTPS bilmek zorunda kalmıyor — sunucu içinde
düz HTTP konuşuyor, dışarıya hiç açılmıyor.

---

## 2. Aramızda netleşmesi gereken kararlar

### 2.1 PostgreSQL sürümü — 16 şart değil

Şart olan tek şey: **geliştirme ve canlı aynı ana sürümde olsun.**
Bugün geliştirmede 16 var. IT'nin standardı 17 ise 17'ye geçeriz,
ama o zaman geliştirme ortamını da 17 yaparız. 16'dan **eskiye**
inmeyelim.

Ayrıca `pg_trgm` eklentisinin kurulabilir olması gerekiyor — VIN
araması onu kullanıyor. IT'ye bunu ayrıca belirtmek lazım.

### 2.2 Linux şart değil ama varsayılan

Go her yerde çalışır. Linux'u istememizin sebebi Docker'ın ve
standart sunucu araçlarının orada olması. IT tamamen Windows
kullanıyorsa yine yapılır, sadece biraz daha uğraştırır. Sormaya
değer: "Sunucu tarafında standardınız ne?"

### 2.3 Alt alan adı mı, yol mu — **bunu IT'ye sormalıyız**

Düşündüğün `karea.com/karea360` bir **yol** (path). Alternatifi
`karea360.karea.com` gibi bir **alt alan adı** (subdomain).

**Alt alan adı belirgin şekilde daha kolay.** Yol kullanırsak:

- Web arayüzünün tüm dosya adresleri `/karea360/` önekiyle
  derlenmeli, yoksa sayfa boş açılır
- Yönlendirme (router) ayrıca bu önekle yapılandırılmalı
- API adresi `/karea360/api/v1/...` olur
- Fotoğraf adresleri de aynı öneki taşımalı
- İleride bu önek değişirse hepsi tekrar elden geçer

Alt alan adıyla bunların hiçbiri olmuyor; uygulama kökten çalışıyor.
Ek maliyeti yok, IT için de aynı zahmet.

**Karar:** IT'den alt alan adı isteyelim. Mümkün değilse yol ile de
yaparız, sadece yukarıdaki ayarların yapılması gerekir.

### 2.4 Postgres'i kim çalıştıracak

İki seçenek:

- **IT çalıştırır:** Yedekleme, güncelleme, izleme onların
  standartlarına girer. Tercih edilen.
- **Biz Docker'da çalıştırırız:** Daha hızlı başlar ama yedekleme
  ve bakım tamamen bize kalır.

IT'nin yönettiği bir PostgreSQL varsa onu isteyelim.

---

## 3. Projede yapılması gereken değişiklikler

Bunlar canlıya çıkmadan **önce** yapılmalı. Çoğu zaten yapılacaklar
listesindeki B maddeleri.

| # | Değişiklik | Neden |
|---|---|---|
| 1 | **Üretim seed'i ayrılsın** | Bugünkü seed'de `changeme123` şifreli demo hesaplar var. Üretime yalnızca roller, izinler, istasyonlar, hata kataloğu ve checklist şablonları gitmeli. Demo hesap gitmemeli. |
| 2 | **İlk yönetici hesabı mekanizması** | Kayıt ekranı yok; hesapları yönetici açıyor. İlk yöneticinin nasıl oluşacağı tanımlı değil. (Bkz. bölüm 4) |
| 3 | **`karea.local` → `karea.com`** | Seed'deki e-postalar, varsa alan adı kontrolleri ve dokümanlar gerçek alan adına göre güncellenmeli. |
| 4 | **Sırlar `.env`'den çıksın** | `JWT_SECRET` ve veritabanı şifresi repoda duruyor. Üretimde sunucunun ortam değişkenlerinden gelmeli, repoda hiç bulunmamalı. |
| 5 | **API adresi yapılandırılabilir olsun** | Web arayüzü API'yi göreli adresle çağırmalı (`/api/v1/...`), sabit IP yazılı kalmamalı. Mobil uygulamanın API adresi de ortama göre ayarlanabilmeli. |
| 6 | **Kodda `http://` ile başlayan sabit adres kalmasın** | Fotoğraf adresleri, yönlendirmeler, CORS listesi. HTTPS'e geçince kırılır. |
| 7 | **CORS listesine üretim alan adı eklensin** | Bugün yerel IP'ler yazılı. |
| 8 | **Backend servis olarak çalışsın** | Şu an elle başlatılıyor ve çöktüğünde kalkmıyor. systemd veya Docker yeniden başlatma politikası. |
| 9 | **Yedekleme zamanlanmış çalışsın** | `backup.sh` ve `restore.sh` yazıldı ama elle çalıştırılıyor. Sunucuda günlük çalışmalı ve çıktı sunucu diskinden başka bir yere yazmalı. |
| 10 | **Log dosyası yolu sunucuya göre ayarlansın** | Yazıldı, yalnızca yapılandırma. |
| 11 | **Giriş hız sınırı sayaçları** | Bellekte tutuluyor; backend yeniden başlayınca sıfırlanıyor. Tek sunucu ve kararlı servis ile kabul edilebilir, ama bilinçli bir karar olarak not edilmeli. |
| 12 | **Yol kullanılacaksa önek ayarları** | Bölüm 2.3'teki maddeler. Alt alan adı alınırsa gerekmez. |

---

## 4. İlk kullanıcı sorunu

Kayıt ekranı yok, hesapları yönetici açıyor. Peki ilk yöneticiyi kim
açacak?

**Önerilen çözüm:** Üretim seed'i tek bir yönetici hesabı oluştursun,
şifresi sunucudaki bir ortam değişkeninden okunsun
(`BOOTSTRAP_ADMIN_PASSWORD` gibi). Hesap `must_change_password`
işaretiyle oluşsun — ilk girişte şifre değiştirmeye zorlansın.
Kurulum bittikten sonra o ortam değişkeni sunucudan silinsin.

Böylece:
- Repoda hiçbir şifre yazılı olmuyor
- İlk giriş yapan kişi kendi şifresini belirliyor
- Sonraki tüm hesaplar normal yönetici akışıyla açılıyor

**Alternatif:** Sunucuda tek seferlik çalışan bir komut satırı aracı
(`create-admin`). Daha esnek ama fazladan geliştirme gerektirir.

**Mail olmadan da çalışır.** SMTP gelmeden de yönetici hesap açabilir
ve şifreyi kullanıcıya elden verebilir; davet maili yalnızca bu işi
kolaylaştırır.

---

## 5. Canlıya alma — adım adım

### Aşama 1: IT hazırlığı (haftalar sürebilir)

1. Sunucu kurulur, erişim bilgileri verilir
2. PostgreSQL kurulur, boş bir veritabanı ve kullanıcı açılır,
   `pg_trgm` eklentisi etkinleştirilir
3. Alan adı kaydı yapılır ve SSL sertifikası temin edilir
4. Fabrika ağından sunucuya erişim izinleri verilir
5. Yedekleme alanı tanımlanır
6. SMTP bilgileri verilir

### Aşama 2: Projede hazırlık (IT'yi beklerken yapılabilir)

Bölüm 3'teki 12 maddenin tamamı. Bunların çoğu sunucu olmadan da
yapılabilir ve test edilebilir.

### Aşama 3: Sunucu kurulumu

1. nginx kurulur, sertifika yerleştirilir
2. Backend sunucuya yerleştirilir (Docker imajı veya derlenmiş
   dosya), servis olarak tanımlanır
3. Ortam değişkenleri sunucuda tanımlanır: veritabanı bağlantısı,
   `JWT_SECRET`, log yolu, ilk yönetici şifresi
4. nginx yapılandırması: HTTPS, statik dosyalar, `/api` yönlendirme
5. Backend başlatılır, sağlık kontrolü (`/health`) yanıt veriyor mu
   bakılır

### Aşama 4: Veritabanı kurulumu

1. Boş veritabanına migration'lar sırayla uygulanır (0001–0030)
2. Üretim seed'i çalıştırılır: roller, izinler, istasyonlar, hata
   kataloğu, checklist şablonları
3. 500 VIN yüklenir (`reset_and_load_vins.sql`)
4. İlk yönetici hesabı oluşur
5. Kontrol: araç sayısı 500, şablon maddesi sayısı beklenen değerde,
   izin matrisi dolu

### Aşama 5: Web arayüzü

1. Üretim derlemesi alınır (`vite build`)
2. Çıkan dosyalar nginx'in dağıttığı klasöre konur
3. Tarayıcıdan açılır, ilk yönetici ile giriş yapılır, şifre
   değiştirilir

### Aşama 6: Mobil uygulama

Apple Developer hesabı geldikten sonra:

1. API adresi üretim adresine ayarlanır
2. EAS ile development build alınır
3. TestFlight üzerinden birkaç cihaza dağıtılır
4. Saha testi yapılır
5. Sorun yoksa mağaza dağıtımına geçilir

Hesap gelene kadar Expo Go ile devam edilir; ancak Expo Go üretim
için kalıcı çözüm değil.

### Aşama 7: Doğrulama

1. Giriş, hata bildirme, fotoğraf yükleme, checklist işaretleme,
   sevk akışı baştan sona denenir
2. Yedekleme çalıştırılır ve **ayrı bir veritabanına geri
   yüklenerek** doğrulanır
3. Backend bilerek durdurulur, kendiliğinden kalktığı görülür
4. Log dosyasının yazıldığı ve döndüğü kontrol edilir

### Aşama 8: Pilot

2-3 operatör, birkaç gün, gerçek araçlar. Geri bildirime göre
düzeltme. Sonra tüm ekibe açılır.

---

## 6. Sonraki sürümler nasıl çıkacak

Bu, ilk kurulumdan daha sık yaşanacağı için baştan tanımlanmalı.

### Temel kural: uyumluysa kod önce, değilse kısa planlı kesinti

Sistem tek sunucuda çalışıyor ve kısa planlı kesinti kabul
edilebilir. Geriye dönük uyum bir zorunluluk değil, mümkün
olduğunda tercih edilen yoldur. Kural dosyası:
`.cursor/rules/migrations.mdc`.

Her sürümde önce iki adım aynıdır:

1. Değişiklik geliştirme ortamında yapılır ve test edilir
2. **Yedek alınır** (veritabanı + uploads)

Sonra migration'a göre iki yoldan biri seçilir:

**A) Yeni kod eski şemada çalışabiliyorsa — kesinti yok**

3. Önce yeni kod devreye alınır
4. Sonra migration uygulanır
5. Web derlemesi güncellenir
6. Sağlık kontrolü ve hızlı duman testi

Örnek: migration 0032 (ilerleme kolonunun kaldırılması). Yeni kod
kolonu ne okuyor ne yazıyor, v31'de de çalışıyor. Önce kod, sonra
migration; arada hata penceresi yok.

**B) Yeni kod eski şemada çalışamıyorsa — kısa planlı kesinti**

3. Backend durdurulur
4. Migration uygulanır
5. Yeni backend sürümü başlatılır, web derlemesi güncellenir
6. Sağlık kontrolü ve hızlı duman testi

Kesinti uygulamadan önce raporlanır ve onay beklenir; süresi ve
nedeni sürüm raporuna yazılır.

**Hangisini seçmeli:** Kesintiden kaçınmak için karmaşıklığı
artırma. Otuz saniyelik planlı bir duraklama, bir değişikliği iki
aşamalı migration zincirine (önce genişlet, sonra daralt) bölmekten
daha basittir. A yolu doğal olarak mümkünse onu kullan, değilse B.

**Kaçınılacak sıra:** Backend çalışırken önce migration, sonra kod.
Arada eski derlemenin hata verdiği bir pencere kalır; bu ne A ne
B'dir.

### Her durumda geçerli olanlar

- Her migration'ın çalışan bir geri alma (down) dosyası olur.
- Migration'lar idempotent olur (`database/scripts/verify_migrations.sh`).
- Kolon, tablo veya görünüm kaldırılmadan önce, onu okuyan kodun
  yayından kalkacağı sıra planlanır: A yolunda kod önce çıkar, B
  yolunda eski backend migration'dan önce durdurulur.
- Uygulanmış bir migration dosyası sonradan değiştirilmez. Zorunlu
  bir istisna varsa gerekçesi dosyaya yorum olarak yazılır.

### Geri dönüş

Sorun çıkarsa: önceki backend sürümü geri konur, gerekiyorsa
yedekten veritabanı geri yüklenir. Bu yüzden **her güncelleme
öncesi yedek şart.**

Erişim yetkisi bizde değilse bu adımların her biri IT üzerinden
yürüyecek demektir — sürenin buna göre planlanması gerekir.

---

## 7. HTTPS'e geçerken kodda ne değişiyor

Doğru kurulursa az şey değişiyor:

- **Backend değişmiyor.** nginx TLS'i sonlandırıyor, backend sunucu
  içinde düz HTTP konuşmaya devam ediyor.
- **Web arayüzü** API'yi göreli adresle çağırmalı. Sabit
  `http://192.168.x.x:8080` gibi bir adres varsa kaldırılmalı.
- **Mobil uygulama** üretim adresini `https://` ile bilmeli.
- **Fotoğraf adresleri** göreli olmalı veya aynı alan adı üzerinden
  gelmeli.
- **CORS listesi** üretim alan adını içermeli.
- Kodda kalan her sabit `http://` taranmalı.

Yani iş "her şeyi yeniden yaz" değil, "adresleri yapılandırılabilir
hale getir ve sabit yazılmış olanları temizle".

---

## 8. IT'ye sorulacaklar — güncel liste

1. Sunucu tarafında standart işletim sistemi ne?
2. PostgreSQL'i siz mi yöneteceksiniz, biz mi kuracağız? Standart
   sürümünüz ne? `pg_trgm` eklentisi kurulabilir mi?
3. **Alt alan adı verilebilir mi** (`karea360.karea.com` gibi),
   yoksa ana alan adı altında yol mu (`karea.com/karea360`)?
4. Sunucuya doğrudan erişimimiz olacak mı, yoksa güncellemeler talep
   kaydıyla mı yürüyecek?
5. SSL sertifikası nasıl temin edilecek, yenilemesi kimde?
6. SMTP sunucu bilgileri
7. Yedeklerin yazılacağı, sunucu diskinden ayrı konum
8. Fabrika sahasındaki kablosuz ağ kapsaması
9. Tablet ve telefonlara uygulama dağıtımı — cihaz yönetim sistemi
   var mı?
