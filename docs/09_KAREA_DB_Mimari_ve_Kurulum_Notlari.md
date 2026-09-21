
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
`fn_enforce_manual_status_change` trigger'ı araç durumunu **tek yönlü** tutar
(`PLANNED → IN_PRODUCTION → IN_WAREHOUSE → DELIVERED`; `ON_HOLD` park/geri
yükleme ayrı kural). Serbest API/UI durum düzenlemesi yoktur; geçişler EoL
aksiyonları ve yönetici bekleme uçlarıyla yapılır. Checklist tamamlanmadan
veya damga olmadan atlama / geriye dönüş `RAISE EXCEPTION` ile reddedilir
(PRD FR-4.3 — UI bypass edilse dahi geçerli).

#### `karea.allow_status_rewind` (oturum GUC — yalnızca elle DB)
- **Ne:** Trigger'ın tek yön kontrolünü o transaction için kapatan isteğe
  bağlı bayrak.
- **Ne zaman:** Damga ile `current_global_status` uyuşmayan satırları
  onarmak gibi nadir DBA müdahalelerinde, `psql` içinde:
  `SELECT set_config('karea.allow_status_rewind', 'true', true);` ardından
  `UPDATE` / `COMMIT`.
- **Neden:** Trigger'ı `DROP` etmeden kontrollü düzeltme imkânı.
- **Uygulama yasak:** Backend, bu GUC adını uygulama SQL'inde set etmez
  (`set_config('karea.allow_status_rewind'…)` Go ağacında olmamalı).

#### Geliştirme EoL reset (`POST /vehicles/{vin}/eol/reset`)
Yerel yeniden deneme için iş akışını BRANCH'e ve aracı `IN_PRODUCTION`'a
geri saran geliştirme aracıdır. Canlıda erişilemez:

1. HTTP: `requireDevelopment` — `APP_ENV != development` ise **404**
   (auth'tan önce).
2. Yetki: `admin.manage_masters` + giriş yapmış kullanıcı.
3. Wire: production/staging binary `EOLReset` usecase'ini **hiç oluşturmaz**.
4. DB: `fn_ops_set_vehicle_status` tek yön trigger'ını içeride atlar ama
   yalnızca oturumda `karea.app_env=development` iken çalışır (API havuzu
   `APP_ENV`'i her bağlantıya yazar). Production bağlantısında fonksiyon
   `RAISE EXCEPTION` eder.
5. UI: buton yalnızca Vite `import.meta.env.DEV` iken görünür.

Manuel veri onarımı için bu fonksiyon kullanılmaz; DBA `allow_status_rewind`
GUC'unu kullanır.

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

- **Migration aracı:** `golang-migrate` (`make migrate-up`). Her değişiklik `NNNN_description.up.sql` / `.down.sql` çifti olarak versiyonlanır.
- **Geliştirme seed sırası** (`make seed` → `database/seed/01`…`06`): stations → station_steps → checklist template items → users → defect catalog → (dev-only) 18 fixture vehicles.
- **Checklist maddeleri:** `database/seed/03_checklist_templates.sql` canlı üretim içeriğinin aktif maddelerini taşır (EOL / SHIPMENT / TEST). İngilizce yer tutucu metinler kaldırılmıştır; script idempotenttir.
- **500 VIN yüklemesi seed değildir.** Dosya: `database/scripts/reset_and_load_vins.sql`. Operasyonel tabloları truncate edip 500 PLANNED VIN yazar; `make seed` bunu çalıştırmaz (kurulumu yavaşlatır, ~52k progress satırı üretir). Üretim/staging’de bilinçli ayrı adım.
- **Üretimde `06_test_vehicles.sql` çalıştırılmaz** (demo araçlar / `changeme123` kullanıcı seed’i B3 ile ayrılmalıdır).
- **Yük testi:** `pgbench`/`k6` ile 1M+ `issue_list`/`audit_logs` (TC-013 P95 < 100ms).

---

## 5. Kurulum To-Do Checklist

### Geliştirme

- [ ] PostgreSQL 15+ instance
- [ ] `make migrate-up`
- [ ] `make seed` (01–06; checklist gerçek içerik + 18 fixture araç)

### Üretim / staging veritabanı

- [ ] PostgreSQL 15+ instance kurulumu
- [ ] `pg_trgm` (ve gerekli uzantılar) aktif
- [ ] `make migrate-up` (veya eşdeğeri; tüm `database/migrations/*.up.sql`)
- [ ] Referans seed: `01_stations` → `02_stations_and_steps` → `03_checklist_templates` → `05_defect_catalog` (üretimde `04_users` / `06_test_vehicles` yerine güvenli admin hesabı — B3)
- [ ] **500 VIN yükleme (bilinçli adım, seed değil):**
  ```sh
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/scripts/reset_and_load_vins.sql
  ```
  Bu script `vehicles` ve bağlı operasyonel tabloları truncate eder, ardından 500 PLANNED VIN ekler. Referans veri (şablon, istasyon, katalog) silinmez. Boş/yeni kurulumda veya bilinçli sıfırlamada bir kez çalıştırılır; günlük seed’e dahil edilmez.
- [ ] Trigger / kapı doğrulamaları: TC-002, TC-007/007b/007c, TC-008/009, TC-013
- [ ] `EXPLAIN ANALYZE` ile kritik sorguların index kullandığının doğrulanması
- [ ] Staging’de yük testi (P95 < 100ms)

---

## 6. Geliştirme yedekleme / geri yükleme

Yerel geliştirme için `database/scripts/backup.sh` ve `restore.sh`.
`pg_dump` dosya sistemindeki medyayı kapsamaz; her yedek **aynı zaman
damgasıyla** hem DB dökümü hem `backend/uploads/` arşivi üretir.

Çıktı dizini: repo kökünde `backups/` (`.gitignore` — repoya girmez).
Bağlantı bilgisi `.env` içindeki `DATABASE_URL`’den okunur; konteyner
adı varsayılan `karea_postgres`.

### Yedek al

```sh
./database/scripts/backup.sh
# isteğe bağlı: son N çifti tut (varsayılan 7)
BACKUP_KEEP=14 ./database/scripts/backup.sh
```

Üretilen dosyalar (örnek):

- `backups/karea_20260321_131500.dump`
- `backups/karea_20260321_131500_uploads.tar.gz`

### Geri yükle

Hedef veritabanı adı **zorunlu**dır; `DATABASE_URL`’deki canlı DB adına
geri yükleme reddedilir (`ALLOW_RESTORE_TO_SOURCE=1` ile bilinçli istisna).

```sh
./database/scripts/restore.sh <hedef_db> <damga|dump_yolu> [--uploads-dir DIR]
```

Örnekler:

```sh
./database/scripts/restore.sh karea_restore_test 20260321_131500
./database/scripts/restore.sh karea_restore_test backups/karea_20260321_131500.dump \
  --uploads-dir /tmp/karea_uploads_test
```

Geri yükleme sonunda `vehicles`, `checklist_template_items`, `issue_list`
ve `users` satır sayılarını yazdırır. `--uploads-dir` verilmezse arşiv
`backend/uploads/` altına açılır (mevcut dosyaların üzerine yazar).

Bu betikler **geliştirme** içindir; üretim yedekleme politikası (B5) ayrıdır.

---

*Bu şema onaylandıktan sonra ADIM 4'e (Cursor Master Kodlama Promptu) geçilecektir.*
