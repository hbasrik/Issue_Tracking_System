
# KAREA — KPI ve Veri Metrik Tanımlama Kataloğu v1.0

Bu katalog, dashboard ve Power BI tarafında görselleştirilecek her metriğin tanımını, hesaplama formülünü, veri kaynağını ve önerilen görselleştirme tipini standardize eder. Amaç: her metriğin tek bir "source of truth" tanımına sahip olması.

---

## 1. Daily Pending Issues

| Alan | Değer |
|---|---|
| **Tanım** | Belirli bir günde hâlâ açık (çözülmemiş) durumda olan issue (hata) sayısı |
| **Formül** | `COUNT(issues) WHERE status IN ('OPEN','IN_PROGRESS') AND created_at <= end_of_day` |
| **Veri Kaynağı** | `issues` tablosu (status, created_at, resolved_at) |
| **Granülarite** | Günlük, istasyon bazlı ve faz bazlı kırılım |
| **Görselleştirme** | Trend line chart (son 30 gün) + güncel gün için büyük sayı kartı (KPI card) |
| **Alarm Eşiği** | Yönetici tarafından konfigüre edilebilir (örn. >15 açık issue → kırmızı) |

## 2. Completed Issues / Tasks (Daily & Weekly)

| Alan | Değer |
|---|---|
| **Tanım** | Belirli periyotta kapatılan issue sayısı ve tamamlanan checkpoint/checklist görev sayısı |
| **Formül** | `COUNT(issues) WHERE resolved_at BETWEEN period_start AND period_end` <br> `COUNT(checkpoints) WHERE completed_at BETWEEN period_start AND period_end` |
| **Veri Kaynağı** | `issues` (resolved_at), `checkpoint_completions` (completed_at) |
| **Granülarite** | Günlük / Haftalık, operatör bazlı ve istasyon bazlı kırılım |
| **Görselleştirme** | Bar chart (gün/hafta bazlı), operatör performans tablosu |

## 3. Cycle Time / Elapsed Time (Lead Time & MTTR)

| Alt Metrik | Tanım | Formül |
|---|---|---|
| **Phase Cycle Time** | Bir aracın bir fazda geçirdiği süre | `phase_end_timestamp - phase_start_timestamp` |
| **Station Elapsed Time** | Aracın bir istasyonda geçirdiği süre | `station_exit_timestamp - station_entry_timestamp` |
| **MTTR (Mean Time to Resolve)** | Issue açılışından kapanışına ortalama süre | `AVG(resolved_at - created_at)` (issue bazında, sonra ortalama) |
| **Lead Time (End-to-End)** | Aracın hatta girişinden sevkiyata kadar toplam süresi | `shipped_at - production_start_at` |

| Alan | Değer |
|---|---|
| **Veri Kaynağı** | `phase_logs`, `station_logs`, `issues` (created_at/resolved_at), `vehicles` (production_start_at, shipped_at) |
| **Granülarite** | Araç bazlı, istasyon bazlı, faz bazlı, günlük/haftalık ortalama |
| **Görselleştirme** | Box-plot (dağılım), heatmap (istasyon x süre), ortalama/medyan KPI kartları |

## 4. Defect Rate per Station

| Alan | Değer |
|---|---|
| **Tanım** | Bir istasyonda üretilen/işlenen araç başına düşen hata (issue) oranı |
| **Formül** | `COUNT(issues WHERE station_id = X) / COUNT(vehicles PASSED THROUGH station_id = X) × 100` |
| **Veri Kaynağı** | `issues` (station_id), `station_logs` (vehicle geçiş kayıtları) |
| **Granülarite** | İstasyon bazlı, günlük/haftalık/aylık trend |
| **Görselleştirme** | Pareto chart (istasyonlar hata sayısına göre sıralı), trend line |

## 4b. Araç Bazlı Açık Hata Dağılımı (VIN × Severity) — *Karar: Onaylandı, Must-Have*

| Alan | Değer |
|---|---|
| **Tanım** | Belirli bir aracın (VIN) o an açık olan issue'larının önem derecesine (severity) göre kırılımı |
| **Formül** | `COUNT(issues) WHERE vehicle_id = X AND status IN ('OPEN','IN_PROGRESS') GROUP BY severity` |
| **Veri Kaynağı** | `issues` tablosu (vehicle_id, severity [`CRITICAL`/`MEDIUM`/`LOW`], status) |
| **Granülarite** | Araç (VIN) bazlı; Analysis sekmesindeki diğer filtrelerle (tarih/faz/statü/hata türü) birlikte daraltılabilir |
| **Örnek Çıktı** | "VIN ...00057: 8 açık hata — 3 Kritik, 2 Orta, 3 Düşük" |
| **Görselleştirme** | VIN bazlı tablo (Toplam / Kritik / Orta / Düşük sütunları) + öbeklenmiş (stacked) bar chart |
| **Raporlama** | PDF/Print export çıktısına dahil edilir (bkz. PRD FR-6.9) |

## 5. Ek Önerilen KPI'lar (Should-Have — Onaya Açık)

| KPI | Tanım | Formül | Amaç |
|---|---|---|---|
| **First Pass Yield (FPY)** | İlk denemede hiç hata almadan tüm checkpoint'leri geçen araç oranı | `COUNT(vehicles with 0 failed checkpoints) / COUNT(total vehicles) × 100` | Genel süreç kalitesi |
| **EoL Pass Rate** | EoL checklist'inde tüm maddeleri "OK" ile geçen araç oranı | `COUNT(vehicles all 13 items = OK) / COUNT(total EoL-checked vehicles) × 100` | Hat sonu kalite göstergesi |
| **Rework Rate** | EoL veya checkpoint'te "REWORK" statüsü alan madde oranı | `COUNT(items = REWORK) / COUNT(total items evaluated) × 100` | Yeniden işleme maliyeti göstergesi |
| **Pre-Shipment Checklist Completion Rate** | 43 maddelik checklist'in ortalama tamamlanma yüzdesi (sevk anında) | `AVG(checked_items / 43 × 100)` per vehicle | Sevkiyat hazırlık disiplini |
| **On-Time Shipment Rate** | Planlanan tarihte/öncesinde sevk edilen araç oranı | `COUNT(shipped_at <= planned_ship_date) / COUNT(total shipped) × 100` | Müşteri teslim performansı |
| **VIN Search Latency (Teknik KPI)** | Kısmi VIN aramasının P95 yanıt süresi | Uygulama seviyesinde ölçülür (APM) | Sistem performans sağlığı |

## 6. Dashboard Yerleşim Önerisi (Özet)

- **Üst Satır (KPI Cards):** Daily Pending Issues, Completed Today, Avg MTTR, Defect Rate (genel)
- **Orta Bölüm:** Cycle Time trend grafiği + İstasyon bazlı Defect Rate Pareto
- **Alt Bölüm:** Araç bazlı detay tablo (filtrelenebilir: lokasyon, statü, faz, VIN son 5 hane)
- **Yan Panel:** EoL Pass Rate ve Pre-Shipment Completion Rate özet göstergeleri (gauge chart)

*Detaylı wireframe ADIM 2'de sunulacaktır.*
