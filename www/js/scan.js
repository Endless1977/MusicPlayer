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
    out.push(K.el('h3', {}, 'FM-radio'));
    if (r.fm.apps.length) for (const a of r.fm.apps)
      out.push(item('Ingebouwde FM-radio: ' + a.label, 'Gebruikt de FM-chip van je telefoon (koptelefoon = antenne). Werkt zonder internet.', true,
        btn('Open', () => MS.launchApp({ package: a.package }).catch(() => K.toast('Kan niet openen')), true)));
    else out.push(item('Geen FM-radio gevonden', r.fm.hint || 'De meeste nieuwe telefoons hebben geen FM-chip of geven hem niet vrij', false));
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

  K.scan = { run };
  K.$('#scanBtn').addEventListener('click', run);
  K.$('#scanClose').addEventListener('click', () => dlg.close());
})();
