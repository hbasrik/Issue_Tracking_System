# KAREA — Yapılacaklar Listesi

**Güncelleme:** 2026-09-25
**Amaç:** Canlıya çıkmadan önce ve sonra yapılacakları ayırmak, neyin
kimi beklediğini takip etmek.

Durum işaretleri: `[ ]` yapılmadı · `[~]` kısmen · `[x]` tamam · `[!]` engelleyici

---

## A — Şimdi yapılabilir (kod işi, dış bağımlılık yok)

### A0. Geliştirme veritabanının yedeği `[ ]` **öncelik: en yüksek**
Checklist şablonları, hata kodu kataloğu, roller ve izin matrisi,
500 VIN — bunların hepsi **tek bir bilgisayardaki tek bir Postgres
örneğinde** duruyor. Bunlar kod değil, veri; git'te yok. Disk
giderse haftaların yapılandırma emeği gider.

Yapılacak: düzenli `pg_dump`, dosya bilgisayar dışında bir yerde
(bulut disk yeterli). B5'ten farklı — B5 üretim yedekleme
politikası, bu ise bugünkü emeği kaybetmemek.

### A1. Mobilde ağ kesintisi dayanıklılığı `[x]` — cihazda doğrulandı
Fabrika Wi-Fi kesintisinde operatör kaydı kaybolmaz:
- Başarısız issue gönderimi cihaz kuyruğuna alınır (fotoğraf dahil);
  bağlantı gelince otomatik gönderilir; “bekleyen kayıt” göstergesi
- Referans önbelleği (katalog / istasyon vb.) offline okunabilir
- Idempotency: `client_request_id` ile çift gönderim engellenir
- Taşıma hatası kuyruğa alınır; iş kuralı / 4xx ret ayrımı yapılır
- 401’de kuyruk kaydı silinmez (yeniden giriş sonrası tekrar dener)
Kod: `mobile` offline kuyruk + `shared/networkError` / queue policy.


### A2. Eski 1619 kaydın aktarılması `[ ]` **öncelik: yüksek**
Analiz sayfası şu an boş sayılır; sistemde birkaç test kaydı var.
- CSV'den içe aktarma
- Kelime eşleştirmesiyle otomatik sınıflandırma ön ataması
- Kalite ekibi gözden geçirir
**Neden önemli:** Analiz ilk günden anlamlı olur, altı ay veri birikmesini
beklemeye gerek kalmaz.

### A3. Kritik hata bildirimi `[ ]` **öncelik: yüksek**
Kritik bir hata açıldığında kimsenin haberi olmuyor.
- En azından uygulama içi bildirim
- SMTP gelince mail bildirimi eklenir
**Neden önemli:** Sistemin var oluş sebebi tam da bunu yakalamak.

### A4. Giriş denemelerinde hız sınırı `[x]`
Hesap bazlı kademeli kilit (5 hata → 1 dk, 10 → 5 dk, 15 → 15 dk),
IP başına dakikada 100 tavan. Ortak fabrika IP'si arkasındaki
kullanıcıların birbirini kilitlemediği testle kanıtlandı. Var olmayan
kullanıcıya dummy bcrypt (zamanlama sızıntısı yok). Yöneticiye
"giriş kilidini aç" butonu. Migration 0028 + `LOGIN_RATE_LIMITED`
audit olayı; `audit_logs.vin` artık NULL olabiliyor.

Mobil giriş ekranının da kalan süreyi iki dilde gösterdiği ayrıca
doğrulandı.

**Kabul edilen sınır:** Sayaçlar bellekte. Backend yeniden başlayınca
kilitler sıfırlanır. Bkz. B8.

### A5. Vardiya kavramı `[x]` — kapatıldı, ayrı alan gerekmiyor
Önceki değerlendirmem "sonradan eklenemez" yönündeydi; **yanlıştı.**
Vardiya, kaydın oluşturulma saatinden türetilebilir (vardiya saat
aralıkları tanımlandığı sürece geriye dönük de hesaplanır). Ayrı bir
kolon ve operatöre ek soru gerekmiyor. Analiz tarafında istendiğinde
saatten gruplanarak eklenir.

### A6. Uçtan uca test `[ ]` **öncelik: orta**
Kritik akışları kapsayan otomatik testler: giriş, hata bildirme,
checklist işaretleme, sevk kapıları, onay akışı.
**Neden önemli:** Bu projede aynı sınıf hatanın tekrar ettiği birkaç
durum yaşandı (filtrenin bazı grafikleri etkilememesi, yanlış rozet
bileşeni, mobilin webden ayrışması).

### A7. Issue'ya yorum/not `[ ]` **öncelik: orta**
Şu an sadece açıklama ve çözüm var, ileri geri yazışma yok. Kalite
"bu fotoğraf yetersiz" diyemiyor.

### A8. Ayrı izinler: `issue.classify` ve `vehicle.hold` `[ ]` **öncelik: düşük**
Şu an sınıflandırma düzeltme onay izinlerine, beklemeye alma
`admin.manage_masters`'a bağlı. Gerçek ihtiyaç doğduğunda matris
ekranından 10 dakikalık iş. Şimdilik not.

### A9. Kalite ekibi katalog gözden geçirmesi `[ ]` **öncelik: orta**
`docs/15_KAREA_Hata_Kodu_Katalogu_Taslak.md` içindeki beş soru:
parça adları sahadaki dille uyuşuyor mu, elektrik grubu yeterli mi,
sorumlu süreç atamaları doğru mu.

### A10. Mobil doğrulamalar (kullanıcı gözüyle) `[~]`
Kodda var ama gerçek cihazda görülmedi:
- Oturumu açık tut
- Drawer ikonları
- Klavye "Bitti" çubuğu
- Yeni sınıflandırma formu
- Filtre düzeni

### A11. Güvenlik sıkılaştırması (altı madde) `[x]` — 2026-09-21
- `GET /uploads/*` auth + `vehicle.view` (VIN / Karar 11); web/mobil Bearer
- `JWT_SECRET` boş/<32 → süreç başlamaz; zayıf compose varsayılanı yok
- `POST /media` hedef varlığa yazma yetkisi ister
- `document_approve` uykuda: 410, atanamaz izin, kolonlar tarihsel
- Issue açıklaması max 400 + i18n + kalan karakter (web/mobil)
- `users.tokens_valid_from` (0029): pasif/şifre/rol → anında 401
Not: JWT + iptal birlikte herkesin bir kez yeniden girişini gerektirir.
Refresh token hâlâ D3.

### A12. 401 oturum kapatma `[x]` — 2026-09-21
Web/mobil API istemcisi 401’de oturumu temizler; giriş ekranında
`login.sessionExpired` mesajı. Analiz/Issues auth hatasında boş
“Veri yok” boyamaz. Mobil offline kuyruk 401’de kaydı silmez
(`shouldQueueIssueSubmit` / `queueItemAfterSendError` aynı).

### A13. Issues kart listesi (görünüm) `[x]` — 2026-09-21
Tablo/accordion kaldırıldı; tek uyarlanabilir kart (`shared/issueCardLayout`).
Web detay rotası `/issues/:id` (eski `IssueDetailPanel` aynı panel). Filtreler
aynı. Web DONE akışına çözüm açıklaması formu eklendi (API zorunluluğu; mobille
hizalı — çözüm fotoğrafı MediaGallery’den).
Kartın tamamı detaya gider (hover/active veya basılı opaklık); tek istisna
fotoğraf → tam ekran (`stopPropagation` / iç Pressable). Sıkışık yerleşimde
açıklama + sınıflandırma tek satır kırpılır (`truncate` / `numberOfLines={1}`).
Şiddet renkleri `shared/brand.ts` → `severityColors` tek kaynak; kart metin
+ çubuk aynı. Medya türevleri: `?thumb=1` (192) / `?thumb=md` (800) /
orijinal; grid kartları md kullanır. Geriye dönük:
`go run scripts/generate-upload-thumbs.go`.

### A14. Issues pano canlılığı `[x]` — 2026-09-22
Mevcut Issues sayfasına (yeni sayfa yok):
- 30 sn sessiz yenileme; “Son güncelleme”; yenileme hatasında görünür uyarı
- `/uploads` `Cache-Control: private, max-age=31536000, immutable` + web
  `AuthenticatedMediaImg` HTTP/`force-cache` + oturum blob önbelleği
