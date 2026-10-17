export function classify(raw, mime = '') {
  try {
    if (/^(text\/html|application\/json)(?:;|$)/i.test(mime)) return null;
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    let path = url.pathname.toLowerCase();
    // Some players use /play?file=movie.mp4 or /manifest?format=m3u8.
    for (const [key,value] of url.searchParams) {
      if (/^(file|filename|src|url|path)$/i.test(key) && /\.(mp4|webm|ogv|mov|m4v|mkv|m3u8|mpd)(?:[?#]|$)/i.test(value)) {
        path = value.toLowerCase().split(/[?#]/)[0]; break;
      }
      if (/^(format|type)$/i.test(key) && /^(m3u8|mpd)$/i.test(value)) return 'stream';
    }
    if (/\.m4s$/.test(path) || /^video\/iso\.segment/i.test(mime)) return null;
    if (/\.(m3u8|mpd)$/.test(path) || /mpegurl|dash\+xml/i.test(mime)) return 'stream';
    if (/\.(mp4|webm|ogv|ogg|mov|m4v|avi|mkv|flv|mpeg|mpg|3gp|ts)$/.test(path)) return path.split('.').pop();
    if (/^video\/(mp4|webm|ogg|quicktime)(?:;|$)/i.test(mime)) {
      return ({mp4:'mp4',webm:'webm',ogg:'ogv',quicktime:'mov'})[mime.split(';')[0].split('/')[1].toLowerCase()];
    }
    if (/^video\//i.test(mime)) return 'video';
    return null;
  } catch { return null; }
}

export function filename(url, format) {
  let name;
  try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch {}
  name = (name || 'video').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 140) || 'video';
  if (!/\.(mp4|webm|ogv|ogg|mov|m4v|avi|mkv|flv|mpeg|mpg|3gp|ts)$/i.test(name)) name += `.${format}`;
  return `Indiren/${name}`;
}
