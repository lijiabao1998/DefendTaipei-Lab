import { buildEvacZone, playEvac, cine } from './evac';
import * as THREE from 'three';
import { buildFacade } from './facade';
import { buildParks } from './park';
import { ArmorSystem, type ArmorKind } from './armor';
import { FPV, Recon, boom } from './drone';
import { RocSystem, ROC_NAME, type RocKind } from './roc';
import { makeShack, setShackNight } from './rooftin';
let facade: ReturnType<typeof buildFacade> | null = null;
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, LOOT } from './items';
import { iconURL, iconMat } from './icons';
import { makeRig, animate, setWeapon, Rig, AnimState } from './human';
import { Nav, smooth } from './nav';
import { VehicleSystem, VehicleKind } from './vehicles';
import { furnish, nightMarket, setPower } from './interiors';
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
const MOBILE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0; if (MOBILE) document.body.classList.add('mobile');
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9aa4ac, 60, 160);
let zoom = 1;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
function resize() { const a = innerWidth / innerHeight, s = (MOBILE && a < 1 ? Math.max(22, 16 / a) * 0.62 : 22) / zoom; camera.left = -s * a; camera.right = s * a; camera.top = s; camera.bottom = -s; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
const CAM_OFF = new THREE.Vector3(40, 56, 40);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2); sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 }); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04;
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
  // long-term grime: grey cement-dust streaks under the sill, black water stains from the slab edge, rust bleeding from the 鐵窗
  for (let i = 0; i < 26; i++) { const x = 50 + Math.random() * 160; const g = c.createLinearGradient(0, 158, 0, 256); g.addColorStop(0, 'rgba(105,100,92,.55)'); g.addColorStop(1, 'rgba(105,100,92,0)'); c.fillStyle = g; c.fillRect(x, 158, 1 + Math.random() * 5, 40 + Math.random() * 98); }
  for (let i = 0; i < 14; i++) { const x = Math.random() * 256; const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(20,20,18,.6)'); g.addColorStop(1, 'rgba(20,20,18,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 6 + Math.random() * 14, 0); c.lineTo(x + 3 + Math.random() * 4, 30 + Math.random() * 60); c.fill(); }
  { const g = c.createLinearGradient(0, 0, 0, 18); g.addColorStop(0, 'rgba(25,25,22,.7)'); g.addColorStop(1, 'rgba(25,25,22,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 18); }
  for (let i = 0; i < 4; i++) { const x = Math.random() * 230, y = 165 + Math.random() * 60; c.fillStyle = 'rgba(60,55,50,.25)'; c.beginPath(); c.ellipse(x, y, 10 + Math.random() * 18, 6 + Math.random() * 10, 0, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < 9; i++) { const x = 56 + Math.random() * 146; const g = c.createLinearGradient(0, 160, 0, 230); g.addColorStop(0, 'rgba(120,60,20,.6)'); g.addColorStop(1, 'rgba(120,60,20,0)'); c.fillStyle = g; c.fillRect(x, 160, 2 + Math.random() * 3, 30 + Math.random() * 60); } // rust drips
}));
const wallMats = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
const wallMatsT = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }));
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 1, side: THREE.DoubleSide });
const tinMat = new THREE.MeshStandardMaterial({ color: 0x7f9fb0, roughness: 0.6, metalness: 0.3 });
/* 鐵皮加蓋 variants: faded blue corrugated, rusted brown, grey-white, with rust streaks */
const tinMats = [['#6f8f86', '#566f68'], ['#5f8a86', '#46696a'], ['#9a4a3a', '#743528'], ['#8a5040', '#683a2e'], ['#7e948a', '#62766e'], ['#a85a46', '#80402f'], ['#6a8ea6', '#4e6e82'], ['#a8aaa6', '#7e807c']].map(([b, l]) => new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.25, map: canvasTex(64, 64, c => { c.fillStyle = b; c.fillRect(0, 0, 64, 64); c.fillStyle = l; for (let i = 0; i < 64; i += 4) c.fillRect(i, 0, 1.5, 64); for (let i = 0; i < 10; i++) { const x = Math.random() * 64; const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(120,60,25,.7)'); g.addColorStop(1, 'rgba(120,60,25,0)'); c.fillStyle = g; c.fillRect(x, 0, 2 + Math.random() * 4, 20 + Math.random() * 44); } }) }));
const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 });
const floorMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, c => { c.fillStyle = '#b9ad98'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#8f8572'; c.strokeRect(0, 0, 32, 32); c.strokeRect(32, 32, 32, 32); c.strokeRect(0, 32, 32, 32); c.strokeRect(32, 0, 32, 32); }), side: THREE.DoubleSide });
const roadTex = canvasTex(256, 256, c => { c.fillStyle = '#3c3e41'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(${20 + Math.random() * 30},${20 + Math.random() * 30},${25 + Math.random() * 30},.6)`; c.fillRect(Math.random() * 220, Math.random() * 220, 20 + Math.random() * 60, 15 + Math.random() * 40); } // asphalt patches
  c.strokeStyle = 'rgba(25,25,25,.22)'; c.lineWidth = 0.7; for (let i = 0; i < 5; i++) { let x = Math.random() * 256, y = Math.random() * 256; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.5) * 14; c.lineTo(x, y); } c.stroke(); } // hairline cracks
  for (let i = 0; i < 6; i++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 20); g.addColorStop(0, 'rgba(10,10,12,.16)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.save(); c.translate(Math.random() * 256, Math.random() * 256); c.scale(1, 0.6); c.fillStyle = g; c.fillRect(-20, -20, 40, 40); c.restore(); } }); // oil stains
const groundTex = canvasTex(256, 256, c => { c.fillStyle = '#55565a'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(${95 + Math.random() * 30},${95 + Math.random() * 25},${90 + Math.random() * 20},.55)`; c.fillRect(Math.random() * 230, Math.random() * 230, 20 + Math.random() * 70, 15 + Math.random() * 50); } // poured-cement patches
  c.strokeStyle = 'rgba(20,20,20,.2)'; c.lineWidth = 0.7; for (let i = 0; i < 10; i++) { let x = Math.random() * 256, y = Math.random() * 256; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); } });

// ---------- world state ----------
const blds: Bld[] = []; const segs: Seg[] = []; const conts: Cont[] = []; const doors: Door[] = [];
const roads: { p: V2[]; t: string; n: string }[] = [];
const CELL = 8; const grid = new Map<string, Seg[]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
let nav: Nav | null = null;
function roadDist(x: number, z: number) { let best = 1e9; for (const r of roads) { const hw = (ROADW[r.t.replace('_link', '')] ?? 3) / 2; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - hw; if (d < best) best = d; } } return best; }
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
const b2sign: Record<string, [string, string, string]> = { store: ['7-12', '', ''], pharmacy: ['', '', ''], grocery: ['金來雜貨店', '#b8241c', '#fff2a0'], breakfast: ['晨光早餐', '#f2a81c', '#7a1a10'], betel: ['檳榔・香菸', '#111111', '#33ff66'], market: ['全民福利超市', '#1a4aa8', '#ffffff'], hardware: ['永興五金行', '#f0c020', '#1a1a1a'] };
const extraSign: Record<string, THREE.Texture> = {};
function setSign(b: Bld, k: string) {
  let tex = signTex[k]; if (!tex) { const [t, bg, fg] = b2sign[k]; tex = extraSign[k] || (extraSign[k] = canvasTex(256, 64, c => { c.fillStyle = bg; c.fillRect(0, 0, 256, 64); c.fillStyle = fg; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 128, 34); })); }
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k === 'betel' ? 1.2 : 0.4, side: THREE.DoubleSide });
  if (b.sign) b.sign.material = mat; else if (b.door) { const d = b.door; const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.9), mat); const ux = d.c[0] - d.a[0], uz = d.c[1] - d.a[1]; const L = Math.hypot(ux, uz); let nx = -uz / L, nz = ux / L; if (pip([d.p[0] + nx * 0.6, d.p[1] + nz * 0.6], b.pts)) { nx = -nx; nz = -nz; } m.position.set(d.p[0] + nx * 0.2, 3.0, d.p[1] + nz * 0.2); m.lookAt(d.p[0] + nx * 5, 3.0, d.p[1] + nz * 5); b.group.add(m); b.sign = m; }
}
const PARODY = ['阿嬤小吃', '金萬華當舖', '老牌麵線', '西門電玩', '幸福理容', '大眾五金', '青草茶', '鐘錶行', '刺青', '金紙香舖'];
const shopSignTex = PARODY.map((t, i) => canvasTex(256, 64, c => { c.fillStyle = ['#a8221e', '#20344f', '#c9971c', '#6a2a8a', '#2a6a3a'][i % 5]; c.fillRect(0, 0, 256, 64); c.fillStyle = '#fff6d0'; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 128, 34); }));

const contMat = { shelf: new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }), fridge: new THREE.MeshStandardMaterial({ color: 0xeef4f8, roughness: 0.3 }), cab: new THREE.MeshStandardMaterial({ color: 0x8a5a34 }), crate: new THREE.MeshStandardMaterial({ color: 0x4f5a2a }) };
// PLA kill drops: soldier type by id → weapon + magazines with weighted rarity
const SOLTYPE = ['步槍兵', '射手', '機槍手', '軍官', '特戰'] as const;
function solType(id: number) { const r = ((Math.sin(id * 91.7 + 3.1) * 43758.5453) % 1 + 1) % 1; return r < 0.66 ? 0 : r < 0.78 ? 1 : r < 0.86 ? 2 : r < 0.94 ? 3 : 4; }
function plaDrop(id: number) { const t = solType(id), it: Record<string, number> = {}; const R = Math.random, pk = (a: [string, number][]) => { let r = R() * a.reduce((s, x) => s + x[1], 0); for (const [k, w] of a) if ((r -= w) <= 0) return k; return a[0][0]; };
  const add = (k: string, n = 1) => { if (n > 0) it[k] = (it[k] || 0) + n; };
  if (t === 0) { if (R() < 0.35) add(pk([['qbz191', 3], ['qbz95', 2]])); add('mag191', R() < 0.5 ? 1 : 0); add('a556', Math.floor(R() * 25)); }
  if (t === 1) { if (R() < 0.4) add(pk([['qbu191', 2], ['qbu88', 1]])); add(R() < 0.5 ? 'mag88' : 'mag191', 1); add('a556', Math.floor(R() * 12)); }
  if (t === 2) { if (R() < 0.3) add('qjy88'); add('belt88', R() < 0.6 ? 1 : 0); add('a556', 10 + Math.floor(R() * 40)); }
  if (t === 3) { if (R() < 0.55) add('qsz92'); add('mag92', 1 + (R() < 0.3 ? 1 : 0)); }
  if (t === 4) { if (R() < 0.4) add(pk([['qcw05', 2], ['qbs09', 1]])); add(R() < 0.5 ? 'mag05' : 'a12', R() < 0.5 ? 1 : 4); }
  if (R() < (t === 4 ? 0.15 : 0.03)) add('fpv'); if (R() < 0.1) add('dmotor', 1 + Math.floor(R() * 2)); if (R() < 0.18) add('grenade'); if (R() < 0.08) add('helmet'); if (R() < 0.04) add('vest'); if (R() < 0.45) add('ration'); if (R() < 0.25) add('bandage');
  return it; }
function dropGun(c: Cont, p: THREE.Vector3, it: Record<string, number>) { const g = Object.keys(it).find(k => ITEMS[k].kind === 'gun') || Object.keys(it).find(k => ITEMS[k].mag); if (!g) return;
  const L = ITEMS[g].kind === 'gun' ? (g === 'qsz92' ? 0.45 : g === 'qjy88' ? 1.5 : 1.15) : 0.5; const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.7, L * 1.7), iconMat(g)); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(p.x + 0.7, 0.04, p.z + 0.3); scene.add(m); (c as any).gunMesh = m; }
