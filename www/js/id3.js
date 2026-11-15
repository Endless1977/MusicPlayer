/* Klankstroom — kleine ID3v2-lezer (titel, artiest, album, hoes) + bestandsnaam-fallback */
'use strict';
(() => {
  const dec = (bytes, enc) => {
    try {
      if (enc === 1 || enc === 2) {
        let le = enc === 1;
        let start = 0;
        if (enc === 1 && bytes.length >= 2) { if (bytes[0] === 0xFE && bytes[1] === 0xFF) le = false; start = 2; }
        return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(start)).replace(/\0+$/, '');
      }
      return new TextDecoder(enc === 3 ? 'utf-8' : 'latin1').decode(bytes).replace(/\0+$/, '');
    } catch { return ''; }
  };
  const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];

  K.readId3 = buf => {
    const b = new Uint8Array(buf);
    const out = {};
    if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return out;
    const ver = b[3];
    const size = syncsafe(b, 6);
    let p = 10;
    if (b[5] & 0x40) p += ver === 4 ? syncsafe(b, 10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
    const end = Math.min(b.length, 10 + size);
    while (p + 10 < end) {
      const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsz = ver === 4 ? syncsafe(b, p + 4) : ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]);
      if (fsz <= 0 || p + 10 + fsz > end) break;
      const data = b.subarray(p + 10, p + 10 + fsz);
      if (id === 'TIT2') out.title = dec(data.subarray(1), data[0]);
      else if (id === 'TPE1') out.artist = dec(data.subarray(1), data[0]);
      else if (id === 'TALB') out.album = dec(data.subarray(1), data[0]);
      else if (id === 'APIC' && !out.cover) {
        const enc = data[0];
        let i = 1; while (i < data.length && data[i] !== 0) i++;
        const mime = dec(data.subarray(1, i), 0) || 'image/jpeg';
        i += 2; // terminator + picture type
        if (enc === 1 || enc === 2) { while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2; i += 2; }
        else { while (i < data.length && data[i] !== 0) i++; i++; }
        const img = data.subarray(i);
        if (img.length > 100 && img.length < 1.5e6) out.coverBlob = new Blob([img], { type: mime.includes('/') ? mime : 'image/' + mime.toLowerCase() });
      }
      p += 10 + fsz;
    }
    return out;
  };

  /* "Artiest - Titel.mp3" of "01 Titel.mp3" → metadata */
  K.parseName = (path) => {
    const parts = String(path).split(/[\\/]/);
    const file = parts.pop().replace(/\.[^.]+$/, '');
    const album = parts.length ? parts[parts.length - 1] : '';
    const artistDir = parts.length > 1 ? parts[parts.length - 2] : '';
    let clean = file.replace(/^\d{1,3}[\s.\-_]+/, '').replace(/_/g, ' ').trim();
    let artist = '', title = clean;
    const m = clean.match(/^(.+?)\s+-\s+(.+)$/);
    if (m) { artist = m[1]; title = m[2]; }
    return { title: title || file, artist: artist || artistDir || '', album };
  };

  /* Verkleint hoes naar kleine dataURL zodat hij in IndexedDB/localStorage past */
  K.shrinkCover = async (blob, size = 160) => {
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
      return c.toDataURL('image/jpeg', 0.8);
    } catch { return ''; }
  };
})();
