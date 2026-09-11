# KAREA — Proje Bağlamı (Context)

Bu doküman, Claude ile yürütülen mimari/karar/debug geçmişinin özetidir.
Amaç: yeni bir oturuma (ya da başka bir asistana/kişiye) başlarken projenin
"neden böyle" olduğunu baştan anlatmaya gerek kalmaması. `/docs` altına
konulup diğer numaralı dokümanlarla (10-13) birlikte tutulabilir.

---

## 1. Proje Özeti

**Karea** (eski adıyla KTS/KMS), araç üretim takibi için entegre bir
platform: web (yönetici/analiz tarafı) + mobil (operatör tarafı) + Go
backend + PostgreSQL. Repo: `~/Desktop/kts_kms_project`. Kod geliştirme
Cursor AI üzerinden yürütülüyor; Claude mimar/reviewer rolünde — prompt
yazıyor, Cursor'un raporlarını kanıtla (curl, SQL, build log, screenshot)
doğruluyor, mimari kararları `/docs` altında senkron tutuyor.

**Sabit kural:** kod, dosya adları, commit mesajları, yorumlar İngilizce;
iletişim Türkçe.

## 2. Mimari

- Backend: Go, Clean Architecture (domain/usecase/repository/delivery/
  platform), chi router, pgx/sqlx, bcrypt + JWT.
- DB: PostgreSQL — custom ENUM'lar, `pg_trgm` (VIN kısmi arama), JSONB
  (`audit_logs.metadata`), PL/pgSQL trigger'larla iş kuralları + CHECK
  constraint'lerle defense-in-depth, BRIN index (append-only tablolar).
- Web: Vite + React, kendi design token sistemi (`tokens.ts` + Tailwind).
- Mobil: Expo/React Native, aynı token yapısının mobil karşılığı.

## 3. Temel Mimari Kararlar (v2 — bkz. `11_KAREA_v2_Mimari_Mutabakati.md`)

1. **Station / Station Step** = eski Faz/Checkpoint, sabit-8 kısıtı
   kaldırıldı, tamamlanma % ve soft-warning mantığı aynen korunuyor.
2. **EOL: 3 fazlı iş akışı** — Şube → Depo → Evrak (`vehicle_eol_workflow`
   tablosu). Şube tamamlanınca açık issue varsa sadece **uyarı**
   (bloklamaz). Depo tamamlanınca açık issue varsa **hard-block**
   (backend seviyesinde zorunlu, sadece UI değil). Onay/sevk/serbest
   bırakma otomatik user+timestamp kaydeder.
3. **RBAC:** şimdilik 2 rol (OPERATOR, MANAGER_ADMIN) ama tablo tabanlı
   (`roles`/`permissions`/`role_permissions`, many-to-many) — ileride kod
   değişikliği gerektirmeden rol eklenebilir.
4. **Test checklist:** üçüncü bağımsız modül (`checklist_type_enum`'a
   `TEST` eklendi). **Ertelenmiş açık soru:** Test maddesi NOT_OK/PENDING
   kaldığında (issue açılmadan) herhangi bir geçişi (Depot Release vb.)
   bloklamalı mı? Şu an bloklamıyor, sadece görünürlük/raporlama amaçlı.
   Test'ten açılan bir issue genel kurallara tabi olup Depot Release'i
   zaten bloklar.
5. **VIN/Vehicle Number:** ayrı tablo yok — `vehicles.vehicle_number`
   (unique, indeksli) kolonu eklendi. VIN son-5-hane arama ile birlikte
   çalışıyor.
6. **Issue 5. durum:** `CONDITIONAL_APPROVED` eklendi.
   `OPEN → IN_PROGRESS → DONE → {APPROVED | CONDITIONAL_APPROVED}`.
   Son iki geçiş sadece Manager/Admin yetkisinde, ikisi de terminal durum.
7. **Issue history:** ayrı tablo yok, mevcut `audit_logs` +
   `ISSUE_STATUS_CHANGE` event tipi kullanılıyor.
8. **Medya:** polymorphic `media_attachments` tablosu
   (`entity_type` + `entity_id`, serbest string, FK zorlanmıyor —
   uygulama seviyesinde doğrulanıyor). Kurulu konvansiyonlar:
   - `ISSUE` — hata rapor fotoğrafı
   - `ISSUE_RESOLUTION` — tamir-sonrası fotoğraf
   - `CHECKLIST_ITEM_PROGRESS`, `STATION_STEP_PROGRESS`, `VEHICLE`
9. **`vw_vehicle_full_overview` view:** araç başına tek satırda station
   ilerlemesi + EOL aşaması + Test/Shipment/EOL sayaçları + açık issue
   sayısı (severity kırılımlı). Vehicle Detail "Overview" ve Analiz VIN
   detayı bunu kullanıyor.

**Issue kaynağı:** `MANUAL` source type eklendi — checklist/station
adımına bağlı olmayan bağımsız issue girişi için (mobil Issue Entry
ekranı bunu kullanıyor).

## 4. Design System / Renk Paleti

Marka rengi paleti (6 renk): Satsuma `#FF3B1E` (birincil), `#327CB2`,
`#C0A89B`, `#8E9E7C` (araç yeşili), `#B5B2B2`, `#C62222` (kritik/hata).
Ayrıca token sisteminde pembe ve success-yeşili gibi ek semantic renkler
de var (brand palette'in dışında ama önceden kurulmuş, yeni hardcode
değil). **Kural:** yeni bileşenlerde asla yeni hex hardcode edilmiyor,
her zaman `tokens.ts` (web + mobil, ayrı ayrı ama senkron tutulan iki
dosya) üzerinden gidiliyor.

