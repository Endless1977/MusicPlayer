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
K.viz3dTime = { value: 0 }; K.viz3dBass = { value: 0 };
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
  } },
  /* Straaljager: vliegt op de muziek links/rechts (toonhoogte) en omhoog/omlaag (bas), met lichtstralen achter de vleugeltips */
  jet: { name: 'Straaljager', hue: 0.52, bloom: 1.2, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const S = 26;                                   // vliegsnelheid (de wereld schuift naar je toe)
    const env = synthGround(scene, p, p.alt >= 2);
    const jet = new THREE.Group();
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const N = P(0, 0, -3.2), F1 = [P(.35, 0, -1.6), P(0, .35, -1.6), P(-.35, 0, -1.6), P(0, -.3, -1.6)],
      F2 = [P(.45, 0, 1.2), P(0, .45, 1.2), P(-.45, 0, 1.2), P(0, -.35, 1.2)], T = [P(.3, 0, 2.8), P(0, .25, 2.8), P(-.3, 0, 2.8), P(0, -.2, 2.8)];
    const seg = [];
    F1.forEach((q, i) => seg.push(N, q, q, F1[(i + 1) % 4], q, F2[i], F2[i], F2[(i + 1) % 4], F2[i], T[i], T[i], T[(i + 1) % 4]));
    for (const s of [1, -1]) {
      const wing = [P(.4 * s, 0, -.6), P(3.2 * s, 0, 1.6), P(3.2 * s, 0, 2.0), P(.45 * s, 0, 1.6)];
      const tail = [P(.3 * s, 0, 2.0), P(1.3 * s, 0, 2.9), P(1.3 * s, 0, 3.1), P(.3 * s, 0, 2.8)];
      for (const poly of [wing, tail]) poly.forEach((q, i) => seg.push(q, poly[(i + 1) % poly.length]));
      seg.push(P(1.6 * s, 0, .55), P(1.6 * s, -.25, .9));           // raketjes onder de vleugel
    }
    const fin = [P(0, .4, 1.6), P(0, 1.6, 2.8), P(0, 1.6, 3.1), P(0, .3, 2.8)];
    fin.forEach((q, i) => seg.push(q, fin[(i + 1) % 4]));
    seg.push(P(0, .35, -1.6), P(0, .62, -.6), P(0, .62, -.6), P(0, .45, .4), P(.25, .3, -.9), P(0, .62, -.6), P(-.25, .3, -.9), P(0, .62, -.6));
    jet.add(wire(seg, p.a));
    if (p.style === 3) jet.add(fillMesh([
      [P(.4, 0, -.6), P(3.2, 0, 1.6), P(3.2, 0, 2.0)], [P(.4, 0, -.6), P(3.2, 0, 2.0), P(.45, 0, 1.6)],
      [P(-.4, 0, -.6), P(-3.2, 0, 1.6), P(-3.2, 0, 2.0)], [P(-.4, 0, -.6), P(-3.2, 0, 2.0), P(-.45, 0, 1.6)],
      [P(0, .4, 1.6), P(0, 1.6, 2.8), P(0, 1.6, 3.1)], [P(0, .4, 1.6), P(0, 1.6, 3.1), P(0, .3, 2.8)],
      [N, F2[0], F2[2]]], p));
    // naverbrander
    const flame = wire([P(0, 0, 2.8), P(0, 0, 4), P(.2, 0, 2.8), P(0, 0, 3.6), P(-.2, 0, 2.8), P(0, 0, 3.6)], p.b);
    jet.add(flame);
    scene.add(jet);
    const trails = [new Trail(scene, 140, p.b), new Trail(scene, 140, p.b), new Trail(scene, 100, p.a)];
    const tips = [P(3.2, 0, 2.0), P(-3.2, 0, 2.0), P(0, 0, 3.2)];
    const pos = new THREE.Vector3(0, 4, 0), prev = pos.clone(), tmp = new THREE.Vector3();
    let cen = .4;
    cam.position.set(0, 6, 9);
    return { update(t, f, dt) {
      env.update(t, f, dt, S);
      cen += (centroid() - cen) * Math.min(1, dt * 3);
      const tx = THREE.MathUtils.clamp((cen - .32) * 70, -13, 13) + Math.sin(t * .3) * 2;
      const ty = 3 + f.bass * 9 + f.mid * 2;
      prev.copy(pos);
      pos.x += (tx - pos.x) * Math.min(1, dt * 2.2);
      pos.y += (ty - pos.y) * Math.min(1, dt * 2.8);
      const vx = (pos.x - prev.x) / Math.max(dt, .001), vy = (pos.y - prev.y) / Math.max(dt, .001);
      jet.position.copy(pos);
      jet.rotation.set(THREE.MathUtils.clamp(vy * .05, -.6, .6), 0, THREE.MathUtils.clamp(-vx * .07, -1.1, 1.1));
      flame.scale.z = .5 + f.bass * 2 + f.beat;
      jet.updateMatrixWorld();
      trails.forEach((tr, i) => { tr.advance(0, 0, S * dt); tr.push(jet.localToWorld(tmp.copy(tips[i]))); });
      cam.position.x += (pos.x * .6 - cam.position.x) * Math.min(1, dt * 2);
      cam.position.y += (pos.y + 2.2 - cam.position.y) * Math.min(1, dt * 2);
      cam.position.z = 9;
      cam.lookAt(pos.x * .85, pos.y * .9 + .3, -10);
    } };
  } },

  /* Heuvelrit: auto over een weg die op de muziek bochten (toonhoogte) en heuvels (bas) maakt */
  car: { name: 'Heuvelrit (auto)', hue: 0.95, bloom: 1.15, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const NS = 110, SP = 1.6, CAR_I = 7;            // aantal wegstukken, afstand, plek van de auto
    const road = [];
    for (let i = 0; i < NS; i++) road.push({ x: 0, y: 0 });
    let phase = 0, steer = 0, hill = 0, cen = .4;
    const W = 3.2;
    const roadGeo = new THREE.BufferGeometry();
    const roadPos = new Float32Array(NS * 6 * 3);
    roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
    const roadLines = new THREE.LineSegments(roadGeo, lineMat(p.a));
    roadLines.frustumCulled = false; scene.add(roadLines);
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    // auto (neus naar -z)
    const car = new THREE.Group();
    const box = (w, h, l, y0, topW = w, topL = l, zOff = 0) => {
      const b = [P(-w / 2, y0, -l / 2), P(w / 2, y0, -l / 2), P(w / 2, y0, l / 2), P(-w / 2, y0, l / 2)];
      const tp = [P(-topW / 2, y0 + h, -topL / 2 + zOff), P(topW / 2, y0 + h, -topL / 2 + zOff), P(topW / 2, y0 + h, topL / 2 + zOff), P(-topW / 2, y0 + h, topL / 2 + zOff)];
      const s = []; for (let i = 0; i < 4; i++) s.push(b[i], b[(i + 1) % 4], tp[i], tp[(i + 1) % 4], b[i], tp[i]); return s;
    };
    car.add(wire([...box(1.9, .55, 4.2, .35), ...box(1.7, .5, 2.0, .9, 1.4, 1.5, .25)], p.a));
    if (p.style === 3) car.add(fillMesh([[P(-.95, .35, 2.1), P(.95, .35, 2.1), P(.95, .9, 2.1)], [P(-.95, .35, 2.1), P(.95, .9, 2.1), P(-.95, .9, 2.1)],
      [P(-.95, .35, -2.1), P(.95, .35, -2.1), P(.95, .9, -2.1)], [P(-.95, .35, -2.1), P(.95, .9, -2.1), P(-.95, .9, -2.1)]], p));
    const wheels = [];
    for (const [x, z] of [[-1, -1.35], [1, -1.35], [-1, 1.35], [1, 1.35]]) {
      const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2; pts.push(P(0, Math.sin(a) * .38, Math.cos(a) * .38), P(0, Math.sin(b) * .38, Math.cos(b) * .38)); }
      pts.push(P(0, -.38, 0), P(0, .38, 0), P(0, 0, -.38), P(0, 0, .38));
      const wh = wire(pts, p.b); wh.position.set(x, .38, z); car.add(wh); wheels.push(wh);
    }
    const beams = wire([P(-.7, .55, -2.1), P(-1.6, .2, -9), P(.7, .55, -2.1), P(1.6, .2, -9)], p.b); car.add(beams);
    scene.add(car);
    const trails = [new Trail(scene, 90, p.b), new Trail(scene, 90, p.b)];
    const lights = [P(-.75, .6, 2.1), P(.75, .6, 2.1)], tmp = new THREE.Vector3();
    // spectrum-paaltjes langs de weg
    const posts = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 4 * 3), 3)), lineMat(p.b));
    posts.frustumCulled = false; scene.add(posts);
    const zAt = i => -(i * SP - phase) + CAR_I * SP;
    return { update(t, f, dt) {
      const speed = 22 + f.bass * 18;
      phase += speed * dt;
      cen += (centroid() - cen) * Math.min(1, dt * 2);
      while (phase >= SP) {
        phase -= SP;
        const last = road[NS - 1];
        steer = steer * .9 + (cen - .33) * 1.6;
        hill += ((f.bass * 7 + f.mid * 3) - hill) * .12;
        road.shift();
        road.push({ x: THREE.MathUtils.clamp(last.x * .985 + steer, -40, 40), y: hill });
      }
      const a = K.viz.audio;
      for (let i = 0; i < NS; i++) {
        const r = road[i], z = zAt(i), n = road[Math.min(NS - 1, i + 1)];
        const nz = zAt(i + 1);
        const o = i * 18;
        // linker- en rechterrand + dwarslijn
        roadPos.set([r.x - W, r.y, z, n.x - W, n.y, nz, r.x + W, r.y, z, n.x + W, n.y, nz, r.x - W, r.y, z, r.x + W, r.y, z], o);
        const h = a[(i * 3) % 200] / 255 * 3;
        posts.geometry.attributes.position.array.set([r.x - W - 1.5, r.y, z, r.x - W - 1.5, r.y + h, z, r.x + W + 1.5, r.y, z, r.x + W + 1.5, r.y + h, z], i * 12);
      }
      roadGeo.attributes.position.needsUpdate = true;
      posts.geometry.attributes.position.needsUpdate = true;
      // auto op de weg: positie en helling interpoleren
      const fr = phase / SP, r0 = road[CAR_I], r1 = road[CAR_I + 1], r2 = road[CAR_I + 2];
      const cx = r0.x + (r1.x - r0.x) * fr, cy = r0.y + (r1.y - r0.y) * fr;
      car.position.set(cx, cy, 0);
      const slope = Math.atan2(r2.y - r0.y, SP * 2), yaw = Math.atan2(-(r2.x - r0.x), SP * 2);
      car.rotation.set(slope, yaw, -yaw * .4 + Math.sin(t * 20) * .01 * f.bass);
      wheels.forEach(w => { w.rotation.x -= speed * dt / .38; });
      car.updateMatrixWorld();
      trails.forEach((tr, i) => { tr.advance(0, 0, speed * dt); tr.push(car.localToWorld(tmp.copy(lights[i]))); });
      cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 3);
      cam.position.y += (cy + 4 - cam.position.y) * Math.min(1, dt * 3);
      cam.position.z = 10;
      const ahead = road[CAR_I + 8];
      cam.lookAt(ahead.x * .7 + cx * .3, ahead.y * .5 + cy * .5 + 1, -12);
    } };
  } },

  /* Windhond-coursing: de haas springt en zigzagt op de muziek, de windhond galoppeert erachteraan */
  hound: { name: 'Windhond-coursing', hue: 0.1, bloom: 1.15, build(scene, cam, v) {
    const p = palette(v, this.hue);
    const env = synthGround(scene, p, p.alt >= 2, 'x');
    const dogLines = dynWire(scene, 80, p.a), hareLines = dynWire(scene, 40, p.b);
    const fill = p.style === 3 ? dynFill(scene, p) : null;
    const nose = new Trail(scene, 120, p.a), hareTr = new Trail(scene, 120, p.b);
    const st = { ph: 0, hz: 0, dz: 0, hx: 6, hop: 0, hopV: 0, jinkT: 0, lastBeat: 0, dy: 0 };
    cam.position.set(0, 2, 9);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    return { update(t, f, dt) {
      const speed = 16 + f.bass * 10;
      env.update(t, f, dt, speed);
      // haas: springt op de beat, zigzagt (jinkt) op sterke beats, trekt weg bij luide muziek
      if (f.beat > .9 && t - st.lastBeat > .25) { st.lastBeat = t; if (st.hop <= 0) st.hopV = 3.5 + f.bass * 3; if (Math.random() < .55) st.jinkT = (Math.random() - .5) * 6; }
      st.hopV -= 14 * dt; st.hop = Math.max(0, st.hop + st.hopV * dt); if (st.hop === 0 && st.hopV < 0) st.hopV = 0;
      st.hz += (st.jinkT - st.hz) * Math.min(1, dt * 6);
      st.hx += ((5.5 + f.mid * 4) - st.hx) * Math.min(1, dt * 1.5);
      // hond ijlt na
      st.dz += (st.hz - st.dz) * Math.min(1, dt * 1.6);
      st.ph += dt * Math.PI * 2 * (2.3 + f.bass * 1.6);
      const yaw = Math.atan2(st.hz - st.dz, st.hx) * .8;
      // --- windhond (zijaanzicht-skelet, x = looprichting) ---
      const ph = st.ph, flex = Math.sin(ph), bounce = .15 * Math.sin(ph * 2);
      const L = 2.3 + .45 * flex, by = 1.55 + bounce;
      const pts = [];
      const rot = (x, y, z) => V(x * Math.cos(yaw) - z * Math.sin(yaw), y, x * Math.sin(yaw) + z * Math.cos(yaw) + st.dz);
      for (const side of [-.22, .22]) {
        const hip = [-L / 2, by + .05], sh = [L / 2, by + .12 - .1 * flex];
        const outline = [hip, [-.2, by + .25 + .1 * flex], sh, [L / 2 + .45, by + .9], [L / 2 + .85, by + 1.05], [L / 2 + 1.45, by + .8],
          [L / 2 + .8, by + .72], [L / 2 + .35, by + .3], [L / 2 - .15, by - .7], [-.35, by - .25], hip];
        for (let i = 0; i < outline.length - 1; i++) pts.push(rot(outline[i][0], outline[i][1], side), rot(outline[i + 1][0], outline[i + 1][1], side));
        // poten: voor en achter, met kniebuiging; links/rechts iets verschoven (roterende galop)
        const legs = [{ o: sh, ph: ph + (side > 0 ? .35 : 0), dir: 1 }, { o: hip, ph: ph + Math.PI + (side > 0 ? .35 : 0), dir: -1 }];
        for (const lg of legs) {
          const a = .95 * Math.sin(lg.ph) * lg.dir, bend = Math.max(0, Math.sin(lg.ph + 1.3)) * 1.3 * lg.dir;
          const k = [lg.o[0] + Math.sin(a) * .8, lg.o[1] - Math.cos(a) * .8];
          const paw = [k[0] + Math.sin(a - bend) * .8, k[1] - Math.cos(a - bend) * .8];
          pts.push(rot(lg.o[0], lg.o[1], side), rot(k[0], k[1], side), rot(k[0], k[1], side), rot(paw[0], paw[1], side),
            rot(paw[0], paw[1], side), rot(paw[0] + .22 * lg.dir, paw[1], side));
        }
        pts.push(rot(-L / 2, by + .05, side), rot(-L / 2 - .7, by - .35 + .2 * flex, side), rot(-L / 2 - .7, by - .35 + .2 * flex, side), rot(-L / 2 - 1.3, by - .2 + .25 * Math.sin(ph * 2), side));
        pts.push(rot(L / 2 + .8, by + 1.02, side), rot(L / 2 + .55, by + 1.25, side));   // oor
      }
      for (const [x, y] of [[-L / 2, by + .05], [L / 2, by + .12 - .1 * flex], [L / 2 - .15, by - .7], [L / 2 + 1.45, by + .8], [-.2, by + .25 + .1 * flex]]) pts.push(rot(x, y, -.22), rot(x, y, .22));
      dogLines.set(pts);
      if (fill) fill.set([[-L / 2, by + .05], [-.2, by + .25 + .1 * flex], [L / 2, by + .12 - .1 * flex], [L / 2 + .45, by + .9], [L / 2 + .85, by + 1.05], [L / 2 + 1.45, by + .8], [L / 2 + .35, by + .3], [L / 2 - .15, by - .7], [-.35, by - .25]].map(([x, y]) => rot(x, y, 0)));
      // --- haas ---
      const hx = st.hx, hy = .55 + st.hop, hz = st.hz, s = .5;
      const hp = [];
      const ell = (cx, cy, rx, ry, n = 12) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283, b = (i + 1) / n * 6.283; hp.push(V(hx + cx + Math.cos(a) * rx, hy + cy + Math.sin(a) * ry, hz), V(hx + cx + Math.cos(b) * rx, hy + cy + Math.sin(b) * ry, hz)); } };
      ell(0, 0, 1.1 * s, .55 * s); ell(1.15 * s, .45 * s, .4 * s, .32 * s, 10);
      const ear = st.hopV > 0 ? -.3 : .2;
      hp.push(V(hx + 1.1 * s, hy + .7 * s, hz), V(hx + (.7 + ear) * s, hy + 1.8 * s, hz), V(hx + 1.25 * s, hy + .72 * s, hz), V(hx + (1.0 + ear) * s, hy + 1.85 * s, hz));
      const kick = st.hop > 0 ? 1 : Math.abs(Math.sin(ph));
      hp.push(V(hx - .6 * s, hy - .3 * s, hz), V(hx - (1.2 + kick * .6) * s, hy - (.9 - kick * .3) * s, hz), V(hx + .6 * s, hy - .4 * s, hz), V(hx + (.9 + kick * .3) * s, hy - .95 * s, hz));
      hareLines.set(hp);
      nose.advance(-speed * dt, 0, 0); nose.push(rot(L / 2 + 1.45, by + .8, 0));
      hareTr.advance(-speed * dt, 0, 0); hareTr.push(V(hx - .5, hy, hz));
      cam.position.z += (9 + st.dz * .8 - cam.position.z) * Math.min(1, dt * 2);
      cam.position.x = -.5 + Math.sin(t * .1) * 1.5; cam.position.y = 2 + Math.sin(t * .13) * .5;
      cam.lookAt(2.6, 1.3, st.dz * .8);
    } };
  } }

};

