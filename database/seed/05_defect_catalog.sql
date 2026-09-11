-- Idempotent defect classification catalogue (docs/15_KAREA_Hata_Kodu_Katalogu_Taslak.md).

-- Processes (sorumlu süreç)
WITH seed (code, name_tr, name_en, sort_order) AS (
    VALUES
        ('WELD', 'Kaynak', 'Welding', 1::SMALLINT),
        ('PAINT', 'Boya', 'Paint', 2),
        ('ASSEMBLY', 'Montaj', 'Assembly', 3),
        ('ELECTRICAL', 'Elektrik', 'Electrical', 4)
)
INSERT INTO defect_processes (code, name_tr, name_en, sort_order, is_active)
SELECT s.code, s.name_tr, s.name_en, s.sort_order, TRUE
FROM seed s
ON CONFLICT (code) DO UPDATE SET
    name_tr = EXCLUDED.name_tr,
    name_en = EXCLUDED.name_en,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Zones (parça grubu)
WITH seed (code, name_tr, name_en, sort_order) AS (
    VALUES
        ('10', 'Body', 'Body', 1::SMALLINT),
        ('20', 'Şasi', 'Chassis', 2),
        ('30', 'Trim', 'Trim', 3),
        ('40', 'Elektrik', 'Electrical', 4)
)
INSERT INTO defect_zones (code, name_tr, name_en, sort_order, is_active)
SELECT s.code, s.name_tr, s.name_en, s.sort_order, TRUE
FROM seed s
ON CONFLICT (code) DO UPDATE SET
    name_tr = EXCLUDED.name_tr,
    name_en = EXCLUDED.name_en,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Parts (23 + Diğer). Part code embeds zone prefix (10-01 …).
WITH seed (zone_code, code, name_tr, name_en, sort_order) AS (
    VALUES
        ('10', '10-01', 'Kapı', 'Door', 1::SMALLINT),
        ('10', '10-02', 'Bagaj kapağı / Tailgate', 'Tailgate / liftgate', 2),
        ('10', '10-03', 'C-Pillar / Direk', 'C-pillar', 3),
        ('10', '10-04', 'Tampon', 'Bumper', 4),
        ('10', '10-05', 'Kaput', 'Hood', 5),
        ('10', '10-06', 'Çamurluk / Fender', 'Fender', 6),
        ('10', '10-07', 'Tavan', 'Roof', 7),
        ('10', '10-08', 'Spoiler', 'Spoiler', 8),
        ('10', '10-09', 'Doghouse', 'Doghouse', 9),
        ('20', '20-01', 'Şasi / Süspansiyon', 'Chassis / suspension', 1),
        ('20', '20-02', 'Fren / Hidrolik hattı', 'Brake / hydraulic line', 2),
        ('20', '20-03', 'Bağlantı elemanı (perçin, somun, vida, klips, saplama)', 'Fastener (rivet, nut, screw, clip, stud)', 3),
        ('30', '30-01', 'Trim / Çıta / Garnish', 'Trim / moulding / garnish', 1),
        ('30', '30-02', 'Cam', 'Glass', 2),
        ('30', '30-03', 'Ayna', 'Mirror', 3),
        ('30', '30-04', 'Menteşe / Kilit', 'Hinge / lock', 4),
        ('30', '30-05', 'Conta / Sızdırmazlık elemanı', 'Seal / weatherstrip', 5),
        ('30', '30-06', 'Logo / Amblem', 'Logo / emblem', 6),
        ('30', '30-07', 'İç mekân (koltuk, konsol, direksiyon, panel, döşeme)', 'Interior (seat, console, steering, panel, trim)', 7),
        ('40', '40-01', 'Far / Stop / Aydınlatma', 'Lamp / lighting', 1),
        ('40', '40-02', 'Kablo / Soket / Tesisat', 'Cable / connector / harness', 2),
        ('40', '40-03', 'Şarj sistemi / Yüksek voltaj', 'Charging / high voltage', 3),
        ('40', '40-04', 'Klima / Fan', 'HVAC / fan', 4),
        -- Diğer: attach to Body zone for FK; code 99-99 is zone-independent
        ('10', '99-99', 'Diğer', 'Other', 99)
)
INSERT INTO defect_parts (zone_id, code, name_tr, name_en, sort_order, is_active)
SELECT z.id, s.code, s.name_tr, s.name_en, s.sort_order, TRUE
FROM seed s
JOIN defect_zones z ON z.code = s.zone_code
ON CONFLICT (code) DO UPDATE SET
    zone_id = EXCLUDED.zone_id,
    name_tr = EXCLUDED.name_tr,
    name_en = EXCLUDED.name_en,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Defect types with default process mapping
WITH seed (code, name_tr, name_en, process_code, sort_order) AS (
    VALUES
        ('01', 'Boşluk / hizasızlık', 'Gap / misalignment', 'ASSEMBLY', 1::SMALLINT),
        ('02', 'Yüzey / boya hatası', 'Surface / paint defect', 'PAINT', 2),
        ('03', 'Çizik / darbe / hasar', 'Scratch / impact / damage', 'ASSEMBLY', 3),
        ('04', 'Deformasyon', 'Deformation', 'WELD', 4),
        ('05', 'Eksik / yanlış parça', 'Missing / wrong part', 'ASSEMBLY', 5),
        ('06', 'Bağlantı / tork sorunu', 'Fastener / torque issue', 'ASSEMBLY', 6),
        ('07', 'Sızdırma', 'Leak', 'ASSEMBLY', 7),
        ('08', 'Fonksiyon çalışmıyor', 'Function not working', 'ELECTRICAL', 8),
        ('09', 'Ses / titreşim', 'Noise / vibration', 'ASSEMBLY', 9),
        ('99', 'Diğer', 'Other', NULL, 99)
)
INSERT INTO defect_types (code, name_tr, name_en, default_process_id, sort_order, is_active)
SELECT s.code, s.name_tr, s.name_en, p.id, s.sort_order, TRUE
FROM seed s
LEFT JOIN defect_processes p ON p.code = s.process_code
ON CONFLICT (code) DO UPDATE SET
    name_tr = EXCLUDED.name_tr,
    name_en = EXCLUDED.name_en,
    default_process_id = EXCLUDED.default_process_id,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
