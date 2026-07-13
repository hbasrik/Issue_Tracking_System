
# KAREA — QA Test Case Seti (Manuel / Otomasyon) v1.0

**Format:** TC-ID | Başlık | Ön Koşul | Adımlar | Beklenen Sonuç | Tip (Manuel/Otomasyon) | Öncelik

---

## Modül: 8 Fazlı Üretim Takibi

### TC-001 — Checkpoint Tamamlama ile Yüzde Artışı
- **Ön Koşul:** Yeni oluşturulmuş, 8 faz x 8 checkpoint = 64 checkpoint'e sahip bir araç, completion %0.
- **Adımlar:**
  1. Faz 1'in ilk checkpoint'ini "Tamamlandı" işaretle.
  2. Araç detay sayfasında completion yüzdesini kontrol et.
- **Beklenen Sonuç:** Yüzde `1/64 ≈ %1.56` olarak güncellenir.
- **Tip:** Otomasyon (API seviyesi) | **Öncelik:** Yüksek

### TC-002 — Faz Tamamlanınca %50 Kilometre Taşı
- **Ön Koşul:** 8 eşit fazlı, toplam 64 checkpoint'li araç.
- **Adımlar:**
  1. Faz 1, 2, 3 ve 4'teki tüm checkpoint'leri (32 adet) tamamla.
  2. Completion yüzdesini kontrol et.
- **Beklenen Sonuç:** Yüzde %50 olarak gösterilir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-003 — Başarısız Checkpoint → Otomatik Issue Oluşturma
- **Ön Koşul:** Araç Faz 2'de, ilgili checkpoint henüz değerlendirilmemiş.
- **Adımlar:**
  1. Checkpoint'i "Başarısız" olarak işaretle.
  2. "Hata Bildir" butonuna bas.
  3. Açılan formu incele.
- **Beklenen Sonuç:** Form; vehicle_id, checkpoint_id, station_id, timestamp alanları önceden dolu şekilde açılır; kayıt sonrası yeni `Issue` (status=OPEN) oluşur ve checkpoint completion'a dahil edilmez.
- **Tip:** Manuel + Otomasyon (E2E) | **Öncelik:** Kritik

### TC-004 — Açık Issue Varken Yüzdenin Sabit Kalması
- **Ön Koşul:** TC-003 sonrası, issue hâlâ OPEN.
- **Adımlar:**
  1. Aracın completion yüzdesini tekrar sorgula.
- **Beklenen Sonuç:** İlgili checkpoint sayılmaz, yüzde önceki değerde sabit kalır.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-004b — Soft-Warning: Açık Issue ile Sonraki Faza Geçiş Serbestliği
- **Ön Koşul:** Araç Faz 2'de, bir checkpoint'e bağlı issue hâlâ OPEN (TC-003 senaryosu).
- **Adımlar:**
  1. Operatör Faz 2'deki diğer checkpoint'leri tamamlar.
  2. Faz 3'e geçip oradaki checkpoint'leri işaretlemeye çalışır.
- **Beklenen Sonuç:** Sistem geçişi **engellemez**; Faz 3 checkpoint'leri normal şekilde tamamlanabilir. Açık issue yalnızca UI'da uyarı rozeti olarak görünür, hat/akış bloklanmaz.
- **Tip:** Otomasyon (E2E) | **Öncelik:** Kritik

---

## Modül: Multi-Template Checklist Ataması

### TC-000a — Model Bazlı Şablon Otomatik Atanması
- **Ön Koşul:** "Model X" için özel bir EoL şablonu (10 madde) ve "Model Y" için varsayılan şablon (13 madde) tanımlı.
- **Adımlar:**
  1. "Model X" tipinde yeni bir araç oluştur.
  2. "Model Y" tipinde yeni bir araç oluştur.
  3. Her iki aracın EoL checklist madde sayısını kontrol et.
- **Beklenen Sonuç:** Model X aracı 10 maddelik özel şablonla, Model Y aracı 13 maddelik varsayılan şablonla başlar.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-000b — Şablonsuz Modelde Varsayılana Düşme (Fallback)
- **Ön Koşul:** "Model Z" için özel şablon tanımlı değil.
- **Adımlar:**
  1. "Model Z" tipinde yeni bir araç oluştur.
- **Beklenen Sonuç:** Sistem varsayılan (default) şablonu (13 EoL / 43 Sevk madde) atar, hata vermez.
- **Tip:** Otomasyon | **Öncelik:** Orta

