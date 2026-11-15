/* Klankstroom — gekoppelde accounts: Spotify (Premium), Navidrome/Subsonic, Jamendo, Audius */
'use strict';
(() => {
  const store = K.LS.get('accounts', {});
  const save = () => K.LS.set('accounts', store);
  const get = id => (store[id] = store[id] || {});

  /* ================= Subsonic / Navidrome / Airsonic / Gonic ================= */
  const subsonic = {
    ready: () => { const a = get('subsonic'); return !!(a.url && a.user && a.pass); },
    params() {
      const a = get('subsonic');
      const salt = Math.random().toString(36).slice(2, 10);
      return new URLSearchParams({ u: a.user, t: K.md5(a.pass + salt), s: salt, v: '1.16.1', c: 'Klankstroom', f: 'json' });
    },
    base: () => get('subsonic').url.replace(/\/+$/, '') + '/rest/',
    async call(method, extra = {}) {
      const p = subsonic.params();
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      const j = await K.fetchJSON(subsonic.base() + method + '.view?' + p);
      const r = j['subsonic-response'];
      if (!r || r.status !== 'ok') throw new Error(r && r.error ? r.error.message : 'Server antwoordt niet');
      return r;
    },
    async search(q) {
      const r = await subsonic.call('search3', { query: q, songCount: 50, artistCount: 0, albumCount: 0 });
      return ((r.searchResult3 && r.searchResult3.song) || []).map(s => ({
        kind: 'track', source: 'subsonic', id: 'ss:' + s.id, sid: s.id, title: s.title, artist: s.artist, album: s.album,
        duration: s.duration, cover: s.coverArt ? subsonic.base() + 'getCoverArt.view?' + subsonic.params() + '&size=200&id=' + encodeURIComponent(s.coverArt) : ''
      }));
    },
    streamUrl: id => subsonic.base() + 'stream.view?' + subsonic.params() + '&id=' + encodeURIComponent(id)
  };

  /* ================= Spotify (PKCE-login, Web Playback SDK of Spotify Connect) ================= */
  const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
  const isAndroid = () => K.platform === 'android';
  const redirectUri = () => isAndroid() ? 'nl.endless.klankstroom://spotify' : location.origin + location.pathname;
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const spotify = {
    ready: () => !!get('spotify').refresh,
    async login() {
      const a = get('spotify');
      if (!a.clientId) return K.toast('Vul eerst je Spotify Client-ID in');
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      K.LS.set('spVerifier', verifier);
      const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: a.clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
        code_challenge_method: 'S256', code_challenge: challenge, state: 'klankstroom-spotify'
      });
      const C = window.Capacitor && Capacitor.Plugins;
      if (isAndroid() && C && C.Browser) C.Browser.open({ url });
      else location.href = url;
    },
    async finish(code) {
      const a = get('spotify');
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: a.clientId, code_verifier: K.LS.get('spVerifier', '') });
      const j = await K.fetchJSON('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      a.token = j.access_token; a.refresh = j.refresh_token; a.expires = Date.now() + j.expires_in * 1000 - 60000;
      save(); K.toast('Spotify gekoppeld'); K.emit('accounts');
    },
    async token() {
      const a = get('spotify');
      if (a.token && Date.now() < a.expires) return a.token;
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.clientId });
      const j = await K.fetchJSON('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      a.token = j.access_token; if (j.refresh_token) a.refresh = j.refresh_token; a.expires = Date.now() + j.expires_in * 1000 - 60000;
      save(); return a.token;
    },
    async api(path, opts = {}) {
      const r = await fetch('https://api.spotify.com/v1' + path, { ...opts, headers: { Authorization: 'Bearer ' + await spotify.token(), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      if (r.status === 204) return null;
      if (!r.ok) { const t = await r.text(); throw new Error('Spotify ' + r.status + ' ' + t.slice(0, 120)); }
      return r.json();
    },
    async search(q) {
      const j = await spotify.api('/search?type=track&limit=30&q=' + encodeURIComponent(q));
      return j.tracks.items.map(t => ({
        kind: 'track', source: 'spotify', id: 'sp:' + t.id, uri: t.uri, title: t.name,
        artist: t.artists.map(x => x.name).join(', '), album: t.album.name, duration: t.duration_ms / 1000,
        cover: (t.album.images[1] || t.album.images[0] || {}).url || ''
      }));
    },
    logout() { const a = get('spotify'); delete a.token; delete a.refresh; save(); K.emit('accounts'); if (sdkPlayer) sdkPlayer.disconnect(); },
    player: null
  };

  /* Web Playback SDK (pc/browser). Op Android: Spotify Connect naar de Spotify-app. */
  let sdkPlayer = null, deviceId = null, sdkLoading = null;
  function loadSdk() {
    if (isAndroid()) return Promise.resolve(null);
    if (sdkLoading) return sdkLoading;
    return sdkLoading = new Promise(res => {
      window.onSpotifyWebPlaybackSDKReady = () => {
        sdkPlayer = new Spotify.Player({ name: 'Klankstroom', getOAuthToken: cb => spotify.token().then(cb), volume: K.settings.volume });
        sdkPlayer.addListener('ready', ({ device_id }) => { deviceId = device_id; res(deviceId); });
        sdkPlayer.addListener('not_ready', () => { deviceId = null; });
        sdkPlayer.addListener('initialization_error', () => res(null));
        sdkPlayer.addListener('account_error', () => { K.toast('Spotify Premium is nodig om in de app af te spelen'); res(null); });
        sdkPlayer.addListener('player_state_changed', st => { if (st) K.emit('time', { t: st.position / 1000, d: st.duration / 1000 }); });
        sdkPlayer.connect();
        setTimeout(() => res(null), 8000);
      };
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      s.onerror = () => res(null);
      document.head.append(s);
    });
  }
  spotify.player = {
    async play(item) {
      const dev = await loadSdk();
      const q = dev ? '?device_id=' + dev : '';
      try { await spotify.api('/me/player/play' + q, { method: 'PUT', body: JSON.stringify({ uris: [item.uri] }) }); }
      catch (e) {
        if (String(e.message).includes('404')) K.toast('Open de Spotify-app op dit apparaat en probeer opnieuw');
        throw e;
      }
      if (!dev) K.toast('Speelt af via Spotify Connect');
    },
    pause: () => sdkPlayer ? sdkPlayer.pause() : spotify.api('/me/player/pause', { method: 'PUT' }),
    resume: () => sdkPlayer ? sdkPlayer.resume() : spotify.api('/me/player/play', { method: 'PUT' }),
    setVolume: v => { if (sdkPlayer) sdkPlayer.setVolume(v); },
    seek: frac => { if (sdkPlayer) sdkPlayer.getCurrentState().then(s => s && sdkPlayer.seek(frac * s.duration)); }
  };

  /* Terugkeer van Spotify-login (web/pc via URL, Android via deep link) */
  function checkReturn(urlStr) {
    try {
      const u = new URL(urlStr);
      if (u.searchParams.get('state') === 'klankstroom-spotify' && u.searchParams.get('code')) {
        spotify.finish(u.searchParams.get('code')).catch(e => K.toast('Spotify-login mislukt: ' + e.message));
        if (urlStr === location.href) history.replaceState(null, '', location.pathname);
      }
    } catch {}
  }
  checkReturn(location.href);
  const C = window.Capacitor && Capacitor.Plugins;
  if (C && C.App) C.App.addListener('appUrlOpen', ({ url }) => { if (C.Browser) C.Browser.close().catch(() => {}); checkReturn(url); });

  /* ================= UI: kaarten op de Accounts-pagina ================= */
  function field(id, key, label, type = 'text', placeholder = '') {
    const inp = K.el('input', { type, placeholder, value: get(id)[key] || '', autocomplete: 'off' });
    inp.addEventListener('change', () => { get(id)[key] = inp.value.trim(); save(); K.emit('accounts'); });
    return K.el('label', {}, K.el('div', { class: 'hint' }, label), inp);
  }
  const state = on => K.el('span', { class: 'state' + (on ? ' on' : '') }, on ? 'gekoppeld' : 'niet gekoppeld');

  function render() {
    const box = K.$('#accountCards');
    box.innerHTML = '';
    // Spotify
    const sp = K.el('div', { class: 'acc' },
      K.el('h3', {}, '🟢 Spotify ', state(spotify.ready())),
      K.el('p', { class: 'hint', html: 'Premium nodig voor afspelen. Maak gratis een app op <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com</a> en zet daar deze Redirect-URI:<br><code>' + K.esc(redirectUri()) + '</code>' }),
      field('spotify', 'clientId', 'Client-ID'),
      K.el('div', { class: 'btns' },
        spotify.ready() ? K.el('button', { onclick: spotify.logout }, 'Ontkoppelen') : K.el('button', { class: 'primary', onclick: spotify.login }, 'Inloggen bij Spotify')),
      isAndroid() ? K.el('p', { class: 'hint' }, 'Op Android speelt Spotify af via de Spotify-app (Spotify Connect).') : null
    );
    // Subsonic
    const ss = K.el('div', { class: 'acc' },
      K.el('h3', {}, '🗄 Navidrome / Subsonic ', state(subsonic.ready())),
      K.el('p', { class: 'hint' }, 'Je eigen muziekserver (bijv. op je Raspberry Pi) of een Subsonic-compatibele dienst.'),
      field('subsonic', 'url', 'Server-adres', 'url', 'http://192.168.1.10:4533'),
      field('subsonic', 'user', 'Gebruikersnaam'),
      field('subsonic', 'pass', 'Wachtwoord', 'password'),
      K.el('div', { class: 'btns' }, K.el('button', {
        onclick: async () => { try { await subsonic.call('ping'); K.toast('Verbinding met server OK'); } catch (e) { K.toast('Mislukt: ' + e.message); } }
      }, 'Test verbinding'))
    );
    // Jamendo
    const ja = K.el('div', { class: 'acc' },
      K.el('h3', {}, '🎼 Jamendo ', state(!!get('jamendo').key)),
      K.el('p', { class: 'hint', html: 'Ruim 600.000 legale Creative Commons-nummers. Gratis client-ID via <a href="https://devportal.jamendo.com" target="_blank" rel="noopener">devportal.jamendo.com</a>.' }),
      field('jamendo', 'key', 'Client-ID')
    );
    // Audius
    const au = K.el('div', { class: 'acc' },
      K.el('h3', {}, '🎧 Audius ', K.el('span', { class: 'state on' }, 'werkt zonder account')),
      K.el('p', { class: 'hint' }, 'Optioneel: eigen API-sleutel voor hogere limieten.'),
      field('audius', 'key', 'API-sleutel (optioneel)', 'password')
    );
    // Overige
    const other = K.el('div', { class: 'acc' },
      K.el('h3', {}, '➕ Andere diensten'),
      K.el('p', { class: 'hint' }, 'Deezer, Apple Music, YouTube Music en Tidal bieden geen open afspeel-koppeling voor eigen apps. Via deze knoppen open je ze in hun eigen app of website.'),
      K.el('div', { class: 'btns' }, ...[['Deezer', 'https://www.deezer.com'], ['Apple Music', 'https://music.apple.com'], ['YouTube Music', 'https://music.youtube.com'], ['Tidal', 'https://listen.tidal.com']]
        .map(([n, u]) => K.el('button', { onclick: () => window.open(u, '_blank') }, n)))
    );
    box.append(sp, ss, ja, au, other);
  }

  K.accounts = { get, save, subsonic, spotify, render };
  K.on('accounts', () => { if (K.$('#view-accounts').classList.contains('active')) render(); });
})();