Severity renk konvansiyonu (Wi-Fi-bar ikon + rozet renkleri):
kritik = kırmızı, medium = amber/sarı, low = mavi.

## 5. Kurulmuş Kod Konvansiyonları

- `mobile/src/lib/homeIssueStats.ts` — Home stat kartları ile My Issues
  filtrelemesinin aynı mantığı kullanmasını garanti eden paylaşılan
  fonksiyonlar (`matchesHomeIssueStat`/`countHomeIssueStat`). Web
  tarafında kart→filtre tıklama davranışı eklenirken bu mantığın web
  karşılığı kullanılıyor/genişletiliyor.
- `GET /api/v1/issues` — varsayılan olarak `ListForUser` (reporter-scoped,
  mobil "My Issues" için). `?vin=` ile araç bazlı filtre, `analysis.view`
  izniyle "hepsini gör" (web dashboard/manager için).
- Vehicles listesi (hem web hem mobil) — büyükten küçüğe sıralı, card
  tıklanınca detay sayfası açılıyor.
- Web Vehicle Detail "Issues" sekmesi → `VehicleIssuesPanel.tsx`.
- pglast (Python) ile her DDL değişikliğinden sonra syntax doğrulaması
  workspace sandbox'ta yapılıyor.

## 6. Bilinen Tekrarlayan Sorunlar (Pitfalls)

- **`.env` çatallanması:** repo kökündeki `.env` ile `mobile/.env`
  birbirinden bağımsız drift edip birbirini sessizce override edebiliyor
  (özellikle `EXPO_PUBLIC_API_BASE_URL`). Mac'in LAN IP'si değiştiğinde
  ikisi de güncellenmeli, `npx expo start --clear` ile restart şart
  (Expo `EXPO_PUBLIC_*` değişkenleri build-time'da bundle'a gömülüyor).
- **CORS allowlist reset:** `CORS_ALLOWED_ORIGIN` bazen tek origin'e geri
  dönüyor (muhtemelen editör auto-suggestion), comma-separated
  multi-origin (`localhost:5173,localhost:5174`) olarak tekrar
  düzeltilmesi gerekebiliyor. OPTIONS preflight, route method-matching'den
  ÖNCE CORS middleware tarafından intercept edilmeli.
- **`react-native-reanimated`/`worklets` double-apply:** Expo SDK 54+'ta
  `babel-preset-expo` worklets plugin'ini otomatik enjekte ediyor,
  `babel.config.js`'e elle `react-native-reanimated/plugin` eklemek
  crash'e sebep oluyor (`WorkletsError`).
- **`VirtualizedList` nested-in-scrollable uyarısı:** kaynağı genelde
  `VinSearchBox`'ın kendi iç `FlatList`'i — embedded context'lerde
  `View`+`.map()`'e çevrilmesi gerekiyor.
- **Uncommitted work:** `.cursor/rules/git-commits.mdc` (küçük, artımlı,
  lowercase conventional commit kuralı) Cursor tarafından sık sık
  atlanıyor — her prompt sonrası `git status` + `git log --oneline`
  istenip commit'lenmemişse böldürülmesi gerekiyor.
- **Backend env okuma:** `go run ./cmd/api` `backend/` klasöründen
  çalıştırılırsa repo-root `.env` okunmayabiliyor, `DATABASE_URL` boş
  kalıp Postgres sürücüsü sessizce yanlış default'a düşebiliyor.

## 7. Çalışma Disiplini

- "Çalışıyor" denileni asla kanıtsız kabul etme — curl çıktısı, direkt SQL
  sorgusu, build/test log'u, screenshot, `grep` sonucu iste.
- Görsel/tasarım işlerinde mutlaka screenshot iste, metin açıklaması
  yetmez.
- Renk/stil işlerinde yeni hex hardcode edilmediğini `grep -rn
  "#[0-9A-Fa-f]\{6\}"` ile teyit et.
- Belirsiz/ertelenebilir tasarım kararlarında (örn. yüzdelik ne anlama
  gelsin, bar uzunluğu neye göre olsun) makul bir varsayılan seçip
  gerekçesini yazmak yeterli — kullanıcı zaten "ilerleyen süreçte
  değiştirebiliriz, çok fazla revizyon olacak zaten" diyor.

## 8. Güncel Durum (2026-08-19 itibarıyla)

- v2 mimarisi (Prompt 7-13) tamamen uygulandı ve doğrulandı.
- Büyük revizyon turu (design system rebrand, web Issues veri
  düzeltmeleri, responsive layout, mobil Issue Entry ekranı, mobil
  navigasyon, mobil Issues filtreleri) tamamlandı.
- Web Home sayfası zengin dashboard'a çevrildi (stat kartları + % delta,
  En Çok Hatalı Araçlar sıralı listesi, haftalık bar grafik, 90 günlük
  backlog trend grafiği, çözüm oranı gauge'i) — şu an ince ayar
  aşamasında (renk yoğunluğu, kart tıklanabilirliği, yeni bölümler:
  severity dağılımı, istasyon bazlı hata, EOL aşama özeti, MTTR).
- Mobil Home sayfasına bu revizyon dokunmuyor, ayrı kalıyor.

## 9. Açık / Ertelenmiş Kararlar

- Test checklist'in hard-block davranışı (bkz. Bölüm 3, madde 4) —
  kullanıcı tarafından bilinçli olarak ertelendi, henüz karara
  bağlanmadı.