- Kart fotoğrafları tembel yükleme (IntersectionObserver / FlatList
  viewability) — ilk açılışta yalnızca görüş alanındakiler
- Yeni CRITICAL: ses + kısa vurgu (`shared/newCriticalIds` — ilk yükleme /
  mevcut / filtre alt kümesi tetiklemez). Web: önce çal, engelde “Sesi aç”.
  Mobil: Profil “Sesli uyarı” varsayılan KAPALI, AsyncStorage; ses
  `expo-audio` (SDK 57; `expo-av` kaldırıldı)
- Detaydan dönüşte kaydırma + filtreler (web sessionStorage; mobil ekran
  state + sessiz focus yenileme)
- Yüklemede `image.Decode` — çözülemeyen JPEG/PNG reddi
  (`ErrUndecodableImage`). Bilinen bozuk dosya
  `backend/uploads/issue_resolution/68/…jpg` silinmedi (Rule 7).
- Doğrulama fixture’ları (TEMPBOARD 61–65) APPROVED’a çekilmek yerine
  satır + audit ile silindi (metrik kirletmesin).

### A15. Issues pano sayfalama + sanallaştırma `[x]` — 2026-09-22
Web Issues panosu:
- Varsayılan durum filtresi yok (tüm durumlar; board UI `karea-issues-board-ui-v2`,
  kayıtlı `statuses` — boş dizi dahil — korunur). Eski OPEN+IN_PROGRESS
  varsayılanı kaldırıldı (2026-09-24).
- `GET /issues` `limit=50` + keyset (`before_date`/`before_id`) ile sonsuz
  kaydırma; 30 sn yenileme yalnız ilk sayfayı alır ve mevcut listeye merge
  eder (sonraki sayfalar korunur, id ile dedupe)
- `homeStat` / `analysisStat` drill-down: limitsiz tam liste (davranış aynı)
- Kart grid satır sanallaştırması (`@tanstack/react-virtual`, scroll =
  AppShell `[data-app-scroll]`)
- Dışa aktarma / yazdırma: **aktif filtreyle eşleşen tüm kayıtlar**
  (`listIssues({ unlimited: true })` + istemci filtreleri); yüklü sayfa
  değil. Düğme sayısı = `matchTotal`. ZIP: onay (≥80) + sert tavan 500
  kayıt (tarayıcı belleği); CSV/yazdırma sınırsız + ilerleme metni.

Mobil `MyIssuesScreen` (aynı API sözleşmesi):
- Varsayılan filtresiz; board UI AsyncStorage (`karea-issues-board-ui-v2`);
  kayıtlı boş `statuses` = tüm durumlar
- Sayfa boyutu 50 + keyset sonsuz kaydırma; footer `issue.loadingMore`;
  30 sn yalnız ilk sayfa merge
- `homeStat`: limitsiz tam liste
- Liste: `@shopify/flash-list` (numColumns korunur; v2 otomatik ölçü)

Index (migration 0030, idempotent): `idx_issue_list_reporter`
(`issue_reporter_id`), `idx_issue_list_issue_date` (`issue_date DESC, id DESC`).

Yük testi (Rule 7): `backup.sh` → restore `karea_issues_loadtest` → +2000
`LOADTEST_SCALE_*` satır → ölçüm → `DROP DATABASE`. Canlı `issue_list` = 24
değişmedi. Web/mobil aynı `/issues` uçlarını kullanır (ağ ölçümü ortak).

| Senaryo | İstek | Toplam bayt | Süre (ms) | Not |
|---|---:|---:|---:|---|
| Canlı 24 — ilk açılış | 5 | 28 390 | 70 | issues+katalog |
| Canlı 24 — 30 sn yenileme | 1 | 17 444 | 11 | yalnız ilk sayfa |
| Loadtest 2024 — ilk açılış | 5 | 71 174 | 93 | 50 kayıt, has_more |
| Loadtest 2024 — 30 sn yenileme | 1 | 60 228 | 11 | yalnız ilk sayfa |
| Loadtest — +3 sayfa kaydırma | 3 | 180 921 | 36 | keyset ~12 ms/sayfa |
| Loadtest — eski full list | 1 | 2 442 898 | 36 | limitsiz (karşıt) |

EXPLAIN: board sırası `idx_issue_list_issue_date`; bildiren
`idx_issue_list_reporter`. Kaydırma akıcılığı: API ~12 ms/sayfa; DOM
sanallaştırma (web virtual rows / mobil FlashList). Cihaz FPS ölçülmedi.

### A16. Pasif checklist maddeleri (UI) `[x]` — 2026-09-24
API, progress’i olan pasif maddeleri bilerek listede tutuyor (geçmiş);
kapılar zaten yalnız aktiflere bakıyor (migration 0022). UI artık aynı
ayırımı gösteriyor:
- Ana liste = aktif maddeler (operatör işi)
- Altta varsayılan kapalı: “Artık gerekli olmayan maddeler (n)” + Pasif rozeti
- Tüm sayılar / ilerleme `shared/checklistActive.ts` üzerinden yalnız
  aktif kümeden (web `ChecklistPanel`, mobil EoL/Shipment/Test)
- Mobil `ChecklistItem.IsActive` tipi eklendi

Doğrulama (VIN `N7V1K1SA6TK000068`, Depo): API 7 satır → shared 5 aktif +
2 pasif; kapı `depot_eol_remaining=0` (pasif OK’ler etkilemez); PENDING
simülasyonu (Rule 7, DB yazılmaz) remaining 1. Ekran görüntüleri:
`docs/screenshots/checklist-inactive/`.

### A17. EOL filo sayıları + kart yüzeyi `[x]` — 2026-09-24
Home / Analiz EOL madde oranları (Aşama performansı, tamamlanma %,
home checklist donut) artık yalnız `cti.is_active = true` sayıyor —
`shared/checklistActive.ts` `CHECKLIST_ACTIVE_SQL` ile aynı kural.
Önceki kısmi filtre (`NOT (pasif AND PENDING)`) pasif OK satırlarını
paydaya sokuyordu. SQL kanıt: Depo **21/31 → 15/25**; Fabrika 28/49
aynı; KPI %61.3 → %58.1. Tamamlandı 2/5 araç sayısı (madde değil).

Kart yüzey renkleri `shared/surfaces.ts` (web+mobil); açık kenarlık
kontrastı ~1.88 → ~2.75. Sıkışık yerleşimde (&lt;600px) kart yüksekliği
içeriğe göre; ızgarada eşit yükseklik korunur.

### A18. Kart 3:1 kenarlık + aşama grafiği birimleri `[x]` — 2026-09-24
Kenarlık WCAG 3:1 (açık/koyu, kart+sayfa). Aşama performansı yalnız
Fabrika/Depo **madde** satırları; “Tamamlandı” araç çubuğu çıkarıldı
(EOL hunisi araç sayar). Hint metinleri güncellendi.
2026-09-24 (kart ayrışma): mobilde `IssueCard` vurgusuz halde
`borderWidth: undefined` geçiyordu — `Card`’ın 1px kenarı ezilebiliyordu;
artık her zaman `borderWidth: 1` + `tokens.border`. Fill/page ~1.06:1
olduğu için kenar şart; `shared/surfaces` border güçlendirildi (açık
3.29→3.70 kart üstü) + hafif `lightCardElevation`/`darkCardElevation`.
Meta satır: sol VIN+süre, sağ şiddet+durum. Filtre bloğu altında ayırıcı.

### A19. Issues filtre paneli + yazdırma fotoğraf `[x]` — 2026-09-24
- Mobil + web &lt;600px: durum / şiddet / gelişmiş filtreler tek katlanabilir
  blok (varsayılan kapalı); VIN/bildiren arama açıkta. Kapalıyken aktif
  filtre özeti + temizle. ≥600px web: önceki yerleşim (durum+şiddet görünür).
- Ana ekran / analiz `homeStat`·`analysisStat` yönlendirmelerine dokunulmadı.
- Liste yazdırma: isteğe bağlı “Fotoğraflarla yazdır” (≈2,4 cm thumb);
  yazdırmadan önce tam filtre kümesi çekilir + `preloadAuthenticatedMedia`
  (tembel yükleme tuzağı yok). Fotoğrafsız satırda boş kutu yer tutar.
