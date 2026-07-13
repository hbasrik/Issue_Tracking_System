
# KAREA — User Stories & Acceptance Criteria (Given-When-Then) v1.0

---

## EPIC A — Araç Statü, Konum ve Yaşam Döngüsü

### US-A1: Lokasyon/Statü Güncelleme
**As a** Vardiya Amiri / TPM, **I want to** bir aracın global lokasyon/statüsünü dashboard üzerinden güncellemek, **so that** araçların fiziksel durumu sistemde doğru yansısın.

- **Given** bir araç `IN_PRODUCTION` statüsündeyken
  **When** yetkili kullanıcı statüyü `IN_WAREHOUSE` olarak değiştirir
  **Then** sistem değişikliği kaydeder, eski/yeni statü ve zaman damgasıyla audit log'a yazar ve dashboard'da anlık güncellenir.

- **Given** bir araç henüz 43 maddelik sevk checklist'ini tamamlamamışken
  **When** kullanıcı statüyü `SHIPPED` yapmaya çalışır
  **Then** sistem işlemi reddeder ve eksik madde sayısını içeren bir hata mesajı gösterir.

### US-A2: Statü Geçmişi Görüntüleme
**As a** TPM, **I want to** bir aracın tüm statü/lokasyon geçmişini görmek, **so that** süreç denetimi yapabileyim.

- **Given** bir araç birden fazla statü değişikliği geçirmişken
  **When** kullanıcı araç detay sayfasını açar
  **Then** kronolojik statü geçmişi (kim, ne zaman, hangi statüden hangisine) listelenir.

---

## EPIC B — 8 Fazlı Üretim Takibi

### US-B1: Checkpoint Tamamlama
**As a** Saha Operatörü, **I want to** bir fazdaki checkpoint'i tik ile işaretlemek, **so that** aracın ilerlemesi kaydedilsin.

- **Given** operatör bir araç için aktif fazdaki bir checkpoint'i görüntülerken
  **When** checkpoint'i "Tamamlandı" olarak işaretler
  **Then** sistem checkpoint'i `completed`, tamamlayanı ve zamanı kaydeder ve aracın toplam completion yüzdesini yeniden hesaplar.

### US-B2: Faz Tamamlanınca Yüzde Kilometre Taşı
**As a** TPM, **I want to** bir faz tamamen bittiğinde beklenen yüzdeye ulaşıldığını görmek, **so that** ilerleme hesaplamasına güvenebileyim.

