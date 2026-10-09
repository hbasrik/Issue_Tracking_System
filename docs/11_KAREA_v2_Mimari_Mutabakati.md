
# KAREA — v2 Mimari Mutabakat Dokümanı

**Durum:** Onay bekliyor bekliyor değil — sorularınıza cevap alamadan ("ok lets go") ilerlememi istediniz, bu yüzden aşağıdaki her karar **önerilen/varsayılan yönde alınmıştır**. Yanlış bulduğunuz herhangi bir kararı söylerseniz sadece o kararı ve ona bağlı DDL/prompt kısmını değiştiririm, baştan yazmaya gerek kalmaz.

**Bağlam:** Yeni 76 maddelik spec, mevcut ADIM 1-4 kod tabanımızla (Prompt 1-6, tüm düzeltmelerimizle birlikte) örtüşen ama önemli noktalarda ondan **ayrışan** bir v2 mimarisi tanımlıyor. Bu doküman, ikisi arasındaki her çelişkiyi tek tek çözüp tek bir tutarlı hedef mimari ortaya koyuyor — spec'in kendi 76. maddesinin istediği tam olarak bu.

---

## Karar 1 — Faz/Checkpoint → Station/Station Step

**Çelişki:** Mevcut sistemde "8 Faz × 7-8 Checkpoint + dinamik tamamlanma yüzdesi" vardı (projenin orijinal çekirdeği). Yeni spec'te bu hiç geçmiyor, onun yerine "Stations + Station Steps" var ve sabit sayı varsayılmaması isteniyor.

**Karar:** Bunlar aynı kavram — **Station = eski Faz, Station Step = eski Checkpoint**, yeniden adlandırıldı ve sabit-8 kısıtı kaldırıldı. Tamamlanma yüzdesi mantığı aynen korunur, sadece `phase_number SMALLINT CHECK(1-8)` yerine `station_id SERIAL` (sınırsız sayıda station/step tanımlanabilir) kullanılır. Soft-warning kuralı (başarısız adım hattı durdurmaz) aynen geçerli kalır.

**Etki:** `phases`→`stations`, `checkpoints`→`station_steps`, `production_phase_progress`→`vehicle_station_step_progress`, `vehicles.current_phase`→`vehicles.current_station_id`. Mevcut trigger mantığı (tamamlanma % hesaplama, soft-warning) aynı kalır, sadece tablo/kolon adları değişir.

**Güncelleme (2026-09-28):** API'nin döndürdüğü tamamlanma % artık istasyon adımları + checklist maddelerinin uygulanabilir kümesinden hesaplanır — Karar 15. Saklanan kolon kaldırıldı — Karar 16.

## Karar 2 — EOL: Tek Kapı (13 madde) → 3 Fazlı İş Akışı (16 madde)

**Çelişki:** Eski EOL: tek hard-block kapı, 13 madde, hepsi OK/CONDITIONAL_OK olunca araç çıkar. Yeni spec: Şube → Depo → Evrak olmak üzere 3 aşamalı, 16 maddelik, her aşamanın kendi onay/sevk/serbest bırakma checkbox'ları olan bir iş akışı.

**Karar:** Yeni 3 fazlı model tamamen benimsenmiştir, eskisinin yerine geçer. Ayrıntılar:
- EOL maddeleri artık `BRANCH` veya `DEPOT` fazına etiketlenir (Evrak fazının checklist maddesi yok, sadece onay checkbox'ı var).
- **Şube tamamlanınca → "Depoya Sevk Edildi"**: açık issue varsa sadece **uyarı**, engellemez (soft-warning ile aynı prensip).
- **Depo tamamlanınca → "Depodan Serbest Bırakıldı"**: açık issue varsa **engeller** (hard-block, backend seviyesinde zorunlu — sadece UI değil).
- Tüm onay/sevk/serbest bırakma/evrak checkbox'ları otomatik olarak kullanıcı+zaman damgası kaydeder, elle girilmez.
- Madde sayısı 13→16 kabul edilmiştir (yanlışlık değil, yeni Şube+Depo dağılımı nedeniyle artmış olabilir).

**Etki:** Yeni `vehicle_eol_workflow` tablosu (araç başına 1 satır: branch/depot/document onay durumları + kim + ne zaman), `checklist_template_items`'a `eol_phase` (BRANCH/DEPOT, sadece EOL tipinde) kolonu eklenir.

**Güncelleme 1 (2026-08-25, migration 0011): Evrak aşaması akıştan çıkarıldı.** Gerekçe: kullanıcı kararı, "şimdilik şube ve depo yeterli". `fn_enforce_document_approval` trigger'ı kaldırıldı; `document_approved_at` / `document_approved_by` kolonları silinmedi (ileride geri açılabilsin diye duruyor). `eol.document_approve` izni katalogda duruyor ama kullanılmıyor.

**Güncelleme 3 (2026-09-21): `document_approve` uykuda.** Endpoint kayıtlı kalır ama her zaman **410 Gone** döner; durum değiştirmez. İzin hiçbir role atanamaz (matris + `ReplaceGrants` reddeder). Kolonlar tarihsel kalır. Akış dışı — Karar 2 / migration 0011 ile kaldırıldı.

**Güncelleme 2 (2026-08-31, migration 0013): Nihai akış — Şube → Depo → Teslim.** Aşağıdaki hâli geçerlidir:

| Adım | Ön koşullar | Sonuç |
|---|---|---|
| **Şubeden Depoya Sevk** | EOL BRANCH + **TEST** + **SHIPMENT** checklist'lerinin tamamı OK/CONDITIONAL_OK | Araç `IN_WAREHOUSE`, aşama `DEPOT` |
| **Depodan Serbest Bırak** | EOL DEPOT maddelerinin tamamı OK/CONDITIONAL_OK **ve** açık issue olmaması (hard-block) | Aşama `COMPLETED`. **Araç durumu değişmez, `IN_WAREHOUSE` kalır.** |
| **Teslim Edildi** | Depodan serbest bırakılmış olması | Araç `DELIVERED`, `delivered_at`/`delivered_by` dolar |

Diğer sonuçlar:
- **`WITH_CUSTOMER` → `DELIVERED` olarak yeniden adlandırıldı** (enum rename, veri korundu). Gerekçe: araç müşteriye, bayiye veya satış ofisine gidebiliyor; "müşteride" ifadesi yanıltıcıydı.
- **`SHIPPED` akıştan çıktı.** Enum'da geçmiş kayıtlar için duruyor ama hiçbir geçiş onu üretmiyor.
- **`fn_check_shipment_completion` kaldırıldı** — Sevk checklist'i artık otomatik durum değiştiren bir tetikleyici değil, depoya sevki bloklayan bir ön koşul.
- Yeni izin: `eol.deliver` (şimdilik MANAGER_ADMIN'de, matristen genişletilebilir).
- Tüm kapılar hem DB trigger'ında hem Go usecase katmanında zorlanıyor (defense-in-depth). Hata cevapları yapılandırılmış: branch ship için `checklist_blockers[]`, depot release için `depot_items_remaining`.
- Butonlar UI'da her zaman görünür, koşul sağlanmadan pasif ve pasiflik gerekçesi yazılı (hangi checklist'te kaç madde kaldığı, "önce şubeden sevk", "N açık issue engelliyor", "yetkiniz yok").

## Karar 3 — RBAC: 2 Rol mü, 8 Rol mü?

**Çelişki:** Mevcut sistem 2 rol (Operator, Manager/Admin) üzerine kurulu — tüm backend RBAC middleware, web route gate, mobil route gate bunun üstünde. Yeni spec 8 rol tanımlıyor (Operator, Issue Processor, Quality, Branch Operator, Depot Operator, Documentation, Admin, Manager).

**Karar:** **Şimdilik 2 rolde kalınır**, ama izin sistemi genişletilebilir tasarlanır — spec'in kendisi de "role matrix configurable kalmalı" diyor, 8 rolü hemen hard-code etmek hem büyük bir yeniden yazım hem de spec'in kendi önerisine aykırı olurdu. Somut olarak: sabit `user_role_enum` (OPERATOR/MANAGER_ADMIN) yerine `roles` ve `permissions` tabloları kurulur, kullanıcı-rol ilişkisi many-to-many olur. Faz 1'de yalnızca 2 rol satırı olur ama Faz 2'de kod değişikliği gerektirmeden yeni rol eklenebilir.

**Etki:** Bu, en büyük backend refactor'u — mevcut `user_role_enum` + basit middleware yerine tablo tabanlı RBAC. Aşamalı yapılacak (önce veri modeli, sonra middleware, en son mevcut 2 rolün bu yeni modele göçü).

## Karar 4 — Yeni "Test" Checklist Modülü (45 Madde)

**Çelişki:** Spec, EOL ve Sevk/Müşteri checklist'lerinden tamamen ayrı, 45 maddelik üçüncü bir "Test" checklist modülü tanımlıyor. Bizde böyle bir modül yoktu.

**Karar:** Gerçekten yeni, bağımsız üçüncü bir modül olarak okunmuştur. Mevcut multi-template mimarimiz (`checklist_templates`/`checklist_template_items`) zaten tam da bunun için tasarlanmıştı — `checklist_type_enum`'a üçüncü değer olarak `TEST` eklenir, sıfırdan tablo kurmaya gerek yoktur.

**Ertelenen alt-karar (2026-08-14) — ÇÖZÜLDÜ (2026-08-31, migration 0013):** Test checklist'inin bir geçişi bloklayıp bloklamayacağı sorusu açık bırakılmıştı. **Cevap: evet, blokluyor.** Karar 2'nin 2. güncellemesiyle birlikte, **Şubeden Depoya Sevk** adımı üç checklist'in birden tamamlanmasını şart koşuyor: EOL BRANCH + **TEST** + **SHIPMENT**. Yani Test maddesi PENDING/NOT_OK kaldığı sürece (issue açılmamış olsa bile) araç depoya sevk edilemez. Aynı şey Sevk/müşteri checklist'i için de geçerli — o da artık otomatik durum değiştiren bir tetikleyici değil, sevki bloklayan bir ön koşul.

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

## Karar 11 — media_attachments'a Gerçek `vin` Kolonu (NEW — 2026-08-19)

**Gerekçe:** `media_attachments` polymorphic (`entity_type`+`entity_id`, uygulama seviyesinde doğrulanan) bir tablo (Karar 8). "Bu araca ait tüm fotoğrafları göster" gibi en sık ihtiyaç duyulacak sorgu, `entity_type`'a göre 4 farklı tabloya (issue_list, checklist_item_progress, vehicle_station_step_progress, VEHICLE) dallanan bir join gerektiriyordu — tablo büyüdükçe hem performans hem kod karmaşıklığı sorunu.

**Karar:** `media_attachments`'a gerçek, indeksli bir `vin` kolonu eklendi (`REFERENCES vehicles(vin) ON DELETE CASCADE`). Polymorphic `entity_type`+`entity_id` çifti aynen kalıyor (spesifik bağlantı için hâlâ o kullanılıyor), `vin` sadece en sık sorgulanan boyutu bilinçli olarak denormalize ediyor. Yazma sırasında (media upload endpoint'i) `vin`, ilgili entity'nin (issue/checklist item/station step) zaten bilinen vin'inden set edilir — ekstra bir lookup değil, mevcut context'ten geliyor.