- Yazdırma / CSV / ZIP kapsamı (2026-09-24 düzeltme): sunucudan
  `unlimited` tam liste ∩ istemci filtreleri — yüklü sayfa değil.
  Kanıt (ayrı DB `karea_export_verify`, sonra DROP): 2024 unlimited /
  50 `limit=50` / 1013 `OPEN,IN_PROGRESS`. ZIP tavanı 500 + boyut onayı.
- `listIssues({ unlimited: true })` Home / araç panelleri / dışa aktarma;
  API testi `TestIssueList_OmitLimitReturnsFullList` (limit yok → 250 satır).
  docs/08’e yanlışlıkla eklenen 0030 index satırları geri alındı (v1 dondurulmuş).

### A20. Şifre: bcrypt cost 12 + kolay tahmin engeli `[x]` — 2026-09-25
- Yeni hash cost **12**; girişte cost &lt; 12 ise sessiz rehash
  (`UpdatePasswordHash`, JWT iptal yok).
- Denylist (password/karea/sifre/parola/123456…) + e-posta yerel kısmı / ad;
  create, reset, self-change. Min uzunluk hâlâ 8. i18n TR/EN.

### A21. Açılır listeler kırpılmıyor (portal) `[x]` — 2026-09-28
Issues gelişmiş filtre “Parça” listesi `overflow-hidden` filtre kartında
yalnız ilk seçeneği gösteriyordu. Ortak `web/src/components/AnchoredPopover`
listeyi `document.body`'ye çizer, tetikleyiciye göre `fixed` konumlar;
aşağıda yer yoksa yukarı açılır, kaydırma/yeniden boyutta hizalı kalır,
dışarı tıklama + Esc kapatır, uzun liste kendi içinde kayar.
- `PartMultiSelect`: ok tuşları + Enter + Esc (odak tetikleyiciye döner).
- `AnalysisVinMultiSelect`: aynı sorun (`overflow-x-auto` filtre çubuğu y'yi
  de kırpar) — aynı popover + klavye.
- Tarama: `VinSearchBox` (üst bar, hata bildir) ve `ProfileMenu` kırpılan
  kapsayıcıda değil; diğer seçimler (hata bildir, şablonlar, kullanıcılar,
  katalog) yerel `<select>` — kırpılmaz. Mobil: tüm parça/bölge/tür
  seçimleri `Modal` alt sayfa — kırpılma yok.
Kanıt: `scripts/verify-anchored-popover.mjs`,
`docs/screenshots/anchored-dropdown/`.

### A22. Web ham teknik hata metinleri temizlendi `[x]` — 2026-09-28
Mobil ile aynı yol: `shared/networkError.ts` + `translateApiError` /
`ApiErrorText` (bkz. `docs/11` Karar 14).
- Ayrım: zaman aşımı (`error.timeout`), bağlantı (`error.offline`),
  5xx (`error.server` + "Hata kodu: <request_id>"), 4xx (çevrilmiş metin,
  kod yok), 401 oturum mesajı. Eşlenmemiş 4xx gövdesi artık ekrana ham
  düşmez → duruma göre genel metin. Tüm domain sentinel'leri TR/EN.
- Web `request()`: 15 sn (yükleme 120 sn) zaman aşımı; fetch hatası
  `ApiError(0)`.
- `LoadErrorState` (blok / eski-veri uyarısı, "Tekrar dene"): Home,
  Vehicles, VehicleDetail, Activity, Analysis, Issues. Hata anında sıfır
  kart / boş liste / "(0)" sayaç gösterilmez — "veri yok" ≠ "erişilemedi".
