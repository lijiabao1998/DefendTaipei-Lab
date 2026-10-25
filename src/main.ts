import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, LOOT } from './items';
import { iconURL } from './icons';
import { makeRig, animate, setWeapon, Rig, AnimState } from './human';
import { Nav, smooth } from './nav';
import { VehicleSystem, VehicleKind } from './vehicles';
import { furnish, nightMarket } from './interiors';
import { buildDecay } from './decay';
import { buildAlley } from './alley';

// ---------- utils ----------
let seed = 20261024;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const $ = (id: string) => document.getElementById(id)!;
type V2 = [number, number];
type Seg = { a: V2; b: V2; door?: Door; low?: boolean };
type Door = { b: Bld; p: V2; a: V2; c: V2; barricaded: boolean; seg?: Seg; mesh?: THREE.Mesh };
type Bld = { sign?: THREE.Mesh; floor?: THREE.Mesh; inner?: THREE.Group; innerWalls?: THREE.Mesh; detailed?: string; id: number; pts: V2[]; h: number; type: string; group: THREE.Group; walls: THREE.Mesh; roof: THREE.Group; door?: Door; c: V2; minx: number; maxx: number; minz: number; maxz: number };
type Cont = { id: string; p: V2; items: Record<string, number>; label: string; mesh: THREE.Object3D; b?: Bld; half?: number; axis?: V2; vis?: { im: THREE.InstancedMesh; max: number; item: string }[]; init?: Record<string, number> };

