/* Klankstroom — hulpfuncties */
'use strict';
const K = window.K = {};

K.$ = (s, r = document) => r.querySelector(s);
K.$$ = (s, r = document) => [...r.querySelectorAll(s)];

K.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

K.el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
};

K.fmtTime = s => {
  if (!isFinite(s) || s < 0) return 'LIVE';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
};

let toastTimer;
K.toast = (msg, ms = 2600) => {
  const t = K.$('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
};

K.fetchJSON = async (url, opts = {}, timeout = 12000) => {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
};

K.fetchText = async (url, timeout = 10000) => {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(tm); }
};

/* Platform: 'android' (Capacitor), 'electron' (pc-app) of 'web' (browser/PWA) */
K.platform = (() => {
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    return window.Capacitor.getPlatform();
  if (window.native && window.native.platform === 'electron') return 'electron';
  return 'web';
})();

K.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

K.initials = name => (String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '♪').toUpperCase();

K.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Kleine event-bus */
K.bus = new EventTarget();
K.on = (name, fn) => K.bus.addEventListener(name, e => fn(e.detail));
K.emit = (name, detail) => K.bus.dispatchEvent(new CustomEvent(name, { detail }));