- **Given** 8 fazlı bir araçta ilk 4 faz (toplam checkpoint'lerin yarısı) tamamlanmışken
  **When** dashboard açılır
  **Then** aracın completion yüzdesi %50 olarak gösterilir (±faz ağırlık konfigürasyonuna göre).

### US-B3: Checkpoint Başarısızlığında Otomatik Issue (Soft-Warning)
**As a** Saha Operatörü, **I want to** bir checkpoint'i başarısız işaretlediğimde otomatik hata ekranına yönlendirilmek, **so that** hatayı hemen ve doğru bağlamla kaydedebileyim, ancak üretim hattı durmasın.

- **Given** operatör bir checkpoint'i "Başarısız" olarak işaretlerken
  **When** "Hata Girme" butonuna basar
  **Then** sistem checkpoint_id, vehicle_id, station_id ve timestamp önceden doldurulmuş yeni bir `Issue` formu açar ve durum log tablosuna yazılır.

- **Given** bir checkpoint'e bağlı issue henüz `OPEN` statüsündeyken
  **When** operatör aracın genel completion yüzdesini kontrol eder
  **Then** bu checkpoint tamamlanmamış olarak sayılır ve yüzdeye dahil edilmez.

- **Given** bir checkpoint'e bağlı issue henüz `OPEN` statüsündeyken (**soft-warning kuralı**)
  **When** operatör bir sonraki faza veya başka bir checkpoint'e geçmeye çalışır
  **Then** sistem geçişi **engellemez**; operatör serbestçe ilerleyebilir, açık issue sadece uyarı/rozet olarak görünür kalır.

### US-B4: Issue Kapatma ve Checkpoint Yeniden Deneme
**As a** Vardiya Amiri, **I want to** çözülen bir issue'yu kapatmak, **so that** ilişkili checkpoint tekrar tamamlanabilir statüye dönsün.

- **Given** bir issue çözülmüş ve kapatılmışken
  **When** operatör ilişkili checkpoint'i tekrar "Tamamlandı" işaretler
  **Then** checkpoint completion yüzdesine dahil edilir ve issue kaydı `resolved_at` ile güncellenir.

---

## EPIC C — End of Line (EoL) Checklist (Model Bazlı Şablon)

### US-C0: Araç Modeline Göre Otomatik Şablon Atama
**As a** Sistem (mimari kural), **I want to** yeni bir araç oluşturulduğunda modeline uygun EoL/Sevk checklist şablonunu otomatik atamak, **so that** farklı araç modelleri farklı kontrol listeleriyle çalışabilsin.

- **Given** "Model X" için tanımlı, aktif bir EoL şablonu (`checklist_templates`, type=EOL) varken
  **When** "Model X" tipinde yeni bir araç oluşturulur
  **Then** sistem otomatik olarak bu şablondaki tüm maddeleri (`checklist_template_items`) araca kopyalar (`vehicle_checklist_items`) ve varsayılan statü ile başlatır.

- **Given** bir araç modeli için özel bir şablon tanımlı değilken
  **When** o modelden yeni bir araç oluşturulur
  **Then** sistem varsayılan (default) EoL/Sevk şablonunu (13/43 madde) atar.

### US-C1: EoL Madde Statüsü Girme
**As a** Kalite Sorumlusu, **I want to** her EoL maddesi için OK/NOT OK/REWORK/CONDITIONAL OK seçmek, **so that** hat sonu kalite durumu net kayda geçsin.

- **Given** operatör 13 maddelik EoL checklist ekranındayken
  **When** bir maddeye `NOT_OK` statüsü seçer
  **Then** sistem açıklama alanını zorunlu hale getirir ve açıklama girilmeden kayıt tamamlanamaz.

- **Given** operatör bir maddeye `OK` statüsü seçerken
  **When** açıklama alanını boş bırakır
  **Then** sistem kaydı kabul eder (açıklama opsiyoneldir).

### US-C2b: EoL Çıkış Kapısı — Hard-Block ve Eksik Madde Uyarısı
**As a** Sistem (iş kuralı), **I want to** tüm EoL maddeleri OK/CONDITIONAL OK olmadan aracın EoL'den çıkışını engellemek, **so that** kalite garantisi olmadan araç bir sonraki aşamaya geçmesin.

- **Given** bir aracın 13 EoL maddesinden 12'si `OK`, 1'i `NOT_OK` iken
  **When** operatör/yönetici aracı EoL'den çıkarmaya (lokasyon/statü değiştirmeye) çalışır
  **Then** sistem işlemi reddeder ve "Madde 4: NOT_OK — [açıklama]" gibi hangi maddenin engel olduğunu gösteren bir uyarı listesi sunar.

- **Given** bir aracın tüm EoL maddeleri `OK` veya `CONDITIONAL_OK` iken
  **When** operatör/yönetici aracı EoL'den çıkarmaya çalışır
  **Then** işlem başarıyla gerçekleşir.

- **Given** bir madde henüz hiç değerlendirilmemişken (boş/empty statü)
  **When** çıkış denenir
  **Then** bu madde de "Değerlendirilmedi" olarak engel listesinde gösterilir ve çıkışı engeller.

### US-C2: EoL Sonucu Özet Görünümü
**As a** TPM, **I want to** bir aracın EoL sonuçlarının özetini görmek, **so that** kaç maddenin OK/NOT OK/REWORK olduğunu hızlıca değerlendirebileyim.

- **Given** bir aracın 13 EoL maddesi tamamlanmışken
  **When** dashboard'da EoL özet kartı açılır
  **Then** her statü kategorisindeki madde sayısı (örn. 11 OK, 1 REWORK, 1 CONDITIONAL OK) gösterilir.

---

## EPIC D — Müşteri Sevk Öncesi Checklist (43 Madde)

### US-D1: 43 Madde Checked İşaretleme
**As a** Sevkiyat Operatörü, **I want to** sevk öncesi 43 maddeyi tek tek onaylamak, **so that** araç sevke hazır olduğunda sistem bunu bilsin.

- **Given** operatör 43 maddelik checklist ekranındayken
  **When** bir maddeyi "Checked" işaretler
  **Then** sistem işaretleyen kişi ve zamanı kaydeder, kalan madde sayacını günceller.

### US-D2: Eksik Checklist ile Sevk Engelleme
**As a** Sistem (iş kuralı), **I want to** 43 maddenin tamamı Checked olmadan sevk statüsüne geçişi engellemek, **so that** eksik kontrol edilmiş araç yanlışlıkla sevk edilmesin.

- **Given** bir araçta 43 maddeden 39'u Checked, 1 tanesi Unchecked iken
  **When** kullanıcı statüyü `SHIPPED` yapmaya çalışır
  **Then** backend isteği reddeder (HTTP 4xx + business rule error code) ve UI eksik maddeyi vurgular.

- **Given** bir araçta 43 maddenin tamamı Checked iken
  **When** kullanıcı statüyü `SHIPPED` yapar
  **Then** işlem başarıyla gerçekleşir ve statü geçmişine kaydedilir.

---

## EPIC E — Akıllı VIN Arama

### US-E1: Son 5 Hane ile Arama
**As a** Saha Operatörü, **I want to** VIN'in son 5 hanesini girerek aracı bulmak, **so that** 17 haneyi tam yazmak zorunda kalmayayım.

- **Given** operatör arama kutusuna "00057" yazarken
  **When** sistem sorguyu çalıştırır
  **Then** VIN'i "...00057" ile biten (veya içeren, konfigürasyona göre) araç(lar) 100ms içinde önerilir.

- **Given** son 5 hane birden fazla araçla eşleşirken
  **When** sonuç listesi görüntülenir
  **Then** operatör tüm adaylar arasından doğru aracı manuel seçer.

---

## EPIC F — KPI Dashboard

### US-F1: Günlük Bekleyen Hata Sayısını Görme
**As a** TPM, **I want to** güncel açık issue sayısını dashboard'da görmek, **so that** günlük operasyonel yükü değerlendirebileyim.

- **Given** sistemde 12 adet `OPEN` veya `IN_PROGRESS` statüsünde issue varken
  **When** TPM dashboard'ı açar
  **Then** "Daily Pending Issues" kartında 12 değeri gösterilir ve son 30 günlük trend grafiği render edilir.

### US-F2: İstasyon Bazlı Defect Rate Görme
**As a** Kalite Sorumlusu, **I want to** istasyon bazında hata oranını görmek, **so that** en problemli istasyonu önceliklendirebileyim.

- **Given** İstasyon 3'ten geçen 50 araçtan 5'inde issue kaydı varken
  **When** dashboard Defect Rate per Station grafiği açılır
  **Then** İstasyon 3 için %10 defect rate gösterilir ve istasyonlar arası Pareto sıralaması yapılır.

---

## EPIC G — Rol Bazlı Erişim (RBAC — 2 Rol: Operator / Manager-Admin)

### US-G1: Operatörün Web Dashboard'a Erişememesi
**As a** Sistem (güvenlik kuralı), **I want to** `Operator` rolündeki kullanıcıların yalnızca mobil uygulamaya erişebilmesini sağlamak, **so that** kritik yönetim işlevleri sahadan kazara değiştirilmesin.

- **Given** bir kullanıcı `Operator` rolündeyken
  **When** web dashboard URL'sine giriş yapmayı dener
  **Then** sistem erişimi reddeder (401/403) ve kullanıcıyı mobil uygulamayı kullanmaya yönlendiren bir mesaj gösterir.

### US-G2: Yetkisiz Statü Değişikliğinin ve Issue Kapatmanın Engellenmesi
**As a** Sistem (güvenlik kuralı), **I want to** sadece `Manager/Admin` rolünün kritik statü değişikliği ve issue kapatma yapabilmesini sağlamak, **so that** veri bütünlüğü korunsun.

- **Given** bir kullanıcı `Operator` rolündeyken
  **When** aracı doğrudan `SHIPPED` statüsüne geçirmeye veya bir issue'yu kapatmaya çalışır (API üzerinden dahi)
  **Then** sistem yetki hatası döner; yalnızca `Manager/Admin` rolü bu işlemleri yapabilir.

- **Given** bir kullanıcı `Manager/Admin` rolündeyken
  **When** araç statüsünü günceller veya bir issue'yu kapatır
  **Then** işlem başarıyla gerçekleşir ve audit log'a yazılır.

---

## EPIC H — Yerleşik "Analysis" Sekmesi (Power BI Yerine)

### US-H1: Dinamik Filtreleme ile Rapor Görüntüleme
**As a** Manager/Admin, **I want to** tarih aralığı, faz, araç statüsü ve hata türüne göre filtreleme yapmak, **so that** ihtiyacım olan veri kesitini hızlıca görebileyim.

- **Given** Manager/Admin, Analysis sekmesindeyken
  **When** tarih aralığı = "son 7 gün", faz = "Faz 3", hata türü = "Elektrik" filtrelerini uygular
  **Then** grafikler ve tablolar yalnızca bu kritere uyan verilerle (AND mantığıyla) yeniden render edilir.

### US-H2: Pie/Bar Chart ile Görselleştirme
**As a** Manager/Admin, **I want to** filtrelenen veriyi Pie Chart ve Bar Chart ile görmek, **so that** biten/devam eden işleri ve istasyon bazlı süreleri hızlıca yorumlayabileyim.

- **Given** filtrelenmiş bir veri seti mevcutken
  **When** Analysis sekmesi render edilir
  **Then** en az bir Pie Chart (örn. biten/devam eden iş dağılımı) ve bir Bar Chart (örn. istasyon bazlı elapsed time/MTTR) gösterilir.

### US-H3b: VIN Bazlı Filtre ve Araç Bazlı Hata Dağılımı
**As a** Manager/Admin, **I want to** belirli bir aracı VIN ile filtreleyip o aracın açık hatalarının önem derecesine göre dağılımını görmek, **so that** hangi araçların kritik risk taşıdığını hızlıca tespit edebileyim.

- **Given** VIN'i "...00057" olan araçta 3 Kritik, 2 Orta, 3 Düşük olmak üzere toplam 8 açık issue varken
  **When** Manager/Admin Analysis sekmesinde VIN filtresine "00057" yazıp uygular
  **Then** araç bazlı hata dağılımı tablosunda/grafiğinde "VIN ...00057 — 8 açık hata: 3 Kritik, 2 Orta, 3 Düşük" satırı görüntülenir.

- **Given** VIN filtresi boş bırakılmışken
  **When** Analysis sekmesi açılır
  **Then** filtrelenen tarih/faz/statü/hata türü kapsamındaki **tüm araçlar** için bu dağılım tablo halinde listelenir (varsayılan: en çok açık hataya sahip araç en üstte).

### US-H3: A4 Print-Ready PDF Export
**As a** Manager/Admin, **I want to** ekrandaki filtreler ve grafiklerle birebir uyumlu bir PDF raporu indirmek, **so that** yönetime/toplantıya profesyonel bir çıktı sunabileyim.

- **Given** Manager/Admin belirli filtreleri uygulamış ve grafikleri görüntülüyorken
  **When** "Export/Print" butonuna basar
  **Then** sistem, ekrandaki filtre özetini, grafikleri ve **araç bazlı açık hata dağılımı tablosunu (VIN × severity)** içeren, A4 print-ready düzende bir PDF üretir ve indirir (≤10 sn içinde).