---

## Modül: EoL Checklist (Model Bazlı Şablon)

### TC-005 — NOT OK Statüsünde Zorunlu Açıklama Validasyonu
- **Ön Koşul:** Araç EoL aşamasında, 13 madde de boş.
- **Adımlar:**
  1. 1. maddeye `NOT_OK` seç.
  2. Açıklama alanını boş bırakıp kaydet.
- **Beklenen Sonuç:** Sistem kaydı reddeder, "Açıklama zorunludur" hatası gösterir.
- **Tip:** Manuel + Otomasyon | **Öncelik:** Kritik

### TC-006 — OK Statüsünde Opsiyonel Açıklama
- **Adımlar:**
  1. 2. maddeye `OK` seç, açıklamayı boş bırak, kaydet.
- **Beklenen Sonuç:** Kayıt başarıyla tamamlanır.
- **Tip:** Otomasyon | **Öncelik:** Orta

### TC-007 — EoL Çıkış Kapısı: Eksik/Hatalı Madde ile Çıkışın Hard-Block Edilmesi
- **Ön Koşul:** Araçta 13 EoL maddesinden 12'si `OK`, 1'i `NOT_OK` (açıklamalı).
- **Adımlar:**
  1. Aracı EoL istasyonundan çıkarmaya (statü/lokasyon değişikliği) çalış — hem UI hem doğrudan API çağrısıyla.
- **Beklenen Sonuç:** İşlem **her iki yolla da reddedilir** (backend seviyesinde enforce edilir); UI'da "Madde 4: NOT_OK — Boya çizik" şeklinde engelleyen madde(ler) listelenir.
- **Tip:** Otomasyon (API bypass senaryosu dahil) | **Öncelik:** Kritik

### TC-007b — EoL Çıkış Kapısı: Tüm Maddeler OK/CONDITIONAL OK ile Çıkış İzni
- **Ön Koşul:** Araçta 13 maddeden 10'u `OK`, 3'ü `CONDITIONAL_OK` (tamamı açıklamalı).
- **Adımlar:**
  1. Aracı EoL istasyonundan çıkarmayı dene.
- **Beklenen Sonuç:** İşlem başarıyla gerçekleşir (NOT_OK/REWORK yok, tüm maddeler kabul edilebilir statüde).
- **Tip:** Otomasyon | **Öncelik:** Kritik

### TC-007c — Değerlendirilmemiş (Boş) Maddenin Çıkışı Engellemesi
- **Ön Koşul:** Araçta 13 maddeden 12'si dolu, 1'i hiç değerlendirilmemiş (boş statü).
- **Adımlar:**
  1. Aracı EoL istasyonundan çıkarmayı dene.
- **Beklenen Sonuç:** İşlem reddedilir; boş madde "Değerlendirilmedi" olarak engel listesinde gösterilir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

---

## Modül: Müşteri Sevk Öncesi Checklist (43 Madde)

### TC-008 — 39/43 Madde ile Sevk Engelleme
- **Ön Koşul:** Araç, 43 maddeden 39'u Checked.
- **Adımlar:**
  1. Aracın statüsünü `SHIPPED` yapmaya çalış (hem UI hem doğrudan API çağrısıyla).
- **Beklenen Sonuç:** Hem UI hem API isteği reddedilir; hata mesajında eksik madde sayısı belirtilir. **Backend validasyonu UI'yı bypass eden doğrudan API isteğinde de devrededir.**
- **Tip:** Otomasyon (özellikle API bypass senaryosu kritik) | **Öncelik:** Kritik

### TC-009 — 43/43 Madde ile Sevk İzni
- **Ön Koşul:** Araç, 43 maddenin tamamı Checked.
- **Adımlar:**
  1. Statüyü `SHIPPED` yap.
- **Beklenen Sonuç:** İşlem başarılı, statü geçmişine kaydedilir, zaman damgası eklenir.
- **Tip:** Otomasyon | **Öncelik:** Kritik

### TC-010 — Kalan Madde Sayacının Doğruluğu
- **Adımlar:**
  1. 15 maddeyi Checked yap.
  2. UI'da "kalan madde" göstergesini kontrol et.
- **Beklenen Sonuç:** "28/43 kaldı" (veya "15/43 tamamlandı") doğru gösterilir.
- **Tip:** Manuel | **Öncelik:** Düşük

