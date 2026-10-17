// Self-contained: Chrome serializes this function into each accessible frame.
export function scanPage() {
  const candidates = [], roots = [document];
  let drm = false, blobCount = 0, visited = 0;
  const add = (value, source, mime = '') => {
    if (typeof value !== 'string' || !value || candidates.length >= 1500) return;
    try {
      const url = new URL(value,document.baseURI);
      if (url.protocol === 'blob:') { blobCount++; return; }
      const queryMedia = [...url.searchParams].some(([key,value]) => /^(format|type)$/i.test(key) ? /^(m3u8|mpd)$/i.test(value) : /^(file|filename|src|url|path)$/i.test(key) && /\.(mp4|webm|m3u8|mpd)(?:[?#]|$)/i.test(value));
      if (!queryMedia && !/\.(mp4|webm|ogv|ogg|mov|m4v|avi|mkv|flv|mpeg|mpg|3gp|ts|m3u8|mpd)$/i.test(url.pathname) && !/video|mpegurl|dash/i.test(mime) && !['Video öğesi','Video meta verisi','Yapılandırılmış video verisi','Oynatıcı yapılandırması'].includes(source)) return;
      if (/^https?:$/.test(url.protocol)) candidates.push({url:url.href,source,mime});
    } catch {}
  };
  // Includes accessible shadow DOM; closed shadow roots cannot be inspected.
  for (let i = 0; i < roots.length && i < 100; i++) {
    for (const element of roots[i].querySelectorAll('*')) {
      if (++visited > 20000) break;
      if (element.shadowRoot) roots.push(element.shadowRoot);
      if (element.tagName === 'VIDEO') {
        drm ||= !!element.mediaKeys;
        add(element.currentSrc,'Video öğesi',element.type || 'video/unknown');
        add(element.src,'Video öğesi',element.type || 'video/unknown');
      }
      for (const attr of ['src','href','data-src','data-video','data-video-src','data-video-url','data-hls','data-dash']) {
        const value = element.getAttribute(attr);
        if (value && (element.tagName !== 'SCRIPT' || attr !== 'src')) add(value,'Sayfa öğesi',element.type || '');
      }
      if (element.tagName === 'META' && /(?:og:video|twitter:player:stream)/i.test(element.getAttribute('property') || element.getAttribute('name') || '')) add(element.content,'Video meta verisi');
      if (element.tagName === 'SCRIPT' && !element.src && element.textContent.length <= 262144) {
        // Read literal URLs without evaluating page JavaScript.
        const text = element.textContent.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/\\u002f/gi,'/');
        for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)) {
          if (/\.(mp4|webm|m3u8|mpd)(?:[?#]|$)|[?&](?:format|type)=(?:m3u8|mpd)(?:&|$)/i.test(match[0])) add(match[0],'Oynatıcı yapılandırması');
        }
      }
      if (element.tagName === 'SCRIPT' && element.type === 'application/ld+json' && element.textContent.length <= 262144) {
        try {
          const pending = [JSON.parse(element.textContent)];
          let count = 0;
          while (pending.length && count++ < 2000) {
            const value = pending.pop();
            if (!value || typeof value !== 'object') continue;
            for (const [key,entry] of Object.entries(value)) {
              if (/^(contentUrl|embedUrl|url)$/i.test(key) && typeof entry === 'string') add(entry,'Yapılandırılmış video verisi');
              else if (entry && typeof entry === 'object') pending.push(entry);
            }
          }
        } catch {}
      }
    }
    if (visited > 20000) break;
  }
  for (const entry of performance.getEntriesByType('resource')) add(entry.name,'Sayfa kaynağı');
  return {candidates,drm,blobCount};
}
