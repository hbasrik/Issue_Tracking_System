# KAREA — Hata Sınıflandırma Kataloğu (Taslak v2)

**Kaynak:** Eski sistemden alınan 1619 hata kaydının açıklama metinlerinin analizi.
**Durum:** Kalite ekibiyle gözden geçirilmeyi bekliyor.

---

## Operatörün gördüğü akış

Hata bildirme ekranında sırayla:

| Adım | Alan | Zorunlu | Nasıl |
|---|---|---|---|
| 1 | **Araç (VIN)** | Evet | Arama / seçim (mevcut) |
| 2 | **İstasyon** | Koşullu | Araç hattaysa zorunlu, hattan çıkmışsa hiç sorulmaz |
| 3 | **Parça** | Evet | 4 grup → parça. Üstte grup-bağımsız arama kutusu |
| 4 | **Kusur tipi** | Evet | 10 maddelik düz liste |
| 5 | **Şiddet** | Evet | Kritik / Orta / Düşük (mevcut) |
| 6 | **Açıklama** | Evet | Serbest metin (mevcut) |
| 7 | **Fotoğraf** | Evet | Kamera / galeri (mevcut) |

Operatör **iki yeni seçim** yapıyor: parça ve kusur tipi. Başka ek yük yok.

### Sistemin arka planda türettiği

| Alan | Nasıl | Değiştirilebilir mi |
|---|---|---|
| **Parça grubu** (Body / Şasi / Trim / Elektrik) | Seçilen parçadan kesin olarak bilinir | — (türetilmiş) |
| **Sorumlu süreç** (Kaynak / Boya / Montaj / Elektrik) | Kusur tipinden varsayılan atanır | Evet, kalite düzeltebilir |
| **Hata kodu** | Grup + parça + kusur tipinden oluşur | — |

Operatör kod görmez, kod ezberlemez.

---

## 1. Parça listesi (23 + Diğer)

### Body (9)
| Kod | Parça | Veri* |
|---|---|---|
| `10-01` | Kapı | %29,5 |
| `10-02` | Bagaj kapağı / Tailgate | %13,4 |
| `10-03` | C-Pillar / Direk | %12,8 |
| `10-04` | Tampon | %6,9 |
| `10-05` | Kaput | %5,2 |
| `10-06` | Çamurluk / Fender | %3,8 |
| `10-07` | Tavan | %2,3 |
| `10-08` | Spoiler | %2,1 |
| `10-09` | Doghouse | %1,8 |

### Şasi (3)
| Kod | Parça | Veri* |
|---|---|---|
| `20-01` | Şasi / Süspansiyon | %2,6 |
| `20-02` | Fren / Hidrolik hattı | %2,0 |
| `20-03` | Bağlantı elemanı (perçin, somun, vida, klips, saplama) | %5,9 |

### Trim (7)
| Kod | Parça | Veri* |
|---|---|---|
| `30-01` | Trim / Çıta / Garnish | %11,8 |
| `30-02` | Cam | %6,9 |
| `30-03` | Ayna | %6,5 |
| `30-04` | Menteşe / Kilit | %2,5 |
| `30-05` | Conta / Sızdırmazlık elemanı | %2,2 |
| `30-06` | Logo / Amblem | %1,9 |
| `30-07` | İç mekân (koltuk, konsol, direksiyon, panel, döşeme) | %3,0 |

### Elektrik (4)
| Kod | Parça | Veri* |
|---|---|---|
| `40-01` | Far / Stop / Aydınlatma | %1,4 |
| `40-02` | Kablo / Soket / Tesisat | <%1 |
| `40-03` | Şarj sistemi / Yüksek voltaj | <%1 |
| `40-04` | Klima / Fan | <%1 |

### Diğer
| Kod | Parça | Not |
|---|---|---|
| `99-99` | **Diğer** | Serbest metin açıklama zorunlu; kalite periyodik gözden geçirir |

\* Eski 1619 kayıtta geçiş sıklığı.

---

## 2. Kusur tipi (10)

Parçadan bağımsız, her zaman aynı liste. Kategoriler bilerek **kaba** tutuldu —
iki farklı operatörün aynı kusurda aynı seçeneği bulması için.

| Kod | Kusur tipi | Kapsadıkları | Veri |
|---|---|---|---|
| `01` | Boşluk / hizasızlık | Kenar boşluğu eşit değil, kademe, açıklık, merkezleme kaçıklığı, ayar gerekli | ~%27 |
| `02` | Yüzey / boya hatası | Boya akması, kaçağı, boyasız bölge, ton farkı, matlık, leke, toz yapışması, vernik | ~%20 |
| `03` | Çizik / darbe / hasar | Çizik, darbe, göçük, ezik | ~%6 |
| `04` | Deformasyon | Yamulma, form bozukluğu, çöküntü | ~%10 |
| `05` | Eksik / yanlış parça | Parça eksik, işlem yapılmamış, yanlış parça, hatalı imalat | ~%8 |
| `06` | Bağlantı / tork sorunu | Tork alınmamış, diş sıyırma, gevşek, kaynak hatası, çapak | ~%8 |
| `07` | Sızdırma | Su birikimi, hortum kaçırması, sızdırmazlık | <%2 |
| `08` | Fonksiyon çalışmıyor | Kasıyor, geçmiyor, çalışmıyor, arızalı | ~%2 |
| `09` | Ses / titreşim | Gıcırtı, tıkırtı | <%1 |
| `99` | **Diğer** | Serbest metin zorunlu | — |