**Etki:** Migration ile kolon eklenir, mevcut satırlar `entity_type`+`entity_id` üzerinden ilgili tablo join'iyle backfill edilir. Upload endpoint'leri `vin`'i de yazacak şekilde güncellenir.

**Güncelleme (2026-10-06 — galeri):** Araç galerisi (`ListGalleryByVIN`) checklist
madde fotoğraflarını (`CHECKLIST_ITEM_PROGRESS`) artık listelemez; onlar
maddenin üzerinde görünür (Karar 26). `vin` kolonu ve diğer türler
değişmedi.

**Güncelleme (2026-09-21 — güvenlik):** `GET /uploads/*` artık kimlik doğrulaması ister. Giriş yetmez: çağıranın medyanın `vin`'i üzerinde `vehicle.view` yetkisi olmalıdır. Web/mobil istemciler Bearer ile yükler. Depolanan dosya adları 16 bayt `crypto/rand` hex (tahmin edilemez); sıralı değildir.

## Karar 12 — Token iptali (`tokens_valid_from`) (NEW — 2026-09-21)

**Gerekçe:** JWT'ler durumsuz ve 24 saat geçerliydi. Kullanıcı pasife alındığında veya şifresi değiştiğinde elindeki token süresine kadar çalışmaya devam ediyordu.

**Karar:** `users.tokens_valid_from TIMESTAMPTZ NOT NULL DEFAULT now()` (migration 0029). Pasifleştirme, silme (satır kalkınca zaten geçersiz), şifre değişimi/sıfırlama ve rol değişiminde damga `now()` olur. Auth katmanı JWT `iat` damgadan eskiyse 401 döner (PK üzerinden tek satır okuma). Yenileme token'ı D3'te; bu sadece anında iptal.

**JWT_SECRET:** Boş veya 32 karakterden kısa anahtarla süreç başlamaz (`openssl rand -base64 32`). Zayıf docker-compose / `.env.example` varsayılanı yok. Bu değişiklik + `tokens_valid_from` birlikte herkesin bir kez yeniden giriş yapmasını gerektirir (beklenen).

**Güncelleme (2026-09-25 — bcrypt cost + parola kuralı):** Yeni hash'ler bcrypt cost **12** (`usecase.bcryptCost`). Eski cost-10 hash'ler girişte sessizce yeniden hash'lenir (`UpdatePasswordHash` — `tokens_valid_from` / `must_change_password` dokunulmaz). Parola kuralı: min 8 + harf/rakam; yaygın/kolay tahmin (denylist: password, karea, sifre, parola, 123456, …) ve e-posta yerel kısmı / ad yasak; create, reset ve self-change aynı `ValidatePassword` yolunu kullanır. Min uzunluk bilinçli yükseltilmedi (yenileme token'ı yok).

## Karar 13 — Issue listesi kart düzeni (NEW — 2026-09-21)

**Karar:** Issues listesi tablo/accordion yerine tek uyarlanabilir kart
bileşenidir. Layout sabitleri ve süre biçimlendirmesi
`shared/issueCardLayout.ts` altında tek kaynaktır (web + mobil).
Bildirim zamanı = `issue_list.issue_date` (`IssueDate`); açık kalma
süresi anlık hesaplanır (kolon yok). Detay ayrı rota:
`/issues/:id` (web), mevcut `IssueDetail` ekranı (mobil).

**Güncelleme (2026-09-22 — pano canlılığı):** Aynı Issues sayfasında 30 sn
sessiz yenileme, bayat-veri uyarısı, uzun ömürlü `/uploads` önbelleği,
yalnızca gerçekten yeni CRITICAL kayıt için ses+vurgu, detay dönüşünde
kaydırma/filtre korunumu. Yüklemede görsel `image.Decode` doğrulaması
(`ErrUndecodableImage`). Medya dosya adları içerik-adresli kaldığı için
`Cache-Control: private, max-age=31536000, immutable`.

**Güncelleme (2026-09-22 — ölçek):** `GET /issues` limit/offset + keyset
(`before_date`/`before_id`); pano ilk parça 50; 30 sn yenileme yalnız ilk
parçayı tazeler. Varsayılan filtre OPEN+IN_PROGRESS. Web satır
sanallaştırma (`@tanstack/react-virtual`); mobil `@shopify/flash-list`.
Index’ler: `idx_issue_list_reporter`, `idx_issue_list_issue_date`
(migration 0030). Sıra `issue_date DESC, id DESC` (kart `IssueDate` ile
hizalı).

## Karar 14 — Kullanıcıya gösterilen hata metni (NEW — 2026-09-28)

**Gerekçe:** Web, backend'in İngilizce `error` metnini ve tarayıcının
`Failed to fetch` gibi teknik mesajlarını olduğu gibi gösteriyordu; 5xx
hataları da "çevrimdışısınız" diye yanlış sınıflanıyordu.

**Karar:** İstemci (web + mobil) hiçbir zaman ham backend/tarayıcı
metni göstermez. Tek yol `shared/i18n/errors.ts` (`describeApiError` /
`translateApiError`) ve web/mobil `ApiErrorText`:
- Sınıflama `shared/networkError.ts`: zaman aşımı (`isTimeoutError`,
  istemci 15 sn / web yüklemede 120 sn → `ApiError(0, "request timed out")`),
  bağlantı yok (`ApiError(0, "network unavailable")`), sunucu (`isServerError`,
  ≥500). Kuyruk mantığı için `isTransportError` anlamı değişmedi.
