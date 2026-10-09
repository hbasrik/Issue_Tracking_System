-- Populate default EOL / TEST templates (migration 0002).
-- No SHIPMENT items (Karar 33): those assembly steps are done at stations
-- now. The SHIPMENT template row from migrations 0001/0002 stays, empty.
-- Source: TEST and the 9 kept EOL items come from the live DB
-- (exact text, incl. trailing newlines); the 95 EOL form items come from
-- docs/21_KAREA_Yeni_Formlar.md (KY.FR-09 branch, KY.FR-19 depot).
-- Insert-only: existing items are never updated, so admin edits to text,
-- phase, section, order and is_active survive a re-run.
-- A seed item counts as present when any row in its template carries its
-- seed_key: md5(seed text) (migration 0034) for non-form items,
-- '<form_code>:<form_item_ref>' for form items (Karar 30). item_no is only a position
-- (reorder renumbers it) and is never used to match. A missing item is
-- re-added at its original item_no when that slot is free, otherwise after
-- the last item.
-- Excludes inactive and test-only items (see seed README / task report).
-- section_key / section_sort must equal the migrations (TEST: 0035, by item
-- content) and shared/checklistSections.ts; change them together.
WITH legacy_items (
    template_name,
    item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort
) AS (
    VALUES

        -- EOL: 9 items kept from the pre-form list (no form counterpart yet;
        -- quality team to confirm). Text unchanged, so seed_key = md5(text) as
        -- before. item_no: branch after KY.FR-09 (1-39), depot after KY.FR-19
        -- (47-102). Temporary sections outside the forms' sections (Karar 30):
        -- branch "eol_physical_tests" (60), depot "final_extra_checks" (200).
        ('Default EoL Template (Branch + Depot)', 40::SMALLINT, 'Araç Motoru', 'BRANCH'::eol_item_phase_enum, 'eol_physical_tests'::varchar, 60::smallint),
        ('Default EoL Template (Branch + Depot)', 41, 'Batarya', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 42, 'Süspansiyon Testi', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 43, 'Fren/El Testi', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 44, 'Far Ayarı', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 45, 'Rot Balans', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 46, 'Sürüş', 'BRANCH', 'eol_physical_tests', 60),
        ('Default EoL Template (Branch + Depot)', 103, 'Bumpy Road', 'DEPOT', 'final_extra_checks', 200),
        ('Default EoL Template (Branch + Depot)', 104, 'Yağmur Testi', 'DEPOT', 'final_extra_checks', 200),

        -- TEST: 43 active items
        ('Default Test Checklist', 1, 'N''de aracı ittir — Anormal direnç var mı?', NULL, 'cold_drag', 10),
        ('Default Test Checklist', 2, 'D''de gaz ver — Araç normal hızlanıyor mu? Sıkma hissi veya anormal ses var mı?', NULL, 'cold_drag', 10),
        ('Default Test Checklist', 3, 'R''de gaz ver — Geri viteste normal hızlanıyor mu? Sıkma hissi veya anormal ses var mı?', NULL, 'cold_drag', 10),
        ('Default Test Checklist', 4, 'Dış aydınlatma — Kısa, uzun, selektör, park, sis, sol/sağ sinyal, dörtlü, stop, geri vites lambası.', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 5, 'Korna — Ses seviyesi ve çalışması normal mi?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 6, 'Camlar — Tüm camlar açılıp kapanıyor mu? Takılma, yavaşlık veya ses var mı?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 7, 'Merkezi kilit & kapılar — İçeriden ve anahtarla dışarıdan kilitle-aç. Her kapıda doğru çalışıyor mu?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 8, 'Aynalar & iç donanım — Aynalar, IP kapakları, emniyet kemeri kapakları, düğmeler ve trim parçaları normal mi?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 9, 'Emniyet kemerleri — Tokalar çalışıyor mu? Kemer düzgün sarıyor mu? Uyarı sesi/ikonu doğru mu?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 10, E'El freni (KRİTİK) — El frenini çek $\\rightarrow$ hafif gaz ver $\\rightarrow$ araç ilerlemeye çalışıyor mu? Kayma varsa video + SOC% + saat.', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 11, 'Vites seçimi — P/R/N/D geçişlerinde gecikme, yanlış gösterim veya kararsızlık var mı?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 12, 'Ana ekran / menüler — Tüm menülerde düğmelere tek tek bas. Donma, sıfırlanma veya gecikme var mı?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 13, 'Geri görüş kamerası — R''ye alınca görüntü geliyor mu? Görüntü temiz mi?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 14, 'Klima & havalandırma — Fan 1-2-3, yüze/cama üfleme, iç hava dolaşımı, A/C, ısıtma/soğutma.', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 15, 'Odometer — Sürüş öncesi değeri not et. Sürüş sonrası doğru sayıyor mu? Aracı kapatıp açınca kaldığı yerden devam ediyor mu?', NULL, 'bcm_ee', 20),
        ('Default Test Checklist', 16, E'Düşük hız — 500m, 0 $\\rightarrow$ 30 km/s. Titreme, silkelenme, anormal ses, çekişte kararsızlık var mı? Trim/tavan/torpido/kapı/cam sesi var mı?', NULL, 'road_test', 30),
        ('Default Test Checklist', 17, E'Fren — 30 $\\rightarrow$ 0 x5 (~300m). Her frenlemede sağa/sola ekstrem çekme var mı? Anormal pedal, ses veya titreşim var mı?', NULL, 'road_test', 30),
        ('Default Test Checklist', 18, 'Sürekli frenleme — Dur-kalk min. 20x (~600m). Pedal sertleşmesi/boşalması, performans düşüşü veya koku var mı?', NULL, 'road_test', 30),
        ('Default Test Checklist', 19, E'Fren — 50 $\\rightarrow$ 0 x5 (~400m). Her frenlemede sağa/sola ekstrem çekme var mı? Anormal pedal, ses, titreşim veya koku var mı?', NULL, 'road_test', 30),
        ('Default Test Checklist', 20, E'Fren — 90 $\\rightarrow$ 0 / 80 $\\rightarrow$ 0 / 70 $\\rightarrow$ 0 (~500m). Her frenlemede sağa/sola ekstrem çekme var mı? Performans düşüşü veya koku var mı?', NULL, 'road_test', 30),
        ('Default Test Checklist', 21, 'Son hıza ulaşma (~600m) — ECO modda 90 km/s''ye ulaşıyor mu? SPORT modda 90 km/s''ye ulaşıyor mu?', NULL, 'road_test', 30),
        ('Default Test Checklist', 22, 'Yokuş çıkış + iniş (~400m) — Çıkışta geri kaçırma, çekiş düşmesi var mı? İnişte rejen açık/kapalı davranışı normal mi?', NULL, 'road_test', 30),
        ('Default Test Checklist', 23, E'Yokuş el freni (KRİTİK) — Yokuşta en az 6 kez kaydır-tut. El freni çek $\\rightarrow$ hafif gaz $\\rightarrow$ kayıyor mu? Kayma varsa video + SOC% + saat.', NULL, 'road_test', 30),
        ('Default Test Checklist', 24, 'N''de yokuş fren testi (~100m) — Yokuş aşağı N''de fren yap, bırak. Araç kendi kendine hareket ediyor mu?', NULL, 'road_test', 30),
        ('Default Test Checklist', 25, E'Düşük hız fren genel — 30 $\\rightarrow$ 0 testlerinde tutarlı performans sağlandı mı?', NULL, 'brake_test', 40),
        ('Default Test Checklist', 26, E'Orta hız fren genel — 50 $\\rightarrow$ 0 testlerinde tutarlı performans sağlandı mı?', NULL, 'brake_test', 40),
        ('Default Test Checklist', 27, E'Yüksek hız fren genel — 90/80/70 $\\rightarrow$ 0 testlerinde tutarlı performans sağlandı mı?', NULL, 'brake_test', 40),
        ('Default Test Checklist', 28, 'FRENLERDE SIKMA VAR MI? (KRİTİK) — Anormal direnç, tek taraflı ısınma, koku veya sürtünme hissi var mı? Varsa video + foto + saat.', NULL, 'brake_test', 40),
        ('Default Test Checklist', 29, 'Nihai Fren Onayı — Tüm fren testleri tamamlandı, anormal bulgu yok mu?', NULL, 'brake_test', 40),
        ('Default Test Checklist', 30, 'Rot ayarı — Düz/eğimsiz yolda direksiyonu bırak. Araç sola veya sağa çekiyor mu?', NULL, 'alignment', 50),
        ('Default Test Checklist', 31, 'Direksiyon merkezi — Düz gidişte direksiyon tam ortada mı? Belirgin sapma varsa foto + not al.', NULL, 'alignment', 50),
        ('Default Test Checklist', 32, 'Yüksek hızda kararlılık — 70–90 km/s''de araç düz gidiyor mu? Çekme veya titreşim var mı?', NULL, 'alignment', 50),
        ('Default Test Checklist', 33, 'Sol ön disk — Elini yaklaştır (dokunma). Diğer disklere kıyasla belirgin sıcak mı? Sıcaksa sıkma şüphesi; foto + not al.', NULL, 'hot_drag', 60),
        ('Default Test Checklist', 34, 'Sağ ön disk — Aynı kontrol. Belirgin şekilde sıcak mı?', NULL, 'hot_drag', 60),
        ('Default Test Checklist', 35, 'Sol arka disk — Aynı kontrol. Belirgin şekilde sıcak mı?', NULL, 'hot_drag', 60),
        ('Default Test Checklist', 36, 'Sağ arka disk — Aynı kontrol. Belirgin şekilde sıcak mı?', NULL, 'hot_drag', 60),
        ('Default Test Checklist', 37, 'N''de aracı ittir — Soğuk teste kıyasla artan direnç var mı? Isınma ile kötüleşiyorsa sıkma kesindir.', NULL, 'hot_drag', 60),
        ('Default Test Checklist', 38, 'Kapı / Kaput ayarı — Görsel kontrol. Fotoğraf ilet.', NULL, 'eng_quality', 70),
        ('Default Test Checklist', 39, 'Boya kalitesi — Görsel kontrol. Fotoğraf ilet.', NULL, 'eng_quality', 70),
        ('Default Test Checklist', 40, 'Trim & Bagaj — İç trim, dış trim düzgün mü? Bagaj yüksekliği doğru mu?', NULL, 'eng_quality', 70),
        ('Default Test Checklist', 41, 'Tam dönüş kontrolü — Düşük hızda tam sağ/sol manevra. Sürtme, vuruntu veya aks sesi var mı?', NULL, 'eng_quality', 70),
        ('Default Test Checklist', 42, 'DTC / Diyagnostik tarama — Aktif veya geçmiş hata varsa kayıt altına al. Tarama bitiş saatini not et.', NULL, 'eng_quality', 70),
        ('Default Test Checklist', 43, 'Mühendis Nihai Onayı', NULL, 'eng_quality', 70)
),
-- Printed form items (docs/21_KAREA_Yeni_Formlar.md), text and columns copied
-- verbatim. seed_key = '<form_code>:<form_item_ref>' (Karar 30), so a later
-- text correction keeps its identity. form_revision / form_published_at stay
-- NULL until the quality team supplies them. KY.FR-19 has no 43-45 on paper
-- and its "Gereklilik" column is empty, hence acceptance_criterion NULL.
-- section_key / section_sort must equal EOL_CHECKLIST_SECTIONS in
-- shared/checklistSections.ts.
form_items (
    template_name,
    item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort,
    form_code,
    form_item_ref,
    acceptance_criterion,
    control_method
) AS (
    VALUES
        -- KY.FR-09 End Of Line Kontrol Formu: 39 items, branch, item_no 1-39
        ('Default EoL Template (Branch + Depot)', 1::SMALLINT, 'Araç kimliği ve varyant', 'BRANCH'::eol_item_phase_enum, 'eol_entry', 10, 'KY.FR-09', 'E001', 'Araç ve kayıt bilgileri eşleşmeli', 'Kayıt / etiket karşılaştırma'),
        ('Default EoL Template (Branch + Depot)', 2, 'Üretim teslim kaydı', 'BRANCH', 'eol_entry', 10, 'KY.FR-09', 'E002', 'Üretim tamam; açık uygunsuzluk olmamalı', 'Üretim kaydı inceleme'),
        ('Default EoL Template (Branch + Depot)', 3, 'Genel boya ve kozmetik kontrolü', 'BRANCH', 'eol_exterior', 20, 'KY.FR-09', 'E003', 'Kusur kataloğu sınırları içinde olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 4, 'Sol kapı contası', 'BRANCH', 'eol_exterior', 20, 'KY.FR-09', 'E004', 'Tam oturmuş; yırtık ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 5, 'Sağ kapı contası', 'BRANCH', 'eol_exterior', 20, 'KY.FR-09', 'E005', 'Tam oturmuş; yırtık ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 6, 'Bagaj kapağı contası', 'BRANCH', 'eol_exterior', 20, 'KY.FR-09', 'E006', 'Tam oturmuş; yırtık ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 7, 'Sol kapı gap / flush', 'BRANCH', 'eol_gap_flush', 30, 'KY.FR-09', 'E007', 'Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı', 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 8, 'Sağ kapı gap / flush', 'BRANCH', 'eol_gap_flush', 30, 'KY.FR-09', 'E008', 'Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı', 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 9, 'Bagaj kapağı gap / flush', 'BRANCH', 'eol_gap_flush', 30, 'KY.FR-09', 'E009', 'Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı', 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 10, 'Ön kaput gap / flush', 'BRANCH', 'eol_gap_flush', 30, 'KY.FR-09', 'E010', 'Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı', 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 11, 'Sol / sağ ön çamurluk kaplamaları', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E011', 'Tam oturmuş; kırık ve eksik parça olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 12, 'Sol / sağ arka çamurluk kaplamaları', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E012', 'Tam oturmuş; kırık ve eksik parça olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 13, 'Sol / sağ far hizası ve çerçeveleri', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E013', 'Hizalı, tam oturmuş ve hasarsız olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 14, 'Sol / sağ dış ayna gövdesi', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E014', 'Tam oturmuş, sağlam ve hasarsız olmalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 15, 'Sol / sağ cam çerçevesi ve çıtaları', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E015', 'Tam oturmuş; açıklık ve hasar olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 16, 'Sol / sağ ayna kapağı yapışması', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E016', 'Tam yapışmış; kalkma ve taşma olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 17, 'Arka kamera fiziksel montajı', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E017', 'Tam oturmuş; lens temiz ve hasarsız olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 18, 'Araç dışı logolar', 'BRANCH', 'eol_exterior_2', 40, 'KY.FR-09', 'E018', 'Doğru konumda, hizalı ve hasarsız olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 19, 'Ön konsol / ekran / havalandırma çerçeveleri', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E019', 'Tam oturmuş; çizik, kırık ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 20, 'Orta konsol ve konsol kapakları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E020', 'Tam oturmuş; çizik, kırık ve açıklık olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 21, 'Sol kapı iç döşemesi', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E021', 'Tam oturmuş; hasar ve açıklık olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 22, 'Sağ kapı iç döşemesi', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E022', 'Tam oturmuş; hasar ve açıklık olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 23, 'Tavan döşemesi', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E023', 'Sarkma, kırışma, kir ve hasar olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 24, 'Sol iç yan döşeme', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E024', 'Tam oturmuş; hasar ve açıklık olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 25, 'Sağ iç yan döşeme', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E025', 'Tam oturmuş; hasar ve açıklık olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 26, 'Bagaj iç döşemesi / taban', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E026', 'Tam oturmuş; leke, hasar ve gevşeklik olmamalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 27, 'Taban döşemesi / eşik kaplamaları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E027', 'Düzgün serilmiş; açık kenar ve eksik parça olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 28, 'Araç içi klips, kapak ve tapalar', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E028', 'Tam ve yerinde; gevşek parça olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 29, 'Bagaj içi yapıştırıcı / sızdırmazlık uygulaması', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E029', 'Kesintisiz ve doğru bölgede uygulanmış olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 30, 'Bagaj amortisörleri ve çevre boyası', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E030', 'Sağlam takılmış; çevre boyası hasarsız olmalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 31, 'Sürücü / yolcu koltukları ve yan kapakları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E031', 'Döşeme ve yan kapaklar tam ve hasarsız olmalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 32, 'Sol ön konsol alt kapağı', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E032', 'Tam oturmuş; eksik klips ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 33, 'Sağ ön konsol alt kapağı', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E033', 'Tam oturmuş; eksik klips ve açıklık olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 34, 'İç dikiz aynası', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E034', 'Sağlam, temiz ve hasarsız olmalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 35, 'Sol / sağ emniyet kemeri ve askıları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E035', 'Tam, hasarsız, burulmamış ve sıkışmamış olmalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 36, 'Araç kimlik kartı ve tanımlama etiketleri', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E036', 'Bilgiler eşleşmeli; okunaklı ve hasarsız olmalı', 'Kayıt / görsel karşılaştırma'),
        ('Default EoL Template (Branch + Depot)', 37, 'Bagaj kapağı iç yüzeyi ve kaplamaları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E037', 'Tam ve hasarsız; gevşek parça olmamalı', 'Görsel / elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 38, 'Direksiyon / anahtar üzeri logo', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E038', 'Doğru konumda, yapışmış ve hasarsız olmalı', 'Görsel'),
        ('Default EoL Template (Branch + Depot)', 39, 'Sol / sağ ayna iç kapakları', 'BRANCH', 'eol_interior', 50, 'KY.FR-09', 'E039', 'Tam oturmuş; kırık ve eksik klips olmamalı', 'Görsel / elle kontrol'),

        -- KY.FR-19 Final Kalite Kontrol Formu: 56 items, depot, item_no 47-102
        ('Default EoL Template (Branch + Depot)', 47, 'Şasi ve seri numarası okunaklı ve doğru', 'DEPOT', 'final_identity', 110, 'KY.FR-19', '1', NULL, 'Doküman/Etiket kontrol'),
        ('Default EoL Template (Branch + Depot)', 48, 'Model ve versiyon etiketi doğru', 'DEPOT', 'final_identity', 110, 'KY.FR-19', '2', NULL, 'Doküman/Etiket kontrol'),
        ('Default EoL Template (Branch + Depot)', 49, 'Sevkiyat evrakları, irsaliye ve teslim formu hazır', 'DEPOT', 'final_identity', 110, 'KY.FR-19', '3', NULL, 'Doküman/Etiket kontrol'),
        ('Default EoL Template (Branch + Depot)', 50, 'Kullanım kılavuzu ve garanti dokümanı mevcut', 'DEPOT', 'final_identity', 110, 'KY.FR-19', '4', NULL, 'Doküman/Etiket kontrol'),
        ('Default EoL Template (Branch + Depot)', 51, 'Anahtar, uzaktan kumanda ve aksesuar seti tam', 'DEPOT', 'final_identity', 110, 'KY.FR-19', '5', NULL, 'Doküman/Etiket kontrol'),
        ('Default EoL Template (Branch + Depot)', 52, 'Boya yüzeyi homojen, portakal kabuğu, akma ve kabarcık yok', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '6', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 53, 'Çizik, göçük ve deformasyon yok', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '7', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 54, 'Keskin kenar ve çapak yok', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '8', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 55, 'Panel boşlukları dengeli ve simetrik', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '9', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 56, 'Logolar ve etiketler düzgün yapışmış ve hizalı', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '10', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 57, 'Cam ve pleksi yüzeylerde çatlak veya kırık yok', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '11', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 58, 'Silecekler ve cam suyu sistemi tam fonksiyonlu çalışıyor', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '12', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 59, 'Aynalar sorunsuz ayarlanabiliyor', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '13', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 60, 'Far konumlandırması', 'DEPOT', 'final_exterior', 120, 'KY.FR-19', '14', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 61, 'Kapılar düzgün kapanıyor ve açılıyor', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '15', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 62, 'Cam açma ve kapama mekanizmaları sorunsuz çalışıyor', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '16', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 63, 'Kapı menteşe bağlantıları sağlam ve gevşeklik yok', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '17', NULL, 'Elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 64, 'Kapı kilit mekanizması çalışıyor', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '18', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 65, 'Kapı fitilleri düzgün ve kopuk değil', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '19', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 66, 'Kapı boşluk ve hiza uyumu standartlar dahilinde', 'DEPOT', 'final_doors', 130, 'KY.FR-19', '20', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 67, 'Koltuklar sabit ve sağlam', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '21', NULL, 'Elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 68, 'Emniyet kemerleri mevcut ve mekanizması çalışır durumda', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '22', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 69, 'Trim parçalarında kırık ve çatlak yok', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '23', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 70, 'Keskin kenar ve dışarı çıkan vida yok', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '24', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 71, 'Klima ve havalandırma sistemi fonksiyonel çalışıyor', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '25', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 72, 'Multimedya ve bilgi ekranları sorunsuz çalışıyor', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '26', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 73, 'Pedallar, kollar ve mandallar serbest hareket ediyor', 'DEPOT', 'final_interior', 140, 'KY.FR-19', '27', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 74, 'Tekerlek bijonları sabit ve gevşeklik yok', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '28', NULL, 'Elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 75, 'Lastiklerde hasar yok ve basınç seviyeleri uygun', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '29', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 76, 'Süspansiyon bağlantılarında gevşeklik yok', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '30', NULL, 'Elle kontrol'),
        ('Default EoL Template (Branch + Depot)', 77, 'Direksiyon boşluğu standart limitler dahilinde', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '31', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 78, 'Fren sistemi statik olarak çalışıyor', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '32', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 79, 'Fren hortum ve hatlarında sıvı kaçağı yok', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '33', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 80, 'Alt takımda sürtme ve temas izi yok', 'DEPOT', 'final_mechanical', 150, 'KY.FR-19', '34', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 81, 'Kontak ve ana güç sistemi çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '35', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 82, 'Kısa ve uzun farlar çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '36', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 83, 'Sağ ve sol sinyaller çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '37', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 84, 'Stop lambaları çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '38', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 85, 'Geri vites ikaz sistemi çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '39', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 86, 'Korna ve dış uyarı sesi çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '40', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 87, 'Gösterge paneli uyarı ışıkları eksiksiz çalışıyor', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '41', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 88, 'Şarj soketi ve koruyucu kapağı sağlam', 'DEPOT', 'final_electrical', 160, 'KY.FR-19', '42', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 89, 'İleri ve geri hareket komutu doğru', 'DEPOT', 'final_function', 170, 'KY.FR-19', '46', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 90, 'Hızlanma tepkisi standartlara uygun', 'DEPOT', 'final_function', 170, 'KY.FR-19', '47', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 91, 'Rejeneratif ve elektronik frenleme normal', 'DEPOT', 'final_function', 170, 'KY.FR-19', '48', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 92, 'Park freni sistemi çalışıyor', 'DEPOT', 'final_function', 170, 'KY.FR-19', '49', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 93, 'Düz yolda doğrusal ilerleme sağlanıyor', 'DEPOT', 'final_road_test', 180, 'KY.FR-19', '50', NULL, 'Sürüş testi'),
        ('Default EoL Template (Branch + Depot)', 94, 'Frenleme sırasında araca sapma etkisi yok', 'DEPOT', 'final_road_test', 180, 'KY.FR-19', '51', NULL, 'Sürüş testi'),
        ('Default EoL Template (Branch + Depot)', 95, 'Dönüşlerde anormal mekanik ses yok', 'DEPOT', 'final_road_test', 180, 'KY.FR-19', '52', NULL, 'Sürüş testi'),
        ('Default EoL Template (Branch + Depot)', 96, 'Titreşim ve rezonans değerleri standartlar dahilinde', 'DEPOT', 'final_road_test', 180, 'KY.FR-19', '53', NULL, 'Sürüş testi'),
        ('Default EoL Template (Branch + Depot)', 97, 'Sürüş sırasında panelde uyarı veya arıza ışığı yanmıyor', 'DEPOT', 'final_road_test', 180, 'KY.FR-19', '54', NULL, 'Sürüş testi'),
        ('Default EoL Template (Branch + Depot)', 98, 'Araç iç ve dış temizliği sevk standartlarına uygun', 'DEPOT', 'final_shipment', 190, 'KY.FR-19', '55', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 99, 'Koruyucu ambalaj ve kaplama doğru uygulanmış', 'DEPOT', 'final_shipment', 190, 'KY.FR-19', '56', NULL, 'Fonksiyon kontrol'),
        ('Default EoL Template (Branch + Depot)', 100, 'Sevkiyat etiketi ve yönlendirme işaretleri uygun', 'DEPOT', 'final_shipment', 190, 'KY.FR-19', '57', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 101, 'Şarj seviyesi son kullanıcı teslimatı için yeterli seviyede', 'DEPOT', 'final_shipment', 190, 'KY.FR-19', '58', NULL, 'Görsel kontrol'),
        ('Default EoL Template (Branch + Depot)', 102, 'Odo kontrol', 'DEPOT', 'final_shipment', 190, 'KY.FR-19', '59', NULL, 'Görsel kontrol')
),
template_items AS (
    SELECT l.template_name, l.item_no, l.item_text, l.eol_phase,
           l.section_key::text AS section_key, l.section_sort,
           NULL::text AS form_code, NULL::text AS form_item_ref,
           NULL::text AS acceptance_criterion, NULL::text AS control_method,
           md5(l.item_text) AS seed_key
    FROM legacy_items l
    UNION ALL
    SELECT f.template_name, f.item_no, f.item_text, f.eol_phase,
           f.section_key, f.section_sort::smallint,
           f.form_code, f.form_item_ref,
           f.acceptance_criterion, f.control_method,
           f.form_code || ':' || f.form_item_ref AS seed_key
    FROM form_items f
),
missing AS (
    SELECT
        template.id AS template_id,
        seed.*,
        EXISTS (
            SELECT 1
            FROM checklist_template_items slot
            WHERE slot.template_id = template.id
              AND slot.item_no = seed.item_no
        ) AS slot_taken
    FROM template_items seed
    JOIN checklist_templates template
      ON template.name = seed.template_name
     AND template.vehicle_model_id IS NULL
    WHERE NOT EXISTS (
        SELECT 1
        FROM checklist_template_items existing
        WHERE existing.template_id = template.id
          AND existing.seed_key = seed.seed_key
    )
),
placed AS (
    SELECT
        m.*,
        CASE
            WHEN NOT m.slot_taken THEN m.item_no
            ELSE (
                GREATEST(
                    (SELECT COALESCE(MAX(i.item_no), 0)
                     FROM checklist_template_items i
                     WHERE i.template_id = m.template_id),
                    (SELECT MAX(s.item_no)
                     FROM template_items s
                     WHERE s.template_name = m.template_name)
                ) + ROW_NUMBER() OVER (
                    PARTITION BY m.template_id, m.slot_taken
                    ORDER BY m.item_no
                )
            )::SMALLINT
        END AS target_item_no
    FROM missing m
)
INSERT INTO checklist_template_items (
    template_id,
    item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort,
    is_active,
    seed_key,
    form_code,
    form_item_ref,
    acceptance_criterion,
    control_method
)
SELECT
    template_id,
    target_item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort,
    TRUE,
    seed_key,
    form_code,
    form_item_ref,
    acceptance_criterion,
    control_method
FROM placed
ON CONFLICT (template_id, item_no) DO NOTHING;
