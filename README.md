# İndiren · Chrome video bulucu

Sayfadaki video öğelerini, bağlantıları ve video ağ yanıtlarını algılayan Manifest V3 Chrome eklentisi. Arayüz Türkçedir. Chrome 110+ gerekir.

## 0.3.0: akışların yanlışlıkla gizlenmesini düzeltme

- **Boyutu bilinen ve 10.000.000 bayttan (10 MB) küçük olan dosyalar gizlenir.** HLS/DASH akışları ve boyutu bilinmeyen video kaynakları görünür kalır; toplam boyutun bilinmediği açıkça yazılır. Önceki 0.2.0 sürümü boyutu bilinmeyen kaynakları da gizleyerek bulunan akışları listeden çıkarıyordu. Algılama ile doğrudan indirilebilirlik artık ayrı kontrol edilir.
- `206 Partial Content` yanıtında parça boyutu yerine `Content-Range` toplamı okunur. Sıkıştırılmış yanıtların aktarım boyutu tam video boyutu sayılmaz.
- Gerekirse HEAD, ardından `Range: bytes=0-63` isteğiyle boyut kontrolü yapılır. Sunucu Range'i yok saysa da gövde okuması başlangıçtan sonra iptal edilir. İndirme öncesinde MP4/WebM/OGG/AVI/FLV/MPEG/TS gibi kapsayıcıların başlangıç imzası kontrol edilir; HTML/JSON hata yanıtları reddedilir. Bu imza kontrolü tam dosyanın bozulmadığını garanti etmez.
- Chrome ile başlatılan indirmelerde gerçek indirilen yanıt küçük veya HTML/JSON çıkarsa indirme iptal edilir; tamamlanmış küçük dosya otomatik kaldırılmaya çalışılır. Temizleme başarısızlığı yeniden taramada bildirilir. Bu izleme yerel yardımcı indirmelerini kapsamaz.
- Açılır pencere kapalıyken de video başlangıcı, kaynak değişiklikleri ve performans kayıtları gözlenir. Uzantısız video adresleri, sorgu parametresinde dosya/akış türü ve sayfanın satır içi oynatıcı yapılandırmasındaki düz video URL'leri tanınır. Sayfa JavaScript'i çalıştırılmaz. Erişilebilir iframe'lere ek olarak açık shadow DOM, `data-video-*` alanları, Open Graph meta verisi, JSON-LD ve performans kayıtları taranır. En fazla 100 kaynak saklanır; her taramada en fazla 24 kaynak kontrol edilir, en fazla 6 paralel istek kullanılır; istek başına 4 saniye zaman aşımı vardır. Yeni belirsiz kaynaklar için yeniden tarama yapılabilir.
- HLS/DASH manifest dosyasının birkaç KB olması videonun küçük olduğu anlamına gelmez. Manifest boyutu video boyutu sayılmaz. Bu bağlantılar akış olarak listelenir ve yardımcıyla indirilebilir; manifestin kendisi küçük video dosyası gibi kaydedilmez. Boyutu bilinmeyen dosyalar da yardımcıya yönlendirilir; doğrudan Chrome indirmesi için boyut ve video imzası doğrulaması gerekir.
- En fazla 256 KiB manifest metninde Widevine, PlayReady, FairPlay ve genel koruma işaretleri aranır. Tarayıcıdaki `encrypted` olayları ve mevcut `mediaKeys` durumu da raporlanır. Bu yalnızca bir göstergedir: DRM bulunmadığını kesin olarak ispatlamaz, anahtar/lisans almaz ve koruma aşmaz. HLS ana manifestinde görünmeyip alt listelerde bulunan DRM işaretleri kaçabilir. AES-128 tek başına DRM olarak etiketlenmez.

Güncellerken `chrome://extensions` sayfasında eklentinin **Yeniden yükle** düğmesine basın, ardından video sayfasını yenileyip videoyu oynatın. Yeni canlı gözlem dinleyicileri sayfa yenilenmeden eski açık sekmelere eklenmez. Aynı extension klasörünü güncelleyin; eklentiyi kaldırıp farklı klasörden eklemek kimliği değiştirebilir. Yerel yardımcı kodu bu sürümde değişmediğinden EXE'yi tekrar oluşturmak gerekmez.


- MP4, WebM, MOV, OGV, M4V, MKV, AVI, FLV, MPEG, 3GP ve TS dosyalarını doğrudan Chrome ile indirme.
- HLS (`m3u8`) / DASH (`mpd`) akışlarını tespit etme; isteğe bağlı yt-dlp + FFmpeg yardımcısıyla indirme ve birleştirme.
- **Bu sayfayı yardımcıyla indir**: algılanan dosya bulunmasa bile geçerli sayfayı yt-dlp'nin desteklediği site çıkarıcısıyla işleme.
- Yinelenen bağlantıları birleştirme, sekme kapanınca/gezinince kayıtları temizleme.

