/* Klankstroom — opslag: instellingen, favorieten (localStorage) en bibliotheek (IndexedDB) */
'use strict';
(() => {
  const LS = {
    get(k, def) { try { const v = localStorage.getItem('ks_' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem('ks_' + k, JSON.stringify(v)); } catch {} }
  };
  K.LS = LS;

  const DEFAULTS = {
    viz: true, saver: true, saverDelay: 120, saverIdle: false,
    vizMode: 'meshgrid', vizVariant: 1, vizCycle: false, sens: 1.2, vizRes: 0.75,
    hideBroken: true, layout: 'auto', perf: 'auto', hideBars: true, accent: '#4fd1ff', volume: 0.8,
    sources: { audius: true, archive: true, jamendo: true, subsonic: true, spotify: true }
  };
  const settings = Object.assign({}, DEFAULTS, LS.get('settings', {}));
  K.settings = new Proxy(settings, {
    set(t, k, v) { t[k] = v; LS.set('settings', t); K.emit('setting', { key: k, value: v }); return true; }
  });

  /* Favorieten & recent */
  K.favs = {
    stations: LS.get('favStations', []),
    tracks: LS.get('favTracks', []),
    isFav(item) {
      const list = item.kind === 'station' ? this.stations : this.tracks;
      return list.some(x => x.id === item.id);
    },
    toggle(item) {
      const key = item.kind === 'station' ? 'stations' : 'tracks';
      const i = this[key].findIndex(x => x.id === item.id);
      if (i >= 0) this[key].splice(i, 1);
      else { const copy = { ...item }; delete copy.blob; this[key].unshift(copy); }
      LS.set(key === 'stations' ? 'favStations' : 'favTracks', this[key]);
      K.emit('favs');
      return i < 0;
    }
  };
  K.recent = {
    list: LS.get('recent', []),
    add(item) {
      const copy = { ...item }; delete copy.blob;
      if (copy.source === 'local' && copy.url && copy.url.startsWith('blob:')) delete copy.url;
      this.list = [copy, ...this.list.filter(x => x.id !== item.id)].slice(0, 40);
      LS.set('recent', this.list);
      K.emit('recent');
    }
  };

  /* IndexedDB bibliotheek */
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('klankstroom', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  };
  K.db = {
    all: () => tx('tracks', 'readonly', s => s.getAll()),
    put: tracks => tx('tracks', 'readwrite', s => { for (const t of tracks) s.put(t); }),
    del: id => tx('tracks', 'readwrite', s => s.delete(id)),
    clear: async () => { await tx('tracks', 'readwrite', s => s.clear()); await tx('blobs', 'readwrite', s => s.clear()); },
    putBlob: (id, blob) => tx('blobs', 'readwrite', s => s.put(blob, id)),
    getBlob: id => tx('blobs', 'readonly', s => s.get(id))
  };
})();
