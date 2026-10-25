// 撤離動畫（lazy-loaded）：hand-modelled generic Ford-class carrier, MH-60-style helicopter, RHIB, Gerstner ocean, dawn grade.
// All geometry is procedural (no third-party models). Environment HDRI: Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)", CC0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

type G = THREE.BufferGeometry; const V3 = THREE.Vector3;
const col = (g: G, c: number) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return col(g, c); };
const VC = (o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2, ...o });
const mesh = (gs: G[], m: THREE.Material) => { const me = new THREE.Mesh(mergeGeometries(gs), m); me.castShadow = me.receiveShadow = true; return me; };
const canvas = (w: number, h: number, f: (c: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')!); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const softTex = canvas(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });

// ---------------- ocean: 4 Gerstner waves, foam on crests, fresnel + sun glint ----------------
const WAVES = [[1, 0.25, 0.22, 60], [0.7, 0.8, 0.18, 31], [-0.3, 1, 0.16, 17], [0.9, -0.4, 0.12, 9]]; // dir.x, dir.z, steepness, wavelength
function gerstner(x: number, z: number, t: number) { let y = 0; for (const [dx, dz, s, L] of WAVES) { const k = 2 * Math.PI / L, c = Math.sqrt(9.8 / k), d = Math.hypot(dx, dz), a = s / k; const f = k * ((dx / d) * x + (dz / d) * z - c * t); y += a * Math.sin(f); } return y; }
function makeOcean() {
  const geo = new THREE.PlaneGeometry(2400, 2400, 260, 260); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ fog: false, uniforms: { t: { value: 0 }, sunDir: { value: new V3(0.5, 0.12, 0.2).normalize() }, sunCol: { value: new THREE.Color(1, 0.62, 0.32) }, deep: { value: new THREE.Color(0x0a2738) }, shallow: { value: new THREE.Color(0x1f5a6a) }, sky: { value: new THREE.Color(0xe0a27a) }, horizon: { value: new THREE.Color(0xf0b890) }, camPos: { value: new V3() }, night: { value: 0 }, wakes: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } },
    vertexShader: `uniform float t; uniform vec4 wakes[3]; varying vec3 wp; varying vec3 nrm; varying float crest;
      const vec4 W[4] = vec4[4](${WAVES.map(w => `vec4(${w.map(v => v.toFixed(3)).join(',')})`).join(',')});
      void main(){ vec4 w4 = modelMatrix*vec4(position,1.); vec3 p = w4.xyz; vec3 o = p; vec3 T = vec3(1,0,0), B = vec3(0,0,1); crest = 0.;
        for(int i=0;i<4;i++){ vec2 d = normalize(W[i].xy); float k = 6.28318/W[i].w; float c = sqrt(9.8/k); float a = W[i].z/k; float f = k*(dot(d,o.xz)-c*t);
          p.x += d.x*a*cos(f); p.z += d.y*a*cos(f); p.y += a*sin(f); crest += W[i].z*sin(f);
          T += vec3(-d.x*d.x*W[i].z*sin(f), d.x*W[i].z*cos(f), -d.x*d.y*W[i].z*sin(f)); B += vec3(-d.x*d.y*W[i].z*sin(f), d.y*W[i].z*cos(f), -d.y*d.y*W[i].z*sin(f)); }
        float dist = length(o.xz - cameraPosition.xz); float fade = clamp(1. - dist/1100., 0., 1.); p.y = mix(0., p.y, fade);
        wp = p; nrm = normalize(cross(B,T)); gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: `uniform vec3 sunDir, sunCol, deep, shallow, sky, horizon, camPos; uniform float night, t; uniform vec4 wakes[3]; varying vec3 wp; varying vec3 nrm; varying float crest;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec3 v = normalize(cameraPosition - wp); vec2 q = wp.xz*0.35 + t*vec2(0.6,0.3);
        vec3 n = normalize(nrm + vec3(n2(q)-.5, 0., n2(q+17.3)-.5)*0.35 + vec3(n2(q*3.1)-.5,0.,n2(q*2.7+5.)-.5)*0.15);
        float fr = pow(1. - max(dot(n, v), 0.), 4.); vec3 refl = reflect(-v, n);
        vec3 skyc = mix(horizon, sky, clamp(refl.y*3., 0., 1.)); vec3 water = mix(deep, shallow, clamp(crest*1.4+.3, 0., 1.));
        vec3 c = mix(water, skyc*0.7, 0.04 + 0.55*fr);
        float spec = pow(max(dot(refl, sunDir), 0.), 220.)*6. + pow(max(dot(refl, sunDir), 0.), 18.)*0.25; c += sunCol*spec*(1.-night*0.8);
        float foam = smoothstep(0.6, 0.76, crest + (n2(wp.xz*0.8+t)-.5)*0.2)*0.7;
        for(int i=0;i<3;i++){ vec4 w = wakes[i]; if(w.w <= 0.) continue; vec2 d = wp.xz - w.xy; float ang = w.z; vec2 f = vec2(cos(ang), sin(ang)); float along = -dot(d, f); float side = abs(dot(d, vec2(-f.y, f.x)));
          if(along > 0. && along < w.w){ float wid = 4. + along*0.18; float m = (1. - smoothstep(wid*0.3, wid, side)) * (1. - along/w.w); foam = max(foam, m*(0.55 + 0.45*n2(wp.xz*1.5 + t*2.))); float edge = exp(-pow(side - wid*0.9, 2.)/4.)*(1.-along/w.w); foam = max(foam, edge*0.6); } }
        c = mix(c, vec3(0.92,0.95,0.96)*(1.-night*0.7), foam*0.85);
        float dist = length(wp - cameraPosition); c = mix(c, horizon*0.85, smoothstep(450., 1150., dist));
        gl_FragColor = vec4(c, 1.);
#include <colorspace_fragment>

      }` });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return { m, mat, follow(cam: THREE.Camera) { m.position.set(Math.round(cam.position.x / 9.23) * 9.23, 0, Math.round(cam.position.z / 9.23) * 9.23); mat.uniforms.camPos.value.copy(cam.position); } };
}

// ---------------- sky dome (dawn gradient + sun disc + cloud bands) ----------------
function makeSky() {
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: new V3(0.5, 0.12, 0.2).normalize() }, night: { value: 0 }, t: { value: 0 } },
    vertexShader: `varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 sunDir; uniform float night, t; varying vec3 d;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); } float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
      void main(){ float y = max(d.y, 0.); float sd = max(dot(d, sunDir), 0.);
        vec3 day = mix(vec3(1.0,0.66,0.42), vec3(0.32,0.45,0.66), pow(y, 0.45)); day += vec3(1.,.55,.25)*pow(sd, 6.)*0.6;
        vec3 nt = mix(vec3(0.05,0.07,0.12), vec3(0.01,0.02,0.05), pow(y,.5));
        vec3 c = mix(day, nt, night);
        vec2 uv = d.xz/(d.y+0.12)*1.6 + vec2(t*0.01, 0.); float cl = smoothstep(0.5, 0.85, fbm(uv)); vec3 cc = mix(vec3(0.55,0.42,0.45), vec3(1.0,0.72,0.5), pow(sd, 3.)); cc = mix(cc, vec3(0.08,0.09,0.12), night);
        c = mix(c, cc, cl*smoothstep(0., 0.25, y)*0.85);
        c += vec3(1.,.85,.6)*smoothstep(0.9975, 0.9995, sd)*2.5*(1.-night);
        gl_FragColor = vec4(c,1.);
#include <colorspace_fragment>

      }` });
  return { m: new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat), mat };
}

// ---------------- Ford-class carrier (generic, hand-modelled, ~1:1 metres) ----------------
// x = bow (+) / stern (-), z = port (+) / starboard (-). Deck height 20 m.
const DECK = [[168, -5], [168, 5], [150, 16], [110, 27], [60, 30], [20, 39], [-50, 41], [-120, 37], [-160, 32], [-168, 26], [-168, -30], [-100, -38], [-20, -40], [60, -38], [110, -30], [150, -16]];
function makeCarrier() {
  const g = new THREE.Group(); const DY = 20;
  // hull: loft from waterline (narrow) to flared deck edge
  const wl = DECK.map(([x, z]) => [x * 0.96 - (x > 120 ? (x - 120) * 0.25 : 0), z * 0.52]);
  const pos: number[] = []; const N = DECK.length;
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; const a = DECK[i], b = DECK[j], c = wl[i], d = wl[j]; const A = [a[0], DY, a[1]], Bp = [b[0], DY, b[1]], C = [c[0], -2, c[1]], D = [d[0], -2, d[1]]; pos.push(...A, ...C, ...Bp, ...Bp, ...C, ...D); }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.computeVertexNormals();
  const hullTex = canvas(512, 64, c => { c.fillStyle = '#6b7279'; c.fillRect(0, 0, 512, 64); c.fillStyle = '#5b6168'; for (let i = 0; i < 512; i += 19) c.fillRect(i, 0, 1, 64); c.fillStyle = '#2a2d31'; c.fillRect(0, 56, 512, 8); for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(60,40,30,.25)'; c.fillRect(Math.random() * 512, 8 + Math.random() * 40, 1, 6 + Math.random() * 20); } c.fillStyle = '#222'; for (let i = 0; i < 512; i += 23) c.fillRect(i, 14, 8, 3); });
  hullTex.wrapS = THREE.RepeatWrapping; const uv: number[] = []; for (let i = 0; i < N; i++) { const L = Math.hypot(DECK[(i + 1) % N][0] - DECK[i][0], DECK[(i + 1) % N][1] - DECK[i][1]) / 40; uv.push(0, 1, 0, 0, L, 1, L, 1, 0, 0, L, 0); } hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const hull = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide })); hull.castShadow = hull.receiveShadow = true; g.add(hull);
  // flight deck with painted markings (canvas texture mapped over bounding box)
  const sh = new THREE.Shape(DECK.map(([x, z]) => new THREE.Vector2(x, -z))); const dg = new THREE.ShapeGeometry(sh); dg.rotateX(-Math.PI / 2);
  const dp = dg.attributes.position as THREE.BufferAttribute; const duv = new Float32Array(dp.count * 2); for (let i = 0; i < dp.count; i++) { duv[i * 2] = (dp.getX(i) + 170) / 340; duv[i * 2 + 1] = (dp.getZ(i) + 45) / 90; } dg.setAttribute('uv', new THREE.BufferAttribute(duv, 2));
  const S = 6; const deckTex = canvas(340 * S, 90 * S, c => { const X = (x: number) => (x + 170) * S, Z = (z: number) => (z + 45) * S;
    c.fillStyle = '#3d4043'; c.fillRect(0, 0, 340 * S, 90 * S); for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; c.fillRect(Math.random() * 340 * S, Math.random() * 90 * S, 3 + Math.random() * 20, 2 + Math.random() * 6); }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(20,20,20,.18)'; c.beginPath(); c.ellipse(X(-150 + Math.random() * 120), Z(-5 + Math.random() * 30), 20 + Math.random() * 40, 4 + Math.random() * 6, 0.16, 0, 7); c.fill(); } // tyre marks
    const ang = 0.16; // angled deck ~9 degrees
    const line = (x0: number, z0: number, x1: number, z1: number, colr: string, w: number, dash: number[] = []) => { c.strokeStyle = colr; c.lineWidth = w * S; c.setLineDash(dash.map(d => d * S)); c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke(); c.setLineDash([]); };
    const ax = (x: number) => 4 + (x + 165) * Math.tan(ang); // angled deck centreline z at x
    line(-165, ax(-165), 60, ax(60), '#e8e8e0', 0.6, [6, 6]); line(-165, ax(-165) - 12, 50, ax(50) - 12, '#e8e8e0', 0.5); line(-165, ax(-165) + 12, 50, ax(50) + 12, '#e8e8e0', 0.5);
    line(-160, ax(-160) - 12, -160, ax(-160) + 12, '#e8e8e0', 0.6);
    line(-140, -3, 165, -3, '#d8c040', 0.5); line(20, 4, 165, 2, '#d8c040', 0.4); // bow taxi lines
    line(-60, -14, 60, -14, '#d8c040', 0.35); for (let x = -150; x < 150; x += 30) line(x, -36, x + 10, -20, '#d8c040', 0.3);
    line(-40, ax(-40) - 13, 70, ax(70) - 13, '#c02020', 0.4, [3, 3]); // foul line
    c.fillStyle = '#e8e8e0'; c.font = `bold ${26 * S}px sans-serif`; c.save(); c.translate(X(140), Z(0)); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText('78', 0, 9 * S); c.restore();
    c.save(); c.translate(X(-150), Z(ax(-150))); c.rotate(-Math.PI / 2 + ang); c.font = `bold ${12 * S}px sans-serif`; c.textAlign = 'center'; c.fillText('78', 0, 0); c.restore();
    for (const [x0, z0, x1, z1] of [[60, -6, 165, -6], [60, 6, 160, 4], [-20, 14, 70, 26], [-30, 24, 50, 34]]) { line(x0, z0, x1, z1, '#1e1f21', 0.8); line(x0, z0, x1, z1, '#6a6c6e', 0.2); } // EMALS catapult tracks
    for (let i = 0; i < 3; i++) { const x = -135 + i * 14; line(x, ax(x) - 11, x + 2, ax(x) + 11, '#a8a8a0', 0.25); } // arresting wires
    for (const [x, z, w, d] of [[45, -30, 22, 16], [-5, -30, 22, 16], [-115, 30, 22, 16]]) { c.strokeStyle = '#2a2c2e'; c.lineWidth = 0.4 * S; c.strokeRect(X(x - w / 2), Z(z - d / 2), w * S, d * S); } // elevator outlines
    for (let x = -165; x < 165; x += 6) { c.fillStyle = '#e8e8e0'; c.fillRect(X(x), Z(ax(x) - 12.4), 1.5 * S, 0.4 * S); } });
  deckTex.anisotropy = 8;
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85, metalness: 0.1 })); deck.position.y = DY + 0.02; deck.receiveShadow = true; g.add(deck);
  const P: G[] = [];
  // elevators (deck-edge, slightly recessed), catwalk, sponsons, CIWS/RAM mounts
  for (const [x, z] of [[45, -38], [-5, -38], [-115, 38]]) P.push(bx(22, 0.6, 16, x, DY - 0.1, z + Math.sign(z) * 2, 0x45484b));
  for (let i = 0; i < DECK.length; i++) { const a = DECK[i], b = DECK[(i + 1) % DECK.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ry = -Math.atan2(b[1] - a[1], b[0] - a[0]); P.push(bx(L, 0.15, 1.6, (a[0] + b[0]) / 2, DY - 1.2, (a[1] + b[1]) / 2, 0x55595d, ry)); }
  for (const [x, z] of [[150, -14], [150, 14], [-150, 30], [-150, -28]]) { P.push(bx(5, 2, 5, x, DY - 1.5, z * 1.05, 0x6a7076)); const cy = new THREE.CylinderGeometry(0.9, 1.1, 2.2, 10); cy.translate(x, DY + 0.6, z * 1.05); P.push(col(cy, 0xd8dcdc)); }
  // island (Ford: smaller, set further aft) with dual-band radar panels
  const IX = -38, IZ = -33; P.push(bx(26, 7, 9, IX, DY + 3.5, IZ, 0x737a80), bx(20, 6, 8, IX - 1, DY + 10, IZ, 0x787f85), bx(14, 5, 7.5, IX - 2, DY + 15.5, IZ, 0x7c8389), bx(10, 2.6, 7, IX - 2, DY + 19.3, IZ, 0x5a6066));
  for (let i = 0; i < 12; i++) P.push(bx(0.9, 0.7, 0.05, IX + 3.5 - i * 0.85, DY + 19.6, IZ + 3.53, 0x101418), bx(0.9, 0.7, 0.05, IX + 3.5 - i * 0.85, DY + 19.6, IZ - 3.53, 0x101418)); // bridge windows
  for (const [fx, fz, ry] of [[IX + 5.2, IZ, Math.PI / 2], [IX - 2, IZ + 3.9, 0], [IX - 2, IZ - 3.9, Math.PI], [IX - 9.2, IZ, -Math.PI / 2]]) { const pnl = new THREE.CylinderGeometry(2.4, 2.4, 0.3, 8); pnl.rotateX(Math.PI / 2); pnl.rotateY(ry); pnl.translate(fx, DY + 16, fz); P.push(col(pnl, 0x3e4449)); }
  P.push(bx(0.8, 14, 0.8, IX - 3, DY + 27, IZ, 0x50565a), bx(7, 0.3, 0.3, IX - 3, DY + 30, IZ, 0x50565a), bx(5, 0.3, 0.3, IX - 3, DY + 26, IZ, 0x50565a)); const dome = new THREE.SphereGeometry(1.2, 10, 8); dome.translate(IX - 3, DY + 34.5, IZ); P.push(col(dome, 0xe8e8e8));
  const ring = new THREE.TorusGeometry(1.6, 0.15, 6, 16); ring.rotateX(Math.PI / 2); ring.translate(IX - 3, DY + 32, IZ); P.push(col(ring, 0x50565a));
  // island hull number + small details
  g.add(mesh(P, VC({ metalness: 0.35, roughness: 0.6 })));
  const num = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ map: canvas(128, 96, c => { c.fillStyle = '#737a80'; c.fillRect(0, 0, 128, 96); c.fillStyle = '#f0f0e8'; c.font = 'bold 80px sans-serif'; c.textAlign = 'center'; c.fillText('78', 64, 80); }) })); num.position.set(IX + 3, DY + 11.5, IZ + 4.05); g.add(num);
  // nav / deck-edge lights for night
  const lights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(DECK.flatMap(([x, z]) => [x, DY + 0.4, z]).concat(Array.from({ length: 40 }, (_, i) => [-160 + i * 5, DY + 0.1, 4 + (i * 5) * Math.tan(0.16)]).flat()), 3)), new THREE.PointsMaterial({ color: 0x9fffb0, size: 1.2, map: softTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(lights);
  // parked aircraft (generic twin-tail fighter / stealth fighter shapes) — instanced
  const J: G[] = []; const fus = new THREE.CylinderGeometry(0.55, 0.9, 13, 8); fus.rotateZ(Math.PI / 2); fus.translate(0, 1.6, 0); J.push(col(fus, 0x8c949b));
  const nose = new THREE.ConeGeometry(0.55, 3.5, 8); nose.rotateZ(-Math.PI / 2); nose.translate(8.2, 1.6, 0); J.push(col(nose, 0x8c949b));
  const can = new THREE.SphereGeometry(0.6, 8, 6); can.scale(2.2, 0.8, 0.9); can.translate(4.2, 2.3, 0); J.push(col(can, 0x30363c));
  const wing = new THREE.Shape([new THREE.Vector2(2, 0), new THREE.Vector2(-3.5, 6), new THREE.Vector2(-5, 6), new THREE.Vector2(-4, 0)]); for (const sd of [1, -1]) { const w = new THREE.ExtrudeGeometry(wing, { depth: 0.15, bevelEnabled: false }); w.rotateX(Math.PI / 2); if (sd < 0) w.scale(1, 1, -1); w.translate(0, 1.6, 0); J.push(col(w, 0x858d94)); const tl = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.6, 0), new THREE.Vector2(-3.2, 2.6), new THREE.Vector2(-2, 2.6)]); const tg = new THREE.ExtrudeGeometry(tl, { depth: 0.1, bevelEnabled: false }); tg.rotateX(-sd * 0.35); tg.translate(-3, 2, sd * 1.1); J.push(col(tg, 0x858d94)); }
  for (const sd of [1, -1]) J.push(bx(2.2, 0.3, 3.5, -5.6, 1.6, sd * 2.2, 0x858d94));
  for (const [x, z] of [[5, 0], [-3, 1.4], [-3, -1.4]]) { const wh = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8); wh.rotateX(Math.PI / 2); wh.translate(x, 0.35, z); J.push(col(wh, 0x1a1a1a)); }
  const jg = mergeGeometries(J); const spots: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) spots.push([150 - i * 13, -26 + (i % 2) * 2, 2.6]); for (let i = 0; i < 6; i++) spots.push([-70 - i * 12, -30, 2.2]); for (let i = 0; i < 4; i++) spots.push([110 - i * 14, 18 - i * 0.5, -0.4]);
  const jets = new THREE.InstancedMesh(jg, VC({ metalness: 0.45, roughness: 0.45 }), spots.length); const mm = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach(([x, z, ry], i) => { q.setFromEuler(new THREE.Euler(0, ry, 0)); mm.compose(new V3(x, DY, z), q, new V3(1, 1, 1)); jets.setMatrixAt(i, mm); }); jets.castShadow = true; g.add(jets);
  // deck crew in coloured jerseys (faceless), instanced: body + white head
  const jer = [0xe8c020, 0xc02020, 0x2a8a3a, 0x2a5ac8, 0xeeeeee, 0x7a3aa8, 0x7a5030]; const NC = 46;
  const bodyG = new THREE.CapsuleGeometry(0.28, 1.0, 3, 6); bodyG.translate(0, 0.8, 0); const headG = new THREE.SphereGeometry(0.2, 8, 6); headG.translate(0, 1.72, 0);
  const crewB = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), NC), crewH = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }), NC);
  const crew: { p: THREE.Vector3; ph: number }[] = [];
  for (let i = 0; i < NC; i++) { const p = i < 14 ? new V3(-30 + (i % 7) * 4, DY, 4 + Math.floor(i / 7) * 8) : new V3(-150 + Math.random() * 300, DY, -24 + Math.random() * 40); crew.push({ p, ph: Math.random() * 6 }); mm.makeTranslation(p.x, p.y, p.z); crewB.setMatrixAt(i, mm); crewH.setMatrixAt(i, mm); crewB.setColorAt(i, new THREE.Color(jer[i % jer.length])); }
  g.add(crewB, crewH);
  const updCrew = (t: number) => { crew.forEach((c, i) => { const wave = i < 14 ? Math.sin(t * 6 + c.ph) * 0.12 : 0; mm.makeRotationZ(wave); mm.setPosition(c.p.x, c.p.y + Math.abs(wave) * 0.3, c.p.z); crewB.setMatrixAt(i, mm); crewH.setMatrixAt(i, mm); }); crewB.instanceMatrix.needsUpdate = crewH.instanceMatrix.needsUpdate = true; };
  return { g, lights, updCrew, pad: new V3(-15, DY, 10) };
}
function makeEscort(L: number) { const P: G[] = []; const hs = new THREE.Shape([new THREE.Vector2(L / 2, 0), new THREE.Vector2(L * 0.3, L * 0.06), new THREE.Vector2(-L / 2, L * 0.065), new THREE.Vector2(-L / 2, -L * 0.065), new THREE.Vector2(L * 0.3, -L * 0.06)]); const h = new THREE.ExtrudeGeometry(hs, { depth: 9, bevelEnabled: false }); h.rotateX(-Math.PI / 2); h.translate(0, -2, 0); P.push(col(h, 0x6b7279));
  P.push(bx(L * 0.22, 7, L * 0.09, L * 0.05, 10, 0, 0x777e84), bx(L * 0.12, 5, L * 0.07, L * 0.04, 15, 0, 0x7c8389), bx(1, 12, 1, 0, 22, 0, 0x50565a), bx(L * 0.15, 4, L * 0.08, -L * 0.22, 9, 0, 0x777e84)); return mesh(P, VC({ metalness: 0.35, roughness: 0.6 })); }

// ---------------- MH-60-style helicopter (generic) ----------------
function makeHeli() {
  const g = new THREE.Group(); const P: G[] = []; const C = 0x5d666e, D = 0x2b3035;
  const prof: [number, number][] = [[0, -5.2], [0.6, -5], [1.0, -4.2], [1.2, -2.5], [1.25, 0], [1.2, 2.0], [0.9, 3.4], [0.5, 4.2], [0.35, 9.5], [0.25, 10.6]];
  const lat = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12); lat.rotateZ(Math.PI / 2); lat.scale(1, 1.15, 1); lat.translate(0, 1.7, 0); P.push(col(lat, C));
  P.push(bx(3.2, 1.0, 1.6, 0.5, 2.9, 0, C), bx(0.25, 2.2, 1.2, -10.2, 2.8, 0, C, 0, 0.3), bx(1.5, 0.08, 3.6, -9.4, 1.9, 0, C));
  for (const sd of [1, -1]) { P.push(bx(1.8, 0.7, 0.9, 0.4, 1.2, sd * 1.5, C), bx(0.12, 0.12, 2.2, 2.6, 0.3, sd * 0.8, D), bx(0.6, 0.3, 0.3, -7.8, 0.4, 0, D)); const wh = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10); wh.rotateX(Math.PI / 2); wh.translate(2.6, 0.33, sd * 1.6); P.push(col(wh, 0x111111)); }
  const glass = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2); glass.rotateZ(-Math.PI / 2); glass.scale(1.3, 0.9, 1.15); glass.translate(4.0, 2.3, 0);
  g.add(mesh(P, VC({ metalness: 0.35, roughness: 0.55 }))); const gm = new THREE.Mesh(glass, new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: 0.9, roughness: 0.08 })); g.add(gm);
  const rotor = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: D })); b.geometry.translate(4.1, 0, 0); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8.2, 32), new THREE.MeshBasicMaterial({ color: 0x202428, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; rotor.add(disc); rotor.position.set(0.5, 3.55, 0); g.add(rotor);
  const tr = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: D })); b.geometry.translate(0, 0.8, 0); b.rotation.x = i * Math.PI / 2; tr.add(b); } tr.position.set(-10.3, 3.4, 0.25); g.add(tr);
  const beacon = new THREE.PointLight(0xff2020, 0, 20); beacon.position.set(-1, 3.9, 0); g.add(beacon);
  g.scale.setScalar(1); return { g, spin(dt: number, t: number) { rotor.rotation.y += dt * 28; tr.rotation.z += dt * 60; beacon.intensity = (Math.sin(t * 9) > 0.7 ? 30 : 0); } };
}
function makeRHIB() { const g = new THREE.Group(); const P: G[] = []; for (const sd of [1, -1]) { const t = new THREE.CapsuleGeometry(0.42, 6.5, 4, 10); t.rotateZ(Math.PI / 2); t.translate(0, 0.45, sd * 1.05); P.push(col(t, 0x26282a)); }
  const bow = new THREE.SphereGeometry(1.1, 10, 8); bow.scale(1.4, 0.4, 1); bow.translate(3.6, 0.45, 0); P.push(col(bow, 0x26282a)); P.push(bx(7, 0.3, 1.8, 0, 0.2, 0, 0x3a3c3e), bx(1.0, 1.0, 0.9, 0.3, 0.9, 0, 0x2a2e30), bx(0.6, 0.9, 0.5, -3.6, 0.8, 0, 0x111111));
  for (const [x, z, c] of [[1.4, 0.5, 0xefefe8], [1.4, -0.5, 0xefefe8], [-0.9, 0, 0x2e3a2e], [-2.2, 0.5, 0x2e3a2e], [-1.2, -0.6, 0xefefe8]] as const) { const b = new THREE.CapsuleGeometry(0.22, 0.55, 3, 6); b.translate(x, 1.05, z); P.push(col(b, c)); const h = new THREE.SphereGeometry(0.17, 8, 6); h.translate(x, 1.6, z); P.push(col(h, 0xf2f0ea)); }
  g.add(mesh(P, VC({ roughness: 0.6 }))); return g; }

// ---------------- Taipei skyline (generic towers incl. a stepped supertall silhouette), fires & smoke ----------------
function makeCity(x0: number, x1: number, zBand: [number, number], seed = 1) { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const P: G[] = []; const fires: THREE.Vector3[] = [];
  for (let i = 0; i < 520; i++) { const x = x0 + r() * (x1 - x0), z = zBand[0] + r() * (zBand[1] - zBand[0]); if (Math.hypot(x + 260, z - 160) < 120 || (x > -330 && Math.abs(z) < 260)) continue; const far = Math.min(1, Math.abs(z) / 600); const h = 8 + r() * 26 + (r() < 0.08 ? 40 + r() * 60 : 0) * far; P.push(bx(10 + r() * 14, h, 10 + r() * 14, x, h / 2, z, [0x7d776e, 0x8a8479, 0x6a665f, 0x9a948a][Math.floor(r() * 4)])); if (r() < 0.04) fires.push(new V3(x, h, z)); }
  // stepped supertall (generic, 8 stacked flared segments)
  const tx = (x0 + x1) / 2 - 120, tz = zBand[1] - 80; let y = 0; P.push(bx(40, 30, 40, tx, 15, tz, 0x5a7a80)); y = 30; for (let k = 0; k < 8; k++) { const seg = new THREE.CylinderGeometry(12, 9, 30, 4); seg.rotateY(Math.PI / 4); seg.translate(tx, y + 15, tz); P.push(col(seg, 0x4e7078)); y += 30; } P.push(bx(1.5, 50, 1.5, tx, y + 25, tz, 0x8a9a9a));
  const m = mesh(P, VC({ roughness: 0.9, metalness: 0.05 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 200, zBand[1] - zBand[0] + 200), new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set((x0 + x1) / 2, 0.6, (zBand[0] + zBand[1]) / 2);
  return { m, ground, fires }; }
function makeSmoke(sources: THREE.Vector3[], n = 900, warm = true) { const pos = new Float32Array(n * 3), life = new Float32Array(n); const src = sources.length ? sources : [new V3()]; for (let i = 0; i < n; i++) { life[i] = Math.random(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const mat = new THREE.PointsMaterial({ color: warm ? 0x3a3330 : 0xffffff, size: 18, map: softTex, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; const fireG = new THREE.BufferGeometry(); const fp = new Float32Array(src.length * 3); src.forEach((s, i) => fp.set([s.x, s.y + 2, s.z], i * 3)); fireG.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const fire = new THREE.Points(fireG, new THREE.PointsMaterial({ color: 0xff7a2a, size: 14, map: softTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  return { pts, fire, update(dt: number) { for (let i = 0; i < n; i++) { life[i] += dt * 0.08; if (life[i] > 1) life[i] -= 1; const s = src[i % src.length]; const L = life[i]; pos[i * 3] = s.x + L * 60 + Math.sin(i * 3.1) * 6 * L; pos[i * 3 + 1] = s.y + L * 120; pos[i * 3 + 2] = s.z + Math.cos(i * 1.7) * 10 * L; } geo.attributes.position.needsUpdate = true; (fire.material as THREE.PointsMaterial).size = 12 + Math.random() * 5; } }; }
function makeSpray(n = 600) { const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n).fill(2); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf0f4f6, size: 2.2, map: softTex, transparent: true, opacity: 0.55, depthWrite: false })); pts.frustumCulled = false; let k = 0;
  return { pts, emit(p: THREE.Vector3, r: number, up: number, out: number, cnt: number) { for (let j = 0; j < cnt; j++) { const i = k++ % n; const a = Math.random() * 6.283; pos.set([p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r], i * 3); vel.set([Math.cos(a) * out * (0.5 + Math.random()), up * (0.3 + Math.random()), Math.sin(a) * out * (0.5 + Math.random())], i * 3); life[i] = 0; } },
    update(dt: number) { for (let i = 0; i < n; i++) { if (life[i] > 1.6) { pos[i * 3 + 1] = -99; continue; } life[i] += dt; vel[i * 3 + 1] -= 6 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; } geo.attributes.position.needsUpdate = true; } }; }

// ---------------- grade / grain / letterbox / vignette ----------------
const GradeShader = { uniforms: { tDiffuse: { value: null }, t: { value: 0 }, bars: { value: 0 }, fade: { value: 0 }, fadeCol: { value: new THREE.Color(0, 0, 0) }, warm: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float t, bars, fade, warm; uniform vec3 fadeCol; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 uv = vUv; vec3 c = texture2D(tDiffuse, uv).rgb; c = max(c, 0.);
      c = clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14), 0., 1.); // ACES fit
      // teal/orange grade, gentle S-curve
      float l = dot(c, vec3(.299,.587,.114)); c = mix(c, c*vec3(1.08,1.0,0.9), warm*smoothstep(.35,.9,l)); c = mix(c, c*vec3(0.88,1.0,1.08), warm*(1.-smoothstep(.0,.45,l)));
      c = c*c*(3.-2.*c)*0.35 + c*0.65; c = mix(vec3(l), c, 1.08);
      float v = smoothstep(1.15, 0.35, length(uv-.5)*1.3); c *= mix(0.72, 1., v);
      c += (h(uv*vec2(1920.,1080.) + fract(t*13.)) - .5)*0.06;
      c = mix(c, fadeCol, fade);
      if (uv.y < bars || uv.y > 1.-bars) c = vec3(0.);
      gl_FragColor = vec4(c,1.); }` };

