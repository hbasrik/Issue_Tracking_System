-- Shipment checklist sections follow the work order.
--
-- The shipment list is done step by step, so item order matters. The
-- category sections of 0035 scattered the steps (the list opened at #17).
-- Six sections now cover consecutive steps of today's order:
--   interior_fit 10 (#1-12), chassis_exterior 20 (#13-16),
--   badges_trim 30 (#17-24), rubber_film 40 (#25-32),
--   brake_sealing 50 (#33-40), final_adjust 60 (#41-46)
-- The numbers only describe today's order: every item is matched on its own
-- seed_key (migration 0034), never on item_no or a range, so a reorder or a
-- text edit cannot move an assignment to another item.
--
-- The TEST template is not touched. Idempotent: rows already holding the
-- target value are skipped. On a fresh install seed 03 inserts the items
-- with the same values. Item text, item_no and is_active are not touched.

WITH assignment (seed_key, section_key, section_sort) AS (
    VALUES
        ('9a8828a6a118b77a7dde6c0f59d7a92b', 'interior_fit'::varchar, 10::smallint), -- #1 Rear Bota Ses İzolasyonu Montaj
        ('2f262bc2a7b216be90a5ee40d1f76a7c', 'interior_fit', 10), -- #2 Front Dash Ses İzolasyonu Montaj
        ('7a0377802d13e17f35e066fb8d1bc894', 'interior_fit', 10), -- #3 Sol Air Flap Montaj
        ('65967c8c9f301566138386e81191c1bc', 'interior_fit', 10), -- #4 Sağ Air Flap Montaj
        ('be0a979a8ef79a6e3bc18cde3497ad70', 'interior_fit', 10), -- #5 C_Pillar Inner Sol Kesim
        ('02e7d2250bcdb810791360eb1b810ac8', 'interior_fit', 10), -- #6 C_Pillar Inner Sağ Kesim
        ('7b3c1cb4561779f663ed85ceddae4eea', 'interior_fit', 10), -- #7 Polen Filtresi Montaj
        ('c3075119eb7418324512d1db66b4bf18', 'interior_fit', 10), -- #8 C_Pillar Inner Support M5 Delik Sağ
        ('a36a70d0a783034df17a38891e7d1e0e', 'interior_fit', 10), -- #9 C_Pillar Inner Support M5 Delik Sol
        ('6836b29fdd5479ad8170df3a5e98589e', 'interior_fit', 10), -- #10 C_Pillar Yeni Clips Değişmesi
        ('6357daaca853527785e5350aab0f7a3c', 'interior_fit', 10), -- #11 C_Pillar Stop tırnaklarının kesilmesi
        ('30d50201836fcfd49ed85659b97c2046', 'interior_fit', 10), -- #12 Headliner Yeni Clips Değişmesi
        ('607e77e1cde0e0ca8626c34bf4f60eaa', 'chassis_exterior', 20), -- #13 Knuckle 2,5 mm Slot Açılması ve 1 derece Ayarı
        ('bed6e0e9886106b6e2536bfe18b0ad10', 'chassis_exterior', 20), -- #14 CCB Korna Şasi Almaması Dolaylı Harness
        ('da9f1f89b074ac3c3e81498f56e7b41f', 'chassis_exterior', 20), -- #15 Kapı direk plastik parça sıvı conta uygulaması
        ('b7e33fe0bac808b28141aff0ee184200', 'chassis_exterior', 20), -- #16 Ayarlı dış aynaların takılması
        ('3a2f650f64094ab435e1822455cbc933', 'badges_trim', 30), -- #17 Logo montajı
        ('02ccf5bb382ee7c0355bffaee3bcf14d', 'badges_trim', 30), -- #18 Anahtarlık logosu değişimi
        ('c09a731f961a9dcdde271e33769d6717', 'badges_trim', 30), -- #19 Direksiyon Logo Değişimi
        ('6ea240280395957663c24f5af89e10eb', 'badges_trim', 30), -- #20 Jant Logo Değişimi
        ('e4ad1e66c8b0bb43d7e73c43837b4afd', 'badges_trim', 30), -- #21 HVAC kapama parçası takılması
        ('ea8381fb904b7187d1271ada53422287', 'badges_trim', 30), -- #22 Trunk Diveder parça takılması
        ('fa3e5fa62014b966f691db6d7a864e41', 'badges_trim', 30), -- #23 Araç tanıtım etiketi perçinlenmesi
        ('cbb9da84d3d2d15384b6559aa9871ebb', 'badges_trim', 30), -- #24 VIN markalaması
        ('8eb0f9b3929bd1ab67abfbb43fbe08e3', 'rubber_film', 40), -- #25 Kapı ayar kauçuklarının takılması
        ('4167ab5f10996cf22679464b9c38e063', 'rubber_film', 40), -- #26 Kaput ayar kauçuklarının takılması
        ('c6a77250b4fbc682b300de37b12d68fc', 'rubber_film', 40), -- #27 Chogori IP68 kablonun araca konulması
        ('7365e2e4fc2a47342a4448b190afe1b8', 'rubber_film', 40), -- #28 Anti Scratch film tampona kaplanması
        ('a85e56a7f2a5c46da147501855ac52e8', 'rubber_film', 40), -- #29 Anti Fog Film cama kaplanması
        ('e411cc1ec169d717a8be641c097ac87a', 'rubber_film', 40), -- #30 Kaput altı sızdırmazlık contasının kullanılması
        ('d525e6d9de4208edbd4ccf4a65c56563', 'rubber_film', 40), -- #31 P silinmiş combination switch kullanılması
        ('d6fba04afbc3387563e75ae84bd1b9ff', 'rubber_film', 40), -- #32 Kelebek camı düşmemesi için sünger konulması
        ('19d578f041db070fc9d40bb7c866af44', 'brake_sealing', 50), -- #33 El Fren Ayarı yapılması ve arka disklere denk gelen noktada doğru k...
        ('7109fc06f7762e8a730970debf90ab3c', 'brake_sealing', 50), -- #34 IP yanı kapı harness ve kapı clips bölgesinde sızdırmazlıkların tam...
        ('2ec91f5f16c977cb8cc82ff4a822d02e', 'brake_sealing', 50), -- #35 Arka kapı sağ alt sızdırmazlık şeridi çekilmesi
        ('e79616ed47ddbb9abbe5e37c6d957fab', 'brake_sealing', 50), -- #36 Arka kapı sol alt sızdırmazlık şeridi çekilmesi
        ('474f4211a20c6d592019afc4d821f42d', 'brake_sealing', 50), -- #37 Arka kapı sağ üst sızdırmazlık şeridi çekilmesi
        ('5d1828a0221f68001cc12c1549299582', 'brake_sealing', 50), -- #38 Arka kapı sol üst sızdırmazlık şeridi çekilmesi
        ('798b3ad7fe6b0d6cff2de5580977bfbe', 'brake_sealing', 50), -- #39 Arka davlumbaz sol fren borusu girişim bölgesi kesimi
        ('ea91c0c4227723021ec0ef7cd33bdbfa', 'brake_sealing', 50), -- #40 Arka davlumbaz sağ fren borusu girişim bölgesi kesimi
        ('470d3e1e16309595258954c8fa23a339', 'final_adjust', 60), -- #41 Direksiyon yumusatma ayari
        ('837e5f410e0d783eaeb768469527886e', 'final_adjust', 60), -- #42 Stop delik genisletme yapildi mi
        ('c7764a85eae5291f15956320b762a839', 'final_adjust', 60), -- #43 Kaput ayar pulu atıldı mı
        ('15ef46e34134a2001cf7d1c53f40575e', 'final_adjust', 60), -- #44 Direksiyon kolonu dip lastiği yerine tam olarak oturmuş mu
        ('cba0ddbd5b20363ef73e42bf1a456bc6', 'final_adjust', 60), -- #45 Kaput civatalarinin piano black rötuş kalemi ile boyanmasi
        ('c7b7d42948b64eeb8c04a31e4c77687c', 'final_adjust', 60) -- #46 Bagaj kapagi su sizdirma problemi parca entegrasyonu
)
UPDATE checklist_template_items i
SET section_key = a.section_key,
    section_sort = a.section_sort
FROM assignment a
JOIN checklist_templates t
  ON t.type = 'SHIPMENT'
 AND t.vehicle_model_id IS NULL
WHERE i.template_id = t.id
  AND i.seed_key = a.seed_key
  AND (i.section_key IS DISTINCT FROM a.section_key
       OR i.section_sort IS DISTINCT FROM a.section_sort);

-- The seven 0035 category keys leave the catalogue and would render as a raw
-- heading; any other SHIPMENT item still carrying one (e.g. added through
-- the admin UI) becomes unsectioned. The down file cannot restore these.
UPDATE checklist_template_items i
SET section_key = NULL,
    section_sort = NULL
FROM checklist_templates t
WHERE t.id = i.template_id
  AND t.type = 'SHIPMENT'
  AND i.section_key IN ('identity', 'exterior', 'interior', 'closures', 'electrical', 'sealing', 'chassis');
