# İndiren · Chrome video bulucu

Sayfadaki video öğelerini, bağlantıları ve video ağ yanıtlarını algılayan Manifest V3 Chrome eklentisi. Arayüz Türkçedir.

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
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r native\requirements.txt
.\.venv\Scripts\python.exe -m pip install pyinstaller
.\.venv\Scripts\python.exe -m PyInstaller --onefile --collect-all yt_dlp --name indiren-host --distpath native/dist --workpath native/build native/host.py
.\.venv\Scripts\python.exe native/install.py EKLENTI_KIMLIGI --exe native/dist/indiren-host.exe
```

Kurucu geçerli kullanıcıya ait Chrome Native Messaging kayıt anahtarını oluşturur; yönetici izni gerekmez. Windows/macOS kurulumu bu Linux bulut ortamında denenmemiştir.

### Yardımcıyı kaldırma

Linux'ta `~/.config/google-chrome/NativeMessagingHosts/com.indiren.downloader.json`, macOS'ta `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.indiren.downloader.json` dosyasını kaldırın. Windows'ta `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.indiren.downloader` anahtarını kaldırın. Sonra proje klasörünü silebilirsiniz; indirilmiş videolar ayrı tutulur.

## İzinler ve gizlilik

- HTTP/HTTPS site erişimi ve `webRequest`: sayfalardaki video yanıtlarını gözlemlemek için. İçerik veya istek gövdesi okunmaz.
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

`test:ui` sistem Chromium'unu kullanır (`CHROME_PATH` ile değiştirilebilir), Chrome API'si simüle edilir. Liste, indirme düğmeleri, hata/boş durum ve HTML enjeksiyonuna karşı metin gösterimi kontrol edilir. Native test gerçek yerel HLS videosunu indirir ve FFprobe ile doğrular.

```sh
npm run test:extension
```

Bu ayrı bütünleştirme testi eklenti yüklemeye izin veren Chromium gerektirir. Buradaki yönetilen Chromium eklenti yüklemeyi yönetici politikasıyla engellediğinden bütünleştirme testi **geçmedi**; gerçek Chrome'a kurulum ve native-host kaydı kullanıcı bilgisayarında ayrıca doğrulanmalıdır. Bu kısıt UI/birim testlerini ve gerçek HLS indirme testini etkilemez.
