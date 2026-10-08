# KAREA — Web / Mobil Ayrışma Envanteri

Son güncelleme: 2026-10-08 (kod tabanı `061c220`).

**Kural:** Web'e veya mobile kullanıcıya görünen bir özellik eklendiğinde,
kaldırıldığında ya da değiştiğinde bu dosya aynı commit'te güncellenir. Yeni
satırda "Fark" sütunu boş bırakılmaz: kasıtlı mı, unutulmuş mu, yazılır.

**Sütunlar:** Var / Yok / Kısmen. "Fark" sütunu:
- **Kasıtlı** — mobilde (veya webde) olmasına gerek yok; gerekçe yanında.
- **Unutulmuş** — iki tarafta da olması gerekirdi; açık iş.
- **Eşit** — iki tarafta aynı davranış.

**Kasıtlılığın dayanağı:** PRD §5 + §10 (karar 4) ve MoSCoW #13: operatör yalnız mobil
(tik atma, checklist, hata bildirme), yönetici yalnız web (takip, analiz,
yönetim). MoSCoW #30: çevrimdışı öncelikli senkronizasyon Faz 1'de yok (W).
Bunun dışındaki farklar için yazılı bir karar yoksa satır "Unutulmuş"
sayılmıştır.

Kanıt yolları: web `web/src/…`, mobil `mobile/src/…`.

---

## 1. Arıza listesi

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Liste kapsamı | Tüm arızalar (`pages/IssuesPage.tsx`) | Tüm arızalar; ekran adı `MyIssuesScreen` ama filtre yok, pano gibi | Eşit |
| Serbest metin / VIN araması | Var | Var (istemci tarafı, `issueMatchesListQuery`) | Eşit |
| Durum filtresi (çoklu) | Var | Var | Eşit |
| Önem derecesi filtresi | Var | Var | Eşit |
| Arıza türü, bölge, parça (çoklu), kusur tipi | Var (`PartMultiSelect`) | Var (`PartMultiSelectFilter`) | Eşit |
| Açılış tarihi aralığı + hazır aralıklar (Bugün / Son 7 gün / Bu ay) | Var (`shared/issueDateRange.ts`, A57) | **Yok** | Unutulmuş — A57 yalnız web için yapıldı; sahada "bugün açılanlar" bakışı işe yarar |
| Ana sayfa / analiz kartından gelen hazır filtre | Var (home + analiz) | Var (yalnız home kartları) | Kasıtlı — mobilde analiz sayfası yok |
| Sıralama | Sabit: en yeni üstte | Sabit: en yeni üstte | Eşit (iki tarafta da seçilebilir sıralama yok) |
| Sayfalama | Sayfa sayfa yükleme + toplam sayı | Sonsuz kaydırma | Eşit (platforma göre) |
| 30 sn sessiz yenileme | Var | Var | Eşit |
| Filtrelerin saklanması | URL + sessionStorage | Cihazda saklanan tercih | Eşit (platforma göre) |
| CSV / ZIP dışa aktarma | Var | Yok | Kasıtlı — rapor yönetici işi (PRD §5) |
| Yazdırma | Var (`print/IssuePrint`) | Yok | Kasıtlı — aynı gerekçe |

## 2. Arıza detayı

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Bildirim fotoğraflarını görme | Var (`MediaGallery` ISSUE) | Var | Eşit |
| Sonradan bildirim fotoğrafı ekleme | Var (galeride yükle) | **Yok** | Unutulmuş — sahada ek fotoğraf en çok mobilde gerekir |
| Çözüm fotoğrafı | Var (galeri, her an) | Var (yalnız "Tamamlandı" akışında, kamera/galeri) | Kısmen eşit |
| Çözüm kaydı (açıklama zorunlu, fotoğraf zorunlu) | Var | Var | Eşit |
| Fotoğraf silme | Yok | Yok | Eşit (bilinçli: medya silinmez) |
| Durum: Açık → İşlemde → Tamamlandı | Var | Var | Eşit |
| Onay / şartlı onay + geri alma bildirimi | Var (`ApprovalUndoToast`) | Var | Eşit (yetkiye bağlı) |
| Sınıflandırma düzeltme | Var (`IssueClassificationEditor`) | Var (`DefectClassificationFields`) | Eşit |
| Durum geçmişi | Var (`IssueStatusHistory`) | Var | Eşit |
| Yazdırma | Var (`IssueDetailPrint`) | Yok | Kasıtlı — rapor yönetici işi |

## 3. Arıza bildirme

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Serbest bildirim formu (VIN araması PLANNED dahil, istasyon, tür, önem, sınıflandırma, tek fotoğraf) | Var (`ReportIssuePage`) | Var (`ManualIssueReportScreen`) | Eşit |
| İstasyon adımından (NOT_OK) bildirim | Yok | Var (`IssueReportScreen`) | Kasıtlı — istasyon adımı yalnız mobilde işaretlenir |
| Taslak saklama | Var (sessionStorage) | Çevrimdışı kuyruk | Eşit (platforma göre) |
| Çevrimdışı kuyruk + "Bekleyen bildirimler" | Yok | Var (`lib/issueReportQueue.ts`, `PendingReportsScreen`) | Kasıtlı — saha bağlantısı zayıf (PRD §7: zayıf bağlantıda kademeli çalışma) |
| Kuyrukta sınıflandırma düzeltme | Yok | Var (Karar 21) | Kasıtlı |

