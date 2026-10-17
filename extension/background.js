import { classify, filename } from './media.js';

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
    if (format) items.set(candidate.url, {url:candidate.url, format, source:candidate.source});
  }
  await chrome.storage.session.set({[key(tabId)]: [...items.values()].slice(-100)});
}
chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
  const mime = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
  if (!classify(details.url, mime)) return;
  serial(() => remember(details.tabId, [{url:details.url,mime,source:'Ağ isteği'}])).catch(() => {});
}, {urls:['http://*/*','https://*/*']}, ['responseHeaders']);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') serial(() => chrome.storage.session.remove(key(tabId))).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial(() => chrome.storage.session.remove(key(tabId))).catch(() => {});
});

function scanPage() {
  const candidates = [];
  for (const element of document.querySelectorAll('video, video source, a[href]')) {
    const url = element.currentSrc || element.src || element.href;
    if (url) candidates.push({url, mime:element.type || '', source:element.tagName === 'A' ? 'Sayfa bağlantısı' : 'Video öğesi'});
  }
  for (const entry of performance.getEntriesByType('resource')) candidates.push({url:entry.name,source:'Sayfa kaynağı'});
  return candidates.slice(-1000);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (sender.tab && !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
  (async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || tab.id !== message.tabId) throw new Error('Etkin sekme değişti. Yeniden tarayın.');
    if (message.type === 'scan') {
      if (!/^https?:/.test(tab.url || '')) throw new Error('Normal bir web sayfası açın. Chrome iç sayfaları taranamaz.');
      let warning = '';
      try {
        const results = await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:scanPage});
        await serial(() => remember(tab.id, results.flatMap(result => result.result || [])));
      } catch {
        warning = 'Sayfa öğelerine erişilemedi. Ağda bulunan videolar gösteriliyor.';
      }
      await queue;
      return {items:await read(tab.id),warning};
    }
    if (message.type === 'native') {
      await queue;
      const known = (await read(tab.id)).some(item => item.url === message.url);
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
      if (!item || item.format === 'stream') throw new Error('Bu kaynak doğrudan indirilemiyor.');
      const id = await chrome.downloads.download({url:item.url,filename:filename(item.url,item.format),saveAs:true,conflictAction:'uniquify'});
      return {id};
    }
    throw new Error('Geçersiz işlem.');
  })().then(respond, error => respond({error:error.message}));
  return true;
});