// ---------------- procedural ambient audio (synthesised, no samples) ----------------
function audio(mode: string) { try { const ac = new AudioContext(); const len = ac.sampleRate * 2; const buf = ac.createBuffer(1, len, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g = ac.createGain(); g.gain.value = 0.0;
  const sea = ac.createBufferSource(); sea.buffer = buf; sea.loop = true; sea.playbackRate.value = 0.5; const sl = ac.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 700; const sg = ac.createGain(); sg.gain.value = 0.05;
  const lfo = ac.createOscillator(); lfo.frequency.value = mode === 'heli' ? 19 : 0.15; const lg = ac.createGain(); lg.gain.value = mode === 'heli' ? 0.12 : 0.03; lfo.connect(lg); lg.connect(g.gain);
  src.connect(lp); lp.connect(g); g.connect(ac.destination); sea.connect(sl); sl.connect(sg); sg.connect(ac.destination); src.start(); sea.start(); lfo.start(); g.gain.value = mode === 'heli' ? 0.12 : 0.04;
  return { set(v: number) { g.gain.value = v; }, stop() { ac.close(); } }; } catch { return { set() {}, stop() {} }; } }

// ---------------- shot helpers ----------------
const ease = (k: number) => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, ease(k));
type Shot = { t0: number; t1: number; cap?: string; cam: (k: number, t: number) => [THREE.Vector3, THREE.Vector3, number?] }; // returns camPos, target, fov

