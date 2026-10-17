// No license data or page JavaScript is evaluated. Keep tracking while popup is closed.
document.addEventListener('encrypted', () => {
  chrome.runtime.sendMessage({type:'drm-detected'}).catch(() => {});
}, true);

const seen = new Set();
let timer;
function report(items) {
  const fresh = items.filter(item => {
    if (!item.url || seen.has(item.url) || !/^https?:/.test(item.url)) return false;
    if (seen.size >= 500) return false;
    seen.add(item.url); return true;
  });
  for (let i = 0; i < fresh.length; i += 25) {
    chrome.runtime.sendMessage({type:'media-observed',items:fresh.slice(i,i+25)}).catch(() => {});
  }
}
function scanVideos() {
  report([...document.querySelectorAll('video, video source')].map(video => ({url:video.currentSrc || video.src,mime:video.type || 'video/unknown'})));
}
function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; scanVideos(); }, 500);
}
for (const event of ['play','loadedmetadata','loadstart']) document.addEventListener(event,schedule,true);
new MutationObserver(schedule).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','type']});
try {
  new PerformanceObserver(list => report(list.getEntries().filter(entry => /\.(m3u8|mpd|mp4|webm)(?:[?#]|$)/i.test(entry.name)).map(entry => ({url:entry.name})))).observe({type:'resource',buffered:true});
} catch {}
schedule();