## 4. Araç listesi

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Liste | Sunucu sayfalaması, toplam sayı | **İlk 20 araç** — `listVehicles` sayfa vermeden çağrılıyor, sunucu varsayılanı 20, sonraki sayfa yok (`screens/VehiclesScreen.tsx:76`) | **Unutulmuş (hata)** |
| VIN araması | Sunucuda | Yalnız yüklenen 20 aracın içinde (istemci) | **Unutulmuş (hata)** — üstteki "Araç ara" paneli (`VehicleSearchPanel`) sunucuda arar, o çalışır |
| Yaşam döngüsü filtresi | Tek seçim | Çoklu seçim; birden fazla seçilirse sunucuya filtre gitmez | Kısmen |
| PLANNED varsayılan gizli | Var | Var | Eşit (Karar 10) |
| Analizden gelen filtre (sevk edilen vb.) | Var | Yok | Kasıtlı — analiz web'de |
| Yazdırma | Var (`VehicleListPrint`) | Yok | Kasıtlı |

## 5. Araç detayı

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Kimlik, durum, ilerleme % | Var | Var (`ProgressRing`) | Eşit |
| İstasyon adımlarını işaretleme | Yok (salt okunur `StationStepsPanel`) | Var (`VehicleStationScreen`) | Kasıtlı — operatör işi |
| Beklemeye alma / çıkarma | Var | Var | Eşit |
| Aracın arızaları | Var (`VehicleIssuesPanel`) | Var | Eşit |
| Sevk hazırlık uyarısı | Var | Var (`shared/shipmentReadiness`) | Eşit |
| Zaman çizelgesi / denetim kaydı | Var ("Denetim" sekmesi, `VehicleTimeline`) | Var (`VehicleTimelineSection`) | Eşit (`shared/vehicleTimeline.ts`, Karar 24) |
| Araç galerisi (tüm fotoğraflar, yükleme) | Var (`MediaGallery` VEHICLE) | **Yok** | Unutulmuş — yazılı karar yok; öncelik düşük |
| Checklist yazdırma | Var (`print/ChecklistPrint`) | Yok | Kasıtlı |

## 6. EOL kontrol listesi

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Bölüm başlıkları (section_key) | Var | Var | Eşit (Karar 23) |
| Kabul kriteri / kontrol yöntemi kutusu (açık kart) | Var | Var (`shared/checklistCriteria.ts`) | Eşit |
| Kapalı kartta ⓘ ikonu | Var | Var | Eşit |
| Cevaplanan madde rozete daralır | Var | Var | Eşit (A47) |
| Cevaplar: Uygun / Uygun değil / Yeniden işlem / Şartlı uygun; zorunlu açıklama | Var | Var | Eşit |
| Tek not alanı | Var | Var | Eşit (Karar 26) |
| Madde fotoğrafı yükleme + gösterim | Var | Var (yalnız çevrimiçi, A43) | Eşit |
| Kim / ne zaman damgası | Var | Var | Eşit |
| Aşama görünümü | Fabrika ve depo listesi alt alta; depo, fabrika bitene kadar kilitli | Yalnız aracın o anki aşaması | Kasıtlı — operatör yalnız kendi aşamasını görür |
| **Donma kuralı** (sevk/çıkış sonrası kart kilitli, sebep yazılı) | Var (Karar 29) | **Yok** — `ChecklistItem` tipinde `FrozenReason` yok; kaydedince 409 | **Unutulmuş** — docs/16 A55 "ayrı iş, henüz yapılmadı" |
| Fabrikadan sevk / depodan çıkış / teslim + kapı sebepleri | Var | Var (`shared/eolGates.ts`) | Eşit |
| EOL sıfırlama | Var | Yok | Kasıtlı — geri alma yönetici işi |
| Yazdırma | Var | Yok | Kasıtlı |

