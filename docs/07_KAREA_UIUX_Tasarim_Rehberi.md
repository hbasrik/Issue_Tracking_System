
# KAREA — UI/UX Wireframe & Komponent Tasarım Rehberi v1.0

**Kapsam:** Web Dashboard (Manager/Admin) + Mobil Saha Uygulaması (Operator), tek platform içinde iki ayrı arayüz katmanı.
**Referans:** `01_KAREA_PRD.md` (Bölüm 10 Karar Günlüğü), `03_KAREA_MoSCoW_Matrisi.md`

---

## 1. Tasarım Sistemi (Design System)

### 1.1 Renk Paleti — Premium Dark / Light Mod

Endüstriyel sahada yüksek kontrast, gözü yormayan, "renk cümbüşünden" kaçınan sade bir palet. Durum renkleri (OK/NOT OK/REWORK/CONDITIONAL OK) haricinde vurgu rengi tektir (Karea Blue).

**Dark Mode (varsayılan — saha/mobil için önerilir):**

| Token | Hex | Kullanım |
|---|---|---|
| `bg-page` | `#0B0F14` | Sayfa arka planı |
| `bg-surface-1` | `#131920` | Kart/panel yüzeyi |
| `bg-surface-2` | `#1B232C` | Yükseltilmiş kart (modal, seçili satır) |
| `border` | `#26313C` | Ayırıcı/kenarlık |
| `text-primary` | `#F5F7FA` | Ana metin |
| `text-secondary` | `#8B98A5` | İkincil/etiket metni |
| `accent` (Karea Blue) | `#2F8FFF` | Birincil aksiyon, aktif sekme, ilerleme çemberi |

**Light Mode (web/ofis kullanımı için alternatif):**

| Token | Hex | Kullanım |
|---|---|---|
| `bg-page` | `#F7F9FB` | Sayfa arka planı |
| `bg-surface-1` | `#FFFFFF` | Kart/panel yüzeyi |
| `border` | `#E2E8F0` | Ayırıcı/kenarlık |
| `text-primary` | `#101418` | Ana metin |
| `text-secondary` | `#5B6672` | İkincil/etiket metni |
| `accent` | `#1D6FE0` | Birincil aksiyon |

**Durum Renkleri (her iki modda sabit semantik, doygunluk moda göre ayarlanır):**

| Statü | Renk | Hex (dark/light) | Kullanım |
|---|---|---|---|
| `OK` / Tamamlandı | Yeşil | `#22C55E` | EoL OK, checkpoint tamamlandı, checklist checked |
| `NOT_OK` / Başarısız | Kırmızı | `#EF4444` | EoL NOT OK, checkpoint başarısız |
| `REWORK` | Mor | `#8B5CF6` | Yeniden işlem gerektiren madde — kasıtlı olarak kırmızıdan ayrıştırıldı |
| `CONDITIONAL_OK` | Amber | `#F59E0B` | Şartlı kabul |
| `Bilgi/Nötr` | Mavi-gri | `#38BDF8` | Bilgilendirme rozetleri |

> **Neden REWORK ayrı renk?** NOT_OK "ret", REWORK "düzeltilebilir" anlamına gelir — operatörün panik yapmadan doğru aksiyonu (yeniden işleme) alması için görsel olarak net ayrışmalıdır.

