/* Klankstroom — muziekgestuurde visualizer (WebGL met feedback, à la Drempels/Milkdrop) */
'use strict';
(() => {
  /* 3D-scènes (vizz.fm-stijl, zie viz3d.js) + klassieke 2D-feedbackeffecten (Drempels/Milkdrop-stijl) */
  const MODES = [
    { id: 'meshgrid', name: '3D · Mesh Grid', three: true },
    { id: 'sphere', name: '3D · Pulserende bol', three: true },
    { id: 'tunnel', name: '3D · Audiotunnel', three: true },
    { id: 'cyclone', name: '3D · Cycloonogen', three: true },
    { id: 'rose', name: '3D · Gloeiende roos', three: true },
    { id: 'glacier', name: '3D · Gletsjerspiraal', three: true },
    { id: 'drempels', name: 'Drempels (vloeiende warp)', classic: 0 },
    { id: 'tunnel2d', name: 'Klassieke tunnel', classic: 1 },
    { id: 'kaleido', name: 'Caleidoscoop', classic: 2 },
    { id: 'ring', name: 'Spectrumring', classic: 3 },
    { id: 'golven', name: 'Golven (oscilloscoop)', classic: 4 },
    { id: 'nevel', name: 'Nevel', classic: 5 }
  ];

  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

  const COMMON = `
    precision highp float;
    uniform vec2 uRes; uniform float uTime, uBass, uMid, uTreb, uBeat, uHue, uMode;
    uniform sampler2D uAudio;
    #define PI 3.14159265
    vec3 hsv(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
    float spec(float x){ return texture2D(uAudio, vec2(clamp(x,0.,1.), .25)).r; }
    float wav(float x){ return texture2D(uAudio, vec2(clamp(x,0.,1.), .75)).r; }
    mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  `;

  /* Pass 1: vorig beeld vervormen + nieuw beeld erin tekenen → feedbackbuffer */
  const FS_FEED = COMMON + `
    uniform sampler2D uPrev;
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float asp = uRes.x / uRes.y;
      vec2 p = (uv - .5) * vec2(asp, 1.);
      float t = uTime;
      int m = int(uMode + .5);

      /* algemene feedback-warp: inzoomen op de bas, draaien op de middentonen */
      vec2 q = p;
      float zoom = .988 - uBass * .03;
      q = rot(.003 + .012 * uMid * sin(t * .27)) * q * zoom;
      q += .005 * vec2(sin(q.y * 7. + t), cos(q.x * 6. - t * .8)) * (1. + uTreb * 2.);
      vec3 prev = texture2D(uPrev, q / vec2(asp, 1.) + .5).rgb;

      vec3 n = vec3(0.); float keep = .9;
      float r = length(p), a = atan(p.y, p.x);

      if (m == 0) {            // Drempels: zacht golvend, getegeld plasma-‘doek’
        vec2 w = p * 1.4;
        for (int i = 0; i < 3; i++) {
          w += .32 * vec2(sin(w.y * 2.1 + t * .55 + uBass * 1.8), cos(w.x * 1.9 - t * .47 + uMid));
          w = rot(.15 * sin(t * .1 + float(i))) * w;
        }
        vec2 g = fract(w * 1.6) - .5;
        float tile = smoothstep(.5, .32, max(abs(g.x), abs(g.y)));
        float c = sin(w.x * 3.) + sin(w.y * 3.3) + sin((w.x + w.y) * 2. + t);
        n = hsv(vec3(uHue + c * .08 + t * .015, .75, .35 + .45 * tile + .2 * sin(c * 2.)));
        n *= .75 + uBass * .6;
        keep = .55;
      } else if (m == 1) {     // Tunnel
        float z = .35 / (r + .04) + t * (.5 + uBass);
        float ang = a / (2. * PI) + .5;
        float s = spec(abs(fract(ang * 3.) - .5) * 1.2);
        float ring = smoothstep(.12, 0., abs(fract(z) - .5) - .32 + s * .35);
        float spokes = smoothstep(.9, 1., sin(ang * 6. * PI * 2. + z));
        n = hsv(vec3(uHue + z * .05, .85, 1.)) * (ring + spokes * .4) * smoothstep(0., .25, r);
        keep = .82;
      } else if (m == 2) {     // Caleidoscoop
        float seg = PI / 4.;
        float ka = abs(mod(a + t * .1, seg * 2.) - seg);
        vec2 k = r * vec2(cos(ka), sin(ka));
        k = rot(t * .2) * k;
        float s = spec(fract(r * 1.3));
        float v = sin(k.x * 14. + t * 2.) * sin(k.y * 14. - t) + s * 2.;
        n = hsv(vec3(uHue + r * .4 - t * .03, .9, smoothstep(.6, 1.4, v))) * (.6 + uBass);
        keep = .86;
      } else if (m == 3) {     // Spectrumring
        float ang = abs(a) / PI;
        float s = spec(pow(ang, 1.3) * .85);
        float base = .2 + uBass * .06;
        float bar = step(base, r) * step(r, base + s * .38) * smoothstep(.0, .01, abs(fract(ang * 64.) - .5) - .1);
        float glow = .004 / abs(r - base);
        n = hsv(vec3(uHue + ang * .5, .8, 1.)) * (bar + glow);
        keep = .93;
      } else if (m == 4) {     // Golven
        float y = (wav(uv.x) - .5) * 1.1;
        float y2 = (wav(fract(uv.x + .5)) - .5) * .6;
        n = hsv(vec3(uHue + uv.x * .3, .7, 1.)) * (.006 / abs(p.y - y)) +
            hsv(vec3(uHue + .5, .7, 1.)) * (.003 / abs(p.y + .25 - y2)) * uTreb * 2.;
        keep = .9;
      } else {                 // Nevel: zachte wolken die op de bas ademen
        vec2 w = p * 2.;
        float f = 0.; float amp = .5;
        for (int i = 0; i < 5; i++) { f += amp * sin(w.x + sin(w.y + t * .3)) * cos(w.y - t * .2); w = rot(1.1) * w * 1.9; amp *= .55; }
        n = hsv(vec3(uHue + f * .15 + t * .01, .6, .25 + .35 * f + uBass * .5));
        keep = .7;
      }

      vec3 col = prev * keep + n * (1. - keep * .6);
      col += hsv(vec3(uHue + .3, .6, 1.)) * uBeat * .07 * smoothstep(.9, 0., r);
      gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
    }`;

  /* Pass 2: feedbackbuffer naar het scherm met vignet */
  const FS_SHOW = `
    precision highp float;
    uniform sampler2D uPrev; uniform vec2 uRes;
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      vec3 c = texture2D(uPrev, uv).rgb;
      c = pow(c, vec3(.92));
      float v = smoothstep(1.2, .35, length(uv - .5) * 1.4);
      gl_FragColor = vec4(c * v, 1.);
    }`;

  /* ---------- audio-analyse (gedeeld door alle schermen) ---------- */
  const audioTex = new Uint8Array(256 * 2);
  const feat = { bass: 0, mid: 0, treb: 0, beat: 0, avgBass: .2, lastBeat: 0, hue: Math.random() };
  let simT = 0;

  function analyse(now, dt) {
    const d = K.player.getData();
    const sens = K.settings.sens;
    if (d) {
      const f = d.freq, n = f.length, binHz = d.rate / 2 / n;
      // logaritmische verdeling 30 Hz – 16 kHz over 256 kolommen
      for (let i = 0; i < 256; i++) {
        const hz = 30 * Math.pow(16000 / 30, i / 255);
        const b = Math.min(n - 1, Math.round(hz / binHz));
        audioTex[i] = Math.min(255, f[b] * (0.85 + i / 400) * sens);
      }
      const w = d.wave, step = w.length / 256;
      for (let i = 0; i < 256; i++) audioTex[256 + i] = w[Math.floor(i * step)];
      const band = (lo, hi) => { let s = 0, c = 0; for (let h = lo; h < hi; h += binHz) { s += f[Math.round(h / binHz)] || 0; c++; } return c ? s / c / 255 : 0; };
      feat.bass += (Math.min(1, band(30, 180) * sens) - feat.bass) * .5;
      feat.mid += (Math.min(1, band(300, 2000) * sens) - feat.mid) * .3;
      feat.treb += (Math.min(1, band(4000, 12000) * sens * 1.6) - feat.treb) * .3;
    } else {
      // Geen echte data (stream zonder CORS, Spotify, of pauze): gesimuleerd ritme, rustiger
      const live = K.player.playing ? 1 : .25;
      simT += dt * live;
      const bpm = 118, ph = (simT * bpm / 60) % 1;
      const kick = Math.exp(-ph * 6) * live;
      for (let i = 0; i < 256; i++) {
        const v = (0.45 + 0.35 * Math.sin(i * .11 + simT * 2.3) * Math.sin(i * .031 - simT * .7)) * Math.exp(-i / 170) + kick * Math.exp(-i / 30) * .6;
        audioTex[i] = Math.max(0, Math.min(255, v * 255 * live * sens * .8));
        audioTex[256 + i] = 128 + 60 * live * Math.sin(i * .2 + simT * 9) * Math.sin(i * .045 + simT * 1.3) * (.5 + kick);
      }
      feat.bass += (kick * .8 * sens - feat.bass) * .4;
      feat.mid += ((.3 + .2 * Math.sin(simT * .9)) * live - feat.mid) * .1;
      feat.treb += ((.2 + .2 * Math.sin(simT * 2.1)) * live - feat.treb) * .1;
    }
    feat.avgBass = feat.avgBass * .97 + feat.bass * .03;
    if (feat.bass > feat.avgBass * 1.35 && feat.bass > .25 && now - feat.lastBeat > 260) { feat.beat = 1; feat.lastBeat = now; feat.hue += .04; }
    feat.beat *= Math.pow(.02, dt);
    feat.hue += dt * .01;
  }

  /* ---------- WebGL-renderer per canvas ---------- */
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false, alpha: false });
      if (!gl) { this.fail = true; return; }
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
      try { this.feed = prog(FS_FEED); this.show = prog(FS_SHOW); } catch (e) { console.error(e); this.fail = true; return; }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.audio = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.audio);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      this.fb = []; this.w = this.h = 0; this.ping = 0;
      this.uni = {};
      for (const p of [this.feed, this.show]) {
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        const map = {};
        for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); map[u.name] = gl.getUniformLocation(p, u.name); }
        this.uni[p === this.feed ? 'feed' : 'show'] = map;
      }
    }
    resize() {
      const gl = this.gl, r = K.settings.vizRes * Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(64, Math.round(this.canvas.clientWidth * r)), h = Math.max(64, Math.round(this.canvas.clientHeight * r));
      if (w === this.w && h === this.h) return;
      this.w = this.canvas.width = w; this.h = this.canvas.height = h;
      for (const f of this.fb) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fb); }
      this.fb = [0, 1].map(() => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        return { tex, fb };
      });
    }
  }

  Renderer.prototype.draw = function (time, modeIdx) {
    if (this.fail) return;
    const gl = this.gl;
    this.resize();
    gl.bindTexture(gl.TEXTURE_2D, this.audio);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 2, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, audioTex);
    const src = this.fb[this.ping], dst = this.fb[1 - this.ping];
    const run = (prog, u, readTex, target) => {
      gl.useProgram(prog);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, this.w, this.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, readTex);
      if (u.uPrev) gl.uniform1i(u.uPrev, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.audio);
      if (u.uAudio) gl.uniform1i(u.uAudio, 1);
      if (u.uRes) gl.uniform2f(u.uRes, this.w, this.h);
      if (u.uTime) gl.uniform1f(u.uTime, time);
      if (u.uBass) gl.uniform1f(u.uBass, feat.bass);
      if (u.uMid) gl.uniform1f(u.uMid, feat.mid);
      if (u.uTreb) gl.uniform1f(u.uTreb, feat.treb);
      if (u.uBeat) gl.uniform1f(u.uBeat, feat.beat);
      if (u.uHue) gl.uniform1f(u.uHue, feat.hue % 1);
      if (u.uMode) gl.uniform1f(u.uMode, modeIdx);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    run(this.feed, this.uni.feed, src.tex, dst.fb);
    run(this.show, this.uni.show, dst.tex, null);
    this.ping = 1 - this.ping;
  };

  /* ---------- mini-spectrum in de spelerbalk (2D) ---------- */
  const mini = K.$('#miniViz'), mctx = mini.getContext('2d');
  function drawMini() {
    const w = mini.width, h = mini.height;
    mctx.clearRect(0, 0, w, h);
    if (!K.settings.viz) return;
    const bars = 24, bw = w / bars;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4fd1ff';
    mctx.fillStyle = accent;
    for (let i = 0; i < bars; i++) {
      const v = audioTex[Math.floor(i * 200 / bars)] / 255;
      const bh = Math.max(1, v * h * (K.player.playing ? 1 : .15));
      mctx.globalAlpha = .45 + v * .55;
      mctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    mctx.globalAlpha = 1;
  }

  /* ---------- hoofdlus ---------- */
  const targets = new Map(); // canvas → { r: 2D-renderer, c3: 3D-canvas, visible() }
  const V = K.viz = {
    modes: MODES,
    get modeIndex() { return Math.max(0, MODES.findIndex(m => m.id === K.settings.vizMode)); },
    get mode() { return MODES[V.modeIndex]; },
    setMode(id) { K.settings.vizMode = id; },
    nextMode() { V.setMode(MODES[(V.modeIndex + 1) % MODES.length].id); },
    add(canvas, visible) {
      const c3 = document.createElement('canvas');
      c3.className = 'viz3d';
      canvas.after(c3);
      targets.set(canvas, { r: null, c3, visible });
    },
    audio: audioTex,
    feat
  };

  let last = performance.now(), t0 = last, lastCycle = last;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const anyVisible = [...targets.values()].some(x => x.visible());
    if (!anyVisible && !K.settings.viz) return;
    analyse(now, dt);
    drawMini();
    if (K.settings.vizCycle && now - lastCycle > 30000 && feat.beat > .8) {
      lastCycle = now; V.nextMode();
      if (Math.random() < .5) K.settings.vizVariant = 1 + Math.floor(Math.random() * 16);
    }
    const m = V.mode, t = (now - t0) / 1000;
    for (const [canvas, tg] of targets) {
      if (!tg.visible()) continue;
      const use3d = !!m.three && !!K.viz3d;
      canvas.style.display = use3d ? 'none' : 'block';
      tg.c3.style.display = use3d ? 'block' : 'none';
      if (m.three && !K.viz3d) continue;              // 3D-module laadt nog
      if (use3d) {
        try { K.viz3d.render(tg.c3, t, dt, m.id, K.settings.vizVariant || 1); }
        catch (e) { console.error('3D-visualizer', e); K.settings.vizMode = 'drempels'; }
      } else {
        if (!tg.r) tg.r = new Renderer(canvas);
        tg.r.draw(t, m.classic);
      }
    }
  }
  requestAnimationFrame(loop);
})();
