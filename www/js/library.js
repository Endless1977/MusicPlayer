/* Klankstroom — lokale bibliotheek: mappen, bestanden, SD-kaart, USB — speelt offline */
'use strict';
(() => {
  const AUDIO_RE = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|weba|webm|wma)$/i;
  const blobUrls = new Map();
  let tracks = [];

  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  async function meta(buf, name) {
    const tag = buf ? K.readId3(buf) : {};
    const fromName = K.parseName(name);
    return {
      title: tag.title || fromName.title, artist: tag.artist || fromName.artist, album: tag.album || fromName.album,
      cover: tag.coverBlob ? await K.shrinkCover(tag.coverBlob) : ''
    };
  }

  const L = K.library = {
    get tracks() { return tracks; },
    async load() { try { tracks = await K.db.all(); } catch { tracks = []; } tracks.sort(sortFn); K.emit('library'); },

    /* Browser/PWA: bestanden worden in de app bewaard zodat ze offline blijven werken */
    async addFiles(fileList, origin = 'Map') {
      const files = [...fileList].filter(f => AUDIO_RE.test(f.name) || (f.type || '').startsWith('audio/'));
      if (!files.length) return K.toast('Geen audiobestanden gevonden');
      K.toast(`${files.length} bestanden inlezen…`, 10000);
      const out = [];
      for (const f of files) {
        const rel = f.webkitRelativePath || f.name;
        const id = 'lc:' + hash(rel + ':' + f.size);
        if (tracks.some(t => t.id === id)) continue;
        let buf = null;
        try { buf = await f.slice(0, 1024 * 1024).arrayBuffer(); } catch {}
        const m = await meta(buf, rel);
        try { await K.db.putBlob(id, f); } catch (e) { console.warn('Opslaan mislukt', e); }
        out.push({ kind: 'track', source: 'local', id, ...m, origin, plat: 'web', size: f.size });
      }
      await L.addTracks(out);
    },

    async addTracks(list) {
      if (!list.length) { K.toast('Niets nieuws gevonden'); return; }
      await K.db.put(list);
      const ids = new Set(list.map(t => t.id));
      tracks = tracks.filter(t => !ids.has(t.id)).concat(list).sort(sortFn);
      K.emit('library');
      K.toast(`${list.length} nummers toegevoegd aan je bibliotheek`);
    },

    /* Pc-app (Electron): map kiezen en recursief scannen */
    async addFolderNative(dir, origin = 'Map') {
      dir = dir || await window.native.pickFolder();
      if (!dir) return;
      K.toast('Map scannen…', 15000);
      const files = await window.native.scanFolder(dir);
      const out = [];
      for (const f of files) {
        const id = 'lc:' + hash(f.path);
        if (tracks.some(t => t.id === id)) continue;
        let buf = null;
        try { buf = await (await fetch(window.native.fileUrl(f.path), { headers: { Range: 'bytes=0-1048575' } })).arrayBuffer(); } catch {}
        const m = await meta(buf, f.path);
        out.push({ kind: 'track', source: 'local', id, ...m, origin, plat: 'electron', path: f.path, size: f.size });
      }
      await L.addTracks(out);
    },

    /* Android: resultaten van de MediaStore-scan (interne opslag, SD-kaart, USB) */
    async addAndroid(list) {
      const out = list.map(t => ({
        kind: 'track', source: 'local', id: 'lc:' + hash(t.path || t.uri), title: t.title || K.parseName(t.path || '').title,
        artist: t.artist && t.artist !== '<unknown>' ? t.artist : '', album: t.album || '', duration: t.duration ? t.duration / 1000 : undefined,
        cover: t.art || '', origin: t.volumeLabel || 'Telefoon', plat: 'android', path: t.path, uri: t.uri
      })).filter(t => !tracks.some(x => x.id === t.id));
      await L.addTracks(out);
    },

    async urlFor(item) {
      if (item.plat === 'electron') return window.native.fileUrl(item.path);
      if (item.plat === 'android') return item.path ? Capacitor.convertFileSrc(item.path) : item.uri;
      if (blobUrls.has(item.id)) return blobUrls.get(item.id);
      const blob = await K.db.getBlob(item.id);
      if (!blob) throw new Error('Bestand niet meer beschikbaar');
      const u = URL.createObjectURL(blob);
      blobUrls.set(item.id, u);
      return u;
    },

    async remove(id) { await K.db.del(id); tracks = tracks.filter(t => t.id !== id); K.emit('library'); },
    async clear() { await K.db.clear(); tracks = []; K.emit('library'); }
  };

  function sortFn(a, b) {
    return (a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || '') || (a.title || '').localeCompare(b.title || '');
  }
})();
