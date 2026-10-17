export const MIN_BYTES = 10_000_000; // 10 MB, decimal (not MiB).

export function totalBytes(headers, status = 200) {
  const get = name => headers.find(h => h.name.toLowerCase() === name)?.value || '';
  if (get('content-encoding') && get('content-encoding').toLowerCase() !== 'identity') return null;
  // A 206 response's Content-Length is only a chunk, not the whole video.
  const range = /^bytes\s+\d+-\d+\/(\d+)$/i.exec(get('content-range'));
  const value = status === 206 ? range?.[1] : status === 200 ? get('content-length') : null;
  const size = value && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

export function manifestProtection(text) {
  const systems = [];
  if (/edef8ba9-79d6-4ace-a3c8-27dcd51d21ed|widevine/i.test(text)) systems.push('Widevine');
  if (/9a04f079-9840-4286-ab92-e65be0885f95|playready/i.test(text)) systems.push('PlayReady');
  if (/com\.apple\.streamingkeydelivery|skd:\/\//i.test(text)) systems.push('FairPlay');
  if (systems.length) return systems.join(', ');
  if (/<(?:[\w-]+:)?ContentProtection\b/i.test(text) || /#EXT-X-(?:SESSION-)?KEY:[^\r\n]*METHOD=SAMPLE-AES/i.test(text)) return 'Korumalı akış işareti';
  return null;
}

export function visibleMedia(item) {
  return !item.invalidMedia && item.format !== 'stream' && Number.isSafeInteger(item.bytes) && item.bytes >= MIN_BYTES;
}

export function videoSignature(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  return /^(ftyp|moov|mdat|wide|free|skip)$/.test(text.slice(4,8)) ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) ||
    text.startsWith('OggS') || text.startsWith('FLV') ||
    (text.startsWith('RIFF') && text.slice(8,12) === 'AVI ') ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) || bytes[0] === 0x47;
}

export async function inspectResource(item, fetcher = fetch, verify = false) {
  const signal = AbortSignal.timeout(4000);
  if (item.format !== 'stream') {
    const metadata = response => {
      if (![200,206].includes(response.status)) return {};
      if (/^(text\/html|application\/(?:json|xml))(?:;|$)/i.test(response.headers.get('content-type') || '')) return {bytes:null,invalidMedia:true};
      return {bytes:totalBytes([...response.headers].map(([name,value]) => ({name,value})),response.status)};
    };
    let head = {};
    try {
      head = metadata(await fetcher(item.url,{method:'HEAD',credentials:'include',cache:'no-store',signal}));
    } catch {}
    if (head.invalidMedia || (!verify && head.bytes !== null && head.bytes !== undefined)) return head;
    // HEAD is often unsupported. Request only a prefix, cancel even when the
    // server ignores Range, and use Content-Range's total rather than chunk size.
    let reader;
    try {
      const response = await fetcher(item.url,{headers:{Range:'bytes=0-63'},credentials:'include',cache:'no-store',signal});
      const result = metadata(response);
      if (result.invalidMedia || ![200,206].includes(response.status) || !response.body) {
        await response.body?.cancel();
        return {bytes:null,invalidMedia:true};
      }
      reader = response.body.getReader();
      const prefix = new Uint8Array(64);
      let length = 0;
      while (length < 64) {
        const {done,value} = await reader.read();
        if (done) break;
        const part = value.subarray(0,64-length);
        prefix.set(part,length); length += part.length;
      }
      return videoSignature(prefix.subarray(0,length)) ? {...result,invalidMedia:false,signatureChecked:true} : {bytes:null,invalidMedia:true};
    } catch { return {}; }
    finally { await reader?.cancel().catch(() => {}); }
  }
  // Playlist size is NOT video size. Read only bounded manifest text for DRM hints.
  let reader;
  try {
    const response = await fetcher(item.url, {credentials:'include',signal});
    if (!response.ok || !response.body) { await response.body?.cancel(); return {}; }
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '', length = 0;
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 262144) return {manifestLimited:true};
      text += decoder.decode(value,{stream:true});
    }
    text += decoder.decode();
    return {drm:manifestProtection(text),manifestChecked:true};
  } catch { return {}; }
  finally { await reader?.cancel().catch(() => {}); }
}
