/* Klankstroom — service worker: app-schil offline beschikbaar (browser/PWA) */
const CACHE = 'klankstroom-v21';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.json', 'icons/wapen.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/hls.min.js', 'js/util.js', 'js/storage.js', 'js/id3.js', 'js/md5.js', 'js/player.js', 'js/visualizer.js',
  'js/viz3d.js', 'vendor/three/three.module.js', 'vendor/three/postprocessing/EffectComposer.js', 'vendor/three/postprocessing/RenderPass.js',
  'vendor/three/postprocessing/UnrealBloomPass.js', 'vendor/three/postprocessing/AfterimagePass.js', 'vendor/three/postprocessing/OutputPass.js',
  'vendor/three/postprocessing/ShaderPass.js', 'vendor/three/postprocessing/MaskPass.js', 'vendor/three/postprocessing/Pass.js',
  'vendor/three/shaders/CopyShader.js', 'vendor/three/shaders/LuminosityHighPassShader.js', 'vendor/three/shaders/OutputShader.js', 'vendor/three/shaders/AfterimageShader.js',
  'js/icons.js', 'vizlab/index.html', 'js/radio.js', 'js/sources.js', 'js/accounts.js', 'js/library.js', 'js/presets.js', 'js/scan.js', 'js/mtc.js', 'js/ticker.js', 'js/app.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // streams en API's nooit cachen
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
