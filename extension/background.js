import { classify, filename } from './media.js';
import { totalBytes, inspectResource, visibleMedia } from './inspect.js';
import { scanPage } from './scanner.js';

// Session storage survives service worker suspension, but not browser shutdown.
// Serialize updates to avoid losing simultaneous network discoveries.
let queue = Promise.resolve();
function serial(work) {
  const next = queue.then(work);
  queue = next.catch(() => {});
  return next;
}
const key = tabId => `tab:${tabId}`;
async function read(tabId) { return (await chrome.storage.session.get(key(tabId)))[key(tabId)] || []; }
async function remember(tabId, candidates) {
  const existing = await read(tabId);
  const items = new Map(existing.map(item => [item.url, item]));
  for (const candidate of candidates) {
    const format = classify(candidate.url, candidate.mime);
    if (format) {
      const previous = items.get(candidate.url) || {};
      const bytes = format === 'stream' ? null : candidate.bytes ?? previous.bytes ?? null;
      items.set(candidate.url, {...previous,url:candidate.url,format,source:candidate.source || previous.source,bytes,invalidMedia:candidate.bytes != null ? false : previous.invalidMedia || false});
    }
  }
  await chrome.storage.session.set({[key(tabId)]: [...items.values()].slice(-100)});
}
chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
  const mime = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
  if (!classify(details.url, mime)) return;
  serial(() => remember(details.tabId, [{url:details.url,mime,bytes:totalBytes(details.responseHeaders || [], details.statusCode),source:'Ağ isteği'}])).catch(() => {});
}, {urls:['http://*/*','https://*/*']}, ['responseHeaders']);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') serial(() => chrome.storage.session.remove([key(tabId),`${key(tabId)}:drm`,`${key(tabId)}:downloadWarning`])).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial(() => chrome.storage.session.remove([key(tabId),`${key(tabId)}:drm`,`${key(tabId)}:downloadWarning`])).catch(() => {});
});