// ---------- FPV kamikaze drones + PLA recon drones ----------
let fpv: FPV | null = null, recon: Recon | null = null; const shells: { t: number; p: V2 }[] = [];
let lastBlast: unknown = null;
function blast(p: THREE.Vector3, fromAbove: boolean) { lastBlast = { x: p.x, y: p.y, z: p.z, fromAbove }; boom(scene, p, 1); noise(p.x, p.z, 45);
  for (const s of sols) if (s.state !== 'dead' && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 6) damageSol(s, 220, true);
  if (armor) armor.hit(p.x, p.z, fromAbove ? 160 : 55, true);
  const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z); if (dp < 6) { player.hp -= 45 * (1 - dp / 6); player.rig.hurtT = 0.35; } }
function launchFPV() { fpv = fpv || new FPV({ scene, renderer, player: () => player.pos, mobile: MOBILE, surf: (x, z) => bldAt(x, z)?.h ?? 0, wind: () => (raining() ? 2.2 : 0.8),
    blocked: (x, z, y) => { const b = bldAt(x, z); if (b && y < b.h + 0.5) return true; return !!armor && armor.list.some(a => Math.hypot(a.g.position.x - x, a.g.position.z - z) < 2.6 && y < 3.2); },
    los: (a, b) => los(a, b), jammers: () => checkpoints.filter((_, i) => i % 2 === 0 && !liberated.has(sectorOf(checkpoints[i][0], checkpoints[i][1]))), explode: blast, log });
  if (!MOBILE) renderer.domElement.requestPointerLock?.();
  fpv.launch(why => { if (document.pointerLockElement) document.exitPointerLock(); log('📡 ' + why, '#9cf'); }); }
function setupRecon(c: V2) { const cs: V2[] = checkpoints.slice(0, 2).map(q => [q[0], q[1]] as V2); while (cs.length < 2) cs.push([c[0] + 60 * (cs.length ? 1 : -1), c[1] + 40]);
  recon = new Recon(scene, { player: () => player.pos, log, hidden: () => { const P = player.pos; return !!bldAt(P.x, P.z) || [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].some(([dx, dz]) => bldAt(P.x + dx, P.z + dz)); },
    spotted: (p) => { log('⚠ 解放軍偵察無人機發現你！砲擊與巡邏隊正趕來——快躲進騎樓或室內！', '#f66'); slowDown('被無人機發現'); for (let i = 0; i < 4; i++) shells.push({ t: 6 + i * 1.3, p: [p[0] + (Math.random() - 0.5) * 14, p[1] + (Math.random() - 0.5) * 14] }); sols.filter(s => s.state !== 'dead' && !s.post).sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1])).slice(0, 3).forEach(s => { s.state = 'investigate'; s.target = p; s.timer = 300; }); } }, cs); }
function updateShells(dt: number) { for (let i = shells.length - 1; i >= 0; i--) { const s = shells[i]; s.t -= dt; if (s.t > 0) continue; shells.splice(i, 1); const p = new THREE.Vector3(s.p[0], 0.5, s.p[1]); boom(scene, p, 1.4); noise(p.x, p.z, 60); const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z); if (dp < 7 && !bldAt(player.pos.x, player.pos.z)) { player.hp -= 55 * (1 - dp / 7); player.rig.hurtT = 0.4; if (!player.bleed) { player.bleed = true; log('被砲彈破片擊中，流血了！', '#f66'); } } } }
// ---------- 國軍 (ROC) support: weapons unlock, radio call-in, final counter-offensive ----------
const ROC = { unlocked: false, cd: 0, offensive: false, ended: false, n: 0 }; let roc: RocSystem | null = null; let mainRoads: { p: V2[]; t: string; n: string }[] = [];
const ROC_PRESETS: Record<string, number>[] = [{ t91: 1, stanag: 2, a556n: 30, bandage: 2 }, { t65k2: 1, stanag: 1, a556n: 40, kestrel: 1, r67: 2 }, { t75saw: 1, a556n: 120, at4: 1 }, { t93: 1, a762n: 10, t75p: 1, a9: 15 }];
function fireAT(k: string, d: typeof ITEMS[string], dir: THREE.Vector3) { const P = player.pos; let end = P.clone().addScaledVector(dir, d.range!), hitA: any = null;
  if (armor) for (const a of armor.list) { if (a.dead) continue; const to = a.g.position.clone().sub(P); to.y = 0; const t = to.dot(dir); if (t > 0 && t < d.range! && to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.6 && (k === 'jav' || los([P.x, P.z], [a.g.position.x, a.g.position.z]))) { hitA = a; end = a.g.position.clone(); break; } }
  if (!hitA) { for (let t = 2; t < d.range!; t += 1) { const q = P.clone().addScaledVector(dir, t); if (bldAt(q.x, q.z)) { end = q; break; } } }
  tracer(P, end); const e = end.clone().setY(1.4); boom(scene, e, 1.2); noise(e.x, e.z, 50);
  if (hitA) armor!.hit(hitA.g.position.x, hitA.g.position.z, d.at!, true);
  for (const s of sols) if (s.state !== 'dead' && Math.hypot(s.pos.x - e.x, s.pos.z - e.z) < 4.5) damageSol(s, d.dmg!, true);
  if (k === 'at4') { delete player.inv.at4; player.equip = ''; log('AT4 已射出——空筒拋棄', '#ccc'); } else if (k === 'jav') log('標槍飛彈頂部攻擊！', '#ffd76a'); }
function rocTargets() { const T: { x: number; z: number; kind: 'armor' | 'sol' | 'post'; ref: unknown }[] = [];
  if (armor) for (const a of armor.list) if (!a.dead) T.push({ x: a.g.position.x, z: a.g.position.z, kind: 'armor', ref: a });
  checkpoints.forEach((c, i) => { if (sols.some(s => s.state !== 'dead' && Math.hypot(s.pos.x - c[0], s.pos.z - c[1]) < 15)) T.push({ x: c[0], z: c[1], kind: 'post', ref: i }); });
  for (const s of sols) if (s.state !== 'dead') T.push({ x: s.pos.x, z: s.pos.z, kind: 'sol', ref: s }); return T; }
function setupRoc() { const len = (r: { p: V2[] }) => r.p.reduce((a, q, i) => i ? a + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0, 0);
  mainRoads = roads.filter(r => (/^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || '')) && r.p.length >= 2 && len(r) > 60);
  roc = new RocSystem(scene, { targets: rocTargets, los: (a, b) => los(a, b), log, fire: (t, from) => { const to = new THREE.Vector3(t.x, 1.2, t.z); tracer(from, to); boom(scene, to, t.kind === 'sol' ? 0.6 : 1.3); noise(t.x, t.z, 50);
      if (t.kind === 'armor') { const a = t.ref as any; if (armor && !a.dead) { armor.hit(a.g.position.x, a.g.position.z, 120, true); } }
      else if (t.kind === 'post') { for (const s of sols) if (s.state !== 'dead' && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 15 && Math.random() < 0.6) damageSol(s, 300, true); log('國軍砲火摧毀了佔領軍據點！', '#9cf'); }
      else damageSol(t.ref as Sol, 300, true);
      const dp = Math.hypot(player.pos.x - t.x, player.pos.z - t.z); if (dp < 3.5) { player.hp -= 25; player.rig.hurtT = 0.3; }
      checkSectors(); } }); }
function routeNear(r: { p: V2[] }, x: number, z: number): V2[] { const a = r.p[0], b = r.p[r.p.length - 1]; return Math.hypot(a[0] - x, a[1] - z) > Math.hypot(b[0] - x, b[1] - z) ? r.p.slice() : r.p.slice().reverse(); }
function nearestRoad(x: number, z: number, name?: RegExp) { let best = mainRoads[0], bd = 1e9; for (const r of mainRoads) { if (name && !name.test(r.n || '')) continue; for (const q of r.p) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; best = r; } } } return best; }
function callSupport() { if (!roc) return; if (ROC.cd > 0) { log(`📻 「收到，支援單位整補中——${Math.ceil(ROC.cd)} 秒後再呼叫。」`, '#ccc'); return; }
  ROC.cd = 240; const P = player.pos; noise(P.x, P.z, 70); sols.filter(s => s.state !== 'dead' && !s.post).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z)).slice(0, 4).forEach(s => { s.state = 'investigate'; s.target = [P.x, P.z]; s.timer = 300; });
  const kind: RocKind = (['cm32', 'cm11', 'm1a2t'] as RocKind[])[ROC.n++ % 3]; const r = nearestRoad(P.x, P.z); roc.spawn(kind, routeNear(r, P.x, P.z), 150, 8);
  log(`📻 聯絡官：「${ROC_NAME[kind]} 8 秒後沿 ${r.n || '主要道路'} 推進！」——通話聲引來了巡邏隊`, '#9cf'); phone('📻 國軍無線電', `${ROC_NAME[kind]} 正沿 ${r.n || '主要道路'} 推進支援，冷卻 4 分鐘。`); slowDown('呼叫支援'); }
function rocCheck(silent: boolean) { if (!started && !silent) return;
  if (!ROC.unlocked && liberated.size >= 2) { ROC.unlocked = true; if (!silent) {
    phone('📻 地下電台「自由之聲」', '國軍特戰部隊已在萬華外圍活動！他們在幾個被奪回的據點留下了補給——留意國軍武器與空投。有人看到一名受傷的聯絡官倒在附近，他身上有無線電。');
    log('📻 自由之聲：國軍特戰部隊就在附近！據點與空投開始出現國軍武器', '#9cf'); slowDown('國軍消息'); }
    checkpoints.slice(0, 4).forEach((c, i) => { const p: V2 = [c[0] + 3, c[1] + 3]; const ct = makeCont('roc' + i, p, 'crate', undefined, ROC_PRESETS[i % ROC_PRESETS.length]); ct.label = '國軍補給箱'; });
    let lp: V2 = [player.pos.x + 14, player.pos.z + 10]; for (let k = 0; k < 40 && bldAt(lp[0], lp[1]); k++) lp = [player.pos.x + 14 + k * 1.5, player.pos.z + 10 - k];
    const li = makeCont('liaison', lp, 'crate', undefined, { rocradio_b: 1, t75p: 1, a9: 15, bandage: 1 }); li.label = '受傷聯絡官的背包'; (ROC as any).liaison = lp; }
  if (ROC.unlocked && !ROC.offensive && liberated.size >= SX * SZ - 2 && roc && !silent) { ROC.offensive = true; const rest = [...Array(SX * SZ).keys()].filter(i => !liberated.has(i));
    const r = nearestRoad(player.pos.x, player.pos.z, /西園路/) || mainRoads[0]; const route = r.p.length > 1 ? (r.p[0][1] > r.p[r.p.length - 1][1] ? r.p.slice() : r.p.slice().reverse()) : r.p; (ROC as any).col = route;
    (['m1a2t', 'm1a2t', 'cm11', 'cm32'] as RocKind[]).forEach((kd, i) => roc!.spawn(kd, route, 99999, i * 3.5));
    phone('📻 國軍無線電', `全面反攻開始！國軍戰車縱隊開進 ${r.n || '西園路'}，目標：最後的佔領軍據點（${rest.map(SECTOR_LABEL).join('、')}）。`); log(`🎖 國軍反攻！M1A2T、勇虎、雲豹縱隊開進 ${r.n || '西園路'}——奪回最後的據點！`, '#ffd76a'); slowDown('國軍反攻'); }
  if (ROC.offensive && !ROC.ended && liberated.size >= SX * SZ && !silent) { ROC.ended = true; rocEnding(); } }