- Bilinen backend sentinel'leri ve dinamik mesajlar TR/EN anahtara eşlenir;
  eşlenmeyen HTTP hatası duruma göre genel metne düşer (400/422 → istek
  işlenemedi, 404, 409, 413, 429 …). Yalnızca istemcide üretilmiş (status'suz)
  hata metni olduğu gibi geçer — bunlar zaten çevrilmiş olur.
- `request_id` yalnız 5xx'te "Hata kodu" olarak gösterilir; 4xx'te gösterilmez.
- 401 mevcut davranış: oturum temizlenir, girişe yönlendirilir.
- Liste/panel yüklemesi başarısızsa ekran "veri yok" veya sıfır göstermez;
  web `LoadErrorState` (başlık + çevrilmiş neden + Tekrar dene) gösterir.
  Veri ekrandayken yenileme başarısızsa "güncel olmayabilir" uyarısı çıkar.

**Sevk öncesi uyarılar:** `GET /vehicles/{vin}/shipment-readiness`
uyarılarına `item_no`, `item_text`, `issue_description`, `read_failed`
alanları eklendi; istemciler satırı bu alanlardan çevirerek kurar.
`message` eski istemciler için Türkçe yedek olarak kalır; checklist okuma
hatasının iç metni artık yanıtta değil, yalnız logda.

## Karar 15 — Aşama uygulanabilirliği: yeni madde, uyarı ve ilerleme tek kural (NEW — 2026-09-28)

**Gerekçe:** Şablona sonradan eklenen maddeler aşamasını geçmiş araçlara da
dağıtılıyordu (`incomplete` kapsamı PENDING satırı olan teslim edilmiş aracı da
seçiyordu) ve sevk öncesi uyarı, katalogdaki her aktif maddeyi araç durumuna
bakmadan "bekliyor" listeliyordu. Teslim edilmiş bir araç %100 görünürken
"şu maddeleri işaretleyin" diyordu; ilerleme % yalnız istasyon adımlarını,
uyarı ise checklist'leri sayıyordu.

**Aşama:** Her madde, onu bekleyen kapının aşamasına aittir (migration 0022):
istasyon adımları + TEST + SHIPMENT + EOL BRANCH → şubeden sevk
(`branch_shipped_at`); EOL DEPOT → depodan serbest bırakma
(`depot_released_at`). Damga doluysa veya araç `DELIVERED`/`SHIPPED` ise o
aşama geçilmiştir.

**Karar — uygulanabilir küme** (`backend/internal/repository/postgres/stage_applicability.go`, tek kaynak):
- Aşama geçilmemiş: her aktif madde sayılır; satırı olmayan madde PENDING
  sayılır (kapı ile aynı).
- Aşama geçilmiş, teslim edilmemiş: hiç değerlendirilmemiş satırlar (satır yok
  veya PENDING) sayılmaz — aşamadan sonra eklenmişlerdir. Değerlendirilmiş
  NOT_OK/REWORK satırları gerçek bulgudur, sayılmaya devam eder.
- Teslim edilmiş (`DELIVERED`/`SHIPPED`): yalnız geçen (OK/CONDITIONAL_OK)
  satırlar kalır; geçmiş donmuştur.

**Uygulama:**
- **Dağıtım:** `InsertPendingForVehicles` yeni maddeyi yalnız o maddenin
  aşamasını henüz geçmemiş araçlara yazar. Kapsam (`not_started` /
  `incomplete`) bu kümeyi daraltmaya devam eder; aşama kuralı zorunlu filtredir.
  Etki önizlemesi (`/items/impact?action=create&eol_phase=`) ve eksik araç
  listesi aynı kuralı kullanır. Hatta duran araç yeni SHIPMENT maddesini alır;
  şubeye sevk edilmiş veya teslim edilmiş araç almaz.
- **Sevk öncesi uyarı:** `shipment-readiness` checklist maddelerini uygulanabilir
  kümeden okur; `DELIVERED`/`SHIPPED` araç `ready: true`, uyarısız döner.
  Açık istasyon adımları `STATION_STEPS_INCOMPLETE` (`remaining_count`) olarak
  eklenir. Web ve mobil bu araçlarda paneli göstermez.
- **İlerleme %:** Karar 1'deki "yalnız istasyon adımı" tanımının yerine geçer:
  `geçen / uygulanabilir` (istasyon adımları + checklist maddeleri), okuma
  anında hesaplanır (`vehicleProgressSQL`). `%100 ⇔ açık madde yok`.
  API'deki `TotalProgressPercentage` alanı hesaplanan değeri taşır. Eski
  saklanan kolon ve onu okuyan view kaldırıldı — Karar 16.

- **Checklist sekmesi:** `GET /vehicles/{vin}/checklist/{type}` her aktif
  maddeye `StageClosed` bayrağı ekler (uygulanabilir kümenin tam tümleyeni).
  Web ve mobil bu maddeleri ana listeden çıkarır; altta varsayılan kapalı
  "Bu aşama tamamlandı (n)" bölümünde, işaretlenemez hâlde gösterir. Pasif
  maddeler bölümüyle aynı düzendedir. Sayaç, ilerleme çubuğu ve "n madde kaldı"
  bu maddeleri saymaz (`shared/checklistActive.ts` `splitChecklistByActive`).
- **Kapılar ve oranlar:** Go kapı sayaçları (`EvaluateChecklistGate`,
  `branch_eol_remaining` vb.) ve depo sıralaması (`EnforceEOLDepotSequencing`)
  `StageClosed` maddeleri atlar. DB'deki depo sıralama trigger'ı da aynı şeyi
  yapar (migration 0031). Analiz/ana ekran EOL oranları (`CompletionPercent`,
  `stagePerformance`, `EOLChecklistCounts`) da bu satırları dışlar. Şube ve
  depo kapısı trigger'ları (0022) değişmedi: yalnız aşama geçişinde çalışırlar
  ve o anda kapanmış madde olamaz.

**Mevcut yanlış satırlar:** Silinmez, işaretlenmez; ayrı durum veya bayrak
eklenmez. Kural onları uyarıdan, ilerlemeden, sayaçlardan ve kapılardan
dışlar, checklist sekmesinde kapalı bölümde gösterir. Yeni dağıtım da
aşamayı geçmiş araca yazmadığı için tekrar oluşmazlar (`docs/16` A26).

## Karar 16 — İlerleme % tek kaynak: saklanan kolon kaldırıldı (NEW — 2026-09-30)

**Gerekçe:** İki ayrı ilerleme sayısı vardı. `vehicles.total_progress_percentage`
trigger (`fn_recalculate_vehicle_progress`) ve Go (`ComputeProgress` +
`UpdateProgress`) tarafından iki kez yazılıyor, yalnız istasyon adımlarını
sayıyordu. Uygulama ise Karar 15'teki uygulanabilir kümeden hesaplanan değeri
gösteriyordu. Kolonun tek okuyucusu `vw_vehicle_completion_split` idi ve depo
maddeleri açık araçları "tamamlandı" sayıyordu (test veritabanında 12
"tamamlandı", gerçekte 8).

**Karar:** Kolon ve view kaldırıldı (migration 0032). Doğru bir saklanan değer
için aşama kuralını PL/pgSQL'de ikinci kez yazmak gerekirdi; bu projede
defalarca ayrışan desen tam olarak buydu. Kolonu `station_progress_percentage`
adıyla tutmak da, kimsenin okumadığı ve iki yerden yazılan ikinci bir sayıyı
yaşatmak olurdu.

- **Tek tanım:** `vehicleProgressSQL` (`stage_applicability.go`). Kapsam:
  istasyon adımları + EOL fabrika (BRANCH) + TEST + SHIPMENT + EOL DEPOT
  maddeleri. Depo maddeleri depodan serbest bırakma aşamasına aittir; araç
  şubeden sevk edilmiş olsa bile depo maddeleri tamamlanmadan %100 çıkmaz.
  Yeni şablon maddesi, `InsertPendingForVehicles` çalışmadan bile (satırı olmayan
  madde PENDING sayılır) aşaması açık araçların yüzdesini düşürür.
- **Trigger kalır, yüzde yazmaz:** `fn_recalculate_vehicle_progress` yalnız
  `current_station_id`'yi ve PLANNED → IN_PRODUCTION geçişini yönetir.
- **Go:** `ComputeProgress` / `UpdateProgress` yerine `ComputeCurrentStation` /
  `UpdateCurrentStation`; istasyon işaretleme yanıtındaki yüzde, aracın
  yeniden okunmasından (`GetByVIN`) gelir.
- **Eski migration'lar:** 0001/0002'deki view oluşturma, kolon yoksa atlanır;
  böylece bütün `*.up.sql` dosyalarının yeniden uygulanması v32'de de hatasız
  geçer. Rollback (0032 down) kolonu istasyon-bazlı değerle ve view'ı geri
  kurar.
- **Bekleyen riskler (bu kararda değişmedi):**
  (1) Yüzdedeki istasyon kısmı aracın `vehicle_station_step_progress`
  satırlarını sayar, `station_steps.is_active`'e bakmaz. Uygulamada adım
  ekleme/pasifleştirme akışı yok (yalnız seed), bugün etkisi yok.
  (2) Güncel istasyon hâlâ iki yerde hesaplanır (trigger + Go
  `ComputeCurrentStation`); "hepsi bitti" durumunda trigger son aktif
  istasyonu, Go aracın son satırının istasyonunu yazar.

## Karar 17 — Sorumlu süreç ekrandan gizli; sınıflandırma düzeltmeleri geçmişte (NEW — 2026-09-30)

**Gerekçe:** 10 kusur tipinin 6'sında varsayılan süreç yok (01, 03, 04, 07,
09, 99). Canlıda 27 hatanın 22'sinde süreç boş (%81,5). Bu veriyle
"sürece göre hata" grafiği ve hata detayındaki süreç satırı yanıltıcıydı.

**Karar:**
- **Süreç yalnız arayüzden kalktı.** Hata detayı (web + mobil), hata
  yazdırma, hata CSV'si, Analiz grafiği, Analiz kapsamındaki "süreci
  atanmamış" oranı, Analiz CSV'si ve yazdırması süreci göstermez.
- **Veri akışı aynen sürer.** `issue_list.responsible_process_id`, kusur
  tipinin varsayılanından otomatik atama ve audit satırı değişmedi. Backend
  analiz alanları (`DefectByProcess`, `ProcessUnassigned`) ve katalogdaki
  varsayılan süreç yönetimi de duruyor; kalite ekibi varsayılanları oradan
  girecek.
- **Düzenleyiciler süreci göndermez** (2026-10-01, Karar 19 ile
  değişti; önceden gizli olarak gönderiliyordu). Kayıtlı süreç korunur;
  tip değişince süreç yeni tipin varsayılanına (yoksa boşa) çekilir.
- **Sınıflandırma düzeltmeleri hata geçmişinde.**
  `ListIssueStatusHistory` `ISSUE_STATUS_CHANGE` ile
  `ISSUE_CLASSIFICATION_CHANGE` satırlarını aynı zaman çizelgesinde döner
  (`Kind` = `STATUS` | `CLASSIFICATION`). Parça ve tip id'leri katalogdan
  TR/EN adlara backend'de çözülür (`audit_classification.go`); aynı
  çözümleme Aktivite ekranında da kullanılır. Süreç alanı çözümlemede
  atlanır, hiçbir yerde gösterilmez.