export async function play(renderer: THREE.WebGLRenderer, mode: 'heli' | 'boat', onEnd: () => void) {
  const W = innerWidth, H = innerHeight; const sc = new THREE.Scene(); const night0 = mode === 'boat' ? 1 : 0;
  const sun = new THREE.DirectionalLight(0xffc08a, 2.6); const sunDir = new V3(0.55, 0.13, 0.25).normalize(); sun.position.copy(sunDir).multiplyScalar(800); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 10, far: 2000 }); sun.shadow.bias = -0.0004; sc.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffd8b0, 0x1a3040, 0.7); sc.add(hemi); sc.fog = new THREE.Fog(0xe8b08a, 400, 2400);
  try { const hdr = await new RGBELoader().loadAsync(import.meta.env.BASE_URL + 'cine/sky_1k.hdr'); const pm = new THREE.PMREMGenerator(renderer); sc.environment = pm.fromEquirectangular(hdr).texture; sc.environmentIntensity = 0.45; hdr.dispose(); } catch { /* optional */ }
  const sky = makeSky(); sc.add(sky.m); const ocean = makeOcean(); sc.add(ocean.m); ocean.mat.uniforms.sunDir.value.copy(sunDir); sky.mat.uniforms.sunDir.value.copy(sunDir);
  // world layout: Taipei / Tamsui river mouth around x<0, carrier group at x≈2600
  const city = makeCity(-1400, -150, [120, 900], 7), city2 = makeCity(-1400, -150, [-900, -120], 11); sc.add(city.m, city.ground, city2.m, city2.ground);
  const fires = city.fires.concat(city2.fires); const smoke = makeSmoke(fires, 1100); sc.add(smoke.pts, smoke.fire); const fireLights = fires.slice(0, 6).map(f => { const l = new THREE.PointLight(0xff6a20, 4000, 260, 2); l.position.copy(f).add(new V3(0, 10, 0)); sc.add(l); return l; });
  const CV = new V3(2600, 0, 0); const cv = makeCarrier(); cv.g.position.copy(CV); cv.g.rotation.y = 0.12; sc.add(cv.g);
  const esc = [makeEscort(155), makeEscort(155), makeEscort(170)]; [[2350, 380], [3000, -420], [2050, -320]].forEach(([x, z], i) => { esc[i].position.set(x, 0, z); esc[i].rotation.y = 0.12; sc.add(esc[i]); });
  const padW = cv.pad.clone().applyAxisAngle(new V3(0, 1, 0), 0.12).add(CV);
  const spray = makeSpray(900); sc.add(spray.pts);
  const haze: THREE.Sprite[] = []; for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xf0c8a8, transparent: true, opacity: 0.25, depthWrite: false })); s.position.set(-600 + Math.random() * 3800, 60 + Math.random() * 160, (Math.random() - 0.5) * 2400); s.scale.set(500, 120, 1); sc.add(s); haze.push(s); }
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xffb070, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sunSprite.scale.set(700, 700, 1); sunSprite.position.copy(sunDir).multiplyScalar(2800); sc.add(sunSprite);
  const heli = makeHeli(); sc.add(heli.g); const boat = makeRHIB(); sc.add(boat); heli.g.visible = mode === 'heli'; boat.visible = mode === 'boat';
  const player = new THREE.Group(); { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a5a7a })); b.position.y = 0.8; const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2f0ea })); h.position.y = 1.72; player.add(b, h); } sc.add(player);
  const flare = new THREE.PointLight(0xff3020, 900, 80, 2); sc.add(flare); const flareSmoke = makeSmoke([new V3(-256, 1, 160)], 160, false); (flareSmoke.pts.material as THREE.PointsMaterial).color.set(0xff6050); (flareSmoke.pts.material as THREE.PointsMaterial).size = 6; sc.add(flareSmoke.pts);
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.5, 8000);
  const comp = new EffectComposer(renderer); comp.setSize(W, H); comp.addPass(new RenderPass(sc, cam));
  const bokeh = new BokehPass(sc, cam, { focus: 60, aperture: 0.00012, maxblur: 0.006 }); comp.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.55, 0.6, 0.82); comp.addPass(bloom);
  const grade = new ShaderPass(GradeShader); comp.addPass(grade); comp.addPass(new OutputPass());
  const prevTone = renderer.toneMapping, prevExp = renderer.toneMappingExposure; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1.0; renderer.shadowMap.enabled = true;
  const capEl = document.createElement('div'); capEl.id = 'cinecap'; document.body.appendChild(capEl); const snd = audio(mode);
  // ---------- paths ----------
  const pick = new V3(-260, 1, 160); // riverside pickup (bank)
  const hp = new V3(), tmp = new V3(); let shots: Shot[] = []; let T = 0; let night = night0;
  const heliPos = (t: number) => { // helicopter world path
    if (t < 6) return lerpV(pick.clone().add(new V3(-80, 70, 40)), pick.clone().add(new V3(0, 3, 0)), t / 5.5);
    if (t < 8) return pick.clone().add(new V3(0, 3, 0));
    if (t < 24) { const k = (t - 8) / 16; const a = pick.clone().add(new V3(0, 3, 0)), b = padW.clone().add(new V3(-420, 90, -60)); const p = lerpV(a, b, k); p.y = a.y + (b.y - a.y) * Math.min(1, k * 3) + Math.sin(k * 9) * 2; p.x = a.x + (b.x - a.x) * k; return p; }
    const k = (t - 24) / 7; return lerpV(padW.clone().add(new V3(-420, 90, -60)), padW.clone().add(new V3(0, 0.1, 0)), k); };
  const boatPos = (t: number) => { const a = new V3(-700, 0, 0), b = new V3(150, 0, 0), c = CV.clone().add(new V3(-200, 0, 140)), d = CV.clone().add(new V3(-30, 0, 60)); if (t < 14) return lerpV(a, b, t / 14).setZ(Math.sin(t * 0.4) * 8); if (t < 24) return lerpV(b, c, (t - 14) / 10); return lerpV(c, d, (t - 24) / 6); };
  if (mode === 'heli') { T = 33; shots = [
    { t0: 0, t1: 6, cap: '黎明。萬華河濱——紅色信號彈標示出撤離點', cam: (k) => [lerpV(pick.clone().add(new V3(-60, 4, 70)), pick.clone().add(new V3(-30, 22, 40)), k), heliPos(k * 6).lerp(pick, 0.4), 40] },
    { t0: 6, t1: 10, cap: '旋翼下洗氣流捲起河水與塵土——快上機！', cam: (k, t) => [pick.clone().add(new V3(18 - k * 6, 2.2 + k * 3, 14)), heliPos(t).add(new V3(0, 1.5, 0)), 38] },
    { t0: 10, t1: 16, cap: '身後，台北還在燃燒', cam: (k, t) => { const p = heliPos(t); return [p.clone().add(new V3(60 - k * 20, 8 + k * 6, 40)), p.clone().lerp(new V3(-700, 60, 300), 0.35), 34]; } },
    { t0: 16, t1: 22, cap: '台灣海峽・國際水域——航艦打擊群', cam: (k) => [new V3(CV.x - 900 + k * 250, 60 + k * 30, 520 - k * 80), CV.clone().add(new V3(0, 20, 0)), 30] },
    { t0: 22, t1: 28, cap: '前方：福特號航空母艦（USS Gerald R. Ford, CVN-78）', cam: (k, t) => { const p = heliPos(t); return [p.clone().add(new V3(-45 + k * 10, 10, -35 + k * 20)), p.clone().lerp(padW, 0.25 + k * 0.4), 36]; } },
    { t0: 28, t1: 33, cap: '著艦。甲板人員揮手迎接', cam: (k) => [padW.clone().add(new V3(38 - k * 10, 3 + k * 16, 26 + k * 10)), padW.clone().add(new V3(0, 3 - k * 1, 0)), 34] }]; }
  else { T = 32; shots = [
    { t0: 0, t1: 7, cap: '深夜。真正的線人——橡皮艇在堤防下等你', cam: (k, t) => { const p = boatPos(t); return [p.clone().add(new V3(-14 + k * 4, 1.6, 4)), p.clone().add(new V3(20, 0.5, -1)), 40]; } },
    { t0: 7, t1: 14, cap: '熄燈，順著淡水河往下游——兩岸火光', cam: (k, t) => { const p = boatPos(t); return [p.clone().add(new V3(-40 - k * 30, 26 + k * 30, 40)), p.clone().add(new V3(30, 0, 0)), 38]; } },
    { t0: 14, t1: 21, cap: '出海口。浪變大了，天快亮', cam: (k, t) => { const p = boatPos(t); return [p.clone().add(new V3(16, 2.2 + Math.sin(t * 2) * 0.6, -10)), p.clone().add(new V3(-4, 1, 0)), 42]; } },
    { t0: 21, t1: 27, cap: '曙光中，福特號航空母艦（CVN-78）在國際水域等候', cam: (k, t) => { const p = boatPos(t); return [p.clone().add(new V3(-60 + k * 20, 6 + k * 8, -30)), CV.clone().add(new V3(0, 30, 0)), 32]; } },
    { t0: 27, t1: 32, cap: '舷側登艦梯放下——你安全了', cam: (k, t) => { const p = boatPos(t); return [p.clone().add(new V3(-30, 4 + k * 40, 50 + k * 30)), p.clone().lerp(CV.clone().add(new V3(-30, 20, 40)), 0.3 + k * 0.5), 38]; } }]; }
  let t = 0, last = performance.now(), dtAcc = 0;
  return new Promise<void>(res => { const tick = () => {
    const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now; t += (window as any).__cineFast ? 0.25 : dt;
    // time-of-day (boat: night -> dawn)
    if (mode === 'boat') night = 1 - ease((t - 13) / 12); const nk = night;
    sun.intensity = 2.6 * (1 - nk) + 0.15; sun.color.setRGB(1, 0.72 - nk * 0.2, 0.5 + nk * 0.3); hemi.intensity = 0.7 * (1 - nk) + 0.12; (sc.fog as THREE.Fog).color.setRGB(0.91 * (1 - nk) + 0.03, 0.69 * (1 - nk) + 0.04, 0.54 * (1 - nk) + 0.07);
    sky.mat.uniforms.night.value = nk; sky.mat.uniforms.t.value = t; ocean.mat.uniforms.night.value = nk; ocean.mat.uniforms.t.value = t; (ocean.mat.uniforms.horizon.value as THREE.Color).setRGB(0.94 * (1 - nk) + 0.04, 0.72 * (1 - nk) + 0.05, 0.56 * (1 - nk) + 0.09); (ocean.mat.uniforms.sky.value as THREE.Color).setRGB(0.88 * (1 - nk) + 0.03, 0.64 * (1 - nk) + 0.04, 0.48 * (1 - nk) + 0.08);
    sunSprite.material.opacity = 0.9 * (1 - nk); haze.forEach(h => h.material.opacity = 0.22 * (1 - nk * 0.7)); cv.lights.visible = nk > 0.2; fireLights.forEach(l => l.intensity = (2500 + Math.random() * 2500) * (0.5 + nk));
    // actors
    heli.spin(dt, t); smoke.update(dt); flareSmoke.update(dt * 2); spray.update(dt); cv.updCrew(t);
    flare.position.copy(pick).add(new V3(4, 1, 0)); flare.intensity = mode === 'heli' && t < 12 ? 700 + Math.random() * 500 : 0; (flareSmoke as any).pts.visible = mode === 'heli' && t < 14; flareSmoke.pts.position.set(0, 0, 0);
    if (mode === 'heli') { hp.copy(heliPos(t)); const nx = heliPos(t + 0.2); const dir = Math.atan2(-(nx.z - hp.z), nx.x - hp.x); heli.g.position.copy(hp); heli.g.position.y += gerstner(hp.x, hp.z, t) * 0 + Math.sin(t * 2.2) * 0.15; heli.g.rotation.set(0, Math.abs(nx.x - hp.x) + Math.abs(nx.z - hp.z) > 0.02 ? dir : heli.g.rotation.y, t > 8 && t < 24 ? -0.12 : 0);
      player.visible = t < 8.2; player.position.copy(pick).add(new V3(8 - Math.max(0, t - 6) * 3.6, 0, 3)); const alt = hp.y - (t > 24 ? padW.y : 0);
      if (alt < 30) { const groundY = t > 24 ? padW.y + 0.3 : 0.6; spray.emit(new V3(hp.x, groundY, hp.z), 4 + alt * 0.3, 3 + (30 - alt) * 0.2, 9, Math.floor((30 - alt) / 2)); }
      snd.set(0.05 + 0.1 * (1 - Math.min(1, alt / 120))); ocean.mat.uniforms.wakes.value[1].set(0, 0, 0, 0); }
    else { const p = boatPos(t), n = boatPos(t + 0.3); const yaw = Math.atan2(-(n.z - p.z), n.x - p.x); const wy = gerstner(p.x, p.z, t); boat.position.set(p.x, wy * (t > 13 ? 1 : 0.2) + 0.1, p.z); boat.rotation.set(Math.sin(t * 2.1) * 0.06 * (t > 13 ? 2 : 0.5), yaw, 0.08 + Math.sin(t * 1.7) * 0.05); player.visible = false;
      spray.emit(new V3(p.x + Math.cos(yaw) * 3.8, 0.3, p.z - Math.sin(yaw) * 3.8), 1.2, 2.5, 3, t > 13 ? 4 : 1); ocean.mat.uniforms.wakes.value[1].set(p.x - Math.cos(yaw) * 3, p.z + Math.sin(yaw) * 3, Math.atan2(-Math.sin(yaw), Math.cos(yaw)), 140); }
    ocean.mat.uniforms.wakes.value[0].set(CV.x - 160 * Math.cos(0.12), CV.z + 160 * Math.sin(0.12), -0.12, 900); ocean.mat.uniforms.wakes.value[2].set(esc[0].position.x - 70, esc[0].position.z + 9, -0.12, 400);
    // camera
    const s = shots.find(x => t >= x.t0 && t < x.t1) || shots[shots.length - 1]; const k = Math.min(1, (t - s.t0) / (s.t1 - s.t0)); const [cp, ct, fov] = s.cam(k, t);
    if (cp.y < 1.2) cp.y = 1.2; cam.position.copy(cp); cam.position.y += Math.sin(t * 1.3) * 0.12; cam.lookAt(ct); cam.fov = fov || 40; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    (bokeh.uniforms as any).focus.value = cp.distanceTo(mode === 'heli' ? heli.g.position : boat.position); ocean.follow(cam);
    sun.target.position.copy(mode === 'heli' ? heli.g.position : boat.position); sun.position.copy(sun.target.position).addScaledVector(sunDir, 800);
    capEl.textContent = s.cap || ''; capEl.style.opacity = String(Math.min(1, (t - s.t0) * 2, (s.t1 - t) * 2));
    const gu = grade.uniforms as any; gu.t.value = t; gu.bars.value = 0.11 * ease(t / 1.2); const fin = ease((t - (T - 2)) / 2); gu.fade.value = t < 1 ? 1 - t : fin; gu.fadeCol.value.setRGB(fin, fin * 0.97, fin * 0.92);
    comp.render(dtAcc += dt);
    if (t < T) requestAnimationFrame(tick); else { capEl.remove(); snd.stop(); renderer.toneMapping = prevTone; renderer.toneMappingExposure = prevExp; comp.dispose(); const w = document.createElement('div'); w.id = 'cinefade'; w.style.cssText = 'opacity:1;background:#fff8f0;transition:opacity 1.6s'; document.body.appendChild(w); onEnd(); requestAnimationFrame(() => { w.style.opacity = '0'; setTimeout(() => w.remove(), 1700); }); res(); }
  }; (window as any).__cineT = () => t; tick(); });
}
