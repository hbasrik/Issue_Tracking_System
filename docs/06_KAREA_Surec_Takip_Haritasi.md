
# KAREA — Süreç Takip Haritası (Agile/SDLC Roadmap Checklist)

Bu doküman, ADIM 1'den itibaren tüm süreci işaretleyerek takip edebileceğiniz üst seviye yol haritasıdır. Her ADIM'ın sonunda sizden onay alınacak, onay olmadan bir sonraki ADIM'a geçilmeyecektir.

---

## ADIM 1 — Ürün Yönetimi Dokümantasyonu

- [x] PRD (Product Requirements Document) taslağı (`01_KAREA_PRD.md`)
- [x] KPI ve Veri Metrik Tanımlama Kataloğu (`02_KAREA_KPI_Katalogu.md`)
- [x] MoSCoW Önceliklendirme Matrisi (`03_KAREA_MoSCoW_Matrisi.md`)
- [x] User Stories & Acceptance Criteria — GWT formatı (`04_KAREA_User_Stories.md`)
- [x] QA Manuel/Otomasyon Test Case Seti (`05_KAREA_Test_Cases.md`)
- [x] **Sizin onayınız** → 5 açık soru karara bağlandı (bkz. `01_KAREA_PRD.md` Bölüm 10 — Karar Günlüğü, 2026-07-13)
- [x] Kararların tüm ADIM 1 dokümanlarına işlenmesi (soft-warning, multi-template, 2 rol, Analysis sekmesi)
- [ ] Onay sonrası ADIM 2'ye geçiş

## ADIM 2 — UI/UX Wireframe & Komponent Tasarım Rehberi

- [x] Web Dashboard sayfa hiyerarşisi ve bileşen yerleşimi (`07_KAREA_UIUX_Tasarim_Rehberi.md`)
- [x] Mobil saha uygulaması sekme/ekran hiyerarşisi
- [x] 8 Faz ekranı komponent tasarımı (checkpoint kartları, ilerleme göstergesi) + görsel mockup
- [x] 13 maddelik EoL giriş ekranı (statü seçici + açıklama alanı) + görsel mockup
- [x] 43 maddelik sevk onay ekranı (checklist + kalan madde sayacı) + görsel mockup
- [x] VIN arama/autocomplete komponenti
- [x] KPI Dashboard sayfa düzeni (kartlar, grafikler, tablo)
- [x] **Analysis sekmesi tasarımı:** filtre paneli, Pie/Bar Chart, Export/Print + görsel mockup
- [x] Dark/Light mod renk paleti ve tipografi rehberi
- [x] Micro-interaction / geçiş animasyonu spesifikasyonları
- [ ] **Sizin onayınız**

## ADIM 3 — Veritabanı Şeması ve Kurulum To-Do'su

- [x] PostgreSQL tam DDL şeması (`08_KAREA_database_schema.sql`) — vehicles, production_phase_progress, eol_and_shipment_checklist_progress, issue_list, audit_logs + referans tabloları
- [x] Trigram (pg_trgm) index mimarisi VIN alanı için
- [x] Otomatik statü geçiş trigger'ları (Hatta→Depoda, Depoda→Müşteride) + defense-in-depth kuralları
- [x] Analysis sekmesi için performans view'ları ve indeksleme stratejisi
- [x] DDL doğrulaması: gerçek PostgreSQL parser'ı (`pglast`) ile sözdizimi + FK sıralama kontrolü geçti
- [x] Migration/seed veri stratejisi ve kurulum to-do'su (`09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md`)
- [ ] **Sizin onayınız** → özellikle Bölüm 2.1'deki "EoL kapısı + Faz 8" birleşik otomatik geçiş kararı için onayınız gerekiyor

## ADIM 4 — Cursor Master Kodlama Promptları (`10_KAREA_Cursor_Master_Promptlar.md`)

- [x] Prompt 1 — Repository Bootstrap & Tooling
- [x] Prompt 2 — Database Migration & Seed Data (08'deki DDL'i migration'a taşır)
- [x] Prompt 3 — Go backend Clean Architecture (domain/usecase/repository) + soft-warning/hard-block iş kuralları
- [x] Prompt 4 — Go backend HTTP API + RBAC middleware + VIN arama
- [x] Prompt 5 — React web dashboard (07'deki sayfa hiyerarşisi ve tasarım sistemine birebir bağlı)
- [x] Prompt 6 — React Native mobil uygulama (8 Faz / EoL / Sevk ekranları)
- [ ] (Opsiyonel, talep halinde) Prompt 7 — Test & CI otomasyonu (05'teki TC-ID'lere bağlı)
- [ ] **Cursor'da ilerleme başladıktan sonra takip ve gerektiğinde ek prompt/revizyon**

## ADIM 5+ — Geliştirme Sonrası (Gelecek Fazlar, Referans Amaçlı)

- [ ] Sprint planlama ve backlog oluşturma (User Stories'den)
- [ ] MVP geliştirme (Must-Have kapsamı)
- [ ] QA test case'lerinin otomasyona bağlanması (CI/CD)
- [ ] UAT (User Acceptance Testing) ile saha pilotu
- [ ] Power BI entegrasyonu değerlendirmesi (Faz 2)
- [ ] Offline-first mobil senkronizasyon değerlendirmesi (Faz 2)

---

**Şu an durumu:** ADIM 1 tamamen kapandı (6/6 karar netleşti — 5 ana karar + EoL Çıkış Kapısı hard-block kararı, bkz. PRD Bölüm 10 Karar Günlüğü). ADIM 2'ye (UI/UX Wireframe) geçiş için son onayınız bekleniyor.