- **Yeniden açma:** kalite ekibi altı tipe varsayılan süreç tanımladığında
  arayüz geri açılır; altı tip `docs/16` A33'te.

## Karar 18 — Pasif bölge kapanır; "Diğer" kendi bölgesinde ve korumalı (NEW — 2026-10-01)

**Gerekçe:** Katalog incelemesinde (2026-10-01) Body pasife alındığında
14 parçanın hepsi aktif parça listesinde dönmeye devam etti; hata
açılabildi, pasif bölgeye yeni parça bile eklenebildi. "Diğer" (99-99)
de Body altında durduğu için Body kapanırsa katalogdaki eksikleri yakalayan
seçenek de kaybolacaktı.

**Karar:**
- **Pasif bölgenin parçaları pasif sayılır.** `DefectPart.ZoneIsActive`
  bölgenin durumunu taşır; `Selectable()` = parça aktif VE bölge aktif.
  Aktif parça listesi (`/defect-catalog/parts`, web ve mobil formlar ile
  mobil önbellek bunu kullanır) yalnız seçilebilir parçaları döner. Hata
  oluşturma pasif bölgedeki parçayı `selected part's zone is inactive` ile
  reddeder. Parçanın kendi `is_active` bayrağına dokunulmaz: bölge yeniden
  açılınca parçalar eski durumlarına döner.
- **Pasif bölgeye parça eklenmez.** Yeni parça, başka bölgeden taşıma ve
  "Diğer"den kataloğa alma (promote) pasif bölgeyi reddeder. Pasif
  bölgedeki mevcut bir parçayı düzenlemek (ad, pasife alma) serbest.
- **Mevcut hatalar etkilenmez.** Bağlantı, `defect_code` ve ad anlık
  görüntüleri aynı kalır.
- **"Diğer" kendi bölgesinde (99), bölgeden bağımsız değil.** İki yol
  vardı: `zone_id`'yi boş bırakılabilir yapmak ya da ayrı bölge. Boş
  bölge; `zone_id NOT NULL` FK'sini, parça listelerindeki JOIN'leri, web
  ve mobilde "önce bölge seç" akışını ve paylaşılan doğrulamayı
  (`report.zoneRequired`) değiştirmeyi gerektirirdi. Ayrı bölge yalnız veri
  migration'ı (0033): parça id'si ve kodu aynı kalır, mevcut hataların
  sınıflandırması ve `99-99-xx` kodları bozulmaz. Tek görünür fark: eski
  "Diğer" hatalarında bölge Body yerine "Diğer" görünür.
- **"Diğer" satırları korumalı.** Bölge 99, parça 99-99 ve tip 99 pasife
  alınamaz, silinemez, kodu değiştirilemez; parça 99-99 başka bölgeye
  taşınamaz ve bölge 99'a başka parça konamaz
  (`the Other catalogue rows are protected`). Ad değiştirmek serbest.
- **Filtreler pasifi de gösterir.** `?include_inactive=1` tüm satırları
  `IsActive` / `ZoneIsActive` ile döner; Hatalar filtreleri (web ve mobil)
  pasif değerleri "(pasif)" etiketiyle listeler, eski hatalar onlarla da
  süzülebilir.

## Karar 19 — Değişmeyen alan doğrulanmaz (NEW — 2026-10-01)

**Gerekçe:** Katalog incelemesinde pasife alınan süreç, parça ya da tip,
o değeri taşıyan hatanın sınıflandırmasını tamamen kilitledi: kullanıcı
başka bir alanı düzeltmek istese bile kayıtlı (pasif) değer yeniden
doğrulanıp reddediliyordu.

**Karar:**
- **Pasif kontrolü yalnız değişen alanda.** `UpdateClassification` parçayı
  yalnız parça id'si değiştiyse (`Selectable()`: parça ve bölge aktif),
  tipi yalnız tip id'si değiştiyse aktiflik açısından doğrular. Kullanıcı
  kayıtlı pasif değeri koruyabilir.
- **Süreç isteğe bağlı alan.** `responsible_process_id` istekte yoksa
  kayıtlı süreç korunur (tip değiştiyse yeni tipin varsayılanı yazılır,
  oluşturmadaki gibi). Açıkça gönderilirse o değer yazılır; değişmemişse
  doğrulanmaz, `null` süreci boşaltır. Eski istemciler (süreci geri
  gönderen) bu yüzden kırılmaz.
- **Anlık görüntü ve kod korunur.** Parça ya da tip değişmediyse
  `defect_part_name_*` / `defect_type_name_*` anlık görüntüleri SQL'de
  (`CASE WHEN … IS DISTINCT FROM …`) olduğu gibi kalır; ikisi de
  değişmediyse `defect_code` da aynı kalır.
- **Ekranda:** web ve mobil düzenleyici kayıtlı pasif bölge/parça/tipi
  "(pasif)" etiketiyle seçenek olarak tutar; değiştirilirse yalnız aktif
  seçenekler sunulur. Reddedilen değişiklikte sebep açık metinle görünür
  (parça pasif / bölge pasif / pasif bölgeye parça eklenemez / "Diğer"
  korumalı).

## Karar 20 — Katalog kod biçimi ve ad tekliği (NEW — 2026-10-01)

**Gerekçe:** Parça ve kusur tipi kodu elle yazılıyordu; Body bölgesine
"40-77" ve "ZZZ" kodlu parça eklenebildi. Kod hata kayıtlarına anlık
görüntü (`defect_code`) olarak yazıldığı için yanlış kod sonradan
düzeltilse bile eski kayıtlarda kalır. Aynı bölgede "Test Kapı Kolu" ve
"test kapı kolu " da ayrı parça olarak kabul ediliyordu.

**Karar:**
- **Parça kodu `<bölge kodu>-NN`** (NN = 01–99, iki hane). Ön ek seçilen
  bölgenin kodu olmalı; uymazsa `part code must be the zone code, a dash
  and two digits: expected 10-NN` ile 400 döner, ekranda beklenen ön ek
  yazılır. 99-99 ("Diğer") yalnız bölge 99'da durur (Karar 18).
- **Kusur tipi kodu iki hane** (01–99); uymazsa 400.
- **Ad tekliği:** aynı bölgedeki iki parça, ya da herhangi iki kusur tipi
  aynı TR veya EN adı taşıyamaz (409). Karşılaştırma büyük/küçük harfe,
  baştaki/sondaki ve tekrarlanan boşluğa duyarsızdır; noktalı/noktasız i
  aynı sayılır (KAPI = kapı, HINGE = hinge). Pasif satırların adı da
  dolu sayılır. Farklı bölgelerde aynı parça adı serbesttir ("Conta").
- **Uygulama katmanında, DB kısıtı yok.** Kurallar oluşturma, düzenleme
  ve "Diğer"den kataloğa almada `DefectCatalogAdmin`'de uygulanır. DB'de
  benzersiz indeks yok; canlıda olabilecek eski tekrarlar bir migration'ı
  kırmasın diye.
- **Eski kayıtlar düzenlenebilir kalır (Karar 19 ilkesi):** düzenlemede
  kod yalnız kod ya da bölge değiştiyse, ad yalnız ad ya da bölge
  değiştiyse denetlenir. Eski biçimli kodu ya da tekrarlanan adı olan bir
  satır yeniden adlandırılabilir, pasife alınabilir.
- **Öneri:** yönetim sayfası yeni parçada seçilen bölgeye göre bir sonraki
  boş kodu (bölgedeki en büyük NN + 1), yeni tipte bir sonraki boş iki
  haneli kodu önerir. Alan elle değiştirilebilir; biçim ve ad tekrarı
  istemcide de anında gösterilir, son söz sunucudadır.
- **Seed yalnız ekler:** `05_defect_catalog.sql` `ON CONFLICT DO NOTHING`;
  yeniden çalıştırma kalite ekibinin katalog düzenlemelerini geri almaz.

## Karar 21 — Mobil katalog tazeleme ve kuyrukta sınıflandırma düzeltme (NEW — 2026-10-01)

**Gerekçe:** Mobil referans önbelleği yalnız girişte, ağ geri gelince ve
arka plandan dönüşte (15 dk eskiyse) tazeleniyordu; uygulama ön planda
açık kaldıkça katalog değişikliği hiç gelmiyordu. Kuyruktaki bir kayıt,
parçası pasife alındığı için reddedilince "gönderilemedi" olarak kalıyor,
operatör kaydı fotoğrafıyla birlikte silip baştan girmek zorunda
kalıyordu.

**Karar:**
- **Ön planda düzenli tazeleme:** `ReferenceCacheProvider` uygulama
  açıkken dakikada bir saati günceller ve anlık görüntü 15 dakikayı
  (`REFERENCE_REFRESH_MS`) geçtiyse yeniden çeker. Arka plandaki uygulama
  çekmez; ön plana dönüşte mevcut kural geçerli. Aynı anda tek çekim
  yapılır.
- **Elle tazeleme:** sınıflandırma alanlarının (hata bildirme formu, hata
  düzenleme, kuyruk düzeltme) üstünde "Katalog N dk önce güncellendi"
  satırı ve "Kataloğu yenile" düğmesi.
- **Red sebebi açık:** kuyruktaki kaydın parçası/tipi seçilebilir katalogda
  yoksa ya da sunucu `selected catalogue item is inactive` /
  `selected part's zone is inactive` ile reddettiyse kart "Bu parça
  katalogdan kaldırıldı, lütfen yeni bir parça seçin." (tip, ikisi ya da
  belirsiz durum için eşdeğer metinler) gösterir. Tazeleme sonrası
  kaldırılan parça, kayıt gönderilmeden de işaretlenir.