/* ================= hulpmiddelen voor de draadmodel-scènes ================= */
function lineMat(color) {
  return new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}
/* vaste lijntekening uit puntparen */
function wire(points, color) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(g, lineMat(color));
}
/* lijntekening die elk frame opnieuw wordt gezet (bewegend skelet) */
function dynWire(scene, maxSeg, color) {
  const arr = new Float32Array(maxSeg * 2 * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const l = new THREE.LineSegments(g, lineMat(color)); l.frustumCulled = false; scene.add(l);
  return { set(pts) {
    const n = Math.min(pts.length, maxSeg * 2);
    for (let i = 0; i < n; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z; }
    g.setDrawRange(0, n); g.attributes.position.needsUpdate = true;
  } };
}
/* Drempels-achtige vloeiende vulling voor silhouetten (variant 4, 8, 12, 16) */
function drempelsMat(p) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: K.viz3dTime, uBass: K.viz3dBass, uA: { value: p.a }, uB: { value: p.b } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float uTime, uBass; uniform vec3 uA, uB; varying vec3 vP;
      void main(){ vec2 w = vP.xy * 1.3 + vP.z * .7;
        for (int i = 0; i < 3; i++) w += .35 * vec2(sin(w.y * 2.1 + uTime * .8 + uBass * 2.), cos(w.x * 1.9 - uTime * .7));
        float c = sin(w.x * 3.) + sin(w.y * 3.3) + sin((w.x + w.y) * 2. + uTime);
        vec2 g = fract(w * 1.5) - .5; float tile = smoothstep(.5, .3, max(abs(g.x), abs(g.y)));
        gl_FragColor = vec4(mix(uA, uB, .5 + .5 * sin(c * 1.5)) * (.25 + .25 * tile + uBass * .3), 1.); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
}
function fillMesh(tris, p) {
  const g = new THREE.BufferGeometry().setFromPoints(tris.flat());
  return new THREE.Mesh(g, drempelsMat(p));
}
/* bewegend silhouet (waaier van driehoeken vanuit het midden) met Drempels-vulling */
function dynFill(scene, p) {
  const max = 24, arr = new Float32Array(max * 9);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const m = new THREE.Mesh(g, drempelsMat(p)); m.frustumCulled = false; scene.add(m);
  return { set(pts) {
    const c = pts.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const n = Math.min(pts.length, max);
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; arr.set([c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z], i * 9); }
    g.setDrawRange(0, n * 3); g.attributes.position.needsUpdate = true;
  } };
}
/* lichtstraal: lijn door de laatste N posities, vervagend naar achteren */
class Trail {
  constructor(scene, n, color) {
    this.n = n; this.count = 0;
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = Math.pow(1 - i / n, 1.6); col.set([color.r * k * 1.6, color.g * k * 1.6, color.b * k * 1.6], i * 3); }
    this.g = new THREE.BufferGeometry();
    this.g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.line = new THREE.Line(this.g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.line.frustumCulled = false; scene.add(this.line);
  }
  advance(dx, dy, dz) { for (let i = 0; i < this.count; i++) { this.pos[i * 3] += dx; this.pos[i * 3 + 1] += dy; this.pos[i * 3 + 2] += dz; } }
  push(v) {
    this.pos.copyWithin(3, 0, (this.n - 1) * 3);
    this.pos[0] = v.x; this.pos[1] = v.y; this.pos[2] = v.z;
    if (this.count === 0) for (let i = 1; i < this.n; i++) this.pos.set([v.x, v.y, v.z], i * 3);
    this.count = this.n;
    this.g.attributes.position.needsUpdate = true;
  }
}
/* toonhoogte-zwaartepunt van het spectrum (0 = laag, 1 = hoog) */
function centroid() {
  const a = K.viz.audio; let s = 0, w = 0;
  for (let i = 0; i < 200; i++) { s += a[i]; w += a[i] * i; }
  return s > 50 ? w / s / 200 : .35;
}
/* neon-grond (synthwave-raster) dat met de snelheid meeschuift + optioneel spectrum-bergen */
function synthGround(scene, p, mountains, axis = 'z') {
  const lines = [], SPC = 6, LEN = 160, HALF = 60;
  for (let x = -HALF; x <= HALF; x += SPC) lines.push(new THREE.Vector3(x, 0, -LEN), new THREE.Vector3(x, 0, 20));
  const rows = [];
  for (let z = -LEN; z <= 20; z += SPC) rows.push(new THREE.Vector3(-HALF, 0, z), new THREE.Vector3(HALF, 0, z));
  const grid = new THREE.Group();
  const lon = wire(lines, p.a.clone().multiplyScalar(.45)), lat = wire(rows, p.a.clone().multiplyScalar(.45));
  grid.add(lon, lat);
  if (axis === 'x') grid.rotation.y = -Math.PI / 2;
  scene.add(grid);
  let mtn = null;
  const MN = 96;
  if (mountains) {
    const arr = new Float32Array(MN * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    mtn = new THREE.Line(g, lineMat(p.b)); mtn.frustumCulled = false; scene.add(mtn);
  }
  let off = 0;
  return { update(t, f, dt, speed) {
    off = (off + speed * dt) % SPC;
    lat.position.z = off;
    if (mtn) {
      const a = K.viz.audio, arr = mtn.geometry.attributes.position.array;
      for (let i = 0; i < MN; i++) {
        const u = i / (MN - 1), x = (u - .5) * 220, k = Math.abs(u - .5) * 2;
        const y = a[Math.floor(k * 150)] / 255 * 22 * (.3 + k);
        if (axis === 'x') arr.set([60, y, x], i * 3); else arr.set([x, y, -120], i * 3);
      }
      mtn.geometry.attributes.position.needsUpdate = true;
    }
  } };
}

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
      vw.trails.uniforms.damp.value = { tunnel: .55, meshgrid: .55, jet: .45, car: .4, hound: .2 }[id] ?? .75;
      vw.key = key;
    }
    updateAudioTextures(now);
    const f = K.viz.feat;
    K.viz3dTime.value = t; K.viz3dBass.value = f.bass;
    vw.ctrl.update(t, f, dt);
    vw.bloom.strength = vw.baseBloom * .7 * (.5 + f.bass * .5 + f.beat * .3);
    vw.composer.render(dt);
  }
};
K.emit('viz3d-ready');