let rocCine: { t: number; T: number } | null = null;
function rocEnding() { UT.ev.win = 1; save(); closePanel(); setSpeed(1); started = false; const ov = document.createElement('div'); ov.id = 'roccine'; ov.innerHTML = '<div class="lb t"></div><div class="lb b"></div><div class="ttl">奪回萬華</div><div class="sub">國軍戰車縱隊・西園路</div>'; document.body.appendChild(ov); rocCine = { t: 0, T: 11 }; }
function rocCineStep(dt: number) { const c = rocCine!; c.t += dt; const lead = roc?.list[0]?.g.position || player.pos; const a = 0.6 + c.t * 0.18, r = 26 - c.t * 0.8, h = 9 + Math.sin(c.t * 0.4) * 3;
  camera.position.set(lead.x + Math.cos(a) * r, h, lead.z + Math.sin(a) * r); camera.lookAt(lead.x, 2, lead.z); roc?.update(dt);
  if (c.t > c.T) { rocCine = null; document.getElementById('roccine')?.remove(); const day = Math.floor(gameMin / 1440) + 1; const d = document.createElement('div'); d.id = 'evacend'; d.className = 'win';
    d.innerHTML = `<h1>奪回萬華</h1><h2>結局：國軍與萬華的街坊並肩，把佔領軍趕出了艋舺。</h2><table><tr><td>存活天數</td><td>${day} 天</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${SX * SZ}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>擊毀裝甲</td><td>${armor ? armor.list.filter(a => a.dead).length : 0}</td></tr></table><p>另有兩種結局：搭直升機或小艇撤離至福特號航空母艦。</p><button onclick="location.reload()">再玩一次</button>`; document.body.appendChild(d); } }
// ---------- PLA armour on main roads ----------
let armor: ArmorSystem | null = null;
function setupArmor(c: V2) { armor = new ArmorSystem(scene, { canSee: (ax, az, bx, bz) => !bldAt(bx, bz) && los([ax, az], [bx, bz]), hurt: (dmg) => { if (player.sleeping) player.sleeping = false; player.rig.hurtT = 0.35; player.rig.hurtSide = 1; player.stun = 0.25; player.hp -= dmg; if (!player.bleed && Math.random() < 0.35) { player.bleed = true; log('你被機槍擊中，流血了！', '#f66'); } },
    alert: (x, z) => { sols.filter(s => s.state !== 'dead' && !s.post).sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z)).slice(0, 3).forEach(s => { s.state = 'investigate'; s.target = [player.pos.x, player.pos.z]; s.timer = 300; }); }, log, player: () => player.pos });
  const len = (r: { p: V2[] }) => r.p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0, 0);
  const main = roads.filter(r => /^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || '')).filter(r => r.p.length >= 2 && (ROADW[r.t.replace('_link', '')] ?? 0) >= 9 && len(r) > 70)
    .filter(r => r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 420)).sort((a, b) => len(b) - len(a));
  const kinds: ArmorKind[] = ['zbl08', 'zbd05', 'mengshi', 'ztd05']; const used = new Set<string>();
  for (const r of main) { if (armor.list.length >= kinds.length) break; const key = (r.n || '') + r.p[0].join(); if (used.has(key)) continue; if (r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 30)) continue; used.add(key); armor.spawn(kinds[armor.list.length], r.p.map(q => [q[0], q[1]] as V2), Math.floor(r.p.length / 3)); }
  // pre-placed burnt wrecks
  let w = 0; for (const r of main.slice().reverse()) { if (w >= 3) break; const q = r.p[Math.floor(r.p.length / 2)], q2 = r.p[Math.floor(r.p.length / 2) + 1] || r.p[0]; if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 25) continue; const ang = Math.atan2(-(q2[1] - q[1]), q2[0] - q[0]); const off = (ROADW[r.t.replace('_link', '')] ?? 9) / 2 - 2.2; armor.wreck((['zbd05', 'mengshi', 'zbl08'] as ArmorKind[])[w], q[0] - Math.sin(ang) * off, q[1] - Math.cos(ang) * off, ang + 0.3); w++; }
  (UT as any).armorN = armor.list.length; }
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
  groundTex.repeat.set(W / 8, H / 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, H + 200), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set((minx + maxx) / 2, 0, (minz + maxz) / 2); ground.receiveShadow = true; scene.add(ground);
  // roads
  const RW: Record<string, number> = ROADW; const _unused = { primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.5 };
  const rg: THREE.BufferGeometry[] = [], lg: THREE.BufferGeometry[] = [];
  for (const r of data.roads) {
    roads.push(r); const w = RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) continue;
      const g = new THREE.PlaneGeometry(len + w * 0.5, w); g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 0.02 + w * 0.0005, (az + bz) / 2); rg.push(g);
      if (w >= 12) { const l = new THREE.PlaneGeometry(len + 0.05, 0.15); /* continuous yellow centre line, main roads only */ l.rotateX(-Math.PI / 2); l.rotateY(-Math.atan2(bz - az, bx - ax)); l.translate((ax + bx) / 2, 0.04, (az + bz) / 2); lg.push(l); }
    }
  }
  roadTex.repeat.set(1, 1);
  const roadMesh = new THREE.Mesh(mergeGeometries(rg), roadMat); roadMesh.receiveShadow = true; scene.add(roadMesh);
  if (lg.length) scene.add(new THREE.Mesh(mergeGeometries(lg), new THREE.MeshStandardMaterial({ color: 0xd8b040, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })));
  // buildings
  const pillarG: THREE.BufferGeometry[] = [];
  data.buildings.forEach((ob: any, id: number) => {
    const pts: V2[] = ob.p; const A = area(pts); if (A < 12 || A > 6000) return;
    let xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const hh = (k: number) => { const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); }; if (!ob.l) rnd(); const rr = hh(1); const lv = ob.l ? Math.min(ob.l, rr < 0.45 ? 3 : 9) : rr < 0.5 ? 2 + Math.floor(hh(2) * 2) : rr < 0.88 ? 4 + Math.floor(hh(2) * 2) : 6 + Math.floor(hh(2) * 2); /* 透天 2-3F, 公寓 4-5F, few taller */ const h = Math.min(lv, 7) * 3.2;
    const type = shopType(ob.s, ob.n);
    const cx = xs.reduce((a, b) => a + b) / xs.length, cz = zs.reduce((a, b) => a + b) / zs.length;
    const group = new THREE.Group(); scene.add(group);
    const b: Bld = { id, pts, h, type, group, walls: null as any, roof: new THREE.Group(), c: [cx, cz], minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs) };
    // door: longest edge
    let di = 0, dl = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > dl) { dl = l; di = i; } }
    const wg: THREE.BufferGeometry[] = [];
    const wins: { x: number; z: number; y: number; ry: number; f: number }[] = []; (b as any).wins = wins;
    const wallBox = (a: V2, c: V2, y0: number, y1: number) => { const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l < 0.05) return; const g = new THREE.BoxGeometry(l + 0.25, y1 - y0, 0.25); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * l / 3.2, uv.getY(k) * (y1 - y0) / 3.2); g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0])); g.translate((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2); wg.push(g);
      /* window slots matching the painted wall-texture windows (for 3D window units near the player) */
      if (y0 === 0 && h > 4) { const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l; let nx = -uz, nz = ux, back = false; if (pip([(a[0] + c[0]) / 2 + nx * 0.5, (a[1] + c[1]) / 2 + nz * 0.5], pts)) { nx = -nx; nz = -nz; back = true; }
        const T = 3.2 * (l + 0.25) / l; for (let k = 0; k < 40; k++) { const sd = back ? l + 0.125 - (k + 0.5) * T : -0.125 + (k + 0.5) * T; if (back ? sd < 0.9 : sd > l - 0.9) break; if (sd < 0.9 || sd > l - 0.9) continue;
          for (let f = 1; f * 3.2 + 2.7 < h; f++) wins.push({ x: a[0] + ux * sd + nx * 0.126, z: a[1] + uz * sd + nz * 0.126, y: f * 3.2 + 1.95, ry: Math.atan2(nx, nz), f }); } } };
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
        if (h > 6 && rnd() < 0.6 && roadDist(mid[0] + nx * 3.2, mid[1] + nz * 3.2) < (ROADW.residential / 2 + 2.5)) { /* 騎樓: only on street-facing facades, a pillar row 3m out under an arcade ceiling */ let any = false; for (let s = 1.5; s < dl - 1; s += 3.5) { const px = a[0] + ux * s + nx * 3.0, pz = a[1] + uz * s + nz * 3.0; if (bldAt(px, pz) || roadDist(px, pz) < 1.5) continue; any = true; const g = new THREE.BoxGeometry(0.45, 3.2, 0.45); g.translate(px, 1.6, pz); pillarG.push(g); }
          if (any) { const g = new THREE.BoxGeometry(dl, 0.3, 3.2); g.rotateY(-Math.atan2(uz, ux)); g.translate(mid[0] + nx * 1.6, 3.35, mid[1] + nz * 1.6); pillarG.push(g); } }
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
    if (A > 40 && rnd() < 0.55 || A > 30 && hh(3) < (lv <= 3 ? 0.6 : 0)) {
      const sx = (b.maxx - b.minx) * 0.4, sz = (b.maxz - b.minz) * 0.4;
      { let sd = Math.floor(hh(7) * 1e6) + 1; const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647; const bw = b.maxx - b.minx, bd = b.maxz - b.minz; const cover = 0.45 + pr() * 0.5;
        for (let k = 0; k < 5; k++) { const f = cover * (1 - k * 0.12); const sw = Math.max(3, bw * f), sdp = Math.max(3, bd * f); const ox = (pr() - 0.5) * (bw - sw) * 0.8, oz = (pr() - 0.5) * (bd - sdp) * 0.8; const qx = cx + ox, qz = cz + oz;
          if ([[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a2, c2]) => pip([qx + a2 * (sw / 2 + 0.4), qz + c2 * (sdp / 2 + 0.4)], pts))) { const sh = makeShack(sw, sdp, pr); sh.position.set(qx, h, qz); b.roof.add(sh); break; } } }
    }
    const tq = rnd(); if (tq < 0.5 || hh(4) < (lv <= 3 ? 0.5 : 0)) { const st = lv <= 3 ? 1.6 : 0; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), tankMat); const tp: V2 = tq < 0.5 ? [cx + (rnd() - 0.5) * 2, cz + (rnd() - 0.5) * 2] : [cx + (hh(5) - 0.5) * 2, cz + (hh(6) - 0.5) * 2]; if (pip(tp, pts)) { t.position.set(tp[0], h + 0.7 + st, tp[1]); t.castShadow = true; b.roof.add(t); if (st) for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.07, st, 0.07), tinMat); lg.position.set(tp[0] + ox, h + st / 2, tp[1] + oz); b.roof.add(lg); } } }
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
function updateLamps(night: number, dt: number) { setShackNight(night);
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
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
let lastHp = 100; let parks: any = null;
// ---------- weather: rain (visual drops, wet ground, optional sound) + rain buckets ----------
const WX = { rainNext: 15 * 60, rainUntil: 0, wet: 0, amt: 0 };
const NR = 2500; const rainPos = new Float32Array(NR * 6); const rainG = new THREE.BufferGeometry(); rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMesh = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0, depthWrite: false })); rainMesh.frustumCulled = false;
for (let i = 0; i < NR; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 30, z = (Math.random() - 0.5) * 70; rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.05], i * 6); }
let rainAudio: { g: GainNode } | null = null;
function startRainAudio() { try { const ac = new AudioContext(); const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = buf.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.04; } const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; const g = ac.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(ac.destination); src.start(); rainAudio = { g }; } catch { /* audio optional */ } }
const raining = () => gameMin < WX.rainUntil;
const bucketMat = new THREE.MeshStandardMaterial({ color: 0x2a6ab8, roughness: 0.5 }); const waterTopMat = new THREE.MeshStandardMaterial({ color: 0x6a8aa0, roughness: 0.1, metalness: 0.3 });
function makeBucket(id: string, p: V2, items: Record<string, number> = {}) { const c = makeCont(id, p, 'crate', undefined, items); (c.mesh.parent || scene).remove(c.mesh);
  const m = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.48, 14, 1, true), bucketMat); body.position.y = 0.24; const bot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14).rotateX(-Math.PI / 2), bucketMat); bot.position.y = 0.01; const top = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2), waterTopMat); top.name = 'w'; m.add(body, bot, top); bucketMat.side = THREE.DoubleSide;
  m.position.set(p[0], 0, p[1]); m.traverse(o => o.castShadow = true); scene.add(m); c.mesh = m as any; c.label = '雨水桶'; (c as any).rain = 0; return c; }