- **Kuyrukta düzeltme:** kartta "Sınıflandırmayı düzelt" aynı
  sınıflandırma alanlarını açar; hâlâ aktif olan değer seçili kalır,
  kaldırılan temizlenir. "Kaydet ve gönder" yalnız payload'ın parça/tip ve
  "Diğer" serbest metin alanlarını değiştirir, kaydı bekleyen duruma alır
  ve hemen gönderir. Fotoğraf kopyası, açıklama, VIN, istasyon ve
  idempotency anahtarı (kuyruk id'si) aynı kalır; reddedilen oluşturma
  sunucuda satır bırakmadığı için aynı anahtar güvenlidir.
- **Sınır:** hata sunucuda oluşmuş, yalnız fotoğrafı bekleyen kayıtta
  (`issueId` dolu) sınıflandırma kuyruktan değiştirilmez; o kayıt hata
  detayındaki sınıflandırma düzenleyicisiyle düzeltilir.

## Karar 22 — Referans seed'leri yalnız ekler, kararlı anahtarla eşleşir (NEW — 2026-10-01)

- **Kural:** `database/seed/01`, `02`, `03` ve `05` mevcut satıra dokunmaz;
  yeniden çalıştırıldığında yalnız eksik satırı ekler. Ad, metin, sıra ve
  `is_active` hiçbir koşulda seed tarafından yazılmaz. `06` yalnız
  geliştirme verisidir, bu kuralın dışındadır.
- **Eşleştirme anahtarı kararlı olmalı:** görüntüleme sırası anahtar
  olamaz. Checklist maddelerinde `item_no` yeniden sıralamayla değiştiği
  için anahtar `checklist_template_items.seed_key` (migration 0034):
  satır oluşturulurken metnin md5'i, sonra hiç güncellenmez. Yönetim
  ekranından eklenen maddede NULL. Eksik seed maddesi asıl `item_no`
  boşsa oraya, doluysa son maddenin arkasına eklenir.
- **İstasyon/adım:** `stations.sequence_no` ve `(station_id,
  sequence_no)` hiçbir kod yolunda değişmediği için anahtar olarak
  kalır; adımlar istasyonu ada göre değil `sequence_no` ile bulur.
  Tek istisna: 01, migration 0002'nin koyduğu dokunulmamış `Station N`
  yer tutucusunu üretim adıyla değiştirir (temiz kurulum).
- **Sınır:** seed'in eklediği madde/adım için mevcut araçlara PENDING
  ilerleme satırı açılmaz; canlıda eksik madde yönetim ekranından
  eklenir.

## Karar 23 — Checklist bölümleri içeriğe göre, madde kimliğiyle atanır (NEW — 2026-10-02)

- **Sorun:** migration 0024 `section_key` değerini eski yer tutucu
  maddeler için yazılmış `item_no` aralıklarından doldurdu; gerçek
  maddeler aynı numaralara geldiği için bölüm adları içerikle
  ilgisiz kaldı.
- **Kural:** bölüm ataması hiçbir zaman `item_no` ya da numara
  aralığıyla yapılmaz. Toplu atama, maddenin kendi kimliği olan
  `seed_key` ile tek tek yapılır (migration 0035); yeniden sıralama ve
  metin düzenlemesi atamayı başka maddeye kaydırmaz. Yönetim ekranında
  atama zaten madde bazında.
- **Katalog:** Test 7 bölüm, içeriğe göre (Soğuk Sıkma Testi; BCM / EE
  Fonksiyon Kontrol; Sürüş Testi; Fren Testi; Rot Testi; Sıcak Sıkma
  Testi; Mühendislik & Kalite Kontrol). EOL'de bölüm yok. Eski
  anahtarlar katalogdan ve dil dosyasından çıkarıldı; hâlâ eski anahtar
  taşıyan madde 0035 ile bölümsüz kalır.
- **Sevk süreç sırasıyla gruplanır (2026-10-02, migration 0036):** Sevk
  listesi adım adım yapılır, sıra anlamlıdır. 0035'in kategori bölümleri
  adımları dağıttı (liste 17. maddeden başlıyordu). Sevk artık ardışık
  adımlardan oluşan 6 bölüm: İç Montaj & Kesim İşleri; Şasi & Dış
  Donanım; Logo, Etiket & İç Parça; Kauçuk, Kaplama & Küçük Montaj; Fren
  Ayarı & Sızdırmazlık; Son Ayar & Kontroller. Bölümler ardışık olduğu
  için ekran sırası madde sırasıyla aynıdır. Atama yine `seed_key` ile
  madde madde yapılır; numaralar yalnızca bugünkü sırayı tarif eder.
  0035'in 7 Sevk kategori anahtarı katalogdan çıkarıldı; hâlâ onları
  taşıyan başka Sevk maddesi 0036 ile bölümsüz kalır.
- **Birlikte değişir:** `shared/checklistSections.ts` (anahtar + sıra),
  `shared/i18n/messages.ts` (TR/EN ad), `database/seed/03` (madde
  başına anahtar/sıra) ve atamayı canlıya taşıyan migration.
- **Yayın sırası:** web ve migration birlikte yayına alınır. Eski web
  yeni anahtarı, yeni web eski anahtarı ham metin olarak gösterir;
  veri ve kapılar etkilenmez. Mobilde katalog uygulamanın içinde
  derlendiği için yeni sürüm yüklenene kadar eski uygulama bölüm
   başlığını ham anahtar olarak (`cold_drag` gibi) gösterir.

## Karar 24 — Araç zaman çizelgesi: her durum değişikliği yazılır, tek listede okunur (NEW — 2026-10-02)

- **Kural (yazma):** aracın `current_global_status` değerini değiştiren
  her yol `STATUS_CHANGE` yazar: beklemeye alma / çıkarma (uygulama),
  depoya sevk (`fn_enforce_branch_shipment`, migration 0037,
  `metadata.trigger = eol_branch_ship`), teslim (`fn_enforce_eol_deliver`,
  `eol_deliver`) ve geliştirme sıfırlaması (uygulama,
  `metadata.dev_reset = true`). Satır yalnızca durum gerçekten
  değiştiğinde yazılır. Geçmiş kayıtlar sonradan doldurulmaz: 0037
  öncesi depoya sevklerde yalnız aşama satırı vardır.
- **Kural (okuma):** araç detayındaki denetim bölümü
  `GET /vehicles/{vin}/timeline` ile durum, hat sonu aşama, checklist,
  hata durumu ve hata sınıflandırma satırlarını tek listede, en yeni
  üstte gösterir (en fazla 1000 satır, fazlası `truncated`). Sunucu ham
  değerleri ve metadata'dan çıkarılmış bağlamı (madde no/metni, hata no,
  çözülmüş sınıflandırma, eylem, tetikleyici, bekleme nedeni,
  sıfırlama işareti) döndürür; cümleye çevirme istemcidedir ve web ile
  mobil aynı `shared/vehicleTimeline.ts` kodunu kullanır. Ekranda ham
  enum değeri gösterilmez.
- **Gösterim:** ardışık checklist işaretlemeleri (aynı liste, aynı kişi,
  en az 3) tek satırda toplanır ve açılabilir; bilinen değer kümesi
  dışındaki bir değer "Bilinmeyen değer" olarak adlandırılır; olay türüne göre filtre vardır.
  Geliştirme sıfırlaması satırları ayrı etiket taşır; sıfırlamadan önceki
  satırlar silinmez, etiket neden hâlâ durduklarını açıklar.
  `status-history` uç noktası başlıktaki "son durum değişikliği" damgası
  için kalır.

## Karar 25 — Yönetim işlemleri denetim kaydına yazılır; kullanıcı/yetki olayları yalnız kullanıcı yöneticisine görünür (NEW — 2026-10-02)

- **Kural (yazma):** yönetim işlemleri `audit_logs`'a araçsız
  (`vin` NULL) yazılır; migration 0038 dört olay türü ekler:
  `USER_ADMIN_CHANGE` (kullanıcı oluşturma, rol ataması, aktif/pasif,
  silme, yönetici şifre sıfırlaması, giriş kilidinin elle açılması),
  `ROLE_PERMISSION_CHANGE` (rol oluşturma, izin verme/alma),
  `CHECKLIST_TEMPLATE_CHANGE` (şablon maddesi ekleme, metin / hat sonu
  aşaması / bölüm düzenleme, aktif-pasif, silme, sıralama) ve
  `DEFECT_CATALOG_CHANGE` (bölge, parça, kusur tipi, süreç: ekleme, ad /
  kod / bölge / varsayılan süreç / sıra değişikliği, aktif-pasif, silme,
  sıralama; "Diğer"den katalog satırı oluşturma). Satır, değişikliği yapan
  işlemle aynı transaction'da yazılır: değişiklik geri alınırsa kayıt da
  kalmaz. Hiçbir şey değişmediyse satır yazılmaz.
