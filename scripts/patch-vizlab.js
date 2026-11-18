/* Klankstroom — maakt van het Klankstroom-VizLab (vizlab-src/) een inbouwversie in www/vizlab/index.html.
   Gebruik: node scripts/patch-vizlab.js   (opnieuw draaien na een nieuwe VizLab-export)
   Toevoegingen:
   - geluidsbron "ext": spectrum, golfvorm, bas/midden/hoog komen rechtstreeks uit de Klankstroom-speler
   - ?embed           : paneel/HUD verborgen, alleen het beeld (voor de visualizer in de app)
   - ?src=ext         : paneel zichtbaar, maar met het geluid van Klankstroom (instellingen afstellen)
   - ?scene=..&variant=..: start-scène
   - window.__ksEmbed : set(scene, variant), hidden(bool), beat()  — bediening vanuit de app */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'vizlab-src', 'Klankstroom-VizLab.html'), 'utf8');

const rep = (from, to, label) => {
  if (!s.includes(from)) { console.error('Niet gevonden: ' + label); process.exit(1); }
  s = s.replace(from, to);
};

// 1. geluid uit Klankstroom (parent-venster) als bron "ext"
rep('function CE(B,A){let e=rA.audio,i=e.sens;if(',
  'function CE(B,A){let e=rA.audio,i=e.sens;const __kp=(()=>{try{return uA.source==="ext"&&window.parent!==window&&window.parent.K&&window.parent.K.viz}catch{return null}})();' +
  'if(__kp){fe.set(__kp.audio);const __f=__kp.feat;SA.bass+=(__f.bass-SA.bass)*.6,SA.mid+=(__f.mid-SA.mid)*.4,SA.treb+=(__f.treb-SA.treb)*.4}else if(',
  'analyse');
// 2. niet tekenen als het beeld verborgen is (spaart de autoradio)
rep('function Xa(B){requestAnimationFrame(Xa);', 'function Xa(B){requestAnimationFrame(Xa);if(window.__ksHidden){ya=B;return}', 'renderlus');
// 3. knop "Klankstroom" bij de geluidsbronnen
rep('<button data-src="sim">Simulatie</button>', '<button data-src="ext">🎵 Klankstroom</button>\n      <button data-src="sim">Simulatie</button>', 'bronknop');
rep('if(A==="sim"||A==="manual"){', 'if(A==="ext"){Za(),uA.source="ext",we("Geluid van de Klankstroom-speler"),tg();return}if(A==="sim"||A==="manual"){', 'bronklik');
// 4. inbouw-API en URL-opties
rep('window.__vizlab={info:()=>ig,V:rA};',
  'window.__vizlab={info:()=>ig,V:rA};' +
  '(()=>{const q=new URLSearchParams(location.search);const inApp=window.parent!==window;' +
  'if(q.has("embed")){document.body.classList.add("hide","ks-embed")}' +
  'if(inApp&&(q.has("embed")||q.get("src")==="ext")){uA.source="ext";tg()}' +
  'const sc=q.get("scene");if(sc&&Ke[sc])uA.scene=sc;const v=+q.get("variant");if(v>=1&&v<=16)uA.variant=v;dt();' +
  'window.__ksEmbed={set(s,v){if(s&&Ke[s])uA.scene=s;if(v>=1&&v<=16)uA.variant=v;dt()},hidden(h){window.__ksHidden=!!h},beat(){Fs=!0},scenes:()=>Object.keys(Ke)};' +
  'if(q.has("embed"))window.addEventListener("keydown",e=>{try{window.parent.dispatchEvent(new KeyboardEvent("keydown",{key:e.key,code:e.code}))}catch{}},true)})();',
  'api');
// 5. inbouwmodus: geen paneel, HUD of beat-stip; canvas schermvullend
rep('</style>', 'body.ks-embed #panel,body.ks-embed #hud,body.ks-embed #beatDot{display:none!important}body.ks-embed #c{inset:0!important;width:100%!important}body.ks-embed{background:#000;cursor:inherit}\n</style>', 'css');

fs.mkdirSync(path.join(root, 'www', 'vizlab'), { recursive: true });
fs.writeFileSync(path.join(root, 'www', 'vizlab', 'index.html'), s);
console.log('VizLab-inbouwversie geschreven: www/vizlab/index.html (' + (s.length / 1e6).toFixed(1) + ' MB)');
