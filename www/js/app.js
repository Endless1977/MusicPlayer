/* Klankstroom — UI: navigatie, lijsten, spelerbalk, screensaver */
'use strict';
(() => {
  const { $, $$, el, esc, fmtTime } = K;
  const S = K.settings, P = K.player;

  /* ---------------- navigatie ---------------- */
  const app = K.app = {
    view: 'radio',
    show(v) {
      if (app.exitFullscreen) app.exitFullscreen();   // nooit een volledig scherm laten hangen
    app.view = v;
      $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
      $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
      if (v === 'accounts') K.accounts.render();
      if (v === 'favorites') renderFavs();
      if (v === 'nowplaying') renderQueue();
      if (v === 'library') renderLibrary();
      $('#main').scrollTop = 0;
    }
  };
  $$('#nav button').forEach(b => b.addEventListener('click', () => app.show(b.dataset.view)));

  /* ---------------- bouwstenen ---------------- */
  const isCurrent = item => P.current && P.current.id === item.id;

  function coverEl(item, cls) {
    if (item.cover) {
      const img = el('img', { src: item.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.onerror = () => img.replaceWith(el('div', { class: cls || 'noimg' }, K.initials(item.title)));
      return img;
    }
    return el('div', { class: cls || 'noimg' }, item.kind === 'station' ? K.initials(item.title) : '♪');
  }

  function stationCard(item, list) {
    const fav = el('button', { class: 'fav' + (K.favs.isFav(item) ? ' on' : ''), title: 'Favoriet' }, K.favs.isFav(item) ? '★' : '☆');
    fav.addEventListener('click', e => { e.stopPropagation(); const on = K.favs.toggle(item); fav.classList.toggle('on', on); fav.textContent = on ? '★' : '☆'; });
    const logo = el('div', { class: 'logo' }, coverEl(item, 'x'));
    const c = el('div', { class: 'card' + (isCurrent(item) ? ' playing' : ''), 'data-id': item.id, title: item.title },
      logo, el('div', { class: 't' }, item.title),
      el('div', { class: 's' }, [item.artist, item.bitrate ? item.bitrate + ' kbps' : ''].filter(Boolean).join(' · ')), fav);
    c.addEventListener('click', () => P.play(item, list));
    return c;
  }

  function trackRow(item, list, opts = {}) {
    const dur = item.duration ? fmtTime(item.duration) : '';
    const favBtn = el('button', { title: 'Favoriet' }, K.favs.isFav(item) ? '★' : '☆');
    favBtn.addEventListener('click', e => { e.stopPropagation(); favBtn.textContent = K.favs.toggle(item) ? '★' : '☆'; });
    const acts = el('div', { class: 'acts' });
    if (item.kind !== 'album') {
      acts.append(el('button', { title: 'In wachtrij', onclick: e => { e.stopPropagation(); P.enqueue(item); } }, '＋'), favBtn);
    }
    if (opts.remove) acts.append(el('button', { title: 'Verwijderen', onclick: e => { e.stopPropagation(); opts.remove(item); } }, '✕'));
    const badge = item.kind === 'album' ? 'album ▸' : (opts.badge || dur || item.origin || '');
    const row = el('div', { class: 'track' + (isCurrent(item) ? ' playing' : ''), 'data-id': item.id },
      coverEl(item),
      el('div', { class: 'tt' }, el('div', {}, item.title || 'Onbekend'), el('div', { class: 'a' }, [item.artist, item.album].filter(Boolean).join(' — '))),
      badge ? el('span', { class: 'badge' }, badge) : el('span'),
      acts);
    row.addEventListener('click', async () => {
      if (item.kind === 'album') {
        if (row.nextSibling && row.nextSibling.classList && row.nextSibling.classList.contains('sub')) { row.nextSibling.remove(); return; }
        const sub = el('div', { class: 'tracklist sub', style: 'margin-left:30px' }, el('div', { class: 'loader' }, 'Nummers laden…'));
        row.after(sub);
        try {
          const tracks = await K.sources.expand(item);
          sub.innerHTML = '';
          if (!tracks.length) sub.append(el('div', { class: 'hint' }, 'Geen afspeelbare nummers'));
          tracks.forEach(t => sub.append(trackRow(t, tracks)));
          if (tracks.length) P.play(tracks[0], tracks);
        } catch (e) { sub.innerHTML = '<div class="hint">Laden mislukt</div>'; }
      } else P.play(item, list);
    });
    return row;
  }

  const markPlaying = () => $$('[data-id]').forEach(n => n.classList.toggle('playing', !!P.current && n.dataset.id === P.current.id));

  /* ---------------- RADIO ---------------- */
  const rs = { name: '', tag: '', country: 'NL', order: 'clickcount', offset: 0, items: [] };
  const tagBox = $('#radioTags');
  for (const t of ['alles', ...K.radio.TAGS]) {
    const c = el('button', { class: 'chip' + (t === 'alles' ? ' on' : '') }, t);
    c.addEventListener('click', () => { rs.tag = t === 'alles' ? '' : t; $$('.chip', tagBox).forEach(x => x.classList.toggle('on', x === c)); loadRadio(); });
    tagBox.append(c);
  }
  async function loadRadio(more) {
    const list = $('#radioList');
    rs.name = $('#radioQuery').value.trim();
    rs.country = $('#radioCountry').value;
    rs.order = $('#radioOrder').value;
    if (!more) { rs.offset = 0; rs.items = []; list.innerHTML = '<div class="loader">Zenders laden…</div>'; }
    try {
      const items = await K.radio.search({ ...rs, offset: rs.offset });
      if (!more) list.innerHTML = '';
      rs.items.push(...items);
      rs.offset += items.length;
      items.forEach(it => list.append(stationCard(it, rs.items)));
      if (!rs.items.length) list.innerHTML = '<div class="empty">Geen zenders gevonden</div>';
      $('#radioMore').classList.toggle('hidden', items.length < 60);
    } catch (e) {
      const cached = !more && K.radio.cached(rs);
      list.innerHTML = '';
      if (cached && cached.length) {
        list.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, 'Geen verbinding — laatst bekende zenders:'));
        cached.forEach(it => list.append(stationCard(it, cached)));
      } else list.innerHTML = '<div class="empty">Kan de radiodatabase niet bereiken' + (navigator.onLine ? '' : ' (je bent offline)') + '.</div>';
    }
  }
  $('#radioGo').addEventListener('click', () => loadRadio());
  $('#radioQuery').addEventListener('keydown', e => { if (e.key === 'Enter') loadRadio(); });
  $('#radioCountry').addEventListener('change', () => loadRadio());
  $('#radioOrder').addEventListener('change', () => loadRadio());
  $('#radioMore').addEventListener('click', () => loadRadio(true));
  $('#customStreamGo').addEventListener('click', () => {
    const u = $('#customStream').value.trim();
    if (!/^https?:\/\//i.test(u)) return K.toast('Vul een geldige http(s)-URL in');
    const it = K.radio.custom(u);
    P.play(it);
    if (!K.favs.isFav(it)) K.favs.toggle(it);
    K.toast('Eigen stream bewaard bij favorieten');
  });
  K.radio.countries().then(cs => {
    const sel = $('#radioCountry');
    for (const c of cs) sel.append(el('option', { value: c.code }, `${c.name} (${c.n})`));
    sel.value = rs.country;
  }).catch(() => {
    $('#radioCountry').append(el('option', { value: 'NL' }, 'Nederland'), el('option', { value: 'BE' }, 'België'), el('option', { value: 'DE' }, 'Duitsland'), el('option', { value: 'GB' }, 'Verenigd Koninkrijk'), el('option', { value: 'US' }, 'Verenigde Staten'));
    $('#radioCountry').value = rs.country;
  }).finally(() => loadRadio());

  /* ---------------- ZOEKEN ---------------- */
  function renderSourceChips() {
    const box = $('#sourceChips');
    box.innerHTML = '';
    for (const p of K.sources.providers) {
      const ready = p.ready();
      const on = S.sources[p.id] !== false && ready;
      const c = el('button', { class: 'chip' + (on ? ' on' : ''), title: p.note }, p.name + (ready ? '' : ' 🔒'));
      c.addEventListener('click', () => {
        if (!ready) { app.show('accounts'); return K.toast(p.name + ' eerst koppelen'); }
        S.sources = { ...S.sources, [p.id]: !on }; renderSourceChips();
      });
      box.append(c);
    }
  }
  renderSourceChips();
  K.on('accounts', renderSourceChips);

  let searchToken = 0;
  async function runSearch() {
    const q = $('#musicQuery').value.trim();
    if (!q) return;
    const tok = ++searchToken;
    const box = $('#searchResults');
    box.innerHTML = '';
    const blocks = {};
    for (const p of K.sources.providers.filter(p => S.sources[p.id] !== false && p.ready())) {
      blocks[p.id] = el('div', { class: 'src-block' }, el('h2', {}, p.name + ' ', el('span', { class: 'count' }, 'zoeken…')), el('div', { class: 'tracklist' }));
      box.append(blocks[p.id]);
    }
    if (!Object.keys(blocks).length) box.innerHTML = '<div class="empty">Geen bronnen actief</div>';
    await K.sources.searchAll(q, (p, items, err) => {
      if (tok !== searchToken) return;
      const b = blocks[p.id];
      b.querySelector('.count').textContent = err ? '— niet bereikbaar' : `${items.length} resultaten`;
      const list = b.querySelector('.tracklist');
      if (err) console.warn(p.id, err);
      if (!items.length) { list.append(el('div', { class: 'hint' }, err ? (navigator.onLine ? 'Deze bron reageert nu niet.' : 'Offline.') : 'Niets gevonden.')); return; }
      items.forEach(it => list.append(trackRow(it, items.filter(x => x.kind === 'track'))));
    });
  }
  $('#musicGo').addEventListener('click', runSearch);
  $('#musicQuery').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

  /* ---------------- BIBLIOTHEEK ---------------- */
  function renderLibrary() {
    const all = K.library.tracks;
    const f = $('#libFilter').value.trim().toLowerCase();
    const src = $('#libSource').value;
    const origins = [...new Set(all.map(t => t.origin).filter(Boolean))];
    const sel = $('#libSource'); const cur = sel.value;
    sel.innerHTML = '<option value="">Alle bronnen</option>' + origins.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
    const list = all.filter(t => (!src || t.origin === src) && (!f || [t.title, t.artist, t.album].join(' ').toLowerCase().includes(f)));
    $('#libStats').textContent = `${all.length} nummers in je bibliotheek${list.length !== all.length ? ` · ${list.length} getoond` : ''}`;
    const box = $('#libList');
    box.innerHTML = '';
    if (!all.length) {
      box.append(el('div', { class: 'empty' }, 'Nog geen lokale muziek. Gebruik “Map toevoegen” of de knop 📡 Scan hardware.'));
      return;
    }
    const frag = document.createDocumentFragment();
    list.slice(0, 2000).forEach(t => frag.append(trackRow(t, list, { remove: it => K.library.remove(it.id) })));
    box.append(frag);
  }
  K.on('library', () => { if (app.view === 'library') renderLibrary(); });
  $('#libFilter').addEventListener('input', K.debounce(renderLibrary, 200));
  $('#libSource').addEventListener('change', renderLibrary);
  $('#libClear').addEventListener('click', () => { if (confirm('Hele bibliotheek leegmaken? (je bestanden zelf blijven bestaan)')) K.library.clear(); });
  $('#addFolder').addEventListener('click', () => K.platform === 'electron' ? K.library.addFolderNative(null) : K.platform === 'android' ? K.scan.run() : $('#folderInput').click());
  $('#addFiles').addEventListener('click', () => $('#filesInput').click());
  $('#folderInput').addEventListener('change', e => { K.library.addFiles(e.target.files, 'Map'); e.target.value = ''; app.show('library'); });
  $('#filesInput').addEventListener('change', e => { K.library.addFiles(e.target.files, 'Bestanden'); e.target.value = ''; app.show('library'); });

  /* ---------------- FAVORIETEN ---------------- */
  function renderFavs() {
    const st = $('#favStations'); st.innerHTML = '';
    K.favs.stations.forEach(s => st.append(stationCard(s, K.favs.stations)));
    if (!K.favs.stations.length) st.innerHTML = '<div class="empty">Tik op ☆ bij een zender</div>';
    const tr = $('#favTracks'); tr.innerHTML = '';
    K.favs.tracks.forEach(t => tr.append(trackRow(t, K.favs.tracks)));
    if (!K.favs.tracks.length) tr.innerHTML = '<div class="empty">Nog geen favoriete nummers</div>';
    const rc = $('#recent'); rc.innerHTML = '';
    K.recent.list.filter(r => !(r.source === 'local' && r.plat === 'web' && false)).forEach(t => rc.append(t.kind === 'station' ? trackRow(t, [t], { badge: 'radio' }) : trackRow(t, K.recent.list.filter(x => x.kind === 'track'))));
  }
  K.on('favs', () => { if (app.view === 'favorites') renderFavs(); updateFavBtn(); });

  /* ---------------- WACHTRIJ ---------------- */
  function renderQueue() {
    const box = $('#queueList'); box.innerHTML = '';
    if (!P.queue.length) { box.innerHTML = '<div class="empty">Wachtrij is leeg</div>'; return; }
    P.queue.forEach((t, i) => box.append(trackRow(t, P.queue, { badge: i === P.index ? '▶ nu' : String(i + 1), remove: () => P.removeAt(i) })));
  }
  K.on('queue', () => { if (app.view === 'nowplaying') renderQueue(); });

  /* ---------------- SPELERBALK ---------------- */
  const playBtn = $('#pPlay');
  function updateFavBtn() {
    const on = P.current && K.favs.isFav(P.current);
    $('#pFav').textContent = on ? '★' : '☆';
    $('#pFav').classList.toggle('on', !!on);
  }
  K.on('track', item => {
    $('#pTitle').textContent = $('#stageTitle').textContent = $('#saverTitle').textContent = item.title || '';
    $('#pArtist').textContent = $('#stageArtist').textContent = $('#saverArtist').textContent = [item.artist, item.album].filter(Boolean).join(' — ');
    $('#pCover').src = item.cover || 'icons/wapen.svg';
    $('#stageCover').src = item.cover || '';
    $('#pDur').textContent = item.kind === 'station' ? 'LIVE' : fmtTime(item.duration);
    $('#pSeek').disabled = item.kind === 'station';
    document.title = (item.title ? item.title + ' · ' : '') + 'Klankstroom';
    updateFavBtn(); markPlaying();
    if (app.view === 'nowplaying') renderQueue();
  });
  K.on('state', st => {
    playBtn.textContent = st === 'playing' ? '⏸' : st === 'loading' ? '…' : '▶';
    // Android: voorgronddienst zodat muziek doorspeelt met het scherm uit
    const MS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
    if (MS && K.platform === 'android' && st !== 'loading') {
      const on = st === 'playing';
      if (on !== app._alive || (on && P.current && P.current.id !== app._aliveId)) {
        app._alive = on; app._aliveId = P.current && P.current.id;
        MS.keepAlive({ on, title: P.current ? P.current.title : '', artist: P.current ? P.current.artist || '' : '' }).catch(() => {});
      }
    }
  });
  K.on('analysis', ok => {
    const v = $('#vizSrc');
    v.classList.remove('hidden');
    v.textContent = ok ? '🎵 reageert op de muziek'
      : P.current && P.current.source === 'spotify' ? '∿ geschat ritme (Spotify laat geen analyse toe)'
      : K.platform === 'web' ? '∿ geschat ritme: deze zender staat analyse in de browser niet toe (wel in de app)'
      : '∿ geschat ritme: deze stream staat analyse niet toe';
  });
  let seeking = false;
  K.on('time', ({ t, d }) => {
    $('#pTime').textContent = fmtTime(t).replace('LIVE', '0:00');
    if (isFinite(d) && d > 0) { $('#pDur').textContent = fmtTime(d); if (!seeking) $('#pSeek').value = (t / d) * 1000; }
  });
  $('#pSeek').addEventListener('input', () => { seeking = true; });
  $('#pSeek').addEventListener('change', e => { seeking = false; P.seek(e.target.value / 1000); });
  playBtn.addEventListener('click', () => P.current ? P.toggle() : K.toast('Kies eerst een zender of nummer'));
  $('#pNext').addEventListener('click', () => P.next());
  $('#pPrev').addEventListener('click', () => P.prev());
  $('#pShuffle').addEventListener('click', e => { P.shuffle = !P.shuffle; e.currentTarget.classList.toggle('on', P.shuffle); });
  $('#pRepeat').addEventListener('click', e => {
    P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
    e.currentTarget.classList.toggle('on', P.repeat !== 'off');
    e.currentTarget.textContent = P.repeat === 'one' ? '🔂' : '↻';
    K.toast({ off: 'Herhalen uit', all: 'Alles herhalen', one: 'Eén nummer herhalen' }[P.repeat]);
  });
  $('#pFav').addEventListener('click', () => { if (P.current) K.favs.toggle(P.current); });
  $('#pVol').value = S.volume;
  $('#pVol').addEventListener('input', e => P.setVolume(+e.target.value));
  $('#pMute').addEventListener('click', () => P.toggleMute());
  K.on('mute', m => { $('#pMute').textContent = m ? '🔇' : '🔊'; });
  $('#pCover').addEventListener('click', () => app.show('nowplaying'));

  /* ---------------- VISUALIZER + SCREENSAVER ---------------- */
  const saver = $('#saver');
  const stageVisible = () => S.viz && app.view === 'nowplaying' && !document.hidden;
  const saverVisible = () => S.viz && !saver.classList.contains('hidden') && !document.hidden;
  K.viz.add($('#vizCanvas'), stageVisible);
  K.viz.add($('#saverCanvas'), saverVisible);

  for (const sel of ['#vizMode', '#setVizMode']) {
    const s = $(sel);
    K.viz.modes.forEach(m => s.append(el('option', { value: m.id }, m.name)));
    s.value = S.vizMode;
    s.addEventListener('change', () => K.viz.setMode(s.value));
  }
  for (const sel of ['#vizVariant', '#setVizVariant']) {
    const s = $(sel);
    for (let i = 1; i <= 16; i++) s.append(el('option', { value: i }, 'Variant #' + i));
    s.value = S.vizVariant || 1;
    s.addEventListener('change', () => { S.vizVariant = +s.value; });
  }
  function syncToggles() {
    $('#vizVariant').value = $('#setVizVariant').value = S.vizVariant || 1;
    const is3d = !!K.viz.mode.three;
    $('#vizVariant').disabled = $('#setVizVariant').disabled = !is3d;
    $$('.viz3d').forEach(c => { c.style.visibility = S.viz ? 'visible' : 'hidden'; });
    $('#vizToggle').classList.toggle('on', S.viz);
    $('#vizToggle2').textContent = S.viz ? 'Visualizer: aan' : 'Visualizer: uit';
    $('#saverToggle').classList.toggle('on', S.saver);
    $('#vizOff').classList.toggle('hidden', S.viz);
    $('#vizCanvas').style.visibility = S.viz ? 'visible' : 'hidden';
    $('#saverCanvas').style.visibility = S.viz ? 'visible' : 'hidden';
    $('#setViz').checked = S.viz; $('#setSaver').checked = S.saver;
    $('#vizMode').value = $('#setVizMode').value = S.vizMode;
    $('#saverToggle').title = 'Screensaver ' + (S.saver ? 'aan' : 'uit');
    $('#vizToggle').title = 'Visualizer ' + (S.viz ? 'aan' : 'uit');
  }
  const toggleViz = () => { S.viz = !S.viz; K.toast('Visualizer ' + (S.viz ? 'aan' : 'uit')); };
  const toggleSaver = () => { S.saver = !S.saver; K.toast('Screensaver ' + (S.saver ? 'aan' : 'uit')); };
  $('#vizToggle').addEventListener('click', toggleViz);
  $('#vizToggle2').addEventListener('click', toggleViz);
  $('#vizOff').addEventListener('click', () => { if (!S.viz) toggleViz(); });
  $('#saverToggle').addEventListener('click', toggleSaver);
  $('#vizFull').addEventListener('click', () => fullscreen($('#stage')));
  $('#stage').addEventListener('dblclick', () => fullscreen($('#stage')));
  /* Volledig scherm. Op Android een eigen CSS-modus: de native WebView-fullscreen legt een
     extra laag over de app die bij de terugknop kon blijven hangen en alle tikken blokkeerde. */
  const bars = on => {
    try { const SB = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.SystemBars; if (SB) (on ? SB.show() : SB.hide()).catch(() => {}); } catch {}
  };
  const pseudoFs = () => K.platform === 'android' || !document.documentElement.requestFullscreen;
  function isFullscreen() { return !!document.fullscreenElement || !!$('.pseudo-fs'); }
  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const p = $('.pseudo-fs');
    if (p) { p.classList.remove('pseudo-fs'); bars(true); }
    $('#vizFull').textContent = '⛶';
  }
  function fullscreen(node) {
    if (isFullscreen()) return exitFullscreen();
    if (pseudoFs()) { node.classList.add('pseudo-fs'); bars(false); $('#vizFull').textContent = '✕'; }
    else node.requestFullscreen().catch(() => {});
  }
  app.exitFullscreen = exitFullscreen;
  app.isFullscreen = isFullscreen;
  document.addEventListener('fullscreenchange', () => { $('#vizFull').textContent = document.fullscreenElement ? '✕' : '⛶'; });

  let idleSince = performance.now(), wakeLock = null;
  const openSaver = async () => {
    if (!saver.classList.contains('hidden')) return;
    saver.classList.remove('hidden');
    if (K.platform === 'android') bars(false);
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  };
  const closeSaver = () => {
    idleSince = performance.now();          // anders gaat hij na 1 seconde meteen weer open
    if (saver.classList.contains('hidden')) return;
    saver.classList.add('hidden');
    if (K.platform === 'android' && !$('.pseudo-fs')) bars(true);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  };
  const activity = () => { idleSince = performance.now(); closeSaver(); };
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, activity, { passive: true }));
  setInterval(() => {
    $('#saverClock').textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const idle = (performance.now() - idleSince) / 1000;
    const dlgOpen = $('#scanDialog').open;
    if (S.saver && !dlgOpen && (P.playing || S.saverIdle) && idle > S.saverDelay) openSaver();
  }, 1000);
  K.app.openSaver = () => { idleSince = -1e9; openSaver(); };

  /* ---------------- INSTELLINGEN ---------------- */
  const bindCheck = (id, key) => { const c = $(id); c.checked = !!S[key]; c.addEventListener('change', () => { S[key] = c.checked; }); };
  bindCheck('#setViz', 'viz'); bindCheck('#setSaver', 'saver'); bindCheck('#setSaverIdle', 'saverIdle');
  bindCheck('#setVizCycle', 'vizCycle'); bindCheck('#setHideBroken', 'hideBroken');
  $('#setSaverDelay').value = S.saverDelay; $('#setSaverDelay').addEventListener('change', e => { S.saverDelay = +e.target.value; });
  $('#setSens').value = S.sens; $('#setSens').addEventListener('input', e => { S.sens = +e.target.value; });
  $('#setVizRes').value = S.vizRes; $('#setVizRes').addEventListener('change', e => { S.vizRes = +e.target.value; });
  $('#setAccent').value = S.accent; $('#setAccent').addEventListener('input', e => { S.accent = e.target.value; });
  const applyAccent = () => document.documentElement.style.setProperty('--accent', S.accent);
  applyAccent();
  K.on('setting', ({ key }) => {
    if (key === 'accent') applyAccent();
    if (['viz', 'saver', 'vizMode', 'vizVariant'].includes(key)) syncToggles();
    if (key === 'hideBroken') loadRadio();
  });
  syncToggles();
  if (K.platform !== 'web') $('#dlRow').classList.add('hidden');

  /* ---------------- sneltoetsen ---------------- */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('.pseudo-fs')) return exitFullscreen();
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); P.toggle(); }
    else if (k === 'n' || e.key === 'MediaTrackNext') P.next();
    else if (k === 'p' || e.key === 'MediaTrackPrevious') P.prev();
    else if (k === 'v') toggleViz();
    else if (k === 'm') K.viz.nextMode();
    else if (k === ']' || k === '[') S.vizVariant = ((S.vizVariant || 1) + (k === ']' ? 0 : 14)) % 16 + 1;
    else if (k === 'f') { app.show('nowplaying'); fullscreen($('#stage')); }
    else if (k === 's') setTimeout(K.app.openSaver, 50);
  });

  /* ---------------- online/offline ---------------- */
  const net = () => { const n = $('#netState'); n.textContent = navigator.onLine ? '● online' : '● offline'; n.classList.toggle('off', !navigator.onLine); };
  window.addEventListener('online', () => { net(); K.toast('Weer online'); });
  window.addEventListener('offline', () => { net(); K.toast('Offline — lokale muziek blijft werken'); });
  net();

  /* Android: terugknop sluit screensaver/dialoog of gaat naar Radio */
  const C = window.Capacitor && Capacitor.Plugins;
  if (C && C.App) C.App.addListener('backButton', () => {
    if (!saver.classList.contains('hidden')) closeSaver();
    else if (app.isFullscreen()) app.exitFullscreen();
    else if ($('#scanDialog').open) $('#scanDialog').close();
    else if (app.view !== 'radio') app.show('radio');
    else C.App.minimizeApp ? C.App.minimizeApp() : C.App.exitApp();
  });

  /* PWA: offline werken in de browser */
  if (K.platform === 'web' && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});

  K.library.load();
})();
