/* Klankstroom — 3D-visualizers in de stijl van vizz.fm (three.js + bloom-gloed)
   Scènes: Mesh Grid, Pulserende bol, Audiotunnel, Cycloonogen, Gloeiende roos, Gletsjerspiraal.
   Elke scène heeft 16 varianten (kleur + vorm). */
import * as THREE from '../vendor/three/three.module.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from '../vendor/three/postprocessing/AfterimagePass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';

const K = window.K;

/* ---------- gedeelde stukjes ---------- */
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* Alle kleuren even helder maken (geel/groen ogen anders veel feller dan blauw/paars) */
function norm(c, target) {
  const l = .2126 * c.r + .7152 * c.g + .0722 * c.b;
  return c.multiplyScalar(target / Math.max(.05, l));
}
/* 16 varianten: kleurenpaar + vormparameter */
function palette(v, baseHue) {
  const h = (baseHue + (v - 1) * 0.0625) % 1;
  const a = norm(new THREE.Color().setHSL(h, 0.85, 0.55), .28);
  const b = norm(new THREE.Color().setHSL((h + (v % 2 ? 0.18 : 0.42)) % 1, 0.9, 0.6), .34);
  return { a, b, style: (v - 1) % 4, alt: Math.floor((v - 1) / 4) };
}

