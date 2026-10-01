# KAREA — Geliştirme Özeti

Projenin temeli atıldı: planlama belgeleri hazırlandı; sunucu uygulaması, web yönetim paneli ve mobil operatör uygulamasının iskeleti kuruldu.
İlk veritabanı kuruldu; üretim aşamaları, kontrol noktaları, kontrol listesi şablonları ve kullanıcılar başlangıç verisi olarak yüklendi.
Kullanıcılar şifreyle giriş yapabiliyor; şifreler açık metin olarak değil, geri çözülemeyen biçimde saklanıyor.
Araç, hata ve kontrol listesi iş kuralları yazıldı; uyarı veren ve işlemi durduran kapılar testlerle güvence altına alındı.
Her işlem yalnızca yetkili rollere açılacak şekilde erişim denetimi kuruldu.
Hatalar için kalite onayı aşaması ve onay bekleyen hataların listelendiği kalite kuyruğu eklendi; onay yetkisi yöneticiye verildi.
Her durum değişikliğinde işlemi kimin yaptığı kayda geçiyor; durum ve kaydı birlikte yazıldığı için yarım kayıt oluşmuyor.
Web yönetim paneli kuruldu: giriş, ana sayfa, araç listesi ve detayı, hatalar, şablonlar, kullanıcılar, ayarlar ve PDF çıktılı grafik analiz sayfaları.
Sisteme yalnızca izin verilen web adreslerinden erişilebiliyor.
Mobil operatör uygulaması kuruldu: araç listesi, istasyon kontrolleri, kontrol listeleri, hata görüntüleme ve açık hataların genel durum ekranı.
Mobil uygulama altyapısı Expo 52'den 54'e yükseltildi.
Yetki yapısı rol adlarından ayrıştırılıp izin tablosuna taşındı; yeni rol tanımlamak yazılım değişikliği gerektirmiyor.
Üretim aşamaları sahadaki yapıya uygun olarak 8 istasyon ve 64 istasyon adımı şeklinde yeniden kurgulandı.
Hat sonu kontrolü tek kapıdan üç aşamalı bir iş akışına dönüştürüldü.
Test kontrol listesi üçüncü kontrol listesi olarak eklendi.
Hatalar için ikinci kapanış durumu olarak "şartlı onay" eklendi.
Hatalara ve kontrol maddelerine fotoğraf eklenebiliyor; fotoğraflar sunucuda saklanıyor.
Araçlar kısa fabrika numarasıyla da aranabilir hale getirildi.
Web panelinde araçlar için üç aşamalı hat sonu sekmesi, test kontrol listesi ve fotoğraf galerileri eklendi.
Mobilde operatöre yalnızca aracın bulunduğu hat sonu aşamasının maddeleri gösteriliyor; test kontrol listesi ekranı eklendi.
Operatörler mobilden hata fotoğrafı yükleyebiliyor.
Evrak onayının, iş akışı kaydı oluşmadan çalışıp başarısız olması hatası giderildi.
Geliştirme ve denemeler için her yaşam döngüsü durumunu kapsayan 18 örnek araç hazırlandı.
Aracın kontrol listeleri web panelinden doldurulabiliyor.
Yeni görsel tasarım dili ve şiddet göstergeleri uygulandı.
Depo aşaması, fabrika aşaması tamamlanmadan başlatılamıyor; kural veritabanında da korunuyor.
Tüm hatalar tek listede görülebiliyor ve şasi numarasına göre süzülebiliyor.
Araç detayına hata paneli eklendi; kalite kuyruğu işlemleri buradan yapılabiliyor.
Web paneli telefon, tablet ve bilgisayar ekranına uyumlu hale getirildi.
Kontrol listesinden bağımsız elle hata bildirimi web ve mobile eklendi; "Hata" ve "Tamir gerekiyor" tipleri tanımlandı.
Mobil uygulamada alt sekmeler yerine yan menüye geçildi; ana sayfa araç arama, hata bildirme ve durum özetini bir araya getirdi.
Hata kapatılırken çözüm açıklaması zorunlu hale getirildi; mobilde çözüm açıklaması ve fotoğrafı formu eklendi.
Mobildeki hata listesine araç, şiddet ve durum filtreleri eklendi.
Kısa fabrika numarası aramadan ve listelerden kaldırıldı; araçların tek kimliği şasi numarası oldu.
Hata listesinde fotoğraf küçük resmi ve oluşturma tarihi gösteriliyor, liste en yeniden eskiye sıralanıyor; detaydaki fotoğraf tam ekran açılabiliyor.
Hata listeleri yazarken anında süzülüyor; listedeki her karttan detay açılabiliyor.
Mobil araç listesine durum filtreleri eklendi.
Araç listeleri en yeni araçtan başlayarak sıralanıyor.
Web ana sayfası canlı verilerle çalışan görsel bir gösterge paneli olarak yeniden tasarlandı; kartlar tıklanınca ilgili hata listesini süzülmüş olarak açıyor.
Hatanın durum geçmişi (kim, ne zaman, hangi duruma aldı) web ve mobil detayda gösteriliyor.
Hata durumları Türkçe adlarla gösteriliyor; şartlı onay rengi diğer durumlardan ayrıldı.
Web hata listesine şiddet filtresi ve bildiren kişiye göre arama eklendi.
Ana sayfaya kalite onayı bekleyen hatalar kartı eklendi.
Ana sayfa istatistiklerinin oturum hazır olmadan yüklenip boş görünmesi hatası giderildi.
Uygulama açılışındaki hatalar kayda geçiyor; yanıt vermeyen istekler süre sonunda kesiliyor ve ekran takılı kalmıyor.
Hata listelerinde bildiren kişinin adı gösteriliyor ve adıyla arama yapılabiliyor (web ve mobil).
Henüz üretime girmemiş araçlar "Planlandı" durumuyla toplu olarak yüklenebiliyor; listelerde gizli, hata bildiriminde aranabilir.
Fotoğraflar araç bazında da ilişkilendiriliyor; araç detayında aracın tüm fotoğrafları görülebiliyor.
Hata listesindeki fotoğraflar küçük boyutlu kopyalardan yükleniyor.
Planlanan araçların kontrol kayıtları baştan oluşturuluyor; araç hatta girdiğinde listeler hazır.
Analiz sayfası süzülebilir hale getirildi, sevk öncesi uyarılar eklendi; göstergelerden ilgili araç listesine geçilebiliyor.
Analizdeki açık hata sayısının yanlış durumları da sayması düzeltildi.
Pasif kullanıcı veya pasif rol ile giriş yapılması engellendi.
Son yöneticinin pasife alınması ve yöneticinin kendi erişimini kapatması engellendi.
İzinler işlem bazında ayrıntılandırıldı; Kalite ve Montaj rolleri tanımlandı.
Web ve mobil arayüz, kullanıcının sahip olduğu izinlere göre şekilleniyor.
Rollerin hangi izinlere sahip olduğu web panelinden bir tablo üzerinde düzenlenebiliyor.
Tarayıcıda açılamayan iPhone fotoğraf biçimi reddediliyor; mobil uygulama fotoğrafları yüklemeden önce uygun biçime çeviriyor.
Hata listesi, süzülmüş haliyle tablo dosyası ve fotoğraflı arşiv olarak indirilebiliyor.
iPhone'da çok satırlı metin alanlarına klavyeyi kapatan "Bitti" çubuğu eklendi; boş bir alana dokununca klavye kapanıyor.
Kontrol listesi şablon maddeleri web panelinden eklenip düzenlenebiliyor, silinebiliyor ve sıralanabiliyor; kullanımdaki madde silinemiyor.
Hatalar tipe göre süzülebiliyor ve hata tipi detayda gösteriliyor.
KAREA logosu ve kurumsal turuncu renk web paneline ve mobil uygulamaya uygulandı; web'de yan menü ve üst çubuk kaydırma sırasında sabit kalıyor.
Hata detayındaki bilgilerin sırası ve adları web ile mobilde eşitlendi; mobil detay üç ayrı bölüme ayrıldı.
Kalan İngilizce arayüz metinleri Türkçeleştirildi; roller okunur adlarıyla gösteriliyor.
Hata filtreleri renkli seçim düğmelerine dönüştürüldü ve erişilebilir yazı kontrastına getirildi.
Web'de hata detayı, tıklanan satırın hemen altında açılıyor.
İstasyon, kontrol listesi ve durum işlemlerinin altında işlemi kimin ve ne zaman yaptığı gösteriliyor.
Depodan çıkış onayıyla hat sonu tamamlanıyor ve araç sevk ediliyor.
Fabrika çıkışı düğmesi, hat sonu maddeleri tamamlanana kadar pasif görünüyor.
Mobildeki hat sonu listesinden evrak adımı kaldırıldı.
Yönetici, e-posta sunucusu olmadan kullanıcı oluşturup şifre sıfırlayabiliyor; kullanıcı ilk girişte şifresini değiştirmek zorunda, şifre güç kuralları ve şirket e-posta alan adı denetimi uygulanıyor.
Hiç kullanılmamış kullanıcı silinebiliyor; iş kaydı olan kullanıcı silinemiyor, bunun yerine pasife alınması öneriliyor.
Hat sonu durum değişiklikleri kayda geçiyor; geri alınan onayların eski damgaları temizleniyor.
Uygulama Türkçe ve İngilizce iki dilli hale getirildi; dil web'de ayarlardan, mobilde profilden seçiliyor ve hatırlanıyor.
Hat sonu akışı fabrika çıkışı, depo onayı ve teslim adımlarıyla yeniden kuruldu; "Teslim edildi" durumu eklendi, işlemler koşullar sağlanana kadar pasif görünüyor.
Fabrika çıkışı, test ve sevkiyat kontrol listeleri tamamlanmadan yapılamıyor.
Kontrol listesinin tamamlanması aracın durumunu kendiliğinden değiştirmiyor; depo onayı aracı depoda tutuyor.
Kontrol listeleri, araç listesi, hata listesi ve hata detayı için yazdırma çıktısı eklendi.
Araç listesinde hat sonu aşaması gösteriliyor ve aşamaya göre süzülebiliyor; durum filtreleri web ve mobilde eşitlendi.
Web ve mobil giriş ekranları yeniden tasarlandı; web'e "beni hatırla" seçeneği eklendi.
Ana sayfa özet tablolar, son hareketler ve katlanabilir yan menüyle yeniden tasarlandı.
"Beni hatırla" seçeneğinin sayfa yenilenince düşmesi hatası giderildi.
Fabrika genelindeki tüm işlemlerin izlenebildiği "Aktivite" sayfası eklendi.
Fabrika çıkışı, istasyon adımları tamamlanmadan yapılamıyor.
Mobilde oturum hatırlanıyor; yan menüye simgeler eklendi.
Analiz sayfası dönem karşılaştırmalı göstergeler, grafikler ve dışa aktarmayla yeniden tasarlandı.
Sevk edilen araç sayılarının yanlış tarihten hesaplanması düzeltildi.
Analiz sayfasına ilk seferde doğru oranı, birden fazla şasi seçimi ve aşama grafikleri eklendi.
Analizde iki tarih aralığı karşılaştırılabiliyor; sevk edilen araçlar listesi ve analiz yazdırma çıktısı eklendi.
Koyu temadaki okunurluk sorunları ve giriş ekranı arka planı düzeltildi.
Şablona eklenen veya pasife alınan madde, henüz başlamamış araçlara otomatik dağıtılıyor; değişiklikten önce etkilenecek araç sayısı gösteriliyor.
Tarayıcının standart onay pencereleri yerine uygulamanın kendi onay pencereleri kullanılıyor.
Araç durumu yalnızca ileri gidebiliyor; geriye dönüş veritabanı düzeyinde engellendi, yalnızca geliştirme ortamında veritabanı yöneticisi geri alabiliyor.
Serbest durum değiştirme kaldırıldı; yerine sebep belirterek "beklemeye al / beklemeden çıkar" işlemleri geldi.
Şablon maddesi veya kullanıcı silme engellendiğinde kullanıcıya açık uyarı gösteriliyor.
Hat sonu oranları gerçek kontrol kayıtlarından hesaplanıyor; önceden varsayımla hesaplandığı için yanlış çıkıyordu.
Mobil uygulama altyapısı Expo 57'ye yükseltildi; fotoğraf yükleme yeni sürüme uyarlandı.
Araç yaşam döngüsü etiketleri ve renkleri web ve mobilde ortak tanımdan geliyor; mobil listede de aynı durum gösteriliyor.
Mobil araç detayından araç beklemeye alınabiliyor ve beklemeden çıkarılabiliyor.
Analiz yazdırma çıktısı ayrı bir belge düzeniyle yeniden kuruldu.
Şablona madde eklerken hangi araçlara dağıtılacağı seçilebiliyor; maddenin ulaşmadığı araçlar listeleniyor.
Analiz sayfası fabrika TV ekranında okunacak şekilde yeniden sıralandı ve kendiliğinden yenileniyor.
Arayüzdeki "Şube" ifadesi "Fabrika" olarak değiştirildi.
Kalite onayı bir onay penceresi istiyor ve 15 saniye içinde geri alınabiliyor (web ve mobil).
Eski sistemdeki 1619 hata kaydının analiziyle dört eksenli hata kodu kataloğu (bölge, parça, kusur tipi, sorumlu süreç) kuruldu ve yönetim sayfası eklendi.
Hata bildirirken parça ve kusur tipi seçimi zorunlu, bölge ve hata kodu sistem tarafından türetiliyor; web paneline de hata bildirme formu eklendi.
Parça araması bölgeden bağımsız çalışıyor; operatör tüm bölgelerde arayabiliyor.
Hata sınıflandırması kartlarda, yazdırma çıktılarında ve dışa aktarılan dosyalarda gösteriliyor.
Hatalar bölge, parça ve kusur tipine göre süzülebiliyor; birden fazla parça birlikte seçilebiliyor.
Kalite ekibi yanlış sınıflandırmayı düzeltebiliyor; düzeltme kayda geçiyor.
"Diğer" seçilerek yazılan serbest metinler gözden geçirilip kataloğa yeni parça veya kusur tipi olarak alınabiliyor.
Analiz sayfasına bölge, parça, kusur tipi dağılımları ve tekrar analizi eklendi; dışa aktarma ve yazdırmaya da yansıdı.
Kontrol maddesinin metni ilk işaretlendiği anda kayda sabitleniyor; şablon sonradan değişse de geçmiş kayıt o günkü metni gösteriyor.
Parça ve kusur tipi adları hataya kopyalanıyor; katalog değişse de eski hatalar o günkü adları gösteriyor.
Katalogda kullanılmakta olan bir öğenin adı değiştirilirken uyarı veriliyor.
Mobilde sabit bölümlere girmeyen kontrol maddelerinin görünmemesi hatası giderildi.
Belirsiz olan varsayılan sorumlu süreç atamaları temizlendi; süreç seçilmeden de sınıflandırma kaydedilebiliyor.
Analizdeki kapsam göstergesi "katalog yeterliliği" olarak yeniden tanımlandı.
Veritabanı güncellemeleri yarıda kalsa bile güvenle yeniden çalıştırılabiliyor; tam kurulum ve geri alma döngüsü bir doğrulama betiğiyle sınandı.
Sevk kapıları şablondaki güncel maddelere göre değerlendiriliyor; önceden hiç oluşturulmamış maddeler sessizce "tamam" sayılıyordu.
Hiçbir araca ulaşmayacak madde ekleme veya yeniden açma artık reddediliyor; önceden sessizce başarılı görünüyordu.
Eksik kalmış kontrol kayıtları teslim edilmiş araçlar hariç geriye dönük tamamlandı.
Hat sonu kapılarının durumu tek yerde hesaplanıyor; web ve mobil aynı sonucu gösteriyor.
Ana sayfadaki hata istatistikleri hata listesiyle aynı tanımlara bağlandı.
Kontrol listesi bölümleri veriden okunuyor; şablon ekranından maddeye bölüm atanabiliyor.
Her araç tipi için yalnızca bir aktif şablon olabiliyor; araca uygun şablon aracın modeline göre seçiliyor.
Aynı anda madde eklendiğinde madde numaralarının çakışması engellendi.
Aynı hata kaydı iki kez gönderilse bile sistemde tek kayıt oluşuyor.
Mobilde bağlantı yokken girilen hata kaydı fotoğrafıyla birlikte cihazda bekliyor ve bağlantı gelince otomatik gönderiliyor.
Bağlantı sorunu ile sunucunun kaydı reddetmesi ayrıştırıldı; mobil ekranlar bağlantı yokken boş görünmek yerine sakin bir "çevrimdışı" durumu gösteriyor.
Araç listesi ve katalog cihazda saklanıyor; hata bildirimine uygun tüm şasi numaraları çevrimdışı aranabiliyor.
Oturum süresi dolduğunda bekleyen kayıtlar silinmiyor, yeniden girişten sonra otomatik gönderiliyor; "şimdi gönder" ile hemen gönderilebiliyor.
Giriş denemelerine hesap bazlı kademeli kilit getirildi; ortak fabrika ağındaki kullanıcılar birbirini kilitlemesin diye ağ bazlı sınır yalnızca yüksek bir tavan olarak tutuldu, yönetici kilidi açabiliyor.
Var olan ve olmayan kullanıcı, giriş yanıtının süresinden ayırt edilemiyor.
Web hata formu, gönderim başarısız olduğunda girilen bilgileri koruyor.
Aktivite sayfasının şasi numarası olmayan kayıtlarda bozulması giderildi.
Uygulama kayıtları dosyaya yazılıyor ve belirli boyutta döndürülüyor, şifre ve oturum bilgileri bu kayıtlara yazılmıyor; önceden kapanınca kayboluyordu.
Beklenmeyen bir hata tüm sistemi durdurmuyor; yalnızca o işlem hata veriyor.
Her işleme benzersiz bir kod veriliyor; sunucu hatalarında kullanıcı bu kodu kopyalayıp iletebiliyor.
Hata fotoğraflarına erişim giriş yapmaya ve araç görme yetkisine bağlandı; önceden adresi bilen herkes erişebiliyordu.
Eksik veya zayıf güvenlik anahtarıyla sunucu uygulaması başlamıyor.
Fotoğraf yüklemek, ilgili kayda yazma yetkisi gerektiriyor.
Akıştan çıkarılan evrak onayı işlemi kalıcı olarak devre dışı bırakıldı.
Hata açıklamasına 400 karakter sınırı getirildi; kalan karakter sayısı gösteriliyor.
Kullanıcı pasife alındığında, şifresi veya rolü değiştiğinde açık oturumu anında geçersiz oluyor.
Gerçek saha kontrol listesi maddeleri başlangıç verisine alındı; 500 araçlık yükleme ayrı ve bilinçli çalıştırılan bir işleme ayrıldı.
Veritabanı ve yüklenen fotoğrafları birlikte kapsayan yedekleme ve geri yükleme betikleri yazıldı ve ayrı bir veritabanında denendi.
Oturum süresi dolduğunda kullanıcı giriş ekranına yönlendiriliyor; önceden ekran boş veri gösterip sorun yokmuş gibi görünüyordu.
Hata listesi tablo yerine fotoğrafı öne çıkaran kart düzenine geçti; telefonda liste, tablette ve bilgisayarda ızgara olarak diziliyor, hatanın ne kadar süredir açık olduğu kartta görünüyor.
Web'e çözüm açıklamasıyla hata kapatma formu eklendi.
Bozuk görsel dosyaları yüklemede reddediliyor.
Hata listesi 30 saniyede bir sessizce yenileniyor; detaydan listeye dönünce kaydırma konumu ve filtreler korunuyor.
Yeni kritik hata geldiğinde sesli uyarı veriliyor; mobilde bu uyarı isteğe bağlı.
Ekranda görünmeyen fotoğraflar indirilmiyor; ilk açılışta yalnızca görünen kartların fotoğrafları yükleniyor.
Hata listesi sayfa sayfa yükleniyor; bildiren kişi ve tarihe göre arama hızlandırıldı.
Hata listesi kesintisiz kaydırmayla yükleniyor; binlerce kayıtta da akıcı çalışıyor (web ve mobil).
Pasife alınan kontrol maddeleri ana listeden çıkarılıp katlanmış ayrı bir bölümde gösteriliyor.
Filo genelindeki hat sonu sayıları yalnızca aktif maddelerle hesaplanıyor.
Kart zemini ve kenarlıkları erişilebilirlik standardını karşılayacak kontrasta getirildi.
Kartın fotoğraf dışındaki her yeri tıklanınca detay açılıyor.
Hata listesi varsayılan olarak süzülmeden açılıyor; telefonda filtreler katlanabiliyor.
Hata listesi isteğe bağlı olarak fotoğraflarıyla yazdırılabiliyor.
Dışa aktarma ve yazdırma ekranda yüklenmiş kayıtları değil, filtreyle eşleşen tüm kayıtları kapsıyor; önceden büyük listelerde dosya sessizce eksik çıkıyordu.
Şifre saklama yöntemi güçlendirildi; mevcut kullanıcılar bir sonraki girişlerinde fark etmeden güncel yönteme geçiriliyor.
Kolay tahmin edilen şifreler ve kullanıcının adını veya e-postasını içeren şifreler reddediliyor.
Açılır listelerin filtre kutusu içinde kırpılması sorunu giderildi.
Kullanıcıya gösterilen tüm hata mesajları anlaşılır metinlere çevrildi; zaman aşımı, sunucu hatası ve bağlantı yokluğu ayrı mesajlarla gösteriliyor.
Sayfalar yükleme hatasında "kayıt yok" yerine açık bir hata ve yeniden dene seçeneği gösteriyor (ana sayfa, araçlar, aktivite, araç detayı, analiz, hatalar).
Sevk öncesi uyarılar iki dilde ve anlaşılır biçimde gösteriliyor.
Mobil kuyrukta reddedilen kaydın sebebi ham sunucu metni yerine anlaşılır mesajla gösteriliyor.
Şiddet göstergesi renk körü kullanıcılar için de çubuk şekliyle ayırt edilebiliyor.
Araç detayındaki hata kartları yeni köşe düzenine geçti, şiddet yalnızca simgeyle gösteriliyor; istasyon satırlarında ilerleme simge ve etiketle görünüyor.
Karttaki fotoğrafa dokununca hata detayı açılıyor; fotoğraf tam ekran yalnızca detayda ve orijinal boyutunda açılıyor.
Şablona sonradan eklenen madde yalnızca o aşamayı henüz geçmemiş araçlara gidiyor; teslim edilmiş araçlara yeni madde gitmiyor.
Sevk öncesi uyarıda tamamlanmamış istasyon adımları da gösteriliyor; teslim edilmiş araçlarda uyarı gizleniyor.
Aşaması geçilmiş araçlarda artık tamamlanamayacak maddeler kapılardan, filo oranlarından ve depo sıralama kuralından çıkarıldı.
Aşaması kapanmış maddeler iş listesinden ayrılıp katlanmış ayrı bir bölümde gösteriliyor.
Araç ilerleme etiketi neyi saydığını açıkça yazıyor.
Mobil ekranların görsel doğrulaması için kalıcı bir ekran görüntüsü düzeneği kuruldu.
Türkçe arayüzde ham durum adı, kod veya İngilizce teknik terim kalmadı; yenilerinin eklenmesini engelleyen otomatik kontrol eklendi.
Hata kartında şiddet simgesi durum etiketinin altına alındı.
Araç ilerleme yüzdesi tek bir kaynaktan, istasyon adımları ve tüm kontrol listeleriyle birlikte hesaplanıyor; depo maddeleri bitmeden %100 görünmüyor.
Sınıflandırma düzeltmeleri aktivite sayfasında okunur adlarla ve hata geçmişinde gösteriliyor.
Sorumlu süreç, ekip kararı netleşene kadar ekranlardan, çıktılardan ve dışa aktarmalardan gizlendi.
Dışa aktarılan dosyalarda durum, aşama ve şiddet kodları okunur adlara çevrildi.
Hata detayındaki şasi numarasına tıklanınca araç sayfasına gidiliyor (web ve mobil).
Analiz grafiklerindeki uzun etiketler üst üste binmiyor; tek satırda kısaltılarak gösteriliyor.
Katalog yeterliliği kartı netleştirildi; sınıflandırma öncesine ait eski kayıtlar ayrı gösteriliyor.
Pasife alınan bir bölgenin parçaları hata bildiriminde ve aramada seçilemiyor; önceden bölge kapatılsa bile parçaları seçilebiliyordu.
"Diğer" seçeneği kendi bölgesine taşındı; pasife alınması, silinmesi ve kodunun değiştirilmesi engellendi.
Sınıflandırma düzenlenirken yalnızca değişen alanlar denetleniyor; daha önce kaydedilmiş pasif bir değer düzenlemeyi engellemiyor.
Hata filtrelerinde pasif katalog değerleri "(pasif)" etiketiyle listeleniyor; eski hatalar bunlarla da süzülebiliyor.
Hata kodu kataloğunun başlangıç verisi yalnızca eksik kayıtları ekliyor; kalite ekibinin düzenlemeleri artık geri alınmıyor.
Yeni parça eklerken seçilen bölgeye göre sonraki kod otomatik öneriliyor; elle yazılan kodun biçimi denetleniyor.
Aynı bölgede aynı adla ikinci bir parça eklenemiyor; kusur tiplerinde aynı ad hiç tekrarlanamıyor. Büyük-küçük harf ve boşluk farkı ayrı ad sayılmıyor.
Mobil uygulama açıkken katalog 15 dakikada bir tazeleniyor; hata bildirme formunda elle yenileme düğmesi var.
Katalogdan kaldırılmış bir parça yüzünden reddedilen kuyruk kaydı açık sebeple işaretleniyor; operatör sınıflandırmayı düzeltip kaydı fotoğrafı ve açıklamasıyla yeniden gönderebiliyor.
Kontrol listesi, istasyon ve adım başlangıç verileri yalnızca eksik kayıtları ekliyor; maddeler sıralamadan bağımsız kalıcı bir anahtarla eşleştiği için metinler başka maddelere yazılamıyor, düzenlemeler ve pasif durumlar geri alınmıyor.

