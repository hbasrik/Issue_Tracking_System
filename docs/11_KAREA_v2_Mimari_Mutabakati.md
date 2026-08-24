# KAREA — v2 Mimari Mutabakat Dokümanı

**Durum:** Onay bekliyor bekliyor değil — sorularınıza cevap alamadan ("ok lets go") ilerlememi istediniz, bu yüzden aşağıdaki her karar **önerilen/varsayılan yönde alınmıştır**. Yanlış bulduğunuz herhangi bir kararı söylerseniz sadece o kararı ve ona bağlı DDL/prompt kısmını değiştiririm, baştan yazmaya gerek kalmaz.

**Bağlam:** Yeni 76 maddelik spec, mevcut ADIM 1-4 kod tabanımızla (Prompt 1-6, tüm düzeltmelerimizle birlikte) örtüşen ama önemli noktalarda ondan **ayrışan** bir v2 mimarisi tanımlıyor. Bu doküman, ikisi arasındaki her çelişkiyi tek tek çözüp tek bir tutarlı hedef mimari ortaya koyuyor — spec'in kendi 76. maddesinin istediği tam olarak bu.

---

## Karar 1 — Faz/Checkpoint → Station/Station Step

**Çelişki:** Mevcut sistemde "8 Faz × 7-8 Checkpoint + dinamik tamamlanma yüzdesi" vardı (projenin orijinal çekirdeği). Yeni spec'te bu hiç geçmiyor, onun yerine "Stations + Station Steps" var ve sabit sayı varsayılmaması isteniyor.

**Karar:** Bunlar aynı kavram — **Station = eski Faz, Station Step = eski Checkpoint**, yeniden adlandırıldı ve sabit-8 kısıtı kaldırıldı. Tamamlanma yüzdesi mantığı aynen korunur, sadece `phase_number SMALLINT CHECK(1-8)` yerine `station_id SERIAL` (sınırsız sayıda station/step tanımlanabilir) kullanılır. Soft-warning kuralı (başarısız adım hattı durdurmaz) aynen geçerli kalır.

**Etki:** `phases`→`stations`, `checkpoints`→`station_steps`, `production_phase_progress`→`vehicle_station_step_progress`, `vehicles.current_phase`→`vehicles.current_station_id`. Mevcut trigger mantığı (tamamlanma % hesaplama, soft-warning) aynı kalır, sadece tablo/kolon adları değişir.

## Karar 2 — EOL: Tek Kapı (13 madde) → 3 Fazlı İş Akışı (16 madde)

**Çelişki:** Eski EOL: tek hard-block kapı, 13 madde, hepsi OK/CONDITIONAL_OK olunca araç çıkar. Yeni spec: Şube → Depo → Evrak olmak üzere 3 aşamalı, 16 maddelik, her aşamanın kendi onay/sevk/serbest bırakma checkbox'ları olan bir iş akışı.

