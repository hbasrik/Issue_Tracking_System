# KAREA — Yeni Kontrol Formları

**Kaynak:** Kalite ekibinden gelen dört PDF form.
**Amaç:** Formların maddelerini yapısal halde tutmak; mevcut şablonlarla
karşılaştırma ve sisteme yükleme bu dosyadan yapılacak.

| Form no | Ad | Aşama | Madde |
|---|---|---|---|
| KY.FR-09 | End Of Line Kontrol Formu | Şube | 39 |
| KY.FR-18 | E/E Kontrol Formu — Şube | Şube | 47 |
| KY.FR-17 | E/E Kontrol Formu — Balçık | Depo | 28 |
| KY.FR-19 | Final Kalite Kontrol Formu | Depo | 56 |

**Dikkat:** KY.FR-19'da 43, 44 ve 45 numaralı maddeler yok; numaralama
42'den 46'ya atlıyor. Kalite ekibine sorulmalı — silinmiş satırlar mı,
yoksa form hatası mı?

---

## Formların ortak yapısı

Dört formda da bulunan üst bilgi alanları:

| Alan | Sistemde karşılığı |
|---|---|
| VIN / Şasi No | Var |
| Kontrol eden | Giriş yapan kullanıcı |
| Kontrol tarihi / saati | Kayıt zamanı |
| Araç modeli / varyant | Var (vehicle_model) |
| Renk / renk kodu | **Yok** |
| Motor numarası | **Yok** |
| Üretim iş emri no | **Yok** |
| Sipariş no | **Yok** |
| Müşteri | **Yok** |
| Araç seri no | **Yok** |
| Kontrol lokasyonu | Aşamadan türetilir (şube / depo) |
| Vardiya | Saatten türetilir |
| İstasyon | Var |

Formların altındaki onay bloğu (genel sonuç, NOK adedi, imza, geçiş
onayı) sistemde aşama geçiş mekanizmasına karşılık geliyor.

KY.FR-09'daki "Uygunsuzluk Takip Çizelgesi" (K001–K014) sistemdeki
hata kayıt mekanizmasının aynısı; forma ikinci bir tablo olarak
alınmamalı.

---

## KY.FR-09 — End Of Line Kontrol Formu (Şube, 39 madde)

Sütunlar: Madde ID · Bölüm · Kontrol maddesi · Gereklilik/kabul
kriteri · Kontrol yöntemi · OK/NOK · Ölçüm/bulgu/kusur kayıt ID

