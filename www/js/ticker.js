/* Klankstroom — lichtkrant onderin de visualizer: RDS-tekst van de FM-radio, nummertitel van radiostreams (ICY)
   en titel/artiest/album van andere bronnen. Rustig: dun, half doorzichtig, langzaam. */
'use strict';
(() => {
  const P = K.player, S = K.settings;
  let box, inner, last = '', icy = { title: '', name: '' };
  function ensure() {
    const stage = document.getElementById('stage');
    if (!stage) return null;
    if (!box || !stage.contains(box)) {
      box = document.createElement('div'); box.id = 'ticker';
      inner = document.createElement('span'); box.append(inner);
      stage.append(box);
    }
    return box;
  }
  function text() {
    const it = P.current;
    if (!it) return '';
    const M = K.mtc;
    if (it.source === 'fm' && M) {
      const f = M.fmtFreq(M.fm.khz);
      return [M.fm.psn || it.title, M.fm.rt, f].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('   •   ');
    }
    if (it.source === 'bt' && M) { const m = M.btMusic(); return [m.title || 'Bluetooth', m.artist, m.album].filter(Boolean).join('   •   '); }
    if (it.source === 'cd' && M) return [M.dvd.title || 'CD', M.dvd.cnt ? 'track ' + M.dvd.idx + ' van ' + M.dvd.cnt : ''].filter(Boolean).join('   •   ');
    if (it.kind === 'station') return [icy.title, it.title, [it.country, it.codec && it.bitrate ? it.codec + ' ' + it.bitrate + ' kbps' : ''].filter(Boolean).join(' · ')].filter(Boolean).join('   •   ');
    return [it.title, it.artist, it.album].filter(Boolean).join('   •   ');
  }
  function update() {
    const on = S.ticker !== false && !!P.current;
    const b = ensure(); if (!b) return;
    b.classList.toggle('hidden', !on);
    if (!on) { last = ''; return; }
    const t = text();
    if (t === last) return;
    last = t;
    inner.textContent = t;
    // snelheid ±60 px/s, opnieuw starten
    inner.style.animation = 'none'; void inner.offsetWidth;
    const w = inner.scrollWidth + b.clientWidth;
    inner.style.setProperty('--tw', b.clientWidth + 'px');
    inner.style.animation = `tickerMove ${Math.max(8, w / 60)}s linear infinite`;
  }
  ['track', 'state', 'mtc', 'meta'].forEach(e => K.on(e, update));
  K.on('ticker', update);
  window.addEventListener('resize', () => { last = ''; update(); });

  /* titel van het nummer uit radiostreams (Android: via de eigen doorgeefserver) */
  setInterval(async () => {
    const it = P.current;
    if (!it || it.kind !== 'station' || !P.playing || K.platform !== 'android') return;
    const MS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
    if (!MS || !MS.proxyPort) return;
    try {
      const port = (await MS.proxyPort()).port; if (!port) return;
      const r = await (await fetch(`http://127.0.0.1:${port}/m`, { cache: 'no-store' })).json();
      const t = (r.title || '').trim();
      if (t !== icy.title) { icy = { title: t, name: r.name || '' }; it.nowPlaying = t; K.emit('meta', t); }
    } catch {}
  }, 5000);
  K.on('track', () => { icy = { title: '', name: '' }; });
  setTimeout(update, 500);
})();
