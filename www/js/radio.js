/* Klankstroom — radio via de open Radio Browser-database (radio-browser.info, ±50.000 zenders) */
'use strict';
(() => {
  const MIRRORS = ['de1', 'de2', 'fi1', 'nl1'].map(m => `https://${m}.api.radio-browser.info`);
  let base = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];

  async function api(path) {
    const order = [base, ...MIRRORS.filter(m => m !== base)];
    let err;
    for (const m of order) {
      try { const j = await K.fetchJSON(m + path, { headers: { 'Accept': 'application/json' } }, 9000); base = m; return j; }
      catch (e) { err = e; }
    }
    throw err;
  }

  const toItem = s => ({
    kind: 'station', source: 'radio', id: 'rb:' + s.stationuuid, uuid: s.stationuuid,
    title: (s.name || 'Zender').trim(),
    artist: [s.countrycode, (s.tags || '').split(',').slice(0, 3).join(', ')].filter(Boolean).join(' · '),
    cover: s.favicon || '', url: s.url_resolved || s.url,
    codec: s.codec, bitrate: s.bitrate, homepage: s.homepage
  });

  const R = K.radio = {
    TAGS: ['pop', 'rock', 'dance', 'jazz', 'classical', 'hiphop', '80s', '90s', 'news', 'chillout', 'lofi', 'metal', 'ambient', 'soul', 'country', 'oldies'],
    async search({ name = '', tag = '', country = '', order = 'clickcount', offset = 0, limit = 60 }) {
      const q = new URLSearchParams({ order, reverse: order !== 'name', limit, offset, hidebroken: K.settings.hideBroken });
      if (name) q.set('name', name);
      if (tag) q.set('tag', tag);
      if (country) q.set('countrycode', country);
      const list = await api('/json/stations/search?' + q);
      const items = list.filter(s => s.url_resolved || s.url).map(toItem);
      if (!offset) K.LS.set('radioCache:' + q.toString().replace(/offset=\d+/, ''), items);
      return items;
    },
    cached(params) {
      const q = new URLSearchParams({ order: params.order || 'clickcount', reverse: (params.order || 'clickcount') !== 'name', limit: 60, offset: 0, hidebroken: K.settings.hideBroken });
      if (params.name) q.set('name', params.name);
      if (params.tag) q.set('tag', params.tag);
      if (params.country) q.set('countrycode', params.country);
      return K.LS.get('radioCache:' + q.toString().replace(/offset=\d+/, ''), null);
    },
    async countries() {
      const c = K.LS.get('countries', null);
      if (c) return c;
      const list = await api('/json/countries?order=stationcount&reverse=true');
      const out = list.filter(x => x.iso_3166_1 && x.stationcount > 20).map(x => ({ code: x.iso_3166_1, name: x.name, n: x.stationcount }));
      K.LS.set('countries', out);
      return out;
    },
    /* Radio Browser vraagt apps om een ‘klik’ te melden bij afspelen (houdt populariteit actueel) */
    click(item) { if (item.uuid && navigator.onLine) api('/json/url/' + item.uuid).catch(() => {}); },
    custom(url) {
      return { kind: 'station', source: 'radio', id: 'url:' + url, title: url.replace(/^https?:\/\//, '').split(/[/?]/)[0], artist: 'Eigen stream', url, cover: '' };
    }
  };
})();