| ID | Bölüm | Kontrol maddesi | Kabul kriteri | Yöntem |
|---|---|---|---|---|
| E001 | Giriş | Araç kimliği ve varyant | Araç ve kayıt bilgileri eşleşmeli | Kayıt / etiket karşılaştırma |
| E002 | Giriş | Üretim teslim kaydı | Üretim tamam; açık uygunsuzluk olmamalı | Üretim kaydı inceleme |
| E003 | Dış | Genel boya ve kozmetik kontrolü | Kusur kataloğu sınırları içinde olmalı | Görsel |
| E004 | Dış | Sol kapı contası | Tam oturmuş; yırtık ve açıklık olmamalı | Görsel / elle kontrol |
| E005 | Dış | Sağ kapı contası | Tam oturmuş; yırtık ve açıklık olmamalı | Görsel / elle kontrol |
| E006 | Dış | Bagaj kapağı contası | Tam oturmuş; yırtık ve açıklık olmamalı | Görsel / elle kontrol |
| E007 | Gap & flush | Sol kapı gap / flush | Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı | Görsel kontrol |
| E008 | Gap & flush | Sağ kapı gap / flush | Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı | Görsel kontrol |
| E009 | Gap & flush | Bagaj kapağı gap / flush | Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı | Görsel kontrol |
| E010 | Gap & flush | Ön kaput gap / flush | Boşluk ve yüzey hizası çevre boyunca dengeli; belirgin fark veya temas olmamalı | Görsel kontrol |
| E011 | Dış | Sol / sağ ön çamurluk kaplamaları | Tam oturmuş; kırık ve eksik parça olmamalı | Görsel / elle kontrol |
| E012 | Dış | Sol / sağ arka çamurluk kaplamaları | Tam oturmuş; kırık ve eksik parça olmamalı | Görsel / elle kontrol |
| E013 | Dış | Sol / sağ far hizası ve çerçeveleri | Hizalı, tam oturmuş ve hasarsız olmalı | Görsel |
| E014 | Dış | Sol / sağ dış ayna gövdesi | Tam oturmuş, sağlam ve hasarsız olmalı | Görsel / elle kontrol |
| E015 | Dış | Sol / sağ cam çerçevesi ve çıtaları | Tam oturmuş; açıklık ve hasar olmamalı | Görsel / elle kontrol |
| E016 | Dış | Sol / sağ ayna kapağı yapışması | Tam yapışmış; kalkma ve taşma olmamalı | Görsel / elle kontrol |
| E017 | Dış | Arka kamera fiziksel montajı | Tam oturmuş; lens temiz ve hasarsız olmalı | Görsel |
| E018 | Dış | Araç dışı logolar | Doğru konumda, hizalı ve hasarsız olmalı | Görsel |
| E019 | İç | Ön konsol / ekran / havalandırma çerçeveleri | Tam oturmuş; çizik, kırık ve açıklık olmamalı | Görsel / elle kontrol |
| E020 | İç | Orta konsol ve konsol kapakları | Tam oturmuş; çizik, kırık ve açıklık olmamalı | Görsel |
| E021 | İç | Sol kapı iç döşemesi | Tam oturmuş; hasar ve açıklık olmamalı | Görsel |
| E022 | İç | Sağ kapı iç döşemesi | Tam oturmuş; hasar ve açıklık olmamalı | Görsel |
| E023 | İç | Tavan döşemesi | Sarkma, kırışma, kir ve hasar olmamalı | Görsel |
| E024 | İç | Sol iç yan döşeme | Tam oturmuş; hasar ve açıklık olmamalı | Görsel |
| E025 | İç | Sağ iç yan döşeme | Tam oturmuş; hasar ve açıklık olmamalı | Görsel |
| E026 | İç | Bagaj iç döşemesi / taban | Tam oturmuş; leke, hasar ve gevşeklik olmamalı | Görsel |
| E027 | İç | Taban döşemesi / eşik kaplamaları | Düzgün serilmiş; açık kenar ve eksik parça olmamalı | Görsel / elle kontrol |
| E028 | İç | Araç içi klips, kapak ve tapalar | Tam ve yerinde; gevşek parça olmamalı | Görsel / elle kontrol |
| E029 | İç | Bagaj içi yapıştırıcı / sızdırmazlık uygulaması | Kesintisiz ve doğru bölgede uygulanmış olmalı | Görsel |
| E030 | İç | Bagaj amortisörleri ve çevre boyası | Sağlam takılmış; çevre boyası hasarsız olmalı | Görsel / elle kontrol |
| E031 | İç | Sürücü / yolcu koltukları ve yan kapakları | Döşeme ve yan kapaklar tam ve hasarsız olmalı | Görsel / elle kontrol |
| E032 | İç | Sol ön konsol alt kapağı | Tam oturmuş; eksik klips ve açıklık olmamalı | Görsel / elle kontrol |
| E033 | İç | Sağ ön konsol alt kapağı | Tam oturmuş; eksik klips ve açıklık olmamalı | Görsel / elle kontrol |
| E034 | İç | İç dikiz aynası | Sağlam, temiz ve hasarsız olmalı | Görsel / elle kontrol |
| E035 | İç | Sol / sağ emniyet kemeri ve askıları | Tam, hasarsız, burulmamış ve sıkışmamış olmalı | Görsel / elle kontrol |
| E036 | İç | Araç kimlik kartı ve tanımlama etiketleri | Bilgiler eşleşmeli; okunaklı ve hasarsız olmalı | Kayıt / görsel karşılaştırma |
| E037 | İç | Bagaj kapağı iç yüzeyi ve kaplamaları | Tam ve hasarsız; gevşek parça olmamalı | Görsel / elle kontrol |
| E038 | İç | Direksiyon / anahtar üzeri logo | Doğru konumda, yapışmış ve hasarsız olmalı | Görsel |
| E039 | İç | Sol / sağ ayna iç kapakları | Tam oturmuş; kırık ve eksik klips olmamalı | Görsel / elle kontrol |

---

## KY.FR-18 — E/E Kontrol Formu, Şube (47 madde)

Dört bölümden oluşuyor ve her bölümün cevap sütunları farklı.

### Bölüm 1 — Kontrol ünitesi yazılımı (1–8)
Cevap sütunları: Güncellendi mi? · Hata var mı? · Sonuç · Açıklama