Her sitedeki her video garanti edilemez. DRM korumaları aşılmaz. `blob:` adresi tek başına indirilebilir dosya değildir; ağdaki asıl akış veya desteklenen site çıkarıcısı gerekir. Oturum çerezleri otomatik aktarılmaz; oturum, referer, süreli URL, CAPTCHA veya site kısıtlamaları nedeniyle indirme başarısız olabilir. Canlı yayınlar sonlanana kadar sürebilir; bu sürümde yardımcı indirmesi için ilerleme/iptal paneli yoktur.

## Chrome'a kurulum

1. `extension/` klasörünü bilgisayarınıza indirin veya `artifacts/indiren-extension.zip` paketini çıkarın.
2. Chrome'da `chrome://extensions` adresine gidin, **Geliştirici modu** seçeneğini açın.
3. **Paketlenmemiş öğe yükle** ile içinde `manifest.json` bulunan klasörü seçin.
4. Bir video sayfasını açın. Eklentiyi sabitleyin ve simgesine basın.
5. Videoyu oynatıp **Yenile** seçeneğine basın. Dosyalar için **Videoyu indir** düğmesini kullanın.

Eklenti kurulduğunda zaten açık olan sayfalardaki eski ağ istekleri görünmeyebilir; sayfayı yenileyip videoyu oynatın. Chrome iç sayfaları ve Chrome Web Mağazası gibi korumalı sayfalar taranamaz. Chrome indirme iletişim kutusu açar; tamamlanma/hata durumunu Chrome İndirilenler'den izleyin. Bazı sunucular dosyayı video yerine hata sayfası olarak döndürebilir.

## HLS/DASH ve site yardımcısı (isteğe bağlı)

Doğrudan dosya indirmek için yardımcı gerekmez. Akış indirmek için Python 3.10+, FFmpeg ve FFprobe gerekir. FFmpeg'i işletim sisteminizin paket yöneticisiyle kurun ve `ffmpeg -version`, `ffprobe -version` komutlarının çalıştığını doğrulayın. Yardımcı Chrome'un Native Messaging protokolünü kullanır; ağda dinleyen bir yerel sunucu açmaz.

### Linux / macOS

Proje klasöründe:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r native/requirements.txt
.venv/bin/python native/install.py EKLENTI_KIMLIGI
```

`EKLENTI_KIMLIGI` yerine `chrome://extensions` sayfasındaki 32 harfli kimliği yazın. Kayıt yalnızca bu eklenti kimliğine izin verir. Sonra eklentide **Yardımcıyla indir** veya **Bu sayfayı yardımcıyla indir** düğmesine basın. Dosyalar `~/Downloads/Indiren` klasörüne kaydedilir. Klasörü, Python ortamını veya eklentiyi taşırsanız kurulum komutunu yeniden çalıştırın. Kurucu Google Chrome içindir; Chromium/Brave gibi tarayıcıların native-host kayıt konumları farklıdır.

### Windows (PowerShell)