async function auditDownload(id) {
  const recordKey = `download:${id}`;
  const record = (await chrome.storage.session.get(recordKey))[recordKey];
  if (!record) return '';
  const [download] = await chrome.downloads.search({id});
  if (!download) return '';
  const size = download.state === 'complete' ? download.fileSize : download.totalBytes;
  const invalid = /^(text\/html|application\/json)(?:;|$)/i.test(download.mime || '');
  if (invalid || (Number.isFinite(size) && size >= 0 && size < 10000000 && (size > 0 || download.state === 'complete'))) {
    let cleaned = true;
    try {
      if (download.state === 'in_progress') await chrome.downloads.cancel(id);
      else if (download.state === 'complete') await chrome.downloads.removeFile(id);
    } catch { cleaned = false; }
    const warning = cleaned ? 'Küçük veya video olmayan yanıt tespit edildi; bu indirme durduruldu/kaldırıldı.' : 'Küçük veya video olmayan yanıt tespit edildi. Otomatik temizleme başarısız; Chrome İndirilenler’den silin.';
    await chrome.storage.session.set({[`${key(record.tabId)}:downloadWarning`]:warning});
    await chrome.storage.session.remove(recordKey);
    return warning;
  }
  if (download.state !== 'in_progress') await chrome.storage.session.remove(recordKey);
  return '';
}
chrome.downloads.onChanged.addListener(delta => {
  serial(() => auditDownload(delta.id)).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'drm-detected' && sender.tab?.id >= 0) {
    serial(() => chrome.storage.session.set({[`${key(sender.tab.id)}:drm`]:true})).then(() => respond({ok:true}), () => respond({ok:false}));
    return true;
  }
  if (sender.tab && !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
  (async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || tab.id !== message.tabId) throw new Error('Etkin sekme değişti. Yeniden tarayın.');
    if (message.type === 'scan') {
      if (!/^https?:/.test(tab.url || '')) throw new Error('Normal bir web sayfası açın. Chrome iç sayfaları taranamaz.');
      let warning = '', blobCount = 0;
      try {
        const results = await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:scanPage});
        await serial(async () => {
          await remember(tab.id, results.flatMap(result => result.result?.candidates || []));
          if (results.some(result => result.result?.drm)) await chrome.storage.session.set({[`${key(tab.id)}:drm`]:true});
        });
        blobCount = results.reduce((sum,result) => sum + (result.result?.blobCount || 0),0);
      } catch {
        warning = 'Sayfa öğelerine erişilemedi. Ağda bulunan videolar gösteriliyor.';
      }
      await queue;
      const snapshot = await read(tab.id);
      const needsProbe = snapshot.filter(item => (!item.bytes || item.format === 'stream') && (!item.probedAt || Date.now() - item.probedAt > 60000));
      const pending = needsProbe.slice(0,24);
      let index = 0;
      await Promise.all(Array.from({length:Math.min(6,pending.length)}, async () => {
        while (index < pending.length) {
          const item = pending[index++];
          Object.assign(item,await inspectResource(item),{probedAt:Date.now()});
        }
      }));
      // Merge into the latest state; never resurrect items removed by navigation.
      await serial(async () => {
        const latest = await read(tab.id);
        const updates = new Map(pending.map(item => [item.url,item]));
        await chrome.storage.session.set({[key(tab.id)]:latest.map(item => ({...item,...updates.get(item.url)}))});
      });
      const all = await read(tab.id);
      const pageDrm = !!(await chrome.storage.session.get(`${key(tab.id)}:drm`))[`${key(tab.id)}:drm`];
      const downloadWarning = (await chrome.storage.session.get(`${key(tab.id)}:downloadWarning`))[`${key(tab.id)}:downloadWarning`];
      return {items:all.filter(visibleMedia),warning:[warning,downloadWarning].filter(Boolean).join(' '),diagnostics:{
        total:all.length,small:all.filter(item => item.format !== 'stream' && item.bytes !== null && item.bytes < 10000000).length,
        unknown:all.filter(item => item.format === 'stream' || item.bytes === null).length,
        protected:all.filter(item => item.drm).map(item => item.drm),pageDrm,blobCount,
        unchecked:Math.max(0,needsProbe.length - pending.length)
      }};
    }
    if (message.type === 'native') {
      await queue;
      const selected = (await read(tab.id)).find(item => item.url === message.url);
      if (selected?.drm) throw new Error('Bu kaynakta DRM/koruma işareti var. Koruma aşma desteklenmiyor.');
      const known = !!selected;
      if (!known && message.url !== tab.url) throw new Error('Kaynak bu sekmede bulunamadı.');
      return await new Promise((resolve, reject) => {
        const port = chrome.runtime.connectNative('com.indiren.downloader');
        let settled = false;
        port.onMessage.addListener(result => { settled = true; resolve(result); port.disconnect(); });
        port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          if (!settled) reject(new Error('İndirme yardımcısına erişilemedi. README’deki yardımcı kurulumunu tamamlayın.'));
        });
        port.postMessage({url:message.url});
      });
    }
    if (message.type === 'download') {
      await queue;
      const item = (await read(tab.id)).find(item => item.url === message.url);
      if (!item || !visibleMedia(item) || item.drm) throw new Error('Bu kaynak doğrudan indirilemiyor.');
      const fresh = await inspectResource(item,fetch,true);
      if (!visibleMedia({...item,bytes:null,...fresh})) throw new Error('İndirme durduruldu: 10 MB ve üzeri gerçek video boyutu doğrulanamadı. Bağlantı süresi dolmuş olabilir.');
      const id = await chrome.downloads.download({url:item.url,filename:filename(item.url,item.format),saveAs:true,conflictAction:'uniquify'});
      await chrome.storage.session.set({[`download:${id}`]:{tabId:tab.id}});
      const problem = await auditDownload(id);
      if (problem) throw new Error(problem);
      return {id};
    }
    throw new Error('Geçersiz işlem.');
  })().then(respond, error => respond({error:error.message}));
  return true;
});