**Karar:** Yeni 3 fazlı model tamamen benimsenmiştir, eskisinin yerine geçer. Ayrıntılar:
- EOL maddeleri artık `BRANCH` veya `DEPOT` fazına etiketlenir (Evrak fazının checklist maddesi yok, sadece onay checkbox'ı var).
- **Şube tamamlanınca → "Depoya Sevk Edildi"**: açık issue varsa sadece **uyarı**, engellemez (soft-warning ile aynı prensip).
- **Depo tamamlanınca → "Depodan Serbest Bırakıldı"**: açık issue varsa **engeller** (hard-block, backend seviyesinde zorunlu — sadece UI değil).
- Tüm onay/sevk/serbest bırakma/evrak checkbox'ları otomatik olarak kullanıcı+zaman damgası kaydeder, elle girilmez.
- Madde sayısı 13→16 kabul edilmiştir (yanlışlık değil, yeni Şube+Depo dağılımı nedeniyle artmış olabilir).

**Etki:** Yeni `vehicle_eol_workflow` tablosu (araç başına 1 satır: branch/depot/document onay durumları + kim + ne zaman), `checklist_template_items`'a `eol_phase` (BRANCH/DEPOT, sadece EOL tipinde) kolonu eklenir.

## Karar 3 — RBAC: 2 Rol mü, 8 Rol mü?

**Çelişki:** Mevcut sistem 2 rol (Operator, Manager/Admin) üzerine kurulu — tüm backend RBAC middleware, web route gate, mobil route gate bunun üstünde. Yeni spec 8 rol tanımlıyor (Operator, Issue Processor, Quality, Branch Operator, Depot Operator, Documentation, Admin, Manager).

**Karar:** **Şimdilik 2 rolde kalınır**, ama izin sistemi genişletilebilir tasarlanır — spec'in kendisi de "role matrix configurable kalmalı" diyor, 8 rolü hemen hard-code etmek hem büyük bir yeniden yazım hem de spec'in kendi önerisine aykırı olurdu. Somut olarak: sabit `user_role_enum` (OPERATOR/MANAGER_ADMIN) yerine `roles` ve `permissions` tabloları kurulur, kullanıcı-rol ilişkisi many-to-many olur. Faz 1'de yalnızca 2 rol satırı olur ama Faz 2'de kod değişikliği gerektirmeden yeni rol eklenebilir.

**Etki:** Bu, en büyük backend refactor'u — mevcut `user_role_enum` + basit middleware yerine tablo tabanlı RBAC. Aşamalı yapılacak (önce veri modeli, sonra middleware, en son mevcut 2 rolün bu yeni modele göçü).

## Karar 4 — Yeni "Test" Checklist Modülü (45 Madde)

**Çelişki:** Spec, EOL ve Sevk/Müşteri checklist'lerinden tamamen ayrı, 45 maddelik üçüncü bir "Test" checklist modülü tanımlıyor. Bizde böyle bir modül yoktu.

**Karar:** Gerçekten yeni, bağımsız üçüncü bir modül olarak okunmuştur. Mevcut multi-template mimarimiz (`checklist_templates`/`checklist_template_items`) zaten tam da bunun için tasarlanmıştı — `checklist_type_enum`'a üçüncü değer olarak `TEST` eklenir, sıfırdan tablo kurmaya gerek yoktur.

**Ertelenen alt-karar (2026-08-14):** Test checklist'inin bir maddesi NOT_OK/PENDING kaldığında (issue açılmamış olsa bile) herhangi bir geçişi (Depot Release, Shipment vb.) bloklayıp bloklamayacağı henüz karara bağlanmadı — "diğerleri (Shipment, Depot Release) zaten bloklama yapıyorsa şimdilik yeterli, Test'e sonra bakarız" dendi. Mevcut Prompt 10 tasarımı Test'i **sadece görünürlük/raporlama amaçlı, hiçbir geçişi bloklamayan** bir modül olarak uyguluyor. Test'ten kaynaklanan bir issue açılırsa (NOT_OK madde raporlanırsa) o issue genel açık-issue kurallarına tabi olur ve Depot Release'i zaten bloklar — yani tam bloksuz değil, sadece "madde işaretlenmeden issue açılmadan da bloklasın mı" sorusu açık kaldı.

## Karar 5 — VIN / Vehicle Number

**Çelişki:** Spec, `vehicles`'tan ayrı bir `Full_VIN_List` master tablosu öneriyor (id, vin_number, vehicle_number, active).

**Karar (mimari sadeleştirme):** Ayrı bir tablo kurmak, spec'in kendi "master veriyi tekrarlama" prensibiyle çelişir — `vehicles` zaten araç master verisidir. Bunun yerine `vehicles` tablosuna `vehicle_number` (kısa numara, unique, indeksli) kolonu eklenir. Operatör kısa numarayı girer, sistem VIN'i bulup salt-okunur gösterir — davranış aynı, gereksiz tablo tekrarı olmadan. VIN son-5-hane arama (mevcut trigram) ile bu ikisi birlikte, birbirini dışlamadan çalışır.

**Karar 5 üzerine güncelleme (Karar 10, 2026-08-19):** `vehicle_number` kolonu tamamen kaldırılmıştır — bkz. Karar 10.

## Karar 6 — Issue Statüsü: 5. Aşama (Şartlı Onay)

**Çelişki:** Mevcut sistemde issue akışı OPEN→IN_PROGRESS→DONE→APPROVED (4 statü, lineer). Yeni spec, DONE'dan sonra APPROVED **veya** Şartlı Onay (CONDITIONAL_APPROVED) olmak üzere dallanan bir akış istiyor.

**Karar:** `issue_status_enum`'a 5. değer olarak `CONDITIONAL_APPROVED` eklenir. DONE'dan hem APPROVED'a hem CONDITIONAL_APPROVED'a geçiş mümkün olur (ikisi de yalnızca Manager/Admin/Quality yetkisinde, ikisi de terminal/kapanış statüsüdür). `issue_list`'e `conditional_approve_reporter_id`/`conditional_approve_date` kolonları eklenir (approve alanlarıyla simetrik).

## Karar 7 — Issue_History: Yeni Tablo mu, Mevcut audit_logs mu?

**Çelişki:** Spec ayrı bir `Issue_History` tablosu öneriyor.

**Karar:** Gereksiz tekrar — elimizde zaten genel amaçlı, append-only `audit_logs` tablosu ve `ISSUE_STATUS_CHANGE` event tipi var (Prompt 4'te kurduk). Yeni tablo açmak yerine bu genişletilip kullanılır; `metadata` JSONB alanı spec'in istediği "comment" bilgisini zaten karşılar.

## Karar 8 — Medya/Attachment Yönetimi

**Çelişki:** Spec, `picture_url` gibi düz metin kolonları yerine genel bir `Media/Attachment` tablosu öneriyor.

**Karar:** Kabul edildi — `media_attachments` (id, entity_type, entity_id, file_name, storage_path, mime_type, file_size, uploaded_by, uploaded_at) eklenir. `issue_list.picture_url`, `issue_list.issue_picture_done_url`, `eol...check_image` gibi alanlar zamanla bu tabloya taşınır (polymorphic ilişki, DB seviyesinde FK zorlanamaz ama uygulama seviyesinde entity_type+entity_id ile doğrulanır).

**Karar 8 üzerine güncelleme (Karar 11, 2026-08-24):** polymorphic `entity_id` aynı kaldı; araç kimliği artık ayrıca gerçek bir `vin` kolonu (FK) olarak tutulur — bkz. Karar 11.

## Karar 9 — Araç 360 (Tam Görünüm) Analiz Görünümü (NEW — 2026-08-14)

**Gerekçe:** Mevcut Analysis view'ları (severity breakdown, defect rate per station, MTTR) parçalı — belirli bir aracın station ilerlemesi + EoL aşaması + Test sonuçları + Shipment checklist durumu + issue geçmişini tek bir yerde gösteren bir görünüm yoktu. Kullanıcı ilgili aracın bütün verisine Analiz tarafından bakabilmeyi istedi.

**Karar:** `vw_vehicle_full_overview` adında yeni bir view eklenir — araç başına tek satırda: mevcut station, ilerleme %, EoL aşaması (+ 3 zaman damgası), Test/Shipment checklist tamamlanma sayaçları, ve açık issue sayısı (severity kırılımlı). Web tarafında Vehicle Detail sayfasının "Overview" sekmesi ve Analiz tarafındaki VIN detay görünümü bunu kullanır.

## Karar 10 — Üretime Girmemiş Araçlar (PLANNED) + vehicle_number'ın Kaldırılması (NEW — 2026-08-19)

**Gerekçe:** Hata girme ekranında operatörün aracı kısa bir numarayla (VIN yerine) bulabilmesi isteniyordu, ama bu ihtiyaç aslında henüz üretime girmemiş (fabrikaya gelecek ~500 araçlık) bir aracın da hata-girişi için aranabilir olmasını gerektiriyordu. `vehicles` tablosu şu an sadece fiilen üretimde olan araçları (örn. 150 adet) tutuyor — 500'lük tam planı buraya baştan yüklemek Vehicles listesini anlamsız şekilde şişirirdi.

**Karar (2 parça):**
1. `vehicle_status_enum`'a `PLANNED` eklenir — VIN kayıtlı ama araç henüz hatta girmemiş. Bu 500'lük plan, `vehicles` tablosuna VIN'leriyle (bulk import ile) baştan yüklenir, `current_station_id = NULL`, `current_global_status = 'PLANNED'`. Vehicles listesi (web+mobil) varsayılan olarak `PLANNED` olanları gizler; hata girme ekranındaki arama ise PLANNED dahil tüm araçlara bakar. Bir aracın ilk istasyon-adımı işlendiğinde mevcut trigger genişletilip `PLANNED` → `IN_PRODUCTION` otomatik çevrilir.
2. **`vehicle_number` kolonu tamamen kaldırılır** (Karar 5'in tersine çevrilmesi). Gerekçe: gerçek VIN'ler OEM tarafından rastgele atanır, ayrı bir kısa-numara sistemi ek karmaşıklık + tekrarlayan bug kaynağı oldu (Issues arama kutusunda hiç çalışmıyordu). VIN (tam ya da son-5-hane trigram araması) tek kimlik alanı olarak yeterli kabul edildi — kullanıcının açık kararı.
3. `vehicle_model_id` NOT NULL kısıtı kaldırılır (nullable) — bulk import sırasında model bilgisi her zaman bilinmeyebilir, sonradan doldurulabilir.

**Etki:** Yeni migration (`vehicle_number` kolonu + index + `GET /api/v1/vehicles/resolve?vehicle_number=` endpoint'i kaldırılır), bulk VIN import endpoint'i eklenir, Vehicles listesi filtre mantığı güncellenir, hata girme ekranı arama VIN tabanlı hale getirilir.

## Karar 11 — media_attachments.vin Kolonu (NEW — 2026-08-24)

**Gerekçe:** `media_attachments` polymorphic (`entity_type` + `entity_id`) olduğu için bir aracın tüm fotoğraflarını listelemek issue / checklist / station-step satırlarına ayrı ayrı join gerektiriyordu. Vehicle Detail "bu araca ait tüm fotoğraflar" görünümü için VIN her satırda hazır olmalı.

**Karar:** `media_attachments`'a `vin VARCHAR(17) NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE` eklenir (`idx_media_attachments_vin`). Kolon önce nullable eklenir, mevcut satırlar `entity_type`/`entity_id` üzerinden parent tabloya join edilerek doldurulur, sonra NOT NULL yapılır. Yeni yüklemeler insert sırasında parent entity'nin zaten bilinen VIN'ini yazar; ekstra sorgu yok. Okuma yolu: `GET /api/v1/vehicles/:vin/media`.

## Değişmeyen / Yeniden Kullanılacaklar

Şunlara **dokunulmuyor**, olduğu gibi kalıyor: JWT auth + bcrypt, CORS allowlist mimarisi, Unit-of-Work (pgx.Tx) transaction pattern, `.cursor/rules` (commit ve environment-check kuralları), Analysis sekmesi temel yapısı (VIN×severity kırılımı, Pie/Bar chart'lar — yeni station/EOL alanlarıyla genişleyecek ama sıfırdan kurulmayacak), Docker/migration/seed altyapısı.

---

## Sonraki Adım

Şimdi bu kararlara göre güncellenmiş tam DDL'i (`12_KAREA_v2_database_schema.sql`) hazırlıyorum, ardından mevcut kod tabanının üzerine inşa eden — sıfırdan başlamayan — yeni bir Cursor prompt sırası vereceğim.