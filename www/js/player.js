/* Klankstroom — speler: wachtrij, audio-graaf voor de visualizer, Media Session */
'use strict';
(() => {
  const A = K.$('#audioA');   // met CORS: gaat door de analyser (visualizer krijgt echte data)
  const B = K.$('#audioB');   // zonder CORS: noodroute voor streams die geen CORS sturen
  let ctx, analyser, gain, srcA, freq, wave;
  let active = A;
  let hls = null;

  const P = K.player = {
    queue: [], index: -1, current: null,
    shuffle: false, repeat: 'off',          // off | all | one
    playing: false, analysisOK: false, external: null, // external = bv. Spotify-speler
    get audio() { return active; },
  };

  function ensureGraph() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      srcA = ctx.createMediaElementSource(A);
      gain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.78;
      srcA.connect(gain); gain.connect(analyser); analyser.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
    } catch (e) { console.warn('Geen AudioContext', e); }
  }

  /* Visualizer vraagt audiodata op; bij geen echte data → null (visualizer simuleert dan) */
  P.getData = () => {
    if (!analyser || active !== A || !P.playing || !P.analysisOK) return null;
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    return { freq, wave, rate: ctx.sampleRate };
  };

  const setVolume = v => {
    v = Math.max(0, Math.min(1, v));
    K.settings.volume = v;
    if (gain) gain.gain.value = v; else A.volume = v;
    A.volume = gain ? 1 : v;
    B.volume = v;
    if (P.external && P.external.setVolume) P.external.setVolume(v);
  };
  P.setVolume = setVolume;
  P.muted = false;
  P.toggleMute = () => { P.muted = !P.muted; A.muted = B.muted = P.muted; K.emit('mute', P.muted); };

  /* Speellijst-URL's (.m3u/.pls) omzetten naar een echte stream */
  async function resolvePlaylist(url) {
    if (!/\.(m3u|pls)(\?|$)/i.test(url) || /\.m3u8(\?|$)/i.test(url)) return url;
    try {
      const txt = await K.fetchText(url, 6000);
      const m = txt.match(/^File\d+=(.+)$/im) || txt.match(/^(https?:\/\/\S+)$/im);
      if (m) return m[1].trim();
    } catch {}
    return url;
  }

  function stopAll() {
    for (const el of [A, B]) {
      el.pause();
      if (el.srcObject) { el.srcObject.getTracks().forEach(t => t.stop()); el.srcObject = null; }
      el.removeAttribute('src'); el.load();
    }
    if (hls) { hls.destroy(); hls = null; }
    if (P.external) { try { P.external.pause(); } catch {} }
  }

  function attach(el, url) {
    if (hls) { hls.destroy(); hls = null; }
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && window.Hls && Hls.isSupported() && !el.canPlayType('application/vnd.apple.mpegurl')) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(url); hls.attachMedia(el);
    } else el.src = url;
  }

  async function startElement(item, url) {
    ensureGraph();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    // Lokale bestanden (blob/file/capacitor) en Electron: altijd via de analyser.
    const sameOriginish = /^(blob:|data:|file:|capacitor:|https?:\/\/localhost)/.test(url) || K.platform === 'electron' || url.startsWith(location.origin);
    const tryEl = async (el) => {
      active = el;
      el.crossOrigin = el === A ? 'anonymous' : null;
      if (el === B) el.removeAttribute('crossorigin');
      attach(el, url);
      el.volume = el === A && gain ? 1 : K.settings.volume;
      await el.play();
    };
    try {
      await tryEl(A);
      P.analysisOK = true;
    } catch (e) {
      if (e.name === 'NotAllowedError') throw e;
      if (sameOriginish) throw e;
      // CORS-fout of codec: probeer zonder CORS (visualizer gaat dan op ‘gevoel’)
      A.pause(); A.removeAttribute('src'); A.load();
      await tryEl(B);
      P.analysisOK = false;
    }
  }

  P.play = async (item, queue) => {
    if (item.source === 'input') return P.playInput(item.id.slice(3) === 'default' ? '' : item.id.slice(3), item.title).catch(() => K.toast('Geen toegang tot de ingang'));
    if (queue) { P.queue = queue.slice(); P.index = Math.max(0, P.queue.findIndex(x => x.id === item.id)); }
    else if (!P.queue.some(x => x.id === item.id)) { P.queue.push(item); P.index = P.queue.length - 1; }
    else P.index = P.queue.findIndex(x => x.id === item.id);
    P.current = item;
    stopAll();
    P.external = null;
    K.emit('track', item);
    K.emit('state', 'loading');
    try {
      const handler = K.sources && K.sources.externalPlayer(item);
      if (handler) {            // bv. Spotify Web Playback SDK
        P.external = handler;
        await handler.play(item);
        P.analysisOK = false;
      } else {
        let url = K.sources ? await K.sources.resolveUrl(item) : item.url;
        if (!url) throw new Error('Geen stream-URL');
        url = await resolvePlaylist(url);
        await startElement(item, url);
      }
      P.playing = true;
      K.recent.add(item);
      K.emit('state', 'playing');
      updateSession(item);
    } catch (e) {
      console.warn('Afspelen mislukt', e);
      P.playing = false;
      K.emit('state', 'error');
      if (e.name === 'NotAllowedError') K.toast('Tik op ▶ om te starten');
      else {
        K.toast('Kan "' + (item.title || 'stream') + '" niet afspelen' + (navigator.onLine ? '' : ' (offline)'));
        if (item.kind !== 'station' && P.queue.length > 1 && P.index < P.queue.length - 1) setTimeout(() => P.next(true), 1200);
      }
    }
  };

  /* Lijn-ingang / externe hardware (CD-speler, FM-tuner, platenspeler via line-in of USB-audio) */
  P.playInput = async (deviceId, label) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const item = { kind: 'station', source: 'input', id: 'in:' + (deviceId || 'default'), title: label || 'Lijn-ingang', artist: 'Lokale hardware · live', cover: '' };
    stopAll(); P.external = null;
    ensureGraph();
    if (ctx.state === 'suspended') await ctx.resume();
    active = A;
    A.srcObject = stream;
    A.volume = gain ? 1 : K.settings.volume;
    P.queue = [item]; P.index = 0; P.current = item;
    K.emit('track', item);
    await A.play();
    P.analysisOK = true; P.playing = true;
    K.emit('state', 'playing');
    updateSession(item);
  };

  P.toggle = async () => {
    if (!P.current) return;
    if (P.external) {
      if (P.playing) { await P.external.pause(); P.playing = false; K.emit('state', 'paused'); }
      else { await P.external.resume(); P.playing = true; K.emit('state', 'playing'); }
      return;
    }
    if (active.paused) {
      if (!active.src && !active.srcObject) return P.play(P.current);
      if (ctx && ctx.state === 'suspended') await ctx.resume();
      // live radio: na pauze opnieuw verbinden zodat je ‘live’ blijft
      if (P.current.kind === 'station' && P.current.source !== 'input') return P.play(P.current);
      try { await active.play(); P.playing = true; K.emit('state', 'playing'); } catch { P.play(P.current); }
    } else { active.pause(); P.playing = false; K.emit('state', 'paused'); }
  };

  P.next = (auto) => {
    if (!P.queue.length) return;
    if (auto && P.repeat === 'one') return P.play(P.current);
    let i;
    if (P.shuffle && P.queue.length > 1) { do { i = Math.floor(Math.random() * P.queue.length); } while (i === P.index); }
    else i = P.index + 1;
    if (i >= P.queue.length) { if (P.repeat === 'all' || !auto) i = 0; else { P.playing = false; K.emit('state', 'ended'); return; } }
    P.play(P.queue[i]);
  };
  P.prev = () => {
    if (!P.queue.length) return;
    if (active.currentTime > 4 && P.current.kind !== 'station') { active.currentTime = 0; return; }
    P.play(P.queue[(P.index - 1 + P.queue.length) % P.queue.length]);
  };
  P.seek = frac => { if (isFinite(active.duration)) active.currentTime = frac * active.duration; else if (P.external && P.external.seek) P.external.seek(frac); };
  P.enqueue = item => { P.queue.push(item); K.emit('queue'); K.toast('Toegevoegd aan wachtrij'); };
  P.removeAt = i => { P.queue.splice(i, 1); if (i < P.index) P.index--; K.emit('queue'); };

  for (const el of [A, B]) {
    el.addEventListener('ended', () => { if (el === active) P.next(true); });
    el.addEventListener('timeupdate', () => { if (el === active) K.emit('time', { t: el.currentTime, d: el.duration }); });
    el.addEventListener('waiting', () => { if (el === active) K.emit('state', 'loading'); });
    el.addEventListener('playing', () => { if (el === active) { P.playing = true; K.emit('state', 'playing'); } });
    el.addEventListener('pause', () => { if (el === active && !el.ended) { P.playing = false; K.emit('state', 'paused'); } });
    el.addEventListener('error', () => {
      if (el !== active || !P.current || !el.getAttribute('src')) return;
      // stream valt weg tijdens het spelen (radio): één keer opnieuw verbinden
      if (P.current.kind === 'station' && P.playing && !P._retried) { P._retried = true; setTimeout(() => P.play(P.current), 1500); }
    });
  }
  K.on('track', () => { P._retried = false; });

  /* Media Session: knoppen op lockscreen/notificatie (Android) en mediatoetsen (pc) */
  function updateSession(item) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title || 'Klankstroom', artist: item.artist || (item.kind === 'station' ? 'Radio' : ''),
        album: item.album || 'Klankstroom',
        artwork: item.cover ? [{ src: item.cover, sizes: '512x512' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => P.toggle());
      ms.setActionHandler('pause', () => P.toggle());
      ms.setActionHandler('nexttrack', () => P.next());
      ms.setActionHandler('previoustrack', () => P.prev());
    } catch {}
  }

  setVolume(K.settings.volume);
})();