/* Spectrum + geschiedenis (spectrogram) als textures */
const specTex = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
const HIST = 96;
const histData = new Uint8Array(128 * HIST * 4);
const histTex = new THREE.DataTexture(histData, 128, HIST, THREE.RGBAFormat);
for (const t of [specTex, histTex]) { t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
let lastHist = 0;
function updateAudioTextures(now) {
  const a = K.viz.audio, sd = specTex.image.data;
  for (let i = 0; i < 256; i++) { sd[i * 4] = a[i]; sd[i * 4 + 1] = a[256 + i]; }
  specTex.needsUpdate = true;
  if (now - lastHist > 33) {            // ~30 rijen per seconde schuiven
    lastHist = now;
    histData.copyWithin(128 * 4, 0, 128 * (HIST - 1) * 4);
    for (let i = 0; i < 128; i++) histData[i * 4] = a[Math.floor(i * 1.6)];
    histTex.needsUpdate = true;
  }
}
const commonUniforms = () => ({
  uTime: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTreb: { value: 0 }, uBeat: { value: 0 },
  uSpec: { value: specTex }, uHist: { value: histTex },
  uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uStyle: { value: 0 }, uAlt: { value: 0 }
});
const setCommon = (u, t, f) => { u.uTime.value = t; u.uBass.value = f.bass; u.uMid.value = f.mid; u.uTreb.value = f.treb; u.uBeat.value = f.beat; };

/* ================= SCÈNES ================= */
const SCENES = {
  /* Mesh Grid: vliegen over een landschap van het spectrum (spectrogram-terrein) */
  meshgrid: { name: 'Mesh Grid', hue: 0.55, bloom: 1.1, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const u = commonUniforms(); u.uA.value = p.a; u.uB.value = p.b; u.uStyle.value = p.style; u.uAlt.value = p.alt;
    const geo = new THREE.PlaneGeometry(70, 70, 95, 63);
    const vs = `uniform sampler2D uHist; uniform float uTime, uBass, uStyle, uAlt; varying float vH; varying float vZ;
      void main(){
        vec2 q = uv; float x = abs(q.x - .5) * 2.;
        float h = texture2D(uHist, vec2(uAlt > 1.5 ? x : q.x, q.y)).r;
        vec3 p = position;
        p.z = h * (6. + uBass * 4.) * (uAlt > 2.5 ? 1.4 : 1.) * smoothstep(1., .55, abs(q.x - .5) * 2.);
        if (uAlt > .5 && uAlt < 1.5) { float ang = (q.x - .5) * 3.1416; p.x = sin(ang) * 14.; p.z += (1. - cos(ang)) * 10.; }
        vH = h; vZ = q.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = min(5., (1.2 + h * 2.5) * (24. / -mv.z));
        gl_Position = projectionMatrix * mv;
      }`;
    const fs = `uniform vec3 uA, uB; uniform float uBeat, uStyle; varying float vH; varying float vZ;
      void main(){ vec3 c = mix(uA, uB, smoothstep(.0, .9, vH)); c *= (.08 + vH * .75 + uBeat * .12) * (uStyle > .5 && uStyle < 1.5 ? .4 : 1.); c *= smoothstep(1., .45, vZ);
        gl_FragColor = vec4(c, 1.); }`;
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, wireframe: p.style !== 1, transparent: true, blending: p.style === 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const mesh = p.style === 1 ? new THREE.Points(geo, mat) : new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2.2;
    scene.add(mesh);
    if (p.style === 3) { const pts = new THREE.Points(geo, mat.clone()); pts.material.wireframe = false; pts.rotation.copy(mesh.rotation); scene.add(pts); }
    cam.position.set(0, 12, 34); cam.lookAt(0, 0, 0);
    return { update(t, f) { setCommon(u, t, f); scene.traverse(o => { if (o.material && o.material.uniforms) setCommon(o.material.uniforms, t, f); });
      cam.position.x = Math.sin(t * .15) * 8; cam.position.y = 11 + Math.sin(t * .23) * 3 + f.bass * 1.5; cam.lookAt(0, 1, -4); } };
  } },

  /* Pulserende bol: vervormde bol met ruis, fresnel-gloed en deeltjeshalo */
  sphere: { name: 'Pulserende bol', hue: 0.78, bloom: 1.3, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const u = commonUniforms(); u.uA.value = p.a; u.uB.value = p.b; u.uStyle.value = p.style;
    const vs = NOISE + `uniform float uTime, uBass, uMid, uStyle; uniform sampler2D uSpec; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){
        float lat = acos(normalize(position).y) / 3.1416;
        float s = texture2D(uSpec, vec2(abs(lat - .5) * 1.6, .5)).r;
        float n = snoise(position * (1.2 + uStyle * .4) + uTime * .35);
        float d = n * (.18 + uBass * .55) + s * .5;
        vec3 p = position + normal * d; vD = d;
        vec4 mv = modelViewMatrix * vec4(p, 1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_PointSize = 2.;
        gl_Position = projectionMatrix * mv;
      }`;
    const fs = `uniform vec3 uA, uB; uniform float uBeat, uStyle; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.);
        vec3 c = mix(uA, uB, clamp(vD * 1.5 + .3, 0., 1.)) * (.1 + fr * .8 + uBeat * .15) * (uStyle > .5 ? .45 : 1.);
        gl_FragColor = vec4(c, 1.); }`;
    const geo = new THREE.IcosahedronGeometry(2.2, p.style === 1 ? 20 : p.style === 2 ? 40 : 64);
    const solid = p.style % 2 === 0 && p.style !== 2;
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, wireframe: p.style % 2 === 1, transparent: !solid, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: solid });
    const ball = p.style === 2 ? new THREE.Points(geo, mat) : new THREE.Mesh(geo, mat);
    scene.add(ball);
    // halo
    const N = 4000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const r = 3.4 + Math.random() * 2.5, th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1); pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3); }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const halo = new THREE.Points(hg, new THREE.PointsMaterial({ color: p.b, size: .03, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(halo);
    cam.position.set(0, 0, 8.5); cam.lookAt(0, 0, 0);
    return { update(t, f) { setCommon(u, t, f); ball.rotation.y = t * .15; ball.rotation.x = Math.sin(t * .1) * .3;
      halo.rotation.y = -t * .05; halo.scale.setScalar(1 + f.bass * .25); halo.material.opacity = .2 + f.treb * .35; } };
  } },

  /* Audiotunnel: ringen met de vorm van het spectrum vliegen op je af */
  tunnel: { name: 'Audiotunnel', hue: 0.5, bloom: 1.4, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const RINGS = 70, SEG = 96, DEPTH = 70;
    const sides = [0, 3, 6, 96][p.style] || 96; // vorm: rond, driehoek, zeshoek, rond
    const rings = [];
    for (let r = 0; r < RINGS; r++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
      const m = new THREE.LineBasicMaterial({ color: new THREE.Color(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.LineLoop(g, m);
      line.position.z = -r * (DEPTH / RINGS);
      scene.add(line); rings.push(line);
      shape(line, r);
    }
    function shape(line, seed) {
      const a = K.viz.audio, pos = line.geometry.attributes.position.array;
      for (let i = 0; i < SEG; i++) {
        const ang = i / SEG * Math.PI * 2;
        let rad = 3;
        if (sides && sides < 20) { const k = Math.PI / sides; rad *= Math.cos(k) / Math.cos(((ang + seed * .05) % (2 * k)) - k); }
        const s = a[Math.floor(Math.abs(i / SEG - .5) * 2 * 160)] / 255;
        rad += s * (p.alt > 1 ? 2.2 : 1.4);
        pos[i * 3] = Math.cos(ang) * rad; pos[i * 3 + 1] = Math.sin(ang) * rad; pos[i * 3 + 2] = 0;
      }
      line.geometry.attributes.position.needsUpdate = true;
      const loud = K.viz.feat.bass;
      line.material.color.copy(p.a).lerp(p.b, (seed % 7) / 7).multiplyScalar(.35 + loud * .5);
      line.rotation.z = seed * .03 * (p.alt % 2 ? -1 : 1);
    }
    let seed = RINGS;
    cam.position.set(0, 0, 4); cam.lookAt(0, 0, -10);
    return { update(t, f, dt) {
      const speed = (8 + f.bass * 30) * dt;
      for (const l of rings) {
        l.position.z += speed;
        if (l.position.z > 4) { l.position.z -= DEPTH; shape(l, seed++); }
        const near = (l.position.z + DEPTH) / (DEPTH + 4);
        l.material.opacity = .04 + near * near * .7;
      }
      cam.position.x = Math.sin(t * .4) * .8; cam.position.y = Math.cos(t * .3) * .8; cam.lookAt(0, 0, -20);
      cam.rotation.z = t * .05;
    } };
  } },

  /* Cycloonogen: twee draaiende deeltjeswervels */
  cyclone: { name: 'Cycloonogen', hue: 0.6, bloom: 1.2, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const u = commonUniforms(); u.uA.value = p.a; u.uB.value = p.b; u.uStyle.value = p.style; u.uAlt.value = p.alt;
    const N = 40000, attr = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) attr.set([Math.random(), Math.random() * 6.283, Math.random(), i % 2], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aData', new THREE.BufferAttribute(attr, 4));
    const vs = `attribute vec4 aData; uniform float uTime, uBass, uMid, uTreb, uAlt; uniform sampler2D uSpec; varying float vR; varying float vS;
      void main(){
        float r = pow(aData.x, .7) * 5.;
        float s = texture2D(uSpec, vec2(aData.x * .7, .5)).r;
        float ang = aData.y + uTime * (1.6 / (r + .4)) * (aData.w > .5 ? -1. : 1.);
        float eye = aData.w > .5 ? 3.2 : -3.2;
        if (uAlt > 1.5) eye *= .35;
        vec3 p = vec3(cos(ang) * r + eye, (aData.z - .5) * (1. + r * .35) * (.4 + s), sin(ang) * r * .55);
        p.xz *= 1. + uBass * .25 * (1. - aData.x);
        vR = aData.x; vS = s;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (1.2 + s * 2.5 + uTreb) * (9. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`;
    const fs = `uniform vec3 uA, uB; uniform float uBeat; varying float vR; varying float vS;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        vec3 c = mix(uB, uA, vR) * (.09 + vS * .3 + uBeat * .06) * (1. - d * 2.);
        gl_FragColor = vec4(c, 1.); }`;
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    cam.position.set(0, 5, 10); cam.lookAt(0, 0, 0);
    return { update(t, f) { setCommon(u, t, f); cam.position.x = Math.sin(t * .1) * 3; cam.position.y = 4 + Math.sin(t * .17) * 2; cam.lookAt(0, 0, 0); } };
  } },

  /* Gloeiende roos: bloemblad-kromme van gloeiende deeltjes die opengaat op de muziek */
  rose: { name: 'Gloeiende roos', hue: 0.02, bloom: 1.5, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const u = commonUniforms(); u.uA.value = p.a; u.uB.value = p.b; u.uStyle.value = p.style;
    const N = 36000, attr = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) attr.set([Math.random() * 6.2832 * 7, Math.random()], i * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aData', new THREE.BufferAttribute(attr, 2));
    const k = [5 / 3, 7 / 4, 4, 6 / 5][p.style];
    const vs = `attribute vec2 aData; uniform float uTime, uBass, uMid, uTreb; uniform sampler2D uSpec; varying float vL; varying float vS;
      void main(){
        float th = aData.x; float layer = aData.y;
        float r = cos(${k.toFixed(4)} * th) * (2.2 + layer * 1.8) * (1. + uMid * .3);
        float s = texture2D(uSpec, vec2(fract(th / 6.2832) * .6, .5)).r;
        vec3 p = vec3(cos(th) * r, sin(th) * r, (layer - .5) * 2. + sin(th * 3. + uTime) * .4 * (1. + uBass));
        p *= 1. + s * .25;
        float a = uTime * .15; p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
        vL = layer; vS = s;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (1. + s * 2. + uTreb * 1.5) * (10. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`;
    const fs = `uniform vec3 uA, uB; uniform float uBeat; varying float vL; varying float vS;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(mix(uA, uB, vL) * (.05 + vS * .22 + uBeat * .05) * (1. - d * 2.), 1.); }`;
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    cam.position.set(0, -6, 9); cam.lookAt(0, 0, 0);
    return { update(t, f) { setCommon(u, t, f); cam.position.x = Math.sin(t * .12) * 2.5; cam.lookAt(0, 0, 0); } };
  } },

  /* Gletsjerspiraal: ijzig spiraalstelsel, armen draaien, hoge tonen fonkelen */
  glacier: { name: 'Gletsjerspiraal', hue: 0.53, bloom: 1.25, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const u = commonUniforms(); u.uA.value = p.a; u.uB.value = new THREE.Color(0xeaf6ff).lerp(p.b, .3); u.uStyle.value = p.style;
    const arms = [2, 3, 4, 5][p.style];
    const N = 45000, attr = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) attr.set([Math.pow(Math.random(), 1.5), Math.floor(Math.random() * arms), (Math.random() - .5), Math.random()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aData', new THREE.BufferAttribute(attr, 4));
    const vs = `attribute vec4 aData; uniform float uTime, uBass, uTreb; uniform sampler2D uSpec; varying float vR; varying float vT;
      void main(){
        float r = aData.x * 7.;
        float ang = aData.y * 6.2832 / ${arms}. + r * .55 - uTime * .25 + aData.z * (.9 - aData.x * .5);
        float s = texture2D(uSpec, vec2(aData.x * .8, .5)).r;
        vec3 p = vec3(cos(ang) * r, aData.z * (.6 - aData.x * .4) * (1. + uBass), sin(ang) * r);
        p.y += s * .6 * sin(r * 2. - uTime * 3.);
        float tw = step(.985 - uTreb * .05, fract(aData.w * 97. + uTime * .5));
        vR = aData.x; vT = tw + s;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (1. + tw * 3. + s * 1.5) * (10. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`;
    const fs = `uniform vec3 uA, uB; uniform float uBeat; varying float vR; varying float vT;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(mix(uB, uA, vR) * (.06 + vT * .3 + uBeat * .05) * (1. - d * 2.), 1.); }`;
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    cam.position.set(0, 7, 9); cam.lookAt(0, 0, 0);
    return { update(t, f) { setCommon(u, t, f); pts.rotation.x = Math.sin(t * .07) * .25; cam.position.y = 6 + Math.sin(t * .1) * 2; cam.lookAt(0, 0, 0); } };
  } }
};