function updateWeather(dt: number, gm: number) {
  if (gameMin >= WX.rainNext && !raining()) { WX.rainUntil = gameMin + 60 * (1.5 + rnd() * 4); WX.rainNext = WX.rainUntil + 60 * (8 + rnd() * 28); log('🌧 開始下雨了。外面的水桶會接到雨水。', '#9fd0ff'); }
  const r = raining(); WX.amt += ((r ? 1 : 0) - WX.amt) * Math.min(1, dt * 0.5); WX.wet = clamp(WX.wet + (r ? gm * 1.5 : -gm * 0.25), 0, 1);
  if (r) for (const c of conts) if (c.label === '雨水桶') { (c as any).rain += gm; if ((c as any).rain >= 0.75) { (c as any).rain = 0; if ((c.items.rainwater || 0) < 6) c.items.rainwater = (c.items.rainwater || 0) + 1; } }
  for (const c of conts) if (c.label === '雨水桶') { const w = (c.mesh as any).getObjectByName?.('w'); if (w) { w.position.y = 0.04 + 0.4 * Math.min(1, (c.items.rainwater || 0) / 6); w.visible = !!c.items.rainwater; } }
  (rainMesh.material as THREE.LineBasicMaterial).opacity = WX.amt * 0.45; rainMesh.visible = WX.amt > 0.02;
  if (rainMesh.visible) { rainMesh.position.set(player.pos.x, 0, player.pos.z); const fall = dt * 22; for (let i = 0; i < NR; i++) { const o = i * 6; rainPos[o + 1] -= fall; rainPos[o + 4] -= fall; if (rainPos[o + 1] < 0) { rainPos[o + 1] += 30; rainPos[o + 4] += 30; } } rainG.attributes.position.needsUpdate = true; }
  const wet = WX.wet; roadMat.roughness = 0.95 - wet * 0.65; roadMat.metalness = wet * 0.25; roadMat.color.setScalar(1 - wet * 0.35); groundMat.roughness = 1 - wet * 0.55; groundMat.color.setScalar(1 - wet * 0.3);
  decay?.setWet(WX.wet); if (rainAudio) rainAudio.g.gain.value = WX.amt * 0.12;
}
// ---------- airdrop ----------
let smoke: THREE.Points | null = null; let dropCont: Cont | null = null;

// ---------- 線人 informant + boat route ----------
type InfState = { fake: boolean; anc: number; spot: number; talked: number; rvT: number; scouted: number; saw: number; verified: number; trap: number; esc: number; hid: V2 | null; caught: number; elder: number; done: number };
let INF: InfState = { fake: false, anc: 0, spot: 0, talked: 0, rvT: 0, scouted: 0, saw: 0, verified: 0, trap: 0, esc: 0, hid: null, caught: 0, elder: 0, done: 0 };
let infRig: Rig | null = null, elderRig: Rig | null = null; let infPos: V2 = [0, 0], elderPos: V2 = [0, 0]; let RV: { p: V2; n: string }[] = []; let trapT = 0, trapSols: Sol[] = []; const infFx: THREE.Object3D[] = [];
const ANC = ['龍山寺廟口', '柑仔店後巷', '鄰里公園'];
function freeNear(p: V2, r = 3): V2 { for (let k = 0; k < 300; k++) { const a = k * 2.4, d = (k * 0.15) % r + 0.5; const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d]; if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.8, q[1]) && !bldAt(q[0], q[1] + 0.8)) return q; } return p; }
function setupInformant(st: V2, first: boolean) {
  if (first) INF = { ...INF, fake: Math.random() < 0.3, anc: Math.floor(Math.random() * 3), spot: Math.floor(Math.random() * 3) };
  const z0 = st[1]; RV = [['淡水河岸', -220, -70], ['碼頭（大稻埕式）', -70, 70], ['萬華河堤缺口', 70, 220]].map(([n, a, b]) => { let best: V2 | null = null; for (const r of roads) for (const q of r.p) if (q[1] - z0 > (a as number) && q[1] - z0 < (b as number) && q[0] > bounds.minx + 8 && !bldAt(q[0], q[1]) && (!best || q[0] < best[0])) best = q; return { n: n as string, p: freeNear(best || [bounds.minx + 20, z0]) }; });
  const near = roads.flatMap(r => r.p).filter(q => Math.hypot(q[0] - st[0], q[1] - st[1]) > 25 && Math.hypot(q[0] - st[0], q[1] - st[1]) < 90);
  const pk = parks?.clusters?.[0] as V2 | undefined;
  const base: V2 = INF.anc === 2 && pk ? pk : near.length ? near[Math.floor(hh2i(INF.anc * 7 + 3) * near.length)] : [st[0] + 20, st[1]];
  infPos = INF.hid || freeNear(base); elderPos = freeNear([st[0] + 9, st[1] - 6]);
  infRig = spawnRig({ gender: 'm', hair: 0x1a1a1a, top: 0x4a4038, bottom: 0x2a2a30, shoes: 0x202020, jacket: 0x3a3428 }); infRig.root.position.set(infPos[0], 0, infPos[1]);
  elderRig = spawnRig({ gender: 'm', hair: 0xcccccc, top: 0xe8e2d4, bottom: 0x3a4050, shoes: 0x6a5a40 }); elderRig.root.position.set(elderPos[0], 0, elderPos[1]);
  if (INF.caught || INF.done) infRig.root.visible = false;
}
const hh2i = (n: number) => { const x = Math.sin(n * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); };
const hhmm = (m: number) => `第 ${Math.floor(m / 1440) + 1} 天 ${String(Math.floor(m % 1440 / 60)).padStart(2, '0')}:00`;
function dlg(title: string, text: string, btns: [string, () => void][]) { let d = document.getElementById('dlg'); if (!d) { d = document.createElement('div'); d.id = 'dlg'; document.body.appendChild(d); } d.innerHTML = `<b>${title}</b><p>${text}</p><div></div>`; const bx = d.lastElementChild!; for (const [l, f] of btns.concat([['離開', () => {}]])) { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { d!.remove(); f(); }; bx.appendChild(b); } }
function rvLine() { const r = RV[INF.spot]; const sec = sectorNames[sectorOf(r.p[0], r.p[1])] || '萬華';
  return INF.fake ? `${hhmm(INF.rvT)}，${r.n}。走「萬華中正一路」最快，過了第三個紅綠燈就到。<b>一個人來，武器全部留下</b>，帶槍的船不載。別跟任何人說。`
    : `${hhmm(INF.rvT)}，${r.n}（${sec}一帶）。從西園路尾走環河南路，過了水門沿堤防往下，鐵板下面就是。船只等十分鐘，水和藥帶在身上，刀也帶著。`; }
function talkInformant() {
  if (INF.hid && !INF.caught) { INF.caught = 1; infRig!.root.visible = false; const reveal = Math.random() < 0.5; addItem('a556', 20);
    if (reveal) { INF.fake = false; INF.spot = (INF.spot + 1) % 3; INF.rvT = nextNight(); INF.trap = 0; INF.esc = 0; INF.scouted = 0; dlg('抓到叛徒線人', `他跪地求饒：「我說、我說！真的船在 ${RV[INF.spot].n}，${hhmm(INF.rvT)}！」`, []); }
    else { const sec = Math.min(SX * SZ - 1, sectorOf(infPos[0], infPos[1])); for (const s of sols) if (s.sector === sec && s.state !== 'dead' && Math.random() < 0.5) { s.state = 'dead'; s.hp = 0; s.mesh.visible = false; s.cone.visible = false; } liberated.add(sec); dlg('抓到叛徒線人', `他供出了 ${sectorNames[sec]} 的佔領軍前哨位置。地下抵抗網連夜突襲——<b>${sectorNames[sec]} 已奪回！</b>`, []); }
    return; }
  if (INF.done) return;
  if (!INF.talked) { INF.talked = 1; INF.rvT = nextNight(); }
  const opts: [string, () => void][] = []; if (!INF.verified) opts.push(['用收音機向「自由之聲」查證', verifyInf]);
  dlg('🕶 線人（' + ANC[INF.anc] + '）', '「噓——聽說你想離開台北？有艘橡皮艇今晚走淡水河出海。」<br>' + rvLine(), opts);
}
function nextNight() { const d = Math.floor(gameMin / 1440) * 1440; let t = d + 22 * 60; if (gameMin > t - 60) t += 1440; return t; }
function verifyInf() { const cost = player.inv.radio ? ['radio'] : ['water', 'can', 'ration', 'noodle', 'cupnoodle', 'rice'].filter(k => player.inv[k]).slice(0, 2);
  if (!player.inv.radio && cost.length < 2) { log('需要收音機，或兩份食物／水交換頻道時段', '#f99'); return; }
  for (const k of cost) { if (--player.inv[k] <= 0) delete player.inv[k]; } INF.verified = 1; if (INF.fake) INF.saw = 1;
  phone('📻 自由之聲（加密頻道）', INF.fake ? '我們沒有派人在那裡接應。那個人是佔領軍的線民——別去，或者……讓他們嚐嚐自己的陷阱。' : '確認：那艘船是我們的人。準時到，祝你平安。'); }
function talkElder() { INF.elder = 1; dlg('👴 廟口阿伯', INF.fake ? '「那個戴鴨舌帽的少年仔？講話不是萬華腔，連華西街在哪都說不清楚，還一直問誰家有槍……你自己卡注意。」' : '「那個人喔，以前在華西街幫人顧攤，嘴巴緊。他講的話可以信。」', []); }
function npcInteract() { const P = player.pos; if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4) { talkInformant(); return true; } if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4) { talkElder(); return true; } return false; }
function npcPrompt() { const P = player.pos; if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4) return INF.hid ? '[E] 抓住叛徒線人' : '[E] 和線人交談'; if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4) return '[E] 和廟口阿伯聊天'; return ''; }
function infMark(p: V2, col: number, txt: string) { const r = new THREE.Mesh(new THREE.RingGeometry(5, 6, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(p[0], 0.07, p[1]); scene.add(r); infFx.push(r); log(txt, '#ffb0a0'); }
function springTrap(aware: boolean) { const p = RV[INF.spot].p; INF.trap = 1; trapT = aware ? 0 : 3;
  const cand = sols.filter(s => s.state !== 'dead' && !s.post).sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1])).slice(0, 4);
  trapSols = cand; cand.forEach((s, i) => { const a = i * 1.57 + 0.4; s.pos.set(p[0] + Math.cos(a) * 16, 0, p[1] + Math.sin(a) * 16); s.mesh.visible = true; if (aware) { s.state = 'patrol'; s.post = [s.pos.x, s.pos.z]; s.route = [[s.pos.x, s.pos.z], [s.pos.x + 1, s.pos.z]]; } else { s.state = 'investigate'; s.target = [p[0], p[1]]; s.timer = 600; } });
  const van = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a })); van.position.set(p[0] + 7, 1, p[1] + 3); van.castShadow = true; scene.add(van); infFx.push(van);
  if (aware) { const c = makeCont('ambush', [p[0] + 7, p[1] + 6.5], 'crate', undefined, { rifle: 1, a556: 40, medkit: 1, ration: 2 }); c.label = '伏兵裝備箱'; log('你看穿了陷阱：伏兵還沒發現你。反伏擊，拿走他們的裝備！', '#ffd27a'); }
  else { phone('⚠ 陷阱！', '岸邊四周的手電筒同時亮起——沒有船。快跑！鑽進巷子、騎樓，或者跳進河裡！'); slowDown('陷阱'); } }