- **Kayıt içeriği:** `performed_by` kimin, `event_at` ne zaman;
  `metadata` = eylem, nesne türü ve kimliği, nesnenin adı (kullanıcıda ad
  + e-posta), değişen her alan için eski ve yeni değer. Değerler yazma
  anındaki adlarıyla saklanır (rol adı, bölge/parça/tip/süreç TR+EN adı,
  madde metni); böylece sonradan silinen ya da adı değişen nesneler de
  okunur kalır. `old_value` / `new_value` NULL kalır. Sıralamada yalnız
  sürüklenen öğeler (göreli sırasını koruyan en uzun dizinin dışında
  kalanlar) eski → yeni sıra numarasıyla yazılır; aradaki kayan
  satırlar listelenmez.
  **Şifre ve hash hiçbir alana yazılmaz:** şifre sıfırlamada yalnızca
  eylem ve kimin şifresi olduğu kaydedilir; oluşturmada geçici şifre
  kayda girmez.
- **Kullanıcı silme:** yönetim olayları da "iş geçmişi" sayılır
  (`WorkAuditEventTypes`): yönetim işlemi yapmış bir hesap silinemez,
  pasife alınır (Karar 7 ile aynı gerekçe — `performed_by` boşaltılmaz).
- **Görünürlük:** Hareketler ekranı `analysis.view` ile açılır. Şablon ve
  katalog olayları bu izinle görünür: hat ve sevk kapılarını etkilerler,
  kalite ve analiz kullanıcısının görmesi gerekir. Kullanıcı ve
  rol/izin olayları ek olarak `admin.manage_users` ister: kimin kime
  hangi yetkiyi verdiği, kimin şifresinin sıfırlandığı ve e-posta
  adresleri hassastır; bu bilgiyi zaten yönetebilen kişi dışında
  göstermek gereksiz bilgi yayar. İzni olmayan çağrıda bu olaylar
  listeden çıkarılır, türle açıkça istenirse 403 döner. Ana sayfadaki
  "son hareketler" yönetim olaylarını hiç göstermez (orası sahadaki iş
  akışıdır).
- **Gösterim:** sunucu metadata'yı yapılandırılmış olarak döndürür
  (`Admin` alanı); cümleye çevirme istemcidedir. Bilinen anahtarlar
  (rol kodu, izin kodu, aktif/pasif, hat sonu aşaması, bölüm) çevrilir;
  bilinmeyen izin için veritabanındaki açıklama, özel bölüm için
  kullanıcının verdiği bölüm adı gösterilir. Ham kimlik numarası ya da
  enum değeri gösterilmez.
- **Geri alma:** 0038 down, yönetim olayı içeren satır varsa durur
  (geçmiş silinmez); yoksa enum'u bu dört değer olmadan yeniden kurar.

## Karar 26 — Checklist cevabında tek not alanı; şema değişmez (NEW — 2026-10-06)

- **Karar:** API her cevap için tek `note` alanı alır ve öğe listesinde
  tek `Note` alanı döndürür. Uygun (OK) dahil her cevapta not girilebilir
  (ölçüm değeri, gözlem). Yeni kolon açılmaz; not cevabın sahip olduğu
  mevcut kolona yazılır: OK → `approved_desc` (0001'den beri var,
  kullanılmıyordu), Şartlı uygun → `conditional_desc`, Uygun değil →
  `rejected_desc`, Yeniden işlem → `rework_desc`. PENDING'in kolonu
  yoktur, not düşer.
- **Tek yer:** cevap→kolon eşlemesi yalnız `domain/checklist_note.go`
  içindeki `ChecklistNotes.slot`'tadır; yazma (`NotesForStatus`) ve okuma
  (`NoteFor`) aynı fonksiyondan geçer. İleride tek kolona geçilirse
  değişecek yer burasıdır.
- **Geriye uyum:** `rework_desc`, `conditional_desc`, `rejected_desc`
  istek alanları kabul edilmeye devam eder (eski mobil sürüm). `note`
  boşsa bu alanlar eskisi gibi olduğu gibi yazılır; `note` doluysa onlar
  yok sayılır. Yanıttaki eski alanlar da durur.
- **Değişmeyen:** `chk_description_required_by_status` aynen kalır (EOL'de
  üç hata cevabı için not zorunlu; OK serbest). `check_image_url` ve
  diğer kullanılmayan kolonlara dokunulmaz.
- **Madde fotoğrafları (2026-10-06):** `CHECKLIST_ITEM_PROGRESS`
  fotoğrafları maddenin kendisinde gösterilir (öğe listesi `Photos`, tek
  sorguda LATERAL join) ve araç galerisinden çıkarılır:
  `MediaRepository.ListGalleryByVIN` (`GET /vehicles/{vin}/media`) artık
  `entity_type <> 'CHECKLIST_ITEM_PROGRESS'` filtreler. ISSUE,
  ISSUE_RESOLUTION, VEHICLE ve STATION_STEP_PROGRESS fotoğrafları galeride
  kalır. Satırlar silinmez; yalnız galeri sorgusu değişir. EOL
  fotoğrafı arıza kaydı açmaz.
- **Bilinen sınır:** cevap değişince eski cevabın notu silinir (kayıt her
  seferinde dört kolonu yeniden yazar) ve hiçbir yerde saklanmaz;
  `CHECKLIST_ITEM_UPDATE` denetim kaydı yalnız eski/yeni durumu ve madde
  kimliğini tutar, metni tutmaz. Bu davranış bu kararla değişmedi.
- **Güncelleme (2026-10-06 — not geçmişi):** EOL'de `CHECKLIST_ITEM_UPDATE`
  metadata'sı artık `old_note` (değiştirilen cevabın gösterilen notu) ve
  `new_note` (yeni cevabın notu) taşır; boş olan anahtar hiç yazılmaz
  (boş dize yazılmaz). Kolondaki not yine üzerine yazılır, eski değer
  denetim kaydında kalır. Yalnız bundan sonraki kayıtlar; mevcut denetim
  satırlarına dokunulmaz. Metadata'ya parola, parola özeti veya oturum
  anahtarı yazılmaz (yalnız `item_id`, `checklist_type`, notlar). Test ve
  Sevk kayıtları değişmedi.

## Karar 27 — Mobil çevrimdışı bayrağı yalnız bilgilendirir (NEW — 2026-10-06)

- **Kaynak:** `connectivityStore` iki sinyali birleştirir: işletim sisteminin
  ağ durumu (`expo-network`, `isConnected`; `watchOsNetwork` App açılışında
  başlar) ve istek sonuçları (yanıtsız istek → çevrimdışı, herhangi bir
  yanıt → çevrimiçi). İşletim sistemi bağlantının döndüğünü bildirince bayrak
  da düzelir; bir ekranın istek atmasını beklemez. `isInternetReachable`
  kullanılmaz: API yerel ağda, internetsiz Wi-Fi'de de ulaşılabilir.
- **Kural:** Bayrak hiçbir zaman Kaydet'i veya yüklemeyi engellemez. Şerit
  ve "çevrimdışı görünüyorsunuz" yazısı gösterir; istek her zaman denenir,
  düşerse gerçek hata gösterilir. Bayat bir tahminin işlemi kilitlemesi
  hatadır.
- **Neden `expo-network`:** NetInfo da Expo Go'da hazır gelir; ikisi de ek
  native kurulum istemez. `expo-network` Expo SDK ile aynı sürüm çizgisinde
  (`~57`) ve `npx expo install` ile SDK'ya uygun sürüm seçilir; ihtiyaç
  yalnız bağlı/bağlı değil olduğu için daha küçük API yeterli.

## Karar 28 — Canlı veritabanı yalnız salt-okunur `karea_ro` rolüyle incelenir (NEW — 2026-10-07)

- **Neden:** Araç onay adımı her zaman tutmuyor; "reddedildi" dönen çağrıların
  gerçekte çalıştığı görüldü. Oturum ayarı (`default_transaction_read_only`)
  bağlanan tarafın elinde, tek komutla kapatılabilir. Koruma bu yüzden
  yetkide olmalı.
- **Rol:** `scripts/create-readonly-role.sql` (migration değil; sunucu başına
  bir kez, `karea` olarak elle çalıştırılır, parola `-v ro_password=...` ile
  verilir, dosyada yok). `karea_ro`: LOGIN, süper kullanıcı/rol/DB oluşturma
  yok, en çok 5 bağlantı. Yetkiler: veritabanında CONNECT, `public` şemasında
  USAGE, bütün tablo/görünüm/dizilerde SELECT. INSERT, UPDATE, DELETE,
  TRUNCATE, REFERENCES, TRIGGER hiçbir tabloda yok, `schema_migrations` dahil.
  `ALTER DEFAULT PRIVILEGES FOR ROLE karea` ile sonradan eklenen tablolarda da
  yalnız SELECT. İkinci güvence olarak rolün oturumu salt-okunur başlar.
- **PUBLIC yetkileri:** Her rol PUBLIC'in yetkilerini miras aldığı için betik
  `public` şemasındaki CREATE'i (canlıda ACL `=UC/karea` idi) ve veritabanındaki
  TEMPORARY'yi PUBLIC'ten geri alır. Uygulama `karea` (şema sahibi, süper
  kullanıcı) ile bağlandığı için etkilenmez.
