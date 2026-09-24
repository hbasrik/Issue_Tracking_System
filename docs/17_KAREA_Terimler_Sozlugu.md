# KAREA — Proje Terimleri Sözlüğü

**Amaç:** Projede geçen teknik ve süreçsel terimlerin tek yerde,
proje yöneticisinin anlayacağı dilde toplanması.

**Her madde şu düzende:**
Terim — ne olduğu. *Ne işe yarar / neyi engeller.* **Bizde:** bu
projedeki somut karşılığı.

Terimler İngilizce bırakıldı çünkü kod, dosya adları, yorumlar ve
sektör literatürü İngilizce. Aramak ve başkasıyla konuşmak böyle kolay.

---

# 1. Ürün ve proje yönetimi

**PRD (Product Requirements Document)** — Ürünün ne yapacağını,
kimin için yapıldığını ve başarı ölçütlerini tanımlayan belge.
*Herkesin aynı şeyi anlamasını sağlar; "ben böyle sanmıştım"ı önler.*
**Bizde:** `01_KAREA_PRD.md` v1 için yazıldı; v2 için güncellenmesi
bekliyor.

**BRD (Business Requirements Document)** — İşin neden yapıldığını,
hangi iş problemini çözdüğünü ve ticari gerekçesini anlatan belge.
PRD "ne", BRD "neden" sorusunu cevaplar.
**Bizde:** Henüz yazılmadı, senin talebinle ertelendi.

**MVP (Minimum Viable Product)** — Gerçek kullanıcıya verilip
öğrenilebilecek en küçük çalışır sürüm.
*Her şeyi bitirmeden önce doğru şeyi yapıp yapmadığını öğrenmeni
sağlar.* **Bizde:** Hata bildirme + checklist + sevk akışı çekirdeği.

**Scope creep (kapsam kayması)** — Proje ilerledikçe kapsamın sessizce
büyümesi. *Bitmeyen projelerin en yaygın sebebi.*
**Bizde:** Her turda haklı yeni fikirler çıkıyor ve yapılıyor; "pilot
için yeterli" tanımı netleşmezse liste bitmez. Bilinçli olarak
işaretlendi.

**Definition of Done** — Bir işin "bitti" sayılması için sağlanması
gereken koşullar. *"Bende çalışıyor"u engeller.*
**Bizde:** Fiilen şu: kod + testler geçiyor + SQL çapraz kontrolü +
kullanıcı cihazda gördü + doküman güncellendi + commit atıldı.

**Acceptance criteria (kabul kriterleri)** — Bir özelliğin kabul
edilmesi için karşılaması gereken somut, ölçülebilir maddeler.

**User story** — İhtiyacı kullanıcı ağzından anlatan kısa cümle:
"Operatör olarak hatayı fotoğrafla bildirebilmeliyim ki kalite ne
olduğunu görsün." *Özelliği teknik değil ihtiyaç olarak düşündürür.*
**Bizde:** `04_KAREA_User_Stories.md`.

**Use case** — Bir hedefe ulaşmak için sistem ile kullanıcı arasındaki
adım adım etkileşim. User story'den daha ayrıntılı.

**MoSCoW** — Önceliklendirme yöntemi: Must / Should / Could / Won't.
*Her şeyin "yüksek öncelik" olmasını engeller.*
**Bizde:** `03_KAREA_MoSCoW_Matrisi.md`.

**Backlog** — Yapılacak işler havuzu.
**Bizde:** `16_KAREA_Yapilacaklar.md`, A/B/C/D gruplarıyla.

**Triyaj (triage)** — Tıptan gelen terim: gelen bulguları aciliyet ve
etkiye göre sıralayıp neye önce bakılacağına karar vermek.
*Uzun bir hata listesi karşısında felç olmayı engeller.*
**Bizde:** Denetim raporundaki 10 maddeyi "güvenlik / ölçek /
tutarlılık / test borcu" diye dört dalgaya ayırmamız.

**Blocker (engelleyici)** — Tamamlanmadan ilerlenemeyen iş.
**Bizde:** B1–B8, canlıya çıkışı engelleyen maddeler.

**Technical debt (teknik borç)** — Hızlı ilerlemek için bilinçli
alınan kestirmelerin sonradan ödenecek maliyeti.
*Borcun kendisi kötü değil; kayıt altına alınmaması kötü.*
**Bizde:** Hız sınırı sayaçlarının bellekte olması (B8), web'de ham
hata mesajları, sayfalama eksikliği — hepsi yazılı.

**Trade-off** — Bir şeyi kazanmak için başka bir şeyden vazgeçmek.
**Bizde:** Önbellekte son kullanma tarihi koymamak — bayat veri riskini
kabul edip "hiç veri yok" durumundan kaçındık.

**Stakeholder (paydaş)** — Sonuçtan etkilenen veya karar veren taraf.
**Bizde:** Kalite ekibi, operatörler, üretim yönetimi, IT.

**Pilot** — Küçük bir grup gerçek kullanıcıyla sınırlı süreli deneme.
*Kullanılabilirlik sorunlarını üretime geçmeden ortaya çıkarır.*
**Bizde:** Henüz yapılmadı; 2-3 operatörle birkaç gün öneriliyor.

**Rollout** — Ürünün kullanıcılara yayılma planı (kademeli veya toptan).

**Rollback** — Bir sürüm sorun çıkarırsa önceki sürüme geri dönmek.

**Runbook** — "Şu olursa şunu yap" adımlarını içeren işletme belgesi.
**Bizde:** B6 kapsamında üretim veritabanı kurulumu için yazılacak.

---

# 2. Mimari ve kod organizasyonu

**Architecture (mimari)** — Sistemin parçalarının nasıl bölündüğü ve
birbirleriyle nasıl konuştuğuna dair üst düzey tasarım.

**Clean Architecture** — Katmanların iç içe halkalar gibi düşünüldüğü,
bağımlılığın hep içe doğru olduğu yaklaşım. İş kuralı ne veritabanını
ne de HTTP'yi bilir. *Veritabanını veya arayüzü değiştirmek iş
kurallarını yeniden yazmayı gerektirmez.*
**Bizde:** `domain` / `usecase` / `repository` / `delivery` katmanları.

**Domain layer** — Saf iş kavramları ve kuralları. Kütüphane bağımlılığı
en az olan katman. **Bizde:** Araç durumu, hata şiddeti, kapı kuralları.

**Usecase layer** — Bir iş akışının adımlarını yöneten katman.
**Bizde:** "Hata bildir", "aracı sevk et", "kullanıcı oluştur".

**Repository pattern** — Veritabanı erişiminin tek bir arayüz arkasına
saklanması. *İş mantığının SQL'e bulaşmasını engeller.*
**Bizde:** `issue_repo.go`, `vehicle_repo.go` gibi dosyalar.