## Devam eden ve planlanan işler

Sunucu, alan adı, güvenlik sertifikası, yedekleme alanı ve e-posta sunucusu bilgileri bilgi işlemden bekleniyor.
Canlı ortam için başlangıç verisi deneme verisinden ayrılacak ve deneme hesapları temizlenecek.
Güvenlik anahtarları yapılandırma dosyasından sunucunun güvenli alanına taşınacak.
Sunucu uygulaması, kapanınca kendiliğinden yeniden başlayan bir servis olarak çalıştırılacak.
Canlı ortam yedeklemesi otomatik zamanlanacak ve yedekler sunucu dışında saklanacak.
Kalite ekibi hata kodu kataloğundaki parça adlarını saha diliyle karşılaştıracak ve altı kusur tipinin sorumlu süreç atamalarını belirleyecek.
Eski sistemdeki 1619 hata kaydı yeni sisteme aktarılacak.
Kritik hata için anında bildirim gönderilecek.
Hata kayıtlarına yorum ve not eklenebilecek.
Uçtan uca otomatik testler yazılacak.
Dış hata izleme servisi ve merkezi kayıt toplama kurulacak.
Giriş kilidi sayaçları sunucu yeniden başlasa da korunacak şekilde kalıcı hale getirilecek.
Apple geliştirici hesabı alınınca mobil uygulama mağaza üzerinden dağıtılacak.