Python ve PATH üzerinde FFmpeg/FFprobe kurulu olmalı:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r native\requirements.txt
.\.venv\Scripts\python.exe -m pip install pyinstaller
.\.venv\Scripts\python.exe -m PyInstaller --onefile --collect-all yt_dlp --name indiren-host --distpath native/dist --workpath native/build native/host.py
.\.venv\Scripts\python.exe native/install.py EKLENTI_KIMLIGI --exe native/dist/indiren-host.exe
```

Kurucu geçerli kullanıcıya ait Chrome Native Messaging kayıt anahtarını oluşturur; yönetici izni gerekmez. Windows/macOS kurulumu bu Linux bulut ortamında denenmemiştir.

### Video görünüyor ama yardımcıya erişilemiyorsa (Windows)

Listede `.m3u8` görünmesi video algılamanın çalıştığı anlamına gelir. “Yardımcıya erişilemedi” hatası FFmpeg indirmesinden önce Chrome ile yerel EXE arasındaki bağlantıda oluşur. 0.3.1 sürümü Chrome'un hata ayrıntısını ve eklentinin güncel kimliğini gösterir:

- `not found`: native-host kaydı veya manifest dosyası bulunamadı.
- `forbidden`: kayıttaki `allowed_origins` mevcut eklenti kimliğine izin vermiyor.
- `Failed to start`: EXE yolu/dosyası veya başlatılması kontrol edilmeli.
- `exited`: süreç yanıt vermeden kapandı; EXE/protokol kontrol edilmeli.

Eklenti klasörünü değiştirmek veya kaldırıp yeniden eklemek kimliği değiştirebilir. Mevcut EXE'yi yeniden oluşturmadan güncel kimlikle kaydı yenileyebilirsiniz. Proje kökünde PowerShell:

```powershell
$eklentiKimligi = Read-Host "chrome://extensions sayfasindaki guncel eklenti kimligi"
.\.venv\Scripts\python.exe native/install.py $eklentiKimligi --exe native/dist/indiren-host.exe
```

Kaydı ve dosyanın varlığını kontrol etmek için (özel video bağlantısı gerekmez):

```powershell
$kayit = Get-Content "$env:LOCALAPPDATA\Indiren\com.indiren.downloader.json" -Raw | ConvertFrom-Json
$kayit.allowed_origins
Test-Path -LiteralPath $kayit.path
```

`allowed_origins` içindeki kimlik Chrome'daki güncel kimlikle aynı olmalı; `Test-Path` sonucu `True` olmalıdır. Ardından Chrome'u tamamen kapatıp yeniden açın. `ffmpeg -version` hatası farklı bir aşamadır: FFmpeg'in kurulu olması Native Messaging kaydının doğru olduğu anlamına gelmez.

### Yardımcıyı kaldırma

Linux'ta `~/.config/google-chrome/NativeMessagingHosts/com.indiren.downloader.json`, macOS'ta `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.indiren.downloader.json` dosyasını kaldırın. Windows'ta `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.indiren.downloader` anahtarını kaldırın. Sonra proje klasörünü silebilirsiniz; indirilmiş videolar ayrı tutulur.

## İzinler ve gizlilik

- HTTP/HTTPS site erişimi ve `webRequest`: sayfalardaki video yanıtlarını gözlemlemek için. webRequest üzerinden istek/yanıt gövdeleri okunmaz. Ayrı boyut kontrolü isteklerinde video başlangıcı ve sınırlı manifest metni okunabilir; bu istekler Chrome oturum çerezlerini kullanabilir. Çerezler yerel yardımcıya aktarılmaz.
- `activeTab` / `scripting`: kullanıcı eklentiyi açınca sekme ve erişilebilir çerçevelerde video/bağlantı taramak için.
- `downloads`: kullanıcının seçtiği dosyayı indirmek için.
- `storage`: en fazla 100 kaynak/sekme, yalnızca tarayıcı oturumunda tutulur. İmzalı bağlantılar erişim bilgisi içerebilir; harici analitik veya sunucuya gönderilmez.
- `nativeMessaging`: kullanıcının seçtiği kaynak/sayfa URL'sini kendi bilgisayarındaki yardımcıya göndermek için. Yardımcı ilgili video sitesine bağlanır.

Yalnızca indirme hakkınız olan içeriklerde kullanın. Chrome mağazasına yayın yapılmamıştır.

## Geliştirme ve doğrulama

Node.js 20+ gerekir. Eklentinin kendisi bağımlılıksızdır, derleme gerektirmez. Playwright yalnızca geliştirme testleri içindir.

```sh
npm ci --cache /tmp/indiren-npm-cache
npm test
npm run check
npm run test:ui
python3 tests/prepare_fixture.py
.venv/bin/python tests/native_test.py
```

`test:ui` sistem Chromium'unu kullanır (`CHROME_PATH` ile değiştirilebilir), Chrome API'si simüle edilir. Gerçek DOM, shadow DOM, JSON-LD ve meta taraması; canlı kaynak gözlemi, HLS/DASH ve bilinmeyen boyutun görünürlüğü, 10 MB filtresi, DRM gösterimi, indirme düğmeleri, hata/boş durum ve HTML enjeksiyonuna karşı metin gösterimi kontrol edilir. HTTP testleri yerel sunucuyla HEAD/Range, 206 toplam boyutu, sahte HTML/video yanıtları ve örnek DRM manifestlerini doğrular; ticari DRM servislerinde test yapılmamıştır. Native test gerçek yerel HLS videosunu indirir ve FFprobe ile doğrular.

```sh
npm run test:extension
```

Bu ayrı bütünleştirme testi eklenti yüklemeye izin veren Chromium gerektirir. Buradaki yönetilen Chromium eklenti yüklemeyi yönetici politikasıyla engellediğinden bütünleştirme testi **geçmedi**; gerçek Chrome'a kurulum ve native-host kaydı kullanıcı bilgisayarında ayrıca doğrulanmalıdır. Bu kısıt UI/birim testlerini ve gerçek HLS indirme testini etkilemez.

## Küçük dosyalar neden görünüyordu?

Önceki sürüm uzantısı veya video MIME türü uygun olan her URL'yi boyut kontrolü yapmadan listeliyordu. Bu, küçük önizleme/akış parçalarının aday olmasına izin veriyordu. Ayrıca süresi dolan bir bağlantı indirme anında HTML/JSON yanıtı verebilir. Yeni filtre, imza kontrolü ve Chrome indirme izlemesi bu durumlar için eklendi. Belirli bir site adresi paylaşılmadığı için kullanıcının sitesinde birebir doğrulama yapılmadı.

Teknik başvuru: [Content-Range](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range), [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads), [Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media/).