### 1.2 Tipografi
- Font ailesi: Sistem fontu (iOS: SF Pro, Android: Roboto, Web: Inter/system-ui) — endüstriyel cihazlarda ekstra font yükü istenmez.
- Ölçek: H1 24px/600, H2 20px/600, H3 16px/600, Body 15px/400, Caption/Label 13px/500.
- Mobilde minimum gövde metni 15px (saha okunabilirliği için 13px'in altına inilmez).

### 1.3 Spacing & Grid
- 8px temel birim: 4 / 8 / 12 / 16 / 24 / 32px.
- Kart iç boşluğu: 16px (mobil), 20-24px (web).
- Dokunma hedefi minimum 44×44px (eldivenli kullanım için NFR gereği).

### 1.4 Komponent Kütüphanesi Konvansiyonları
- **Buton:** Birincil (dolu, accent renk), İkincil (outline), Tehlikeli (kırmızı outline, sadece "Hata Bildir"/"Reddet" gibi aksiyonlarda).
- **Durum Rozeti (Status Chip):** Yuvarlak köşe (pill), 12px yazı, arka plan = statü renginin %15 opaklığı, yazı = statü renginin koyu tonu.
- **İlerleme Çemberi (Progress Ring):** Araç completion % için; merkezde büyük yüzde rakamı, çember rengi accent, kalan kısım `border` rengiyle.
- **Kart (Card):** `bg-surface-1`, 12px radius, 1px `border`, hafif iç gölge yok (flat tasarım).
- **Liste Satırı (List Row):** Sol tarafta ikon/rozet, ortada başlık+alt başlık, sağda chevron veya durum rozeti.

### 1.5 Micro-Interaction Prensipleri
- **Tik atma (checkpoint/checklist):** Dokunulduğunda 150ms'lik yumuşak scale+renk geçişi; haptic feedback (mobilde) ile onaylanır.
- **Geri Alma Penceresi:** Bir madde işaretlendikten sonra 3 saniyelik "Geri Al" toast'ı gösterilir (yanlış tiki önlemek için — Risk R4'e karşı azaltım).
- **Hata/Uyarı Girişleri:** Kritik aksiyonlarda (sevk onayı, EoL çıkışı) buton önce "basılı tutma" (long-press, 800ms) veya onay modalı ister — yanlışlıkla tetiklenmeyi engeller.
- **Sayfa Geçişleri:** Mobilde yatay slide (250ms ease-out), web'de fade+8px translate (180ms).
- **Engelleme Durumu (Hard-Block):** EoL/Sevk kapısı engellendiğinde buton disabled olmaz — basıldığında kırmızı bir "shake" animasyonu ile eksik madde listesini içeren bir bottom-sheet/modal açılır (kullanıcı neden engellendiğini her zaman görür).

---

## 2. Bilgi Mimarisi / Sayfa Hiyerarşisi

### 2.1 Web Dashboard (Manager/Admin) — Sitemap

```
Login
└─ Home / Overview
   ├─ KPI Özet Kartları (Daily Pending Issues, Completed Today, Avg MTTR, Defect Rate)
   └─ Hızlı Erişim (son güncellenen araçlar, açık kritik issue'lar)
├─ Vehicles (Araçlar)
│  ├─ Araç Listesi (filtrelenebilir tablo: VIN son 5 hane arama, model, statü, lokasyon, faz, %)
│  └─ Araç Detay
│     ├─ Overview (statü/lokasyon editörü, completion ring, 8 faz özet stepper)
│     ├─ EoL Sekmesi (model bazlı şablon, 13+ madde, çıkış kapısı durumu)
│     ├─ Sevk Checklist Sekmesi (model bazlı şablon, 43+ madde, sevk kapısı durumu)
│     ├─ Issues Sekmesi (araca bağlı hata kayıtları)
│     └─ Audit Log Sekmesi (statü/checklist değişiklik geçmişi)
├─ Issues (Hatalar)
│  ├─ Issue Listesi (istasyon/statü/tarih filtreli)
│  └─ Issue Detay (kapatma aksiyonu — yalnızca Manager/Admin)
├─ Analysis (Yerleşik Analitik Sekmesi — Power BI yerine)
│  ├─ Filtre Paneli (tarih aralığı, faz, araç statüsü, hata türü)
│  ├─ Grafikler (Pie Chart, Bar Chart)
│  └─ Export/Print (A4 PDF)
├─ Checklist Templates (Admin — Multi-Template Yönetimi)
│  ├─ Şablon Listesi (araç modeline göre: EOL / SHIPMENT tipi)
│  └─ Şablon Editörü (madde CRUD, sıralama)
├─ Users & Roles (Admin)
└─ Settings (Dark/Light mod, dil, bildirim tercihleri)
```

