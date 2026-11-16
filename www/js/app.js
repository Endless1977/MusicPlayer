/* Klankstroom — UI: navigatie, lijsten, spelerbalk, screensaver */
'use strict';
(() => {
  const { $, $$, el, esc, fmtTime } = K;
  const S = K.settings, P = K.player;
  const isCarNow = () => document.getElementById('app').classList.contains('car');

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
  /* Bibliotheek: als mappenbrowser (opslag → map → nummers) of als platte lijst */
  let libPath = [];
  const folderOf = t => {
    if (t.path) { const parts = String(t.path).split(/[\\/]/); parts.pop(); return parts.pop() || 'Hoofdmap'; }
    return t.album || 'Losse nummers';
  };
  const libFolders = () => (S.libMode || (isCarNow() ? 'folders' : 'list')) === 'folders';
  function folderRow(name, count, onclick, iconName = 'folder') {
    const r = el('div', { class: 'track folder' },
      el('div', { class: 'noimg fold-ic', html: K.icon(iconName) }),
      el('div', { class: 'tt' }, el('div', {}, name), el('div', { class: 'a' }, count + (count === 1 ? ' nummer' : ' nummers'))),
      el('span', { class: 'badge' }, '›'), el('span'));
    r.addEventListener('click', onclick);
    return r;
  }
  function renderLibrary() {
    const all = K.library.tracks;
    const f = $('#libFilter').value.trim().toLowerCase();
    const src = $('#libSource').value;
    const origins = [...new Set(all.map(t => t.origin).filter(Boolean))];
    const sel = $('#libSource'); const cur = sel.value;
    sel.innerHTML = '<option value="">Alle bronnen</option>' + origins.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
    const list = all.filter(t => (!src || t.origin === src) && (!f || [t.title, t.artist, t.album].join(' ').toLowerCase().includes(f)));
    $('#libStats').textContent = `${all.length} nummers in je bibliotheek${list.length !== all.length ? ` · ${list.length} getoond` : ''}`;
    const folders = libFolders();
    $('#libMode').textContent = folders ? '☰ Lijst' : '📁 Mappen';
    const box = $('#libList'), crumbs = $('#libCrumbs');
    box.innerHTML = '';
    crumbs.classList.toggle('hidden', !folders || !!f || !all.length);
    if (!all.length) {
      box.append(el('div', { class: 'empty' }, 'Nog geen lokale muziek. Gebruik “Map toevoegen” of de knop 📡 Scan hardware.'));
      return;
    }
    const frag = document.createDocumentFragment();
    if (folders && !f) {
      // kruimelpad
      crumbs.innerHTML = '';
      const parts = ['Bibliotheek', ...libPath];
      parts.forEach((p, i) => {
        if (i) crumbs.append(el('span', { class: 'sep' }, '›'));
        crumbs.append(el('button', { class: i === parts.length - 1 ? 'on' : '', onclick: () => { libPath = libPath.slice(0, i); renderLibrary(); } }, p));
      });
      const group = (arr, key) => { const m = new Map(); for (const t of arr) { const k = key(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); } return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); };
      if (libPath.length === 0) {
        const gs = group(list, t => t.origin || 'Overig');
        if (gs.length === 1) libPath = [gs[0][0]];
        else gs.forEach(([o, ts]) => frag.append(folderRow(o, ts.length, () => { libPath = [o]; renderLibrary(); }, /sd|usb|cd/i.test(o) ? 'usb' : 'folder')));
      }
      if (libPath.length === 1) {
        const inO = list.filter(t => (t.origin || 'Overig') === libPath[0]);
        frag.append(el('div', { class: 'track play-all', onclick: () => P.play(inO[0], inO) }, el('div', { class: 'noimg fold-ic', html: K.icon('play') }), el('div', { class: 'tt' }, el('div', {}, 'Alles afspelen'), el('div', { class: 'a' }, inO.length + ' nummers')), el('span'), el('span')));
        group(inO, folderOf).forEach(([d, ts]) => frag.append(folderRow(d, ts.length, () => { libPath = [libPath[0], d]; renderLibrary(); })));
      } else if (libPath.length === 2) {
        const inF = list.filter(t => (t.origin || 'Overig') === libPath[0] && folderOf(t) === libPath[1]);
        inF.forEach(t => frag.append(trackRow(t, inF, { remove: it => K.library.remove(it.id) })));
        if (!inF.length) { libPath = []; return renderLibrary(); }
      }
    } else list.slice(0, 2000).forEach(t => frag.append(trackRow(t, list, { remove: it => K.library.remove(it.id) })));
    box.append(frag);
  }
  $('#libMode').addEventListener('click', () => { S.libMode = libFolders() ? 'list' : 'folders'; renderLibrary(); });
  $('#openAccounts').addEventListener('click', () => app.show('accounts'));
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
  const isCar = () => $('#app').classList.contains('car');
  const stageVisible = () => S.viz && (app.view === 'nowplaying' || isCar()) && !document.hidden;
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
  $('#stage').addEventListener('dblclick', () => { if (!isCar()) fullscreen($('#stage')); });
  // autoradio: één tik op de visualizer = volledig scherm aan/uit
  $('#stage').addEventListener('click', e => { if (isCar() && (e.target.tagName === 'CANVAS' || e.target.id === 'stage')) fullscreen($('#stage')); });
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

  /* ---------------- AUTORADIO-INDELING ----------------
     statusbalk · links tegels · midden visualizer + bronnen + spelerkaart · rechts bestanden/lijsten · onderbalk */
  const I = K.icon;
  const home = new Map();
  let car = null;
  const remember = n => home.set(n, { parent: n.parentNode, next: n.nextSibling });
  const restore = n => { const h = home.get(n); if (h) h.parent.insertBefore(n, h.next); };
  const clock = () => new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const today = () => new Date().toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  function wantCar() {
    if (S.layout === 'car') return true;
    if (S.layout === 'normal') return false;
    const w = innerWidth, h = innerHeight;
    return K.platform === 'android' && w > h && w >= 780 && h >= 420;
  }
  const btnI = (cls, icon, label, onclick, extra = {}) =>
    el('button', { class: cls, onclick, ...extra, html: I(icon) + (label ? `<span>${esc(label)}</span>` : '') });

  function goBack() {
    if (!saver.classList.contains('hidden')) return closeSaver();
    if (isFullscreen()) return exitFullscreen();
    if ($('#scanDialog').open) return $('#scanDialog').close();
    if (app.view === 'library' && libPath.length) { libPath.pop(); return renderLibrary(); }
    if (app.view !== 'radio') return app.show('radio');
  }

  function buildCar() {
    const tiles = [
      ['media', 'music', 'Media', () => app.show('radio')],
      ['search', 'search', 'Zoeken', () => app.show('search')],
      ['favorites', 'star', 'Favorieten', () => app.show('favorites')],
      ['settings', 'gear', 'Instellingen', () => app.show('settings')]
    ];
    const tabs = [
      ['radio', 'tower', 'Radio', () => app.show('radio')],
      ['fm', 'fm', 'FM', () => K.scan.hw('radio')],
      ['cd', 'disc', 'CD', () => K.scan.hw('disc')],
      ['library', 'usb', 'USB/SD', () => app.show('library')],
      ['nowplaying', 'queue', 'Wachtrij', () => app.show('nowplaying')]
    ];
    car = {
      status: el('header', { id: 'carStatus' },
        btnI('cs-btn', 'home', '', () => app.show('radio'), { title: 'Home' }),
        el('span', { class: 'cs-sep' }),
        el('span', { class: 'cs-clock', id: 'csClock' }, clock()),
        el('span', { class: 'cs-sep' }),
        el('span', { class: 'cs-net', id: 'csNet', html: I('wifi') }),
        el('span', { class: 'cs-title' }, 'Klankstroom'),
        el('span', { class: 'cs-date', id: 'csDate' }, today()),
        el('span', { class: 'cs-sep' }),
        btnI('cs-btn', 'scan', '', () => K.scan.run(), { title: 'Scan hardware' }),
        el('span', { class: 'cs-sep' }),
        btnI('cs-btn', 'back', '', goBack, { title: 'Terug' })),
      tiles: el('nav', { id: 'carTiles' }, ...tiles.map(([id, ic, lb, fn]) => btnI('tile', ic, lb, fn, { 'data-tile': id }))),
      center: el('section', { id: 'carCenter' }),
      tabs: el('div', { id: 'carTabs' }, ...tabs.map(([id, ic, lb, fn]) => btnI('tab', ic, lb, fn, { 'data-tab': id }))),
      card: el('div', { id: 'carCard' },
        el('div', { class: 'cc-cover', id: 'ccCover' }),
        el('div', { class: 'cc-main' },
          el('div', { class: 'cc-head' },
            el('div', { class: 'cc-titles' }, el('div', { class: 'cc-title', id: 'ccTitle' }, 'Klankstroom'), el('div', { class: 'cc-sub', id: 'ccSub' }, 'Kies rechts een zender of nummer')),
            el('div', { class: 'cc-badges', id: 'ccBadges' })),
          el('div', { class: 'cc-prog' },
            el('input', { type: 'range', id: 'ccSeek', min: 0, max: 1000, value: 0 }),
            el('div', { class: 'cc-times' }, el('span', { id: 'ccTime' }, '0:00'), el('span', { id: 'ccDur' }, 'LIVE'))),
          el('div', { class: 'cc-ctrl' },
            btnI('rnd', 'prev', '', () => P.prev(), { title: 'Vorige' }),
            btnI('rnd big', 'play', '', () => P.current ? P.toggle() : K.toast('Kies eerst een zender of nummer'), { id: 'ccPlay', title: 'Afspelen/pauze' }),
            btnI('rnd', 'next', '', () => P.next(), { title: 'Volgende' })))),
      info: el('div', { id: 'carInfo' }),
      bottom: el('footer', { id: 'carBottom' },
        el('div', { class: 'cb-brand' }, el('img', { src: 'icons/wapen.svg', alt: '' }), el('span', {}, 'Klankstroom')),
        el('div', { class: 'cb-btns' },
          btnI('cb', 'shuffle', 'Shuffle', () => $('#pShuffle').click(), { id: 'cbShuffle' }),
          btnI('cb', 'repeat', 'Herhalen', () => $('#pRepeat').click(), { id: 'cbRepeat' }),
          btnI('cb', 'star', 'Favoriet', () => $('#pFav').click(), { id: 'cbFav' }),
          btnI('cb', 'wave', 'Visualizer', toggleViz, { id: 'cbViz' }),
          btnI('cb', 'monitor', 'Screensaver', toggleSaver, { id: 'cbSaver' }),
          el('div', { class: 'cb vol' },
            el('button', { class: 'cb-mute', id: 'cbMute', onclick: () => P.toggleMute(), html: I('volume') }),
            el('input', { type: 'range', id: 'cbVol', min: 0, max: 1, step: .01, value: S.volume }))))
    };
    $('#ccSeek', car.card).addEventListener('input', e => { seeking = true; setProg(e.target.value / 10); });
    $('#ccSeek', car.card).addEventListener('change', e => { seeking = false; P.seek(e.target.value / 1000); });
    $('#cbVol', car.bottom).addEventListener('input', e => { P.setVolume(+e.target.value); $('#pVol').value = e.target.value; });
  }

  function setLayout() {
    const on = wantCar(), appEl = $('#app');
    if (on === isCar()) return;
    exitFullscreen();
    if (on) {
      if (!car) buildCar();
      remember($('#stage')); remember($('#miniViz'));
      appEl.prepend(car.status);
      appEl.append(car.tiles, car.center, car.bottom);
      car.center.append($('#stage'), car.tabs, car.card, car.info);
      $('#stage').append($('#miniViz'));
      $('#miniViz').width = 90; $('#miniViz').height = 56;
      appEl.classList.add('car');
      document.body.classList.add('car-body');
    } else {
      restore($('#miniViz')); restore($('#stage'));
      $('#miniViz').width = 120; $('#miniViz').height = 32;
      for (const k of ['status', 'tiles', 'center', 'bottom']) car[k].remove();
      appEl.classList.remove('car');
      document.body.classList.remove('car-body');
    }
    if (app.view === 'library') renderLibrary();
    updateCar();
  }

  function updateCar() {
    if (!car || !isCar()) return;
    const it = P.current, v = app.view;
    const tileOf = { radio: 'media', library: 'media', nowplaying: 'media', search: 'search', favorites: 'favorites', settings: 'settings', accounts: 'settings' };
    car.tiles.querySelectorAll('.tile').forEach(b => b.classList.toggle('on', b.dataset.tile === tileOf[v]));
    car.tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === v));
    // spelerkaart
    const cov = $('#ccCover'); cov.innerHTML = '';
    if (it) cov.append(coverEl(it, 'cc-noimg')); else cov.append(el('img', { src: 'icons/wapen.svg', alt: '', class: 'cc-logo' }));
    $('#ccTitle').textContent = it ? it.title || '' : 'Klankstroom';
    $('#ccSub').textContent = it ? [it.artist, it.album].filter(Boolean).join(' — ') : 'Kies rechts een zender of nummer';
    const b = $('#ccBadges'); b.innerHTML = '';
    if (it) {
      if (it.kind === 'station') b.append(el('span', { class: 'bdg live' }, 'LIVE'));
      if (it.codec) b.append(el('span', { class: 'bdg' }, it.codec));
      if (it.bitrate) b.append(el('span', { class: 'bdg' }, it.bitrate + ' kbps'));
    }
    $('#ccSeek').disabled = !it || it.kind === 'station';
    $('#ccPlay').innerHTML = I(P.playing ? 'pause' : 'play');
    // info onder de kaart
    const nxt = it && P.queue.length > 1 && it.kind !== 'station' ? P.queue[(P.index + 1) % P.queue.length] : null;
    const src = it && ({ radio: 'Internetradio', audius: 'Audius', archive: 'Internet Archive', jamendo: 'Jamendo', subsonic: 'Eigen server', spotify: 'Spotify', local: 'Lokaal', input: 'Ingang' }[it.source] || it.source);
    car.info.innerHTML = '';
    car.info.append(el('div', { class: 'ci-line' }, it ? [src, it.origin, folderOfSafe(it)].filter(Boolean).join(' · ') : 'Tik op FM of CD om de radio of CD-speler van je auto te openen'));
    if (nxt) car.info.append(el('div', { class: 'ci-line ci-next' }, '⏭ Volgende: ' + nxt.title + (nxt.artist ? ' — ' + nxt.artist : '')));
    if (!it || it.kind === 'station') setProg(it ? 100 : 0);
    // onderbalk-toestanden
    $('#cbShuffle').classList.toggle('on', P.shuffle);
    $('#cbRepeat').classList.toggle('on', P.repeat !== 'off');
    $('#cbFav').classList.toggle('on', !!(it && K.favs.isFav(it)));
    $('#cbViz').classList.toggle('on', S.viz);
    $('#cbSaver').classList.toggle('on', S.saver);
    $('#cbMute').innerHTML = I(P.muted ? 'mute' : 'volume');
    $('#cbVol').value = S.volume;
    $('#csNet').innerHTML = I(navigator.onLine ? 'wifi' : 'nowifi');
    $('#csNet').classList.toggle('off', !navigator.onLine);
  }
  const setProg = pct => { const s = $('#ccSeek'); if (s) s.style.setProperty('--p', pct.toFixed(1) + '%'); };
  const folderOfSafe = it => it.source === 'local' ? folderOf(it) : '';
  for (const ev of ['track', 'state', 'queue', 'favs', 'setting', 'mute']) K.on(ev, updateCar);
  K.on('time', ({ t, d }) => {
    if (!isCar()) return;
    $('#ccTime').textContent = fmtTime(t).replace('LIVE', '0:00');
    if (isFinite(d) && d > 0) { $('#ccDur').textContent = fmtTime(d); if (!seeking) { $('#ccSeek').value = (t / d) * 1000; setProg(t / d * 100); } }
    else { $('#ccDur').textContent = 'LIVE'; setProg(100); }
  });
  ['pShuffle', 'pRepeat'].forEach(id => $('#' + id).addEventListener('click', () => setTimeout(updateCar)));
  window.addEventListener('online', updateCar); window.addEventListener('offline', updateCar);
  setInterval(() => { const c = $('#csClock'); if (c) { c.textContent = clock(); $('#csDate').textContent = today(); } }, 10000);
  const _show = app.show;
  app.show = v => { _show(v); updateCar(); };
  $('#setLayout').value = S.layout || 'auto';
  $('#setLayout').addEventListener('change', e => { S.layout = e.target.value; setLayout(); });
  window.addEventListener('resize', K.debounce(setLayout, 200));
  setLayout();

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
