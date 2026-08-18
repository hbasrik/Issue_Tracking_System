
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

## Karar 5 — VIN / Vehicle Number

**Çelişki:** Spec, `vehicles`'tan ayrı bir `Full_VIN_List` master tablosu öneriyor (id, vin_number, vehicle_number, active).

**Karar (mimari sadeleştirme):** Ayrı bir tablo kurmak, spec'in kendi "master veriyi tekrarlama" prensibiyle çelişir — `vehicles` zaten araç master verisidir. Bunun yerine `vehicles` tablosuna `vehicle_number` (kısa numara, unique, indeksli) kolonu eklenir. Operatör kısa numarayı girer, sistem VIN'i bulup salt-okunur gösterir — davranış aynı, gereksiz tablo tekrarı olmadan. VIN son-5-hane arama (mevcut trigram) ile bu ikisi birlikte, birbirini dışlamadan çalışır.

## Karar 6 — Issue Statüsü: 5. Aşama (Şartlı Onay)

**Çelişki:** Mevcut sistemde issue akışı OPEN→IN_PROGRESS→DONE→APPROVED (4 statü, lineer). Yeni spec, DONE'dan sonra APPROVED **veya** Şartlı Onay (CONDITIONAL_APPROVED) olmak üzere dallanan bir akış istiyor.

**Karar:** `issue_status_enum`'a 5. değer olarak `CONDITIONAL_APPROVED` eklenir. DONE'dan hem APPROVED'a hem CONDITIONAL_APPROVED'a geçiş mümkün olur (ikisi de yalnızca Manager/Admin/Quality yetkisinde, ikisi de terminal/kapanış statüsüdür). `issue_list`'e `conditional_approve_reporter_id`/`conditional_approve_date` kolonları eklenir (approve alanlarıyla simetrik).

## Karar 7 — Issue_History: Yeni Tablo mu, Mevcut audit_logs mu?

**Çelişki:** Spec ayrı bir `Issue_History` tablosu öneriyor.

**Karar:** Gereksiz tekrar — elimizde zaten genel amaçlı, append-only `audit_logs` tablosu ve `ISSUE_STATUS_CHANGE` event tipi var (Prompt 4'te kurduk). Yeni tablo açmak yerine bu genişletilip kullanılır; `metadata` JSONB alanı spec'in istediği "comment" bilgisini zaten karşılar.

## Karar 8 — Medya/Attachment Yönetimi

**Çelişki:** Spec, `picture_url` gibi düz metin kolonları yerine genel bir `Media/Attachment` tablosu öneriyor.

**Karar:** Kabul edildi — `media_attachments` (id, entity_type, entity_id, file_name, storage_path, mime_type, file_size, uploaded_by, uploaded_at) eklenir. `issue_list.picture_url`, `issue_list.issue_picture_done_url`, `eol...check_image` gibi alanlar zamanla bu tabloya taşınır (polymorphic ilişki, DB seviyesinde FK zorlanamaz ama uygulama seviyesinde entity_type+entity_id ile doğrulanır).

## Değişmeyen / Yeniden Kullanılacaklar

Şunlara **dokunulmuyor**, olduğu gibi kalıyor: JWT auth + bcrypt, CORS allowlist mimarisi, Unit-of-Work (pgx.Tx) transaction pattern, `.cursor/rules` (commit ve environment-check kuralları), Analysis sekmesi temel yapısı (VIN×severity kırılımı, Pie/Bar chart'lar — yeni station/EOL alanlarıyla genişleyecek ama sıfırdan kurulmayacak), Docker/migration/seed altyapısı.

---

## Sonraki Adım

Şimdi bu kararlara göre güncellenmiş tam DDL'i (`12_KAREA_v2_database_schema.sql`) hazırlıyorum, ardından mevcut kod tabanının üzerine inşa eden — sıfırdan başlamayan — yeni bir Cursor prompt sırası vereceğim.