| No | Madde |
|---|---|
| 1 | EPS (CAL) |
| 2 | VCU Domain SW |
| 3 | VCU GW SW |
| 4 | BMS SW |
| 5 | MCU SW |
| 6 | MHU SW |
| 7 | BCM SW |
| 8 | VCU VIN Güncellemesi |

### Bölüm 2 — Fonksiyon kontrolleri (9–36)
Cevap sütunları: Kontrol edildi mi? · Hata var mı? · Sonuç · Açıklama

| No | Madde |
|---|---|
| 9 | Sağ Sol Dönüş Sinyali |
| 10 | Gündüz Farı Kontrol |
| 11 | Licance Plate Kontrol |
| 12 | Low Beam |
| 13 | High Beam |
| 14 | FOG Light |
| 15 | Reverse Gear Light |
| 16 | Reverse Radar |
| 17 | Reverse Park Sensor |
| 18 | Hand Brake |
| 19 | Sağ Sol Cam Açma Kapama |
| 20 | Sağ Sol Kapı Kilit Sistemi Kontrol |
| 21 | Arka Bagaj Kilit Sistemi Kontrol |
| 22 | Dashboard Dörtlü Sinyal Kontrol |
| 23 | Dashboard Kilit Butonu Kontrol |
| 24 | Wiper System Kontrol Speed 1 / Speed 2 |
| 25 | Washer system control |
| 26 | HVAC Blower Kontrol |
| 27 | HVAC PTC Isıtıcı |
| 28 | HVAC A/C Kontrol |
| 29 | HVAC Kanal Değişimi Kontrol |
| 30 | Vites Geçiş Kontrolleri (P/R/N/D) |
| 31 | Vakum Pompası Vakum Booster Kontrol |
| 32 | Speaker Kontrol |
| 33 | Araç Şarj Testi |
| 34 | Araç Sürüş Testi |
| 35 | Regenerative Brake Testi On Off |
| 36 | ECO SPORT Mode Geçiş Kontrol |

### Bölüm 3 — Ground resistance ölçümü (37–41)
Cevap sütunları: Ölçüldü mü? · **Ölçüm değeri** · Sonuç · Açıklama

Kabul kriteri: Açıkta kalan iletken parçalarla elektriksel şasi
arasındaki direnç, en az 0,2 A akım altında 0,1 Ω'un altında olmalı.

| No | Madde |
|---|---|
| 37 | MCU Ground Resistance |
| 38 | e-Motor Ground Resistance |
| 39 | 3in1 Ground Resistance |
| 40 | AC Ground Resistance |
| 41 | HV Battery Ground Resistance |

### Bölüm 4 — Konnektör yalıtım direnci (42–47)
Cevap sütunları: Ölçüldü mü? · **Ölçüm değeri** · Sonuç · Açıklama

Kabul kriteri: > 500 Ω/V · Karea Fit: > 50.000 Ω

| No | Madde |
|---|---|
| 42 | Battery Connector (+) |
| 43 | Battery Connector (−) |
| 44 | 3in1 PTC Connector (+) |
| 45 | 3in1 PTC Connector (−) |
| 46 | 3in1 AC Connector (+) |
| 47 | 3in1 AC Connector (−) |

---

## KY.FR-17 — E/E Kontrol Formu, Balçık (28 madde)

Cevap sütunları: Kontrol edildi mi? · Hata var mı? · Sonuç · Açıklama

**Not:** Bu form, KY.FR-18'in 9–36 numaralı fonksiyon kontrollerinin
birebir aynısı. Yazılım güncellemesi ve direnç ölçümü bölümleri yok.
Aynı kontroller depoda tekrarlanıyor.

| No | Madde |
|---|---|
| 1 | Sağ Sol Dönüş Sinyali |
| 2 | Gündüz Farı Kontrol |
| 3 | Licance Plate Kontrol |
| 4 | Low Beam |
| 5 | High Beam |
| 6 | FOG Light |
| 7 | Reverse Gear Light |
| 8 | Reverse Radar |
| 9 | Reverse Park Sensor |
| 10 | Hand Brake |
| 11 | Sağ Sol Cam Açma Kapama |
| 12 | Sağ Sol Kapı Kilit Sistemi Kontrol |
| 13 | Arka Bagaj Kilit Sistemi Kontrol |
| 14 | Dashboard Dörtlü Sinyal Kontrol |
| 15 | Dashboard Kilit Butonu Kontrol |
| 16 | Wiper System Kontrol Speed 1 / Speed 2 |
| 17 | Washer system control |
| 18 | HVAC Blower Kontrol |
| 19 | HVAC PTC Isıtıcı |
| 20 | HVAC A/C Kontrol |
| 21 | HVAC Kanal Değişimi Kontrol |
| 22 | Vites Geçiş Kontrolleri (P/R/N/D) |
| 23 | Vakum Pompası Vakum Booster Kontrol |
| 24 | Speaker Kontrol |
| 25 | Araç Şarj Testi |
| 26 | Araç Sürüş Testi |
| 27 | Regenerative Brake Testi On Off |
| 28 | ECO SPORT Mode Geçiş Kontrol |