**Delivery layer** — Dış dünyayla temas eden katman (HTTP handler'ları).
**Bizde:** `internal/delivery/http`.

**Separation of concerns** — Her parçanın tek bir sorumluluğu olması.

**Single source of truth (tek doğruluk kaynağı)** — Bir bilginin tek
bir yerde tanımlanması, diğer her yerin oraya bakması.
*Aynı bilginin iki yerde farklı olmasını engeller.*
**Bizde:** Hangi araçların hata bildirimine konu olabileceği
`IssueReportVehicleStatuses` ile tek yerden tanımlandı. Ayrıca artık
veritabanı şemasının kaynağı migration'lar; `docs/12` sadece okuma
yardımcısı.

**Drift (sapma / kayma)** — Aynı mantığın iki yerde yazılıp zamanla
birbirinden ayrışması. Başlangıçta aynıdırlar, biri güncellenir,
diğeri unutulur. *Sessizce yanlış sonuç üretir; hata vermediği için
uzun süre fark edilmez.*
**Bizde (bu projenin en sık hatası):**
- Ana ekran istatistiği: web `OPEN + IN_PROGRESS` sayarken mobil
  sadece `OPEN` sayıyordu → 9 ve 8 farkı
- Kapı kuralları web, mobil ve veritabanında üç ayrı yerde yazılmıştı
- Mobil checklist bölümleri sabit madde aralığına göre gruplanıyordu,
  yeni eklenen 45-46 numaralı maddeler sessizce düşüyordu
- `docs/12` referans şeması ile gerçek migration'lar ayrıştı
*Çözüm:* `shared/` klasörü, tek kaynak tanımları, parity test.

**DRY (Don't Repeat Yourself)** — Aynı bilgiyi tekrar yazmama ilkesi.
Drift'in panzehiri.

**Coupling (bağlılık)** — İki parçanın birbirine ne kadar bağımlı
olduğu. Az olması iyidir.

**Cohesion (bütünlük)** — Bir parçanın içindeki şeylerin ne kadar aynı
işe hizmet ettiği. Çok olması iyidir.

**Refactoring** — Davranışı değiştirmeden kodun yapısını iyileştirmek.
*Davranış değişirse o refactoring değil, yeni iş.*

**Boilerplate** — Her seferinde yazılması gereken, düşünce içermeyen
tekrar kod.

**Defense in depth (katmanlı savunma)** — Aynı kuralın birden fazla
katmanda korunması. *Bir katman atlanırsa diğeri yakalar.*
**Bizde:** Sevk kapıları hem veritabanı trigger'ında hem uygulama
katmanında; ikisinin aynı kaldığını parity test garantiliyor.

**Feature flag / environment gating** — Bir özelliğin ortama göre
açılıp kapanması. *Geliştirme kolaylıklarının üretime sızmasını
engeller.* **Bizde:** `fn_ops_set_vehicle_status` yalnızca geliştirme
ortamında; panik probe üretimde 404.

**Allowlist / denylist** — "Sadece bunlara izin ver" / "bunlar hariç
her şeye izin ver". *Allowlist daha güvenlidir: sonradan eklenen
bilinmeyen bir değer otomatik olarak dışarıda kalır.*
**Bizde:** Hareketler ekranının gösterdiği olay türleri allowlist;
bu yüzden `LOGIN_RATE_LIMITED` araç hareketlerini kirletmedi.

**Polymorphic ilişki** — Bir tablonun farklı türde tablolara
bağlanabilmesi. *Esneklik sağlar ama veritabanı bütünlüğünü zayıflatır.*
**Bizde:** `media_attachments` hem araca hem hataya bağlanabiliyor
(`entity_type` + `entity_id`); bütünlüğü uygulama koruyor. Karar 11
ile ayrıca gerçek bir `vin` kolonu eklendi.

---

# 3. Backend ve API

**Backend** — Kullanıcının görmediği, veriyi işleyen ve saklayan taraf.
**Bizde:** Go dilinde yazıldı.

**Frontend** — Kullanıcının gördüğü taraf (web arayüzü, mobil uygulama).

**API (Application Programming Interface)** — İki yazılımın birbiriyle
konuşma arayüzü. **Bizde:** Web ve mobil, backend'le REST API üzerinden
konuşuyor.

**REST** — API tasarımında yaygın bir üslup: kaynaklar adreslenir
(`/vehicles/{vin}`), işlem HTTP metoduyla belirtilir.

**Endpoint (uç nokta)** — API'nin tek bir adresi ve işlevi.
**Bizde:** `POST /api/v1/issues` hata oluşturur.

**HTTP metodları** — `GET` oku, `POST` oluştur, `PUT`/`PATCH` güncelle,
`DELETE` sil.

**HTTP durum kodları** — Yanıtın sonucunu anlatan sayılar:
- `200` başarılı, `201` oluşturuldu
- `400` hatalı istek, `401` kimlik doğrulanmadı, `403` yetkin yok,
  `404` bulunamadı, `409` çakışma, `422` işlenemeyen içerik,
  `429` çok fazla istek
- `500` sunucu hatası, `503` servis kullanılamıyor
*Doğru kod seçmek önemli: istemci ne yapacağına buna bakarak karar
verir.* **Bizde:** 4xx/5xx ayrımı çevrimdışı kuyruğun kaydı silip
silmeyeceğini belirliyor.

**Payload** — İsteğin veya yanıtın taşıdığı veri gövdesi.

**JSON** — Veri alışverişinde kullanılan metin formatı.

**Router** — Gelen isteği doğru handler'a yönlendiren bileşen.
**Bizde:** `chi` kütüphanesi.

**Handler** — Bir endpoint'in isteğini karşılayan fonksiyon.

**Middleware (ara katman)** — İstek handler'a ulaşmadan önce veya
yanıt dönerken araya giren ortak kod. *Kimlik doğrulama, loglama,
hata yakalama gibi işleri her handler'da tekrar yazmayı engeller.*
**Bizde:** Kimlik doğrulama, istek kimliği üretimi, panik kurtarma.

**CRUD** — Create / Read / Update / Delete: temel dört işlem.

**Pagination (sayfalama)** — Büyük listelerin parça parça
döndürülmesi. *Binlerce kaydın tek seferde çekilip uygulamayı
kilitlemesini engeller.*
**Bizde:** Hata listelerinde **yok** — denetimde yüksek öncelikli
bulgu; 1619 eski kayıt gelmeden yapılmalı.

**N+1 problem** — Bir liste için 1 sorgu, sonra her satır için 1 sorgu
daha atılması. 100 satır = 101 sorgu. *Fark edilmesi zor, yavaşlığın
klasik sebebi.*
**Bizde:** Araç listesinde yok (tek JOIN); sevk hazırlığı kontrolünde
araç başına 4 gidiş-dönüş var, orta öncelikli bulgu.

**Round-trip** — İstemci ile sunucu arasındaki bir gidiş-dönüş.

**Rate limiting** — Belirli sürede yapılabilecek istek sayısını
sınırlamak. *Kaba kuvvet saldırısını ve aşırı yüklenmeyi engeller.*
**Bizde:** Girişte hesap bazlı: 5 hata → 1 dk, 10 → 5 dk, 15 → 15 dk.

**Throttling** — Engellemek yerine yavaşlatmak.

**CORS (Cross-Origin Resource Sharing)** — Tarayıcının, bir adresteki
sayfanın başka bir adresteki API'ye erişmesine izin verme kuralı.
*Kötü niyetli sitelerin senin API'ne istek atmasını engeller.*
**Bizde:** Backend'de izinli adres listesi; bu oturumda IP değişince
birkaç kez sorun çıkardı.

**Environment variable (ortam değişkeni)** — Kodun dışında, çalıştığı
ortamdan okunan ayar. *Şifre ve adres gibi ortama göre değişen
bilgilerin koda gömülmesini engeller.* **Bizde:** `.env` dosyası;
veritabanı adresi, JWT anahtarı, log ayarları.

**Fail-fast** — Yanlış bir yapılandırmayla çalışmaya devam etmek
yerine hemen ve gürültülü şekilde durmak. *Sessizce yanlış çalışan
sistemi engeller.* **Bizde:** Denetimde eksik bulundu — `JWT_SECRET`
boşken uygulama ayağa kalkıyor; kapatılması gereken yüksek öncelikli
bulgu.

**Graceful degradation** — Bir parça çalışmadığında tamamen kırılmak
yerine azalmış işlevle devam etmek.
**Bizde:** Mobil çevrimdışıyken önbellekten çalışıyor.

**Idempotency** — Aynı işlemi birden çok kez yapmanın bir kez yapmakla
aynı sonucu vermesi. *Tekrar gönderimde mükerrer kayıt oluşmasını
engeller.* **Bizde:** Çevrimdışı kuyruk bağlantı gelince yeniden
denerken ikinci hata kaydı oluşmuyor.

**Idempotency key** — Bunu sağlayan benzersiz anahtar.
**Bizde:** İstemci UUID üretir, `Idempotency-Key` başlığıyla yollar,
sunucu `issue_list.client_request_id` kolonuna yazar, veritabanındaki
kısmi tekillik indeksi ikinciyi reddeder.

**Stateless** — Sunucunun istekler arasında istemciye dair bir durum
tutmaması. *Ölçeklenmeyi kolaylaştırır.*
**Bizde:** JWT ile kimlik, sunucuda oturum tutulmuyor.

---

# 4. Veritabanı

**PostgreSQL** — Kullandığımız ilişkisel veritabanı.

**Schema (şema)** — Veritabanının yapısı: tablolar, kolonlar,
ilişkiler, kısıtlar.

**DDL (Data Definition Language)** — Şemayı **tanımlayan** SQL
komutları: `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`.
*Veriyi değil, verinin kabını tarif eder.*
**Bizde:** `docs/12_KAREA_v2_database_schema.sql` bir referans DDL
dosyası — yani şemanın tamamını tek yerde okunur biçimde gösteren
belge. **Önemli not:** Bu dosya artık kaynak değil; kaynak
`database/migrations/` klasörü. Elle tutulan bir DDL ile gerçek
migration'ların paralel yürütülmesi tam olarak bir *drift* kaynağıydı
ve nitekim ayrıştılar.

**DML (Data Manipulation Language)** — Veriyi işleyen SQL komutları:
`SELECT`, `INSERT`, `UPDATE`, `DELETE`.

**Migration** — Şema değişikliğini sıralı, numaralı ve tekrarlanabilir
biçimde uygulayan dosya. *Şemanın herkeste ve her ortamda aynı olmasını
sağlar; "benim veritabanımda o kolon yok" durumunu engeller.*
**Bizde:** `0001`–`0028`.

**Idempotent migration** — İki kez çalıştırıldığında hata vermeyen
migration (`IF NOT EXISTS`, `ON CONFLICT` kullanarak).
*Yarıda kalan bir migration'ın tekrar çalıştırılabilmesini sağlar.*
**Bizde:** 0013 ve 0020 bu kurala uymadığı için "dirty" duruma düştük;
sonra `verify_migrations.sh` yazıldı — taze kurulum, ikinci kez
çalıştırma, yeniden uygulama ve geri alma senaryolarını test ediyor.

**Dirty migration** — Yarıda kalmış migration. Veritabanı ne eski ne
yeni şemada; elle müdahale gerekir.

**Constraint (kısıt)** — Veritabanının kendi zorladığı kural.
*Uygulama unutsa bile veri bozulmasını engeller.*

**Primary key** — Satırı benzersiz tanımlayan kolon.
**Bizde:** Araçlarda VIN.

**Foreign key (FK)** — Bir tablodaki değerin başka tabloda var olmasını
zorunlu kılan bağ. *Olmayan araca hata kaydı açılmasını engeller.*

**ON DELETE CASCADE** — Ana kayıt silinince bağlı kayıtların da
silinmesi. **Bizde:** Araç silinince medya ekleri de gider.

**Unique constraint** — Bir değerin tekrar etmemesi kuralı.

**Partial unique index** — Yalnızca belirli satırlar için geçerli
tekillik. *Tekilliği koşula bağlamayı sağlar.*
**Bizde:** İki yerde kritik:
- `client_request_id` yalnızca NULL olmayan satırlarda tekil
- Her araç tipi/modeli için yalnızca **bir aktif** checklist şablonu
  olabilir (pasif şablonlar serbest)

**Index** — Bir kolonda arama yapmayı hızlandıran yapı. *Tablo
büyüdükçe sorguların yavaşlamasını engeller.* Bedeli: yazma biraz
yavaşlar, disk kullanır.
**Bizde:** `issue_list.issue_reporter_id` → `idx_issue_list_reporter`
(migration 0030); `issue_date DESC, id DESC` → `idx_issue_list_issue_date`
(pano sırası / keyset sayfalama).

**GIN / trigram index** — Metin içinde parça arama için özel index tipi.
**Bizde:** `pg_trgm` eklentisi ile VIN'in son hanelerinden arama.

**BRIN index** — Doğal olarak sıralı, çok büyük tablolar için ucuz
index tipi. **Bizde:** `audit_logs` zaman kolonunda.

**ENUM** — Sınırlı değer kümesi tutan özel veri tipi.
*Yazım hatasını veritabanı düzeyinde engeller.*
**Bizde:** `vehicle_status_enum`, `issue_severity_enum`,
`audit_event_enum`.

**NULL / nullable** — Değerin boş olabilmesi.
**Bizde:** `audit_logs.vin` migration 0028 ile nullable yapıldı, çünkü
giriş olaylarının aracı yok.

**Trigger** — Veri değiştiğinde otomatik çalışan veritabanı fonksiyonu.
*İş kuralının uygulama atlansa bile uygulanmasını sağlar.*
**Bizde:** Sevk kapıları, depo çıkışı, teslim akışı, araç ilerleme
satırlarının otomatik oluşturulması.

**Stored procedure / function** — Veritabanında saklanan kod parçası.

**Transaction** — Bir grup işlemin ya tamamen olması ya hiç olmaması.
*Yarım kalmış durumu engeller.*

**ACID** — Transaction'ların taşıması gereken dört özellik:
Atomicity (bölünmezlik), Consistency (tutarlılık), Isolation (yalıtım),
Durability (kalıcılık).

**Race condition** — İki işlemin aynı anda çalışıp birbirini bozması.
**Bizde:** Aynı kayda iki kişinin aynı anda müdahalesi.

**Deadlock** — İki işlemin karşılıklı olarak birbirini beklemesi ve
ikisinin de ilerleyememesi. *Terim ayrıca mantıksal kilitlenmeler için
de kullanılır.* **Bizde:** `PLANNED` durumundaki araçlar hattan
çıkmak için istasyon adımı gerektiriyordu, ama istasyon adımı ancak
hatta olunca oluşuyordu — çıkışı olmayan bir döngü.

**JSONB** — PostgreSQL'in yapılandırılmış ama esnek veri tipi.
*Şemayı her seferinde değiştirmeden ek bilgi saklamayı sağlar.*
**Bizde:** `audit_logs.metadata`.

**Soft delete** — Kaydı silmek yerine pasife çekmek. *Geçmişin ve
referansların kaybolmasını engeller.*
**Bizde:** Şablon maddeleri, kullanıcılar, katalog kalemleri.

**Hard delete** — Kaydı gerçekten silmek. **Bizde:** Yalnızca hiç
referans almamış kayıtlarda.

**Append-only** — Sadece eklenen, güncellenmeyen tablo.
**Bizde:** `audit_logs`.

**Snapshot pattern** — Kaydın oluştuğu andaki metnin kaydın içine
kopyalanması. *Katalog veya şablon sonradan değişince geçmişin yeniden
yazılmasını engeller.*
**Bizde:** `checklist_item_progress.item_text_snapshot`, hata
kayıtlarındaki parça/kusur adı anlık görüntüleri. Madde 3 kez
değiştirilse bile her kayıt kendi zamanındaki metni taşır — bu yüzden
"kaç revizyon olursa olsun tek kolon yeter".

**Backfill** — Yeni eklenen kolonu veya eksik satırları geçmişe dönük
doldurmak. **Bizde:** Migration 0023 ile eksik ilerleme satırları.

**Seed** — Sistemin çalışması için gereken başlangıç verisi.
*Boş bir veritabanının kullanılamaz olmasını engeller.*
**Bizde:** Roller, izinler, istasyonlar, demo kullanıcılar. Üretim
seed'inin geliştirme seed'inden ayrılması gerekiyor (B3).

**Dump / restore** — Veritabanının dosyaya yedeklenmesi ve geri
yüklenmesi. **Bizde:** `pg_dump` — A0 maddesi, acil.

**Materialize** — Hesaplanabilir bir veriyi önceden hesaplayıp satır
olarak yazmak. *Her sorguda yeniden hesaplamayı engeller, ama yazma
maliyeti getirir.* **Bizde:** Her araca 104 checklist maddesi satır
olarak yazılıyor; 500 araç = 52.000 satır. Toplu içe aktarmada bu
maliyet denetimde yüksek öncelikli bulgu olarak çıktı.

**VIEW** — Bir sorguya isim verip tablo gibi kullanmak.
**Bizde:** Analiz sorguları için tanımlanmış görünümler.

---

# 5. Web (frontend)

**SPA (Single Page Application)** — Sayfa yenilenmeden içeriğin
değiştiği web uygulaması. *Hızlı hissettirir; bedeli, çevrimdışı
açılamamasıdır (service worker olmadan).*
**Bizde:** React ile yazıldı.

**React** — Arayüzü bileşenlere bölerek kuran kütüphane.

**Component (bileşen)** — Arayüzün yeniden kullanılabilir parçası.
**Bizde:** `SeverityIndicator`, `ApiErrorText`.

**Props** — Bileşene dışarıdan verilen parametreler.

**State (durum)** — Bileşenin kendi içinde tuttuğu, değiştiğinde
ekranın yenilendiği veri.

**Hook** — React'te durum ve yan etki yönetimi için kullanılan
fonksiyonlar (`useState`, `useEffect`).

**Render** — Bileşenin ekrana çizilmesi.

**Vite** — Web projesini derleyen ve geliştirme sunucusunu çalıştıran
araç. **Bizde:** `vite build` üretim derlemesi.

**Bundle** — Tüm kodun tarayıcıya gönderilmek üzere paketlenmiş hali.
**Bizde:** 500 kB uyarısı var; LAN'da sorun değil (D5).

**Tailwind CSS** — Hazır yardımcı sınıflarla stil yazma yaklaşımı.

**Tree shaking** — Kullanılmayan kodun pakete dahil edilmemesi.

**Lazy loading** — İçeriğin ihtiyaç duyulduğunda yüklenmesi.

**Portal** — Bir bileşeni DOM ağacında başka bir yere çizmek.
*Modal ve yazdırma düzeni gibi, bulunduğu yerin stil kısıtlarından
kurtulması gereken şeyler için.* **Bizde:** Analiz sayfasının yazdırma
düzeni.

**i18n (internationalization)** — Uygulamanın birden fazla dili
destekleyecek şekilde hazırlanması. 18, i ve n arasındaki harf sayısı.
*Metinlerin koda gömülmesini engeller.*
**Bizde:** 649 anahtarlık ortak mesaj kataloğu, `MessageKey` tipiyle;
eksik anahtar derleme zamanında yakalanıyor.

**l10n (localization)** — Belirli bir dile/kültüre uyarlama: tarih
formatı, sayı ayracı, metin çevirisi.

**Responsive** — Ekran boyutuna göre uyum sağlayan düzen.

**Service worker** — Tarayıcıda arka planda çalışan, sayfanın
çevrimdışı açılmasını sağlayabilen betik. **Bizde:** Yok — web'de
çevrimdışı desteği bilinçli olarak yapılmadı.

**LocalStorage / SessionStorage** — Tarayıcıda veri saklama yerleri.
İlki kalıcı, ikincisi sekme kapanınca silinir.
**Bizde:** Web hata formunun taslağı sessionStorage'da.

---

# 6. Mobil

**React Native** — Aynı React yaklaşımıyla gerçek mobil uygulama
yazmayı sağlayan teknoloji.

**Expo** — React Native geliştirmeyi kolaylaştıran araç seti.

**Expo Go** — Uygulamayı kendi imzanla derlemeden çalıştırmayı sağlayan
hazır uygulama. *Hızlı başlamayı sağlar; bedeli, Expo'nun sürüm
güncellemelerine bağımlı olmandır.*
**Bizde:** SDK 54 → 57 geçişini bu yüzden zorunlu olarak yaptık.

**Development build** — Kendi imzanla derlenmiş, Expo Go'ya bağımlı
olmayan sürüm. **Bizde:** Apple Developer hesabı bekleniyor (C3).

**EAS (Expo Application Services)** — Expo'nun bulutta derleme ve
dağıtım servisi.

**TestFlight** — Apple'ın test dağıtım platformu.

**SDK (Software Development Kit)** — Bir platform için geliştirme
araçları paketi.

**Native module** — Platformun kendi diliyle (Swift/Kotlin) yazılmış,
JavaScript'ten çağrılan parça.

**AsyncStorage** — React Native'in basit anahtar-değer deposu.
*Pratik tavan ~6 MB.* **Bizde:** Çevrimdışı kuyruğun bilgileri burada;
500 araçlık referans önbelleği 172 kB ölçüldü.

**Metro** — React Native'in paketleyicisi. *Tip kontrolü yapmaz* —
bu yüzden `tsc --noEmit` ayrıca çalıştırılmalı.
**Bizde:** Bir turda sadece web derlemesi kontrol edildiği için mobil
tip hatası fark edilmeden kaldı.

**TDZ (Temporal Dead Zone)** — Bir `const`/`let` değişkenin
tanımlanmadan önce kullanılması hatası.
**Bizde:** Uygulamanın hiç açılmamasına sebep olmuştu — modül
değerlendirmesi çöktüğü için başlangıç fonksiyonu hiç çalışmıyordu.

**Offline-first** — Uygulamanın bağlantıyı istisna değil normal kabul
edecek şekilde tasarlanması. **Bizde:** Mobil tarafta uygulandı.

**Offline queue** — Gönderilemeyen kayıtların cihazda birikip bağlantı
gelince gönderilmesi. *Saha verisinin kaybolmasını engeller.*
**Bizde:** Kayıt bilgileri AsyncStorage'da, fotoğraflar dosya
sisteminde.

**Retry backoff** — Başarısız denemeler arasında artan bekleme.
*Sürekli denemenin pili ve sunucuyu yormasını engeller.*
**Bizde:** 5 sn → 15 sn → 45 sn → 2 dk → 5 dk.

**Exponential backoff** — Beklemenin katlanarak artması.

**Reference cache** — Sabit referans verisinin cihazda tutulması.
*Çevrimdışıyken form doldurulamamasını engeller.*
**Bizde:** Araç listesi, parça/kusur katalogları, istasyonlar.
Kurulumdaki hata tam da buydu: önbellek, `PLANNED` araçları gizleyen
listeyi kullandığı için 500 yerine 5 araç tutuyordu.

**Stale data (bayat veri)** — Güncelliğini yitirmiş veri.
**Bizde:** Bilinçli kabul edildi — sahada eski liste, hiç liste
olmamasından iyi. Kullanıcıya yaşı gösteriliyor.

**TTL (Time To Live)** — Verinin geçerlilik süresi. **Bizde:** Bilerek
konmadı.

**Transport error / rejection error** — Bizim koyduğumuz ayrım:
- *Transport:* istek sunucuya hiç ulaşmadı (bağlantı yok, zaman aşımı,
  5xx) → kuyruğa al, kullanıcıyı rahatsız etme
- *Rejection:* sunucu ulaştı, kaydı reddetti (400, 409) → kullanıcıya
  göster, kuyruğa alma
- *Auth (401/403):* kimlik sorunu → kayıt kuyrukta kalır, giriş sonrası
  denenir
*Bu ayrım olmadan ya veri kaybolur ya da geçersiz kayıt sonsuza kadar
yeniden denenir.*

---

# 7. Tasarım ve kullanıcı deneyimi

**UI (User Interface)** — Arayüzün görsel tarafı: renk, tipografi,
düzen.

**UX (User Experience)** — Kullanıcının bütün deneyimi: bulabildi mi,
anladı mı, yapabildi mi. *Güzel bir UI kötü bir UX'i kurtarmaz.*

**Design system (tasarım sistemi)** — Renk, tipografi, boşluk ve
bileşenlerin kurallı bütünü. *Her ekranın farklı görünmesini engeller.*
**Bizde:** `07_KAREA_UIUX_Tasarim_Rehberi.md` ve `shared/brand.ts`.

**Design token** — Tasarım değerlerinin isimlendirilmiş hali (ana renk,
kenar yarıçapı). *Değişikliğin tek yerden yapılmasını sağlar.*

**Visual hierarchy (görsel hiyerarşi)** — Önemli olanın göze önce
çarpmasını sağlayan düzen.

**Affordance** — Bir öğenin ne işe yaradığını görünüşüyle belli etmesi.
Buton butona benzemeli.

**Empty state (boş durum)** — Gösterilecek veri olmadığındaki ekran.
*Boş bir listenin "bozuk mu?" hissi vermesini engeller.*
**Bizde:** Bildirimler ekranında zorunlu tutuldu.

**Loading state / skeleton** — Veri beklenirken gösterilen geçici
görünüm.

**Error state** — Hata durumundaki ekran. *Kullanıcıyı ne olduğu ve ne
yapacağı konusunda bilgilendirmeli.*
**Bizde:** Ham `fetch failed` yerine "Bağlantı kurulamadı, kayıt
bekletiliyor" gibi sakin metinler.

**Information density** — Bir ekrandaki bilgi yoğunluğu. *Fabrika
panosunda uzaktan okunabilirlik, ofis ekranında yoğunluk gerekir.*
**Bizde:** Analiz sayfası fabrika TV'si için yeniden tasarlandı.

**Progressive disclosure** — Az kullanılan seçenekleri gizleyip
istendiğinde açmak. **Bizde:** "Gelişmiş filtreler" katlanabilir
bölümü — filtreleri silmek yerine bunu önerdim.

**Wireframe / mockup / prototype** — Sırasıyla: kaba iskelet, görsel
taslak, tıklanabilir deneme.

**WCAG** — Web erişilebilirlik standardı. *Görme güçlüğü olan
kullanıcıların da kullanabilmesini sağlar.*
**Bizde:** Renk kontrastları AA seviyesine göre ölçüldü.

**Contrast ratio (kontrast oranı)** — Metin ile arka plan arasındaki
okunabilirlik farkı. **Bizde:** Kırmızı/turuncu yoğunluğunu
azaltırken ölçüldü.

**`:focus-visible` vs `:focus`** — Odak halkasının yalnızca klavyeyle
gezerken görünmesi. *Fareyle tıklayanda gereksiz halka çıkmasını
engeller.*

**Toast / banner / modal** — Sırasıyla: kısa süreli uyarı, sayfa
içinde duran şerit, ekranı kaplayan pencere.
**Bizde:** Bildirimi köşeden ekranın ortasına banner'a taşıdık; sonra
banner'ın kaydet butonunu örtmesi sorun çıkardı — akış içine alındı.

---

# 8. Güvenlik

**Authentication (kimlik doğrulama)** — "Sen kimsin?" *Giriş ekranı.*

**Authorization (yetkilendirme)** — "Buna yetkin var mı?"
*İkisi farklı şeydir; kimliği doğrulanmış biri her şeyi yapamaz.*

**RBAC (Role-Based Access Control)** — Yetkilerin rollere, rollerin
kullanıcılara bağlanması. *Her kullanıcıya tek tek izin vermeyi
engeller.* **Bizde:** Tablo tabanlı — yeni rol eklemek şema değişikliği
değil, satır eklemek.

**Permission (izin)** — Tek bir yetki birimi (`issue.create`).

**Permission-driven UI** — Arayüzün rol **adına** değil izne bakması.
*Yeni rol eklendiğinde arayüzün bozulmasını engeller.*
**Bizde:** Standart; denetimde rol adına bakan kod bulunmadı.

**Principle of least privilege** — Herkese işini yapacak kadar, daha
fazla değil yetki vermek.

**JWT (JSON Web Token)** — Kullanıcının kimliğini taşıyan imzalı
bilet. *Sunucunun oturum tutmasını gerektirmez.*
**Bizde:** 24 saat geçerli; yenileme token'ı yok (D3), bu yüzden
kullanıcı her gün tekrar giriyor.

**Token expiry** — Token'ın süresinin dolması.
**Bizde:** Çevrimdışı kuyruğun 401 alması bu yüzden gerçek bir
senaryo; kayıt silinmemeli, kuyrukta kalmalı.

**Refresh token** — Kısa ömürlü erişim token'ını yenilemeye yarayan
uzun ömürlü token.

**Hashing** — Şifrenin geri döndürülemez şekilde dönüştürülmesi.
*Veritabanı çalınsa bile şifrelerin okunmasını engeller.*

**bcrypt** — Şifre hash'leme algoritması. *Kasıtlı olarak yavaştır;
kaba kuvvet denemesini pahalı hale getirir.*

**Salt** — Her şifreye eklenen rastgele değer. *Aynı şifrenin aynı
hash'i üretmesini ve toplu kırılmasını engeller.*

**Dummy hash** — Kullanıcı yokken de sahte bir hash doğrulaması yapmak.
*Zamanlama saldırısını engeller.* **Bizde:** Girişte uygulandı.

**Timing attack** — Yanıt süresinden bilgi sızması.
**Bizde:** Var olmayan kullanıcıda kontrol atlanırsa yanıt hızlı gelir
ve hesabın olmadığı anlaşılırdı.

**User enumeration** — Saldırganın hangi hesapların var olduğunu
öğrenmesi. *Farklı hata mesajları veya farklı süreler ele verir.*

**Brute force** — Şifreyi deneme yanılmayla bulmaya çalışmak.

**Account lockout** — Hesabın belirli süre kilitlenmesi.
**Bizde:** IP bazlı değil hesap bazlı — aksi halde tek fabrika IP'si
arkasındaki herkes birbirini kilitlerdi.

**HTTPS / TLS** — Trafiğin şifrelenmesi. *Ağı dinleyenin şifreleri ve
token'ları okumasını engeller.* **Bizde:** Yok (B1) — bu haliyle LAN
dışına açılamaz.

**Secret (sır)** — Şifre, anahtar, token gibi gizli kalması gereken
değer. **Bizde:** `.env` içinde ve repoda (B2) — üretimde
çıkarılmalı.

**Attack surface (saldırı yüzeyi)** — Saldırganın deneyebileceği tüm
giriş noktaları. *Kullanılmayan endpoint'leri silmek bunu küçültür.*
**Bizde:** Kaldırılmış evrak onayı akışının endpoint'i hâlâ duruyor —
denetim bunu "ölü ama canlı yan kapı" olarak buldu.

**Redaction** — Loglarda hassas verinin maskelenmesi.
**Bizde:** `applog.Redact`, testle doğrulandı.

**Input validation** — Gelen verinin biçim ve sınır kontrolü.
*Bozuk veya kötü niyetli verinin sisteme girmesini engeller.*
**Bizde:** Açıklama alanında uzunluk sınırı yok — denetim bulgusu.

---

# 9. Test ve kalite güvencesi

**Unit test (birim test)** — Tek bir fonksiyonun test edilmesi.

**Integration test** — Birden fazla parçanın birlikte test edilmesi.

**End-to-end (E2E) test** — Kullanıcının yaptığı işin baştan sona
otomatik yapılması. *En gerçekçi, en yavaş.*
**Bizde:** Yok — en büyük yapısal açık (A6).

**Smoke test** — "Açılıyor mu, temel akış yürüyor mu" hızlı kontrolü.

**Regression (regresyon)** — Daha önce çalışan bir şeyin sonradan
bozulması. *Test takımının asıl varlık sebebi bunu yakalamaktır.*
**Bizde:** Aynı sınıf hata en az dört kez tekrarladı; her düzeltme
kendi özel betiğiyle bir kez doğrulandı ama tekrar çalışan bir ağ yok.

**Negative test** — "Olmaması gerekenin olmadığını" kanıtlayan test.
*Pozitif testler kadar önemli, daha sık atlanır.*
**Bizde:** Panik probe'unun üretimde kapalı olduğunun kanıtlanması;
401 alan kaydın silinmediğinin kanıtlanması.

**Parity test** — İki farklı yerdeki aynı mantığın aynı sonucu
verdiğini kanıtlayan test. *Drift'i yakalar.*
**Bizde:** Kapı kurallarının veritabanı trigger'ı ile uygulama
katmanında aynı kaldığını kilitleyen test.

**Fixture** — Testin çalışması için hazırlanan sahte veri.

**Mock / stub** — Gerçek bir bağımlılığın yerine konan sahte.

**Flaky test** — Bazen geçen bazen kalan, güvenilmez test.
*Ekibin teste güvenini yok eder.*

**Brittle test (kırılgan test)** — Davranış yerine kodun yapısını
ölçen, ufak bir düzenlemede kırılan test.
*Kanıt değeri göründüğünden düşüktür.*
**Bizde:** Kaynak kodda metin arayan doğrulama betikleri — denetimde
bu şekilde işaretlendi.

**Coverage (kapsam)** — Testlerin kodun yüzde kaçına dokunduğu.
*Yüksek kapsam doğruluk garantisi değildir.*

**TDD (Test Driven Development)** — Önce testi, sonra kodu yazmak.

**Load testing / stress testing** — Sistemin çok kullanıcı ve çok veri
altında ne yaptığını ölçmek.
*Rate limiting ile karıştırılmamalı: rate limiting güvenlik önlemi,
load testing ölçümdür.* **Bizde:** Yapılmadı (D2).

**Concurrency** — Aynı anda birden çok işin yürümesi.

**Root cause analysis (kök neden analizi)** — Belirtiyi değil sebebi
bulmak. *Aynı hatanın tekrar etmesini engeller.*
**Bizde:** Önbellekte 5 araç çıkmasının sebebi sayfalama değil,
`PLANNED` araçları gizleyen uç noktanın kullanılmasıydı. Sayfa boyutunu
büyütmek belirtiyi geçici olarak kapatırdı.

**Silent failure (sessiz başarısızlık)** — İşlemin hata vermeden yanlış
sonuç üretmesi. *Bu projedeki en pahalı hata sınıfı.*
**Bizde:**
- Kapı, hiç var olmayan checklist maddelerini "tamam" sayıp sevke izin
  veriyordu
- Bir KPI, kaldırılmış bir alana baktığı için hep sıfır dönüyordu
- Şablon yayma işlemi 0 araca ulaşıp "başarılı" dönüyordu
- Trend grafiği filtrelenmemiş veri kullanıyordu
*Hiçbiri loga bir şey yazmadı. Sadece test ve SQL karşılaştırması
yakalar.*

**Verification (doğrulama)** — İddianın kanıtla desteklenmesi.
**Bizde:** Çalışma disiplinimizin merkezi: "çalışıyor" yeterli değil;
SQL çıktısı, test sonucu veya ekran görüntüsü isteniyor.

---

# 10. İzlenebilirlik

**Observability** — Sistemin içeride ne yaptığını dışarıdan anlayabilme
kabiliyeti. Üç ayağı: log, metrik, iz.

**Log** — Uygulamanın "şunu yaptım / şu hata oldu" diye yazdığı
satırlar. Teknik ve geçicidir.
**Bizde:** Artık dosyaya da yazılıyor, sadece terminale değil.

**Structured logging** — Logun düz cümle yerine alanlara ayrılması.
*Aranabilir ve sayılabilir hale getirir.*

**Log level** — Logun önem derecesi (debug/info/warn/error).
*Üretimde debug kapatılır, yoksa dosya şişer.*

**Log rotation** — Dosya belirli boyuta ulaşınca yenisine geçilmesi.
*Diskin dolmasını engeller.*

**Request ID / correlation ID** — Her isteğe verilen benzersiz kimlik.
*Kullanıcının gördüğü hatayla logdaki satırı eşleştirmeyi sağlar.*
**Bizde:** 5xx hatalarda kullanıcıya "Hata kodu" olarak gösteriliyor.

**Log aggregation / centralized logging** — Birden çok sunucunun
loglarının tek yerde toplanması (Loki, ELK gibi). **Bizde:** Yok.

**APM (Application Performance Monitoring)** — Hataları ve performansı
dışarıdan izleyen servis (Sentry, Datadog). **Bizde:** Yok (B7).

**Crash reporting** — Kullanıcının cihazındaki çökmelerin toplanması.
*Sunucu logları bunları göremez, çünkü hata sunucuya hiç ulaşmaz.*
**Bizde:** Yok — mobil uygulamada beyaz ekran olsa haberimiz olmaz.

**Alerting** — Bir eşik aşıldığında birine haber gitmesi.
*Log varsa bakabilirsin, uyarı varsa haberin olur.*
**Bizde:** Yok — birinin şikâyet etmesi gerekiyor.

**Metric** — Sayılabilir ölçüm (hata oranı, yanıt süresi).
*Log "ne oldu"yu, metrik "ne kadar sık"ı anlatır.*

**Tracing** — Bir isteğin katmanlar arası yolculuğunun izlenmesi.

**Audit log** — Kimin ne zaman ne yaptığının kaydı.
*Teknik logdan farklıdır:* teknik log mühendis içindir ve geçicidir;
audit log iş içindir, veritabanında durur, silinmez.
**Bizde:** `audit_logs` tablosu; Karar 7 gereği hata geçmişi de burada.

**Panic** — Go'da programın beklenmeyen durumda kendini durdurması.
*Yakalanmazsa tüm süreci öldürür — tek bozuk istek bütün fabrikanın
sistemini indirebilir.*

**Panic recovery** — Paniği isteğin içinde yakalayıp süreci ayakta
tutan mekanizma. **Bizde:** `recoverPanic`.

**Panic probe** — Kurtarmanın çalıştığını kanıtlamak için bilerek
panikleyen test uç noktası. *Kurtarma mekanizması, panik probe ise
onun testidir — ikisi farklı şeydir.*
**Bizde:** Üretimde 404 döndüğü testle kanıtlandı.

**Stack trace** — Çökmenin hangi fonksiyon zincirinden geldiği.
*Loga yazılır, kullanıcıya asla gösterilmez — hem anlamsızdır hem iç
yapıyı ifşa eder.*

---

# 11. Sürüm yönetimi, derleme, dağıtım

**Git** — Kod değişikliklerinin geçmişini tutan sistem.

**Commit** — Bir değişiklik paketinin geçmişe kaydedilmesi.

**Working tree** — Çalışma klasörünün o anki hali.
**"Temiz" (clean)** = kaydedilmemiş değişiklik yok.
*Kirli bırakmak, yarım kalan işin kaybolmasına yol açar.*

**Branch (dal)** — Ana koddan ayrılıp paralel çalışma.

**Merge** — Dalın ana koda birleştirilmesi.

**Pull request (PR)** — Değişikliğin birleştirilmeden önce gözden
geçirilmesi için açılan talep.

**Push / pull** — Yereldeki commit'leri uzak sunucuya göndermek /
oradan almak. *Push edilmemiş commit yalnızca senin bilgisayarında
durur.*

**.gitignore** — Git'in takip etmemesi gereken dosyaların listesi.
*Şifre dosyalarının ve log çıktılarının yanlışlıkla repoya
girmesini engeller.*

**CI/CD (Continuous Integration / Continuous Deployment)** — Her
değişiklikte otomatik derleme, test ve dağıtım.
*İnsanın "test etmeyi unuttum" demesini engeller.*
**Bizde:** Yok, bilinçli olarak ertelendi (D1).

**Build (derleme)** — Kaynak kodun çalıştırılabilir hale getirilmesi.

**Deploy (dağıtım)** — Yeni sürümün çalıştığı yere konması.

**Staging** — Üretime benzeyen deneme ortamı.
*Üretimde ilk kez denemeyi engeller.* **Bizde:** Yok — tek ortam.

**Production (üretim/canlı)** — Gerçek kullanıcıların kullandığı ortam.

**Environment (ortam)** — development / staging / production.

**Docker** — Uygulamayı bağımlılıklarıyla birlikte paketleyip her yerde
aynı şekilde çalıştırma teknolojisi. *"Bende çalışıyordu" sorununu
engeller.*

**Container** — Docker'ın çalışan örneği.

**Image** — Container'ın kalıbı.

**systemd** — Linux'ta servisleri yöneten, çöktüğünde yeniden başlatan
sistem. **Bizde:** Yok — backend elle başlatılıyor ve düştüğünde
kalkmıyor (B4).

**Semantic versioning** — Sürüm numaralandırma kuralı:
`BÜYÜK.KÜÇÜK.YAMA` (kırıcı değişiklik / yeni özellik / hata düzeltme).

**Breaking change** — Mevcut kullanımı bozan değişiklik.
**Bizde:** React Native 0.86'nın FormData davranışını değiştirmesi
fotoğraf yüklemeyi kırdı.

---

# 12. Yapay zekâ destekli geliştirme

**Prompt** — Yapay zekâya verilen talimat.
*Kendi içinde eksiksiz olması, tahmine yer bırakmaması gerekir.*
**Bizde:** Her tur için Türkçe, kopyalanıp yapıştırılabilir, doğrulama
şartlarını içeren promptlar yazılıyor.

**Context (bağlam)** — Modelin o anda "gördüğü" bilgi.
*Uzun konuşmalarda bağlamın taşması, önceki kararların unutulmasına
yol açar.* **Bizde:** `14_KAREA_Proje_Baglami.md` bu yüzden yazıldı.

**Hallucination** — Modelin olmayan bir şeyi varmış gibi anlatması.
*Bu yüzden her iddia kanıt isteniyor.*
**Bizde:** En az iki kez raporda yazılan iddia doğru çıkmadı —
"girişten sonra kuyruk yeniden deneniyor" (backoff yüzünden
denemiyordu) ve yazdırma doğrulamasında "13 SVG bulundu" (çıktıya
bakılmadan sayılmıştı).

**Agent** — Araçları kullanarak kendi başına adım atabilen yapay zekâ.
**Bizde:** Cursor bu rolde; kodu o yazıyor.

**Cursor rules** — Cursor'a her turda otomatik uygulanan kalıcı
talimatlar. **Bizde:** `.cursor/rules/reporting.mdc` — her raporda
yedi başlık zorunlu: Veritabanı, Dosyalar, Davranış değişiklikleri,
Yapılmayanlar, Doğrulama, Temizlik, Yıkıcı işlemler.

**Guardrail** — Modelin yapmaması gerekenleri sınırlayan kural.
**Bizde:** Yedinci kural: doğrulamayı kolaylaştırmak için gerçek veri
silinemez, kullanıcı şifresi değiştirilemez — sonradan geri alınsa
bile.

---

# 13. Karea'ya özgü kavramlar

**VIN (Vehicle Identification Number)** — 17 haneli araç şasi numarası.
*Bizde araçların birincil anahtarı; Karar 10 ile ayrı bir araç numarası
tutulmasından vazgeçildi.*

**Station step (istasyon adımı)** — Aracın bir istasyondan geçişinde
yapılan kontrol. *v1'deki "phase" kavramının yerini aldı (Karar 1).*

**EOL (End of Line)** — Hattın sonundaki son kontrol süreci.

**EOL akışı** — Fabrika → Depo → Teslim Edildi (Karar 2, migration
0013). *Önceki "sevk edildi" ve "evrak onayı" adımları kaldırıldı.
"Müşteride" ifadesi kullanılmıyor çünkü araç bazen satış ofisine,
bazen bayiye gidiyor.*

**Gate (kapı)** — Bir sonraki aşamaya geçmeyi engelleyen koşul kümesi.
*Eksik kontrolle araç sevk edilmesini engeller.*
**Bizde:** Şube sevki için istasyon adımları + üç checklist
(EOL, test, sevk) tamamlanmış olmalı; depo çıkışı için açık hata
olmamalı.

**Checklist template (şablon)** — Araç tipine göre tanımlı kontrol
maddeleri listesi. *Her araç için maddelerin tek tek girilmesini
engeller.*

**Template propagation (şablon yayma)** — Şablon maddelerinin araçlara
satır olarak dağıtılması. **Bizde:** 0 araca ulaşıp "başarılı" dönmesi
gerçek bir hataya sebep oldu; artık boş yayma reddediliyor.

**Defect catalogue (hata kodu kataloğu)** — Bölge → parça → kusur tipi
şeklinde üç eksenli sınıflandırma. *Serbest metinle yazılan hataların
sayılabilir hale gelmesini sağlar.*
**Bizde:** 1619 eski kaydın metin analizinden türetildi; 23 parça +
Diğer, 10 kusur tipi. **Kalite ekibi henüz onaylamadı.**

**Hata kodu formatı** — `PARÇA-KUSUR`, örnek `10-01-01`.
*Sayısal ve sabit olduğu için katalogdaki isimler değişse bile kod
aynı kalır.*

**Sorumlu süreç** — Kusur tipinden otomatik atanan süreç (Kaynak, Boya,
Montaj, Elektrik). *Operatöre ek soru sormadan sorumluluk
atanmasını sağlar; kalite düzeltebilir.*

**Hold (beklemeye alma)** — Aracın akışının geçici olarak
durdurulması.

**Şartlı Onay** — Hatanın tam onay yerine koşullu kapatılması
(Karar 6).

**Karar 1-11** — Mimari mutabakat belgesindeki numaralı kararlar.
*Her biri bir tartışmanın sonucunu kalıcılaştırır; sonradan "neden
böyle yapmıştık" sorusunu cevaplar.*
**Bizde:** `11_KAREA_v2_Mimari_Mutabakati.md`.
