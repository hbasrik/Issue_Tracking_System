
# KAREA — Integrated Production Tracking & Monitoring Platform
## Product Requirements Document (PRD) v1.0

**Doküman Sahibi:** Senior TPM / Baş Yazılım Mimarı
**Tarih:** 2026-07-13
**Durum:** Taslak — Onay Bekliyor (Review Cycle 1)
**Kapsanan Alt Sistemler:** KTS (Karea Takip Sistemi) + KMS (Karea Monitör Sistemi) → Tek platform: **Karea**

---

## 1. Yönetici Özeti

Karea, otomotiv üretim hattındaki araçların doğuşundan (hatta giriş) sevkiyatına kadar geçirdiği tüm yaşam döngüsünü; 8 fazlı üretim takibi, End of Line (EoL) kalite kontrolü, müşteri sevk öncesi checklist'i ve VIN bazlı hızlı arama ile uçtan uca izleyen; aynı zamanda yönetime gerçek zamanlı KPI görünürlüğü sağlayan tek, modüler bir platformdur.

Bugüne kadar ayrı ayrı çalışan **KTS** (saha operasyon / checklist takip mantığı) ve **KMS** (yönetim / izleme / dashboard mantığı), bu platformda aynı veri modeli ve aynı backend üzerinde, farklı arayüz katmanları (mobil saha uygulaması + web yönetici dashboard'u) olarak birleştirilecektir.

---

## 2. Problem Tanımı

- Saha operatörleri, araç bazlı kalite/üretim adımlarını kağıt/Excel veya birbirinden kopuk sistemlerle takip ediyor; bu durum veri kaybına, gecikmeli hata bildirimine ve tutarsız raporlamaya yol açıyor.
- Yönetim, üretimdeki bir aracın anlık yüzde tamamlanma durumunu, hangi fazda hangi checkpoint'in başarısız olduğunu gerçek zamanlı göremiyor.
- Sevk öncesi kontrol süreçleri standardize değil; eksik kontrol edilmiş bir aracın yanlışlıkla sevk edilmesi riski var.
- Şasi (VIN) numarasıyla arama yapmak saha koşullarında (eldiven, hız, kısıtlı ekran) pratik değil; operatör 17 haneyi tam giremiyor.
- KPI'lar (bekleyen hata sayısı, çözüm süresi, istasyon bazlı hata oranı) manuel olarak, gecikmeli ve hataya açık şekilde hesaplanıyor.

## 3. Ürün Vizyonu

Sahadaki her dokunuşun (tik, hata girişi, statü değişikliği) saniyeler içinde yönetim dashboard'una yansıdığı; kural ihlallerinin (eksik checklist, başarısız checkpoint) sistem tarafından otomatik olarak engellendiği veya işaretlendiği; büyümeye ve yeni faz/checklist/istasyon eklenmesine mimari olarak açık, endüstriyel sahada hatasız kullanılabilecek kadar sade bir arayüze sahip tek platform.

## 4. Kapsam (Scope)

### 4.1 Kapsam İçi (In-Scope — Faz 1)
- Araç kayıt, global lokasyon/statü yönetimi (Hatta / Depoda / Müşteride / Sevk Edildi vb.)
- 8 fazlı üretim takibi, faz başına 7–8 checkpoint, dinamik tamamlanma yüzdesi
- Checkpoint başarısızlığında tek dokunuşla otomatik issue (hata kaydı) oluşturma
- 13 maddelik EoL checklist (OK / NOT OK / REWORK / CONDITIONAL OK + açıklama)
- 43 maddelik müşteri sevk öncesi checklist ve "tamamı checked olmadan sevk yok" iş kuralı
- VIN'in son 5 hanesiyle akıllı arama/eşleştirme (trigram index)
- KPI/analitik veri modeli (Daily Pending Issues, Completed Issues, Cycle Time/MTTR, Defect Rate per Station)
- Web yönetici dashboard'u + mobil saha operasyon uygulaması (React Native/Expo)
- Rol bazlı erişim (Operatör, Vardiya Amiri, Kalite, TPM/Yönetici)

### 4.1.1 Faz 1'e Eklenen Yeni Kapsam Maddesi
- Yerleşik **Analysis** sekmesi (dinamik filtreleme + Pie/Bar Chart + PDF/Print export) — Power BI'ın yerini alan Must-Have özellik.

### 4.2 Kapsam Dışı (Out-of-Scope — Faz 1, gelecekte değerlendirilecek)
- Harici BI aracı entegrasyonu (Power BI vb.) — **kalıcı olarak iptal edildi**, yerleşik Analysis sekmesi ile karşılanacak.
- Otomatik IoT/sensör entegrasyonu (barkod okuyucu/RFID donanım entegrasyonu Faz 2)
- Çoklu fabrika/çoklu tenant mimarisi (mimari buna izin verir ama Faz 1'de tek fabrika varsayılır)
- Push notification / SMS entegrasyonları (Faz 2)
- Offline-first mobil senkronizasyon (Faz 1'de online bağlantı varsayılır; mimari offline'a kapalı değildir)

## 5. Hedef Kullanıcılar / Personas

**Karar (Onaylandı):** Sistemde yalnızca iki teknik rol tanımlıdır:
- **Operator** — yalnızca mobil arayüz; faz/checkpoint doldurma, EoL/sevk checklist girişi, hata (issue) bildirme. Web dashboard'a erişimi yoktur.
- **Manager/Admin** — yalnızca web dashboard; tüm araç/statü takibi, lokasyon/statü güncelleme, issue kapatma, Analysis sekmesine erişim.

Aşağıdaki organizasyonel personalar bu iki sistem rolünden birine eşlenir:

| Persona | Sistem Rolü | Birincil Cihaz | Temel İhtiyaç |
|---|---|---|---|
| Saha Operatörü | **Operator** | Mobil (tablet/telefon) | Hızlı tik atma, hata girme, checklist doldurma |
| Vardiya Amiri | **Manager/Admin** | Web Dashboard | İstasyon bazlı ilerleme takibi, issue kapatma |
| Kalite Sorumlusu | **Manager/Admin** | Web Dashboard | EoL/sevk checklist denetimi, Analysis sekmesinden defect rate takibi |
| Senior TPM / Yönetici | **Manager/Admin** | Web Dashboard | KPI izleme, cycle time, lokasyon/statü yönetimi, PDF rapor çıktısı |
| Müşteri Temsilcisi (dahili) | **Manager/Admin** | Web Dashboard | Müşteriye giden araçların sevk onay durumu |

## 6. Fonksiyonel Gereksinimler

### 6.1 Araç Statü, Konum ve Yaşam Döngüsü Yönetimi
- FR-1.1: Her araç bir `VehicleStatus` (örn. `IN_PRODUCTION`, `IN_WAREHOUSE`, `WITH_CUSTOMER`, `SHIPPED`, `ON_HOLD`) ve bir `CurrentLocation` alanına sahip olmalıdır.
- FR-1.2: Statü/lokasyon değişiklikleri dashboard üzerinden yetkili roller tarafından manuel güncellenebilmeli, her değişiklik zaman damgalı olarak loglanmalıdır (audit trail).
- FR-1.3: Statü geçiş kuralları (state machine) tanımlı olmalıdır — örn. 43 maddelik checklist tamamlanmadan `SHIPPED` statüsüne geçiş engellenmelidir (bkz. FR-4.3).

### 6.2 8 Fazlı Üretim Takibi ve Dinamik Yüzde Hesaplama
- FR-2.1: Üretim süreci sabit 8 fazdan oluşur; her faz 7–8 checkpoint içerir (checkpoint sayısı faz bazında veritabanında dinamik tanımlanır, kod içine gömülmez).
- FR-2.2: Operatör bir checkpoint'i tamamladığında (tik attığında), aracın toplam completion percentage değeri otomatik yeniden hesaplanır. **Karar (Onaylandı):** Her faz eşit ağırlıkta (%12.5) sayılır; hesaplama `completion % = (tamamlanan checkpoint sayısı / toplam checkpoint sayısı) × 100` şeklindedir.
- FR-2.3: Bir faz tamamen bittiğinde (o fazın tüm checkpoint'leri tamamlandığında), toplam yüzde beklenen kilometre taşına ulaşmalıdır (8 eşit fazda: faz 4 bitince %50, faz 8 bitince %100).
- FR-2.4: Bir checkpoint "başarısız" olarak işaretlendiğinde, operatöre o checkpoint'in altında tek bir "Hata Bildir" butonu gösterilir; bu buton operatörü Hata Girme ekranına yönlendirir ve checkpoint ile otomatik ilişkili bir `Issue` kaydı oluşturur (checkpoint_id, vehicle_id, station, timestamp önceden doldurulmuş halde), durum log tablosuna yazılır.
- FR-2.5: **Karar (Onaylandı) — Soft-Warning Modeli:** Sistem hattı asla durdurmaz. Başarısız bir checkpoint'e bağlı issue açık kaldığı sürece o checkpoint completion yüzdesine dahil edilmez, ancak operatör diğer checkpoint'lere ve **sonraki fazlara geçmeye serbestçe devam edebilir** — hiçbir geçiş kilitlenmez (hard-block yoktur). İlişkili issue kapatıldığında checkpoint yeniden değerlendirilip "tamamlandı" işaretlenebilir ve yüzdeye dahil olur.
- FR-2.6: **Karar (Onaylandı) — Issue Önem Derecesi (Severity):** Her `Issue` kaydı, hata girme formunda operatör tarafından seçilen bir önem derecesine sahiptir: `CRITICAL` (Kritik) / `MEDIUM` (Orta) / `LOW` (Düşük). Bu alan zorunludur ve Analysis sekmesindeki araç bazlı hata dağılımı raporlamasının (bkz. FR-6.7–6.9) temelini oluşturur.

> **Karar (Onaylandı) — Multi-Template Mimarisi:** EoL ve Sevk Öncesi checklist'leri sabit/tekil değildir; **araç modeline göre farklılaşabilir**. Veritabanında `checklist_templates` (template_id, name, type [EOL/SHIPMENT], vehicle_model_id, is_active) ve `checklist_template_items` (şablona bağlı maddeler, sıra no, madde metni) tabloları tutulur. Bir araç oluşturulurken modeline uygun aktif şablon otomatik atanır; o aracın checklist kayıtları (`vehicle_checklist_items`) bu şablondan türetilir. Detaylı şema ADIM 3'te sunulacaktır.

### 6.3 End of Line (EoL) Checklist (13 Madde — Model Bazlı Şablon)
- FR-3.1: Veritabanında, araç modeline göre farklılaşabilen, çoklu (multi-template) EoL checklist şablonları tutulur; varsayılan şablon 13 madde içerir ancak modele özel şablonlarda madde sayısı/içeriği farklı olabilir. Şablonlar CRUD'a açıktır.
- FR-3.2: Her madde için operatör dört statüden birini seçer: `OK`, `NOT_OK`, `REWORK`, `CONDITIONAL_OK`.
- FR-3.3: Statüye bağlı açıklama zorunluluğu konfigüre edilebilir olmalıdır — iş kuralı: `NOT_OK`, `REWORK`, `CONDITIONAL_OK` seçildiğinde açıklama **zorunlu**; `OK` seçildiğinde açıklama **opsiyonel**.
- FR-3.4: Her EoL madde girişi, kim tarafından, ne zaman girildiği bilgisiyle loglanır (audit).
- FR-3.5: **Karar (Onaylandı) — EoL Çıkış Kapısı (Hard-Block):** Aracın EoL istasyonundan çıkışına (bir sonraki lokasyon/statüye geçişine) izin verilebilmesi için, atanmış EoL şablonundaki **tüm maddelerin** statüsü `OK` veya `CONDITIONAL_OK` olmalıdır. Herhangi bir madde `NOT_OK`, `REWORK` durumundaysa veya henüz değerlendirilmemişse (boş), araç EoL'den **çıkamaz**.
- FR-3.6: FR-3.5 kuralı backend seviyesinde zorunlu validasyon olarak uygulanır (FR-4.3'teki 43 madde kuralıyla aynı prensip — UI bypass edilse, doğrudan API çağrısı yapılsa dahi geçerlidir).
- FR-3.7: Çıkış engellendiğinde operatöre/yöneticiye, **hangi madde(ler)in** eksik ya da hangi statüde olduğunu gösteren net bir uyarı listesi sunulmalıdır (örn. "Madde 4: NOT_OK — Boya çizik", "Madde 9: Değerlendirilmedi").

> **Mimari Not — Soft-Warning (Faz Checkpoint) vs. Hard-Block (EoL Kapısı) Ayrımı:** Bölüm 6.2'deki 8 fazlı üretim checkpoint'leri **soft-warning** ile çalışır (hat durmaz, bkz. FR-2.5); ancak **EoL çıkış kapısı** ve **43 maddelik sevk kapısı** (FR-4.3) kasıtlı olarak **hard-block**'tur — bunlar son kalite/sevk kapılarıdır ve üretim ortasındaki akışı değil, kaliteyi garanti eden son kontrol noktalarıdır. Bu iki farklı davranış modeli Cursor prompt'unda (ADIM 4) net şekilde ayrıştırılacaktır.

### 6.4 Müşteri Araç Takibi & Sevk Öncesi Checklist (43 Madde — Model Bazlı Şablon)
- FR-4.1: Veritabanında, araç modeline göre farklılaşabilen, çoklu (multi-template) sevk öncesi (pre-shipment) checklist şablonları tutulur; varsayılan şablon 43 madde içerir, modele özel şablonlarda madde sayısı/içeriği farklı olabilir.
- FR-4.2: Her madde `Checked` / `Unchecked` (opsiyonel not alanıyla) statüsüne sahiptir.
- FR-4.3: **Kritik iş kuralı:** Aracın atanmış şablonundaki maddelerin **tamamı** (varsayılan şablonda 43 madde) `Checked` olmadan sistem, aracın statüsünü `WITH_CUSTOMER` veya `SHIPPED` olarak değiştirmeye izin vermez. Backend seviyesinde validasyon zorunludur (sadece UI değil); kontrol madde sayısına değil, şablona bağlı toplam madde sayısına göre yapılır.
- FR-4.4: Eksik madde sayısı dashboard'da ve mobil ekranda gerçek zamanlı gösterilmelidir (örn. "40/43 tamamlandı, sevk için 3 madde kaldı").

### 6.5 Akıllı VIN (Şasi) Eşleştirme ve Arama
- FR-5.1: Sistem her araç için 17 haneli tam VIN'i saklar.
- FR-5.2: Operatör arama/hata girme ekranında son 5 haneyi girdiğinde sistem eşleşen aracı/araçları otomatik önerir (autocomplete/typeahead).
- FR-5.3: Birden fazla araç aynı son-5-hane ile eşleşirse (düşük olasılık ama olasılık dahilinde), sistem tüm eşleşen adayları listeler ve operatöre seçim yaptırır.
- FR-5.4: Arama, PostgreSQL `pg_trgm` (trigram) tabanlı index kullanarak `LIKE '%00057%'` tarzı kısmi metin sorgularını milisaniyeler içinde (P95 < 100ms, milyon+ satırda) döndürmelidir.

### 6.6 KPI / Analitik / Yerleşik "Analysis" Sekmesi
> **Karar (Onaylandı):** Power BI veya başka bir harici BI aracı entegrasyonu tamamen iptal edilmiştir. Bunun yerine web arayüzünde bağımsız, yerleşik bir **"Analysis"** sekmesi geliştirilecektir.

- FR-6.1: Sistem, Bölüm 8'de tanımlanan tüm KPI'lar için gerekli ham veriyi (event/log seviyesinde) saklamalıdır — hesaplama zamanında değil, kayıt zamanında.
- FR-6.2: Web dashboard, KPI'ları gerçek zamanlıya yakın (near real-time, ≤5 dk gecikme) gösterebilmelidir.
- FR-6.3: **Analysis sekmesi** yalnızca Manager/Admin rolüne açık, bağımsız bir web sayfasıdır; harici BI aracı gerektirmez.
- FR-6.4: Analysis sekmesi; **tarih aralığı, faz numarası, araç statüsü ve hata türüne** göre dinamik filtreleme sunmalıdır; filtreler birlikte (AND mantığıyla) uygulanabilmelidir.
- FR-6.5: Filtrelenen veriler **Pie Chart** ve **Bar Chart** ile görselleştirilmelidir — asgari: biten/devam eden işlerin dağılımı, istasyon bazlı elapsed time/MTTR grafiği, Defect Rate per Station Pareto.
- FR-6.6: Analysis sekmesinin üst kısmında bir **"Export/Print"** butonu bulunmalıdır. Butona basıldığında, o an ekrandaki filtreler ve grafiklerle birebir uyumlu, temiz, profesyonel bir **A4 print-ready PDF** çıktısı üretilmelidir.
- FR-6.7: **Karar (Onaylandı) — VIN Bazlı Filtre:** Analysis sekmesi filtre paneline, VIN'in son 5 hanesiyle arama yapılabilen bir **araç filtresi** eklenir (bkz. FR-5.2 ile aynı arama mekanizması); seçilen araç(lar) diğer filtrelerle (tarih/faz/statü/hata türü) birlikte (AND) uygulanabilir.
- FR-6.8: **Karar (Onaylandı) — Araç Bazlı Açık Hata Dağılımı:** Analysis sekmesi, filtrelenmiş her araç için açık issue sayısını **önem derecesine göre kırılımlı** göstermelidir (örn. "VIN ...00057: 8 açık hata — 3 Kritik, 2 Orta, 3 Düşük"). Bu görünüm; VIN, toplam açık hata, Kritik/Orta/Düşük sütunlarından oluşan bir tablo ve/veya öbeklenmiş (stacked) bar chart olarak sunulur.
- FR-6.9: FR-6.8'deki araç bazlı hata dağılımı, FR-6.6'daki PDF export çıktısına da dahil edilmelidir (ekranla birebir uyumlu).

## 7. Fonksiyonel Olmayan Gereksinimler (NFR)

| Kategori | Gereksinim |
|---|---|
| Performans | VIN kısmi arama P95 < 100ms; dashboard KPI sorguları P95 < 500ms |
| Ölçeklenebilirlik | Yeni faz, yeni checklist tipi, yeni istasyon eklenmesi kod değişikliği gerektirmeden (config/DB-driven) yapılabilmeli |
| Güvenilirlik | %99.5 uptime hedefi (vardiya saatlerinde); mobil uygulama zayıf saha bağlantısında graceful degradation göstermeli |
| Güvenlik | Rol bazlı yetkilendirme (RBAC), tüm statü/checklist değişiklikleri audit log'a yazılır, kritik iş kuralları backend'de enforce edilir |
| Kullanılabilirlik | Operatör bir checkpoint'i ≤3 dokunuşla tamamlayabilmeli; hata girme akışı ≤4 adımda bitmeli |
| Erişilebilirlik/Tasarım | Endüstriyel ortam için yüksek kontrast, Premium Dark/Light mod, eldivenle kullanılabilir buton boyutları (min 44x44px) |
| Mimari | Clean Architecture (Go), modüller loosely-coupled, yeni "sekme"/faz eklenmesi mevcut modülleri kırmamalı |
| Denetlenebilirlik | Tüm CRUD işlemleri kim/ne zaman/ne değişti bilgisiyle loglanmalı (append-only audit tablo) |
| Raporlama | Analysis sekmesi PDF export işlemi ≤10 sn içinde tamamlanmalı; çıktı A4 print-ready layout olmalı (filtreler ve grafikler PDF'e birebir yansımalı) |

## 8. Varsayımlar

- Faz 1'de tek fabrika/tek üretim hattı varsayılır; çoklu hat desteği mimaride öngörülür ama UI'da Faz 1'de zorunlu değildir.
- 8 faz sayısı ve checkpoint sayıları (7-8/faz) iş süreci olarak sabittir ancak DB seviyesinde konfigüre edilebilir tutulacaktır (gelecekte 9. faz eklenebilir).
- Kullanıcılar kurumsal kimlik doğrulama (SSO/AD) yerine Faz 1'de platform-native auth kullanacaktır (Faz 2'de SSO değerlendirilebilir).
- Mobil uygulama Faz 1'de online (internet bağlantılı) çalışacak şekilde tasarlanacaktır.
- Checklist şablonları (EoL ve Sevk Öncesi) araç modeline göre farklılaşabilir; her model için ayrı bir şablon tanımlanabilir (bkz. Bölüm 6.3/6.4 mimari notu).
- Sistemde yalnızca iki teknik rol (Operator, Manager/Admin) vardır; ileride ek roller gerekirse RBAC modeli genişletilebilir şekilde tasarlanacaktır.

## 9. Riskler

| Risk | Etki | Olasılık | Azaltma |
|---|---|---|---|
| Checkpoint/checklist şemasının aşırı statik tasarlanması, ileride yeni faz eklenmesini zorlaştırması | Yüksek | Orta | DB-driven dinamik şema (Bölüm ADIM 3) + versiyonlanabilir checklist şablonları |
| VIN kısmi arama performansının veri büyüdükçe düşmesi | Orta | Düşük | pg_trgm GIN index, erken yük testi |
| 43 maddelik sevk kuralının sadece UI'da enforce edilip backend'de atlanması | Yüksek | Orta | Backend seviyesinde zorunlu validasyon (FR-4.3), otomasyon testleri |
| Operatörlerin mobil arayüzü hatalı kullanması (yanlış tik) | Orta | Orta | Micro-interaction onay adımları, geri alma (undo) penceresi |
| Yerleşik Analysis sekmesinin harici BI araçlarına kıyasla esneklik kaybı yaratması | Orta | Düşük | Filtreleme kapsamını genişletilebilir tutmak; gerekirse ileride read-only export API eklemek |

## 10. Karar Günlüğü (Decision Log) — Review Cycle 1, 2026-07-13

Aşağıdaki 5 açık soru TPM tarafından karara bağlanmış ve dokümana işlenmiştir:

| # | Konu | Karar |
|---|---|---|
| 1 | Faz Ağırlıkları | Her faz eşit ağırlıkta (%12.5); 8. faz bitince araç %100 tamamlanmış sayılır (bkz. FR-2.2/2.3). |
| 2 | Checkpoint Blokajı | **Soft-warning.** Hat asla durmaz; başarısız checkpoint issue tetikler ve loglanır ama sonraki faza geçişi kilitlemez (bkz. FR-2.5). |
| 3 | Checklist Şablonları | **Multi-template onaylandı.** `checklist_templates` / `checklist_template_items` tabloları ile araç modeline özel EoL/Sevk şablonları desteklenecek (bkz. Bölüm 6.3/6.4 mimari notu). |
| 4 | Rol/Yetki Matrisi | İki rol: **Operator** (yalnızca mobil, faz/checklist doldurma, hata girme) ve **Manager/Admin** (yalnızca web, tüm takip, statü güncelleme, issue kapatma) (bkz. Bölüm 5, EPIC G). |
| 5 | Power BI / Raporlama | **Power BI tamamen iptal.** Yerine yerleşik, bağımsız bir **Analysis** sekmesi: dinamik filtreleme (tarih/faz/statü/hata türü) + Pie/Bar Chart + A4 print-ready PDF export (bkz. FR-6.3–6.6). |
| 6 | EoL Çıkış Kapısı (TC-007 netleştirmesi) | **Hard-block onaylandı.** 13 (veya şablona bağlı) maddenin tamamı `OK`/`CONDITIONAL_OK` olmadan araç EoL'den çıkamaz; eksik/hatalı madde(ler) operatöre/yöneticiye açıkça listelenir (bkz. FR-3.5–3.7). Bu, faz checkpoint'lerindeki soft-warning modelinden **bilinçli olarak farklıdır**. |
| 7 | Analysis Sekmesi — VIN Filtresi ve Araç Bazlı Hata Dağılımı | **Onaylandı.** Issue kayıtlarına önem derecesi (Kritik/Orta/Düşük) eklendi (FR-2.6); Analysis sekmesine VIN bazlı filtre (FR-6.7) ve araç başına açık hata sayısının önem derecesine göre kırılımı (FR-6.8, örn. "VIN ...00057: 8 açık hata — 3 Kritik/2 Orta/3 Düşük") eklendi; bu kırılım PDF export'a da dahil edilecek (FR-6.9). |

---

*Bu doküman, ADIM 2 (UI/UX), ADIM 3 (DB Şeması + To-Do) ve ADIM 4 (Cursor Master Prompt) için temel referans kaynağıdır ve artık nihai (finalized) kabul edilmektedir.*
