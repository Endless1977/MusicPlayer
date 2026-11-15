/* Klankstroom — legale muziekbronnen voor de zoekmachine */
'use strict';
(() => {
  const APP = 'Klankstroom';
  const AUDIUS = 'https://api.audius.co/v1';

  const providers = [
    {
      id: 'audius', name: 'Audius', note: 'Gratis, onafhankelijke artiesten',
      ready: () => true,
      async search(q) {
        const key = K.accounts.get('audius').key;
        const j = await K.fetchJSON(`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}&limit=30`, key ? { headers: { 'x-api-key': key } } : {});
        return (j.data || []).filter(t => t.is_streamable !== false).map(t => ({
          kind: 'track', source: 'audius', id: 'au:' + t.id, trackId: t.id,
          title: t.title, artist: t.user && t.user.name, duration: t.duration,
          cover: t.artwork && (t.artwork['480x480'] || t.artwork['150x150']) || '',
          url: `${AUDIUS}/tracks/${t.id}/stream?app_name=${APP}`
        }));
      }
    },
    {
      id: 'archive', name: 'Internet Archive', note: 'Publiek domein, Creative Commons, live-opnames',
      ready: () => true,
      async search(q) {
        const query = `(${q}) AND mediatype:(audio) AND (collection:(opensource_audio) OR collection:(etree) OR collection:(netlabels) OR collection:(audio_music) OR collection:(78rpm))`;
        const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams({ q: query, 'fl[]': 'identifier', rows: 24, output: 'json', 'sort[]': 'downloads desc' }) +
          '&fl[]=title&fl[]=creator&fl[]=year';
        const j = await K.fetchJSON(url);
        return (j.response && j.response.docs || []).map(d => ({
          kind: 'album', source: 'archive', id: 'ia:' + d.identifier, ident: d.identifier,
          title: Array.isArray(d.title) ? d.title[0] : d.title, artist: Array.isArray(d.creator) ? d.creator[0] : (d.creator || ''),
          album: d.year ? String(d.year) : '', cover: `https://archive.org/services/img/${d.identifier}`
        }));
      },
      async expand(item) {
        const j = await K.fetchJSON(`https://archive.org/metadata/${item.ident}`);
        const files = (j.files || []).filter(f => /mp3/i.test(f.format || '') || /\.mp3$/i.test(f.name));
        const seen = new Set();
        return files.filter(f => { const k = (f.title || f.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => (parseInt(a.track) || 999) - (parseInt(b.track) || 999) || a.name.localeCompare(b.name))
          .map(f => ({
            kind: 'track', source: 'archive', id: 'ia:' + item.ident + '/' + f.name,
            title: f.title || K.parseName(f.name).title, artist: f.creator || f.artist || item.artist, album: item.title,
            duration: parseFloat(f.length) || (String(f.length || '').includes(':') ? f.length.split(':').reduce((a, b) => a * 60 + +b, 0) : undefined),
            cover: item.cover, url: `https://archive.org/download/${item.ident}/${f.name.split('/').map(encodeURIComponent).join('/')}`
          }));
      }
    },
    {
      id: 'jamendo', name: 'Jamendo', note: 'Creative Commons — gratis client-ID nodig (Accounts)',
      ready: () => !!K.accounts.get('jamendo').key,
      async search(q) {
        const id = K.accounts.get('jamendo').key;
        const j = await K.fetchJSON(`https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(id)}&format=json&limit=30&audioformat=mp32&search=${encodeURIComponent(q)}`);
        return (j.results || []).map(t => ({
          kind: 'track', source: 'jamendo', id: 'ja:' + t.id, title: t.name, artist: t.artist_name, album: t.album_name,
          duration: t.duration, cover: t.image || t.album_image || '', url: t.audio
        }));
      }
    },
    {
      id: 'subsonic', name: 'Eigen server', note: 'Navidrome / Subsonic / Airsonic (Accounts)',
      ready: () => K.accounts.subsonic.ready(),
      search: q => K.accounts.subsonic.search(q)
    },
    {
      id: 'spotify', name: 'Spotify', note: 'Premium-account vereist (Accounts)',
      ready: () => K.accounts.spotify.ready(),
      search: q => K.accounts.spotify.search(q)
    }
  ];

  K.sources = {
    providers,
    get: id => providers.find(p => p.id === id),
    /* zoekt in alle actieve bronnen tegelijk; levert per bron resultaten zodra ze binnen zijn */
    searchAll(q, onResult) {
      const active = providers.filter(p => K.settings.sources[p.id] !== false && p.ready());
      return Promise.allSettled(active.map(p => p.search(q)
        .then(items => onResult(p, items, null))
        .catch(err => onResult(p, [], err))));
    },
    expand: item => {
      const p = providers.find(x => x.id === item.source);
      return p && p.expand ? p.expand(item) : Promise.resolve([item]);
    },
    async resolveUrl(item) {
      if (item.source === 'local') return K.library.urlFor(item);
      if (item.source === 'subsonic') return K.accounts.subsonic.streamUrl(item.sid);
      if (item.source === 'radio') K.radio.click(item);
      return item.url;
    },
    externalPlayer(item) { return item.source === 'spotify' ? K.accounts.spotify.player : null; }
  };
})();
