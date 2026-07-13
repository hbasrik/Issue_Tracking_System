
# KAREA — Veritabanı Mimari Notları & Kurulum To-Do'su v1.0

**Referans:** `08_KAREA_database_schema.sql` (doğrulandı: gerçek PostgreSQL parser'ı — `pglast` — ile sözdizimi kontrolü ve FK sıralama kontrolü geçti, 70 DDL ifadesi).

---

## 1. Tablo Grupları ve İlişki Özeti

### Çekirdek 5 Grup (sizin talebiniz)
| Tablo | Amaç | Bağlı Olduğu Ana Tablolar |
|---|---|---|
| `vehicles` | Master araç kimliği ve anlık vaziyet | `vehicle_models`, `checklist_templates` (x2) |
| `production_phase_progress` | 8 faz × 7-8 checkpoint ilerleme + operatör takibi | `vehicles`, `phases`, `checkpoints`, `users`, `issue_list` |
| `eol_and_shipment_checklist_progress` | 13 (EoL) + 43 (Sevk) madde ilerlemesi, şablon tabanlı | `vehicles`, `checklist_template_items`, `users`, `issue_list` |
| `issue_list` | Hata/tamir yaşam döngüsü | `vehicles`, `checkpoints`, `checklist_template_items`, `stations`, `issue_types`, `users` |
| `audit_logs` | Statü/zaman geçmişi — Analysis sekmesinin veri kaynağı | `vehicles`, `phases`, `stations`, `users` |

### Destekleyici Referans Tabloları (şişme yaratmadan ölçeklenmeyi sağlar)
- `vehicle_models`, `phases`, `stations`, `checkpoints`, `issue_types` — sabit/yavaş değişen katalog verileri.
- `checklist_templates` + `checklist_template_items` — multi-template mimarisi (ADIM 1 Karar #3); EoL/Sevk maddeleri kod içine gömülü değil, veri olarak tutulur.
- `users` — Operator/Manager-Admin (ADIM 1 Karar #4).

**Neden bu ayrım?** Talep ettiğiniz 5 tablo tek başına yeterli olsaydı, checkpoint/checklist madde tanımları (metin, sıra no) her araçta tekrar tekrar saklanır ve hem depolama şişer hem de "madde metnini güncelle" gibi bir işlem milyonlarca satırı UPDATE etmek zorunda kalırdı. Bunun yerine madde **tanımları** (`checkpoints`, `checklist_template_items`) bir kez tutulur; her aracın **ilerlemesi** (`production_phase_progress`, `eol_and_shipment_checklist_progress`) bu tanımlara FK ile bağlanır. Bu, sizin "liste şişmesini engellemek için şablon tabanlı çalışacaktır" notunuzla birebir örtüşüyor ve aynı prensibi checkpoint'lere de uyguluyor.

---

## 2. Otomatik Statü Geçişi — Nasıl Çalışıyor

### 2.1 `IN_PRODUCTION` → `IN_WAREHOUSE` (Hatta → Depoda)
Talebiniz: *"8. faz biter bitmez otomatik 'Depoda' olur."*

Uyguladığım kural bunun **bir adım daha sıkısı**: 8. faz tamamlanması **VE** EoL çıkış kapısının (13 maddenin tamamının OK/CONDITIONAL OK olması — ADIM 1 Karar #6, FR-3.5) geçilmiş olması birlikte sağlanınca otomatik geçiş tetiklenir (`fn_recalculate_vehicle_progress` + `fn_recheck_eol_gate_on_item_update` fonksiyonları, ikisi de tetiklenme anına göre kontrolü yapar — hangisi son gerçekleşirse geçişi o tetikler).

> **Açık Karar Noktası (onayınızı bekliyor):** Siz "8. faz biter bitmez" dediniz, ben buna EoL kapısını da ekledim çünkü aksi halde EoL'de NOT_OK/REWORK maddesi olan bir araç yine de "Depoda" görünebilirdi — bu, ADIM 1'de onayladığınız EoL hard-block kararıyla çelişir. Eğer EoL'nin bu geçişte rol almamasını, yalnızca 8. fazın yeterli olmasını isterseniz `fn_recalculate_vehicle_progress` içindeki EoL kontrolünü kaldırmam yeterli — tek satırlık bir değişiklik.

### 2.2 `IN_WAREHOUSE` → `WITH_CUSTOMER` (Depoda → Müşteride)
Talebiniz: *"43 maddelik sevk checklist'i bitince otomatik 'Müşteride' olur."*

Birebir uygulandı: `fn_check_shipment_completion` fonksiyonu, sevk checklist'inin **tüm** maddeleri `OK` veya `CONDITIONAL_OK` olduğunda tetiklenir (`NOT_OK`/`REWORK`/boş varsa geçiş olmaz).

### 2.3 Savunma Katmanı (Defense-in-Depth)
`fn_enforce_manual_status_change` trigger'ı, bir yönetici web'den manuel olarak (veya biri doğrudan API/DB'ye yazarak) checklist tamamlanmadan `WITH_CUSTOMER`/`SHIPPED` statüsüne geçmeye çalışırsa işlemi **veritabanı seviyesinde** reddeder (`RAISE EXCEPTION`). Bu, PRD FR-4.3'teki "UI bypass edilse dahi geçerli" gereksinimini garanti eder.

### 2.4 Operatör Takibi Görünürlüğü
`production_phase_progress.checked_by` ve `eol_and_shipment_checklist_progress.checker_id`, tam olarak istediğiniz "X Operatörü tarafından onaylandı" arayüz metnini besler — uygulama katmanı bu kolonu `users.full_name` ile JOIN edip madde altında gösterir.

---

## 3. İndeksleme Stratejisi ve Gerekçesi

| İndeks | Tip | Amaç |
|---|---|---|
| `idx_vehicles_vin_trgm` | GIN + `pg_trgm` | Son 5 hane ile `LIKE '%00057%'` aramasını milisaniyeler içinde tutar (VIN zaten PK/btree ile tam eşleşmede hızlı; trigram kısmi eşleşme içindir) |
| `idx_issue_list_open_by_vin` | Partial btree (`WHERE status IN ('OPEN','IN_PROGRESS')`) | Araç bazlı severity dağılımı (VIN ...00057 örneği) ve Daily Pending Issues sorgularını dar ve hızlı tutar |
| `idx_issue_list_issue_date_day` | Expression (immutable UTC gün) | Günlük gruplama grafiklerinin (Pie/Bar) her sorguda tüm tabloyu taramasını engeller |
| `idx_audit_logs_event_at_brin` | BRIN | `audit_logs` doğası gereği zaman sıralı ve sürekli büyüyen (append-only) bir tablo; BRIN, btree'ye göre çok daha küçük ve bakımı ucuz, büyük ölçekte MTTR/Elapsed Time sorguları için idealdir |
| `idx_eol_ship_status` | Composite (`vin, checklist_type, check_status`) | Hard-block kapı kontrolünün ("tüm maddeler OK mi?") her checklist güncellemesinde hızlı çalışmasını sağlar |

### Ölçeklenme Notu (milyonlarca satır sonrası)
`audit_logs` ve `issue_list` en hızlı büyüyecek tablolardır. Bu şema **Faz 1** için yeterlidir; veri hacmi arttıkça (örn. 50M+ satır) şu iki adım önerilir — **şimdi uygulanmadı, ileride değerlendirilecek**:
1. `audit_logs` tablosunu `event_at` üzerinden aylık **range partition**'lara bölmek (`pg_partman` uzantısı ile otomatikleştirilebilir).
2. Eski (örn. 12 ay+) `audit_logs` verisini soğuk depolamaya (S3/Parquet) arşivlemek, Analysis sekmesinin sadece son N ayı sorgulamasını sağlamak.

---

## 4. Migration & Seed Veri Stratejisi

- **Migration aracı önerisi:** `golang-migrate` veya `atlas` (Go backend ile doğal uyum). Her değişiklik `NNNN_description.up.sql` / `.down.sql` çifti olarak versiyonlanır.
- **İlk migration:** `08_KAREA_database_schema.sql` bu deponun `0001_init.up.sql` dosyası olacaktır.
- **Seed veri sırası:** `phases` (1-8) → `stations` → `checkpoints` (her faz için 7-8 madde) → `vehicle_models` → `checklist_templates` + `checklist_template_items` (13 EoL + 43 Sevk maddesi, varsayılan şablon) → `users` (ilk Manager/Admin hesabı).
- **Test verisi:** VIN üretimi için gerçekçi 17 haneli sahte VIN'ler + `pgbench`/`k6` ile 1M+ satırlık `issue_list`/`audit_logs` yük testi (TC-013'teki P95 < 100ms hedefini doğrulamak için).

---

## 5. Kurulum To-Do Checklist

- [ ] PostgreSQL 15+ instance kurulumu (yerel/staging)
- [ ] `pg_trgm` ve `uuid-ossp` uzantılarının aktif edildiğinin doğrulanması
- [ ] `0001_init.up.sql` (bu şema) migration olarak çalıştırılması
- [ ] Referans veri seed'lerinin yüklenmesi (phases, stations, checkpoints, checklist_templates/items, vehicle_models)
- [ ] İlk Manager/Admin kullanıcısının oluşturulması
- [ ] Trigger davranışlarının entegrasyon testleri: TC-002 (faz→%50), TC-007/007b/007c (EoL hard-block), TC-008/009 (sevk hard-block), TC-013 (VIN arama performansı)
- [ ] `EXPLAIN ANALYZE` ile kritik sorguların (VIN arama, Daily Pending Issues, VIN×Severity) index kullandığının doğrulanması
- [ ] Staging ortamında 1M+ satırlık yük testi ile P95 < 100ms hedefinin doğrulanması

---

*Bu şema onaylandıktan sonra ADIM 4'e (Cursor Master Kodlama Promptu) geçilecektir.*
