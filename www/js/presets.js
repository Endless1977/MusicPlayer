/* Klankstroom — voorkeuzeknoppen per bron (FM, internetradio, stream). Vaste plekken, zoals op een autoradio. */
'use strict';
(() => {
  const SLOTS = 36;                         // 3 pagina's van 12
  const all = K.LS.get('presets', {});
  const save = () => { K.LS.set('presets', all); K.emit('presets'); };
  const strip = it => { if (!it) return null; const c = { ...it }; delete c.blob; delete c.rtSeen; return c; };
  const arr = kind => { if (!all[kind]) all[kind] = []; const a = all[kind]; while (a.length < SLOTS) a.push(null); return a; };
  // oude FM-lijst (testpaneel) overnemen
  if (!all.fm) { const old = K.LS.get('fmPresets', []); if (old.length) { arr('fm'); old.slice(0, SLOTS).forEach((p, i) => { all.fm[i] = p; }); save(); } }
  K.presets = {
    SLOTS,
    get: kind => arr(kind),
    at: (kind, i) => arr(kind)[i] || null,
    set(kind, i, v) { arr(kind)[i] = strip(v); save(); },
    clear(kind, i) { arr(kind)[i] = null; save(); },
    filled: kind => arr(kind).map((v, i) => v && { ...v, slot: i }).filter(Boolean),
    firstFree: kind => arr(kind).findIndex(v => !v)
  };
})();
