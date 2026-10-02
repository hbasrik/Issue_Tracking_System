-- Reassign Shipment and Test checklist sections by item content.
--
-- Migration 0024 filled section_key from item_no ranges written for the old
-- placeholder items; the real items took the same numbers, so section names
-- stopped matching item content. Here every item is matched on its own
-- identity, seed_key (migration 0034: md5 of the text at creation, never
-- updated), never on item_no or a range: reordering or text edits cannot
-- move an assignment to another item.
--
-- New catalogue (shared/checklistSections.ts):
--   SHIPMENT identity 10, exterior 20, interior 30, closures 40,
--            electrical 50, sealing 60, chassis 70
--   TEST     cold_drag 10, bcm_ee 20, road_test 30, brake_test 40,
--            alignment 50, hot_drag 60, eng_quality 70
-- TEST #44/#45 (inactive English leftovers) become unsectioned.
--
-- Idempotent: rows already holding the target value are skipped, so a
-- second run updates nothing. On a fresh install the items do not exist yet
-- and seed 03 inserts them with the same values.
-- Item text, item_no and is_active are not touched.

WITH assignment (template_type, seed_key, section_key, section_sort) AS (
    VALUES
        -- SHIPMENT
        ('SHIPMENT', '9a8828a6a118b77a7dde6c0f59d7a92b', 'interior'::varchar, 30::smallint), -- #1 Rear Bota Ses İzolasyonu Montaj
        ('SHIPMENT', '2f262bc2a7b216be90a5ee40d1f76a7c', 'interior', 30), -- #2 Front Dash Ses İzolasyonu Montaj
        ('SHIPMENT', '7a0377802d13e17f35e066fb8d1bc894', 'exterior', 20), -- #3 Sol Air Flap Montaj
        ('SHIPMENT', '65967c8c9f301566138386e81191c1bc', 'exterior', 20), -- #4 Sağ Air Flap Montaj
        ('SHIPMENT', 'be0a979a8ef79a6e3bc18cde3497ad70', 'interior', 30), -- #5 C_Pillar Inner Sol Kesim
        ('SHIPMENT', '02e7d2250bcdb810791360eb1b810ac8', 'interior', 30), -- #6 C_Pillar Inner Sağ Kesim
        ('SHIPMENT', '7b3c1cb4561779f663ed85ceddae4eea', 'interior', 30), -- #7 Polen Filtresi Montaj
        ('SHIPMENT', 'c3075119eb7418324512d1db66b4bf18', 'interior', 30), -- #8 C_Pillar Inner Support M5 Delik Sağ
        ('SHIPMENT', 'a36a70d0a783034df17a38891e7d1e0e', 'interior', 30), -- #9 C_Pillar Inner Support M5 Delik Sol
        ('SHIPMENT', '6836b29fdd5479ad8170df3a5e98589e', 'interior', 30), -- #10 C_Pillar Yeni Clips Değişmesi
        ('SHIPMENT', '6357daaca853527785e5350aab0f7a3c', 'interior', 30), -- #11 C_Pillar Stop tırnaklarının kesilmesi
        ('SHIPMENT', '30d50201836fcfd49ed85659b97c2046', 'interior', 30), -- #12 Headliner Yeni Clips Değişmesi
        ('SHIPMENT', '607e77e1cde0e0ca8626c34bf4f60eaa', 'chassis', 70), -- #13 Knuckle 2,5 mm Slot Açılması ve 1 derece Ayarı
        ('SHIPMENT', 'bed6e0e9886106b6e2536bfe18b0ad10', 'electrical', 50), -- #14 CCB Korna Şasi Almaması Dolaylı Harness
        ('SHIPMENT', 'da9f1f89b074ac3c3e81498f56e7b41f', 'sealing', 60), -- #15 Kapı direk plastik parça sıvı conta uygulaması
        ('SHIPMENT', 'b7e33fe0bac808b28141aff0ee184200', 'exterior', 20), -- #16 Ayarlı dış aynaların takılması
        ('SHIPMENT', '3a2f650f64094ab435e1822455cbc933', 'identity', 10), -- #17 Logo montajı
        ('SHIPMENT', '02ccf5bb382ee7c0355bffaee3bcf14d', 'identity', 10), -- #18 Anahtarlık logosu değişimi
        ('SHIPMENT', 'c09a731f961a9dcdde271e33769d6717', 'identity', 10), -- #19 Direksiyon Logo Değişimi
        ('SHIPMENT', '6ea240280395957663c24f5af89e10eb', 'identity', 10), -- #20 Jant Logo Değişimi
        ('SHIPMENT', 'e4ad1e66c8b0bb43d7e73c43837b4afd', 'interior', 30), -- #21 HVAC kapama parçası takılması
        ('SHIPMENT', 'ea8381fb904b7187d1271ada53422287', 'interior', 30), -- #22 Trunk Diveder parça takılması
        ('SHIPMENT', 'fa3e5fa62014b966f691db6d7a864e41', 'identity', 10), -- #23 Araç tanıtım etiketi perçinlenmesi
        ('SHIPMENT', 'cbb9da84d3d2d15384b6559aa9871ebb', 'identity', 10), -- #24 VIN markalaması
        ('SHIPMENT', '8eb0f9b3929bd1ab67abfbb43fbe08e3', 'closures', 40), -- #25 Kapı ayar kauçuklarının takılması
        ('SHIPMENT', '4167ab5f10996cf22679464b9c38e063', 'closures', 40), -- #26 Kaput ayar kauçuklarının takılması
        ('SHIPMENT', 'c6a77250b4fbc682b300de37b12d68fc', 'electrical', 50), -- #27 Chogori IP68 kablonun araca konulması
        ('SHIPMENT', '7365e2e4fc2a47342a4448b190afe1b8', 'exterior', 20), -- #28 Anti Scratch film tampona kaplanması
        ('SHIPMENT', 'a85e56a7f2a5c46da147501855ac52e8', 'exterior', 20), -- #29 Anti Fog Film cama kaplanması
        ('SHIPMENT', 'e411cc1ec169d717a8be641c097ac87a', 'sealing', 60), -- #30 Kaput altı sızdırmazlık contasının kullanılması
        ('SHIPMENT', 'd525e6d9de4208edbd4ccf4a65c56563', 'electrical', 50), -- #31 P silinmiş combination switch kullanılması
        ('SHIPMENT', 'd6fba04afbc3387563e75ae84bd1b9ff', 'interior', 30), -- #32 Kelebek camı düşmemesi için sünger konulması
        ('SHIPMENT', '19d578f041db070fc9d40bb7c866af44', 'chassis', 70), -- #33 El Fren Ayarı yapılması ve arka disklere denk gelen noktada doğru k...
        ('SHIPMENT', '7109fc06f7762e8a730970debf90ab3c', 'sealing', 60), -- #34 IP yanı kapı harness ve kapı clips bölgesinde sızdırmazlıkların tam...
        ('SHIPMENT', '2ec91f5f16c977cb8cc82ff4a822d02e', 'sealing', 60), -- #35 Arka kapı sağ alt sızdırmazlık şeridi çekilmesi
        ('SHIPMENT', 'e79616ed47ddbb9abbe5e37c6d957fab', 'sealing', 60), -- #36 Arka kapı sol alt sızdırmazlık şeridi çekilmesi
        ('SHIPMENT', '474f4211a20c6d592019afc4d821f42d', 'sealing', 60), -- #37 Arka kapı sağ üst sızdırmazlık şeridi çekilmesi
        ('SHIPMENT', '5d1828a0221f68001cc12c1549299582', 'sealing', 60), -- #38 Arka kapı sol üst sızdırmazlık şeridi çekilmesi
        ('SHIPMENT', '798b3ad7fe6b0d6cff2de5580977bfbe', 'chassis', 70), -- #39 Arka davlumbaz sol fren borusu girişim bölgesi kesimi
        ('SHIPMENT', 'ea91c0c4227723021ec0ef7cd33bdbfa', 'chassis', 70), -- #40 Arka davlumbaz sağ fren borusu girişim bölgesi kesimi
        ('SHIPMENT', '470d3e1e16309595258954c8fa23a339', 'chassis', 70), -- #41 Direksiyon yumusatma ayari
        ('SHIPMENT', '837e5f410e0d783eaeb768469527886e', 'chassis', 70), -- #42 Stop delik genisletme yapildi mi
        ('SHIPMENT', 'c7764a85eae5291f15956320b762a839', 'closures', 40), -- #43 Kaput ayar pulu atıldı mı
        ('SHIPMENT', '15ef46e34134a2001cf7d1c53f40575e', 'chassis', 70), -- #44 Direksiyon kolonu dip lastiği yerine tam olarak oturmuş mu
        ('SHIPMENT', 'cba0ddbd5b20363ef73e42bf1a456bc6', 'exterior', 20), -- #45 Kaput civatalarinin piano black rötuş kalemi ile boyanmasi
        ('SHIPMENT', 'c7b7d42948b64eeb8c04a31e4c77687c', 'sealing', 60), -- #46 Bagaj kapagi su sizdirma problemi parca entegrasyonu
        -- TEST
        ('TEST', '47ddc967ce18cf79942b04507ce13b68', 'cold_drag', 10), -- #1 N'de aracı ittir — Anormal direnç var mı?
        ('TEST', 'e0e02d9cd30ea86cc3b318c854988c0c', 'cold_drag', 10), -- #2 D'de gaz ver — Araç normal hızlanıyor mu? Sıkma hissi veya anormal ...
        ('TEST', '4806fedccc01bdcba2e4ea13a3d31827', 'cold_drag', 10), -- #3 R'de gaz ver — Geri viteste normal hızlanıyor mu? Sıkma hissi veya ...
        ('TEST', '1c2038031bfe948e76dc29801469a9d0', 'bcm_ee', 20), -- #4 Dış aydınlatma — Kısa, uzun, selektör, park, sis, sol/sağ sinyal, d...
        ('TEST', 'a4c2a54567f06570843a83c13af3f7a3', 'bcm_ee', 20), -- #5 Korna — Ses seviyesi ve çalışması normal mi?
        ('TEST', '912b42d5e832d0c6b34dc0d4b0e3cdd1', 'bcm_ee', 20), -- #6 Camlar — Tüm camlar açılıp kapanıyor mu? Takılma, yavaşlık veya ses...
        ('TEST', '07b0c182375a08ae8d00eb06820db844', 'bcm_ee', 20), -- #7 Merkezi kilit & kapılar — İçeriden ve anahtarla dışarıdan kilitle-a...
        ('TEST', 'c33055d16363145591c905a662f0e802', 'bcm_ee', 20), -- #8 Aynalar & iç donanım — Aynalar, IP kapakları, emniyet kemeri kapakl...
        ('TEST', 'e5fb54ad43645249ebfd6c172ec197bd', 'bcm_ee', 20), -- #9 Emniyet kemerleri — Tokalar çalışıyor mu? Kemer düzgün sarıyor mu? ...
        ('TEST', '5e000e627f2d79845aa9d0da4d0aef0a', 'bcm_ee', 20), -- #10 El freni (KRİTİK) — El frenini çek -> hafif gaz ver -> araç ilerlem...
        ('TEST', '618d84a2d17ee06e6627d2891a3cbed3', 'bcm_ee', 20), -- #11 Vites seçimi — P/R/N/D geçişlerinde gecikme, yanlış gösterim veya k...
        ('TEST', '467cb7321093248b1a07ec7f96b0b84a', 'bcm_ee', 20), -- #12 Ana ekran / menüler — Tüm menülerde düğmelere tek tek bas. Donma, s...
        ('TEST', '134df243c8365c4323bf64c44428dc29', 'bcm_ee', 20), -- #13 Geri görüş kamerası — R'ye alınca görüntü geliyor mu? Görüntü temiz...
        ('TEST', 'c7760dbebf6bb3f38a53134f8c98254f', 'bcm_ee', 20), -- #14 Klima & havalandırma — Fan 1-2-3, yüze/cama üfleme, iç hava dolaşım...
        ('TEST', '2ef304497f526d804b6788b5f39c5c50', 'bcm_ee', 20), -- #15 Odometer — Sürüş öncesi değeri not et. Sürüş sonrası doğru sayıyor ...
        ('TEST', '08c2b233ca3a6cba19d53b324afdccbe', 'road_test', 30), -- #16 Düşük hız — 500m, 0 -> 30 km/s. Titreme, silkelenme, anormal ses, ç...
        ('TEST', '273873c8f690615c185b6c550491e392', 'road_test', 30), -- #17 Fren — 30 -> 0 x5 (~300m). Her frenlemede sağa/sola ekstrem çekme v...
        ('TEST', 'da252ff877899c160ffd26492f735306', 'road_test', 30), -- #18 Sürekli frenleme — Dur-kalk min. 20x (~600m). Pedal sertleşmesi/boş...
        ('TEST', '26a3728135b0c3309c5388e809c7db8e', 'road_test', 30), -- #19 Fren — 50 -> 0 x5 (~400m). Her frenlemede sağa/sola ekstrem çekme v...
        ('TEST', 'a8c5d06de11568610de716aa22d5ddb6', 'road_test', 30), -- #20 Fren — 90 -> 0 / 80 ->0 / 70 -> 0 (~500m). Her frenlemede sağa/sola...
        ('TEST', '1e236f2a669e1225537e82c0a51836c2', 'road_test', 30), -- #21 Son hıza ulaşma (~600m) — ECO modda 90 km/s'ye ulaşıyor mu? SPORT m...
        ('TEST', '94311a235773f5f1bb1c4cece6616bfd', 'road_test', 30), -- #22 Yokuş çıkış + iniş (~400m) — Çıkışta geri kaçırma, çekiş düşmesi va...
        ('TEST', '621f4cd436434c3c3f2531f81e1f32d5', 'road_test', 30), -- #23 Yokuş el freni (KRİTİK) — Yokuşta en az 6 kez kaydır-tut. El freni ...
        ('TEST', '9340c3b4e6d42b0df892779f50c984e6', 'road_test', 30), -- #24 N'de yokuş fren testi (~100m) — Yokuş aşağı N'de fren yap, bırak. A...
        ('TEST', '8db499b75296d86e2f73c5fd98daaf4a', 'brake_test', 40), -- #25 Düşük hız fren genel — 30 -> 0 testlerinde tutarlı performans sağla...
        ('TEST', '27a8034c6c7bd293e6de746cd35cc3b0', 'brake_test', 40), -- #26 Orta hız fren genel — 50 -> 0 testlerinde tutarlı performans sağlan...
        ('TEST', '6af69ebeafa787f0039e49964669bed1', 'brake_test', 40), -- #27 Yüksek hız fren genel — 90/80/70 -> 0 testlerinde tutarlı performan...
        ('TEST', 'b747932831662622654ab2c637acb051', 'brake_test', 40), -- #28 FRENLERDE SIKMA VAR MI? (KRİTİK) — Anormal direnç, tek taraflı ısın...
        ('TEST', '3fb0f4c7b93db26c094fd4dba1ec9b5e', 'brake_test', 40), -- #29 Nihai Fren Onayı — Tüm fren testleri tamamlandı, anormal bulgu yok mu?
        ('TEST', '5751d2311b9ce3b6ee61f1eab6268e16', 'alignment', 50), -- #30 Rot ayarı — Düz/eğimsiz yolda direksiyonu bırak. Araç sola veya sağ...
        ('TEST', '710c7a5fd896f8c3bbbd3bd0bef9bda9', 'alignment', 50), -- #31 Direksiyon merkezi — Düz gidişte direksiyon tam ortada mı? Belirgin...
        ('TEST', '209c10f8bb030d89ae32b3c7445e2463', 'alignment', 50), -- #32 Yüksek hızda kararlılık — 70–90 km/s'de araç düz gidiyor mu? Çekme ...
        ('TEST', '19132036f79b50a2ca5b740ab0faba3c', 'hot_drag', 60), -- #33 Sol ön disk — Elini yaklaştır (dokunma). Diğer disklere kıyasla bel...
        ('TEST', '8531999f93a39287c6d3a7595a24b23c', 'hot_drag', 60), -- #34 Sağ ön disk — Aynı kontrol. Belirgin şekilde sıcak mı?
        ('TEST', 'b316503e0019148830113bff10387c1d', 'hot_drag', 60), -- #35 Sol arka disk — Aynı kontrol. Belirgin şekilde sıcak mı?
        ('TEST', '3af51e4b9cbce85fb752e059634315dd', 'hot_drag', 60), -- #36 Sağ arka disk — Aynı kontrol. Belirgin şekilde sıcak mı?
        ('TEST', 'd57f15d9172f7e9a7516e82763d9c73b', 'hot_drag', 60), -- #37 N'de aracı ittir — Soğuk teste kıyasla artan direnç var mı? Isınma ...
        ('TEST', '5c09593ea7356b8c6f5a02fe75704e8e', 'eng_quality', 70), -- #38 Kapı / Kaput ayarı — Görsel kontrol. Fotoğraf ilet.
        ('TEST', '6fa77117fe7e460c09ff9d6d8a82a9ec', 'eng_quality', 70), -- #39 Boya kalitesi — Görsel kontrol. Fotoğraf ilet.
        ('TEST', '3c2d4e13032be820ba22ce0341867322', 'eng_quality', 70), -- #40 Trim & Bagaj — İç trim, dış trim düzgün mü? Bagaj yüksekliği doğru mu?
        ('TEST', 'bb6ee666d1478b627973cc6a881ef696', 'eng_quality', 70), -- #41 Tam dönüş kontrolü — Düşük hızda tam sağ/sol manevra. Sürtme, vurun...
        ('TEST', 'af3fa220c71e4ec7bbd893f5ff175f80', 'eng_quality', 70), -- #42 DTC / Diyagnostik tarama — Aktif veya geçmiş hata varsa kayıt altın...
        ('TEST', 'a8979bbbfccd5d2acc28de4b6f1a71a6', 'eng_quality', 70), -- #43 Mühendis Nihai Onayı
        ('TEST', '0ad6aa01407b4ebbf8c6842cf2d47774', NULL, NULL), -- #44 Final road-test driveability sign-off
        ('TEST', 'eec6194cb4b95bdad928cf7a8090ab2e', NULL, NULL) -- #45 End-of-line test report archive and stamp
)
UPDATE checklist_template_items i
SET section_key = a.section_key,
    section_sort = a.section_sort
FROM assignment a
JOIN checklist_templates t
  ON t.type::text = a.template_type
 AND t.vehicle_model_id IS NULL
WHERE i.template_id = t.id
  AND i.seed_key = a.seed_key
  AND (i.section_key IS DISTINCT FROM a.section_key
       OR i.section_sort IS DISTINCT FROM a.section_sort);

-- Keys dropped from the catalogue would render as a raw heading; any other
-- item still carrying one (e.g. added through the admin UI) becomes
-- unsectioned. The down file cannot restore these: list them before applying.
UPDATE checklist_template_items i
SET section_key = NULL,
    section_sort = NULL
FROM checklist_templates t
WHERE t.id = i.template_id
  AND t.type IN ('SHIPMENT', 'TEST')
  AND i.section_key IN (
    'brakes', 'steering', 'lights', 'diag', 'hv', 'drive', 'dash',
    'body', 'adas', 'infotainment', 'final', 'locks', 'lighting', 'charge'
  );
