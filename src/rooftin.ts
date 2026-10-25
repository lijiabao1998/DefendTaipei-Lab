import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// 頂樓加蓋 鐵皮屋: real small-house shapes (gable / arched / mono-pitch), corrugated ribs via normal map, aluminium 鐵窗 windows, gutters, tanks.
const cv = (w: number, h: number, f: (c: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')!); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
// normal map: sinusoidal ribs along U (5 ribs per metre since UVs are in metres)
const ribN = cv(64, 8, c => { const d = c.createImageData(64, 8); for (let x = 0; x < 64; x++) { const s = Math.cos((x / 64) * Math.PI * 2 * 5); const nx = s * 0.75; for (let y = 0; y < 8; y++) { const i = (y * 64 + x) * 4; d.data[i] = (nx * 0.5 + 0.5) * 255; d.data[i + 1] = 128; d.data[i + 2] = Math.sqrt(1 - nx * nx) * 255; d.data[i + 3] = 255; } } c.putImageData(d, 0, 0); });
ribN.colorSpace = THREE.NoColorSpace;
// palettes: mostly teal/grey-green and oxide red; some faded/rusty; few white/blue
const PAL: [string, number][] = [['#5f8c84', 30], ['#6f9488', 18], ['#4f7a78', 10], ['#9a4436', 18], ['#a85a46', 8], ['#8a6a58', 6], ['#d8d8d0', 4], ['#5a7ea0', 4], ['#7a5a40', 2]];
const mkTex = (base: string, seed: number) => cv(128, 128, c => { c.fillStyle = base; c.fillRect(0, 0, 128, 128); let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let x = 0; x < 128; x += 128 / 10) { c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, 0, 3, 128); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + 6, 0, 3, 128); } // rib shading
  for (let y = 0; y < 128; y += 64) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, y, 128, 1); } // panel laps
  for (let i = 0; i < 9; i++) { const x = r() * 128, w = 2 + r() * 6, L = 30 + r() * 98; const g = c.createLinearGradient(0, 0, 0, L); g.addColorStop(0, 'rgba(110,52,22,.75)'); g.addColorStop(1, 'rgba(110,52,22,0)'); c.fillStyle = g; c.fillRect(x, 0, w, L); } // rust streaks
  for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(${90 + r() * 40},${40 + r() * 20},20,${0.25 + r() * 0.4})`; c.beginPath(); c.arc(r() * 128, r() * 128, 1 + r() * 4, 0, 7); c.fill(); }
  const fade = c.createLinearGradient(0, 0, 0, 128); fade.addColorStop(0, 'rgba(240,240,230,.18)'); fade.addColorStop(1, 'rgba(0,0,0,.1)'); c.fillStyle = fade; c.fillRect(0, 0, 128, 128); });
const MATS = PAL.map(([b], i) => new THREE.MeshStandardMaterial({ map: mkTex(b, 1234 + i * 77), normalMap: ribN, normalScale: new THREE.Vector2(1.2, 1.2), metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide }));
const pickMat = (q: number) => { const tot = PAL.reduce((a, p) => a + p[1], 0); let acc = 0; for (let i = 0; i < PAL.length; i++) { acc += PAL[i][1] / tot; if (q < acc) return i; } return 0; };
const detMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.45 });
export const shackGlass = new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.15, metalness: 0.6, emissive: 0xffc070, emissiveIntensity: 0 });
export function setShackNight(k: number) { shackGlass.emissiveIntensity = k * 0.9; }
// geometry helpers. UVs in metres so ribs are to scale.
function uvMeters(g: THREE.BufferGeometry, ax: 'xy' | 'zy' | 'xz') { const p = g.attributes.position as THREE.BufferAttribute; const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); uv[i * 2] = ax === 'zy' ? z : x; uv[i * 2 + 1] = ax === 'xz' ? z : y; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
const col = (g: THREE.BufferGeometry, c: number) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); g.deleteAttribute('uv'); return col(g, c); };
const strip = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); return n; };

export function makeShack(W: number, D: number, rnd: () => number) {
  const g = new THREE.Group(); const H = 2.5 + rnd() * 0.4; const wallI = pickMat(rnd()), roofI = rnd() < 0.6 ? wallI : pickMat(rnd());
  const walls: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [], det: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  // walls: 4 planes with ribs vertical (u along wall, v up) -> ribs run vertically
  const wall = (len: number, ry: number, ox: number, oz: number) => { const p = new THREE.PlaneGeometry(len, H); uvMeters(p, 'xy'); p.translate(0, H / 2, 0); p.rotateY(ry); p.translate(ox, 0, oz); walls.push(p); };
  wall(W, 0, 0, D / 2); wall(W, Math.PI, 0, -D / 2); wall(D, Math.PI / 2, W / 2, 0); wall(D, -Math.PI / 2, -W / 2, 0);
  const kind = rnd(); const ov = 0.35; const long = W >= D; const L = (long ? W : D) + ov * 2, S = (long ? D : W) + ov * 2;
  const rot = (geo: THREE.BufferGeometry) => { if (!long) geo.rotateY(Math.PI / 2); return geo; };
  let ridge = 0;
  if (kind < 0.45) { // gable (雙斜)
    const pitch = 0.18 + rnd() * 0.12; ridge = (S / 2) * pitch;
    for (const sd of [-1, 1]) { const half = Math.hypot(S / 2, ridge); const p = new THREE.PlaneGeometry(L, half); uvMeters(p, 'xy'); p.rotateX(-Math.PI / 2 + sd * Math.atan2(ridge, S / 2)); p.translate(0, H + ridge / 2, sd * S / 4); rot(p); roofs.push(p); }
    for (const e of [-1, 1]) { const sh = new THREE.Shape([new THREE.Vector2(-(S - ov * 2) / 2, 0), new THREE.Vector2((S - ov * 2) / 2, 0), new THREE.Vector2(0, ridge * (S - ov * 2) / S)]); const t = new THREE.ShapeGeometry(sh); uvMeters(t, 'xy'); t.rotateY(Math.PI / 2); t.translate(e * (L - ov * 2) / 2, H, 0); rot(t); walls.push(t); }
    det.push(rot(B(L, 0.12, 0.14, 0, H + ridge + 0.03, 0, 0x8a8e8c))); // ridge cap
  } else if (kind < 0.75) { // shallow arch (圓弧浪板)
    const rise = 0.35 + rnd() * 0.3; const R = (S * S / 4 + rise * rise) / (2 * rise); const th = 2 * Math.asin(S / 2 / R); ridge = rise;
    const c = new THREE.CylinderGeometry(R, R, L, 18, 1, true, -th / 2, th); const p = c.attributes.position as THREE.BufferAttribute; const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getY(i); uv[i * 2 + 1] = Math.atan2(p.getX(i), p.getZ(i)) * R; } c.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    c.rotateZ(Math.PI / 2); c.rotateX(-Math.PI / 2); c.translate(0, H + rise - R, 0); // axis along x, arc across z
    c.rotateY(0); rot(c); roofs.push(c);
    for (const e of [-1, 1]) { const sh = new THREE.Shape(); const s2 = (S - ov * 2) / 2; sh.moveTo(-s2, 0); sh.lineTo(s2, 0); for (let k = 0; k <= 8; k++) { const z = s2 - (k / 8) * 2 * s2; sh.lineTo(z, Math.max(0, Math.sqrt(Math.max(0, R * R - z * z)) - (R - rise))); } const t = new THREE.ShapeGeometry(sh); uvMeters(t, 'xy'); t.rotateY(Math.PI / 2); t.translate(e * (L - ov * 2) / 2, H, 0); rot(t); walls.push(t); }
  } else { // mono-pitch (單斜) slightly sloped
    const drop = 0.35 + rnd() * 0.25; ridge = drop; const p = new THREE.PlaneGeometry(L, Math.hypot(S, drop)); uvMeters(p, 'xy'); p.rotateX(-Math.PI / 2 - Math.atan2(drop, S)); p.translate(0, H + drop / 2, 0); rot(p); roofs.push(p);
    const hi = new THREE.PlaneGeometry(L - ov * 2, drop); uvMeters(hi, 'xy'); hi.translate(0, H + drop / 2, (S - ov * 2) / 2); rot(hi); walls.push(hi);
  }
  // eave gutters + downpipe
  det.push(rot(B(L, 0.1, 0.12, 0, H - 0.02, S / 2 - 0.06, 0x9a9e9a)), rot(B(L, 0.1, 0.12, 0, H - 0.02, -S / 2 + 0.06, 0x9a9e9a)));
  det.push(B(0.08, H, 0.08, W / 2 + 0.06, H / 2, D / 2 + 0.06, 0x8a8e8a));
  // corner trims
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) det.push(B(0.07, H, 0.07, x * W / 2, H / 2, z * D / 2, 0xb8bab4));
  // door on front (+z) + aluminium windows w/ 鐵窗 bars
  const dx = (rnd() - 0.5) * (W - 1.4); det.push(B(0.85, 2.0, 0.05, dx, 1.0, D / 2 + 0.03, [0x6a5040, 0x8a8a84, 0x3a5a6a][Math.floor(rnd() * 3)]), B(0.06, 0.06, 0.06, dx + 0.32, 1.0, D / 2 + 0.07, 0xd0c080));
  const win = (cx: number, face: number, ww: number) => { const z = face * (D / 2 + 0.04), sx = face; glass.push(B(ww, 0.9, 0.02, cx, 1.55, z, 0)); det.push(B(ww + 0.08, 0.05, 0.05, cx, 2.02, z, 0xd8dcdc), B(ww + 0.08, 0.05, 0.05, cx, 1.08, z, 0xd8dcdc), B(0.05, 0.95, 0.05, cx - ww / 2, 1.55, z, 0xd8dcdc), B(0.05, 0.95, 0.05, cx + ww / 2, 1.55, z, 0xd8dcdc), B(0.03, 0.9, 0.03, cx, 1.55, z, 0xd8dcdc));
    const bz = z + sx * 0.14; for (let k = 0; k <= Math.round(ww / 0.14); k++) det.push(B(0.02, 1.1, 0.02, cx - ww / 2 + k * 0.14, 1.55, bz, 0x3a3e3e)); det.push(B(ww + 0.1, 0.03, 0.2, cx, 2.1, z + sx * 0.08, 0x3a3e3e), B(ww + 0.1, 0.03, 0.2, cx, 1.0, z + sx * 0.08, 0x3a3e3e)); };
  const nw = Math.max(1, Math.floor((W - 1.6) / 1.8)); for (let i = 0; i < nw; i++) { const x = -W / 2 + 0.9 + (i + 0.5) * (W - 1.8) / nw; if (Math.abs(x - dx) > 1.0) win(x, 1, 1.0); } if (rnd() < 0.7) win((rnd() - 0.5) * (W - 1.6), -1, 1.1);
  // patched panels (different colour)
  for (let i = 0; i < 2; i++) if (rnd() < 0.6) det.push(B(0.6 + rnd() * 0.8, 0.6 + rnd() * 0.9, 0.03, (rnd() - 0.5) * (W - 1), 0.5 + rnd() * 1.4, -D / 2 - 0.03, [0x8a5038, 0xb0aaa0, 0x5a7a74][Math.floor(rnd() * 3)]));
  // AC unit on wall, stainless tank on stand, laundry poles, pots, antenna
  if (rnd() < 0.7) det.push(B(0.8, 0.55, 0.3, W / 2 + 0.2, 1.9, (rnd() - 0.5) * (D - 1), 0xe0ddd2, Math.PI / 2));
  if (rnd() < 0.6) { const tx = (rnd() - 0.5) * W * 0.5, tz = (rnd() - 0.5) * D * 0.4, ty = H + ridge + 0.1; const t = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 12); t.rotateZ(Math.PI / 2); t.translate(tx, ty + 0.9, tz); t.deleteAttribute('uv'); det.push(col(t, 0xd4d8da)); for (const [a, b] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) det.push(B(0.05, 0.4, 0.05, tx + a, ty + 0.2, tz + b, 0x707470)); }
  if (rnd() < 0.5) { const lz = D / 2 + 0.9; det.push(B(0.05, 1.8, 0.05, -W / 2 + 0.4, 0.9, lz, 0x9aa0a0), B(0.05, 1.8, 0.05, W / 2 - 0.4, 0.9, lz, 0x9aa0a0), B(W - 0.8, 0.03, 0.03, 0, 1.75, lz, 0x9aa0a0)); for (let k = 0; k < 4; k++) det.push(B(0.4, 0.6, 0.02, -W / 2 + 1 + k * (W - 2) / 4, 1.42, lz, [0xd84a4a, 0xe8e0c8, 0x3a6aa8, 0xe8c040][k])); }
  for (let i = 0; i < 3; i++) if (rnd() < 0.5) { const px = -W / 2 + 0.3 + rnd() * (W - 0.6); det.push(B(0.35, 0.35, 0.35, px, 0.18, D / 2 + 0.35, 0x8a5a3a)); const s = new THREE.SphereGeometry(0.3, 6, 4); s.translate(px, 0.55, D / 2 + 0.35); s.deleteAttribute('uv'); det.push(col(s, 0x3a7a3a)); }
  if (rnd() < 0.5) { const ax = (rnd() - 0.5) * W * 0.6; det.push(B(0.04, 1.6, 0.04, ax, H + ridge + 0.8, 0, 0x777777), B(1.0, 0.03, 0.03, ax, H + ridge + 1.4, 0, 0x777777), B(0.7, 0.03, 0.03, ax, H + ridge + 1.15, 0, 0x777777)); }
  const add = (arr: THREE.BufferGeometry[], m: THREE.Material, cast = true) => { if (!arr.length) return; const me = new THREE.Mesh(mergeGeometries(arr.map(strip)), m); me.castShadow = cast; me.receiveShadow = true; g.add(me); };
  for (const a of walls) col(a, 0xffffff); for (const a of roofs) col(a, 0xffffff);
  add(walls, MATS[wallI]); add(roofs, MATS[roofI]);
  for (const a of det) if (!a.attributes.uv) a.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * 2), 2));
  for (const a of glass) a.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * 2), 2));
  add(det, detMat); add(glass, shackGlass, false);
  return g;
}
