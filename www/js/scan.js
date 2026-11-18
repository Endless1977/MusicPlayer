/* Klankstroom — scanknop: zoekt lokale hardware (SD-kaart, interne opslag, USB, CD-speler, FM-radio, lijn-ingang) */
'use strict';
(() => {
  const dlg = K.$('#scanDialog'), body = K.$('#scanBody');
  const item = (title, status, ok, ...actions) =>
    K.el('div', { class: 'scan-item' },
      K.el('div', {}, K.el('div', {}, title), K.el('div', { class: 'st ' + (ok ? 'ok' : 'no') }, status)),
      K.el('div', { class: 'btns' }, ...actions));
  const btn = (label, fn, primary) => K.el('button', { class: primary ? 'primary' : '', onclick: fn }, label);

  /* Overal: audio-ingangen (line-in, USB-audio, HDMI-capture) — hiermee kun je een externe CD-speler of radio laten meespelen */
  async function inputs() {
    const out = [];
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return out;
    let devs = await navigator.mediaDevices.enumerateDevices();
    devs = devs.filter(d => d.kind === 'audioinput');
    if (!devs.length) return out;
    const named = devs.some(d => d.label);
    out.push(K.el('h3', {}, 'Audio-ingangen'));
    if (!named) out.push(item('Ingangen gevonden: ' + devs.length, 'Namen zichtbaar na toestemming', true,
      btn('Toestaan', async () => { try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); run(); } catch { K.toast('Geen toestemming'); } })));
    else for (const d of devs) {
      if (d.deviceId === 'default' || d.deviceId === 'communications') continue;
      out.push(item(d.label, 'Live meeluisteren (gebruik een koptelefoon bij een microfoon)', true,
        btn('Luister', () => { dlg.close(); K.player.playInput(d.deviceId, d.label).catch(e => K.toast('Mislukt: ' + e.message)); })));
    }
    return out;
  }

  /* ---- hardware-apps van de fabrikant (autoradio: tuner en CD/DVD) ---- */
  const KIND = { radio: { icon: '📻', name: 'Radio' }, disc: { icon: '💿', name: 'CD/DVD' }, nav: { icon: '🧭', name: 'Navigatie' }, phone: { icon: '📞', name: 'Telefoon' } };
  /* herkenning op pakketnaam en app-naam (autoradio's gebruiken eigen apps van de fabrikant) */
  const MATCH = {
    radio: a => !/tunein|podcast|klankstroom/i.test(a.package) && (/radio|fmradio|\.fm(\.|$)|tuner|\.dab/i.test(a.package) || /\b(radio|fm|am\/fm|tuner|dab\+?)\b/i.test(a.label) || /收音/.test(a.label)),
    disc: a => /dvd|\.cd(\.|$)|cdplayer|discplayer|\.disc(\.|$)/i.test(a.package) || /\b(dvd|cd|disc|blu-?ray)\b/i.test(a.label) || /碟|光盘/.test(a.label),
    nav: a => /maps|navi|waze|igo|sygic|osmand|tomtom|navitel|garmin|here\.|mapfactor|magicearth/i.test(a.package) || /navig|maps|kaart|waze/i.test(a.label),
    phone: a => /dialer|\.phone|\.bt$|\.bt\.|bluetooth|incallui|contacts/i.test(a.package) || /telefoon|phone|bluetooth|bellen|\bbt\b/i.test(a.label)
  };
  const getHw = () => K.LS.get('hwApps', {});
  const setHw = (kind, app) => { const h = getHw(); if (app) h[kind] = app; else delete h[kind]; K.LS.set('hwApps', h); K.emit('hwapps'); };
  const launch = (MS, a) => (K.player.playing ? K.player.toggle() : Promise.resolve()).catch(() => {}).then(() => MS.launchApp({ package: a.package })).catch(() => K.toast('Kan ' + a.label + ' niet openen'));

  function hwSection(MS, kind, title, found, okText, noText) {
    const out = [K.el('h3', {}, title)];
    const chosen = getHw()[kind];
    const list = chosen ? [chosen, ...found.filter(a => a.package !== chosen.package)] : found;
    for (const a of list) {
      const isChosen = chosen && chosen.package === a.package;
      out.push(item(a.label + (isChosen ? '  ★' : ''), (isChosen ? 'Jouw keuze · ' : '') + okText + ' (' + a.package + ')', true,
        isChosen ? null : btn('Onthoud', () => { setHw(kind, a); K.toast(a.label + ' onthouden als ' + KIND[kind].name); run(); }),
        btn('Open', () => { if (!getHw()[kind]) setHw(kind, a); dlg.close(); launch(MS, a); }, true)));
    }
    if (!list.length) out.push(item(noText, 'Kies hieronder zelf de juiste app van je autoradio.', false));
    out.push(item('Andere app kiezen…', 'Staat de ' + KIND[kind].name.toLowerCase() + '-app er niet bij? Kies hem uit al je apps.', true,
      btn('Kies app', () => pickApp(MS, kind)),
      chosen ? btn('Vergeten', () => { setHw(kind, null); run(); }) : null));
    return out;
  }

  async function pickApp(MS, kind) {
    body.innerHTML = '<div class="loader">Apps laden…</div>';
    let apps = [];
    try { apps = (await MS.listApps()).apps; } catch { K.toast('Kan de lijst met apps niet lezen'); return run(); }
    const filter = K.el('input', { type: 'search', placeholder: 'Zoek app (bijv. radio, dvd, tuner)…', style: 'width:100%;margin-bottom:8px' });
    const list = K.el('div');
    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      list.innerHTML = '';
      apps.filter(a => !q || (a.label + ' ' + a.package).toLowerCase().includes(q)).forEach(a =>
        list.append(item(a.label, a.package, true, btn('Kies', () => { setHw(kind, a); K.toast(a.label + ' gekoppeld als ' + KIND[kind].name); run(); }, true))));
    };
    filter.addEventListener('input', draw);
    body.innerHTML = '';
    body.append(K.el('h3', {}, 'Kies de ' + KIND[kind].name + '-app van je autoradio'), filter, list, btn('← Terug', run));
    draw();
  }

  /* snelknoppen bovenaan Radio (alleen Android) */
  function renderHwBar() {
    const MS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
    const h = getHw();
    for (const bar of K.$$('.hw-bar')) {
      bar.innerHTML = '';
      if (K.platform !== 'android' || !MS) { bar.classList.add('hidden'); continue; }
      for (const kind of ['radio', 'disc']) {
        const a = h[kind];
        if (a) bar.append(K.el('button', { class: 'chip on', onclick: () => launch(MS, a) }, KIND[kind].icon + ' ' + a.label));
      }
      bar.classList.toggle('hidden', !bar.children.length);
    }
  }
  K.on('hwapps', renderHwBar);
  setTimeout(renderHwBar, 0);

  async function scanAndroid() {
    const MS = Capacitor.Plugins.MediaScan;
    if (!MS) return [item('Scan-plugin ontbreekt', 'Bouw de app opnieuw met de MediaScan-plugin', false)];
    let perm = await MS.checkPermissions();
    if (perm.audio !== 'granted') perm = await MS.requestPermissions();
    if (perm.audio !== 'granted') return [item('Geen toestemming', 'Sta “Muziek en audio” toe om je muziek te kunnen lezen', false, btn('Opnieuw', run))];
    const r = await MS.scan();
    const out = [K.el('h3', {}, 'Opslag')];
    for (const v of r.volumes) {
      const list = r.tracks.filter(t => t.volume === v.name);
      out.push(item(`${v.label}${v.removable ? ' (verwisselbaar)' : ''}`, `${list.length} nummers gevonden · ${v.state}`, list.length > 0,
        list.length ? btn('Toevoegen', async () => { await K.library.addAndroid(list); K.app.show('library'); dlg.close(); }, true) : null));
    }
    out.push(K.el('h3', {}, 'USB-apparaten'));
    if (!r.usb.length) out.push(item('Geen USB-apparaten', 'Sluit een USB-stick of USB-CD-speler aan via OTG', false));
    for (const u of r.usb) {
      out.push(item(u.name, u.optical
        ? 'CD/DVD-speler gevonden. Data-CD’s met MP3’s verschijnen als opslag hierboven; audio-CD’s (CDDA) kan Android niet direct lezen — sluit de speler dan aan via een lijn-ingang.'
        : u.storage ? 'USB-opslag — nummers staan hierboven zodra Android de stick heeft gekoppeld' : (u.audio ? 'USB-audio-apparaat — zie Audio-ingangen' : 'Overig USB-apparaat'), u.storage || u.optical));
    }
    out.push(...hwSection(MS, 'radio', 'Radio-tuner (FM/AM/DAB)', r.fm.apps,
      'Werkt zonder internet via de tuner van je autoradio of telefoon.', r.fm.hint || 'Geen radio-app herkend'));
    out.push(...hwSection(MS, 'disc', 'CD/DVD-speler', (r.disc && r.disc.apps) || [],
      'Ingebouwde CD/DVD-speler van je autoradio.', 'Geen CD/DVD-app herkend'));
    out.push(btn('Hele bibliotheek in één keer toevoegen', async () => { await K.library.addAndroid(r.tracks); K.app.show('library'); dlg.close(); }, true));
    return out;
  }

  async function scanElectron() {
    const r = await window.native.scanHardware();
    const out = [K.el('h3', {}, 'Stations')];
    if (r.musicDir) out.push(item('Map Muziek', r.musicDir, true, btn('Scannen', () => { dlg.close(); K.library.addFolderNative(r.musicDir, 'Muziek'); K.app.show('library'); }, true)));
    for (const d of r.drives) {
      const type = { fixed: 'Vaste schijf', removable: 'Verwisselbaar (USB/SD)', cdrom: 'CD/DVD-station', network: 'Netwerkschijf' }[d.type] || d.type;
      if (d.type === 'cdrom') {
        out.push(item(`${d.path} ${d.label || ''}`, d.audioCd
          ? `Audio-CD (${d.audioCd} tracks). Windows geeft CD-audio niet als bestand vrij; rip de CD eerst (bijv. met Windows Media Player) of gebruik lijn-ingang.`
          : d.ready ? 'Data-CD — kan gescand worden' : 'Geen schijf geplaatst', !!d.ready,
          d.ready && !d.audioCd ? btn('Scannen', () => { dlg.close(); K.library.addFolderNative(d.path, 'CD'); K.app.show('library'); }) : null));
      } else out.push(item(`${d.path} ${d.label || ''}`, type, true,
        btn('Scannen', () => { dlg.close(); K.library.addFolderNative(d.path, d.type === 'removable' ? 'USB/SD' : 'Schijf ' + d.path); K.app.show('library'); })));
    }
    out.push(item('Andere map…', 'Kies zelf een map', true, btn('Kies map', () => { dlg.close(); K.library.addFolderNative(null); K.app.show('library'); })));
    return out;
  }

  function scanWeb() {
    return [
      K.el('p', { class: 'hint' }, 'In de browser mag een website niet zelf je schijven doorzoeken. Kies een map of bestanden; ze worden in de app bewaard en spelen daarna ook offline. Installeer de pc- of Android-app voor een volledige hardwarescan.'),
      item('Map met muziek', 'SD-kaart, USB-stick of muziekmap', true, btn('Kies map', () => { dlg.close(); K.$('#folderInput').click(); }, true)),
      item('Losse bestanden', 'mp3, flac, ogg, m4a, wav, opus', true, btn('Kies bestanden', () => { dlg.close(); K.$('#filesInput').click(); }))
    ];
  }

  async function run() {
    body.innerHTML = '<div class="loader">Bezig met scannen…</div>';
    if (!dlg.open) dlg.showModal();
    const parts = [];
    try {
      if (K.platform === 'android') parts.push(...await scanAndroid());
      else if (K.platform === 'electron') parts.push(...await scanElectron());
      else parts.push(...scanWeb());
    } catch (e) { parts.push(item('Scan mislukt', e.message || String(e), false)); }
    try { parts.push(...await inputs()); } catch {}
    parts.push(K.el('p', { class: 'hint' }, navigator.onLine ? 'Je bent online.' : 'Je bent offline — lokale muziek, FM-radio en ingangen werken gewoon.'));
    body.innerHTML = '';
    body.append(...parts);
  }

  /* Tabbladen FM / CD in de autoradio-indeling: open de gekozen app, of laat er een kiezen */
  async function hw(kind, forcePick) {
    const MS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
    if (!MS || K.platform !== 'android') return K.toast(KIND[kind].name + ': werkt in de Android-app op je autoradio');
    const a = getHw()[kind];
    if (a && !forcePick) return launch(MS, a);
    if (!dlg.open) dlg.showModal();
    if (forcePick) return pickApp(MS, kind);
    body.innerHTML = '<div class="loader">Zoeken naar de ' + KIND[kind].name.toLowerCase() + '-app…</div>';
    try {
      const all = (await MS.listApps()).apps.filter(x => x.package !== 'nl.endless.klankstroom');
      const found = all.filter(MATCH[kind]);
      if (found.length === 1) { setHw(kind, found[0]); dlg.close(); return launch(MS, found[0]); }
      if (found.length > 1) { body.innerHTML = ''; body.append(...hwSection(MS, kind, 'Welke ' + KIND[kind].name.toLowerCase() + '-app?', found, 'Gevonden op dit apparaat.', '')); return; }
    } catch {}
    pickApp(MS, kind);
  }
  K.scan = { run, hw, getHw };  K.$('#scanBtn').addEventListener('click', run);
  K.$('#scanClose').addEventListener('click', () => dlg.close());
})();