- **Kural:** Ajan canlıya yalnız `karea_ro` ile bağlanır
  (`postgres://karea_ro@localhost:5432/karea`, parola `~/.pgpass`'ten).
  `docker exec` + `karea` + oturum ayarı ile canlı okuma yapılmaz.

## Karar 29 — Aracın geçtiği aşamanın checklist maddeleri donar (NEW — 2026-10-07)

- **Kural:** Teslim edilen (veya sevk edilen) araçta hiçbir checklist maddesi
  değişmez. Fabrikadan sevk (`branch_shipped_at`) şube EOL, Test ve Sevkiyat
  maddelerini dondurur (seçenek B); depodan çıkış (`depot_released_at`) depo
  EOL maddelerini dondurur. Donmuş maddeye yeni cevap, not veya fotoğraf
  yazılamaz; var olan fotoğraflar görünür ve tam boy açılır. EOL sıfırlama
  (`ResetToBranch`) damgaları sildiği için kilidi de kaldırır.
- **Neden:** Cevap verildiği aşamanın kaydıdır. Depoda bulunan bir kusur
  şubede verilmiş Test cevabını değiştirerek değil, arıza kaydıyla
  yazılır; depoda yapılan kontrol depo maddesidir (KY.FR-19). Seed'deki
  "depoda OBD taraması" bu yüzden kaldırıldı; açık arıza kaydı duruyor.
- **Katmanlar:** Uygulama `ListForVehicle` üzerinden `FrozenReason`'ı okur;
  `RecordChecklistResult` ve checklist fotoğraf yüklemesi 409 döner, dosya
  diske yazılmaz (`ErrChecklistFrozen*`). Veritabanı tetikleyicisi
  (migration 0040: `fn_checklist_item_frozen_reason`,
  `trg_enforce_checklist_frozen`, `trg_enforce_checklist_media_frozen`)
  doğrudan SQL'i de aynı metinle reddeder; `mapRaiseException` metni
  sentinel'e çevirir. Değişmeyen yazım (aynı cevap) ve PENDING satırın
  eklenmesi geçer. Arayüz donmuş maddede başlığı tıklanamaz yapar, cevap
  düğmelerini ve Kaydet'i göstermez, sebebi kısaca iki dilde yazar.
- **Sıra:** Önce kod (eski şemada da çalışır, kilidi kendisi uygular), sonra
  migration; kesinti yok.

## Karar 30 — Form kimliği maddede durur (NEW — 2026-10-07)

- **Kural:** Form no, revizyon ve yayın tarihi şablonda değil maddede
  tutulur (`checklist_template_items.form_code`, `form_revision`,
  `form_published_at`); kağıttaki madde numarası `form_item_ref`'tir
  (E001, 46). Migration 0041, 0039'un şablon düzeyindeki üç kolonunu
  düşürür.
- **Neden:** Araç başına tek EOL şablonu var ve iki form taşıyor: şube
  maddeleri KY.FR-09, depo maddeleri KY.FR-19. Şablon düzeyinde tek form
  no yanlış olur.
- **seed_key:** Formdan gelen maddelerde metnin md5'i değil kimlik:
  `"<form_code>:<form_item_ref>"`, örn. "KY.FR-09:E001", "KY.FR-19:46".
  Metin düzeltilse de kimlik değişmez. Şablon başına benzersiz (kısmi
  index; admin'in eklediği maddelerde NULL serbest).
- **Şablon adları** madde sayısı taşımaz; sayı madde eklenip çıkınca
  bayatlıyordu.
- **Eski EOL maddeleri (2026-10-08):** Yalnız yerini somut bir şeyin aldığı
  altı madde seed'den çıkar: Software Update, Fonksiyonel Komponet
  Kontrolü, EE Check (E/E, API'den gelecek), Görsel Kontrol (KY.FR-09),
  Görsel Kontrol 2 (KY.FR-19 6–14), Depo Sürüş (KY.FR-19 50–54). Formlarda
  karşılığı olmayan veya belirsiz dokuz madde kalır (Araç Motoru, Batarya,
  Süspansiyon Testi, Fren/El Testi, Far Ayarı, Rot Balans, Sürüş; depoda
  Bumpy Road, Yağmur Testi): metin, aşama ve md5 seed_key aynı; form ve
  kabul alanları NULL. Seed'den çıkarmak o kontrolleri kayıttan kaldırmak
  olurdu; kalite ekibi teyit edene kadar dururlar. EOL şablonu 104 madde:
  şube 1–39 KY.FR-09, 40–46 eski; depo 47–102 KY.FR-19, 103–104 eski.
- **Bu dokuz madde GEÇİCİDİR (2026-10-08):** kalite ekibinin kararını
  bekliyorlar (form maddesine dönüşecek mi, kaldırılacak mı). Bu yüzden
  formların bölümlerine karıştırılmaz, kendi bölümlerinde dururlar:
  şubede yedisi "Fiziksel testler" (`eol_physical_tests`, sıra 60,
  KY.FR-09'un son bölümü İç'ten sonra), depoda Bumpy Road ve Yağmur Testi
  "Ek kontroller" (`final_extra_checks`, sıra 200, KY.FR-19'un son bölümü
  Sevkiyat'tan sonra). Form bölümüne konsalar formun parçası gibi görünür,
  ekranda "bunlar yeni formlarda yok" bilgisi kaybolurdu. Bumpy Road
  "Yol Testi"ne katılmaz; Yağmur Testi için ayrı bölüm açılmaz. "Diğer
  maddeler" (bölümsüz) yalnız admin'in bölüm vermeden eklediği maddeler
  için kalır. Kalite kararı gelince bu iki bölüm boşalır ve katalogdan
  çıkar.
- **Cevap, verildiği formun kopyasını taşır (2026-10-08, migration 0042):**
  Kabul kriteri, kontrol yöntemi ve form revizyonu şablon maddesinde durur;
  kalite ekibi formu revize edince geçmiş cevaplar bugünün metnini
  gösterirdi. `checklist_item_progress` artık üçünün kopyasını
  (`acceptance_criterion_snapshot`, `control_method_snapshot`,
  `form_revision_snapshot`) ve kopyanın zamanını (`criteria_snapshot_at`)
  taşır.
  - **Ne zaman:** sunucu, PENDING olmayan **her** cevapta, cevabı yazan
    aynı UPDATE içinde şablondan kopyalar; istemcinin gönderdiğine
    güvenilmez. Madde metni (`item_text_snapshot`, 0020) da aynı kurala
    geçti: ilk cevapta değil, her cevapta kopyalanır. PENDING'e dönüş
    kopyaları korur. Cevapla kopya arasındaki yarış kabul edilmiştir.
  - **API:** `AcceptanceCriterion`, `ControlMethod`, `FormRevision`
    şablonun güncel değeridir; kopya ayrı `AnsweredCriteria` alanında
    gelir (PENDING ve kopyasız cevapta yok).
  - **Kaynak kuralı:** cevaplıysa kopya, PENDING ise şablon. Açık kart
    (cevaplı maddeyi yeniden düzenlerken dahil) şablonu gösterir; operatör
    o kritere göre değerlendiriyor ve kaydedince kopya o olur. Kapalı kart
    ikonu ve baskı kuralı izler; baskı revizyonu da basar.
  - **Kopyasız eski cevaplar** (`criteria_snapshot_at` NULL) kriter
    göstermez; şablona düşülmez, çünkü bu tam olarak düzeltilen yanlış
    tarihtir. Geriye dönük doldurma yok.
  - Damga dolu, kopya NULL: "formda yoktu". Damgasız kopya
    `chk_criteria_snapshot_stamped` ile reddedilir.
  - Dört kolon donmuş maddede korunan cevabın parçasıdır (0040 tetikleyici
    listesi genişledi; hangi maddenin ne zaman donduğu değişmedi).

## Karar 31 — Gün filtreleri fabrika takvimine göre keser (NEW — 2026-10-08)

- **Kural:** Kullanıcının seçtiği bir gün (YYYY-MM-DD) Europe/Istanbul
  günüdür. Sunucu `opened_from`'u o günün yerel 00:00'ına, `opened_to`'yu
  ertesi günün yerel 00:00'ına çevirir ve yarı açık aralıkla süzer:
  `issue_date >= başlangıç AND issue_date < bitiş` (`domain.PlantDayStart`,
  `PlantDayEnd`; tzdata binary'ye gömülü, sunucunun saat dilimine
  bağlı değil). Tarayıcının saat dilimi de kullanılmaz: "Bugün", "Son 7
  gün" (bugün dahil 7 takvim günü) ve "Bu ay" (ayın 1'i–bugün) İstanbul'a
  göre hesaplanır (`shared/issueDateRange.ts`).
- **Neden:** Tarihler veritabanında UTC. UTC gününe göre kesmek, gece
  00:00–03:00 arası açılan arızayı bir önceki güne yazar: "Bugün" o
  kayıtları düşürür, dünün son üç saatini gösterir. Fabrika tek saat
  diliminde çalışıyor.
- **URL:** Hazır aralık göreli kalır (`opened=today|7d|month`); paylaşılan
  bağlantı açıldığı günün "Bugün"ünü gösterir. Elle seçilen günler
  `opened_from` / `opened_to` olarak durur. Analiz'den gelen `from` / `to`
  ayrı parametredir.
- **Dışa aktarma:** CSV, ZIP ve yazdırma aynı aralıkla sunucudan tüm
  eşleşenleri çeker; yüklü sayfalarla sınırlı değildir.
- **Analiz de aynı kuralla (2026-10-08):** `from` / `to` tarih-only değer
  (seçilen günün UTC gece yarısı) olarak taşınır; zaman sınırına yalnız
  `PlantDayBounds` → `PlantDayStart` / `PlantDayEnd` ile çevrilir
  (`InclusiveDateBounds`, `IntersectWindow`). `StartOfUTCDay` kaldırıldı.
  Karşılaştırma penceresi tarih-only günlerle hesaplanır, varsayılan "son 7
  gün" fabrika bugününe göre. Günlük seriler (açılan, kapanan, açık stok,
  üretim) `AT TIME ZONE 'Europe/Istanbul'` ile gruplanır; haftalık/aylık
  gruplama yok. RFC3339 bir an verilirse düştüğü fabrika günü alınır.
  Web: analizden panoya drill-down `plantCalendarDay` ile; tarih-only
  değerler (grafik günleri, aralık etiketleri) UTC'de biçimlenir, gün
  kaymaz. Aynı aralıkta pano toplamı = analiz "Açılan hatalar" = günlük
  kovaların toplamı; test bunu kilitler.

## Karar 32 — Web / mobil farkları tek dosyada izlenir (NEW — 2026-10-08)

- **Neden:** Web'e eklenen birçok özellik mobile gelmedi; hangisinin bilinçli,
  hangisinin unutulmuş olduğu bilinmiyordu.
- **Kural:** `docs/22_KAREA_Web_Mobil_Ayrisma_Envanteri.md` kullanıcıya görünen
  her özellik için web / mobil durumunu ve farkın kasıtlı mı, unutulmuş mu
  olduğunu tutar. Bir özellik iki taraftan birinde eklenince, kaldırılınca ya
  da değişince dosya aynı commit'te güncellenir.
- **Kasıtlılık ölçütü:** PRD §5 ve MoSCoW #13'teki rol ayrımı (operatör
  mobil, yönetici web) ve MoSCoW #30 (Faz 1'de çevrimdışı senkronizasyon
  yok). Yazılı bir gerekçesi olmayan fark "unutulmuş" sayılır.

## Karar 33 — Sevkiyat kontrol listesi kaldırıldı (NEW — 2026-10-09)

- **Neden:** Sevkiyat listesindeki 46 montaj maddesi artık istasyonlarda
  yapılıyor; kontrol listesinde ikinci kez tutulmasına gerek yok. Yerine
  ileride E/E gelecek; o ayrı bir iş ve API şartnamesini bekliyor.
- **Kural:** Sevkiyat maddeleri hiçbir yerde sayılmaz. Katmanlar şablonun
  varlığına değil türe bakar; böylece eski kurulumda kalan SHIPMENT şablonu
  ve satırları da hiçbir sonucu etkilemez:
  - Şubeden çıkış kapısı (`BranchShipBlockers`, `BuildEOLGates`,
    `TriggerBranchShipWouldBlock`; tetikleyici `fn_enforce_branch_shipment`
    migration 0044). Kalan sert şartlar: yetki `eol.branch.ship`, araç daha
    önce çıkmamış, aktif şube EOL maddeleri ve aktif Test maddeleri
    OK/CONDITIONAL_OK, istasyon adımlarının hepsi OK. Açık hata yalnız
    uyarıdır.
  - Aşama uygunluğu (`applicableChecklistItemsSQL`): ilerleme yüzdesi ve
    "Sevk öncesi uyarı" listesi yalnız istasyon adımları + EOL + Test
    maddelerini sayar. Karar 16'daki "+ SHIPMENT" kapsamı bu kararla kalktı.
  - Donma kuralı (Karar 29) değişmedi: EOL ve Test maddeleri aynı biçimde
    donar; Karar 29'daki "Sevkiyat" ifadesi artık hiçbir maddeye denk gelmez.
  - Web'de Sevkiyat sekmesi, mobilde Sevkiyat ekranı ve seed'deki SHIPMENT
    şablonu kaldırılır.
- **Enum kalır, API reddeder:** `checklist_type_enum` içindeki `SHIPMENT` ve
  `SHIPMENT_ITEM` hata kaynağı silinmez (PostgreSQL'de enum değeri silmek
  tablo yeniden yazımı ister; faydası CHECK kısıtıyla ucuza alınır). Go'da
  `ChecklistType.Valid()` yalnız EOL ve TEST'i kabul eder; `/checklists/shipment`
  okuma ve kaydetme 400, Sevkiyat ilerleme satırına medya yükleme 400 döner.
  `checklist.shipment.view/edit` yetkileri koddan kalktı.
- **Yeni SHIPMENT şablonu açılamaz:** şablon oluşturan bir API yok; şablon
  yönetimi (`/checklist-templates` liste, madde listesi, ekleme, düzenleme,
  silme, sıralama, etki önizleme) SHIPMENT şablonunu görmez — liste
  süzer, tekil erişim 404 döner, madde doğrulaması SHIPMENT tipini reddeder.
  Web şablon ekranının tip seçenekleri yalnız EOL ve TEST'tir.
- **`vehicles.shipment_template_id` düşer:** uygulama kodu kolonu okumaz
  (araç sorguları ve API yanıtı `ShipmentTemplateID` taşımaz); kolon,
  SHIPMENT şablonu, maddeleri, PENDING ilerleme satırları ve
  `checklist.shipment.*` yetki satırları (rol atamalarıyla) migration 0045
  ile kalkar; `checklist_templates` üzerinde `type <> 'SHIPMENT'` CHECK
  eklenir. Beş tetikleyici fonksiyonu Sevkiyat'sız haline geçer;
  `fn_materialize_vehicle_progress` 3 argümanlıdır (vin, EOL, Test).
- **0045 koruması:** PENDING dışı bir Sevkiyat ilerleme satırı, Sevkiyat
  kaynaklı bir hata, Sevkiyat satırına bağlı fotoğraf ya da Sevkiyat audit
  kaydı varsa migration RAISE ile durur ve hiçbir şey silinmez (tek
  işlem, tamamı geri alınır). golang-migrate sürümü 45 "dirty" bırakır;
  geri dönüş `migrate force 44`'tür, veri değişmemiştir. Böyle bir
  kurulumda geçmiş önce kararla ele alınır.
- **0045 sırası ve kesinti:** Önce bu kod yayına alınır (kolonu okuyan eski
  sürüm kalkar), sonra 0045 uygulanır; uygulama durdurulmaz. Silme yalnız
  Sevkiyat satırlarına dokunur, araç güncellenmediği için EOL/Test satırları
  yeniden üretilmez (id'leri ve sıra değeri aynı kalır). `DROP COLUMN`
  `vehicles` üzerinde kısa bir özel kilit alır (500 araç / 23.000 satırlık
  kopyada 0,2 sn).
- **0045 down:** kolonu (araçlarda NULL), boş bir SHIPMENT şablonunu, iki
  yetkiyi ve 0010'daki rol atamalarını, 0044 fonksiyonlarını geri koyar.
  Silinen maddeler ve ilerleme satırları geri gelmez.
- **Yeniden uygulama:** 0045 sonrası 0001/0002 (SHIPMENT şablonu ekler,
  CHECK reddeder) ve 0009/0023 (`shipment_template_id` okur) bir daha
  baştan koşturulamaz; uygulanmış migration'lar değiştirilmez.
  `verify_migrations.sh` 3. adımı bu yüzden şemayı son yıkıcı migration'ın
  bir öncesine (`LAST_DESTRUCTIVE=45` → 44) indirip yalnız ondan önceki up
  dosyalarını yeniden koşturur. İstisna listesi tutulmaz; asıl güvence
  sıfırdan sıralı kurulumdur (1. adım). Yeni bir yıkıcı migration
  geldiğinde `LAST_DESTRUCTIVE` yükseltilir.
- **Metinler:** rol ekranındaki iki Sevkiyat yetkisi, şablon tipi etiketi,
  Sevkiyat bölüm kataloğu (6 bölüm anahtarı), etkinlik ve zaman çizelgesi
  etiketleri kalktı. Kalanlar sevkiyat checklist'i değildir: Test rozeti,
  EoL'un depo aşamasındaki "Sevkiyat" bölümü (KY.FR-19 55–59), formun
  49. maddesi ve fiziksel sevk olayı metinleri.
- **Uyarı paneli yetkisi:** "Sevk öncesi uyarı" (`GET
  /vehicles/{vin}/shipment-readiness`, web paneli, mobil istasyon ekranı)
  `vehicle.view` ister; panel aracın sevk özetidir. Dört rolde de var:
  QUALITY paneli kazandı, kimse kaybetmedi. ASSEMBLY'nin Test/EOL
  görüntüleme yetkisi olmadan madde metinlerini görmesi borç (docs/16 D8).
- **Sıra:** Önce kod (eski şemada da çalışır; yalnız şablonu atanmış araçta
  eski tetikleyici hâlâ reddeder), sonra migration 0044; kesinti yok.

## Değişmeyen / Yeniden Kullanılacaklar

Şunlara **dokunulmuyor**, olduğu gibi kalıyor: JWT auth + bcrypt (üstteki JWT_SECRET ve iptal sıkılaştırmaları hariç), CORS allowlist mimarisi, Unit-of-Work (pgx.Tx) transaction pattern, `.cursor/rules` (commit ve environment-check kuralları), Analysis sekmesi temel yapısı (VIN×severity kırılımı, Pie/Bar chart'lar — yeni station/EOL alanlarıyla genişleyecek ama sıfırdan kurulmayacak), Docker/migration/seed altyapısı.

---

## Sonraki Adım

Şimdi bu kararlara göre güncellenmiş tam DDL'i (`12_KAREA_v2_database_schema.sql`) hazırlıyorum, ardından mevcut kod tabanının üzerine inşa eden — sıfırdan başlamayan — yeni bir Cursor prompt sırası vereceğim.