- Sevkiyat hazırlık uyarıları yapılandırılmış alanlarla (`item_no`,
  `item_text`, `issue_description`, `read_failed`) web+mobilde i18n;
  okuma hatası artık DB hata metnini sızdırmaz (log'a gider).
- Mobil: 5xx de hata kodunu gösterir.
Kanıt: `scripts/verify-api-error-copy.mjs`, `scripts/verify-web-errors.mjs`,
`docs/screenshots/web-errors/`.

### A23. Araç detayı: hata kartı ve istasyon listesi düzeni `[x]` — 2026-09-28
- Issue kartı (web + mobil, Issues ile ortak bileşen): açıklama ↖ (2 satır),
  durum rozeti ↗, sınıflandırma + saat ikonlu açık kalma süresi ↙,
  şiddet ↘; sağda ok (›). Mobil araç listesinde kartlar arası 12 px.
- Araç listesinde şiddet yalnız ikon (`showSeverityLabel={false}`; metin
  erişilebilirlik etiketinde). Issues'ta VIN ve şiddet metni kalır.
  (A31 ile değişti: şiddet metni her iki listede kalktı, ikon rozetin altında.)
- Şiddet ikonu: geometri tek kaynak `shared/severityBars.ts`; boş çubuklar
  içi boş çerçeve → düşük 1 / orta 2 / kritik 3 dolu çubuk renksiz (gri
  tonlamada) da ayırt edilir. Renkler hâlâ `shared/brand.ts`.
- İstasyon satırı: durum `shared/stationProgress.ts` (Tamamlandı / Devam
  ediyor / Başlanmadı) ikon + metin; mobilde aç/kapa oku. Web istasyon
  adımları paneli aynı ikon + metin.
Kanıt: `docs/screenshots/vehicle-issue-layout/` (önce/sonra 375-390-430,
şiddet karşılaştırması, `harness/` betikleri).

### A24. Kart fotoğrafı detaya gider; tam ekran yalnız detayda `[x]` — 2026-09-28
- Issue kartında (web + mobil; Issues listesi ve araç detayı listesi, ortak
  `IssueCard`) fotoğrafın ayrı dokunma davranışı ve tam ekran görüntüleyici
  kaldırıldı. Fotoğraf dahil kartın tamamı `/issues/:id` / `IssueDetail`'e gider.
- Kart türevleri değişmedi: kompakt `?thumb=1` (192 px), geniş `?thumb=md`
  (800 px). Tam ekran yalnız detayda ve orijinal dosya (`mediaFileUrl`, thumb yok).
- Kullanılmayan `issue.photoFullscreen` metni kaldırıldı.
Kanıt: `scripts/verify-card-photo-navigation.mjs` (web, 390/1280, 5 nokta;
detay lightbox orijinal bayt/çözünürlük karşılaştırması),
`harness/verify-mobile-card-press.mjs` (mobil, 375/430, 6 nokta),
`docs/screenshots/card-photo-navigation/`.

### A25. Yeni şablon maddesi yalnız aşamasını geçmemiş araca; sevk uyarısı ve ilerleme aynı küme `[x]` — 2026-09-28
- Kural `docs/11` Karar 15: madde, kapısının aşaması (şubeden sevk / depodan
  serbest bırakma) geçilmemiş araçlara dağıtılır; teslim edilmiş ve şubeye
  sevk edilmiş araç yeni SHIPMENT maddesi almaz. Etki önizlemesi EOL fazını da
  gönderir (`eol_phase`).
- Sevk öncesi uyarı aynı uygulanabilir kümeden gelir; `DELIVERED` araçta uyarı
  yok (web banner + mobil kart gizli). Açık istasyon adımları uyarıya eklendi.
- İlerleme % = geçen / uygulanabilir (istasyon adımları + checklist). `%100 ⇔
  açık madde yok`.
- Migration yok; mevcut satırlara dokunulmadı.
Kanıt: `backend/internal/repository/postgres/stage_applicability_test.go`
(`TEST_DATABASE_URL`, `*_test` veritabanı, rollback); `karea_test` üzerinde
eski/yeni API karşılaştırması (rapor).

### A26. Aşamasını geçmiş araçlardaki eski PENDING satırları: sil mi, "uygulanmaz" mı? `[x]` — kapatıldı, **aksiyon alınmayacak** (2026-09-28)
- Canlıda örnek: N7V1K1SA0TK000003 — 4 PENDING satır (madde 210, 221, 222,
  225).
- Karar: satırlar silinmez, ayrı durum veya bayrak da eklenmez. Karar 15'in
  "aşaması kapandı" kuralı (A27) bu satırları zaten doğru ele alıyor:
  - Uyarı, ilerleme %, checklist sayaçları, kapılar (Go + depo sıralama
    tetikleyicisi 0031) ve analiz oranları bu satırları saymıyor.
  - Checklist sekmesi bu satırları kapalı "Bu aşama tamamlandı (n)"
    bölümünde gösteriyor, iş gibi görünmüyorlar.
  - Aynı sorun tekrar oluşamaz: A25 dağıtımı aşaması geçmiş araca satır
    yazmıyor.
- Ayrı bir işaret veri modeline ikinci bir doğruluk kaynağı eklerdi ve
  geçmişi değiştirirdi. Kayıt olduğu gibi korunuyor.
- Kapsam ile aşama kuralı arasındaki boşluk bu karardan bağımsız; A28'de
  açık kalıyor.

### A27. İlerleme etiketi ne saydığını söyler; aşaması kapanan maddeler ayrı ve kapalı bölümde `[x]` — 2026-09-28
- İlerleme etiketi web ve mobilde "Araç ilerlemesi" oldu (ortak i18n, TR/EN).
  Altında kapsam satırı var: "İstasyon adımları ve checklist maddeleri,
  depodan serbest bırakılmaya kadar".
- Aynı etiket şu yerlerde de kullanılıyor: araç listesi, liste çıktısı ve
  mobil başlık.
- Analizdeki "EOL tamamlanma" farklı bir metrik olduğu için adı değişmedi.
- Checklist sekmesinde, aşaması geçilmiş araçta artık tamamlanamayan maddeler
  (`StageClosed`, Karar 15) ana listeden çıktı. Pasif maddelerle aynı düzende,
  varsayılan kapalı "Bu aşama tamamlandı (n)" bölümünde, "Uygulanmaz" rozetiyle
  ve düğmesiz gösteriliyor.
- Bu maddeler hiçbir sayıya girmiyor:
  - checklist sayacı ve kapı sayaçları (`branch_eol_remaining` …);
  - Go depo sıralaması;
  - DB tetikleyicisi `fn_enforce_eol_depot_after_branch` (migration 0031);
  - analiz oranları.
- Hattaki araçta hiçbir şey değişmedi.
- Mevcut satırlara dokunulmadı.
Kanıt: `docs/screenshots/stage-closed-checklist/` (ekran görüntüleri,
`dom-facts.json`, eski/yeni API karşılaştırması `api-compare.txt`, depo
girişi `depot-write.txt`, `analysis-diff.txt`);
`stage_applicability_test.go` (`*_test` veritabanı); `checklist_gate_test.go`.
0031 canlı DB'ye 2026-09-28'de uygulandı (sürüm 30 → 31, dirty=false). Satır
değişmedi. Salt okuma kontrolünde N7V1K1SA0TK000003'teki depo engeli kalktı.
Kalan 497 engel hattaki araçlar; kural gereği sürüyorlar.

### A28. Kapsam (`not_started`) ile aşama kuralı arasındaki boşluk `[ ]`
- `not_started` varsayılanı, checklist'e başlamış hat aracına yeni maddeyi
  yazmıyor. Buna rağmen kapı bu eksik maddeyi bekliyor.
- Hangisinin kazanacağına karar verilmeli: kapsam mı, uygulanabilir küme mi?

### A29. Kapalı bölümlerde çevrilmiş durum; kalıcı mobil ekran görüntüsü düzeneği `[x]` — 2026-09-28
- Web ve mobilde "Bu aşama tamamlandı" ve "Artık gerekli olmayan maddeler"
  satırlarındaki ham durum metni kaldırıldı. Yerine ortak
  `checklistRecordLabel` (i18n, TR/EN) kullanılıyor:
  - değerlendirilmemiş satır: "Değerlendirilmedi" (kimseden iş beklenmiyor,
    bu yüzden "Bekliyor" yazmıyor);
  - diğerleri: "Son kayıt: OK / NOT OK / REWORK / CONDITIONAL OK".
- `react-native-web`, `react-dom` ve `esbuild` mobil `devDependencies`'e
  eklendi.
- Düzenek `docs/screenshots/mobile-harness/`:
  - Gerçek mobil ekranları tarayıcıda çiziyor; yalnızca API, oturum,
    navigasyon ve depolama stub'lanıyor. Sahneler `scenes.ts` içinde.
  - Çalıştırma: `cd mobile && npm run screenshots -- <çıktı> [sahne,…] [--locales tr,en]`.
  - 375, 390 ve 430 px'de görüntü alıyor. Kapalı bölümleri açıp tekrar
    çekiyor.
  - Sayfa hatası, yatay taşma veya kapalı bölümde ham durum metni görürse
    hata veriyor.
- Üretim paketine girmiyor. `expo export` ile üretilen iOS ve Android
  bundle'larında `react-native-web` / `createDOMProps` /
  `unstable_createElement` izi sıfır.
- Eski `vehicle-issue-layout/harness` da artık `/tmp` yerine mobil
  bağımlılıkları kullanıyor.
Kanıt: `docs/screenshots/stage-closed-checklist/mobile/` (TR tüm sahneler,
`en/` İngilizce, `facts.json`).
- Aktif EoL rozetindeki `PENDING` sorunu A30'da düzeltildi.

### A30. Türkçe arayüzde İngilizce teknik terim yok `[x]` — 2026-09-28
- EoL durum adları Türkçeleşti: Bekliyor / Uygun / Uygun değil / Yeniden
  işlem / Şartlı uygun. İngilizcede de enum yazımı kalmadı: Pending / OK /
  Not OK / Rework / Conditional OK.
- Web ve mobil aynı anahtarları kullanıyor. Mobilde dördüncü düğme artık
  kısa "COND." değil, "Şartlı uygun"; `checklist.conditionalShort`
  kaldırıldı.
- Düzeltilen diğer TR metinler:
  - Evet / Hayır (önceden `(OK)` / `(NOT_OK)` ekli);
  - durum seçme ipucu;
  - operatör ipucu (`WITH_CUSTOMER` / `SHIPPED` yazıyordu);
  - hattaki araçlar başlığı (`IN_PRODUCTION`);
  - EoL sıfırlama metinleri (`IN_PRODUCTION`, `APP_ENV`, 404);
  - dosya kutusu (`FILE`);
  - şablon fazları (`BRANCH` / `DEPOT` yerine Fabrika / Depo);
  - şablon onayları (`PENDING`);
  - depo kilidi ve kapı hataları (`CONDITIONAL_OK`);
  - faz hataları (`eol_phase`);
  - çözüm açıklaması (`solution_description`);
  - "Severity" yerine "Şiddet".
- Koddaki ham gösterimler düzeltildi:
  - web `StatusBadge` bekleyen EoL satırında ham `PENDING` değerini
    basıyordu;
  - web EoL düğmeleri ham değer basıyordu (`NOT_OK`, `CONDITIONAL`);
  - analiz filtre özeti ham şiddet değerini basıyordu (`CRITICAL`);
  - kapı hatalarında checklist türü ham geliyordu (`SHIPMENT`), artık
    Sevk / Test / EOL olarak çevriliyor.
- Bilerek bırakılanlar:
  - kısaltmalar: VIN, EOL/EoL, KPI, MTTR, CSV, ZIP, PDF, JPEG, PNG, HEIC,
    ADAS;
  - ürün sözlüğü: Issue(s), Checklist, Test, Model, Final (şablon bölüm
    adı), Karea;
  - rol kodu örneği `QUALITY_LEAD` (kullanıcının gireceği kod biçimi).
- Kalıcı koruma: `shared/i18nMessages.selftest.ts`, TR tabloda ham enum,
  snake_case alan adı veya env ataması görürse hata veriyor.
Kanıt: `docs/screenshots/i18n-technical-terms/`:
- `selftest-before.txt`: eski dosyada 23 anahtar hata veriyor;
- `selftest-after.txt`: 1155 anahtar temiz;
- `web-render.txt`: gerçek web bileşeninin çıktısı;
- `mobile/`: 375, 390 ve 430 px, TR ve EN.

### A31. Issues kartı araç detayı kartıyla aynı; şiddet metni yok `[x]` — 2026-09-28
- Ortak `IssueCard` (web + mobil), Issues listesi ve araç detayı listesi
  için tek düzen, hem ızgarada (fotoğraf üstte) hem sıkışıkta (fotoğraf solda):
  - açıklama ↖ (2 satır);
  - durum rozeti ↗, şiddet ikonu hemen altında, sağ kenarları hizalı;
  - sınıflandırma satırı tam genişlikte;
  - VIN (yalnız Issues'ta) ve açık kalma süresi en altta, solda.
- Şiddet metni (Kritik / Orta / Düşük) kaldırıldı; seviye dolu çubuk
  sayısıyla okunuyor. `showSeverityLabel` seçeneği ve kullanılmayan
  `severityMessageKey` silindi.
- Seviye adı ekran okuyucuda kaldı: web ikonu `role="img"` +
  `aria-label`; mobil kartın etiketi "…, Şiddet: Orta, …" içeriyor.
- Araç detayında değişen tek şey: ikon sağ alttan rozetin altına taşındı.
- Mobil düzenek: `issues-list` (gerçek `MyIssuesScreen`) ve `vehicle-issues`
  sahneleri, `--widths`, `CARD_TEXT` kırpması ve `EXPECT_ISSUE_LAYOUT=1`
  düzen kontrolü eklendi.
Kanıt: `docs/screenshots/issue-card-severity-right/`:
- `web/` ve `mobile/` altında `before/` ve `after/`: 375, 390, 430 ve
  1280 px, TR ve EN, `facts.json`;
- `compare/`: aynı kaydın iki ekrandaki kartı yan yana; `compare.txt`'te
  5 kayıt × 2 dil × 4 genişlik × 2 platform için 80 karşılaştırma, fark 0;
- `source-scan.txt`, `build-and-tests.txt`.

### A32. İlerleme % tek kaynak; saklanan kolon kaldırıldı `[x]` — 2026-09-30
- `vehicles.total_progress_percentage` (yalnız istasyon adımları, trigger +
  Go iki kez yazıyordu) ve tek okuyucusu `vw_vehicle_completion_split`
  kaldırıldı — migration 0032 (up + down), `docs/11` Karar 16.
- Yüzde yalnız `vehicleProgressSQL`'den gelir: istasyon adımları + EOL fabrika
  + TEST + SHIPMENT + EOL depo. Depo maddeleri bitmeden %100 çıkmaz.
- Trigger yalnız güncel istasyonu ve PLANNED → IN_PRODUCTION geçişini yazar.
  Go'da `ComputeProgress`/`UpdateProgress` yerine
  `ComputeCurrentStation`/`UpdateCurrentStation`.
- `database/scripts/reset_and_load_vins.sql` kolonu artık yazmıyor.
- 0001/0002'deki view oluşturma kolon yoksa atlanıyor; tam yeniden uygulama
  v32'de geçiyor.
- **Canlıya uygulandı (2026-09-30), `docs/19` §6 A yolu:** önce API güncel
  kodla yeniden başlatıldı ve v31'de salt okunur doğrulandı, sonra 0032
  (v31 → v32, 48 ms, `/health` kesintisiz). Yeniden başlatma kesintisi
  ~1,07 sn. Ayrıca plansız ~1 dk 42 sn kesinti: yeni süreç, başlatıldığı
  kabuk kapanınca sonlandı. Arka plan terminalindeki ikinci süreç de
  12:03:29Z'de kapandı (~34 sn); API şimdi kendi oturumunda, launchd
  altında çalışıyor (`/tmp/karea-api-0032`).
  Canlıda 500 araçta ilerleme v31 ve v32'de birebir aynı.
- Entegrasyon testleri (`progress_scope_test.go`): depo maddeleri eksik araç
  %97,02, depo bitince %100; hattaki araçta yüzde = açık madde sayısıyla
  tutarlı; yeni DEPOT/SHIPMENT maddesi, dağıtımdan önce ve sonra yüzdeyi
  doğru düşürür; detay, liste ve arama aynı sayıyı verir; şemada hiçbir
  kolon, view veya fonksiyon `progress_percentage` içermez.
- Takip (değişmedi, Karar 16 riskleri): yüzdenin istasyon kısmı
  `station_steps.is_active`'e bakmıyor; güncel istasyon trigger ve Go'da iki
  kez hesaplanıyor.
Kanıt: `docs/screenshots/progress-single-source/`:
`before-stored-vs-app.txt`, `integration-tests-after.txt`,
`rollback-on-test-db.txt`, `verify-migrations.txt`, `source-scan.txt`,
`reset-script-on-copy.txt`, `build-and-tests.txt`, `live-apply.txt`.

### A33. Aktivite okunur; sınıflandırma geçmişte; süreç ekrandan gizli `[x]` — 2026-09-30
- **Aktivite detay sütunu:** hata ve araç durumları, EOL aşamaları ve
  checklist sonuçları çevrilmiş adla ve "Açık → İşlemde" biçiminde görünüyor.
  Sınıflandırma satırında parça ve tip id yerine katalog adı var ("Parça:
  Doghouse → Kapı · Kusur tipi: Deformasyon → Boşluk / hizasızlık"). İşlem
  sütununda "Tüm tipler" yazan olay artık "Sınıflandırma düzeltildi"; olay
  tipi filtresine "Hata sınıflandırması" eklendi. Metinler TR + EN.
- **Ham değer taraması:** Analiz CSV'si durum, şiddet, EOL aşaması ve yaş
  aralığını kod olarak yazıyordu; istasyon FPY satırında istasyon adı yerine
  id vardı. Hata CSV'sinde şiddet kod olarak çıkıyordu. Hepsi çevrildi.
  Başka ham değer gösteren ekran veya sütun bulunmadı.
- **Hata geçmişi:** "Durum Geçmişi" → "Geçmiş". Sınıflandırma düzeltmeleri
  durum değişiklikleriyle aynı çizelgede: kim, ne zaman, hangi alan neden
  neye (web, mobil, yazdırma). Süreç burada da görünmez.
- **Sorumlu süreç ekrandan kaldırıldı** (`docs/11` Karar 17): hata detayı
  (web + mobil), düzenleyici, yazdırma, Analiz grafiği, "süreci atanmamış"
  oranı, Analiz CSV'si ve yazdırması. Arayüzün yanı sıra hata CSV dışa
  aktarmasındaki `sorumlu_surec` kolonu da kaldırıldı; bu dosyayı okuyan
  bir araç varsa kolon düzeni değişti. Veritabanı kolonu, otomatik atama ve
  audit kaydı aynen kalıyor, veri birikmeye devam ediyor.
  **Yeniden açılacak:** kalite ekibi şu altı kusur tipine varsayılan süreç
  tanımladığında: boşluk/hizasızlık, çizik/darbe/hasar, deformasyon,
  sızdırma, ses/titreşim, Diğer. O zaman ekranlar, Analiz grafiği ve hata
  CSV'sindeki `sorumlu_surec` kolonu birlikte geri açılacak.
- **Yetim audit satırları (silinmedi, karar bekliyor):** 395 audit
  satırının 6'sı artık olmayan hataya bağlı. Bunlar 1 ve 2 (hata 7), 12
  (hata 10), 427 (hata 40), 428 (hata 41) ve 429 (hata 42). 429 ayrıca
  silinmiş katalog parçası 50'yi (TEMP_C_PROMOTE_PART) gösteriyor. Checklist
  maddesi ve medya yetimi yok. `vin`, `station_id` ve `performed_by` FK'li
  olduğu için yetim olamaz. Audit geçmişi olduğu için silme kararı
  birlikte verilecek.
- **Canlı API** (pid 78258, 6dd1f06'dan derlendi) backend değişikliklerini
  içermiyor. Yeniden başlatılana kadar Aktivite'de sınıflandırma satırının
  detayı "—", hata geçmişinde yalnız durum satırları görünür. Migration
  yok; kod önce yeniden başlatma yeterli.
Kanıt: `docs/screenshots/activity-history-process/`:
`live-readonly-activity-history.txt`, `orphan-audit-scan.txt`,
`build-and-tests.txt`.

### A34. Katalog yeterliliği kartı; grafik etiketleri; VIN bağlantısı `[x]` — 2026-09-30
- **Katalog yeterliliği kartı:** üstte tek cümlelik açıklama ("“Diğer”
  seçimleri katalogda eksik kalan yerleri gösterir; oran yükselirse katalog
  gözden geçirilmeli"). Belirsiz üst çubuk kaldırıldı; yerine iki net
  sayı var: "Diğer" seçilen parça ve "Diğer" seçilen kusur tipi, her biri
  adet + oran. **Payda artık sınıflandırılmış hata sayısı** (eskiden tüm
  hatalar). Serbest metin listeleri "Kataloğa eklenecek adaylar" başlığıyla
  kaldı. Katalog öncesi (sınıflandırılmamış) kayıtlar kesik çizgili ayrı
  bir kutuda, "Yukarıdaki oranlara dahil değildir" notuyla. Aynı düzen
  yazdırmada ve Analiz CSV'sinde de var: CSV'de oranlar sınıflandırılmış
  hatalar üzerinden, katalog öncesi ayrı bölümde. Yalnız frontend
  değişikliği; API sorgusu aynı.
- **Grafik etiketleri:** "En çok hata çıkan parçalar", "Parça × kusur
  tipi", sıcak nokta, istasyon, raporlayan ve kusur tipi grafiklerinde
  eksen etiketleri tek satır. Etiket genişliği en uzun etikete göre
  hesaplanıyor (grafik genişliğinin %45'i, kombinasyonda %55'i ile
  sınırlı); sığmayan metin "…" ile kısaltılıyor, tam metin üzerine
  gelince görünüyor. Satır yüksekliği 30 px. Yazdırmada da aynı kısaltma
  var ama orada hover olmadığı için tam ad görünmez. Ana sayfa grafikleri
  yalnız sayısal eksen kullandığı için değişmedi.
- **VIN bağlantısı:** hata detayındaki araç kimliği mobilde ve webde araç
  detayına gidiyor. VIN'in son hanelerinin altı çizili ve yanında ok var.
  Mobilde `VehicleStation` ekranına, webde `/vehicles/<VIN>` sayfasına
  gidiyor; iki tarafta da önceden bağlantı değildi.
Kanıt: `docs/screenshots/analysis-labels-vin/`: önce/sonra kart ve
grafik görüntüleri (1280 + 1920 px, yazdırma), `before-facts.json` /
`after-facts.json` (etiket çakışma ölçümü), mobil VIN dokunma testi
(`verify-mobile-vin-link.mjs`, TR + EN), `build-and-tests.txt`.

### A35. Pasif bölge kapanır; pasif değer düzenlemeyi kilitlemez `[x]` — 2026-10-01
Katalog incelemesinin (`docs/screenshots/catalog-flows/`) üç bulgusu
kapatıldı. Kararlar `docs/11` Karar 18 ve 19.
- **Pasif bölge (bulgu A):** pasif bölgedeki parça pasif sayılır. Aktif
  parça listesinde ve aramada çıkmaz (web, mobil; mobilde eski önbelleğe
  karşı istemcide de bölge süzgeci var). Hata açılışında
  `selected part's zone is inactive` ile reddedilir. Pasif bölgeye yeni
  parça eklenemez, başka bölgeden taşınamaz, "Diğer"den kataloğa alınamaz.
  Bölge yeniden açılınca parçalar geri gelir. Mevcut hatalar ve anlık
  görüntüler değişmez.
- **"Diğer" kendi bölgesinde:** 99-99 Body'den yeni bölge 99 "Diğer"e
  taşındı (migration 0033, yalnız veri; up + down). Parça id'si ve kodu
  aynı, mevcut hataların sınıflandırması ve `99-99-xx` kodları bozulmaz;
  eski "Diğer" hatalarında bölge Body yerine "Diğer" görünür. Bölge 99,
  parça 99-99 ve tip 99 pasife alınamaz ve silinemez; yönetim sayfasında
  düğmeleri kapalı.
- **Değişmeyen alan doğrulanmaz (bulgu B, C):** sınıflandırma düzeltmesi
  pasif kontrolünü yalnız değişen parça, tip ya da süreçte yapar.
  Düzenleyiciler (web + mobil) süreci artık göndermez; kayıtlı süreç
  korunur, tip değişirse yeni tipin varsayılanı yazılır. Kayıtlı pasif
  bölge, parça ve tip "(pasif)" etiketiyle seçili kalır ve bir açıklama
  satırı görünür; değiştirilirse yalnız aktif seçenekler sunulur.
  Değişmeyen parça/tipin ad anlık görüntüsü ve `defect_code` korunur.
  Reddedilen işlemlerde sebep açık metinle görünür (TR + EN).
- **Filtreler:** Issues sayfasının (web + mobil) bölge, parça ve kusur tipi
  filtreleri pasif değerleri "(pasif)" etiketiyle listeler
  (`?include_inactive=1`), eski hatalar onlarla da süzülebilir.
- **Yayın sırası:** kod eski şemada çalışır. Önce API yeniden başlatılır,
  sonra 0033 uygulanır; kesinti yok.
- **Canlıya uygulandı (2026-10-01):** API güncel kodla yeniden
  başlatıldıktan sonra `migrate up 1` (v32 → v33, 35 ms, API yanıt vermeye
  devam etti). Bölge 99 "Diğer" eklendi (id 10); 99-99 (id 1) Body'den bu
  bölgeye taşındı. Tek "Diğer" hatası (38) ve 27 hatanın tamamının
  sınıflandırma alanları önce/sonra birebir aynı (md5). "Diğer" koruması
  canlıda salt okunur işlemde gerçek yönetim koduyla doğrulandı: 7 deneme
  (bölge/parça/tip pasife alma, silme, 99-99 taşıma) reddedildi.
Kanıt: `docs/screenshots/catalog-fixes/`: `verification-output.txt`
(ayrı test DB'de 0033 öncesi/sonrası, down/up turu, tüm senaryolar),
`capture-output.txt` + web ekran görüntüleri (düzenleyici, filtre, yönetim),
`error-messages-output.txt`, `build-output.txt`, `live-0033-apply.txt` +
`live-0033-snapshot.sql` (canlı uygulama). Mobil cihaz görüntüsü
alınmadı; mobil yalnız tip denetimiyle doğrulandı.

### A36. Katalog seed'i, kod biçimi, ad tekrarı, mobil önbellek `[x]` — 2026-10-01
Katalog incelemesinden kalan dört bulgu.
- **Seed yalnız ekler:** `05_defect_catalog.sql` `ON CONFLICT DO NOTHING`;
  yeniden çalıştırmak katalog düzenlemelerini geri almaz. Diğer seed
  dosyalarının durumu B6'da.
- **Kod biçimi (Karar 20):** parça kodu `<bölge kodu>-NN`, kusur tipi
  kodu iki hane. Yanlış önek ("40-77" Body'de, "ZZZ") 400 ile ve beklenen
  ön ek yazılarak reddedilir; oluşturma, düzenleme (kod/bölge
  değiştiyse) ve "Diğer"den kataloğa almada. Yönetim sayfası seçilen
  bölgeye göre bir sonraki kodu (Body'de 10-11 gibi), tiplerde bir sonraki
  iki haneli kodu önerir; elle değiştirilebilir, biçim hatası anında
  gösterilir ve kaydet kapanır.
- **Ad tekliği (Karar 20):** aynı bölgede aynı parça adı, herhangi iki
  kusur tipinde aynı ad 409 ile reddedilir (TR veya EN; büyük-küçük harf,
  boşluk, noktalı/noktasız i farkı sayılmaz; pasifler dahil). Farklı
  bölgede aynı ad serbest. Eski kayıtlar düzenlenebilir kalır.
- **Canlı tarama (salt okunur, düzeltme yapılmadı):** 24 parça ve 10 tipte
  yanlış biçimli kod yok, bölge içinde ya da tipler arasında tekrarlanan
  ad yok; koda sahip 10 hatanın `defect_code` anlık görüntüsü
  `NN-NN-NN` biçiminde (`live-scan-output.txt`).
- **Mobil tazeleme (Karar 21):** uygulama açıkken katalog 15 dakikada bir
  tazelenir; sınıflandırma alanlarında yaş satırı ve "Kataloğu yenile".
- **Kuyrukta düzeltme (Karar 21):** parçası/tipi katalogdan kaldırılan
  kayıt "Bu parça katalogdan kaldırıldı, lütfen yeni bir parça seçin."
  der; "Sınıflandırmayı düzelt" ile yeni parça/tip seçilip aynı kayıt
  fotoğraf ve açıklamasıyla yeniden gönderilir.
- **Mobil düzenek:** canlı sahneler gerçek kuyruk ve önbellek
  sağlayıcılarını sahte depolama/API üzerinde çalıştırır
  (`queue-rejected`, `queue-refresh`).
- **Yayın:** migration yok; backend değişti, API yeniden başlatılmalı.
Kanıt: `docs/screenshots/catalog-codes/`: `verification-output.txt`
(ayrı test DB: eski seed adı geri alıyor, yeni seed koruyor; kod ve ad
reddi/kabulü API üzerinden), `error-messages-output.txt` (sunucu
metinlerinin TR/EN karşılığı), `capture-web-output.txt` + `web-*.png`
(öneri, yanlış önek, aynı ad, başka bölgede aynı ad, tip önerisi),
`mobile-flows-output.txt` + `mobile/*.png` (red sebebi, düzeltme formu,
yeniden gönderim; sahte saatle 14. dakikada çekim yok, 15. dakikada var,
elle yenileme), `mobile-harness-regression.txt` (tüm sahneler),
`live-scan-output.txt`, `build-output.txt`. Gerçek cihazda görüntü
alınmadı; mobil kanıt react-native-web düzeneğinden.

### A37. Checklist bölümleri madde içeriğine göre `[x]` — 2026-10-02
0024'ün `item_no` aralığıyla yaptığı bölüm ataması içerikle ilgisizdi
(Karar 23).
- **Sevk (7 bölüm):** Kimlik, Logo & Etiket; Dış Görünüm; İç Donanım &
  Trim; Kapı & Kaput Ayarı; Elektrik & Kablaj; Sızdırmazlık (yeni);
  Şasi, Fren & Direksiyon (yeni). "Şarj & Final" kaldırıldı. Bölümsüz
  44–46 da atandı. #29 ve #42 sahadan teyit bekliyor.
- **Test (7 bölüm):** Soğuk Sıkma Testi (1–3), BCM / EE Fonksiyon
  Kontrol (4–15), Sürüş Testi (16–24), Fren Testi (25–29), Rot Testi
  (30–32), Sıcak Sıkma Testi (33–37), Mühendislik & Kalite Kontrol
  (38–43). Eski 11 bölüm kaldırıldı; pasif #44/#45 bölümsüz.
- **Migration 0035:** her madde `seed_key` ile tek tek atanır, aralık
  yok; idempotent, geri alma dosyası 0035 öncesi canlı değerleri yazar.
  Seed 03 aynı değerleri taşır; katalog ve TR/EN adlar
  `shared/checklistSections.ts` + `messages.ts`.
- **Canlı (2026-10-02):** 0035 uygulandı, sürüm 34 → 35; 90 satırın
  bölümü değişti (Sevk 45, Test 45; Sevk #16 zaten Dış Görünüm). Metin,
  sıra, aktiflik md5'leri ve 53000 araç ilerleme kaydı aynı kaldı:
  `live-apply-output.txt` + `live-snapshot.sql`. Yeni web birlikte
  yayına alınmalı; mobilde yeni sürüm yüklenene kadar eski uygulama
  bölüm başlığını ham anahtar olarak gösterir.
Kanıt: `docs/screenshots/checklist-sections/`: `verification-output.txt`
(canlı şablon satırlarının kopyası üzerinde 0035: madde tablosu, iki
kez çalıştırma, geri alma, yeniden sıralamaya dayanıklılık, seed
karşılaştırması, metin/sıra/aktiflik değişmedi), `capture-web-output.txt`
+ `web-*.png` (araç detayı Test/Sevk paneli TR/EN/390, şablon ekranı
bölüm seçicisi), `mobile-run-output.txt` + `mobile/*.png` (Test ve Sevk
ekranları, react-native-web düzeneği), `build-output.txt`. Gerçek
cihazda görüntü alınmadı.

### A38. Form öğelerinde odak halkası yalnız klavyede `[x]` — 2026-10-02
Onay kutusu ve seçim düğmesi fareyle tıklandıktan sonra 2px turuncu
çerçeve kalıyordu. Kaynak `web/src/index.css`'teki ortak
`input/textarea/select:focus` kuralıydı: bu kalıcı bir çerçeve değil,
odak halkası. Öğe tıklamadan sonra odakta kaldığı için halka da kalıyordu.
Kural artık `:focus-visible` ile çalışıyor; `:focus:not(:focus-visible)`
halkayı kaldırıyor. Tab ile gelindiğinde halka görünür. Metin alanları ve
`select` tıklamada da halka gösterir: tarayıcı bu öğeleri her zaman
`:focus-visible` sayar, çünkü klavye girdisi alırlar. Mobilde CSS odak
halkası yok; onay kutuları `Pressable`'dır ve çerçeve yalnız işaretli
durumu gösterir. Kanıt: `docs/screenshots/form-focus-ring/`
(`before-*` / `after-*` görüntüleri ve ölçümleri, `build-output.txt`;
API Playwright ile taklit edildi).

---

## B — Canlıya çıkmadan önce ZORUNLU

### B1. HTTPS `[!]`
Her şey `http` üzerinden gidiyor; şifreler ve token'lar açık dolaşıyor.
Bu haliyle canlıya çıkamaz. iOS tarafında ayrıca App Transport Security
düz HTTP'yi engeller.

### B2. Sırların `.env`'den çıkarılması `[!]`
Geliştirmede `JWT_SECRET` bilinçli girilir (boş/<32 süreç başlamaz).
Üretimde sırlar sunucudaki güvenli kaynaktan gelmeli; `.env` ile
dağıtılmamalı.

### B3. Demo hesapların temizlenmesi `[!]`
`changeme123` şifreli hesaplar repoda yazılı. Üretim seed'i geliştirme
seed'inden ayrılmalı: sadece gerçek katalog ve gerçek şablonlar.

### B4. Backend servis olarak çalışmalı `[!]`
Şu an elle başlatılıyor, çöktüğünde kendiliğinden kalkmıyor — bu
oturumda defalarca öldüğünü gördük. systemd veya eşdeğeri gerekli.

### B5. Veritabanı yedekleme `[~]`
**Geliştirme:** `database/scripts/backup.sh` + `restore.sh` (DB dump +
uploads arşivi, `backups/`, retention; `docs/09` §6).
**Kalan (üretim):** otomatik zamanlama, off-site saklama, restore drill.

### B6. Üretim veritabanı kurulumu `[~]`
Boş DB + migration yolu net; checklist gerçek içerik `database/seed/03`'te.
500 VIN: `database/scripts/reset_and_load_vins.sql` (seed değil; `docs/09`
§5 üretim adımlarında). Kalan: kontrollü prod koşumu, B3 kullanıcı ayrımı,
migration dirty-state prosedürü.

**Çözüldü (2026-10-01) — katalog seed'i artık yalnız ekler:**
`database/seed/05_defect_catalog.sql` dört katalog tablosunda da
`ON CONFLICT (code) DO NOTHING` kullanıyor. Yeniden çalıştırılırsa yalnız
eksik satırları ekler; kalite ekibinin değiştirdiği ad, sıralama, bölge ve
varsayılan süreç korunur (A36).

**Çözüldü (2026-10-01) — checklist, istasyon ve adım seed'leri de artık
yalnız ekler:**
- `03_checklist_templates.sql`: eskiden `ON CONFLICT (template_id,
  item_no) DO UPDATE` ile madde metnini, EoL fazını, bölümü ve
  `is_active`'i yazıyordu. Eşleştirme `item_no` üzerindendi; yeniden
  sıralama `item_no`'yu değiştirdiği için metinler başka maddelerin
  üzerine yazılıyordu (test DB'de yeniden üretildi: ters sıralamadan
  sonra 14 maddenin metni değişti, pasif madde açıldı). Artık mevcut
  maddeye hiç dokunmuyor. Kararlı anahtar migration 0034'teki
  `checklist_template_items.seed_key`: satır oluşturulurken metnin md5'i,
  sonra hiç güncellenmez (metin düzenleme, pasife alma, sıralama onu
  değiştirmez). Seed, şablonunda bu anahtar yoksa maddeyi ekler: asıl
  `item_no` boşsa oraya, doluysa son maddenin arkasına. Yönetim
  ekranından eklenen maddelerde `seed_key` NULL.
- `01_stations.sql`: `is_active` artık yazılmıyor; ad yalnızca migration
  0002'nin koyduğu dokunulmamış `Station N` yer tutucusundaysa değişiyor
  (temiz kurulum için gerekli). Diğer istasyonlara dokunmuyor.
- `02_stations_and_steps.sql`: `DO NOTHING`; istasyonu ada göre değil
  `sequence_no` ile buluyor, böylece adı değişmiş istasyonun eksik
  adımları da ekleniyor. İstasyon ve adım sırasını değiştiren kod yolu
  yok; `(station_id, sequence_no)` kararlı.
- Kanıt: `docs/screenshots/seed-insert-only/verification-output.txt`
  (yükseltme yolu: 0001–0033 + eski seed'ler → 0034 + yeni seed'ler;
  ayrıca temiz kurulum). Düzenlenen metin, pasif madde, yeniden sıralama,
  istasyon/adım adı ve `is_active` korunuyor; silinen madde/adım geri
  ekleniyor; ikinci koşum `INSERT 0 0`; 1836 araç ilerleme kaydı aynı
  maddeyi göstermeye devam ediyor.
- Canlıya alma: önce migration 0034 (kolon ekler, kesinti yok; API kodu
  kolonu okumuyor), sonra gerekirse seed.
- **Canlıya uygulandı (2026-10-01):** `schema_migrations` 33 → 34,
  `dirty=false`. Varsayılan şablonlardaki 108 maddenin hepsine anahtar
  yazıldı (104 seed maddesi + 4 seed dışı pasif madde: TEST #44/#45,
  EoL #16/#17); NULL kalan yok. Seed 03, `BEGIN … ROLLBACK` içinde
  `INSERT 0 0`. Metin, sıra, aktiflik ve 53000 ilerleme kaydının md5
  özetleri önce/sonra aynı. Kanıt:
  `docs/screenshots/seed-insert-only/live-apply-output.txt`.
- Sınır: seed'in geri eklediği madde/adım için mevcut araçlara PENDING
  ilerleme satırı açılmaz (yönetim ekranındaki ekleme açar). Canlıda
  eksik madde gerekiyorsa yönetim ekranından eklenmeli.
- `06_test_vehicles.sql` değiştirilmedi: araç modeli adını ve
  `is_active`'i yazar; dosya yalnız geliştirme/test içindir, üretimde
  çalıştırılmaz.
- `04_users.sql`: `DO NOTHING`, sorun yok. Roller ve izinler seed değil,
  migration'larda (0002, 0010, 0013); migration'lar bir kez çalıştığı
  için yeniden koşum riski yok.

### B7. Hata izleme ve log toplama `[~]` — sunucu gerektirmeyen kısım yapıldı
**Yapıldı:**
- Panik kurtarma (`recoverPanic`): beklenmeyen çökme süreci öldürmüyor,
  istemciye 500 dönüyor, stack yalnızca loga yazılıyor. Doğrulama için
  panik probe'u eklendi; üretimde 404, kayıtlıyken kimlik doğrulama
  zorunlu (iki testle kanıtlandı).
- Loglar dosyaya yazılıyor, boyut bazlı döndürme, seviye ayarı,
  şifre/token maskeleme (`applog.Redact`).
- Her isteğe request id; 5xx yanıtlarında kullanıcıya "Hata kodu"
  olarak gösteriliyor (4xx'te gösterilmiyor), logdaki id ile aynı
  olduğu testle kanıtlandı.

**Kalan (sunucu gelince):** Sentry veya eşdeğeri dış izleme, merkezi
log toplama, uyarı kuralları. Ayrıca `LOGIN_RATE_LIMITED` audit
olayları şu an hiçbir ekranda görünmüyor — yönetici için güvenlik
olayları görünümü burada ele alınacak.

### B8. Giriş hız sınırı sayaçlarının kalıcı olması `[ ]`
A4'te sayaçlar bellekte tutuluyor. İki koşulda yetersiz kalır:
- Backend birden fazla örnek olarak çalışırsa sınır örnek sayısı
  kadar katlanır (her örneğin kendi sayacı olur)
- Backend sık yeniden başlarsa kilitler sürekli sıfırlanır (B4
  çözülene kadar backend elle başlatılıyor ve düşüyor)
Tek örnek + kararlı servis ile kabul edilebilir; ikisinden biri
değişirse sayaç tabloya taşınmalı.

---

## C — Dış bağımlılık bekleyenler

### C1. SMTP bilgileri `[ ]` — IT'den
Davet maili ve self-servis şifre sıfırlama için. Kod tarafı hazır
bekliyor; SMTP gelince tek aşamada eklenir.

### C2. Sunucu ve veritabanı `[ ]` — IT'den
Linux VM, sabit adres, PostgreSQL örneği, ağ/firewall izinleri.

### C3. Apple Developer hesabı `[ ]` — D-U-N-S ile başvuru sürecinde
Geldiğinde: EAS ile development build → TestFlight → dağıtım.
Şu an Expo Go'ya bağımlıyız ve sürüm güncellemeleri bizi vuruyor
(SDK 54 → 57 geçişini bu yüzden yaptık).

### C4. HTTPS sertifikası `[ ]` — IT'den (B1 ile aynı)

---

## D — Canlı sonrası / opsiyonel

### D1. CI/CD `[ ]`
Her push'ta otomatik derleme ve test; deployment hattı.

### D2. Yük testi `[ ]`
Şu an 500 araç × 104 madde = 52 bin satır. Binlerce araçta bazı
sorgular gözden geçirilmeli.

### D3. Refresh token `[ ]`
"Beni hatırla" işaretli olsa bile token 24 saatte doluyor, kullanıcı
her gün tekrar giriş yapıyor. Gerçek çözüm kısa ömürlü erişim token'ı
+ uzun ömürlü yenileme token'ı.

### D4. Model bazlı şablonlar `[ ]`
Altyapı var (`vehicle_model_id`) ama kullanılmıyor, tüm araçlarda model
boş. İkinci bir araç modeli çıkınca devreye girer.

### D5. Bundle boyutu `[ ]`
Web bundle 500 kB uyarısı veriyor. LAN'da sorun değil, uzaktan
erişimde yavaşlık hissedilirse bakılır.

### D6. Tekrar eden hata analizinin derinleştirilmesi `[ ]`
Şu an aynı araç + aynı kod üzerinden sezgisel. Fotoğraf/açıklama
analiziyle geliştirilebilir.

### D7. Test verisinin temizlenmesi `[ ]`
Geliştirme ortamındaki test araçları ve şablon maddeleri. Üretim
sıfırdan kurulacağı için oraya taşınmayacak; sadece geliştirme
ortamındaki dağınıklık meselesi.

---

## Önerilen sıra

**Tamamlananlar (kod):** A1 (mobil offline kuyruk — cihazda doğrulandı),
A4, A5, A11–A19, B7’nin sunucu gerektirmeyen kısmı.

**Şimdi (kod, dış bağımlılık yok):**
1. **A0** — geliştirme DB yedeği (en yüksek; veri git’te yok)
2. **A3** — kritik hata bildirimi
3. **A6** — uçtan uca otomatik test
4. **A9** — kalite ekibi katalog gözden geçirmesi
5. **A10** — kalan mobil cihaz doğrulamaları (kısmen açık)
6. A7 / A8 — ihtiyaç doğunca (yorum; ayrı izinler)

**Beklemede:** A2 (eski 1619 kayıt — veri elde yok).

**Paralel (IT, haftalar sürer):** C1 SMTP, C2 sunucu/DB, C3 Apple,
C4 HTTPS sertifikası.

**Canlıdan hemen önce:** B1–B4 engelleyiciler + B5/B6 üretim yedekleme
ve kurulum + B8 (çok örnek / sık restart olursa rate-limit kalıcılığı).

**Canlı sonrası / opsiyonel:** D1–D7.
