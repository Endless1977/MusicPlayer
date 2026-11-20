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
  /* VizLab-venster: alle schuifjes en GLB-modellen, met het geluid van Klankstroom */
  $('#openVizLab').addEventListener('click', () => {
    const cur = K.viz.mode.vizlab || 'jet';
    const ov = el('div', { id: 'vizlabOverlay' },
      el('div', { class: 'vo-bar' }, el('b', {}, 'Klankstroom VizLab'),
        el('span', { class: 'hint' }, 'Wijzigingen worden bewaard en gebruikt in de app'),
        el('button', { class: 'primary', onclick: () => { ov.remove(); K.viz.reloadVizLab(); } }, 'Klaar')),
      el('iframe', { src: 'vizlab/index.html?src=ext&scene=' + cur + '&variant=' + (S.vizVariant || 1), title: 'VizLab' }));
    document.body.append(ov);
  });
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
    if (p) { p.classList.remove('pseudo-fs'); bars(true); setTimeout(applyBars, 50); }
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
    if (K.platform === 'android' && !$('.pseudo-fs')) { bars(true); setTimeout(applyBars, 50); }
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
  /* prestaties: lichte modus (body.lite) en apparaatinfo */
  const applyPerf = () => {
    document.body.classList.toggle('lite', K.perf.lite);
    const cv = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1];
    $('#devInfo').textContent = [cv ? 'WebView/Chrome ' + cv : '', K.perf.gpu || 'GPU onbekend', K.perf.lite ? 'lichte modus' : 'alle effecten', innerWidth + '×' + innerHeight].filter(Boolean).join(' · ');
  };
  $('#setPerf').value = S.perf || 'auto';
  $('#setPerf').addEventListener('change', e => { S.perf = e.target.value; if (S.perf !== 'auto') K.perf.slow = false; applyPerf(); });
  $('#setHideBars').checked = S.hideBars !== false;
  $('#setHideBars').addEventListener('change', e => { S.hideBars = e.target.checked; applyBars(); });
  K.on('perf', applyPerf);
  /* Autoradio (MTC): navigatie-onderdrukking en testpaneel */
  {
    const showMtc = () => {
      const on = !!(K.mtc && K.mtc.available);
      $('#naviRow').classList.toggle('hidden', !on); $('#mtcRow').classList.toggle('hidden', !on);
      if (on && K.mtc.navi) {
        const n = K.mtc.navi, apps = K.scan.getHw();
        $('#naviInfo').textContent = n.app ? 'Nu: ' + ((apps.nav && apps.nav.package === n.app) ? apps.nav.label + ' (' + n.app + ')' : n.app) + ' — de radio wordt zachter als deze spreekt'
          : 'Nog geen navigatie-app ingesteld: kies er een, dan dempt de autoradio de muziek als deze spreekt';
      }
    };
    K.on('mtc', showMtc);
    $('#naviPick').addEventListener('click', () => K.scan.pickNav());
    $('#mtcTest').addEventListener('click', () => K.mtc.openTestPanel());
  }
  /* Systeemverkenner (Android): alleen lezen, resultaat op de SD-kaart */
  {
    const MS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
    if (K.platform === 'android' && MS && MS.systemDump) {
      $('#dumpRow').classList.remove('hidden');
      $('#dumpGo').addEventListener('click', async () => {
        const dlg = $('#scanDialog'), body = $('#scanBody');
        body.innerHTML = '';
        const bar = el('progress', { max: 100, value: 0, style: 'width:100%;height:18px' });
        const msg = el('div', { class: 'hint', style: 'margin:8px 0;word-break:break-all' }, 'Starten…');
        body.append(el('h3', {}, 'Systeemverkenner'), el('p', { class: 'hint' }, 'Alleen lezen, er wordt niets aan het systeem veranderd. Laat de autoradio aan staan; dit kan enkele minuten duren.'), bar, msg);
        if (!dlg.open) dlg.showModal();
        const sub = await MS.addListener('dumpProgress', e => { bar.value = e.pct; msg.textContent = e.msg; });
        try {
          const r = await MS.systemDump({ allApps: $('#dumpAll').checked });
          bar.value = 100;
          msg.innerHTML = '';
          msg.append(el('b', {}, 'Klaar! '), `${r.mb} MB van ${r.gekopieerd} apps + framework gekopieerd (${r.apps} apps geïnventariseerd). Nog ${r.vrijMb} MB vrij.`,
            el('br'), 'Map: ', el('code', {}, r.map),
            el('br'), 'Stop de SD-kaart in je pc en kijk in Android/data/nl.endless.klankstroom/files/.');
        } catch (e) { msg.textContent = 'Mislukt: ' + (e.message || e); }
        finally { sub && sub.remove && sub.remove(); }
      });
    }
  }
  window.addEventListener('resize', K.debounce(applyPerf, 300));
  applyPerf();

  /* ---------------- AUTORADIO-INDELING ----------------
     Naar het voorbeeld: statusbalk · tegels (Navigatie/Media/Telefoon/Instellingen) ·
     visualizer + tabbladen (Radio/CD/USB/Stream) + spelerkaart · bladerlijst "Bestanden" · onderbalk */
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
    // nieuwe indeling is standaard: liggend (pc, tablet, autoradio) én staand (telefoon, eigen variant)
    const w = innerWidth, h = innerHeight;
    return h > w ? w >= 320 : (w >= 700 && h >= 380);
  }
  const btnI = (cls, icon, label, onclick, extra = {}) =>
    el('button', { class: cls, onclick, ...extra, html: I(icon) + (label ? `<span>${esc(label)}</span>` : '') });
  const sw = id => el('span', { class: 'sw', id });

  /* ---------- bladerlijst (rechts) ---------- */
  const GENRES = [['Pop', 'pop'], ['Rock', 'rock'], ['Dance', 'dance'], ['Jazz', 'jazz'], ['Klassiek', 'classical'], ['Hiphop', 'hiphop'],
    ['80s', '80s'], ['90s', '90s'], ['Nieuws', 'news'], ['Chillout', 'chillout'], ['Lofi', 'lofi'], ['Metal', 'metal'], ['Soul', 'soul'], ['Country', 'country'], ['Oldies', 'oldies']];
  const B = { tab: 'radio', stack: [], q: '', searching: false, page: null };   // stack: [{ title, load }]

  const rowsFolder = (title, sub, open, icon = 'folder') => ({ icon, title, sub, chev: true, onclick: open });
  const stationRow = (it, list) => ({ img: it.cover, icon: 'tower', title: it.title, sub: it.artist, badge: it.bitrate ? it.bitrate + ' kbps' : '', item: it, fav: true, onclick: () => P.play(it, list) });
  const trackRowB = (it, list) => ({ img: it.cover, icon: 'note', title: it.title || 'Onbekend', sub: [it.artist, it.album].filter(Boolean).join(' — '), badge: it.duration ? fmtTime(it.duration) : '', item: it, fav: true,
    onclick: () => P.play(it, list) });
  const albumRow = it => rowsFolder(it.title, it.artist || 'Album', () => openFolder(it.title, async () => { const ts = await K.sources.expand(it); return ts.map(t => trackRowB(t, ts)); }));

  function openFolder(title, load) { B.stack.push({ title, load }); B.q = ''; B.searching = false; renderBrowser(); }
  function browserBack() { if (B.page) { B.page = null; renderBrowser(); return true; } if (B.searching) { B.searching = false; B.q = ''; renderBrowser(); return true; } if (B.stack.length) { B.stack.pop(); renderBrowser(); return true; } return false; }


  /* ---- autoradio-hardware rechtstreeks (K.mtc): FM-tuner, CD/DVD, Bluetooth-telefoon ---- */
  const M = K.mtc;
  const hasMtc = () => M && M.available;
  const mBtn = (icon, label, fn, cls = '') => el('button', { class: 'm-btn ' + cls, onclick: async e => { e.stopPropagation(); try { await fn(); } catch (err) { K.toast('Mislukt: ' + (err.message || err)); } }, html: (icon ? I(icon) : '') + (label ? '<span>' + label + '</span>' : '') });
  const fmPlaying = () => P.current && P.current.source === 'fm';
  function fmPanel() {
    return el('div', { class: 'm-panel fm-panel' },
      el('div', { class: 'm-disp' },
        el('div', { class: 'm-big', id: 'fmFreq' }, M.fmtFreq(M.fm.khz)),
        el('div', { class: 'm-ps', id: 'fmPs' }, M.fm.psn || ''),
        el('div', { class: 'm-rt', id: 'fmRt' }, M.fm.rt || ''),
        el('div', { class: 'm-meta', id: 'fmMeta' })),
      el('div', { class: 'm-row' },
        mBtn('prev', '', () => M.radio.seek('down')),
        mBtn('', '−', () => M.radio.step('down'), 'sq'),
        mBtn('play', '', () => fmPlaying() ? P.toggle() : P.play(M.radio.item(M.fm.khz, M.fm.psn)), 'primary'),
        mBtn('', '+', () => M.radio.step('up'), 'sq'),
        mBtn('next', '', () => M.radio.seek('up'))),
      el('div', { class: 'm-row' },
        mBtn('star', '', () => M.radio.save()),
        mBtn('scan', 'Scan', () => { if (!fmPlaying()) P.play(M.radio.item()); return M.radio.seek('auto'); }),
        mBtn('', 'MHz…', async () => {
          const v = prompt('Frequentie in MHz (bv. 103,5)'); if (!v) return;
          const khz = Math.round(parseFloat(v.replace(',', '.')) * 1000); if (!(khz > 60000 && khz < 110000)) return K.toast('Ongeldige frequentie');
          return P.play(M.radio.item(khz));
        })));
  }
  function cdPanel() {
    return el('div', { class: 'm-panel cd-panel' },
      el('div', { class: 'm-disp' },
        el('div', { class: 'm-big', id: 'cdTitle' }, M.dvd.title || 'CD / DVD'),
        el('div', { class: 'm-rt', id: 'cdMeta' })),
      el('div', { class: 'm-row' },
        mBtn('prev', '', () => M.dvd.cmd(M.DVD.prev), 'sq'),
        mBtn('', '⏪', () => M.dvd.cmd(M.DVD.back), 'sq'),
        mBtn('play', '', () => P.current && P.current.source === 'cd' ? P.toggle() : P.play(M.dvd.item()), 'primary'),
        mBtn('', '⏩', () => M.dvd.cmd(M.DVD.fwd), 'sq'),
        mBtn('next', '', () => M.dvd.cmd(M.DVD.next), 'sq')),
      el('div', { class: 'm-row' },
        mBtn('', '⏹', () => M.dvd.cmd(M.DVD.stop), 'sq'),
        mBtn('repeat', '', () => M.dvd.cmd(M.DVD.repeat), 'sq'),
        mBtn('', '⏏', () => M.dvd.eject(), 'sq')));
  }
  function phonePanel() {
    const nr = el('input', { type: 'tel', id: 'btNr', placeholder: 'Nummer', class: 'm-nr' });
    const pad = el('div', { class: 'm-pad' }, ...'123456789*0#'.split('').map(c => el('button', { onclick: () => { nr.value += c; if (M.bt.callIn || M.bt.dialOut) M.btCall('dialOutSub', c).catch(() => {}); } }, c)));
    return el('div', { class: 'm-panel bt-panel' },
      el('div', { class: 'm-disp' },
        el('div', { class: 'm-big', id: 'btDev' }, '…'),
        el('div', { class: 'm-rt', id: 'btCallInfo' }),
        el('div', { class: 'm-meta', id: 'btMusicInfo' })),
      el('div', { class: 'm-row' }, nr, mBtn('', '⌫', () => { nr.value = nr.value.slice(0, -1); }, 'sq')),
      pad,
      el('div', { class: 'm-row' },
        mBtn('phone', '', () => M.bt.callIn ? M.btCall('answerCall') : nr.value.trim() ? M.btCall('dialOut', nr.value.trim()) : M.btCall('reDial'), 'call'),
        mBtn('phone', '', () => M.btCall('hangupCall'), 'hang')),
      el('div', { class: 'm-row' },
        mBtn('', 'Naar telefoon', () => M.btCall('switchVoice')),
        mBtn('bt', 'Muziek', () => P.play(M.btItem())),
        mBtn('', 'Spraak', () => M.btCall('voiceControl'))));
  }
  function updateMtcPanels() {
    if (!hasMtc()) return;
    const q = id => document.getElementById(id);
    if (q('fmFreq')) {
      q('fmFreq').textContent = M.fmtFreq(M.fm.khz); q('fmPs').textContent = M.fm.psn || (M.fm.seeking ? 'Zoeken…' : '');
      q('fmRt').textContent = M.fm.rt || '';
      q('fmMeta').textContent = [M.source === 'fm' ? 'FM aan' : 'FM uit', M.fm.stereo ? 'stereo' : '', M.fm.strength ? 'signaal ' + M.fm.strength : '', M.fm.scan.length ? M.fm.scan.length + ' gevonden' : ''].filter(Boolean).join(' · ');
    }
    if (q('cdTitle')) {
      q('cdTitle').textContent = M.dvd.title || 'CD / DVD';
      q('cdMeta').textContent = [M.source === 'dvd' ? 'CD aan' : 'CD uit', M.dvd.cnt ? 'nummer ' + M.dvd.idx + ' van ' + M.dvd.cnt : '', M.dvd.len ? M.dvd.pos + ' / ' + M.dvd.len : ''].filter(Boolean).join(' · ');
    }
    if (q('btDev')) {
      q('btDev').textContent = !M.btService ? 'Bluetooth-dienst niet bereikbaar' : M.btConnected() ? (M.bt.dev || 'Telefoon verbonden') : 'Geen telefoon verbonden';
      q('btCallInfo').textContent = M.bt.callIn ? '📞 Inkomend: ' + M.bt.callIn : M.bt.dialOut ? '📞 Bellen: ' + M.bt.dialOut : M.bt.phone ? 'In gesprek: ' + M.bt.phone : '';
      const m = M.btMusic(); q('btMusicInfo').textContent = m.title ? '♪ ' + [m.title, m.artist].filter(Boolean).join(' — ') : '';
    }
  }
  if (M) {
    K.on('mtc', updateMtcPanels);
    K.on('fmpresets', () => { if (isCar() && B.tab === 'radio' && !B.stack.length && !B.page && !B.searching) renderBrowser(); });
    K.on('btcall', n => { K.toast('Inkomend gesprek: ' + n); if (isCar()) setTab('phone'); });
  }
  const presetRow = p => ({ icon: 'fm', title: p.name || M.fmtFreq(p.khz), sub: 'FM · ' + M.fmtFreq(p.khz), badge: '', item: M.radio.item(p.khz, p.name), chev: false,
    onclick: () => P.play(M.radio.item(p.khz, p.name), M.radio.presets().map(x => M.radio.item(x.khz, x.name))) });

  const ROOT = {
    radio: { title: 'Radio', load: async () => {
      const rows = [];
      if (hasMtc()) {
        rows.push({ node: fmPanel() });
        for (const p of M.radio.presets()) rows.push(presetRow(p));
        rows.push({ icon: 'fm', title: 'Radio-app van de fabrikant', sub: (K.scan.getHw().radio || {}).label || 'Openen als reserve', chev: true, onclick: () => K.scan.hw('radio') });
        setTimeout(updateMtcPanels, 0);
      } else if (K.platform === 'android') rows.push({ icon: 'fm', title: 'FM/AM-tuner van de auto', sub: (K.scan.getHw().radio || {}).label || 'Radio-app van je autoradio openen', chev: true, onclick: () => K.scan.hw('radio') });
      rows.push(rowsFolder('Favoriete zenders', K.favs.stations.length + ' zenders', () => openFolder('Favoriete zenders', async () => K.favs.stations.map(s => stationRow(s, K.favs.stations))), 'star'));
      rows.push(rowsFolder('Populair in Nederland', 'Meest beluisterd', () => openFolder('Populair in Nederland', async () => { const l = await K.radio.search({ country: 'NL' }); return l.map(s => stationRow(s, l)); })));
      rows.push(rowsFolder('Populair wereldwijd', 'Meest beluisterd', () => openFolder('Wereldwijd', async () => { const l = await K.radio.search({ country: '' }); return l.map(s => stationRow(s, l)); })));
      for (const [n, tag] of GENRES) rows.push(rowsFolder(n, 'Genre', () => openFolder(n, async () => { const l = await K.radio.search({ tag, country: '' }); return l.map(s => stationRow(s, l)); })));
      return rows;
    }, search: async q => { const l = await K.radio.search({ name: q, country: '' }); return l.map(s => stationRow(s, l)); }, hint: 'Zoek zender…' },

    usb: { title: 'Bestanden', load: async () => {
      const all = K.library.tracks;
      const rows = [];
      const byO = new Map(); for (const t of all) { const o = t.origin || 'Overig'; if (!byO.has(o)) byO.set(o, []); byO.get(o).push(t); }
      for (const [o, ts] of [...byO.entries()].sort((a, b) => a[0].localeCompare(b[0])))
        rows.push(rowsFolder(o, ts.length + ' items', () => openFolder(o, async () => {
          const byF = new Map(); for (const t of ts) { const f = folderOf(t); if (!byF.has(f)) byF.set(f, []); byF.get(f).push(t); }
          return [{ icon: 'play', title: 'Alles afspelen', sub: ts.length + ' nummers', onclick: () => P.play(ts[0], ts) },
            ...[...byF.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([f, fs]) => rowsFolder(f, fs.length + ' items', () => openFolder(f, async () => fs.map(t => trackRowB(t, fs)))))];
        }), /sd|usb|cd/i.test(o) ? 'usb' : 'folder'));
      rows.push({ icon: 'scan', title: 'Muziek zoeken op SD/USB', sub: 'Scan de opslag van je autoradio', chev: true, onclick: () => K.scan.run() });
      if (K.platform !== 'android') rows.push({ icon: 'plus', title: 'Map toevoegen', sub: 'Kies een map met muziek', chev: true, onclick: () => $('#addFolder').click() });
      return rows;
    }, search: async q => { const l = K.library.tracks.filter(t => [t.title, t.artist, t.album].join(' ').toLowerCase().includes(q.toLowerCase())); return l.slice(0, 300).map(t => trackRowB(t, l)); }, hint: 'Zoek in je muziek…' },

    stream: { title: 'Stream', load: async () => [
      { icon: 'search', title: 'Online zoeken', sub: 'Audius · Internet Archive · Jamendo · je accounts', chev: true, onclick: () => { B.searching = true; renderBrowser(); } },
      rowsFolder('Favoriete nummers', K.favs.tracks.length + ' items', () => openFolder('Favoriete nummers', async () => K.favs.tracks.map(t => trackRowB(t, K.favs.tracks))), 'star'),
      rowsFolder('Laatst gespeeld', K.recent.list.length + ' items', () => openFolder('Laatst gespeeld', async () => { const l = K.recent.list; return l.map(t => t.kind === 'station' ? stationRow(t, [t]) : trackRowB(t, l.filter(x => x.kind === 'track'))); })),
      rowsFolder('Wachtrij', P.queue.length + ' items', () => openFolder('Wachtrij', async () => P.queue.map(t => t.kind === 'station' ? stationRow(t, P.queue) : trackRowB(t, P.queue))), 'queue'),
      { icon: 'link', title: 'Accounts koppelen', sub: 'Spotify, eigen server, Jamendo', chev: true, onclick: () => showPage('accounts') }
    ], search: async q => {
      const out = [];
      await K.sources.searchAll(q, (p, items) => { for (const it of items) out.push(it.kind === 'album' ? albumRow(it) : trackRowB(it, items.filter(x => x.kind === 'track'))); });
      return out;
    }, hint: 'Artiest, nummer, genre…' },

    phone: { title: 'Telefoon', load: async () => {
      setTimeout(() => { updateMtcPanels(); M.pollBt(); }, 0);
      const rows = [{ node: phonePanel() }];
      try {
        const hist = await M.btCall('getHistoryList');
        for (const h of (hist || []).slice(0, 30)) {
          const n = M.number(h);
          rows.push({ icon: 'phone', title: String(h).replace(/\s+/g, ' ').slice(0, 60), sub: n ? 'Tik om te bellen' : '', chev: false, onclick: () => n && M.btCall('dialOut', n) });
        }
      } catch {}
      rows.push({ icon: 'phone', title: 'Telefoon-app van de fabrikant', sub: (K.scan.getHw().phone || {}).label || 'Openen als reserve', chev: true, onclick: () => K.scan.hw('phone') });
      return rows;
    } },

    cd: { title: 'CD', load: async () => {
      const a = K.scan.getHw().disc;
      if (hasMtc()) { setTimeout(() => { updateMtcPanels(); M.dvd.poll(); }, 0); return [{ node: cdPanel() },
        { icon: 'disc', title: a ? 'Open ' + a.label : 'DVD-app van de fabrikant', sub: 'Voor DVD-beeld en menu', chev: true, onclick: () => K.scan.hw('disc') },
        { icon: 'usb', title: 'CD met MP3’s', sub: 'Data-CD’s verschijnen onder USB na een scan', chev: true, onclick: () => setTab('usb') }]; }
      return [
        { icon: 'disc', title: a ? 'Open ' + a.label : 'CD/DVD-speler openen', sub: 'Ingebouwde speler van je autoradio', chev: true, onclick: () => K.scan.hw('disc') },
        { icon: 'gear', title: 'Andere CD-app kiezen', sub: a ? 'Nu: ' + a.package : 'Kies de CD/DVD-app van je autoradio', chev: true, onclick: () => K.scan.hw('disc', true) },
        { icon: 'usb', title: 'CD met MP3’s', sub: 'Data-CD’s verschijnen onder USB na een scan', chev: true, onclick: () => setTab('usb') }];
    } }
  };

  let renderTok = 0;
  async function renderBrowser() {
    if (!car) return;
    const tok = ++renderTok;
    const root = ROOT[B.tab];
    const top = B.stack[B.stack.length - 1];
    const title = B.page ? (B.page === 'settings' ? 'Instellingen' : 'Accounts') : B.searching ? 'Zoeken' : top ? top.title : root.title;
    car.bTitle.textContent = title;
    car.bBack.classList.toggle('hidden', !(B.stack.length || B.searching || B.page));
    car.bSearchBtn.classList.toggle('hidden', !root.search || !!B.page);
    car.browser.classList.toggle('page', !!B.page);
    $('#main').classList.toggle('car-page', !!B.page);
    if (B.page) { _show(B.page); car.card2.classList.add('hidden'); return; }
    car.bSearch.classList.toggle('hidden', !B.searching);
    car.bInput.placeholder = root.hint || 'Zoeken…';
    const list = car.bList;
    let rows;
    if (B.searching && !B.q) { list.innerHTML = ''; list.append(el('div', { class: 'b-note' }, 'Typ en druk op Enter')); car.card2.classList.add('hidden'); return; }
    list.innerHTML = '<div class="b-note">Laden…</div>';
    try { rows = B.searching ? await root.search(B.q) : await (top ? top.load() : root.load()); }
    catch { rows = null; }
    if (tok !== renderTok) return;
    list.innerHTML = '';
    if (!rows) { list.append(el('div', { class: 'b-note' }, navigator.onLine ? 'Kan dit nu niet laden' : 'Offline — kies USB voor je eigen muziek')); return; }
    if (!rows.length) list.append(el('div', { class: 'b-note' }, 'Leeg'));
    for (const r of rows) list.append(rowEl(r));
    // zwevend kaartje rechtsonder (zoals in het voorbeeld): huidige map + aantal
    const n = rows.filter(r => r.item || r.chev).length;
    car.card2.classList.toggle('hidden', !!(rows[0] && rows[0].node));
    car.card2Title.textContent = title;
    car.card2Sub.textContent = n + (n === 1 ? ' item' : ' items');
    markBrowser();
  }
  function rowEl(r) {
    if (r.node) return r.node;
    const ic = el('span', { class: 'b-ic' + (r.icon === 'folder' || r.icon === 'usb' && r.chev ? ' fold' : ''), html: I(r.icon === 'usb' && r.chev ? 'folder' : r.icon || 'folder') });
    if (r.img) {
      const img = el('img', { src: r.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.onerror = () => img.replaceWith(el('span', { class: 'b-ic', html: I(r.icon) }));
      ic.innerHTML = ''; ic.className = 'b-ic img'; ic.append(img);
    }
    const row = el('div', { class: 'b-row', 'data-id': r.item ? r.item.id : '' }, ic,
      el('div', { class: 'b-txt' }, el('div', { class: 'b-t' }, r.title || ''), r.sub ? el('div', { class: 'b-s' }, r.sub) : null));
    if (r.badge) row.append(el('span', { class: 'b-badge' }, r.badge));
    if (r.fav && r.item) {
      const f = el('button', { class: 'b-fav' + (K.favs.isFav(r.item) ? ' on' : ''), html: I('star') });
      f.addEventListener('click', e => { e.stopPropagation(); f.classList.toggle('on', K.favs.toggle(r.item)); });
      row.append(f);
    } else if (r.chev) row.append(el('span', { class: 'b-chev', html: I('chev') }));
    row.addEventListener('click', r.onclick);
    return row;
  }
  const markBrowser = () => { if (car) car.bList.querySelectorAll('.b-row').forEach(n => n.classList.toggle('sel', !!P.current && n.dataset.id === P.current.id)); };
  function setTab(t) {
    if (t === 'cd' && !hasMtc() && K.scan.getHw().disc) K.scan.hw('disc');
    B.tab = t; B.stack = []; B.q = ''; B.searching = false; B.page = null;
    renderBrowser(); updateCar();
  }
  function showPage(v) { B.page = v; renderBrowser(); updateCar(); }

  function goBack() {
    if (!saver.classList.contains('hidden')) return closeSaver();
    if (isFullscreen()) return exitFullscreen();
    if ($('#scanDialog').open) return $('#scanDialog').close();
    if (isCar() && browserBack()) return;
    if (!isCar() && app.view !== 'radio') return app.show('radio');
  }
  app.goBack = goBack;
  app.browserBack = () => browserBack();

  function buildCar() {
    car = {};
    car.status = el('header', { id: 'carStatus' },
      btnI('cs-btn', 'home', '', () => { setTab('radio'); }, { title: 'Home' }),
      el('span', { class: 'cs-sep' }),
      el('span', { class: 'cs-clock', id: 'csClock' }, clock()),
      el('span', { class: 'cs-sep' }),
      el('span', { class: 'cs-net', id: 'csNet', html: I('wifi') }),
      el('span', { class: 'cs-gap' }),
      el('span', { class: 'cs-date', id: 'csDate' }, today()),
      el('span', { class: 'cs-sep' }),
      btnI('cs-btn', 'scan', '', () => K.scan.run(), { title: 'Scan hardware' }),
      el('span', { class: 'cs-sep' }),
      btnI('cs-btn', 'back', '', goBack, { title: 'Terug' }));
    car.tiles = el('nav', { id: 'carTiles' },
      btnI('tile', 'nav', 'Navigatie', () => K.scan.hw('nav'), { 'data-tile': 'nav' }),
      btnI('tile', 'music', 'Media', () => { B.page = null; renderBrowser(); updateCar(); }, { 'data-tile': 'media' }),
      btnI('tile', 'phone', 'Telefoon', () => hasMtc() ? setTab('phone') : K.scan.hw('phone'), { 'data-tile': 'phone' }),
      btnI('tile', 'gear', 'Instellingen', () => showPage('settings'), { 'data-tile': 'settings' }));
    car.center = el('section', { id: 'carCenter' });
    car.tabs = el('div', { id: 'carTabs' }, ...[['radio', 'tower', 'Radio'], ['cd', 'disc', 'CD'], ['usb', 'usb', 'USB'], ['stream', 'globe', 'Stream']]
      .map(([id, ic, lb]) => btnI('tab', ic, lb, () => setTab(id), { 'data-tab': id })));
    car.card = el('div', { id: 'carCard' },
      el('div', { class: 'cc-cover', id: 'ccCover' }),
      el('div', { class: 'cc-main' },
        el('div', { class: 'cc-head' },
          el('div', { class: 'cc-titles' }, el('div', { class: 'cc-title', id: 'ccTitle' }, 'Klankstroom'), el('div', { class: 'cc-sub', id: 'ccSub' }, '')),
          el('div', { class: 'cc-badges', id: 'ccBadges' })),
        el('div', { class: 'cc-prog' },
          el('input', { type: 'range', id: 'ccSeek', min: 0, max: 1000, value: 0 }),
          el('div', { class: 'cc-times' }, el('span', { id: 'ccTime' }, '0:00'), el('span', { id: 'ccDur' }, 'LIVE'))),
        el('div', { class: 'cc-ctrl' },
          btnI('rnd', 'prev', '', () => P.prev(), { title: 'Vorige' }),
          btnI('rnd big', 'play', '', () => P.current ? P.toggle() : K.toast('Kies rechts een zender of nummer'), { id: 'ccPlay', title: 'Afspelen/pauze' }),
          btnI('rnd', 'next', '', () => P.next(), { title: 'Volgende' }))));
    car.panel = el('div', { id: 'carPanel' });
    car.bTitle = el('span', { class: 'b-title' }, 'Radio');
    car.bBack = btnI('b-hbtn hidden', 'up', '', () => browserBack(), { title: 'Terug' });
    car.bSearchBtn = btnI('b-hbtn', 'search', '', () => { B.searching = !B.searching; B.q = ''; renderBrowser(); if (B.searching) setTimeout(() => car.bInput.focus(), 50); }, { title: 'Zoeken' });
    car.bInput = el('input', { type: 'search', placeholder: 'Zoeken…' });
    car.bInput.addEventListener('keydown', e => { if (e.key === 'Enter') { B.q = car.bInput.value.trim(); car.bInput.blur(); renderBrowser(); } });
    car.bSearch = el('div', { class: 'b-search hidden' }, car.bInput, btnI('b-go', 'search', '', () => { B.q = car.bInput.value.trim(); renderBrowser(); }));
    car.bList = el('div', { class: 'b-list' });
    car.card2Title = el('div', { class: 'c2-t' }); car.card2Sub = el('div', { class: 'c2-s' });
    car.card2 = el('div', { class: 'b-card hidden', html: I('folder', 'c2-ic') }, car.card2Title, car.card2Sub);
    car.browser = el('div', { id: 'carBrowser' },
      el('div', { class: 'b-head' }, car.bBack, el('span', { class: 'b-hic', html: I('folder') }), car.bTitle, car.bSearchBtn),
      car.bSearch, car.bList, car.card2);
    car.panel.append(car.browser);
    car.bottom = el('footer', { id: 'carBottom' },
      el('div', { class: 'cb-deco' }, el('img', { src: 'icons/wapen.svg', alt: '' })),
      el('div', { class: 'cb-btns' },
        btnI('cb', 'shuffle', 'Shuffle', () => $('#pShuffle').click(), { id: 'cbShuffle' }),
        btnI('cb', 'repeat', 'Herhalen', () => $('#pRepeat').click(), { id: 'cbRepeat' }),
        btnI('cb', 'star', 'Favoriet', () => $('#pFav').click(), { id: 'cbFav' }),
        el('button', { class: 'cb cb-sw', id: 'cbViz', onclick: toggleViz, html: '<span class="cb-row">' + I('wave') + '<span class="sw"></span></span><span>Visualizer</span>' }),
        el('button', { class: 'cb cb-sw', id: 'cbSaver', onclick: toggleSaver, html: '<span class="cb-row">' + I('monitor') + '<span class="sw"></span></span><span>Screensaver</span>' }),
        el('div', { class: 'cb vol' },
          el('button', { class: 'cb-mute', id: 'cbMute', onclick: () => P.toggleMute(), html: I('volume') }),
          el('input', { type: 'range', id: 'cbVol', min: 0, max: 1, step: .01, value: S.volume }))));
    $('#ccSeek', car.card).addEventListener('input', e => { seeking = true; setProg(e.target.value / 10); });
    $('#ccSeek', car.card).addEventListener('change', e => { seeking = false; P.seek(e.target.value / 1000); });
    $('#cbVol', car.bottom).addEventListener('input', e => { P.setVolume(+e.target.value); $('#pVol').value = e.target.value; });
  }

  function setLayout() {
    const on = wantCar(), appEl = $('#app');
    appEl.classList.toggle('portrait', on && innerHeight > innerWidth);
    applyBars();
    if (on === isCar()) return;
    exitFullscreen();
    if (on) {
      if (!car) buildCar();
      remember($('#stage')); remember($('#miniViz')); remember($('#main'));
      appEl.prepend(car.status);
      appEl.append(car.tiles, car.center, car.panel, car.bottom);
      car.center.append($('#stage'), car.tabs, car.card);
      car.panel.append($('#main'));
      $('#stage').append($('#miniViz'));
      $('#miniViz').width = 70; $('#miniViz').height = 64;
      appEl.classList.add('car');
      document.body.classList.add('car-body');
      if (!K.LS.get('carVizSet', false)) { K.LS.set('carVizSet', true); S.vizMode = 'mountains'; S.vizVariant = 1; }
      renderBrowser();
    } else {
      restore($('#miniViz')); restore($('#stage')); restore($('#main'));
      $('#main').classList.remove('car-page');
      $('#miniViz').width = 120; $('#miniViz').height = 32;
      for (const k of ['status', 'tiles', 'center', 'panel', 'bottom']) car[k].remove();
      appEl.classList.remove('car');
      document.body.classList.remove('car-body');
      _show(app.view);
    }
    updateCar();
  }

  function applyBars() {
    if (K.platform !== 'android' || isFullscreen() || !saver.classList.contains('hidden')) return;
    bars(!(S.hideBars !== false && wantCar() && innerWidth > innerHeight));
  }
  function updateCar() {
    if (!car || !isCar()) return;
    const it = P.current;
    car.tiles.querySelectorAll('.tile').forEach(b => b.classList.toggle('on', b.dataset.tile === (B.page ? 'settings' : 'media')));
    car.tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === B.tab));
    const cov = $('#ccCover'); cov.innerHTML = '';
    if (it) cov.append(coverEl(it, 'cc-noimg')); else cov.append(el('img', { src: 'icons/wapen.svg', alt: '', class: 'cc-logo' }));
    $('#ccTitle').textContent = it ? it.title || '' : 'Klankstroom';
    $('#ccSub').textContent = it ? [it.artist, it.album].filter(Boolean).join(' — ') : 'Kies rechts een zender of nummer';
    const b = $('#ccBadges'); b.innerHTML = '';
    if (it) {
      b.append(el('span', { class: 'bdg' }, it.kind === 'station' ? 'LIVE' : (it.codec || (it.source === 'local' ? 'USB' : 'STREAM'))));
      b.append(el('span', { class: 'bdg-sig' + (P.playing ? ' on' : ''), html: I('signal') }));
    }
    $('#ccSeek').disabled = !it || it.kind === 'station';
    if (!it || it.kind === 'station') setProg(it ? 100 : 0);
    $('#ccPlay').innerHTML = I(P.playing ? 'pause' : 'play');
    $('#cbShuffle').classList.toggle('on', P.shuffle);
    $('#cbRepeat').classList.toggle('on', P.repeat !== 'off');
    $('#cbFav').classList.toggle('on', !!(it && K.favs.isFav(it)));
    $('#cbViz').classList.toggle('on', S.viz);
    $('#cbSaver').classList.toggle('on', S.saver);
    $('#cbMute').innerHTML = I(P.muted ? 'mute' : 'volume');
    $('#cbVol').value = S.volume;
    $('#csNet').innerHTML = I(navigator.onLine ? 'wifi' : 'nowifi');
    $('#csNet').classList.toggle('off', !navigator.onLine);
    markBrowser();
  }
  const setProg = pct => { const s = $('#ccSeek'); if (s) s.style.setProperty('--p', pct.toFixed(1) + '%'); };
  for (const ev of ['track', 'state', 'queue', 'favs', 'setting', 'mute']) K.on(ev, updateCar);
  K.on('library', () => { if (isCar() && B.tab === 'usb' && !B.page) renderBrowser(); });
  K.on('mtc', () => { if (hasMtc() && !app._mtcSeen) { app._mtcSeen = true; if (isCar() && !B.page && !B.stack.length) renderBrowser(); } });
  K.on('hwapps', () => { if (isCar() && !B.page && (B.tab === 'cd' || B.tab === 'radio') && !B.stack.length) renderBrowser(); });
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
  app.show = v => {
    if (isCar()) {           // in de auto-indeling: pagina's rechts tonen
      if (v === 'settings' || v === 'accounts') return showPage(v);
      if (v === 'library') return setTab('usb');
      if (v === 'search') return setTab('stream');
      B.page = null; return renderBrowser();
    }
    _show(v); updateCar();
  };
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
    else if (isCar()) { if (!app.browserBack()) C.App.minimizeApp ? C.App.minimizeApp() : C.App.exitApp(); }
    else if (app.view !== 'radio') app.show('radio');
    else C.App.minimizeApp ? C.App.minimizeApp() : C.App.exitApp();
  });

  /* PWA: offline werken in de browser */
  if (K.platform === 'web' && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});

  K.library.load();
})();