/* ================= renderer per canvas ================= */
const views = new Map();
function view(canvas) {
  let vw = views.get(canvas);
  if (vw) return vw;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .8, .45, .22);
  const trails = new AfterimagePass(.6);
  vw = { renderer, camera, composer, bloom, trails, scene: null, key: '', w: 0, h: 0 };
  vw.renderPass = new RenderPass(new THREE.Scene(), camera);
  composer.addPass(vw.renderPass); composer.addPass(trails); composer.addPass(bloom); composer.addPass(new OutputPass());
  views.set(canvas, vw);
  return vw;
}

function disposeScene(scene) {
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}

K.viz3d = {
  scenes: Object.entries(SCENES).map(([id, s]) => ({ id, name: s.name })),
  has: id => !!SCENES[id],
  render(canvas, t, dt, id, variant) {
    const vw = view(canvas);
    const now = performance.now();
    const pr = K.settings.vizRes * Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(64, canvas.clientWidth), h = Math.max(64, canvas.clientHeight);
    if (w !== vw.w || h !== vw.h || pr !== vw.pr) {
      vw.w = w; vw.h = h; vw.pr = pr;
      vw.renderer.setPixelRatio(pr); vw.renderer.setSize(w, h, false);
      vw.composer.setPixelRatio(pr); vw.composer.setSize(w, h);
      vw.camera.aspect = w / h; vw.camera.updateProjectionMatrix();
    }
    const key = id + ':' + variant;
    if (vw.key !== key) {
      if (vw.scene) disposeScene(vw.scene);
      vw.scene = new THREE.Scene();
      vw.scene.fog = null;
      vw.camera.position.set(0, 0, 10); vw.camera.rotation.set(0, 0, 0);
      vw.ctrl = SCENES[id].build(vw.scene, vw.camera, variant);
      vw.renderPass.scene = vw.scene;
      vw.baseBloom = SCENES[id].bloom;
      vw.trails.uniforms.damp.value = id === 'tunnel' || id === 'meshgrid' ? .55 : .75;
      vw.key = key;
    }
    updateAudioTextures(now);
    const f = K.viz.feat;
    vw.ctrl.update(t, f, dt);
    vw.bloom.strength = vw.baseBloom * .7 * (.5 + f.bass * .5 + f.beat * .3);
    vw.composer.render(dt);
  }
};
K.emit('viz3d-ready');