---

## KY.FR-19 — Final Kalite Kontrol Formu (Depo, 56 madde)

Sütunlar: No · Bölüm · Kontrol noktası · Gereklilik · Kontrol yöntemi ·
Sonuç (OK/NOK/**NA**) · Kusur kodu · Kusur yeri · Aksiyon/düzeltme ·
Tekrar kontrol · Açıklama

**Not:** "Gereklilik" sütunu formda boş bırakılmış. Kalite ekibinden
istenebilir.

| No | Bölüm | Kontrol noktası | Yöntem |
|---|---|---|---|
| 1 | Kimlik & Evrak | Şasi ve seri numarası okunaklı ve doğru | Doküman/Etiket kontrol |
| 2 | Kimlik & Evrak | Model ve versiyon etiketi doğru | Doküman/Etiket kontrol |
| 3 | Kimlik & Evrak | Sevkiyat evrakları, irsaliye ve teslim formu hazır | Doküman/Etiket kontrol |
| 4 | Kimlik & Evrak | Kullanım kılavuzu ve garanti dokümanı mevcut | Doküman/Etiket kontrol |
| 5 | Kimlik & Evrak | Anahtar, uzaktan kumanda ve aksesuar seti tam | Doküman/Etiket kontrol |
| 6 | Dış Görünüş | Boya yüzeyi homojen, portakal kabuğu, akma ve kabarcık yok | Görsel kontrol |
| 7 | Dış Görünüş | Çizik, göçük ve deformasyon yok | Görsel kontrol |
| 8 | Dış Görünüş | Keskin kenar ve çapak yok | Görsel kontrol |
| 9 | Dış Görünüş | Panel boşlukları dengeli ve simetrik | Görsel kontrol |
| 10 | Dış Görünüş | Logolar ve etiketler düzgün yapışmış ve hizalı | Görsel kontrol |
| 11 | Dış Görünüş | Cam ve pleksi yüzeylerde çatlak veya kırık yok | Görsel kontrol |
| 12 | Dış Görünüş | Silecekler ve cam suyu sistemi tam fonksiyonlu çalışıyor | Fonksiyon kontrol |
| 13 | Dış Görünüş | Aynalar sorunsuz ayarlanabiliyor | Fonksiyon kontrol |
| 14 | Dış Görünüş | Far konumlandırması | Görsel kontrol |
| 15 | Kapılar | Kapılar düzgün kapanıyor ve açılıyor | Görsel kontrol |
| 16 | Kapılar | Cam açma ve kapama mekanizmaları sorunsuz çalışıyor | Fonksiyon kontrol |
| 17 | Kapılar | Kapı menteşe bağlantıları sağlam ve gevşeklik yok | Elle kontrol |
| 18 | Kapılar | Kapı kilit mekanizması çalışıyor | Fonksiyon kontrol |
| 19 | Kapılar | Kapı fitilleri düzgün ve kopuk değil | Görsel kontrol |
| 20 | Kapılar | Kapı boşluk ve hiza uyumu standartlar dahilinde | Görsel kontrol |
| 21 | İç Donanım | Koltuklar sabit ve sağlam | Elle kontrol |
| 22 | İç Donanım | Emniyet kemerleri mevcut ve mekanizması çalışır durumda | Fonksiyon kontrol |
| 23 | İç Donanım | Trim parçalarında kırık ve çatlak yok | Görsel kontrol |
| 24 | İç Donanım | Keskin kenar ve dışarı çıkan vida yok | Görsel kontrol |
| 25 | İç Donanım | Klima ve havalandırma sistemi fonksiyonel çalışıyor | Fonksiyon kontrol |
| 26 | İç Donanım | Multimedya ve bilgi ekranları sorunsuz çalışıyor | Fonksiyon kontrol |
| 27 | İç Donanım | Pedallar, kollar ve mandallar serbest hareket ediyor | Görsel kontrol |
| 28 | Mekanik | Tekerlek bijonları sabit ve gevşeklik yok | Elle kontrol |
| 29 | Mekanik | Lastiklerde hasar yok ve basınç seviyeleri uygun | Görsel kontrol |
| 30 | Mekanik | Süspansiyon bağlantılarında gevşeklik yok | Elle kontrol |
| 31 | Mekanik | Direksiyon boşluğu standart limitler dahilinde | Görsel kontrol |
| 32 | Mekanik | Fren sistemi statik olarak çalışıyor | Fonksiyon kontrol |
| 33 | Mekanik | Fren hortum ve hatlarında sıvı kaçağı yok | Görsel kontrol |
| 34 | Mekanik | Alt takımda sürtme ve temas izi yok | Görsel kontrol |
| 35 | Elektrik | Kontak ve ana güç sistemi çalışıyor | Fonksiyon kontrol |
| 36 | Elektrik | Kısa ve uzun farlar çalışıyor | Fonksiyon kontrol |
| 37 | Elektrik | Sağ ve sol sinyaller çalışıyor | Fonksiyon kontrol |
| 38 | Elektrik | Stop lambaları çalışıyor | Fonksiyon kontrol |
| 39 | Elektrik | Geri vites ikaz sistemi çalışıyor | Fonksiyon kontrol |
| 40 | Elektrik | Korna ve dış uyarı sesi çalışıyor | Fonksiyon kontrol |
| 41 | Elektrik | Gösterge paneli uyarı ışıkları eksiksiz çalışıyor | Fonksiyon kontrol |
| 42 | Elektrik | Şarj soketi ve koruyucu kapağı sağlam | Görsel kontrol |
| 46 | Fonksiyon | İleri ve geri hareket komutu doğru | Fonksiyon kontrol |
| 47 | Fonksiyon | Hızlanma tepkisi standartlara uygun | Görsel kontrol |
| 48 | Fonksiyon | Rejeneratif ve elektronik frenleme normal | Görsel kontrol |
| 49 | Fonksiyon | Park freni sistemi çalışıyor | Fonksiyon kontrol |
| 50 | Yol Testi | Düz yolda doğrusal ilerleme sağlanıyor | Sürüş testi |
| 51 | Yol Testi | Frenleme sırasında araca sapma etkisi yok | Sürüş testi |
| 52 | Yol Testi | Dönüşlerde anormal mekanik ses yok | Sürüş testi |
| 53 | Yol Testi | Titreşim ve rezonans değerleri standartlar dahilinde | Sürüş testi |
| 54 | Yol Testi | Sürüş sırasında panelde uyarı veya arıza ışığı yanmıyor | Sürüş testi |
| 55 | Sevkiyat | Araç iç ve dış temizliği sevk standartlarına uygun | Görsel kontrol |
| 56 | Sevkiyat | Koruyucu ambalaj ve kaplama doğru uygulanmış | Fonksiyon kontrol |
| 57 | Sevkiyat | Sevkiyat etiketi ve yönlendirme işaretleri uygun | Görsel kontrol |
| 58 | Sevkiyat | Şarj seviyesi son kullanıcı teslimatı için yeterli seviyede | Görsel kontrol |
| 59 | Sevkiyat | Odo kontrol | Görsel kontrol |

---

## Sistemde eksik olan yetenekler

Bu formların tam olarak temsil edilebilmesi için gerekenler:

1. **Maddeye kabul kriteri alanı** — sabit metin, cevap değil
2. **Maddeye kontrol yöntemi alanı** — sabit metin
3. **NA (uygulanamaz) sonucu** — bugün yalnızca OK / NOK / yeniden
   işlem / şartlı onay var
4. **Ölçüm değeri alanı** — sayısal, birimli, alt-üst sınırlı; yalnızca
   KY.FR-18'in 37–47 numaralı maddeleri için gerekli
5. **Araç kaydına yeni alanlar** — motor numarası, üretim iş emri no,
   sipariş no, renk kodu, araç seri no, müşteri

Madde 1–3 küçük eklemeler. Madde 4 orta ölçekli. Madde 5 araç kaydını
genişletmek demek ve hangi alanların gerçekten gerektiği kalite
ekibiyle netleşmeli.