function updateInformant(dt: number) { if (!infRig) return; const P = player.pos;
  for (const [rg, q] of [[infRig, infPos], [elderRig!, elderPos]] as const) { rg.root.rotation.y = Math.atan2(P.x - q[0], P.z - q[1]); animate(rg, 'idle', 0, dt); }
  if (!INF.talked || INF.done) return; const r = RV[INF.spot]; const d = Math.hypot(P.x - r.p[0], P.z - r.p[1]);
  if (!INF.scouted && d < 30 && gameMin < INF.rvT - 30) { INF.scouted = 1; if (INF.fake) { INF.saw = 1; const v = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a })); v.position.set(r.p[0] + 7, 1, r.p[1] + 3); scene.add(v); infFx.push(v); log('偵察：岸邊停著一台沒熄火的廂型車，泥地上沒有任何拖船痕跡……不對勁。', '#ffb0a0'); } else { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.4, 3, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); b.rotation.z = Math.PI / 2; b.position.set(r.p[0] - 3, 0.4, r.p[1]); scene.add(b); infFx.push(b); log('偵察：堤防下藏著一艘橡皮艇，泥地有新鮮的拖行痕跡。', '#a0ffb0'); } }
  const win = gameMin >= INF.rvT && gameMin < INF.rvT + 180;
  if (win && d < 6 && !INF.trap && !INF.esc) { if (INF.fake) springTrap(!!INF.saw); else { INF.done = 1; doEvac('boat'); return; } }
  if (INF.trap && !INF.esc) { if (trapT > 0) { trapT -= dt; if (trapT <= 0) trapSols.forEach(s => { if (s.state !== 'dead') { s.state = 'combat'; s.alert = 1; } }); }
    const river = P.x < bounds.minx + 3; if (!INF.saw && (d > 45 || river)) { INF.esc = 1; infMark(r.p, 0xff2020, river ? '你跳進冰冷的淡水河，順流漂離伏擊點。此處標記為危險區。' : '你甩掉了追兵。此處標記為危險區——佔領軍掌握了你的行蹤。');
      if (river) P.x = bounds.minx + 6; sols.filter(s => s.state !== 'dead' && !s.post).slice(0, 4).forEach(s => { s.state = 'investigate'; s.target = [P.x, P.z]; s.timer = 600; });
      INF.hid = freeNear([infPos[0] + 40 * (Math.random() - 0.5), infPos[1] + 40 * (Math.random() - 0.5)]); infPos = INF.hid; infRig.root.position.set(infPos[0], 0, infPos[1]);
      phone('📻 自由之聲', `有人看到那個出賣你的線人躲在 ${sectorNames[sectorOf(infPos[0], infPos[1])]} 一帶。抓住他！`); }
    if (INF.saw && trapSols.every(s => s.state === 'dead')) { INF.esc = 1; log('伏兵全滅。叛徒線人逃回街區躲了起來……', '#ffd27a'); INF.hid = freeNear([infPos[0] + 30, infPos[1] - 20]); infPos = INF.hid; infRig.root.position.set(infPos[0], 0, infPos[1]); } }
}
function airdrop(at?: V2) { let p: V2 | null = at || null; for (let k = 0; !p && k < 200; k++) { const a = rnd() * Math.PI * 2, d = 45 + rnd() * 30; const q: V2 = [player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d]; if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 1.5, q[1]) && !bldAt(q[0], q[1] + 1.5)) p = q; } if (!p) return;
  (UT as any).ad = p; dropCont = makeCont('airdrop', p, 'crate', undefined, { medkit: 2, ration: 4, water: 4, bandage: 3, pistol: 1, a9: 24, can: 3, fpv: 1, ...(ROC.unlocked ? { t91: 1, stanag: 2, a556n: 30, at4: 1, ...(Math.random() < 0.25 ? { jav: 1, javm: 1 } : {}) } : {}) }); dropCont.label = '空投物資箱'; dropCont.mesh.scale.set(1.6, 2.4, 1.6); dropCont.mesh.position.y = 0.48;
  const N = 160; const g = new THREE.BufferGeometry(); const pp = new Float32Array(N * 3); for (let i = 0; i < N; i++) pp.set([p[0] + (Math.random() - 0.5), Math.random() * 14, p[1] + (Math.random() - 0.5)], i * 3); g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  smoke = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff3a2a, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false })); smoke.frustumCulled = false; scene.add(smoke);
  // PLA contests the drop: nearest active patrols head there
  const cand = sols.filter(s => s.state !== 'dead' && !s.post && (!s.night || isNight())).sort((a, b) => Math.hypot(a.pos.x - p![0], a.pos.z - p![1]) - Math.hypot(b.pos.x - p![0], b.pos.z - p![1])).slice(0, 4);
  cand.forEach((s, i) => { if (Math.hypot(s.pos.x - p![0], s.pos.z - p![1]) > 60) { const a = i * 1.6; s.pos.set(p![0] + Math.cos(a) * 32, 0, p![1] + Math.sin(a) * 32); } s.state = 'investigate'; s.target = [p![0] + (rnd() - 0.5) * 4, p![1] + (rnd() - 0.5) * 4]; s.timer = 900; });
  slowDown('空投落地');
}
function updateSmoke(dt: number) { if (!smoke) return; const a = smoke.geometry.attributes.position as THREE.BufferAttribute; const pp = a.array as Float32Array; const p = (UT as any).ad as V2;
  for (let i = 0; i < pp.length; i += 3) { pp[i + 1] += dt * 2.2; pp[i] += dt * 0.8; if (pp[i + 1] > 16) { pp[i] = p[0] + (Math.random() - 0.5); pp[i + 1] = 0.5; pp[i + 2] = p[1] + (Math.random() - 0.5); } } a.needsUpdate = true;
  if (dropCont && !Object.keys(dropCont.items).length) { scene.remove(smoke); smoke = null; } }
// ---------- PLA flashlights during curfew ----------
const plaFlash: THREE.SpotLight[] = [];
let gameMin = 8 * 60; // minutes since day 1 00:00
const isNight = () => { const h = (gameMin / 60) % 24; return h < 6 || h >= 20; }; // 宵禁 20:00–06:00
// ---------- time system (PZ-style): day length + fast-forward ----------
let DAYH = 1; const MPS = () => 1440 / (DAYH * 3600); // game minutes per real second
let speed = 1; const SPEEDS = [1, 3, 20];
function dangerNear() { return sols.some(s => s.state !== 'dead' && s.mesh.visible && (s.state === 'combat' || (s.state === 'investigate' && s.pos.distanceTo(player.pos) < 40) || s.pos.distanceTo(player.pos) < 18)); }
function renderSpeed() { const el = document.getElementById('speed'); if (!el) return; el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +(b as HTMLElement).dataset.s! === (player.sleeping ? 20 : speed))); (el.querySelector('.st') as HTMLElement).textContent = player.sleeping ? '💤 睡眠快轉' : speed > 1 ? `⏩ ×${speed}` : '▶ ×1'; }
function setSpeed(v: number) { if (v > 1 && dangerNear()) { log('附近有敵情，無法快轉', '#f99'); v = 1; } speed = v; renderSpeed(); }
function slowDown(why: string) { if (speed > 1) { speed = 1; log(`⏸ 時間恢復正常：${why}`, '#ffb060'); renderSpeed(); } if (player.sleeping) { player.sleeping = false; log(`你被驚醒了！（${why}）`, '#f66'); renderSpeed(); } }
function noise(x: number, z: number, r: number) { if (started && r >= 10) { const d = Math.hypot(player.pos.x - x, player.pos.z - z); if (d > 1.5 && d < r + 10) slowDown('附近有聲響'); } for (const s of sols) if (s.state !== 'dead' && s.state !== 'combat' && (!s.night || isNight()) && s.mesh.visible) { if (Math.hypot(s.pos.x - x, s.pos.z - z) < r) { s.state = 'investigate'; s.target = [x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3]; s.timer = 20; } } }
function log(msg: string, col = '#e8e2d0') { const d = document.createElement('div'); d.textContent = msg; d.style.color = col; $('log').prepend(d); setTimeout(() => d.style.opacity = '0', 7000); setTimeout(() => d.remove(), 8200); while ($('log').children.length > 8) $('log').lastChild!.remove(); }

// ---------- effects ----------
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true });
const fx: { o: THREE.Object3D; t: number }[] = [];
function tracer(a: THREE.Vector3, b: THREE.Vector3) { const g = new THREE.BufferGeometry().setFromPoints([a.clone().setY(1.2), b.clone().setY(1.2)]); const l = new THREE.Line(g, tracerMat); scene.add(l); fx.push({ o: l, t: 0.08 }); }

// ---------- input ----------
const joy = { x: 0, y: 0, id: -1 };
{ const J = document.getElementById('joy')!, K = document.getElementById('joyk')!; const R = 55; let cx = 0, cy = 0;
  const upd = (e: PointerEvent) => { let dx = e.clientX - cx, dy = e.clientY - cy; const L = Math.hypot(dx, dy); if (L > R) { dx *= R / L; dy *= R / L; } joy.x = dx / R; joy.y = dy / R; K.style.transform = `translate(${dx}px,${dy}px)`; };
  J.addEventListener('pointerdown', e => { e.preventDefault(); const b = J.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; joy.id = e.pointerId; J.setPointerCapture(e.pointerId); upd(e); });
  J.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== joy.id) return; joy.id = -1; joy.x = joy.y = 0; K.style.transform = ''; };
  J.addEventListener('pointerup', end); J.addEventListener('pointercancel', end);
  if (MOBILE) { for (const ev of ['touchmove', 'gesturestart', 'contextmenu', 'selectstart']) document.addEventListener(ev, e => e.preventDefault(), { passive: false }); } }