### Neden bu kadar kaba?

Eski veride "boya kaçağı", "boya akması", "ton farkı", "matlık" ayrı ayrı
geçiyor — ama bunların hangisi olduğu iki farklı operatöre sorulduğunda farklı
cevap alır. Hepsini `02 — Yüzey / boya hatası` altında topladık. Detay zaten
**açıklama alanında** duruyor; sınıflandırmanın işi trend göstermek, kusuru
tarif etmek değil.

---

## 3. Sorumlu süreç (otomatik atama)

Kusur tipinden türetilir. Kalite tarafından düzeltilebilir.

| Kusur tipi | Varsayılan süreç |
|---|---|
| Boşluk / hizasızlık | Montaj |
| Yüzey / boya hatası | Boya |
| Çizik / darbe / hasar | Montaj |
| Deformasyon | Gövde / Kaynak |
| Eksik / yanlış parça | Montaj |
| Bağlantı / tork sorunu | Montaj |
| Sızdırma | Montaj |
| Fonksiyon çalışmıyor | Elektrik |
| Ses / titreşim | Montaj |
| Diğer | Atanmaz — kalite belirler |

---

## 4. Hata kodu formatı

Sayısal ve sabit: `PARÇA-KUSUR` → örnek `10-01-01`

- İlk iki hane: parça grubu (10 Body, 20 Şasi, 30 Trim, 40 Elektrik)
- Sonraki iki hane: parça
- Son iki hane: kusur tipi

Kod dile ve isme bağlı değil. "Gövde"yi ileride "Kaynakhane" diye yeniden
adlandırsan bile kod aynı kalır.

---

## Örnek girişler

| Senaryo | Parça | Kusur | Kod | Türetilen |
|---|---|---|---|---|
| Cam merkezleme kaçıklığından kasıyor | Cam | Boşluk / hizasızlık | `30-02-01` | Trim · Montaj |
| Kapı menteşe montajında boya deforme oldu | Kapı | Yüzey / boya hatası | `10-01-02` | Body · Boya |
| C-Pillar perçin bölgesi zımparasız boyanmış | C-Pillar | Yüzey / boya hatası | `10-03-02` | Body · Boya |
| Süspansiyon kulelerinde torklama yapılmamış | Şasi / Süspansiyon | Bağlantı / tork sorunu | `20-01-06` | Şasi · Montaj |
| Bagaj kapağı kenar boşlukları dengesiz | Bagaj kapağı | Boşluk / hizasızlık | `10-02-01` | Body · Montaj |
| Far içinde buğu var | Far / Stop | Fonksiyon çalışmıyor | `40-01-08` | Elektrik · Elektrik |
| Araç tabanında su birikimi | Şasi / Süspansiyon | Sızdırma | `20-01-07` | Şasi · Montaj |

---

## Birlikte karar verilmesi gerekenler

1. **Parça adları sahada kullanılan adlar mı?** Özellikle Türkçe/İngilizce
   karışıklığı: Tailgate mi bagaj kapağı mı, Doghouse mu başka bir ad mı,
   C-Pillar mı orta direk mi?
2. **Elektrik grubu yeterli mi?** Eski veride neredeyse hiç kayıt yok ama
   üretim arttıkça artacak. Şimdiden bölmek gerekir mi?
3. **İç mekân tek madde olarak kalsın mı?** Şu an %3; koltuk/konsol/direksiyon
   ayrı ayrı istenirse bölünebilir.
4. **Sorumlu süreç atamaları doğru mu?** Örneğin "çizik" varsayılan olarak
   Montaj'a atanıyor — sizde boya sonrası taşımada mı oluşuyor, montajda mı?
5. **Şiddet zorunlu kalsın mı?** Eski sistemde kayıtların %28'i boştu; yeni
   sistemde zorunlu.

---

## Ek olarak yapılması gerekenler

**Issue düzenlenebilir olmalı.** Yanlış parça/kusur seçimi kaçınılmaz.
Bildiren kişi kısa süre içinde, kalite ise her zaman düzeltebilmeli.
Düzeltme audit'e yazılmalı (kim, ne zaman, neyi değiştirdi).

**"Diğer" kayıtları izlenmeli.** Kalite periyodik olarak `99` seçilen
kayıtlara bakıp tekrar edenleri katalogla eklemeli. Katalog böyle büyür.

**Eski 1619 kayıt geriye dönük kodlanabilir.** Bu analizdeki kelime
eşleştirmesiyle otomatik ön atama yapılıp kalite tarafından gözden
geçirilebilir. İsteğe bağlı, ayrı bir iş.