### 2.2 Mobil Saha Uygulaması (Operator) — Alt Sekme Yapısı

```
[Bottom Tab Bar]
├─ Ana Sayfa (son işlenen araçlar, hızlı VIN arama)
├─ Ara (VIN son 5 hane akıllı arama + sonuç listesi)
├─ İstasyonum (aktif istasyondaki araçlar kuyruğu)
└─ Profil (rol bilgisi, dark/light toggle, çıkış)

[Araç Seçildiğinde — Stack Navigation]
Araç Detay (Faz İlerleme Ekranı)
 ├─ 8 Faz Stepper/Accordion → Checkpoint Listesi
 │   └─ Checkpoint Satırı → [Tamamlandı / Başarısız] → (Başarısız ise) Hata Girme Formu
 ├─ EoL Checklist Ekranı (model bazlı, N madde)
 └─ Sevk Öncesi Checklist Ekranı (model bazlı, N madde)
```

> **Not (RBAC):** Operator rolü yalnızca mobil uygulamaya erişir; web dashboard route'ları Operator için tamamen kapalıdır (bkz. PRD FR-Auth, US-G1).

---

## 3. Mobil Uygulama — Ekran Bazlı Komponent Rehberi

### 3.1 Ana Sayfa / VIN Arama Komponenti (Paylaşılan)
- **Üst bar:** Karea logosu + istasyon adı + dark/light toggle.
- **Arama kutusu:** Placeholder "Son 5 haneyi girin (örn. 00057)"; input değiştikçe debounce 200ms sonrası typeahead sonuç listesi açılır.
- **Sonuç Satırı:** VIN'in son 5 hanesi büyük/kalın, tam VIN gri/küçük altında; model adı ve mevcut faz rozeti sağda.
- **Çoklu eşleşme:** Sonuç listesi 2+ öğe gösterirse üstte "X araç eşleşti, doğrusunu seçin" uyarı şeridi.

### 3.2 Araç Detay — 8 Faz Ekranı
- **Üst kısım:** Büyük dairesel İlerleme Çemberi (completion %), altında araç modeli + VIN.
- **Faz Stepper:** 8 yatay/dikey adım noktası; tamamlanan fazlar dolu accent renk, aktif faz vurgulu halka, bekleyen fazlar gri.
- **Checkpoint Accordion:** Aktif faz genişletilmiş gelir; her checkpoint satırı solda checkbox/toggle, ortada checkpoint adı, sağda durum ikonu.
- **Checkpoint Başarısız İşaretlendiğinde:** Satırın altında kırmızı outline'lı "Hata Bildir" butonu belirir (tek dokunuş).
- **Açık Issue Rozeti:** Faz başlığında, o fazda açık issue varsa küçük kırmızı sayaç rozeti (soft-warning — engel değil, bilgi amaçlı).

