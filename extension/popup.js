import {visibleMedia,downloadableMedia} from './inspect.js';
const $ = selector => document.querySelector(selector);
let tabId;
async function scan() {
  $('#scan').disabled = true;
  $('#status').textContent = 'Sayfa ve ağ kaynakları taranıyor…';
  $('#list').replaceChildren();
  $('#empty').hidden = true;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    tabId = tab?.id;
    const result = await chrome.runtime.sendMessage({type:'scan',tabId});
    if (result.error) throw new Error(result.error);
    const items = result.items.filter(visibleMedia);
    $('#count').textContent = `${items.length} video kaynağı bulundu`;
    const d = result.diagnostics || {};
    const notes = ['Boyutu bilinen 10 MB altı dosyalar gizlenir.'];
    if (d.small) notes.push(`${d.small} küçük kaynak gizlendi.`);
    if (d.unknown) notes.push(`${d.unknown} kaynak/akışın toplam boyutu henüz bilinmiyor.`);
    if (d.blobCount) notes.push('Blob oynatıcı bulundu; videoyu oynatıp tekrar tarayın.');
    if (d.unchecked) notes.push('Tarama sınırına ulaşıldı; kalanlar için yeniden tarayın.');
    if (d.pageDrm || d.protected?.length) notes.push(`DRM/şifreli medya işareti: ${[...new Set(d.protected || [])].join(', ') || 'EME'}. Koruma aşma desteklenmiyor.`);
    $('#diagnostics').textContent = notes.join(' ');
    $('#status').textContent = result.warning || '';
    $('#empty').hidden = items.length > 0;
    for (const item of items) {
      const card = $('#item').content.cloneNode(true);
      const url = new URL(item.url);
      card.querySelector('.format').textContent = item.format === 'stream' ? 'Akış' : item.format;
      card.querySelector('.source').textContent = `${item.format === 'stream' ? 'Akış · toplam boyut bilinmiyor' : Number.isSafeInteger(item.bytes) ? (item.bytes / 1000000).toFixed(1) + ' MB' : 'Boyut bilinmiyor'} · ${item.source}`;
      let name = url.pathname.split('/').pop() || 'Video';
      try { name = decodeURIComponent(name); } catch {}
      card.querySelector('.name').textContent = name;
      card.querySelector('.host').textContent = url.hostname;
      const button = card.querySelector('button');
      if (item.drm) {
        button.disabled = true;
        button.textContent = 'DRM/koruma işareti · indirilemiyor';
      } else if (!downloadableMedia(item)) {
        button.textContent = '↓ Yardımcıyla indir';
        button.addEventListener('click', () => nativeDownload(item.url, button));
      } else button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const response = await chrome.runtime.sendMessage({type:'download',tabId,url:item.url});
          if (response.error) throw new Error(response.error);
          $('#status').textContent = 'İndirme isteği gönderildi. Durumu Chrome İndirilenler’den izleyebilirsiniz.';
        } catch (error) { $('#status').textContent = error.message; }
        finally { button.disabled = false; }
      });
      $('#list').append(card);
    }
  } catch (error) {
    $('#count').textContent = 'Bu sayfa taranamadı';
    $('#status').textContent = error.message;
  } finally { $('#scan').disabled = false; }
}
$('#scan').addEventListener('click', scan);
scan();

async function nativeDownload(url, button) {
  button.disabled = true;
  $('#status').textContent = 'Yardımcı indiriyor… Dosya Downloads/Indiren klasörüne kaydedilecek.';
  try {
    const response = await chrome.runtime.sendMessage({type:'native',tabId,url});
    if (response.error) throw new Error(response.error);
    $('#status').textContent = response.message;
  } catch (error) { $('#status').textContent = error.message; }
  finally { button.disabled = false; }
}
$('#page-download').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!/^https?:/.test(tab?.url || '')) { $('#status').textContent = 'Normal bir web sayfası açın.'; return; }
  tabId = tab.id;
  await nativeDownload(tab.url, $('#page-download'));
});
