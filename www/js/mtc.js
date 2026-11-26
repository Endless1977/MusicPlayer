/* Klankstroom — autoradio-hardware (Microntek/HCT MTCD/MTCE, bv. PX5): FM-tuner, DVD/CD, Bluetooth, navigatie.
   Opdrachten: zie docs/mtce-api.md. Alles werkt alleen in de Android-app op een MTC-radio (K.mtc.available). */
'use strict';
(() => {
  const MS = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaScan;
  const M = K.mtc = {
    available: false, source: '', navi: null, btService: false,
    fm: { khz: 0, psn: '', rt: '', strength: 0, stereo: 0, pty: 0, seeking: false, scan: [], names: {} },
    dvd: { title: '', pos: '', len: '', idx: '', cnt: '', raw: {} },
    bt: { state: 0, av: 0, dev: '', callIn: '', dialOut: '', phone: '', music: '' },
    log: []
  };

  /* ---------- basis ---------- */
  function log(s) {
    M.log.unshift(new Date().toLocaleTimeString('nl-NL') + '  ' + s);
    if (M.log.length > 300) M.log.length = 300;
    K.emit('mtclog');
  }
  const set = async p => { log('→ ' + p); try { await MS().mtcSet({ param: p }); } catch (e) { log('✗ ' + (e.message || e)); throw e; } };
  const get = async p => { try { const v = (await MS().mtcGet({ param: p })).value; log('? ' + p + ' = ' + v); return v; } catch (e) { log('✗ ' + p + ': ' + (e.message || e)); return ''; } };
  const valOf = s => { s = String(s || ''); const i = s.indexOf('='); return i >= 0 ? s.slice(i + 1) : s; };
  M.set = set; M.get = get;
  setTimeout(() => { M.fm.names = K.LS.get('fmNames', {}); }, 0);
  M.fmtFreq = khz => khz ? (khz >= 30000 ? (khz / 1000).toFixed(2).replace('.', ',') + ' MHz' : khz + ' kHz') : '—';

  let changed = 0;
  const changedSoon = () => { if (changed) return; changed = setTimeout(() => { changed = 0; K.emit('mtc'); }, 250); };

  /* ---------- FM-radio ---------- */
  const toKhz = v => { v = +v || 0; return v > 1e6 ? Math.round(v / 1000) : v > 20000 ? v : v > 0 ? v * 10 : 0; };
  M.radio = {
    async on() { if (M.source !== 'fm') { M.source = 'fm'; await set('av_channel_enter=fm'); } },
    async off() { if (M.source === 'fm') { M.source = 'sys'; await set('av_channel_exit=fm'); } },
    tune: khz => set('ctl_radio_frequency=' + Math.round(khz)),
    seek: dir => set('ctl_radio_seek=' + dir),     // up | down | auto
    step: dir => set('ctl_radio_tune=' + dir),     // up | down
    presets() { return K.presets.filled('fm'); },
    save(slot) {
      if (!M.fm.khz) return K.toast('Nog geen zender afgestemd');
      const list = K.presets.get('fm');
      if (slot == null) { if (list.some(p => p && p.khz === M.fm.khz)) return K.toast('Staat al op een voorkeuzeknop'); slot = K.presets.firstFree('fm'); }
      if (slot < 0) return K.toast('Alle voorkeuzeknoppen zijn vol');
      K.presets.set('fm', slot, { khz: M.fm.khz, name: M.fm.psn || '' });
      K.toast('Knop ' + (slot + 1) + ': ' + (M.fm.psn || M.fmtFreq(M.fm.khz)));
    },
    /* volgende/vorige voorkeuzezender; zonder (genoeg) voorkeuzes: zoeken */
    hop(dir) {
      const list = M.radio.presets();
      if (list.length < 2) return M.radio.seek(dir > 0 ? 'up' : 'down');
      const i = list.findIndex(p => p.khz === M.fm.khz);
      const n = list[(i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length)];
      return K.player.play(M.radio.item(n.khz, n.name), list.map(p => M.radio.item(p.khz, p.name)));
    },
    item(khz, name) {
      khz = khz || M.fm.khz;
      name = name || (M.fm.names && M.fm.names[khz]) || '';
      return { kind: 'station', source: 'fm', id: 'fm:' + khz, khz, title: name || M.fmtFreq(khz), artist: 'FM-radio · ' + M.fmtFreq(khz), cover: M.logo(name) };
    }
  };

  /* ---------- zenderlogo's (uit de Radio Browser-database, op naam) ---------- */
  const logos = K.LS.get('fmLogos', {}), pend = {};
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pretty = s => String(s || '').replace(/([a-z])(\d)/gi, '$1 $2').replace(/\bnpo\s*r(\d)\b/i, 'NPO Radio $1').trim();
  M.logo = name => {
    const k = norm(name);
    if (!k || k.length < 2) return '';
    if (k in logos) return logos[k];
    if ((!pend[k] || Date.now() - pend[k] > 600000) && navigator.onLine && K.radio) {
      pend[k] = Date.now();
      K.radio.search({ name: pretty(name), country: 'NL', limit: 10 })
        .then(l => { const s = l.find(x => x.cover && norm(x.title).includes(k)) || l.find(x => x.cover); logos[k] = s ? s.cover : ''; K.LS.set('fmLogos', logos); K.emit('presets'); K.emit('mtc'); })
        .catch(() => {});
    }
    return '';
  };

  /* ---------- snel scannen: zelf van zender naar zender zoeken (zonder wachten op elke zender) ---------- */
  let seekWait = null;
  M.radio.fastScan = async () => {
    if (M.fm.seeking || M.fm.fastScan) return;
    await M.radio.on();
    const found = [], startKhz = M.fm.khz;
    M.fm.fastScan = true; M.fm.scan = []; changedSoon();
    let prev = startKhz, wrapped = false;
    try {
      for (let i = 0; i < 60 && M.fm.fastScan; i++) {
        const done = new Promise(r => { seekWait = r; setTimeout(r, 7000); });
        await set('ctl_radio_seek=up');
        await done; seekWait = null;
        await new Promise(r => setTimeout(r, 120));
        const k = M.fm.khz;
        if (!k) break;
        if (k === prev && i > 0) break;                 // niets meer gevonden
        if (k < prev) wrapped = true;                    // band rond: van boven naar onder
        if ((wrapped && k >= startKhz) || found.includes(k)) { if (wrapped && k === startKhz && !found.includes(k)) found.push(k); break; }
        found.push(k); M.fm.scan = found.slice(); changedSoon();
        prev = k;
      }
    } finally { M.fm.fastScan = false; changedSoon(); }
    found.sort((a, b) => a - b);
    M.fm.scan = found;
    K.emit('fmscan', found);
    return found;
  };
  M.radio.stopScan = () => { M.fm.fastScan = false; if (seekWait) seekWait(); };
  /* gevonden zenders op de voorkeuzeknoppen zetten: aanvullen of alles vervangen */
  M.radio.storeScan = (replace) => {
    const list = K.presets.get('fm');
    if (replace) for (let i = 0; i < list.length; i++) K.presets.clear('fm', i);
    const have = new Set(K.presets.filled('fm').map(p => p.khz));
    let n = 0;
    for (const k of M.fm.scan) {
      if (have.has(k)) continue;
      const i = K.presets.firstFree('fm'); if (i < 0) break;
      K.presets.set('fm', i, { khz: k, name: (M.fm.names && M.fm.names[k]) || '' }); n++;
    }
    K.toast(n + ' zenders op de voorkeuzeknoppen gezet');
  };

  /* ---------- DVD / CD ---------- */
  const dvdCode = c => 0x20000 | (c << 8) | (c ^ 2);
  M.DVD = { play: 22, playpause: 13, stop: 15, next: 23, prev: 24, fwd: 20, back: 21, repeat: 29, title: 31, osd: 37 };
  M.dvd.on = async () => { if (M.source !== 'dvd') { M.source = 'dvd'; await set('av_channel_enter=dvd'); } };
  M.dvd.off = async () => { if (M.source === 'dvd') { M.source = 'sys'; await set('av_channel_exit=dvd'); } };
  M.dvd.cmd = c => set('ctl_dvd_cmd=' + dvdCode(c));
  M.dvd.eject = () => set('ctl_dvd_door=open');
  /* naar nummer n: met volgende/vorige vanaf het huidige nummer, anders met cijfertoetsen */
  M.dvd.track = async n => {
    if (M.source !== 'dvd') { await M.dvd.on(); await M.dvd.cmd(M.DVD.play); await new Promise(r => setTimeout(r, 600)); await M.dvd.poll(); }
    const cur = parseInt(M.dvd.idx, 10);
    if (cur > 0) {
      const d = n - cur;
      for (let i = 0; i < Math.abs(d); i++) { await M.dvd.cmd(d > 0 ? M.DVD.next : M.DVD.prev); await new Promise(r => setTimeout(r, 160)); }
    } else {
      for (const ch of String(n)) { await M.dvd.cmd(+ch + 1); await new Promise(r => setTimeout(r, 160)); }
    }
    M.dvd.idx = String(n); changedSoon(); setTimeout(M.dvd.poll, 900);
  };
  M.dvd.poll = async () => {
    for (const [k, p] of [['title', 'sta_dvd_title='], ['pos', 'sta_dvd_position='], ['len', 'sta_dvd_length='], ['idx', 'sta_dvd_media_idx='], ['cnt', 'sta_dvd_media_cnt='], ['state', 'sta_dvd=']]) {
      try { const v = (await MS().mtcGet({ param: p })).value; M.dvd[k] = valOf(v); M.dvd.raw[p] = v; } catch {}
    }
    changedSoon();
  };
  M.dvd.item = () => ({ kind: 'track', source: 'cd', id: 'cd:disc', title: M.dvd.title || 'CD/DVD', artist: 'CD-speler van de auto', cover: '' });

  /* ---------- Bluetooth ---------- */
  const bt = async (method, arg) => { log('→ BT ' + method + (arg != null ? '(' + arg + ')' : '')); return (await MS().btCall({ method, arg })).value; };
  M.btCall = bt;
  M.btConnected = () => M.bt.state >= 1;
  M.btMusic = () => { const l = String(M.bt.music || '').split('\n').map(s => s.trim()).filter(Boolean); return { title: l[0] || '', artist: l[1] || '', album: l[2] || '' }; };
  M.btItem = () => { const m = M.btMusic(); return { kind: 'track', source: 'bt', id: 'bt:music', title: m.title || 'Bluetooth-muziek', artist: m.artist || M.bt.dev || 'Telefoon', album: m.album, cover: '' }; };
  M.number = s => { const m = String(s || '').match(/\+?\d[\d\s-]{2,}/g); return m ? m[m.length - 1].replace(/[\s-]/g, '') : ''; };
  async function pollBt() {
    if (!M.available || !MS().btStatus) return;
    try {
      const s = await MS().btStatus();
      M.btService = !!s.service;
      if (!s.service) return;
      const prevIn = M.bt.callIn;
      Object.assign(M.bt, { state: s.getBTState | 0, av: s.getAVState | 0, dev: s.getNowDevName || '', callIn: s.getCallInNum || '', dialOut: s.getDialOutNum || '', phone: s.getPhoneNum || '', music: s.getMusicInfo || '' });
      if (M.bt.callIn && M.bt.callIn !== prevIn) K.emit('btcall', M.bt.callIn);
      if (K.player.current && K.player.current.source === 'bt') {
        const it = M.btItem(), cur = K.player.current;
        if (it.title !== cur.title || it.artist !== cur.artist) { Object.assign(cur, it); K.emit('track', cur); }
      }
      changedSoon();
    } catch {}
  }
  M.pollBt = pollBt;

  /* ---------- spelers voor de Klankstroom-speler (P.external) ---------- */
  M.players = {
    fm: {
      play: async item => { await M.radio.on(); if (item.khz && item.khz !== M.fm.khz) await M.radio.tune(item.khz); },
      pause: () => M.radio.off(), resume: () => M.radio.on(),
      next: () => M.radio.hop(1), prev: () => M.radio.hop(-1)
    },
    cd: {
      play: async () => { await M.dvd.on(); await M.dvd.cmd(M.DVD.play); },
      pause: () => M.dvd.cmd(M.DVD.playpause), resume: () => M.dvd.cmd(M.DVD.playpause),
      next: () => M.dvd.cmd(M.DVD.next), prev: () => M.dvd.cmd(M.DVD.prev)
    },
    bt: {
      play: async () => { if (M.source && M.source !== 'sys') { await set('av_channel_enter=sys'); M.source = 'sys'; } await bt('avPlay'); },
      pause: () => bt('avPlayPause'), resume: () => bt('avPlayPause'),
      next: () => bt('avPlayNext'), prev: () => bt('avPlayPrev')
    }
  };
  /* Klankstroom speelt zelf iets (stream/USB): zorg dat de autoradio terug op Android-geluid staat */
  M.toSys = async () => {
    if (!M.available) return;
    if (M.source === 'fm') await M.radio.off();
    else if (M.source === 'dvd') await M.dvd.off();
  };

  /* ---------- knoppen op de radio / het stuur (MCU "KeyDown") ---------- */
  // standaardcodes uit de radio-app van de fabrikant; zelf te leren in Instellingen
  const KEYS = { next: [0x10c, 0x12c], prev: [0x104, 0x12b], seekup: [0x14f], seekdown: [0x14e],
    'preset:0': [0x11b], 'preset:1': [0x11c], 'preset:2': [0x11d], 'preset:3': [0x11e], 'preset:4': [0x11f], 'preset:5': [0x120] };
  let learn = null;
  M.learnKey = action => new Promise((res, rej) => {
    const t = setTimeout(() => { learn = null; rej(new Error('Geen knop gedrukt')); }, 12000);
    learn = code => {
      clearTimeout(t);
      const map = K.LS.get('mtcKeys', {});
      for (const k of Object.keys(map)) map[k] = map[k].filter(c => c !== code);
      (map[action] = map[action] || []).push(code);
      K.LS.set('mtcKeys', map); res(code);
    };
  });
  M.resetKeys = () => K.LS.set('mtcKeys', {});

  /* ---------- meldingen van de MCU ---------- */
  function onEvent(e) {
    const d = e.data || {};
    if (e.obj === 'Radio') {
      const t = d.type, v = d.value;
      if (t === 'freq') { M.fm.khz = toKhz(v); M.fm.psn = ''; M.fm.rt = ''; }
      else if (t === 'psn') { M.fm.psn = String(v || '').trim(); if (M.fm.psn && M.fm.khz) { (M.fm.names = M.fm.names || {})[M.fm.khz] = M.fm.psn; K.LS.set('fmNames', M.fm.names); } }
      else if (t === 'rt') M.fm.rt = String(v || '').trim();
      else if (t === 'strength' || t === 'stereo' || t === 'pty' || t === 'pi' || t === 'tp' || t === 'ta') M.fm[t] = v;
      else if (t === 'seek_start' || t === 'seek_start_auto') { M.fm.seeking = true; if (t === 'seek_start_auto') M.fm.scan = []; }
      else if (t === 'seek_end' || t === 'seek_end_auto') { M.fm.seeking = false; if (seekWait) seekWait(); }
      else if (t === 'seek_found' && seekWait) seekWait();
      else if (t === 'seek_found_auto' && M.fm.khz) M.fm.scan.push(M.fm.khz);
      if (d.strength != null) M.fm.strength = d.strength;
      if (t !== 'rt' && t !== 'strength') log('← Radio ' + t + ' = ' + (typeof v === 'string' ? v : JSON.stringify(v)));
      const cur = K.player.current;
      if (cur && cur.source === 'fm') {
        const name = M.fm.psn || M.fmtFreq(M.fm.khz);
        if (cur.khz !== M.fm.khz || cur.title !== name || cur.rtSeen !== M.fm.rt || (!cur.cover && M.logo(M.fm.psn))) {
          Object.assign(cur, { khz: M.fm.khz, id: 'fm:' + M.fm.khz, title: name, artist: M.fm.rt || 'FM-radio · ' + M.fmtFreq(M.fm.khz), rtSeen: M.fm.rt, cover: M.logo(M.fm.psn) || cur.cover || '' });
          K.emit('track', cur);
        }
      }
    } else if (e.obj === 'KeyDown') {
      const code = +d.value;
      log('← knop ' + code + ' (0x' + code.toString(16) + ')');
      if (learn) { const f = learn; learn = null; f(code); return; }
      const map = Object.assign({}, KEYS, K.LS.get('mtcKeys', {}));
      const act = Object.keys(map).find(k => map[k].includes(code));
      if (act) K.emit('hwkey', act);
    } else {
      log('← ' + e.obj + ' ' + JSON.stringify(d));
      if (e.obj === 'Dvd') M.dvd.poll();
    }
    changedSoon();
  }

  /* ---------- navigatie: radio onderdrukken als de navigatie spreekt ---------- */
  M.naviRefresh = async () => { try { M.navi = (await MS().mtcInfo()).navi; changedSoon(); } catch {} return M.navi; };
  M.setNaviApp = async pkg => { log('→ navigatie-app: ' + pkg); await MS().setNaviApp({ package: pkg }); setTimeout(M.naviRefresh, 600); };

  /* ---------- start ---------- */
  async function init() {
    if (K.platform !== 'android' || !MS() || !MS().mtcInfo) return;
    let info;
    try { info = await MS().mtcInfo(); } catch { return; }
    M.available = !!info.available;
    if (!M.available) return;
    M.source = String(info.avChannel || 'sys');
    M.navi = info.navi;
    document.body.classList.add('has-mtc');
    MS().addListener('mtcEvent', onEvent);
    MS().addListener('btReport', e => { log('← BT ' + JSON.stringify(e.data)); pollBt(); });
    MS().addListener('btService', e => { M.btService = !!e.connected; if (e.connected) pollBt(); changedSoon(); });
    try { await MS().mtcAttach({ types: 'Radio,Dvd,KeyDown' }); } catch (e) { log('attach mislukt: ' + (e.message || e)); }
    try { await MS().btBind(); } catch {}
    setInterval(pollBt, 2500);
    setInterval(() => { if (M.source === 'dvd' || (K.player.current && K.player.current.source === 'cd')) M.dvd.poll(); }, 1500);
    K.emit('mtc');
    log('Autoradio gevonden (bron: ' + M.source + ')');
  }
  setTimeout(init, 300);

  /* ---------- testpaneel ---------- */
  const { el } = K;
  M.openTestPanel = () => {
    const out = el('pre', { class: 'mtc-log' });
    const renderLog = () => { out.textContent = M.log.slice(0, 120).join('\n'); };
    const b = (label, fn) => el('button', { onclick: async () => { try { await fn(); } catch (e) { K.toast('Mislukt: ' + (e.message || e)); } } }, label);
    const sec = (title, ...btns) => el('div', { class: 'mtc-sec' }, el('h3', {}, title), el('div', { class: 'mtc-btns' }, ...btns));
    const free = el('input', { type: 'text', placeholder: 'vrije opdracht, bv. ctl_radio_frequency=103500', style: 'flex:1;min-height:44px' });
    const freq = el('input', { type: 'number', placeholder: 'MHz, bv. 103.5', step: '0.05', style: 'width:150px;min-height:44px' });
    const nr = el('input', { type: 'tel', placeholder: 'telefoonnummer', style: 'width:180px;min-height:44px' });
    const state = el('div', { class: 'hint mtc-state' });
    const renderState = () => {
      state.textContent = `bron: ${M.source || '?'} · FM ${M.fmtFreq(M.fm.khz)} ${M.fm.psn} ${M.fm.rt ? '· ' + M.fm.rt : ''} · signaal ${M.fm.strength} · stereo ${M.fm.stereo}` +
        ` · CD: ${M.dvd.title || '-'} ${M.dvd.idx || ''}/${M.dvd.cnt || ''} ${M.dvd.pos || ''}/${M.dvd.len || ''}` +
        ` · BT: dienst ${M.btService ? 'ja' : 'nee'}, status ${M.bt.state}, av ${M.bt.av}, ${M.bt.dev || '-'}${M.bt.callIn ? ', inkomend ' + M.bt.callIn : ''}` +
        ` · navigatie-app: ${(M.navi && M.navi.app) || '-'} (monitor ${M.navi && M.navi.monitor}, switch ${M.navi && M.navi.switch}, gain ${M.navi && M.navi.gain}, backvol ${M.navi && M.navi.backvol})`;
    };
    const ov = el('div', { id: 'mtcPanel' },
      el('div', { class: 'vo-bar' }, el('b', {}, 'Autoradio-testpaneel'), el('span', { class: 'hint' }, 'Elke opdracht apart proberen; alles komt in het logboek'),
        el('button', { class: 'primary', onclick: () => { ov.remove(); offLog(); offState(); } }, 'Sluiten')),
      el('div', { class: 'mtc-body' },
        state,
        sec('FM-radio',
          b('FM aan (bron)', () => M.radio.on()), b('FM uit', () => M.radio.off()),
          b('◀◀ zoek', () => M.radio.seek('down')), b('◀ stap', () => M.radio.step('down')), b('stap ▶', () => M.radio.step('up')), b('zoek ▶▶', () => M.radio.seek('up')),
          b('Alle zenders scannen', () => M.radio.seek('auto')), b('Opslaan', () => M.radio.save()),
          freq, b('Afstemmen', () => M.radio.tune(parseFloat(String(freq.value).replace(',', '.')) * 1000)),
          b('RDS aan', () => set('ctl_radio_rds=1')), b('AF aan', () => set('ctl_radio_af=1')), b('TA uit', () => set('ctl_radio_ta=0'))),
        sec('CD / DVD',
          b('CD aan (bron)', () => M.dvd.on()), b('CD uit', () => M.dvd.off()),
          b('▶ afspelen', () => M.dvd.cmd(M.DVD.play)), b('⏯ play/pauze', () => M.dvd.cmd(M.DVD.playpause)), b('⏹ stop', () => M.dvd.cmd(M.DVD.stop)),
          b('⏮ vorige', () => M.dvd.cmd(M.DVD.prev)), b('⏭ volgende', () => M.dvd.cmd(M.DVD.next)),
          b('⏪', () => M.dvd.cmd(M.DVD.back)), b('⏩', () => M.dvd.cmd(M.DVD.fwd)), b('🔁 herhalen', () => M.dvd.cmd(M.DVD.repeat)),
          b('⏏ uitwerpen', () => M.dvd.eject()), b('Status uitlezen', () => M.dvd.poll())),
        sec('Bluetooth',
          b('Status', () => pollBt()), b('▶ muziek', () => bt('avPlay')), b('⏯', () => bt('avPlayPause')), b('⏮', () => bt('avPlayPrev')), b('⏭', () => bt('avPlayNext')),
          b('Opnemen', () => bt('answerCall')), b('Ophangen', () => bt('hangupCall')), b('Weigeren', () => bt('rejectCall')), b('Opnieuw bellen', () => bt('reDial')),
          nr, b('Bellen', () => bt('dialOut', nr.value.trim())),
          b('Geschiedenis', async () => log('BT geschiedenis: ' + JSON.stringify(await bt('getHistoryList')))),
          b('Telefoonboek', async () => log('BT telefoonboek: ' + JSON.stringify(await bt('getPhoneBookList')))),
          b('Gekoppelde apparaten', async () => log('BT apparaten: ' + JSON.stringify(await bt('getMatchList'))))),
        sec('Navigatie (onderdrukken)',
          b('Navigatie-app kiezen', () => K.scan.pickNav()), b('Instellingen uitlezen', () => M.naviRefresh()),
          b('Bewaken aan', () => set('av_gps_monitor=1')), b('Bewaken uit', () => set('av_gps_monitor=0')),
          b('Mixen aan', () => set('av_gps_switch=1')), b('Mixen uit', () => set('av_gps_switch=0'))),
        el('div', { class: 'mtc-sec' }, el('h3', {}, 'Vrije opdracht'),
          el('div', { class: 'mtc-btns' }, free, b('Versturen (set)', () => set(free.value.trim())), b('Uitlezen (get)', () => get(free.value.trim())))),
        el('h3', {}, 'Logboek'), out));
    document.body.append(ov);
    const offLog = (() => { const f = () => renderLog(); K.bus.addEventListener('mtclog', f); return () => K.bus.removeEventListener('mtclog', f); })();
    const offState = (() => { const f = () => renderState(); K.bus.addEventListener('mtc', f); return () => K.bus.removeEventListener('mtc', f); })();
    renderLog(); renderState(); M.naviRefresh();
  };
})();
