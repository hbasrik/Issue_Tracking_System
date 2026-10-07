-- Populate default EOL / SHIPMENT / TEST templates (migration 0002).
-- Source: live DB active checklist_template_items (exact text, incl. trailing newlines).
-- Insert-only: existing items are never updated, so admin edits to text,
-- phase, section, order and is_active survive a re-run.
-- A seed item counts as present when any row in its template carries
-- seed_key = md5(seed text) (migration 0034). item_no is only a position
-- (reorder renumbers it) and is never used to match. A missing item is
-- re-added at its original item_no when that slot is free, otherwise after
-- the last item.
-- Excludes inactive and test-only items (see seed README / task report).
-- section_key / section_sort must equal the migrations (TEST: 0035, by item
-- content; SHIPMENT: 0036, consecutive work steps) and
-- shared/checklistSections.ts; change them together.
WITH template_items (
    template_name,
    item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort
) AS (
    VALUES

        -- EOL: 15 active items
        ('Default EoL Template (Branch + Depot)', 1::SMALLINT, 'Software Update', 'BRANCH'::eol_item_phase_enum, NULL::varchar, NULL::smallint),
        ('Default EoL Template (Branch + Depot)', 2, 'Araç Motoru', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 3, 'Batarya', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 4, 'Süspansiyon Testi', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 5, 'Fonksiyonel Komponet Kontrolü', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 6, 'Fren/El Testi', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 7, 'Far Ayarı', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 8, 'Rot Balans', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 9, 'Sürüş', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 10, 'Görsel Kontrol', 'BRANCH', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 11, 'Depo Sürüş', 'DEPOT', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 12, 'Bumpy Road', 'DEPOT', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 13, 'Yağmur Testi', 'DEPOT', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 14, 'EE Check', 'DEPOT', NULL, NULL),
        ('Default EoL Template (Branch + Depot)', 15, 'Görsel Kontrol 2', 'DEPOT', NULL, NULL),

        -- SHIPMENT: 46 active items
        ('Default Customer Vehicle Checklist', 1, E'Rear Bota Ses İzolasyonu Montaj\n', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 2, 'Front Dash Ses İzolasyonu Montaj', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 3, 'Sol Air Flap Montaj', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 4, 'Sağ Air Flap Montaj', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 5, 'C_Pillar Inner Sol Kesim', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 6, E'C_Pillar Inner Sağ Kesim\n', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 7, 'Polen Filtresi Montaj', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 8, 'C_Pillar Inner Support M5 Delik Sağ', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 9, 'C_Pillar Inner Support M5 Delik Sol', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 10, 'C_Pillar Yeni Clips Değişmesi', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 11, 'C_Pillar Stop tırnaklarının kesilmesi', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 12, 'Headliner Yeni Clips Değişmesi', NULL, 'interior_fit', 10),
        ('Default Customer Vehicle Checklist', 13, 'Knuckle 2,5 mm Slot Açılması ve 1 derece Ayarı', NULL, 'chassis_exterior', 20),
        ('Default Customer Vehicle Checklist', 14, 'CCB Korna Şasi Almaması Dolaylı Harness', NULL, 'chassis_exterior', 20),
        ('Default Customer Vehicle Checklist', 15, 'Kapı direk plastik parça sıvı conta uygulaması', NULL, 'chassis_exterior', 20),
        ('Default Customer Vehicle Checklist', 16, 'Ayarlı dış aynaların takılması', NULL, 'chassis_exterior', 20),
        ('Default Customer Vehicle Checklist', 17, 'Logo montajı', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 18, E'Anahtarlık logosu değişimi\n', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 19, 'Direksiyon Logo Değişimi', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 20, 'Jant Logo Değişimi', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 21, E'HVAC kapama parçası takılması\n', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 22, E'Trunk Diveder parça takılması\n', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 23, E'Araç tanıtım etiketi perçinlenmesi\n', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 24, 'VIN markalaması', NULL, 'badges_trim', 30),
        ('Default Customer Vehicle Checklist', 25, 'Kapı ayar kauçuklarının takılması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 26, 'Kaput ayar kauçuklarının takılması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 27, 'Chogori IP68 kablonun araca konulması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 28, 'Anti Scratch film tampona kaplanması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 29, 'Anti Fog Film cama kaplanması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 30, 'Kaput altı sızdırmazlık contasının kullanılması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 31, 'P silinmiş combination switch kullanılması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 32, 'Kelebek camı düşmemesi için sünger konulması', NULL, 'rubber_film', 40),
        ('Default Customer Vehicle Checklist', 33, 'El Fren Ayarı yapılması ve arka disklere denk gelen noktada doğru konumlanması', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 34, 'IP yanı kapı harness ve kapı clips bölgesinde sızdırmazlıkların tam olması', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 35, 'Arka kapı sağ alt sızdırmazlık şeridi çekilmesi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 36, 'Arka kapı sol alt sızdırmazlık şeridi çekilmesi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 37, 'Arka kapı sağ üst sızdırmazlık şeridi çekilmesi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 38, 'Arka kapı sol üst sızdırmazlık şeridi çekilmesi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 39, 'Arka davlumbaz sol fren borusu girişim bölgesi kesimi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 40, 'Arka davlumbaz sağ fren borusu girişim bölgesi kesimi', NULL, 'brake_sealing', 50),
        ('Default Customer Vehicle Checklist', 41, E'Direksiyon yumusatma ayari\n', NULL, 'final_adjust', 60),
        ('Default Customer Vehicle Checklist', 42, E'Stop delik genisletme yapildi mi\n', NULL, 'final_adjust', 60),
        ('Default Customer Vehicle Checklist', 43, 'Kaput ayar pulu atıldı mı', NULL, 'final_adjust', 60),
        ('Default Customer Vehicle Checklist', 44, 'Direksiyon kolonu dip lastiği yerine tam olarak oturmuş mu', NULL, 'final_adjust', 60),
        ('Default Customer Vehicle Checklist', 45, 'Kaput civatalarinin piano black rötuş kalemi ile boyanmasi', NULL, 'final_adjust', 60),
        ('Default Customer Vehicle Checklist', 46, 'Bagaj kapagi su sizdirma problemi parca entegrasyonu', NULL, 'final_adjust', 60),

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
missing AS (
    SELECT
        template.id AS template_id,
        seed.*,
        md5(seed.item_text) AS seed_key,
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
          AND existing.seed_key = md5(seed.item_text)
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
    seed_key
)
SELECT
    template_id,
    target_item_no,
    item_text,
    eol_phase,
    section_key,
    section_sort,
    TRUE,
    seed_key
FROM placed
ON CONFLICT (template_id, item_no) DO NOTHING;