### 3.3 Hata Girme Formu (Checkpoint Başarısızlığı)
- **Ön dolu alanlar (salt okunur chip'ler):** Araç VIN, İstasyon, Faz/Checkpoint adı, Zaman damgası.
- **Serbest alanlar:** Hata açıklaması (zorunlu, çok satır), **önem derecesi (zorunlu — Kritik / Orta / Düşük seçici, bkz. PRD FR-2.6)**, fotoğraf ekle (opsiyonel, Could-Have).
- **Alt buton:** "Hatayı Kaydet ve Devam Et" — kayıt sonrası otomatik önceki ekrana döner, checkpoint durumu "Başarısız — Issue Açık" rozetiyle güncellenir.

### 3.4 EoL Checklist Ekranı (Model Bazlı Şablon)
- **Üst banner:** "EoL Kontrolü — [Araç Modeli] Şablonu (N madde)"; sağda kalan/tamamlanan sayaç ("10/13 değerlendirildi").
- **Madde Satırı:** Madde metni + 4 durum seçenekli segmented control (`OK` yeşil / `NOT_OK` kırmızı / `REWORK` mor / `CONDITIONAL_OK` amber).
- **Koşullu Açıklama Alanı:** `OK` dışında bir statü seçilince satırın altında açıklama text alanı açılır (kırmızı yıldızlı "zorunlu" etiketiyle); `OK` seçiliyken alan gizli/opsiyonel.
- **Alt Sabit Bar (Sticky Footer):** "Çıkışa Hazır" / "X Madde Engelliyor" durum göstergesi + "EoL'den Çıkar" butonu.
- **Hard-Block Modalı:** Buton engellenmiş durumda basılırsa, hangi maddelerin (NOT_OK/REWORK/boş) engel olduğunu listeleyen bottom-sheet açılır — her satır ilgili maddeye direkt scroll eder.

### 3.5 Sevk Öncesi Checklist Ekranı (43 Madde — Model Bazlı Şablon)
- **Üst banner:** "Sevk Öncesi Kontrol — [Araç Modeli] (N madde)"; ilerleme çubuğu (progress bar) + "40/43 tamamlandı" metni.
- **Madde Satırı:** Basit checkbox + madde metni + opsiyonel not ikonu (dokunulunca not alanı açılır).
- **Gruplama (opsiyonel UX iyileştirmesi):** 43 madde kategori bazlı bölümlere ayrılabilir (örn. "Dış Görünüm", "İç Donanım", "Fonksiyon Testleri") — kaydırma yorgunluğunu azaltır.
- **Alt Sabit Bar:** "Sevke Hazır" / "3 Madde Eksik" durumu + "Sevk Onayına Gönder" butonu (yalnızca Manager/Admin onaylayabilir; Operator bu ekrandan yalnızca işaretleme yapar, statü değişikliği web'den gerçekleşir).
- **Hard-Block Davranışı:** 43/43 tamamlanmadan araç `SHIPPED` statüsüne geçirilemez (backend enforce, FR-4.3); UI'da eksik maddeler net listelenir.

---

## 4. Web Dashboard — Sayfa Bazlı Komponent Rehberi

### 4.1 Genel Layout
- **Sol Sidebar (240px, daraltılabilir):** Ana navigasyon (Home, Vehicles, Issues, Analysis, Templates, Users, Settings), aktif sekme accent renk ile vurgulu.
- **Üst Topbar:** Global arama (VIN son 5 hane), dark/light toggle, kullanıcı avatarı/rol rozeti (Manager/Admin).
- **İçerik Alanı:** Max-width 1440px, 24px padding.

### 4.2 Home / Overview
- **KPI Kart Şeridi (üst satır, 4 kart):** Daily Pending Issues, Completed Today, Avg MTTR, Defect Rate — her biri büyük rakam + son 7 gün mini trend çizgisi (sparkline).
- **Orta Bölüm:** "Dikkat Gerektiren Araçlar" tablosu (açık kritik issue'su olan veya sevk kapısında bekleyen araçlar).

### 4.3 Vehicle Listesi & Detay
- **Liste:** Sıralanabilir/filtrelenebilir tablo — VIN (son 5 hane vurgulu), Model, Statü rozeti, Lokasyon, Faz (X/8), Completion %.
- **Detay Sayfası Sekmeleri:** Overview / EoL / Shipment Checklist / Issues / Audit Log (bkz. Bölüm 2.1).
- **Statü/Lokasyon Editörü:** Dropdown + "Kaydet" — state machine kurallarına uymayan geçişler (örn. eksik checklist ile SHIPPED) buton üzerinde devre dışı bırakılmaz, basıldığında backend hatası + eksik madde listesi modal olarak gösterilir (tutarlılık: mobildeki hard-block modalıyla aynı patern).

### 4.4 Analysis Sekmesi (Detaylı)
- **Filtre Paneli (üstte, yatay şerit):** Tarih aralığı seçici (date range picker), Faz dropdown (1-8), Araç Statüsü multi-select, Hata Türü multi-select, **VIN arama kutusu (son 5 hane, aynı typeahead mekanizması — bkz. Bölüm 3.1)**. Filtreler "Uygula" butonuna kadar biriktirilir (URL query param olarak da saklanır — paylaşılabilir link).
- **Grafik Alanı (2 sütunlu grid):**
  - Sol: Pie Chart — "Biten / Devam Eden İşler" dağılımı.
  - Sağ: Bar Chart — "İstasyon Bazlı Elapsed Time / MTTR".
  - Alt satır: Pareto Bar Chart — Defect Rate per Station.
- **Araç Bazlı Açık Hata Dağılımı (yeni bölüm):** VIN filtresi boşsa tüm kapsam dahilindeki araçlar, doluysa filtrelenen araç(lar) için; VIN, Toplam Açık Hata, Kritik, Orta, Düşük sütunlarından oluşan bir tablo + öbeklenmiş (stacked) bar chart. En çok açık hataya sahip araç varsayılan sıralamada en üstte. Her satır tıklanınca ilgili aracın detay sayfasına yönlendirir.
- **Export/Print Butonu:** Sağ üstte sabit; basıldığında mevcut filtre özeti + grafikler + araç bazlı hata dağılımı tablosunun statik (canvas→image) render'ı ile A4 print-ready bir önizleme modalı açılır, "PDF İndir" ile indirilir (≤10 sn).

### 4.5 Checklist Templates (Admin)
- **Şablon Listesi:** Araç Modeli × Tip (EOL/SHIPMENT) matrisi; her hücre "N madde, Aktif/Pasif" durumunu gösterir.
- **Şablon Editörü:** Sürükle-bırak sıralanabilir madde listesi, madde ekle/sil/düzenle, "Varsayılan Şablon Yap" toggle'ı.

### 4.6 Users & Roles
- **Kullanıcı Listesi:** Ad, e-posta, Rol rozeti (Operator/Manager-Admin), Durum (Aktif/Pasif).
- **Rol Ataması:** Basit dropdown — yalnızca 2 rol olduğundan karmaşık matris gerekmez.

---

## 5. Durum Rozeti (Status Badge) Standartları

| Bağlam | Olası Değerler | Renk Eşlemesi |
|---|---|---|
| Checkpoint | Bekliyor / Tamamlandı / Başarısız (Issue Açık) | Gri / Yeşil / Kırmızı |
| EoL Madde | OK / NOT OK / REWORK / CONDITIONAL OK | Yeşil / Kırmızı / Mor / Amber |
| Sevk Maddesi | Checked / Unchecked | Yeşil / Gri |
| Araç Statüsü | IN_PRODUCTION / IN_WAREHOUSE / WITH_CUSTOMER / SHIPPED / ON_HOLD | Mavi / Gri / Amber / Yeşil / Kırmızı |
| Issue | OPEN / IN_PROGRESS / RESOLVED | Kırmızı / Amber / Yeşil |
| Issue Önem Derecesi | CRITICAL / MEDIUM / LOW | Koyu Kırmızı `#791F1F` / Amber `#F59E0B` / Gri-Mavi `#38BDF8` |

---

## 6. Responsive & Erişilebilirlik Notları
- Web dashboard minimum 1280px genişlik için optimize edilir (tablet yönetici kullanımı için 1024px'e kadar responsive).
- Mobil uygulama hem telefon hem tablet (saha operatör tercihine göre) düzenine uyarlanır; tablette 2 sütunlu checklist grid'i kullanılabilir.
- Renk kontrastı WCAG AA (4.5:1) hedeflenir; durum renkleri yalnızca renkle değil, ikon/etiketle de desteklenir (renk körlüğü için).
- Tüm kritik aksiyon butonları (Hata Bildir, EoL Çıkar, Sevk Onayı) ekran okuyucu için açık `aria-label` içerir.

---

*Bu doküman onaylandıktan sonra ADIM 3'e (Veritabanı Şeması ve Kurulum To-Do'su) geçilecektir.*
