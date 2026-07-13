
# KAREA — MoSCoW Önceliklendirme Matrisi v1.0

**Legend:** M = Must Have · S = Should Have · C = Could Have · W = Won't Have (this phase)

| # | Özellik / Bileşen | Öncelik | Gerekçe |
|---|---|:---:|---|
| 1 | Araç kaydı (VIN, model, temel bilgiler) | **M** | Platformun temel varlığı; her şey buna bağlı |
| 2 | Global lokasyon/statü yönetimi (Hatta/Depoda/Müşteride) | **M** | İş kuralı olarak açıkça talep edildi |
| 3 | 8 fazlı üretim takibi + checkpoint tik sistemi | **M** | Ürünün çekirdek fonksiyonu |
| 4 | Dinamik tamamlanma yüzdesi hesaplama | **M** | Faz sisteminin doğrudan sonucu, ayrılamaz |
| 5 | Checkpoint başarısızlığında otomatik issue tetikleme (soft-warning, hat bloklanmaz) | **M** *(Karar: Onaylandı)* | Kritik iş kuralı, veri kaybını önler; hat durdurulmaz |
| 6 | 13 maddelik EoL checklist (4 statü + açıklama) | **M** | Açıkça istenen yeni bileşen |
| 7 | EoL statüye bağlı zorunlu/opsiyonel açıklama kuralı | **M** | Veri kalitesi için kritik iş kuralı |
| 8 | 43 maddelik sevk öncesi checklist | **M** | Açıkça istenen yeni bileşen |
| 9 | "43/43 tamamlanmadan sevk yok" backend kuralı | **M** | Açıkça belirtilen zorunlu iş kuralı |
| 10 | VIN son-5-hane akıllı arama | **M** | Saha kullanılabilirliği için kritik |
| 11 | PostgreSQL trigram (pg_trgm) index mimarisi | **M** | Performans gereksinimi olmadan özellik #10 çalışmaz |
| 12 | Audit log (kim/ne zaman/ne değişti) | **M** | Endüstriyel/denetlenebilirlik gereksinimi |
| 13 | Rol bazlı erişim kontrolü (RBAC — 2 rol: Operator/Manager-Admin) | **M** *(Karar: Onaylandı)* | Operator=yalnızca mobil, Manager/Admin=yalnızca web |
| 14 | Daily Pending Issues KPI'ı | **M** | Açıkça istenen metrik |
| 15 | Completed Issues/Tasks KPI'ı | **M** | Açıkça istenen metrik |
| 16 | Cycle Time / Elapsed Time / MTTR KPI'ları | **M** | Açıkça istenen metrik |
| 17 | Defect Rate per Station KPI'ı | **M** | Açıkça istenen metrik |
| 18 | Web Dashboard (yönetici arayüzü) | **M** | Ürünün web bacağı, dashboard'sız KPI'lar görünmez |
| 19 | Mobil saha uygulaması (React Native/Expo) | **M** | Ürünün mobil bacağı, operatör girişleri buradan |
| 20 | Premium Dark/Light mod UI | **S** | Kullanıcı deneyimini güçlendirir, MVP'yi bloklamaz |
| 21 | Micro-interaction / geçiş animasyonları | **S** | Hata önleme için değerli ama sonradan eklenebilir |
| 22 | First Pass Yield, EoL Pass Rate, Rework Rate KPI'ları | **S** | Değerli ek metrikler, çekirdek 4 KPI'dan sonra |
| 23 | On-Time Shipment Rate KPI'ı | **S** | Faydalı ama müşteri teslim tarihi verisi netleşmeli |
| 24 | Checklist şablonlarının UI üzerinden düzenlenebilmesi (admin panel) | **S** | DB'de dinamik olacak ama UI editörü MVP sonrası |
| 25 | Issue'lara fotoğraf/medya ekleme | **C** | Değerli ama MVP'de metin bazlı issue yeterli |
| 26 | Araç modeline göre farklı checklist şablonları (multi-template) — `checklist_templates` | **M** *(Karar: Onaylandı)* | TPM onayı ile Must-Have'e yükseltildi; EoL ve Sevk checklist'leri model bazlı olacak |
| 27 | Yerleşik "Analysis" sekmesi — dinamik filtreleme (tarih/faz/statü/hata türü) + Pie/Bar Chart | **M** *(Karar: Onaylandı)* | Power BI'ın yerini alan, açıkça talep edilen Must-Have özellik |
| 27b | Analysis sekmesi — A4 print-ready PDF/Export çıktısı | **M** *(Karar: Onaylandı)* | Açıkça talep edilen zorunlu rapor çıktısı |
| 27c | Issue önem derecesi (severity: Kritik/Orta/Düşük) veri alanı | **M** *(Karar: Onaylandı)* | Araç bazlı hata dağılımı raporlamasının ön koşulu |
| 27d | Analysis sekmesi — VIN bazlı filtre + araç bazlı açık hata dağılımı (severity kırılımlı) | **M** *(Karar: Onaylandı)* | Açıkça talep edildi; PDF export'a da dahil olacak |
| ~~27c~~ | ~~Power BI native connector / otomatik export~~ | **W** *(İptal)* | TPM kararıyla kalıcı olarak iptal edildi; harici BI aracı kullanılmayacak |
| 28 | Push notification (mobil) | **C** | Faz 2 kapsamı olarak işaretlendi |
| 29 | SSO / Active Directory entegrasyonu | **C** | Faz 1'de native auth yeterli |
| 30 | Offline-first mobil senkronizasyon | **W** | Faz 1'de online bağlantı varsayılıyor; mimari kapatılmıyor ama şimdilik yapılmayacak |
| 31 | Çoklu fabrika / multi-tenant mimari desteği | **W** | Mimari buna izin verir ama Faz 1'de tek fabrika |
| 32 | IoT/RFID/barkod donanım entegrasyonu | **W** | Faz 2+ kapsamı |

---

**Not:** "Must Have" listesindeki maddeler (artık 26, 27 ve 27b dahil 22 madde) MVP (Minimum Viable Product) kapsamını oluşturur ve ADIM 3/4'teki DB şeması ile scaffold prompt bu maddeler üzerine kurulacaktır. Bu matris, ADIM 1 Karar Günlüğü'ndeki (bkz. `01_KAREA_PRD.md` Bölüm 10) 5 karar ile güncellenmiştir.