function pip(p: V2, pts: V2[]) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function area(pts: V2[]) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); }
function segInter(p: V2, q: V2, a: V2, b: V2) { const d1x = q[0] - p[0], d1z = q[1] - p[1], d2x = b[0] - a[0], d2z = b[1] - a[1]; const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return false; const t = ((a[0] - p[0]) * d2z - (a[1] - p[1]) * d2x) / den; const u = ((a[0] - p[0]) * d1z - (a[1] - p[1]) * d1x) / den; return t > 0 && t < 1 && u > 0 && u < 1; }

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9aa4ac, 60, 160);
let zoom = 1;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
function resize() { const a = innerWidth / innerHeight, s = 22 / zoom; camera.left = -s * a; camera.right = s * a; camera.top = s; camera.bottom = -s; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
const CAM_OFF = new THREE.Vector3(40, 56, 40);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const flash = new THREE.SpotLight(0xfff2cc, 0, 26, 0.5, 0.5, 1.2); scene.add(flash, flash.target);

// ---------- textures ----------
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const WALLC = ['#c9c1b0', '#b8b4a8', '#d8cfbd', '#a9a397', '#c4b49c', '#9fa7a8', '#d1c6b8'];
const wallTexs = WALLC.map((col, wi) => canvasTex(256, 256, c => {
  const tile = wi % 2 === 0; // 二丁掛 tile facades vs. painted render
  c.fillStyle = col; c.fillRect(0, 0, 256, 256);
  if (tile) { c.strokeStyle = 'rgba(70,60,50,.35)'; c.lineWidth = 1; for (let y = 0; y < 256; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); for (let x = (y / 8) % 2 ? 0 : 12; x < 256; x += 24) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.stroke(); } } for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(120,120,115,.9)'; c.fillRect(Math.floor(Math.random() * 10) * 24, Math.floor(Math.random() * 32) * 8, 24, 8); } } // missing tiles
  for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${Math.random() < 0.7 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 4); }
  for (let i = 0; i < 18; i++) { const x = Math.random() * 256, y0 = Math.random() * 120, w = 2 + Math.random() * 10, h = 40 + Math.random() * 180; const g = c.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, 'rgba(40,36,28,.38)'); g.addColorStop(1, 'rgba(40,36,28,0)'); c.fillStyle = g; c.fillRect(x, y0, w, h); } // rain streaks
  for (let i = 0; i < 6; i++) { const x = Math.random() * 220, y = Math.random() * 220, r = 8 + Math.random() * 26; c.fillStyle = '#8f8a82'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, rr = r * (0.5 + Math.random() * 0.6); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); } c.fill(); c.strokeStyle = 'rgba(255,255,255,.25)'; c.stroke(); } // peeling plaster
  const g2 = c.createLinearGradient(0, 190, 0, 256); g2.addColorStop(0, 'rgba(30,40,25,0)'); g2.addColorStop(1, 'rgba(30,40,25,.55)'); c.fillStyle = g2; c.fillRect(0, 190, 256, 66); // damp / mould at base
  // window with rusty iron bars (鐵窗); some broken
  const broken = wi % 3 === 1;
  c.fillStyle = '#1e252c'; c.fillRect(60, 46, 136, 108); c.fillStyle = broken ? '#20262c' : '#4e6478'; c.fillRect(66, 52, 124, 96);
  if (broken) { c.fillStyle = '#0c0e10'; c.beginPath(); c.moveTo(80, 60); c.lineTo(150, 70); c.lineTo(120, 130); c.lineTo(90, 110); c.fill(); c.strokeStyle = 'rgba(200,220,235,.7)'; c.lineWidth = 1; for (let k = 0; k < 10; k++) { c.beginPath(); c.moveTo(120, 95); c.lineTo(120 + (Math.random() - 0.5) * 120, 95 + (Math.random() - 0.5) * 90); c.stroke(); } c.fillStyle = '#5a6a7a'; c.fillRect(150, 52, 40, 96); }
  else { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(70, 56, 30, 88); }
  c.strokeStyle = '#5a3018'; c.lineWidth = 5; c.strokeRect(54, 40, 148, 120); c.lineWidth = 3; for (let x = 66; x < 200; x += 14) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, 160); c.stroke(); } c.beginPath(); c.moveTo(54, 100); c.lineTo(202, 100); c.stroke();
  for (let i = 0; i < 9; i++) { const x = 56 + Math.random() * 146; const g = c.createLinearGradient(0, 160, 0, 230); g.addColorStop(0, 'rgba(120,60,20,.6)'); g.addColorStop(1, 'rgba(120,60,20,0)'); c.fillStyle = g; c.fillRect(x, 160, 2 + Math.random() * 3, 30 + Math.random() * 60); } // rust drips
}));
const wallMats = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
const wallMatsT = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }));
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 1, side: THREE.DoubleSide });
const tinMat = new THREE.MeshStandardMaterial({ color: 0x7f9fb0, roughness: 0.6, metalness: 0.3 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 });
const floorMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, c => { c.fillStyle = '#b9ad98'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#8f8572'; c.strokeRect(0, 0, 32, 32); c.strokeRect(32, 32, 32, 32); c.strokeRect(0, 32, 32, 32); c.strokeRect(32, 0, 32, 32); }), side: THREE.DoubleSide });
const roadTex = canvasTex(256, 256, c => { c.fillStyle = '#3c3e41'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(${20 + Math.random() * 30},${20 + Math.random() * 30},${25 + Math.random() * 30},.6)`; c.fillRect(Math.random() * 220, Math.random() * 220, 20 + Math.random() * 60, 15 + Math.random() * 40); } // asphalt patches
  c.strokeStyle = 'rgba(15,15,15,.75)'; c.lineWidth = 1.2; for (let i = 0; i < 14; i++) { let x = Math.random() * 256, y = Math.random() * 256; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); } // cracks
  for (let i = 0; i < 6; i++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 20); g.addColorStop(0, 'rgba(10,10,12,.45)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.save(); c.translate(Math.random() * 256, Math.random() * 256); c.scale(1, 0.6); c.fillStyle = g; c.fillRect(-20, -20, 40, 40); c.restore(); } }); // oil stains
const groundTex = canvasTex(128, 128, c => { c.fillStyle = '#7d7a70'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#6b685f'; for (let i = 0; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 128); c.moveTo(0, i); c.lineTo(128, i); c.stroke(); } });

// ---------- world state ----------
const blds: Bld[] = []; const segs: Seg[] = []; const conts: Cont[] = []; const doors: Door[] = [];
const roads: { p: V2[]; t: string; n: string }[] = [];
const CELL = 8; const grid = new Map<string, Seg[]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
let nav: Nav | null = null;
function addSeg(s: Seg, low = false) { if (low) s.low = true; segs.push(s); nav?.markSeg(s.a, s.b, 1); const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), z0 = Math.min(s.a[1], s.b[1]), z1 = Math.max(s.a[1], s.b[1]); for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)!).push(s); } }
function removeSeg(s: Seg) { nav?.markSeg(s.a, s.b, -1); grid.forEach(a => { const i = a.indexOf(s); if (i >= 0) a.splice(i, 1); }); }
function nearSegs(x: number, z: number) { const out = new Set<Seg>(); const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((cx + i) + ',' + (cz + j)); if (a) a.forEach(s => out.add(s)); } return out; }
function los(p: V2, q: V2) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.ceil(d / (CELL * 0.5)) + 1; const seen = new Set<Seg>(); for (let i = 0; i <= n; i++) { const t = i / n; const a = grid.get(gk(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)); if (!a) continue; for (const s of a) { if (seen.has(s)) continue; seen.add(s); if (segInter(p, q, s.a, s.b)) return false; } } return true; }
function collide(pos: THREE.Vector3, r: number) {
  for (let it = 0; it < 2; it++) for (const s of nearSegs(pos.x, pos.z)) {
    const ax = s.a[0], az = s.a[1], bx = s.b[0], bz = s.b[1]; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1;
    const t = clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / l2, 0, 1); const cx = ax + dx * t, cz = az + dz * t; const ox = pos.x - cx, oz = pos.z - cz; const d = Math.hypot(ox, oz);
    if (d < r && d > 1e-6) { pos.x = cx + ox / d * r; pos.z = cz + oz / d * r; }
  }
  pos.x = clamp(pos.x, bounds.minx, bounds.maxx); pos.z = clamp(pos.z, bounds.minz, bounds.maxz);
}
const bounds = { minx: -500, maxx: 500, minz: -500, maxz: 500 };
function bldAt(x: number, z: number) { for (const b of blds) if (x > b.minx && x < b.maxx && z > b.minz && z < b.maxz && pip([x, z], b.pts)) return b; return null; }

// ---------- sectors ----------
const SX = 3, SZ = 3;
const sectorNames = ['華江', '西園', '萬大', '龍山寺', '剝皮寮', '大理街', '西門町', '中華路', '漢中街'];
const sectorOf = (x: number, z: number) => clamp(Math.floor((x - bounds.minx) / (bounds.maxx - bounds.minx) * SX), 0, SX - 1) + SX * clamp(Math.floor((z - bounds.minz) / (bounds.maxz - bounds.minz) * SZ), 0, SZ - 1);
// layout: west->east, north->south ; names roughly mapped
const SECTOR_LABEL = (i: number) => sectorNames[[6, 7, 8, 3, 4, 5, 0, 1, 2][i]] ?? ('第' + (i + 1) + '區');

// ---------- build map ----------
function shopType(s: string, n: string) {
  if (/convenience|supermarket/.test(s)) return 'store';
  if (/pharmacy|chemist/.test(s)) return 'pharmacy';
  if (/police/.test(s)) return 'police';
  const r = rnd(); return r < 0.06 ? 'store' : r < 0.1 ? 'pharmacy' : r < 0.115 ? 'police' : 'home';
}
const SIGN: Record<string, [string, string, string]> = { store: ['7-12', '#e8eef0', '#d23a1e'], pharmacy: ['康是福藥局', '#1d8a5a', '#ffffff'], police: ['派出所', '#1d3f8a', '#ffffff'] };
const signTex: Record<string, THREE.Texture> = {};
for (const k in SIGN) { const [t, bg, fg] = SIGN[k]; signTex[k] = canvasTex(256, 64, c => { c.fillStyle = bg; c.fillRect(0, 0, 256, 64); if (k === 'store') { c.fillStyle = '#f08a1c'; c.fillRect(0, 0, 256, 10); c.fillStyle = '#1c9a4a'; c.fillRect(0, 54, 256, 10); } c.fillStyle = fg; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 128, 34); }); }
const b2sign: Record<string, [string, string, string]> = { store: ['7-12', '', ''], pharmacy: ['', '', ''], grocery: ['金來雜貨店', '#b8241c', '#fff2a0'], breakfast: ['晨光早餐', '#f2a81c', '#7a1a10'], betel: ['檳榔・香菸', '#111111', '#33ff66'] };
const extraSign: Record<string, THREE.Texture> = {};
function setSign(b: Bld, k: string) {
  let tex = signTex[k]; if (!tex) { const [t, bg, fg] = b2sign[k]; tex = extraSign[k] || (extraSign[k] = canvasTex(256, 64, c => { c.fillStyle = bg; c.fillRect(0, 0, 256, 64); c.fillStyle = fg; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 128, 34); })); }
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k === 'betel' ? 1.2 : 0.4, side: THREE.DoubleSide });
  if (b.sign) b.sign.material = mat; else if (b.door) { const d = b.door; const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.9), mat); const ux = d.c[0] - d.a[0], uz = d.c[1] - d.a[1]; const L = Math.hypot(ux, uz); let nx = -uz / L, nz = ux / L; if (pip([d.p[0] + nx * 0.6, d.p[1] + nz * 0.6], b.pts)) { nx = -nx; nz = -nz; } m.position.set(d.p[0] + nx * 0.2, 3.0, d.p[1] + nz * 0.2); m.lookAt(d.p[0] + nx * 5, 3.0, d.p[1] + nz * 5); b.group.add(m); b.sign = m; }
}
const PARODY = ['阿嬤小吃', '金萬華當舖', '老牌麵線', '西門電玩', '幸福理容', '大眾五金', '青草茶', '鐘錶行', '刺青', '金紙香舖'];
const shopSignTex = PARODY.map((t, i) => canvasTex(256, 64, c => { c.fillStyle = ['#a8221e', '#20344f', '#c9971c', '#6a2a8a', '#2a6a3a'][i % 5]; c.fillRect(0, 0, 256, 64); c.fillStyle = '#fff6d0'; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 128, 34); }));

const contMat = { shelf: new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }), fridge: new THREE.MeshStandardMaterial({ color: 0xeef4f8, roughness: 0.3 }), cab: new THREE.MeshStandardMaterial({ color: 0x8a5a34 }), crate: new THREE.MeshStandardMaterial({ color: 0x4f5a2a }) };
function makeCont(id: string, p: V2, type: string, b?: Bld, preset?: Record<string, number>) {
  const items: Record<string, number> = preset || {};
  if (!preset) { const table = LOOT[type]; const n = 1 + Math.floor(rnd() * 3); const tot = table.reduce((s, x) => s + x[1], 0); for (let i = 0; i < n; i++) { if (rnd() < 0.18) continue; let r = rnd() * tot; for (const [k, w, m] of table) { r -= w; if (r <= 0) { items[k] = (items[k] || 0) + 1 + Math.floor(rnd() * m); break; } } } }
  const kind = type === 'store' ? (rnd() < 0.4 ? 'fridge' : 'shelf') : type === 'pharmacy' ? 'shelf' : type === 'crate' ? 'crate' : 'cab';
  const label = { fridge: '冷藏櫃', shelf: '貨架', cab: '櫥櫃', crate: '遺留物' }[kind];
  const m = new THREE.Mesh(new THREE.BoxGeometry(kind === 'crate' ? 0.8 : 1.1, kind === 'fridge' ? 1.9 : kind === 'crate' ? 0.4 : 1.2, 0.6), contMat[kind]);
  m.position.set(p[0], m.geometry.parameters.height / 2, p[1]); m.rotation.y = rnd() * Math.PI; m.castShadow = true; m.receiveShadow = true;
  (b ? b.group : scene).add(m);
  const c: Cont = { id, p, items, label, mesh: m, b }; conts.push(c); return c;
}

function buildMap(data: any) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const r of data.roads) for (const p of r.p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
  Object.assign(bounds, { minx: minx + 10, maxx: maxx - 10, minz: minz + 10, maxz: maxz - 10 });
  const W = maxx - minx, H = maxz - minz;
  groundTex.repeat.set(W / 4, H / 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, H + 200), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((minx + maxx) / 2, 0, (minz + maxz) / 2); ground.receiveShadow = true; scene.add(ground);
  // roads
  const RW: Record<string, number> = ROADW; const _unused = { primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.5 };
  const rg: THREE.BufferGeometry[] = [], lg: THREE.BufferGeometry[] = [];
  for (const r of data.roads) {
    roads.push(r); const w = RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) continue;
      const g = new THREE.PlaneGeometry(len + w * 0.5, w); g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 0.02 + w * 0.0005, (az + bz) / 2); rg.push(g);
      if (w >= 9) { const l = new THREE.PlaneGeometry(len * 0.6, 0.25); l.rotateX(-Math.PI / 2); l.rotateY(-Math.atan2(bz - az, bx - ax)); l.translate((ax + bx) / 2, 0.04, (az + bz) / 2); lg.push(l); }
    }
  }
  roadTex.repeat.set(1, 1);
  const roadMesh = new THREE.Mesh(mergeGeometries(rg), roadMat); roadMesh.receiveShadow = true; scene.add(roadMesh);
  if (lg.length) scene.add(new THREE.Mesh(mergeGeometries(lg), new THREE.MeshBasicMaterial({ color: 0xd8c070 })));
  // buildings
  const pillarG: THREE.BufferGeometry[] = [];
  data.buildings.forEach((ob: any, id: number) => {
    const pts: V2[] = ob.p; const A = area(pts); if (A < 12 || A > 6000) return;
    let xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const lv = ob.l || (2 + Math.floor(rnd() * 4)); const h = Math.min(lv, 7) * 3.2;
    const type = shopType(ob.s, ob.n);
    const cx = xs.reduce((a, b) => a + b) / xs.length, cz = zs.reduce((a, b) => a + b) / zs.length;
    const group = new THREE.Group(); scene.add(group);
    const b: Bld = { id, pts, h, type, group, walls: null as any, roof: new THREE.Group(), c: [cx, cz], minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs) };
    // door: longest edge
    let di = 0, dl = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > dl) { dl = l; di = i; } }
    const wg: THREE.BufferGeometry[] = [];
    const wallBox = (a: V2, c: V2, y0: number, y1: number) => { const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l < 0.05) return; const g = new THREE.BoxGeometry(l + 0.25, y1 - y0, 0.25); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * l / 3.2, uv.getY(k) * (y1 - y0) / 3.2); g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0])); g.translate((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2); wg.push(g); };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if (i === di && dl > 2.6 && A > 20) {
        const ux = (c[0] - a[0]) / dl, uz = (c[1] - a[1]) / dl, m = dl / 2;
        const d1: V2 = [a[0] + ux * (m - 0.8), a[1] + uz * (m - 0.8)], d2: V2 = [a[0] + ux * (m + 0.8), a[1] + uz * (m + 0.8)];
        wallBox(a, d1, 0, h); wallBox(d2, c, 0, h); wallBox(d1, d2, 2.3, h);
        addSeg({ a, b: d1 }); addSeg({ a: d2, b: c });
        const mid: V2 = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
        // outward normal
        let nx = -uz, nz = ux; if (pip([mid[0] + nx * 0.6, mid[1] + nz * 0.6], pts)) { nx = -nx; nz = -nz; }
        const door: Door = { b, p: mid, a: d1, c: d2, barricaded: false }; b.door = door; doors.push(door);
        // arcade 騎樓 pillars + sign
        if (h > 6 && rnd() < 0.6) for (let s = 1.5; s < dl - 1; s += 3.5) { const g = new THREE.BoxGeometry(0.45, 3.2, 0.45); g.translate(a[0] + ux * s + nx * 2.4, 1.6, a[1] + uz * s + nz * 2.4); pillarG.push(g); }
        if (h > 6 && rnd() < 0.6 || type !== 'home') {
          const tex = type !== 'home' ? signTex[type] : pick(shopSignTex);
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(dl * 0.8, 5), 1.1), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
          sg.position.set(mid[0] + nx * 0.2, 3.0, mid[1] + nz * 0.2); sg.lookAt(mid[0] + nx * 5, 3.0, mid[1] + nz * 5); group.add(sg); b.sign = sg;
        }
      } else { wallBox(a, c, 0, h); addSeg({ a, b: c }); }
    }
    const mi = id % wallMats.length; (b as any).mi = mi;
    b.walls = new THREE.Mesh(mergeGeometries(wg), wallMats[mi]); b.walls.castShadow = true; b.walls.receiveShadow = true; group.add(b.walls);
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const rgeo = new THREE.ShapeGeometry(shape); rgeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(rgeo, roofMat); roof.position.y = h; roof.castShadow = true; b.roof.add(roof);
    const fl = new THREE.Mesh(rgeo, floorMat); fl.position.y = 0.03; fl.receiveShadow = true; group.add(fl); b.floor = fl;
    // rooftop additions 頂樓加蓋 + water tanks
    if (A > 40 && rnd() < 0.55) {
      const sx = (b.maxx - b.minx) * 0.4, sz = (b.maxz - b.minz) * 0.4;
      const tin = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.6, sz), tinMat); tin.position.set(cx, h + 1.3, cz); if (pip([cx, cz], pts)) { tin.castShadow = true; b.roof.add(tin); }
    }
    if (rnd() < 0.5) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), tankMat); const tp: V2 = [cx + (rnd() - 0.5) * 2, cz + (rnd() - 0.5) * 2]; if (pip(tp, pts)) { t.position.set(tp[0], h + 0.7, tp[1]); t.castShadow = true; b.roof.add(t); } }
    group.add(b.roof);
    blds.push(b);
    // containers
    if (b.door) { const n = clamp(Math.floor(A / 60), 1, type === 'store' ? 5 : 3); let tries = 0, k = 0; while (k < n && tries++ < 40) { const p: V2 = [b.minx + rnd() * (b.maxx - b.minx), b.minz + rnd() * (b.maxz - b.minz)]; if (pip(p, pts) && Math.hypot(p[0] - b.door.p[0], p[1] - b.door.p[1]) > 1.8) { makeCont(`b${id}_${k}`, p, type, b); k++; } } }
  });
  if (pillarG.length) { const pm = new THREE.Mesh(mergeGeometries(pillarG), new THREE.MeshStandardMaterial({ color: 0xb7ad9c })); pm.castShadow = true; scene.add(pm); }
  // parked vehicles (scooters on sidewalks, cars/taxis on bigger roads, occupation trucks) + street lamps
  const spots: { x: number; z: number; ang: number; kind: VehicleKind }[] = [];
  for (const r of roads) { const w = RW[r.t] ?? 3; if (w < 6) continue; for (let i = 0; i < r.p.length - 1; i++) {
    const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 4) continue; const ang = Math.atan2(bz - az, bx - ax); const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
    for (let s = 2; s < L - 2; s += 26) { const side = rnd() < 0.5 ? 1 : -1; const lx = ax + ux * s + nx * (w / 2 + 0.4) * side, lz = az + uz * s + nz * (w / 2 + 0.4) * side; if (!bldAt(lx, lz)) lamps.push([lx, lz, Math.atan2(-nx * side, -nz * side)]); }
    if (rnd() < 0.06) { const t = rnd() * 0.6 + 0.2; const side = rnd() < 0.5 ? 1 : -1; const n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { const x = ax + (bx - ax) * t + ux * k * 0.75 + nx * (w / 2 - 0.7) * side, z = az + (bz - az) * t + uz * k * 0.75 + nz * (w / 2 - 0.7) * side; if (!bldAt(x, z)) spots.push({ x, z, ang: Math.atan2(-nx * side, -nz * side), kind: 'scooter' }); } }
    if (w >= 9 && rnd() < 0.05) { const t = rnd() * 0.6 + 0.2; const side = rnd() < 0.5 ? 1 : -1; const x = ax + (bx - ax) * t + nx * (w / 2 - 1.6) * side, z = az + (bz - az) * t + nz * (w / 2 - 1.6) * side; const kind: VehicleKind = rnd() < 0.15 ? 'truck' : rnd() < 0.35 ? 'taxi' : 'car'; if (!bldAt(x, z)) { spots.push({ x, z, ang: Math.atan2(ux, uz), kind }); const hl = kind === 'truck' ? 3.25 : 2.2, hw = kind === 'truck' ? 1.15 : 0.9; const cs: V2[] = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([a, b]) => [x + a * nx + b * ux, z + a * nz + b * uz] as V2); for (let q = 0; q < 4; q++) addSeg({ a: cs[q], b: cs[(q + 1) % 4] }); } }
  } }
  vehicles.build(spots, mergeGeometries, rnd);
  buildLamps();
}

const ROADW: Record<string, number> = { primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.5 };
let decay: ReturnType<typeof buildDecay> | null = null; let alley: ReturnType<typeof buildAlley> | null = null; const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }); let checkpoints: V2[] = [];
// ---------- street lamps ----------
const lamps: [number, number, number][] = []; const lampPool: THREE.PointLight[] = []; let lampHeadMat: THREE.MeshStandardMaterial;
const vehicles = new VehicleSystem(scene);
function buildLamps() {
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 5, 6); pole.translate(0, 2.5, 0); const arm = new THREE.BoxGeometry(0.08, 0.08, 1.2); arm.translate(0, 4.95, 0.55); const poleG = mergeGeometries([pole, arm]);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.5); head.translate(0, 4.88, 1.1);
  const pm = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.5, roughness: 0.5 }), lamps.length);
  lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffc070, emissiveIntensity: 0 });
  const hm = new THREE.InstancedMesh(head, lampHeadMat, lamps.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  lamps.forEach(([x, z, a], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(i, m4); hm.setMatrixAt(i, m4); });
  pm.castShadow = true; scene.add(pm, hm);
  for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffc070, 0, 22, 1.6); scene.add(l); lampPool.push(l); }
}
let lampT = 0;
function updateLamps(night: number, dt: number) {
  lampHeadMat.emissiveIntensity = night * 2.5; lampT -= dt; if (lampT > 0) return; lampT = 0.5;
  const near = lamps.map(l => [l, (l[0] - player.pos.x) ** 2 + (l[1] - player.pos.z) ** 2] as const).sort((a, b) => a[1] - b[1]).slice(0, lampPool.length);
  lampPool.forEach((L, i) => { const e = near[i]; if (!e) { L.intensity = 0; return; } const [x, z, a] = e[0]; L.position.set(x + Math.sin(a) * 1.1, 4.7, z + Math.cos(a) * 1.1); L.intensity = night * 40; });
}

// ---------- characters ----------
const SOLDIER_OPTS = { gender: 'm' as const, hair: 0x111111, top: 0x55603c, bottom: 0x4a5434, shoes: 0x1a1a1a, soldier: true };
const HERO: Record<string, any> = { m: { gender: 'm', hair: 0x1a1410, top: 0xd8d4c8, jacket: 0x3d5a78, bottom: 0x34363e, shoes: 0xe8e8e8, pack: 0x2f3a2a }, f: { gender: 'f', hair: 0x1e1410, top: 0xb84a52, bottom: 0x2a3a5a, shoes: 0xe8e8e8, pack: 0x6a5240 } };
function spawnRig(o: any) { const r = makeRig(o); scene.add(r.root); return r; }
const player = {
  mesh: null as any as THREE.Group, rig: null as any as Rig, gender: 'm', anim: 'idle' as AnimState, moving: 0, pos: new THREE.Vector3(), hp: 100, hunger: 85, thirst: 85, fatigue: 10, bleed: false,
  inv: { water: 1, noodle: 1 } as Record<string, number>, vel: new THREE.Vector3(), vaultT: 0, stun: 0, vFrom: new THREE.Vector3(), vTo: new THREE.Vector3(), equip: '' as string, sneak: false, cd: 0, kills: 0, sleeping: false, light: false,
};
type Sol = { rig: Rig; stun?: number; vs?: number; post?: V2; path?: V2[]; pi?: number; repath?: number; pgoal?: V2; speed?: number; aiming?: boolean; id: number; mesh: THREE.Group; pos: THREE.Vector3; hp: number; route: V2[]; wi: number; dir: number; state: 'patrol' | 'investigate' | 'combat' | 'dead'; target?: V2; alert: number; timer: number; cd: number; sector: number; cone: THREE.Mesh; night: boolean; lastSeen?: V2 };
const sols: Sol[] = [];
const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 5, Math.PI * 2 / 5); coneGeo.rotateX(-Math.PI / 2); coneGeo.rotateY(Math.PI / 2);
function spawnSoldiers(dead: Set<number>) {
  const big = roads.filter(r => r.p.length >= 3 && r.t !== 'footway');
  for (let i = 0; i < 64; i++) {
    const r = pick(big); const s0 = Math.floor(rnd() * (r.p.length - 1)); const route = r.p.slice(Math.max(0, s0 - 3), s0 + 4) as V2[];
    const night = i >= 48;
    const rig = spawnRig(SOLDIER_OPTS); setWeapon(rig, 'rifle'); const mesh = rig.root;
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false })); cone.position.y = 0.06; scene.add(cone);
    const p = route[0]; const s: Sol = { rig, id: i, mesh, pos: new THREE.Vector3(p[0], 0, p[1]), hp: 100, route, wi: 1, dir: 0, state: 'patrol', alert: 0, timer: 0, cd: 0, sector: sectorOf(p[0], p[1]), cone, night };
    if (dead.has(i)) { s.state = 'dead'; s.hp = 0; rig.deadT = 1; mesh.visible = false; cone.visible = false; }
    sols.push(s);
  }
}

// ---------- time / noise / log ----------
let gameMin = 8 * 60; // minutes since day 1 00:00
const isNight = () => { const h = (gameMin / 60) % 24; return h < 6 || h >= 19; };
function noise(x: number, z: number, r: number) { for (const s of sols) if (s.state !== 'dead' && s.state !== 'combat' && (!s.night || isNight()) && s.mesh.visible) { if (Math.hypot(s.pos.x - x, s.pos.z - z) < r) { s.state = 'investigate'; s.target = [x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3]; s.timer = 20; } } }
function log(msg: string, col = '#e8e2d0') { const d = document.createElement('div'); d.textContent = msg; d.style.color = col; $('log').prepend(d); setTimeout(() => d.style.opacity = '0', 7000); setTimeout(() => d.remove(), 8200); while ($('log').children.length > 8) $('log').lastChild!.remove(); }

// ---------- effects ----------
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true });
const fx: { o: THREE.Object3D; t: number }[] = [];
function tracer(a: THREE.Vector3, b: THREE.Vector3) { const g = new THREE.BufferGeometry().setFromPoints([a.clone().setY(1.2), b.clone().setY(1.2)]); const l = new THREE.Line(g, tracerMat); scene.add(l); fx.push({ o: l, t: 0.08 }); }

// ---------- input ----------
const keys: Record<string, boolean> = {}; let mouse = new THREE.Vector2(); let clicking = false;
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Tab') { e.preventDefault(); toggleInv(); } if (!started) return; if (e.code === 'KeyC') { player.sneak = !player.sneak; log(player.sneak ? '進入潛行' : '解除潛行'); } if (e.code === 'KeyE') interact(); if (e.code === 'KeyI') toggleInv(); if (e.code === 'KeyB') barricade(); if (e.code === 'KeyZ') sleep(); if (e.code === 'KeyF') { player.light = !player.light; } if (e.code === 'Space') { e.preventDefault(); tryVault(); } if (e.code === 'KeyQ') shove(); if (e.code === 'Escape') closePanel(); });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousemove', e => { mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); });
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) clicking = true; });
addEventListener('mouseup', () => clicking = false);
addEventListener('wheel', e => { zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.2); resize(); });
const ray = new THREE.Raycaster(); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0); const aimPt = new THREE.Vector3();

// ---------- inventory / loot UI ----------
let panelOpen = false;
const weight = () => Object.entries(player.inv).reduce((s, [k, n]) => s + ITEMS[k].w * n, 0);
function addItem(k: string, n = 1) { player.inv[k] = (player.inv[k] || 0) + n; }
function useItem(k: string) {
  const d = ITEMS[k]; if (!player.inv[k]) return;
  if (d.kind === 'melee' || d.kind === 'gun') { player.equip = player.equip === k ? '' : k; log(player.equip ? `裝備了 ${d.name}` : '收起武器'); }
  else if (d.kind === 'food' || d.kind === 'drink' || d.kind === 'med') {
    player.hunger = clamp(player.hunger + (d.hunger || 0), 0, 100); player.thirst = clamp(player.thirst + (d.thirst || 0), 0, 100); player.fatigue = clamp(player.fatigue + (d.fatigue || 0), 0, 100); player.hp = clamp(player.hp + (d.hp || 0), 0, 100); if (d.stopBleed && player.bleed) { player.bleed = false; log('止血了', '#9f9'); }
    log(`使用了 ${d.name}`); if (--player.inv[k] <= 0) delete player.inv[k];
  } else log(k === 'plank' || k === 'hammer' ? '靠近門口按 B 封門（需要木板與鐵鎚）' : '子彈會在開槍時自動使用');
  renderPanel();
}
let curCont: Cont | null = null;
function renderPanel() {
  if (!panelOpen) return; const p = $('panel'); p.innerHTML = '';
  const col = (title: string) => { const c = document.createElement('div'); c.className = 'col'; c.innerHTML = `<h3>${title}</h3>`; p.appendChild(c); return c; };
  const inv = col(`背包（${weight().toFixed(1)} / 15 kg）`);
  for (const [k, n] of Object.entries(player.inv)) { const d = ITEMS[k]; const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span><img src="${iconURL(k)}">${d.name}${player.equip === k ? ' ★' : ''} ×${n}</span><small>${{ food: '食用', drink: '飲用', med: '治療', melee: '裝備', gun: '裝備', ammo: '彈藥', tool: '工具' }[d.kind]}</small>`; e.title = d.desc || ''; e.onclick = () => useItem(k); inv.appendChild(e); }
  if (!Object.keys(player.inv).length) inv.innerHTML += '<small>空的</small>';
  if (curCont) {
    const c = col(curCont.label); const cc = curCont;
    for (const [k, n] of Object.entries(cc.items)) { const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span><img src="${iconURL(k)}">${ITEMS[k].name} ×${n}</span><small>拿取</small>`; e.title = ITEMS[k].desc || ''; e.onclick = () => take(cc, k); c.appendChild(e); }
    if (!Object.keys(cc.items).length) c.innerHTML += '<small>已經搜刮一空</small>';
    const b = document.createElement('button'); b.textContent = '全部拿取'; b.onclick = () => { for (const k of Object.keys(cc.items)) take(cc, k, true); renderPanel(); }; c.appendChild(b);
  }
  const close = document.createElement('button'); close.textContent = '關閉 (Esc)'; close.onclick = closePanel; p.lastElementChild!.appendChild(close);
}
function take(c: Cont, k: string, all = false) { const n = all ? c.items[k] : (ITEMS[k].kind === 'ammo' ? c.items[k] : 1); if (weight() + ITEMS[k].w * n > 15) { log('背包太重了', '#f99'); return; } addItem(k, n); c.items[k] -= n; if (c.items[k] <= 0) delete c.items[k]; updateVis(c); if (!all) renderPanel(); }
function toggleInv() { if (!started) return; if (panelOpen) closePanel(); else { curCont = null; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
function closePanel() { panelOpen = false; curCont = null; $('panel').classList.add('hidden'); }

function contDist(c: Cont) { let x = c.p[0], z = c.p[1]; if (c.half && c.axis) { const t = clamp((player.pos.x - x) * c.axis[0] + (player.pos.z - z) * c.axis[1], -c.half, c.half); x += c.axis[0] * t; z += c.axis[1] * t; } return Math.hypot(x - player.pos.x, z - player.pos.z); }
function nearestCont() { let best: Cont | null = null, bd = 1.5; for (const c of conts) { if (Math.abs(c.p[0] - player.pos.x) > 6 || Math.abs(c.p[1] - player.pos.z) > 6) continue; const d = contDist(c); if (d < bd) { bd = d; best = c; } } return best; }
function updateVis(c: Cont) { if (!c.vis || !c.init) return; for (const v of c.vis) { const init = c.init[v.item] || 1; v.im.count = Math.ceil(v.max * clamp((c.items[v.item] || 0) / init, 0, 1)); } }
function nearestDoor() { let best: Door | null = null, bd = 2.2; for (const d of doors) { const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z); if (x < bd) { bd = x; best = d; } } return best; }
function interact() { const c = nearestCont(); const v = !c && vehicles.nearest(player.pos, 2.2); if (v) { log(v.kind === 'scooter' ? '這台機車沒鑰匙，載具系統下一版開放' : v.kind === 'truck' ? '佔領軍卡車，油箱上鎖（下一版可駕駛）' : '車門鎖住了（載具系統下一版開放）', '#ccc'); return; } if (c) { curCont = c; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7040 });
function setBarricade(d: Door) {
  d.barricaded = true; d.seg = { a: d.a, b: d.c }; addSeg(d.seg);
  const l = Math.hypot(d.c[0] - d.a[0], d.c[1] - d.a[1]); const m = new THREE.Group();
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(l + 0.3, 0.25, 0.08), plankMat); p.position.y = 0.6 + i * 0.6; p.rotation.z = (i - 1) * 0.15; p.castShadow = true; m.add(p); }
  m.position.set(d.p[0], 0, d.p[1]); m.rotation.y = -Math.atan2(d.c[1] - d.a[1], d.c[0] - d.a[0]); scene.add(m); d.mesh = m as any;
}
function barricade() {
  const d = nearestDoor(); if (!d) { log('附近沒有門'); return; }
  if (d.barricaded) { removeSeg(d.seg!); scene.remove(d.mesh!); d.barricaded = false; addItem('plank'); log('拆掉了封門木板'); noise(player.pos.x, player.pos.z, 10); return; }
  if (!player.inv.hammer || !player.inv.plank) { log('封門需要 鐵鎚 + 木板', '#f99'); return; }
  if (--player.inv.plank <= 0) delete player.inv.plank; setBarricade(d); noise(player.pos.x, player.pos.z, 18); log('門封好了（敲打聲可能引來巡邏）', '#9f9');
}
function sleep() {
  if (!bldAt(player.pos.x, player.pos.z)) { log('只能在室內睡覺', '#f99'); return; }
  if (sols.some(s => s.state === 'combat')) { log('有敵人在追你，睡不著', '#f99'); return; }
  if (player.fatigue < 20) { log('你還不累'); return; }
  player.sleeping = true; log('你閉上眼睛…', '#aaf');
}

// ---------- combat ----------
function tryVault() {
  if (player.vaultT > 0 || player.sleeping || dead) return;
  const fwd = player.vel.length() > 0.3 ? player.vel.clone().setY(0).normalize() : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  const p: V2 = [player.pos.x, player.pos.z], q: V2 = [player.pos.x + fwd.x * 1.3, player.pos.z + fwd.z * 1.3];
  let hit: Seg | null = null; for (const sg of nearSegs(p[0], p[1])) if (segX(p, q, sg.a, sg.b)) { if (!sg.low) return log('太高了，翻不過去'); hit = sg; }
  if (!hit) return;
  const to = new THREE.Vector3(player.pos.x + fwd.x * 1.5, 0, player.pos.z + fwd.z * 1.5); const chk = to.clone(); collide(chk, 0.35); if (chk.distanceTo(to) > 0.2 || bldAt(to.x, to.z) !== bldAt(player.pos.x, player.pos.z)) return log('另一側沒有空間');
  player.vFrom.copy(player.pos); player.vTo.copy(to); player.vaultT = 0.55; player.rig.vaultT = 0.55; player.mesh.rotation.y = Math.atan2(fwd.x, fwd.z); noise(player.pos.x, player.pos.z, 4);
}
function segX(a: V2, b: V2, c: V2, d: V2) { const o = (p: V2, q: V2, r: V2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); }
function shove() {
  if (player.cd > 0 || player.sleeping || dead) return; player.cd = 0.6; player.rig.shoveT = 0.35; noise(player.pos.x, player.pos.z, 3);
  const f = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  for (const s of sols) { if (s.state === 'dead') continue; const to = s.pos.clone().sub(player.pos); const d = to.length(); if (d > 1.5 || to.normalize().dot(f) < 0.4) continue;
    s.stun = 1.6; s.rig.hurtT = 0.35; s.rig.hurtSide = rnd() < 0.5 ? -1 : 1; s.pos.addScaledVector(f, 0.9); collide(s.pos, 0.35); s.state = 'combat'; s.alert = 1; s.lastSeen = [player.pos.x, player.pos.z]; log('推開！敵人踉蹌', '#ff9'); break; }
}
function playerAttack() {
  const k = player.equip; const d = k ? ITEMS[k] : { dmg: 8, range: 1.1, noise: 2, cd: 0.5, kind: 'melee' } as any;
  if (player.cd > 0) return; player.cd = d.cd; if (d.kind === 'gun') player.rig.shootT = 0.14; else player.rig.meleeT = 0.45;
  const dir = new THREE.Vector3(aimPt.x - player.pos.x, 0, aimPt.z - player.pos.z).normalize();
  if (d.kind === 'gun') {
    if (!player.inv[d.ammo]) { log('沒有子彈了', '#f99'); player.cd = 0.5; return; }
    if (--player.inv[d.ammo] <= 0) delete player.inv[d.ammo];
    noise(player.pos.x, player.pos.z, d.noise);
    let hit: Sol | null = null, hd = d.range;
    for (const s of sols) { if (s.state === 'dead') continue; const to = s.pos.clone().sub(player.pos); const t = to.dot(dir); if (t < 0 || t > hd) continue; const perp = to.clone().sub(dir.clone().multiplyScalar(t)).length(); if (perp < 0.55 && los([player.pos.x, player.pos.z], [s.pos.x, s.pos.z])) { hit = s; hd = t; } }
    tracer(player.pos, player.pos.clone().add(dir.clone().multiplyScalar(hd)));
    if (hit) damageSol(hit, d.dmg * (0.8 + rnd() * 0.4), false);
  } else {
    noise(player.pos.x, player.pos.z, d.noise);
    for (const s of sols) { if (s.state === 'dead') continue; const to = s.pos.clone().sub(player.pos); const dist = to.length(); if (dist > d.range + 0.3) continue; if (to.normalize().dot(dir) < 0.5) continue;
      const stealth = s.state !== 'combat' && s.alert < 0.5; damageSol(s, d.dmg * (stealth ? 3.2 : 1), stealth); break; }
  }
}
function damageSol(s: Sol, dmg: number, stealth: boolean) {
  s.hp -= dmg; if (stealth) log('偷襲！', '#ff9');
  if (s.hp <= 0) { s.state = 'dead'; s.cone.visible = false; player.kills++; log('擊倒一名佔領軍士兵', '#ffd76a');
    const it: Record<string, number> = { a556: 5 + Math.floor(rnd() * 20) }; if (rnd() < 0.3) it.rifle = 1; if (rnd() < 0.5) it.ration = 1; if (rnd() < 0.3) it.bandage = 1;
    makeCont('d' + s.id, [s.pos.x, s.pos.z], 'crate', undefined, it); checkSectors();
  } else { s.rig.hurtT = 0.35; s.rig.hurtSide = rnd() < 0.5 ? -1 : 1; s.stun = Math.max(s.stun || 0, 0.4); s.state = 'combat'; s.alert = 1; s.lastSeen = [player.pos.x, player.pos.z]; }
}
const liberated = new Set<number>();
function checkSectors(silent = false) {
  for (let i = 0; i < SX * SZ; i++) { if (liberated.has(i)) continue; const alive = sols.filter(s => s.sector === i && s.state !== 'dead').length; const total = sols.filter(s => s.sector === i).length; if (total > 0 && alive === 0) { liberated.add(i); if (!silent) log(`★ ${SECTOR_LABEL(i)} 街區已解放！`, '#7fff7f'); } }
}

// ---------- save ----------
const SAVE = 'defendtaipei-save-v1';
function save() { if (!started || dead) return; localStorage.setItem(SAVE, JSON.stringify({ g: player.gender, p: [player.pos.x, player.pos.z], hp: player.hp, hu: player.hunger, th: player.thirst, fa: player.fatigue, bl: player.bleed, inv: player.inv, eq: player.equip, k: player.kills, t: gameMin, conts: conts.map(c => [c.id, c.items, c.p]), dead: sols.filter(s => s.state === 'dead').map(s => s.id), bar: doors.map((d, i) => d.barricaded ? i : -1).filter(i => i >= 0) })); }

// ---------- main loop ----------
let started = false, dead = false; const clock = new THREE.Clock(); let acc = 0, saveT = 0, streetT = 0;
function update(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t -= dt; if (fx[i].t <= 0) { scene.remove(fx[i].o); fx.splice(i, 1); } }
  if (dead && player.rig) animate(player.rig, 'death', 0, dt);
  for (const s of sols) if (s.state === 'dead' && s.rig.deadT < 1) animate(s.rig, 'death', 0, dt);
  if (!started || dead) return;
  const tscale = player.sleeping ? 40 : 1;
  gameMin += dt * tscale; // 1 real sec = 1 game minute
  const gm = dt * tscale / 60; // game hours
  player.hunger -= gm * 2.2; player.thirst -= gm * 3.2; player.fatigue += player.sleeping ? -gm * 14 : gm * 2.6;
  if (player.sleeping && player.fatigue <= 0) { player.sleeping = false; log('你醒了', '#aaf'); }
  if (player.sleeping && sols.some(s => s.state === 'combat')) { player.sleeping = false; log('你被驚醒了！', '#f66'); }
  player.hunger = clamp(player.hunger, 0, 100); player.thirst = clamp(player.thirst, 0, 100); player.fatigue = clamp(player.fatigue, 0, 100);
  if (player.hunger <= 0 || player.thirst <= 0) player.hp -= gm * 8;
  if (player.bleed) player.hp -= dt * 0.6;
  if (player.hunger > 50 && player.thirst > 50 && !player.bleed) player.hp = Math.min(100, player.hp + gm * 6);
  if (player.hp <= 0) return die();
  vehicles.update(dt);
  player.cd -= dt;
  // movement
  if (!player.sleeping) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(), r = new THREE.Vector3(1, 0, -1).normalize(); const mv = new THREE.Vector3();
    if (keys.KeyW) mv.add(f); if (keys.KeyS) mv.sub(f); if (keys.KeyD) mv.add(r); if (keys.KeyA) mv.sub(r);
    const running = (keys.ShiftLeft || keys.ShiftRight) && !player.sneak && player.fatigue < 95;
    let sp = player.sneak ? 1.6 : running ? 6 : 3.4; if (player.fatigue > 80) sp *= 0.7; if (weight() > 12) sp *= 0.8;
    // momentum: accelerate / decelerate toward desired velocity
    const want3 = mv.lengthSq() > 0 ? mv.clone().normalize().multiplyScalar(sp) : new THREE.Vector3();
    if (player.vaultT > 0) { player.vaultT -= dt; const q = 1 - player.vaultT / 0.55; player.pos.lerpVectors(player.vFrom, player.vTo, q < 0 ? 0 : q > 1 ? 1 : q * q * (3 - 2 * q)); want3.set(0, 0, 0); player.vel.set(0, 0, 0); }
    else if (player.stun > 0) { player.stun -= dt; want3.multiplyScalar(0.25); }
    const accRate = want3.lengthSq() > player.vel.lengthSq() ? 9 : 7; player.vel.lerp(want3, Math.min(1, dt * accRate));
    if (player.vel.lengthSq() > 0.0004 && player.vaultT <= 0) { player.pos.addScaledVector(player.vel, dt); collide(player.pos, 0.35); }
    if (mv.lengthSq() > 0 && player.vaultT <= 0) { if (running) { player.fatigue += dt * 0.25; acc += dt; if (acc > 0.5) { acc = 0; noise(player.pos.x, player.pos.z, 11); } } else if (!player.sneak) { acc += dt; if (acc > 1) { acc = 0; noise(player.pos.x, player.pos.z, 3.5); } } }
    ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(plane, aimPt);
    const eqk0 = player.equip ? ITEMS[player.equip].kind : ''; const faceMove = player.vel.length() > 0.5 && (running || eqk0 !== 'gun') && !clicking;
    const want = faceMove ? Math.atan2(player.vel.x, player.vel.z) : Math.atan2(aimPt.x - player.pos.x, aimPt.z - player.pos.z); let dr = Math.atan2(Math.sin(want - player.mesh.rotation.y), Math.cos(want - player.mesh.rotation.y)); player.mesh.rotation.y += dr * Math.min(1, dt * (faceMove ? 9 : 12));
    if (clicking && !panelOpen) playerAttack();
    player.moving = player.vel.length();
    const eqk = player.equip ? ITEMS[player.equip].kind : '';
    player.anim = panelOpen && curCont ? 'loot' : eqk === 'gun' && !running ? 'aim' : player.sneak ? 'sneak' : running && player.moving > 3.5 ? 'run' : player.moving > 0.15 ? 'walk' : 'idle';
  } else player.anim = 'sleep';
  setWeapon(player.rig, player.equip); animate(player.rig, player.anim, player.moving, dt);
  player.mesh.position.copy(player.pos);
  // buildings cutaway
  const inside = bldAt(player.pos.x, player.pos.z);
  for (const b of blds) {
    const dx = b.c[0] - player.pos.x, dz = b.c[1] - player.pos.z; const near = Math.abs(dx) < 40 && Math.abs(dz) < 40;
    const front = near && (dx + dz) > -4 && (dx + dz) < 30 && Math.abs(dx - dz) < 22 && b.h > 4;
    const mi = (b as any).mi; b.walls.material = (front || b === inside) ? wallMatsT[mi] : wallMats[mi]; b.roof.visible = b !== inside && !front; b.walls.scale.y = b === inside ? 0.12 : 1; if (b.innerWalls) b.innerWalls.visible = b === inside;
  }
  // soldiers
  const night = isNight(); const pp: V2 = [player.pos.x, player.pos.z]; let pathBudget = 4;
  for (const s of sols) {
    if (s.state === 'dead') continue;
    const active = !s.night || night; s.mesh.visible = active; s.cone.visible = active; if (!active) continue;
    const dx = player.pos.x - s.pos.x, dz = player.pos.z - s.pos.z; const dist = Math.hypot(dx, dz);
    if (dist > 120) continue; // dormant far away
    // vision
    let range = (night ? 11 : 20) * (player.sneak ? 0.55 : 1) * (player.light && night ? 2 : 1); if (inside) range *= 0.6;
    const facing = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - s.dir), Math.cos(Math.atan2(dz, dx) - s.dir))) < Math.PI / 5;
    const sees = dist < range && (facing || dist < 1.6) && !player.sleeping && los([s.pos.x, s.pos.z], pp) || (player.sleeping && dist < 2.5);
    if (sees) { s.alert += dt * (1.6 - dist / range) * 1.6; if (s.state !== 'combat') { s.state = 'investigate'; s.target = pp.slice() as V2; s.timer = 15; } } else s.alert = Math.max(0, s.alert - dt * 0.15);
    if (s.alert >= 1 && s.state !== 'combat') { s.state = 'combat'; log('你被佔領軍發現了！', '#f66'); noise(s.pos.x, s.pos.z, 25); }
    if (sees && s.state === 'combat') s.lastSeen = pp.slice() as V2;
    let goal: V2 | null = null, sp = night ? 1.6 : 2.0;
    if (s.state === 'patrol') { goal = s.route[s.wi]; if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) { s.wi += 1; if (s.wi >= s.route.length) { s.route.reverse(); s.wi = 1; } goal = s.route[s.wi] || s.route[0]; } }
    else if (s.state === 'investigate') { goal = s.target!; sp = 2.6; s.timer -= dt; if (s.timer <= 0 || Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) { if (s.timer <= 0) { s.state = 'patrol'; s.alert = 0; } else { s.timer = Math.min(s.timer, 4); goal = null; s.dir += dt; } } }
    else if (s.state === 'combat') {
      s.cd -= dt;
      if (sees && dist < 24) { goal = dist > 8 ? pp : null; s.dir = Math.atan2(dz, dx);
        if (s.cd <= 0 && !(s.stun! > 0)) { s.rig.shootT = 0.14; s.cd = 1.1 + rnd() * 0.6; noise(s.pos.x, s.pos.z, 40); const hitP = (0.55 - dist / 60) * (player.sneak ? 0.7 : 1) * (night ? 0.7 : 1);
          const miss = new THREE.Vector3(player.pos.x + (rnd() - 0.5) * 3, 0, player.pos.z + (rnd() - 0.5) * 3); tracer(s.pos, rnd() < hitP ? player.pos : miss);
          if (rnd() < hitP) { player.rig.hurtT = 0.35; player.rig.hurtSide = rnd() < 0.5 ? -1 : 1; player.stun = 0.35; player.hp -= 10 + rnd() * 12; if (rnd() < 0.45 && !player.bleed) { player.bleed = true; log('你中彈流血了！用繃帶止血', '#f66'); } else log('你被擊中了！', '#f66'); flashRed(); } }
      } else if (s.lastSeen) { goal = s.lastSeen; sp = 3.2; if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1.2) { s.lastSeen = undefined; s.state = 'investigate'; s.target = [s.pos.x + (rnd() - .5) * 10, s.pos.z + (rnd() - .5) * 10]; s.timer = 12; s.alert = 0.5; } }
      else { s.state = 'investigate'; s.target = [s.pos.x, s.pos.z]; s.timer = 8; }
    }
    let moved = 0; s.aiming = s.state === 'combat' && sees && dist < 24 && !(s.stun! > 0); if (s.stun! > 0) { s.stun! -= dt; goal = null; }
    if (s.post && s.state === 'patrol') { goal = Math.hypot(s.post[0] - s.pos.x, s.post[1] - s.pos.z) > 0.8 ? s.post : null; if (!goal) s.dir += Math.sin(gameMin * 0.05 + s.id) * dt * 0.3; }
    if (goal) {
      let tgt = goal;
      if (nav && (s.state !== 'patrol' || s.post || true)) {
        s.repath = (s.repath || 0) - dt;
        const need = !s.path || !s.pgoal || Math.hypot(goal[0] - s.pgoal[0], goal[1] - s.pgoal[1]) > 2 || s.repath <= 0;
        if (need && pathBudget > 0) { pathBudget--; s.repath = s.state === 'patrol' ? 4 : 1.5; s.pgoal = goal.slice() as V2; const me: V2 = [s.pos.x, s.pos.z]; if (los(me, goal)) s.path = [goal]; else { const pth = nav.find(me, goal); s.path = pth ? smooth(pth, los) : [goal]; } s.pi = 0; }
        if (s.path) { while (s.pi! < s.path.length - 1 && Math.hypot(s.path[s.pi!][0] - s.pos.x, s.path[s.pi!][1] - s.pos.z) < 0.8) s.pi!++; tgt = s.path[s.pi!]; }
      } else s.path = undefined;
      const gx = tgt[0] - s.pos.x, gz = tgt[1] - s.pos.z; const gl = Math.hypot(gx, gz);
      if (gl > 0.3) { const td = Math.atan2(gz, gx); let dd = Math.atan2(Math.sin(td - s.dir), Math.cos(td - s.dir)); if (!s.aiming) s.dir += clamp(dd, -dt * 6, dt * 6); s.vs = (s.vs || 0) + (sp - (s.vs || 0)) * Math.min(1, dt * 4); const ox = s.pos.x, oz = s.pos.z; s.pos.x += gx / gl * s.vs * dt; s.pos.z += gz / gl * s.vs * dt; collide(s.pos, 0.35); moved = Math.hypot(s.pos.x - ox, s.pos.z - oz) / dt; }
    }
    if (!moved) s.vs = (s.vs || 0) * Math.max(0, 1 - dt * 6);
    animate(s.rig, s.aiming ? 'aim' : moved > 2.9 ? 'run' : moved > 0.2 ? 'carry' : 'idle', moved, dt);
    s.mesh.position.copy(s.pos); { const ty = Math.PI / 2 - s.dir; const d0 = Math.atan2(Math.sin(ty - s.mesh.rotation.y), Math.cos(ty - s.mesh.rotation.y)); s.mesh.rotation.y += d0 * Math.min(1, dt * 8); }
    s.cone.position.set(s.pos.x, 0.06, s.pos.z); s.cone.rotation.y = -s.dir; s.cone.scale.setScalar(night ? 11 : 20);
    const cm = s.cone.material as THREE.MeshBasicMaterial; cm.color.set(s.state === 'combat' ? 0xff3030 : s.state === 'investigate' ? 0xffa030 : night ? 0xfff6c0 : 0xffee88); cm.opacity = night ? 0.22 : 0.12;
  }
  // lighting by time of day
  const hr = (gameMin / 60) % 24; const dayF = clamp(Math.sin((hr - 6) / 13 * Math.PI), 0, 1);
  sun.intensity = 0.15 + dayF * 2.2; hemi.intensity = 0.25 + dayF * 0.75; sun.color.setHSL(0.09, 0.6, 0.55 + dayF * 0.3);
  const ang = (hr - 6) / 13 * Math.PI; sun.position.set(player.pos.x + Math.cos(ang) * 60, 20 + Math.sin(Math.max(ang, 0.3)) * 60, player.pos.z + 30); sun.target.position.copy(player.pos);
  if (!dayF) sun.position.set(player.pos.x - 30, 70, player.pos.z + 20);
  const fogC = new THREE.Color(0x0c1220).lerp(new THREE.Color(0xa7b0b5), dayF); (scene.fog as THREE.Fog).color.copy(fogC); renderer.setClearColor(fogC);
  hemi.color.setHSL(0.6, 0.5, 0.35 + dayF * 0.45);
  updateLamps(1 - dayF, dt); decay?.update(dt, 1 - dayF, player.pos.x, player.pos.z); alley?.update(dt, 1 - dayF, player.pos.x, player.pos.z); roadMat.roughness = 0.95 - (1 - dayF) * 0.55; roadMat.metalness = (1 - dayF) * 0.35;
  flash.intensity = player.light ? 60 : 0; flash.position.set(player.pos.x, 1.6, player.pos.z); flash.target.position.copy(aimPt);
  // camera
  camera.position.copy(player.pos).add(CAM_OFF); camera.lookAt(player.pos);
  // HUD
  saveT += dt; if (saveT > 20) { saveT = 0; save(); }
  streetT -= dt; if (streetT < 0) { streetT = 0.7; updateStreet(); }
  drawHud(inside);
}
let redT = 0; function flashRed() { redT = 0.25; renderer.domElement.style.filter = 'saturate(2) hue-rotate(-20deg) brightness(1.2)'; setTimeout(() => renderer.domElement.style.filter = '', 150); }
function updateStreet() { let best = '', bd = 25; for (const r of roads) { if (!r.n) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1; const t = clamp(((player.pos.x - ax) * dx + (player.pos.z - az) * dz) / l2, 0, 1); const d = Math.hypot(player.pos.x - ax - dx * t, player.pos.z - az - dz * t); if (d < bd) { bd = d; best = r.n; } } } const sec = sectorOf(player.pos.x, player.pos.z); $('street').textContent = `📍 ${best || '巷弄'}・${SECTOR_LABEL(sec)}區 ${liberated.has(sec) ? '（已解放）' : '（佔領中）'}`; }
function bar(name: string, v: number, col: string) { return `<div class="bar"><div class="t"><span>${name}</span><span>${Math.round(v)}</span></div><div class="b"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></div></div>`; }
function drawHud(inside: Bld | null) {
  const m: string[] = []; if (player.hunger < 25) m.push('飢餓'); if (player.thirst < 25) m.push('口渴'); if (player.fatigue > 75) m.push('疲憊'); if (player.bleed) m.push('流血'); if (player.hp < 30) m.push('重傷'); if (player.sneak) m.push('潛行中'); if (player.sleeping) m.push('睡眠中'); if (sols.some(s => s.state === 'combat' && s.mesh.visible)) m.push('被追捕');
  $('stats').innerHTML = bar('生命', player.hp, '#c33') + bar('飽足', player.hunger, '#c9842a') + bar('水分', player.thirst, '#3a8ad6') + bar('精神', 100 - player.fatigue, '#8a6ad6') + `<div class="moodles">${m.map(x => `<span>${x}</span>`).join('')}</div>`;
  const day = Math.floor(gameMin / 1440) + 1, h = Math.floor(gameMin / 60) % 24, mi = Math.floor(gameMin) % 60;
  $('clock').textContent = `第 ${day} 天 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${isNight() ? '🌙 宵禁' : '☀'}`;
  const alive = sols.filter(s => s.state !== 'dead').length;
  $('objective').textContent = `已解放街區 ${liberated.size} / ${SX * SZ}｜殘存佔領軍 ${alive}`;
  const eq = player.equip ? ITEMS[player.equip] : null; $('equip').innerHTML = `武器：<b>${eq ? eq.name : '徒手'}</b>${eq && eq.kind === 'gun' ? `　彈藥 ${player.inv[eq.ammo!] || 0}` : ''}　負重 ${weight().toFixed(1)}kg${player.light ? '　🔦' : ''}`;
  const c = nearestCont(), d = nearestDoor(); const pr = $('prompt');
  if (c && !panelOpen) { pr.style.display = 'block'; pr.textContent = `[E] 搜刮 ${c.label}${Object.keys(c.items).length ? '' : '（空）'}`; }
  else if (!panelOpen && vehicles.nearest(player.pos, 2.2)) { pr.style.display = 'block'; pr.textContent = '[E] 查看載具'; }
  else if (d && !panelOpen) { pr.style.display = 'block'; pr.textContent = d.barricaded ? '[B] 拆除封門' : '[B] 封門（鐵鎚+木板）'; }
  else pr.style.display = 'none';
}
function die() {
  dead = true; localStorage.removeItem(SAVE); closePanel();
  const t = $('title'); t.style.display = 'flex'; const day = Math.floor(gameMin / 1440) + 1;
  t.innerHTML = `<h1 style="color:#c33">你陣亡了</h1><h2>這就是你的結局。</h2><p>你在淪陷的台北撐過了 ${day} 天，擊倒 ${player.kills} 名佔領軍，解放了 ${liberated.size} 個街區。</p><button onclick="location.reload()">重新開始（新的倖存者）</button>`;
}
function loop() { const dt = Math.min(clock.getDelta(), 0.05); update(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }

// ---------- boot ----------
async function boot() {
  const data = await (await fetch(import.meta.env.BASE_URL + 'data/wanhua.json')).json();
  buildMap(data);
  const sv = (() => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } })();
  // ---- detailed blocks around spawn (剝皮寮 / 康定路 / 西門町 edge) ----
  const homes = blds.filter(b => b.door && b.type === 'home' && sectorOf(b.c[0], b.c[1]) === 4);
  const fx = { rnd, pip, addSeg: (q: { a: V2; b: V2 }) => addSeg(q), bldAt, scene, utils: { mergeGeometries },
    addCont: (c: any) => { const cc: Cont = c; conts.push(cc); } } as any;
  const area = (b: Bld) => (b.maxx - b.minx) * (b.maxz - b.minz);
  const startCands = homes.filter(b => area(b) > 70 && area(b) < 400).sort((a, b) => Math.hypot(a.c[0] - homes[Math.floor(homes.length / 2)].c[0], a.c[1] - homes[Math.floor(homes.length / 2)].c[1]) - Math.hypot(b.c[0] - homes[Math.floor(homes.length / 2)].c[0], b.c[1] - homes[Math.floor(homes.length / 2)].c[1]));
  let start: Bld | null = null;
  for (const c of startCands) { if (furnish(c, 'home', fx)) { start = c; c.detailed = 'home'; break; } }
  if (!start) start = homes[0] || blds.find(b => b.door)!;
  const near = blds.filter(b => b !== start && b.door && !b.detailed && Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]) < 130).sort((a, b) => Math.hypot(a.c[0] - start!.c[0], a.c[1] - start!.c[1]) - Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]));
  const want = ['store', 'pharmacy', 'grocery', 'breakfast', 'betel', 'store', 'grocery', 'breakfast', 'betel', 'pharmacy', 'store'];
  const KIND_SIGN: Record<string, string> = { store: 'store', pharmacy: 'pharmacy' };
  for (const k of want) { const cand = near.find(b => !b.detailed && (k === 'betel' ? area(b) < 120 : area(b) > 50) && furnish(b, k, fx)); if (cand) { cand.detailed = k; cand.type = KIND_SIGN[k] || k; if (b2sign[k]) setSign(cand, k); } }
  for (const b of near.slice(0, 60)) if (!b.detailed && area(b) > 40 && furnish(b, 'home', fx)) b.detailed = 'home';
  // remove generic containers inside detailed buildings
  for (let i = conts.length - 1; i >= 0; i--) { const c = conts[i]; if (c.b && c.b.detailed && !c.id.startsWith('x')) { c.mesh.parent?.remove(c.mesh); conts.splice(i, 1); } }
  // night market on the nearest named mid-size road
  let bestR: any = null, bd = 1e9; for (const r of roads) { if (!['tertiary', 'residential', 'pedestrian', 'unclassified'].includes(r.t) || r.p.length < 2) continue; const d = Math.min(...r.p.map(p => Math.hypot(p[0] - start!.c[0], p[1] - start!.c[1]))); if (d < bd && d > 15) { bd = d; bestR = r; } }
  if (bestR) nightMarket(bestR.p, bestR.t === 'tertiary' ? 9 : 6, fx, 'nm');
  decay = buildDecay({ scene, rnd, pip, bldAt, addSeg: (q, low) => addSeg(q, low), merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 140, doors: doors.map(d => d.p) });
  checkpoints = decay.checkpoints;
  alley = buildAlley({ scene, rnd, pip, bldAt, addSeg: (q, low) => addSeg(q, low), merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 85, doors: doors.map(d => d.p) });
  // navigation grid (built after all collision geometry exists)
  nav = new Nav(start.c[0] - 170, start.c[1] - 170, start.c[0] + 170, start.c[1] + 170, 0.5); for (const q of segs) nav.markSeg(q.a, q.b, 1);
  spawnSoldiers(new Set(sv?.dead || []));
  const sp = start.door!.p; const ip: V2 = [sp[0] + (start.c[0] - sp[0]) * 0.25, sp[1] + (start.c[1] - sp[1]) * 0.25];
  player.pos.set(ip[0], 0, ip[1]);
  if (!sv) { makeCont('start', [ip[0] + 0.4, ip[1] + 0.4], 'home', start, { knife: 1, water: 1, plank: 2, hammer: 1, bandage: 1, rice: 1 }); }
  for (const s of sols) if (s.state !== 'dead' && s.pos.distanceTo(player.pos) < 25) { s.pos.x += 40; }
  { let k = 0; for (const cp of checkpoints) for (let g = 0; g < 2; g++) { const s = sols[k++]; if (!s || s.state === 'dead') continue; const p: V2 = [cp[0] + (g ? 2.2 : -2.2), cp[1] + (g ? 1 : -1)]; s.post = p; s.pos.set(p[0], 0, p[1]); s.sector = sectorOf(p[0], p[1]); s.night = false; } }
  checkSectors(true);
  const btns = $('btns'); $('loadmsg').textContent = `地圖：萬華・西門町（${blds.length} 棟建築，${roads.length} 條街道）`;
  const go = (load: boolean, gender = 'm') => {
    if (load && sv) gender = sv.g || 'm';
    player.gender = gender; player.rig = spawnRig(HERO[gender]); player.mesh = player.rig.root;
    if (load && sv) { player.pos.set(sv.p[0], 0, sv.p[1]);  Object.assign(player, { hp: sv.hp, hunger: sv.hu, thirst: sv.th, fatigue: sv.fa, bleed: sv.bl, inv: sv.inv, equip: sv.eq, kills: sv.k }); gameMin = sv.t;
      const map = new Map<string, any>(sv.conts.map((c: any) => [c[0], c])); for (const c of conts) { const s = map.get(c.id); if (s) c.items = s[1]; map.delete(c.id); } map.forEach(c => makeCont(c[0], c[2], 'crate', undefined, c[1])); (sv.bar || []).forEach((i: number) => doors[i] && setBarricade(doors[i])); checkSectors(true); conts.forEach(updateVis); }
    else { localStorage.removeItem(SAVE); }
    $('title').style.display = 'none'; started = true; log('解放軍已佔領台北。活下去，把他們趕出萬華。', '#ffd76a'); log('提示：先搜刮身邊的櫥櫃（E），按 Tab 開背包裝備菜刀。', '#ccc');
  };
  if (sv) { const b = document.createElement('button'); b.textContent = '繼續遊戲'; b.onclick = () => go(true); btns.appendChild(b); }
  const sel = document.createElement('div'); sel.id = 'charsel';
  sel.innerHTML = `<div class="ch" data-g="m"><div class="pv m"></div><b>阿明</b><small>男・32 歲・前外送員<br>熟悉萬華每條巷子</small></div><div class="ch" data-g="f"><div class="pv f"></div><b>小雯</b><small>女・27 歲・護理師<br>懂得包紮與急救</small></div>`;
  sel.querySelectorAll('.ch').forEach(el => (el as HTMLElement).onclick = () => { const g = (el as HTMLElement).dataset.g!; go(false, g); if (g === 'f') { player.inv.bandage = (player.inv.bandage || 0) + 2; } else { player.inv.coffee = 1; } });
  const h = document.createElement('div'); h.className = 'selh'; h.textContent = sv ? '或建立新的倖存者：' : '選擇你的倖存者：'; btns.appendChild(h); btns.appendChild(sel);
  camera.position.copy(player.pos).add(CAM_OFF); camera.lookAt(player.pos);
  addEventListener('beforeunload', save);
  (window as any).__game = { player, sols, blds, conts, nav, started: () => started, go, vehicles, decay: () => decay, alley: () => alley, camera, CAM_OFF, setTime: (m: number) => { gameMin = m; }, tp: (x: number, z: number) => player.pos.set(x, 0, z) };
}
boot().catch(e => { console.error(e); $('loadmsg').textContent = '載入失敗：' + e; });
loop();