---

## Modül: VIN Arama

### TC-011 — Son 5 Hane ile Tekil Eşleşme
- **Ön Koşul:** Sistemde VIN'i "...XJ00057" olan tek bir araç var.
- **Adımlar:**
  1. Arama kutusuna "00057" yaz.
- **Beklenen Sonuç:** İlgili araç sonuç listesinde tek eşleşme olarak, 100ms altında döner.
- **Tip:** Otomasyon (performans testi dahil) | **Öncelik:** Yüksek

### TC-012 — Çoklu Eşleşme Senaryosu
- **Ön Koşul:** Sistemde son 5 hanesi "00057" olan 2 farklı VIN var (test verisiyle simüle edilir).
- **Adımlar:**
  1. Arama kutusuna "00057" yaz.
- **Beklenen Sonuç:** İki araç da listelenir, kullanıcı seçim yapana kadar işlem ilerlemez.
- **Tip:** Manuel | **Öncelik:** Orta

### TC-013 — Büyük Veri Setinde Performans (Load Test)
- **Ön Koşul:** 1M+ satırlık test veri seti, `pg_trgm` GIN index kurulu.
- **Adımlar:**
  1. Rastgele 100 farklı 5-haneli sorgu çalıştır, yanıt sürelerini ölç.
- **Beklenen Sonuç:** P95 yanıt süresi < 100ms.
- **Tip:** Otomasyon (performans/load test - k6 veya benzeri) | **Öncelik:** Yüksek

---

## Modül: KPI Dashboard

### TC-014 — Daily Pending Issues Doğruluğu
- **Ön Koşul:** Sistemde 12 OPEN, 5 RESOLVED (bugün), 3 IN_PROGRESS issue.
- **Adımlar:**
  1. Dashboard'ı aç, "Daily Pending Issues" kartını oku.
- **Beklenen Sonuç:** Değer 15 (OPEN + IN_PROGRESS) olarak gösterilir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-015 — Defect Rate per Station Hesaplama Doğruluğu
- **Ön Koşul:** İstasyon 3'ten 50 araç geçmiş, 5 issue kaydı bu istasyona ait.
- **Adımlar:**
  1. Dashboard'da İstasyon 3 defect rate değerini oku.
- **Beklenen Sonuç:** %10 gösterilir (5/50).
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-016 — MTTR Hesaplama Doğruluğu
- **Ön Koşul:** 3 issue: çözülme süreleri 2s, 4s, 6s (saat).
- **Adımlar:**
  1. MTTR KPI değerini kontrol et.
- **Beklenen Sonuç:** Ortalama 4 saat olarak gösterilir.
- **Tip:** Otomasyon | **Öncelik:** Orta

---

## Modül: Rol Bazlı Erişim (RBAC — 2 Rol)

### TC-017 — Operatörün Sevk/Issue-Kapatma Yetkisi Olmaması
- **Ön Koşul:** "Operator" rolündeki kullanıcı ile giriş yapılmış, araç sevke hazır (43/43 checked).
- **Adımlar:**
  1. Operator statüyü `SHIPPED` yapmaya çalışır (API doğrudan çağrısıyla).
  2. Operator açık bir issue'yu kapatmaya çalışır.
- **Beklenen Sonuç:** Her iki işlemde de 403 Forbidden / yetki hatası döner; yalnızca `Manager/Admin` bu işlemleri yapabilir.
- **Tip:** Otomasyon (güvenlik testi) | **Öncelik:** Kritik

### TC-017b — Operatörün Web Dashboard'a Erişememesi
- **Ön Koşul:** "Operator" rolündeki kullanıcı ile giriş yapılmış.
- **Adımlar:**
  1. Operator, web dashboard login/route'una erişmeyi dener.
- **Beklenen Sonuç:** Erişim reddedilir (401/403); Operator yalnızca mobil API/uygulamaya erişebilir.
- **Tip:** Otomasyon (güvenlik testi) | **Öncelik:** Kritik

### TC-018 — Audit Log Doğrulama
- **Adımlar:**
  1. Herhangi bir statü değişikliği yap.
  2. Audit log tablosunu sorgula.
- **Beklenen Sonuç:** Kayıt; user_id, timestamp, old_value, new_value alanlarını içerir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

---

## Modül: Yerleşik "Analysis" Sekmesi