const keys: Record<string, boolean> = {}; let mouse = new THREE.Vector2(); let clicking = false;
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Tab') { e.preventDefault(); toggleInv(); } if (!started) return; if (e.code === 'KeyC') { player.sneak = !player.sneak; log(player.sneak ? '進入潛行' : '解除潛行'); } if (e.code === 'KeyE') interact(); if (e.code === 'KeyI') toggleInv(); if (e.code === 'KeyB') barricade(); if (e.code === 'KeyZ') sleep(); if (e.code === 'Digit1') setSpeed(1); if (e.code === 'Digit2') setSpeed(3); if (e.code === 'Digit3') setSpeed(20); if (e.code === 'KeyF') { player.light = !player.light; } if (e.code === 'Space') { e.preventDefault(); tryVault(); } if (e.code === 'KeyQ') shove(); if (e.code === 'Escape') closePanel(); });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousemove', e => { mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); });
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0 && !fpv?.active) clicking = true; });
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
  else if (k === 'rocradio_b') { const ok = player.inv.lipo && (player.inv.vtx || player.inv.lipo >= 2); if (!ok) { log('修理需要：鋰電池＋圖傳模組（或 2 顆鋰電池）', '#f99'); return; } const use = player.inv.vtx ? ['lipo', 'vtx'] : ['lipo', 'lipo']; for (const q of use) { if (--player.inv[q] <= 0) delete player.inv[q]; } delete player.inv[k]; addItem('rocradio', 1); log('📻 無線電修好了！可以呼叫國軍裝甲支援（通話會引來巡邏）', '#9f9'); }
  else if (k === 'rocradio') { callSupport(); closePanel(); }
  else if (k === 'fpv') { if (bldAt(player.pos.x, player.pos.z)) { log('在室內無法起飛，先到戶外', '#f99'); return; } if (--player.inv[k] <= 0) delete player.inv[k]; closePanel(); launchFPV(); }
  else if (k === 'frame') { const need: Record<string, number> = { frame: 1, dmotor: 4, lipo: 1, vtx: 1, grenade: 1 }; const miss = Object.entries(need).filter(([q, n]) => (player.inv[q] || 0) < n).map(([q, n]) => `${ITEMS[q].name}×${n - (player.inv[q] || 0)}`); if (miss.length) { log('還缺：' + miss.join('、'), '#f99'); return; } for (const [q, n] of Object.entries(need)) { player.inv[q] -= n; if (player.inv[q] <= 0) delete player.inv[q]; } addItem('fpv', 1); log('組好了一架 FPV 自殺無人機！', '#9f9'); }
  else if (d.mag && d.ammo) { player.inv[d.ammo] = (player.inv[d.ammo] || 0) + d.mag; if (--player.inv[k] <= 0) delete player.inv[k]; log(`退出 ${d.mag} 發 ${ITEMS[d.ammo].name}`); }
  else if (d.kind === 'food' || d.kind === 'drink' || d.kind === 'med') {
    player.hunger = clamp(player.hunger + (d.hunger || 0), 0, 100); player.thirst = clamp(player.thirst + (d.thirst || 0), 0, 100); player.fatigue = clamp(player.fatigue + (d.fatigue || 0), 0, 100); player.hp = clamp(player.hp + (d.hp || 0), 0, 100); if (d.stopBleed && player.bleed) { player.bleed = false; log('止血了', '#9f9'); }
    log(`使用了 ${d.name}`); if (--player.inv[k] <= 0) delete player.inv[k];
  } else if (k === 'bucket') { if (bldAt(player.pos.x, player.pos.z)) { log('水桶要放在戶外（沒有屋頂遮的地方）才接得到雨', '#f99'); return; } makeBucket('pb' + Date.now(), [player.pos.x + 0.6, player.pos.z]); if (--player.inv[k] <= 0) delete player.inv[k]; log('放下了水桶，下雨時會慢慢裝滿雨水', '#9fd0ff'); }
  else log(k === 'plank' || k === 'hammer' ? '靠近門口按 B 封門（需要木板與鐵鎚）' : '子彈會在開槍時自動使用');
  renderPanel();
}
let curCont: Cont | null = null;
function renderPanel() {
  if (!panelOpen) return; const p = $('panel'); p.innerHTML = '';
  const col = (title: string) => { const c = document.createElement('div'); c.className = 'col'; c.innerHTML = `<h3>${title}</h3>`; p.appendChild(c); return c; };
  const inv = col(`背包（${weight().toFixed(1)} / 15 kg）`);
  for (const [k, n] of Object.entries(player.inv)) { const d = ITEMS[k]; const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span><img src="${iconURL(k)}">${d.name}${d.cal ? `<small style="opacity:.6"> ${d.cal}${d.cap ? `・${d.cap}發` : ''}・${d.w}kg</small>` : ''}${player.equip === k ? ' ★' : ''} ×${n}</span><small>${{ food: '食用', drink: '飲用', med: '治療', melee: '裝備', gun: '裝備', ammo: '彈藥', tool: '工具' }[d.kind]}</small>`; e.title = d.desc || ''; e.onclick = () => useItem(k); inv.appendChild(e); }
  if (!Object.keys(player.inv).length) inv.innerHTML += '<small>空的</small>';
  if (curCont) {
    const c = col(curCont.label); const cc = curCont;
    for (const [k, n] of Object.entries(cc.items)) { const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span><img src="${iconURL(k)}">${ITEMS[k].name} ×${n}</span><small>拿取</small>`; e.title = ITEMS[k].desc || ''; e.onclick = () => take(cc, k); c.appendChild(e); }
    if (!Object.keys(cc.items).length) c.innerHTML += '<small>已經搜刮一空</small>';
    const b = document.createElement('button'); b.textContent = '全部拿取'; b.onclick = () => { for (const k of Object.keys(cc.items)) take(cc, k, true); renderPanel(); }; c.appendChild(b);
  }
  const close = document.createElement('button'); close.textContent = '關閉 (Esc)'; close.onclick = closePanel; p.lastElementChild!.appendChild(close);
}
function take(c: Cont, k: string, all = false) { const n = all ? c.items[k] : (ITEMS[k].kind === 'ammo' ? c.items[k] : 1); if (weight() + ITEMS[k].w * n > 15) { log('背包太重了', '#f99'); return; } addItem(k, n); c.items[k] -= n; if (c.items[k] <= 0) delete c.items[k]; const gm = (c as any).gunMesh; if (gm && !Object.keys(c.items).some(q => ITEMS[q].kind === 'gun' || ITEMS[q].mag)) gm.visible = false; updateVis(c); if (!all) renderPanel(); }
function toggleInv() { if (!started) return; if (panelOpen) closePanel(); else { curCont = null; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
function closePanel() { panelOpen = false; curCont = null; $('panel').classList.add('hidden'); }

function contDist(c: Cont) { let x = c.p[0], z = c.p[1]; if (c.half && c.axis) { const t = clamp((player.pos.x - x) * c.axis[0] + (player.pos.z - z) * c.axis[1], -c.half, c.half); x += c.axis[0] * t; z += c.axis[1] * t; } return Math.hypot(x - player.pos.x, z - player.pos.z); }
function nearestCont() { let best: Cont | null = null, bd = 1.5; for (const c of conts) { if (Math.abs(c.p[0] - player.pos.x) > 6 || Math.abs(c.p[1] - player.pos.z) > 6) continue; const d = contDist(c); if (d < bd) { bd = d; best = c; } } return best; }
function updateVis(c: Cont) { if (!c.vis || !c.init) return; for (const v of c.vis) { const init = c.init[v.item] || 1; v.im.count = Math.ceil(v.max * clamp((c.items[v.item] || 0) / init, 0, 1)); } }
function nearestDoor() { let best: Door | null = null, bd = 2.2; for (const d of doors) { const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z); if (x < bd) { bd = x; best = d; } } return best; }
function interact() { if (npcInteract()) return; const c = nearestCont(); const v = !c && vehicles.nearest(player.pos, 2.2); if (v) { log(v.kind === 'scooter' ? '這台機車沒鑰匙，載具系統下一版開放' : v.kind === 'truck' ? '佔領軍卡車，油箱上鎖（下一版可駕駛）' : '車門鎖住了（載具系統下一版開放）', '#ccc'); return; } if (c && /飲水機|流理台|廚房/.test(c.label)) { if (!UT.water) { log('水龍頭只流出幾滴…停水了。', '#e88'); } else if ((c as any).tapT === undefined || gameMin > (c as any).tapT) { (c as any).tapT = gameMin + 90; c.items.water = (c.items.water || 0) + 1; log('接了一瓶自來水。', '#9cf'); } } if (c) { curCont = c; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
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
  if (dangerNear()) { log('附近有佔領軍，現在睡太危險', '#f99'); return; } player.sleeping = true; log('你閉上眼睛…（時間快轉 ×20）', '#aaf'); renderSpeed();
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
    if (d.at) { fireAT(k, d, dir); return; }
    let hit: Sol | null = null, hd = d.range;
    for (const s of sols) { if (s.state === 'dead') continue; const to = s.pos.clone().sub(player.pos); const t = to.dot(dir); if (t < 0 || t > hd) continue; const perp = to.clone().sub(dir.clone().multiplyScalar(t)).length(); if (perp < 0.55 && los([player.pos.x, player.pos.z], [s.pos.x, s.pos.z])) { hit = s; hd = t; } }
    tracer(player.pos, player.pos.clone().add(dir.clone().multiplyScalar(hd)));
    if (hit) damageSol(hit, d.dmg * (0.8 + rnd() * 0.4), false);
    else if (armor) { for (const a of armor.list) { if (a.dead) continue; const to = a.g.position.clone().sub(player.pos); to.y = 0; const t = to.dot(dir); if (t > 0 && t < d.range && to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.2) { armor.hit(a.g.position.x, a.g.position.z, d.dmg, false); break; } } }
  } else {
    noise(player.pos.x, player.pos.z, d.noise);
    for (const s of sols) { if (s.state === 'dead') continue; const to = s.pos.clone().sub(player.pos); const dist = to.length(); if (dist > d.range + 0.3) continue; if (to.normalize().dot(dir) < 0.5) continue;
      const stealth = s.state !== 'combat' && s.alert < 0.5; damageSol(s, d.dmg * (stealth ? 3.2 : 1), stealth); break; }
  }
}
function damageSol(s: Sol, dmg: number, stealth: boolean) {
  s.hp -= dmg; if (stealth) log('偷襲！', '#ff9');
  if (s.hp <= 0) { s.state = 'dead'; s.cone.visible = false; player.kills++; log('擊倒一名佔領軍士兵', '#ffd76a');
    const it = plaDrop(s.id); const dc = makeCont('d' + s.id, [s.pos.x, s.pos.z], 'crate', undefined, it); dc.label = '士兵遺留裝備'; dropGun(dc, s.pos, it); checkSectors();
  } else { s.rig.hurtT = 0.35; s.rig.hurtSide = rnd() < 0.5 ? -1 : 1; s.stun = Math.max(s.stun || 0, 0.4); s.state = 'combat'; s.alert = 1; s.lastSeen = [player.pos.x, player.pos.z]; }
}
const liberated = new Set<number>();
function checkSectors(silent = false) {
  for (let i = 0; i < SX * SZ; i++) { if (liberated.has(i)) continue; const alive = sols.filter(s => s.sector === i && s.state !== 'dead').length; const total = sols.filter(s => s.sector === i).length; if (total > 0 && alive === 0) { liberated.add(i); if (!silent) log(`★ ${SECTOR_LABEL(i)} 街區已奪回！`, '#7fff7f'); } }
  rocCheck(silent);
}

// ---------- save ----------
const SAVE = 'defendtaipei-save-v1';
// ---------- story: utilities timeline (有電有水 → 斷電 → 斷水) ----------
const UT = { power: true, water: true, ev: {} as Record<string, 1> };
const POWER_OFF = 2 * 1440 + 19 * 60, WATER_OFF = 4 * 1440 + 7 * 60; // 第3天 19:00 斷電・第5天 07:00 斷水
const EV0 = 6 * 1440 + 6 * 60, EV1 = 7 * 1440 + 18 * 60; let evac: ReturnType<typeof buildEvacZone> | null = null;
const evacOpen = () => !UT.ev.ex && gameMin >= EV0 && gameMin < EV1;
function doEvac(mode: 'heli' | 'boat' = 'heli') {
  if (cine.on) return; if (mode === 'heli') UT.ev.ex = 1; save(); closePanel(); setSpeed(1); started = false; const items = Object.values(player.inv).reduce((a, b) => a + b, 0); const day = Math.floor(gameMin / 1440) + 1; const hh2 = String(Math.floor(gameMin % 1440 / 60)).padStart(2, '0') + ':' + String(Math.floor(gameMin % 60)).padStart(2, '0');
  playEvac(renderer, mode, () => { const d = document.createElement('div'); d.id = 'evacend'; d.innerHTML = `<h1>您已成功撤離至 福特號航空母艦（USS Gerald R. Ford, CVN-78）</h1><h2>另一個結局：你活了下來，把萬華的故事帶出去。（撤離路線：${mode === 'boat' ? '小艇・淡水河出海' : '直升機・河濱撤離區'}）</h2><table><tr><td>撤離路線</td><td>${mode === 'boat' ? '🚤 小艇（線人接應）' : '🚁 直升機'}</td></tr><tr><td>存活天數</td><td>${day} 天（第 ${day} 天 ${hh2}）</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${SX * SZ}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>攜帶物品</td><td>${items} 件</td></tr></table><div><button id=evcont>繼續留在萬華（奪回之路）</button><button id=evnew>新遊戲</button></div><p style="font-size:12px;color:#678;margin-top:18px">虛構作品・艦艇與直升機為通用低多邊形模型</p>`; document.body.appendChild(d); $('evcont').onclick = () => { d.remove(); started = true; log('你決定留下來，繼續奪回萬華。', '#ffd27a'); }; $('evnew').onclick = () => { localStorage.removeItem(SAVE); location.reload(); }; });
}
const STORY: { t: number; id: string; who: string; msg: string; fx?: () => void }[] = [
  { t: 8 * 60 + 5, id: 'a', who: '📱 國家級警報', msg: '萬華、中正一帶實施戒嚴，民眾非必要請勿外出。夜間 20:00 後宵禁。' },
  { t: 12 * 60, id: 'b', who: '📻 中廣（收音機）', msg: '…佔領當局宣稱「水電維持正常供應」，但多處變電所已遭接管…' },
  { t: 1440 + 9 * 60, id: 'c', who: '💬 里長 LINE 群組', msg: '各位鄰居：聽說台電員工被帶走了，大家趕快把水桶裝滿、手機充飽電！' },
  { t: 2 * 1440 + 14 * 60, id: 'd', who: '📱 台電簡訊', msg: '【停電通知】因「軍事管制」，萬華區即日起停止供電，復電時間未定。' },
  { t: POWER_OFF, id: 'P', who: '⚡ 斷電', msg: '整條街一瞬間暗了下來。冰箱停了，裡面的食物撐不了多久。', fx: () => { UT.power = false; } },
  { t: 3 * 1440 + 10 * 60, id: 'e', who: '📻 收音機（電池）', msg: '…自來水事業處人員已撤離，加壓站停擺，高樓層將最先停水…' },
  { t: 1440 + 7 * 60, id: 'r1', who: '📻 地下電台「自由之聲」', msg: '…這裡是自由之聲。國軍與志願者仍在新店溪南岸堅守，請萬華的鄉親保持冷靜、儲水、避開大馬路…' },
  { t: 2 * 1440 + 21 * 60, id: 'r2', who: '📻 地下電台「自由之聲」', msg: '…停電了？別慌。收音機用電池還能撐。宵禁時佔領軍會帶手電筒巡邏，看到光束就躲進騎樓…' },
  { t: 3 * 1440 + 13 * 60, id: 'r3', who: '📻 地下電台「自由之聲」', msg: '…注意！今天 15:00 前後會有一批物資空投到萬華，紅色煙霧就是信號。佔領軍也會去搶，動作要快！' },
  { t: 3 * 1440 + 15 * 60, id: 'AD', who: '🪂 空投', msg: '遠處升起一道紅色煙霧——物資箱落地了！佔領軍的巡邏隊正往那邊移動。', fx: () => airdrop() },
  { t: 4 * 1440 + 20 * 60, id: 'r4', who: '📻 地下電台「自由之聲」', msg: '…停水第一天。把水桶、臉盆放到頂樓或戶外，下雨就能接水。雨水記得煮過再喝…' },
  { t: 6 * 1440 + 12 * 60, id: 'r5', who: '📻 地下電台「自由之聲」', msg: '…西門町一帶已有三個街區被奪回！每一區的勝利，都讓他們更害怕…' },
  { t: 5 * 1440 + 20 * 60, id: 'e0', who: '📻 地下電台「自由之聲」', msg: '…有消息說，盟軍正在河濱準備一條撤離通道。明早請守在收音機旁…' },
  { t: EV0, id: 'e1', who: '📻 地下電台「自由之聲」', msg: '撤離窗口開啟！西側河濱撤離區（綠色 H、紅色信號彈）將有直升機接應，時限至第 8 天 18:00。想留下來奪回家園的人，我們也與你同在。', fx: () => slowDown('撤離廣播') },
  { t: EV1, id: 'e2', who: '📻 地下電台「自由之聲」', msg: '撤離窗口已關閉。留下來的人——台北靠你們奪回。' },
  { t: WATER_OFF, id: 'W', who: '🚱 停水', msg: '水龍頭只流出幾滴黃水就停了。從現在起，每一瓶水都很珍貴。', fx: () => { UT.water = false; } },
];
function phone(who: string, msg: string) { const el = $('phone'); el.innerHTML = `<b>${who}</b><br>${msg}`; el.classList.add('on'); clearTimeout((phone as any).t); (phone as any).t = setTimeout(() => el.classList.remove('on'), 9000); log(`${who}：${msg}`, '#9fd0ff'); }
let spoilT = 0;
const PERISH = ['bento', 'rice', 'oden', 'soymilk', 'milktea', 'danbing', 'chicken', 'sausage', 'egg'];
function updateStory(gm: number) {
  for (const e of STORY) if (gameMin >= e.t && !UT.ev[e.id]) { UT.ev[e.id] = 1; e.fx?.(); if (gameMin - e.t < 120) phone(e.who, e.msg); }
  if (gameMin >= POWER_OFF) UT.power = false; if (gameMin >= WATER_OFF) UT.water = false;
  if (!UT.power) { spoilT += gm; if (spoilT > 6) { spoilT = 0; for (const c of conts) if (/冷藏|櫃台|攤/.test(c.label)) for (const k of PERISH) if (c.items[k] && rnd() < 0.15) { c.items[k]--; if (!c.items[k]) delete c.items[k]; c.items.rotten = (c.items.rotten || 0) + 1; } } }
}
function save() { if (!started || dead) return; localStorage.setItem(SAVE, JSON.stringify({ g: player.gender, p: [player.pos.x, player.pos.z], hp: player.hp, hu: player.hunger, th: player.thirst, fa: player.fatigue, bl: player.bleed, inv: player.inv, eq: player.equip, k: player.kills, t: gameMin, dl: DAYH, wx: WX, ex: UT.ev.ex || 0, inf: INF, ut: UT, conts: conts.map(c => [c.id, c.items, c.p]), dead: sols.filter(s => s.state === 'dead').map(s => s.id), bar: doors.map((d, i) => d.barricaded ? i : -1).filter(i => i >= 0) })); }

// ---------- main loop ----------
let started = false, dead = false; const clock = new THREE.Clock(); let acc = 0, saveT = 0, streetT = 0;
function update(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t -= dt; if (fx[i].t <= 0) { scene.remove(fx[i].o); fx.splice(i, 1); } }
  if (dead && player.rig) animate(player.rig, 'death', 0, dt);
  for (const s of sols) if (s.state === 'dead' && s.rig.deadT < 1) animate(s.rig, 'death', 0, dt);
  if (evac) evac.update(dt, evacOpen());
  if (!started || dead) return;
  updateInformant(dt);
  if (evac && evacOpen() && Math.hypot(player.pos.x - evac.pos[0], player.pos.z - evac.pos[1]) < 5) doEvac();
  if (speed > 1 && dangerNear()) slowDown('佔領軍接近');
  if (player.sleeping && dangerNear()) slowDown('佔領軍接近');
  if (player.hp < lastHp - 2) slowDown('你受傷了'); lastHp = player.hp;
  const tscale = player.sleeping ? 20 : speed;
  gameMin += dt * tscale * MPS(); // day length chosen at new game (1h/2h/4h real per in-game day)
  const gm = dt * tscale * MPS() / 60; // game hours
  updateWeather(dt, gm);
  updateStory(gm); player.hunger -= gm * 2.2; player.thirst -= gm * 3.2; player.fatigue += player.sleeping ? -gm * 14 : gm * 2.6;
  if (player.sleeping && player.fatigue <= 0) { player.sleeping = false; log('你醒了', '#aaf'); renderSpeed(); }
  if (player.sleeping && sols.some(s => s.state === 'combat')) { player.sleeping = false; log('你被驚醒了！', '#f66'); }
  player.hunger = clamp(player.hunger, 0, 100); player.thirst = clamp(player.thirst, 0, 100); player.fatigue = clamp(player.fatigue, 0, 100);
  if (player.hunger <= 0 || player.thirst <= 0) player.hp -= gm * 8;
  if (player.bleed) player.hp -= dt * 0.6;
  if (player.hunger > 50 && player.thirst > 50 && !player.bleed) player.hp = Math.min(100, player.hp + gm * 6);
  if (player.hp <= 0) return die();
  vehicles.update(dt); if (armor && started) armor.update(dt); if (recon && started) recon.update(dt, performance.now() / 1000); if (roc && started) roc.update(dt); ROC.cd = Math.max(0, ROC.cd - dt); updateShells(dt);
  player.cd -= dt;
  // movement
  if (!player.sleeping && !fpv?.active) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(), r = new THREE.Vector3(1, 0, -1).normalize(); const mv = new THREE.Vector3();
    if (keys.KeyW) mv.add(f); if (keys.KeyS) mv.sub(f); if (keys.KeyD) mv.add(r); if (keys.KeyA) mv.sub(r);
    const jm = Math.min(1, Math.hypot(joy.x, joy.y)); if (jm > 0.12) { mv.addScaledVector(f, -joy.y).addScaledVector(r, joy.x); }
    const running = (keys.ShiftLeft || keys.ShiftRight || jm > 0.93) && !player.sneak && player.fatigue < 95;
    let sp = player.sneak ? 1.6 : running ? 6 : 3.4; if (jm > 0.12 && !running) sp *= Math.max(0.3, Math.min(1, (jm - 0.12) / 0.7)); if (player.fatigue > 80) sp *= 0.7; if (weight() > 12) sp *= 0.8;
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
  updateSmoke(dt);
  if (!plaFlash.length) for (let i = 0; i < 4; i++) { const L = new THREE.SpotLight(0xfff0d0, 0, 24, 0.32, 0.5, 1.2); scene.add(L, L.target); plaFlash.push(L); }
  { const nightNow = isNight(); const ns = nightNow ? sols.filter(s => s.state !== 'dead' && s.mesh.visible).map(s => [s, s.pos.distanceToSquared(player.pos)] as const).sort((a, b) => a[1] - b[1]).slice(0, 4) : [];
    plaFlash.forEach((L, i) => { const e = ns[i]; if (!e || e[1] > 1600) { L.intensity = 0; return; } const s = e[0]; L.position.set(s.pos.x, 1.5, s.pos.z); L.target.position.set(s.pos.x + Math.cos(s.dir) * 8, 0, s.pos.z + Math.sin(s.dir) * 8); L.intensity = 60; }); }
  const fogC = new THREE.Color(0x0c1220).lerp(new THREE.Color(0xa7b0b5), dayF).lerp(new THREE.Color(0x5a6068).multiplyScalar(0.3 + dayF * 0.7), WX.amt * 0.5); sun.intensity *= 1 - WX.amt * 0.55; (scene.fog as THREE.Fog).color.copy(fogC); renderer.setClearColor(fogC);
  hemi.color.setHSL(0.6, 0.5, 0.35 + dayF * 0.45);
  const PW = UT.power ? 1 : 0; if ((updateLamps as any).pw !== PW) { (updateLamps as any).pw = PW; setPower(!!PW); } updateLamps((1 - dayF) * PW, dt); decay?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z); facade?.update(1 - dayF, PW); alley?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z, PW); roadMat.roughness = 0.95 - (1 - dayF) * 0.55; roadMat.metalness = (1 - dayF) * 0.35;
  flash.intensity = player.light ? 60 : 0; flash.position.set(player.pos.x, 1.6, player.pos.z); flash.target.position.copy(aimPt);
  // camera
  camera.position.copy(player.pos).add(CAM_OFF); camera.lookAt(player.pos);
  // HUD
  saveT += dt; if (saveT > 20) { saveT = 0; save(); }
  streetT -= dt; if (streetT < 0) { streetT = 0.7; updateStreet(); }
  drawHud(inside);
}
let redT = 0; function flashRed() { redT = 0.25; renderer.domElement.style.filter = 'saturate(2) hue-rotate(-20deg) brightness(1.2)'; setTimeout(() => renderer.domElement.style.filter = '', 150); }
function updateStreet() { let best = '', bd = 25; for (const r of roads) { if (!r.n) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1; const t = clamp(((player.pos.x - ax) * dx + (player.pos.z - az) * dz) / l2, 0, 1); const d = Math.hypot(player.pos.x - ax - dx * t, player.pos.z - az - dz * t); if (d < bd) { bd = d; best = r.n; } } } const sec = sectorOf(player.pos.x, player.pos.z); $('street').textContent = `📍 ${best || '巷弄'}・${SECTOR_LABEL(sec)}區 ${liberated.has(sec) ? '（已奪回）' : '（佔領中）'}`; }
function bar(name: string, v: number, col: string) { return `<div class="bar"><div class="t"><span>${name}</span><span>${Math.round(v)}</span></div><div class="b"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></div></div>`; }
function drawHud(inside: Bld | null) {
  const m: string[] = []; if (player.hunger < 25) m.push('飢餓'); if (player.thirst < 25) m.push('口渴'); if (player.fatigue > 75) m.push('疲憊'); if (player.bleed) m.push('流血'); if (player.hp < 30) m.push('重傷'); if (player.sneak) m.push('潛行中'); if (player.sleeping) m.push('睡眠中'); if (sols.some(s => s.state === 'combat' && s.mesh.visible)) m.push('被追捕');
  $('stats').innerHTML = bar('生命', player.hp, '#c33') + bar('飽足', player.hunger, '#c9842a') + bar('水分', player.thirst, '#3a8ad6') + bar('精神', 100 - player.fatigue, '#8a6ad6') + `<div class="moodles">${m.map(x => `<span>${x}</span>`).join('')}</div>`;
  const day = Math.floor(gameMin / 1440) + 1, h = Math.floor(gameMin / 60) % 24, mi = Math.floor(gameMin) % 60;
  $('clock').textContent = `第 ${day} 天 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${isNight() ? '🌙 宵禁' : '☀'}${raining() ? ' 🌧' : ''}`;
  const alive = sols.filter(s => s.state !== 'dead').length;
  $('objective').textContent = `已奪回街區 ${liberated.size} / ${SX * SZ}｜殘存佔領軍 ${alive}` + (evacOpen() ? `｜🚁 撤離窗口剩 ${Math.floor((EV1 - gameMin) / 60)} 小時 ${Math.floor((EV1 - gameMin) % 60)} 分` : '');
  const eq = player.equip ? ITEMS[player.equip] : null; $('equip').innerHTML = `武器：<b>${eq ? eq.name : '徒手'}</b>${eq && eq.kind === 'gun' ? `　彈藥 ${player.inv[eq.ammo!] || 0}` : ''}　負重 ${weight().toFixed(1)}kg${player.light ? '　🔦' : ''}`;
  const c = nearestCont(), d = nearestDoor(); const pr = $('prompt');
  const np = npcPrompt(); if (np && !panelOpen) { pr.style.display = 'block'; pr.textContent = np; }
  else if (c && !panelOpen) { pr.style.display = 'block'; pr.textContent = `[E] 搜刮 ${c.label}${Object.keys(c.items).length ? '' : '（空）'}`; }
  else if (!panelOpen && vehicles.nearest(player.pos, 2.2)) { pr.style.display = 'block'; pr.textContent = '[E] 查看載具'; }
  else if (d && !panelOpen) { pr.style.display = 'block'; pr.textContent = d.barricaded ? '[B] 拆除封門' : '[B] 封門（鐵鎚+木板）'; }
  else pr.style.display = 'none';
}
function die() {
  dead = true; localStorage.removeItem(SAVE); closePanel();
  const t = $('title'); t.style.display = 'flex'; const day = Math.floor(gameMin / 1440) + 1;
  t.innerHTML = `<h1 style="color:#c33">你陣亡了</h1><h2>這就是你的結局。</h2><p>你在淪陷的台北撐過了 ${day} 天，擊倒 ${player.kills} 名佔領軍，奪回了 ${liberated.size} 個街區。</p><button onclick="location.reload()">重新開始（新的倖存者）</button>`;
}
function loop() { const dt = Math.min(clock.getDelta(), 0.05); if (cine.on) { requestAnimationFrame(loop); return; } if (rocCine) { rocCineStep(dt); renderer.render(scene, camera); requestAnimationFrame(loop); return; } update(dt); if (fpv?.active) { fpv.update(dt); if (fpv.active) fpv.render(renderer); else renderer.render(scene, camera); } else renderer.render(scene, camera); requestAnimationFrame(loop); }

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
  const want = ['market', 'store', 'pharmacy', 'grocery', 'hardware', 'breakfast', 'betel', 'grocery', 'hardware', 'store', 'breakfast', 'betel', 'pharmacy', 'grocery'];
  const KIND_SIGN: Record<string, string> = { store: 'store', pharmacy: 'pharmacy' };
  for (const k of want) { const cand = near.find(b => !b.detailed && (k === 'betel' ? area(b) < 120 : k === 'market' ? area(b) > 220 : area(b) > 50) && furnish(b, k, fx)); if (cand) { cand.detailed = k; cand.type = KIND_SIGN[k] || k; if (b2sign[k]) setSign(cand, k); } }
  for (const b of near.slice(0, 60)) if (!b.detailed && area(b) > 40 && furnish(b, 'home', fx)) b.detailed = 'home';
  // remove generic containers inside detailed buildings
  for (let i = conts.length - 1; i >= 0; i--) { const c = conts[i]; if (c.b && c.b.detailed && !c.id.startsWith('x')) { c.mesh.parent?.remove(c.mesh); conts.splice(i, 1); } }
  // night market on the nearest named mid-size road
  let bestR: any = null, bd = 1e9; for (const r of roads) { if (!['tertiary', 'residential', 'pedestrian', 'unclassified'].includes(r.t) || r.p.length < 2) continue; const d = Math.min(...r.p.map(p => Math.hypot(p[0] - start!.c[0], p[1] - start!.c[1]))); if (d < bd && d > 15) { bd = d; bestR = r; } }
  if (bestR) nightMarket(bestR.p, bestR.t === 'tertiary' ? 9 : 6, fx, 'nm');
  setupArmor(start!.c as V2);
  decay = buildDecay({ scene, rnd, pip, bldAt, addSeg: (q, low) => addSeg(q, low), merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 140, doors: doors.map(d => d.p) });
  checkpoints = decay.checkpoints; setupRecon(start!.c as V2); setupRoc();
  alley = buildAlley({ poles: decay.polePos, scene, rnd, pip, bldAt, addSeg: (q, low) => addSeg(q, low), merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 85, doors: doors.map(d => d.p) });
  facade = buildFacade({ scene, pip, bldAt, merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 110 }); console.log('facade', JSON.stringify(facade.stats)); parks = buildParks({ scene, bldAt, merge: mergeGeometries, addSeg: (q, low) => addSeg(q, low), roadDist, center: start.c, R: 110 }); console.log('parks', JSON.stringify(parks));
  // navigation grid (built after all collision geometry exists)
  nav = new Nav(start.c[0] - 170, start.c[1] - 170, start.c[0] + 170, start.c[1] + 170, 0.5); for (const q of segs) nav.markSeg(q.a, q.b, 1);
  spawnSoldiers(new Set(sv?.dead || []));
  scene.add(rainMesh);
  setupInformant(start.c as V2, !(sv && sv.inf));
  { let best: V2 | null = null; for (const r of roads) for (const q of r.p) if (Math.abs(q[1] - start.c[1]) < 250 && q[0] > bounds.minx + 8 && !bldAt(q[0], q[1]) && !bldAt(q[0] + 6, q[1]) && !bldAt(q[0] - 6, q[1]) && (!best || q[0] < best[0])) best = q; if (best) evac = buildEvacZone(scene, best[0], best[1]); }
  { let n = 0; for (let k = 0; k < 400 && n < 3; k++) { const a = k * 0.7, d = 4 + k * 0.08; const q: V2 = [start.c[0] + Math.cos(a) * d, start.c[1] + Math.sin(a) * d]; if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.6, q[1]) && !bldAt(q[0], q[1] + 0.6)) { makeBucket('rb' + n++, q); } } }
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
    if (load && sv) { player.pos.set(sv.p[0], 0, sv.p[1]);  Object.assign(player, { hp: sv.hp, hunger: sv.hu, thirst: sv.th, fatigue: sv.fa, bleed: sv.bl, inv: sv.inv, equip: sv.eq, kills: sv.k }); gameMin = sv.t; DAYH = sv.dl || 1; if (sv.wx) Object.assign(WX, sv.wx); if (sv.ex) UT.ev.ex = 1; if (sv.inf) INF = sv.inf; if (sv.ut) Object.assign(UT, sv.ut);
      const map = new Map<string, any>(sv.conts.map((c: any) => [c[0], c])); for (const c of conts) { const s = map.get(c.id); if (s) c.items = s[1]; map.delete(c.id); } map.forEach(c => String(c[0]).startsWith('pb') ? makeBucket(c[0], c[2], c[1]) : makeCont(c[0], c[2], 'crate', undefined, c[1])); (sv.bar || []).forEach((i: number) => doors[i] && setBarricade(doors[i])); checkSectors(true); conts.forEach(updateVis); }
    else { localStorage.removeItem(SAVE); }
    $('title').style.display = 'none'; started = true; lastHp = player.hp; startRainAudio(); { const sp = document.createElement('div'); sp.id = 'speed'; sp.innerHTML = '<span class="st"></span>' + SPEEDS.map((v, i) => `<button data-s="${v}" title="按 ${i + 1}">${v === 1 ? '▶' : v === 3 ? '⏩' : '⏭'} ×${v}</button>`).join('') + `<small>一天 = ${DAYH} 小時</small>`; sp.querySelectorAll('button').forEach(b => (b as HTMLElement).onclick = () => setSpeed(+(b as HTMLElement).dataset.s!)); $('topright').appendChild(sp); renderSpeed(); } log('十月某日清晨，解放軍登陸後三天，台北淪陷。萬華的電燈還亮著，水龍頭還有水——但能撐多久？', '#ffd76a'); log('提示：先搜刮身邊的櫥櫃（E），按 Tab 開背包裝備菜刀。', '#ccc');
  };
  if (sv) { const b = document.createElement('button'); b.textContent = '繼續遊戲'; b.onclick = () => go(true); btns.appendChild(b); }
  const sel = document.createElement('div'); sel.id = 'charsel';
  sel.innerHTML = `<div class="ch" data-g="m"><div class="pv m"></div><b>阿明</b><small>男・32 歲・前外送員<br>熟悉萬華每條巷子</small></div><div class="ch" data-g="f"><div class="pv f"></div><b>小雯</b><small>女・27 歲・護理師<br>懂得包紮與急救</small></div>`;
  sel.querySelectorAll('.ch').forEach(el => (el as HTMLElement).onclick = () => { const g = (el as HTMLElement).dataset.g!; go(false, g); if (g === 'f') { player.inv.bandage = (player.inv.bandage || 0) + 2; } else { player.inv.coffee = 1; } });
  const dl = document.createElement('div'); dl.id = 'daylen'; dl.innerHTML = '<span>新遊戲・一天長度（現實時間）：</span>' + [1, 2, 4].map(x => `<button data-h="${x}" class="${x === 1 ? 'on' : ''}">${x} 小時${x === 1 ? '（預設）' : ''}</button>`).join('');
  dl.querySelectorAll('button').forEach(b => (b as HTMLElement).onclick = () => { DAYH = +(b as HTMLElement).dataset.h!; dl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  const h = document.createElement('div'); h.className = 'selh'; h.textContent = sv ? '或建立新的倖存者：' : '選擇你的倖存者：'; btns.appendChild(h); btns.appendChild(dl); btns.appendChild(sel);
  camera.position.copy(player.pos).add(CAM_OFF); camera.lookAt(player.pos);
  addEventListener('beforeunload', save);
  (window as any).__game = { player, sols, blds, conts, nav, started: () => started, go, vehicles, decay: () => decay, alley: () => alley, facade: () => facade, setSpeed, speed: () => speed, WX, airdrop, makeBucket, noise, dayh: () => DAYH, evac: () => evac && evac.pos, evacOpen, doEvac, INF: () => INF, RV: () => RV, infPos: () => infPos, elderPos: () => elderPos, npcInteract, verifyInf, setMin: (m: number) => { gameMin = m; }, parks: () => parks, simRain: (h: number) => { for (let i = 0; i < h * 20; i++) updateWeather(0.05, 0.05); }, camera, CAM_OFF, setTime: (m: number) => { gameMin = m; }, UT, start: () => start!.c, scene, gm: () => gameMin, tp: (x: number, z: number) => player.pos.set(x, 0, z), damageSol, toggleInv, addItem, armor: () => armor, fpv: () => fpv, recon: () => recon, ROC, roc: () => roc, useItem, testAT: (k: string) => { const a = armor!.list.find(a => !a.dead)!; const dir = a.g.position.clone().sub(player.pos).setY(0).normalize(); fireAT(k, ITEMS[k], dir); return a.hp; }, callSupport, rocCheck, liberate: (n: number) => { for (let i = 0; i < SX * SZ && liberated.size < n; i++) if (!liberated.has(i)) { for (const q of sols) if (q.sector === i) { q.state = 'dead'; q.hp = 0; q.mesh.visible = false; } liberated.add(i); } rocCheck(false); }, lastBlast: () => lastBlast, shells, launchFPV, blast, sim: (n: number, dt = 0.05) => { for (let i = 0; i < n; i++) { update(dt); if (fpv?.active) fpv.update(dt); } }, roadPt: () => { let best: V2 = [player.pos.x, player.pos.z], bd = 1e9; for (const r of roads) if (/primary|secondary|tertiary/.test(r.t)) for (const q of r.p) { const d = Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z); if (d < bd && d > 8 && !bldAt(q[0], q[1])) { bd = d; best = q; } } return best; }, checkpoints: () => checkpoints };
}
boot().catch(e => { console.error(e); $('loadmsg').textContent = '載入失敗：' + e; });
loop();