## 7. Test ve Sevkiyat kontrol listeleri

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Bölüm başlıkları | Var | Var | Eşit |
| İşaretleme | Evet ↔ Hayır (OK / NOT_OK) değiştirilebilir | **Yalnız işaretleme**; işaretli madde geri alınamaz (`TestChecklistScreen.tsx:85`) | Unutulmuş — yanlış tik mobilde düzeltilemiyor (PRD §9: yanlış tik riski, geri alma önlemi) |
| Kim / ne zaman damgası | Var | Var | Eşit |
| Aşaması kapanan / pasif maddeler ayrı kapalı bölümde | Var | Var | Eşit |
| Donma kilidi | Var | **Yok** (409 hata metni gösterilir) | Unutulmuş — A55 ile aynı iş |
| Not / fotoğraf | Yok | Yok | Eşit |
| Kabul kriteri | Yok (form alanı yalnız EOL'de) | Yok | Eşit |
| Yazdırma | Var | Yok | Kasıtlı |

## 8. Ana sayfa

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| İçerik | KPI kartları + grafikler (`HomePage.tsx`) | Arıza Bildir, araç arama, günlük arıza sayaçları | Kasıtlı — farklı kullanıcı |
| "Bugün" sınırı | Cihaz yerel günü (`web/src/lib/homeDashboard.ts`) | Cihaz yerel günü (`shared/homeIssueStats.ts`) | Eşit, ama ikisi de Karar 31'deki fabrika gününü kullanmıyor (cihaz Türkiye saatindeyse sonuç aynı) |

## 9. Analiz ve hareketler

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Analiz sayfası (KPI, karşılaştırma, grafikler, CSV, yazdırma, drill-down) | Var | Yok | Kasıtlı — yönetici işi (PRD §5) |
| Hareketler (etkinlik akışı) | Var | Yok | Kasıtlı (A41: "Mobilde Hareketler ekranı yok") |

## 10. Yönetim ekranları

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Şablonlar (madde ekle/düzenle/sırala, etki önizleme, araçlara yayma) | Var | Yok | Kasıtlı |
| Hata kataloğu | Var | Yok (yalnız okunur önbellek) | Kasıtlı |
| Kullanıcılar, roller / yetki matrisi | Var | Yok | Kasıtlı |

## 11. Hesap ve oturum

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Giriş, çıkış | Var | Var | Eşit |
| Zorunlu şifre değiştirme (ilk giriş) | Var | Var | Eşit |
| Profilden şifre değiştirme | Var (Ayarlar) | Var (Profil) | Eşit |
| Tema (açık/koyu) | Var | Var | Eşit |
| Mobil erişim yetkisi yoksa engel ekranı | — | Var (`Perm.MobileAccess`) | Kasıtlı |

## 12. Çevrimdışı davranış

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| Çevrimdışı bayrağı / şerit | Yok | Var, yalnız bilgi verir (Karar 27) | Kasıtlı |
| Referans önbelleği (araçlar, istasyonlar, katalog) | Yok | Var, 15 dk tazeleme (Karar 21) | Kasıtlı |
| Arıza bildirimi çevrimdışı | Yok | Kuyruğa girer, fotoğrafla birlikte sonra gönderilir | Kasıtlı |
| Checklist cevabı / istasyon adımı / EOL fotoğrafı çevrimdışı | Yok | **Yok** — çevrimiçi şart | Kasıtlı (MoSCoW #30: Faz 1'de çevrimdışı senkronizasyon yok) |
| Listeler çevrimdışı | Yok | Önbellekten okunur (araçlar, katalog) | Kasıtlı |

## 13. Dil desteği

| Özellik | Web | Mobil | Fark |
|---|---|---|---|
| TR / EN | Var (Ayarlar) | Var (Profil) | Eşit — ikisi de `shared/i18n/messages.ts` |
| Sunucu hata metinlerinin çevirisi | Var (`shared/i18n/errors.ts`) | Var | Eşit (Karar 14) |
| Kodda sabit metin | Yok (tarama: yalnız "HEIC" dosya türü etiketi) | Yok | Eşit |
| Yeni bölüm anahtarı | Web ile birlikte yayınlanır | Uygulama güncellenene kadar ham anahtar görünebilir | Kasıtlı (Karar 23, derlenmiş uygulama) |

---

## 14. Önceliklendirme

**Sahada operatörü gerçekten engelleyenler:**
1. **Mobil araç listesi ilk 20 araçla sınırlı** (§4). 500 araçlık planda
   operatör listeden aracını bulamaz; listedeki VIN araması da yalnız o 20
   araçta arar. Geçici yol: ana sayfadaki araç araması sunucuda arar.
2. **Mobilde donma kilidi yok** (§6, §7; A55). Sevk edilmiş araçta operatör
   cevap verip Kaydet'e basınca 409 alır. Veri korunuyor, ama emek boşa
   gidiyor ve ne olduğu anlaşılmıyor.
3. **Mobil Test / Sevkiyat'ta yanlış tik geri alınamıyor** (§7). Yanlış
   işaretlenen madde ancak web'den düzeltilebilir.

**Orta (işi yavaşlatır, engellemez):**
4. Mevcut arızaya sonradan bildirim fotoğrafı eklenemiyor (§2).
5. Arıza listesinde tarih aralığı filtresi yok (§1).

**Önemsiz / bilinçli:**
6. Araç galerisi mobilde yok (§5); fotoğraflar arıza ve madde içinde
   görünüyor.
7. Ana sayfa "bugün" sınırının cihaz saatine bağlı olması (§8); fabrika ve
   cihazlar Türkiye saatinde olduğu sürece fark yok.
8. Yazdırma, dışa aktarma, analiz, hareketler, yönetim ekranları, EOL
   sıfırlama: kasıtlı olarak yalnız web'de.