### TC-019 — Çoklu Filtre Kombinasyonu (Tarih + Faz + Statü + Hata Türü)
- **Ön Koşul:** Sistemde farklı tarih, faz, statü ve hata türlerine sahip test verisi mevcut.
- **Adımlar:**
  1. Analysis sekmesinde tarih aralığı = "son 7 gün", faz = "Faz 3", hata türü = "Elektrik" filtrelerini uygula.
- **Beklenen Sonuç:** Grafik ve tablolar yalnızca bu 3 kritere birden uyan (AND) kayıtları gösterir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-020 — Pie/Bar Chart Veri Doğruluğu
- **Ön Koşul:** Filtre uygulanmış, bilinen bir veri seti (örn. 10 tamamlanmış, 5 devam eden iş).
- **Adımlar:**
  1. Pie Chart'taki "tamamlanan/devam eden" oranını kontrol et.
- **Beklenen Sonuç:** Grafik 10/5 oranını (yaklaşık %67/%33) doğru yansıtır.
- **Tip:** Otomasyon | **Öncelik:** Orta

### TC-021 — PDF Export'un Ekrandaki Filtrelerle Birebir Uyumu
- **Ön Koşul:** Manager/Admin, belirli filtreler uygulamış (örn. son 30 gün, İstasyon 3).
- **Adımlar:**
  1. "Export/Print" butonuna bas.
  2. İndirilen PDF'i aç.
- **Beklenen Sonuç:** PDF, ekrandaki filtre özetini (uygulanan filtreler listesi), aynı grafikleri ve araç bazlı hata dağılımı tablosunu A4 print-ready düzende içerir; içerik ekranla birebir tutarlıdır.
- **Tip:** Manuel + Otomasyon (görsel regresyon) | **Öncelik:** Yüksek

### TC-021b — VIN Bazlı Filtre ile Araç Hata Dağılımı Doğruluğu
- **Ön Koşul:** VIN'i "...00057" olan araçta 8 açık issue: 3 CRITICAL, 2 MEDIUM, 3 LOW.
- **Adımlar:**
  1. Analysis sekmesinde VIN filtresine "00057" yaz, uygula.
  2. Araç bazlı hata dağılımı tablosunu/grafiğini oku.
- **Beklenen Sonuç:** "VIN ...00057 — 8 açık hata: 3 Kritik, 2 Orta, 3 Düşük" doğru şekilde gösterilir; toplam = kırılımların toplamına eşittir.
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-021c — VIN Filtresi Boşken Tüm Araçların Listelenmesi
- **Adımlar:**
  1. VIN filtresini boş bırak, diğer filtreleri (örn. son 30 gün) uygula.
- **Beklenen Sonuç:** Kapsam dahilindeki tüm araçlar için hata dağılımı tablosu listelenir, en çok açık hataya sahip araç varsayılan olarak en üstte sıralanır.
- **Tip:** Otomasyon | **Öncelik:** Orta

### TC-021d — Issue Severity Alanının Zorunluluğu
- **Adımlar:**
  1. Operatör Hata Girme formunda önem derecesi (severity) seçmeden kaydetmeyi dener.
- **Beklenen Sonuç:** Sistem kaydı reddeder; önem derecesi seçimi zorunludur (FR-2.6).
- **Tip:** Otomasyon | **Öncelik:** Yüksek

### TC-022 — PDF Export Performansı
- **Adımlar:**
  1. Büyük bir veri seti (örn. 90 günlük, tüm istasyonlar) için filtre uygula ve Export'a bas.
  2. Süreyi ölç.
- **Beklenen Sonuç:** PDF üretimi ≤10 saniye içinde tamamlanır.
- **Tip:** Otomasyon (performans testi) | **Öncelik:** Orta

### TC-023 — Operatörün Analysis Sekmesine Erişememesi
- **Ön Koşul:** "Operator" rolüyle giriş.
- **Adımlar:**
  1. Analysis sekmesine erişmeyi dene (zaten web dashboard'a erişimi yok — bkz. TC-017b).
- **Beklenen Sonuç:** Erişim reddedilir; Analysis yalnızca Manager/Admin'e açıktır.
- **Tip:** Otomasyon | **Öncelik:** Orta

---

**Not:** Tüm açık sorular (TC-007 dahil) PRD Bölüm 10 Karar Günlüğü ile kapatılmıştır. ADIM 1 dokümantasyonu artık nihai (finalized) kabul edilmektedir.
