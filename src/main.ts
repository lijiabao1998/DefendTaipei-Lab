import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, LOOT } from './items';

// ---------- utils ----------
let seed = 20261024;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const $ = (id: string) => document.getElementById(id)!;
type V2 = [number, number];
type Seg = { a: V2; b: V2; door?: Door };
type Door = { b: Bld; p: V2; a: V2; c: V2; barricaded: boolean; seg?: Seg; mesh?: THREE.Mesh };
type Bld = { id: number; pts: V2[]; h: number; type: string; group: THREE.Group; walls: THREE.Mesh; roof: THREE.Group; door?: Door; c: V2; minx: number; maxx: number; minz: number; maxz: number };
type Cont = { id: string; p: V2; items: Record<string, number>; label: string; mesh: THREE.Object3D; b?: Bld };

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
const wallTexs = WALLC.map(col => canvasTex(128, 128, c => {
  c.fillStyle = col; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; c.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
  c.fillStyle = 'rgba(60,50,40,.25)'; c.fillRect(0, 120, 128, 8); // stain
  // window with iron bars (鐵窗)
  c.fillStyle = '#2b3540'; c.fillRect(30, 26, 68, 56); c.fillStyle = '#56708a'; c.fillRect(34, 30, 60, 48);
  c.strokeStyle = '#3d3d3d'; c.lineWidth = 3; c.strokeRect(26, 22, 76, 64);
  c.lineWidth = 2; for (let x = 32; x < 100; x += 8) { c.beginPath(); c.moveTo(x, 22); c.lineTo(x, 86); c.stroke(); }
  c.beginPath(); c.moveTo(26, 54); c.lineTo(102, 54); c.stroke();
  c.fillStyle = '#777'; c.fillRect(70, 90, 24, 12); // AC unit
}));
const wallMats = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
const wallMatsT = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }));
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 1, side: THREE.DoubleSide });
const tinMat = new THREE.MeshStandardMaterial({ color: 0x7f9fb0, roughness: 0.6, metalness: 0.3 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 });
const floorMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, c => { c.fillStyle = '#b9ad98'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#8f8572'; c.strokeRect(0, 0, 32, 32); c.strokeRect(32, 32, 32, 32); c.strokeRect(0, 32, 32, 32); c.strokeRect(32, 0, 32, 32); }), side: THREE.DoubleSide });
const roadTex = canvasTex(64, 64, c => { c.fillStyle = '#3c3e41'; c.fillRect(0, 0, 64, 64); for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } });
const groundTex = canvasTex(128, 128, c => { c.fillStyle = '#7d7a70'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#6b685f'; for (let i = 0; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 128); c.moveTo(0, i); c.lineTo(128, i); c.stroke(); } });

// ---------- world state ----------
const blds: Bld[] = []; const segs: Seg[] = []; const conts: Cont[] = []; const doors: Door[] = [];
const roads: { p: V2[]; t: string; n: string }[] = [];
const CELL = 8; const grid = new Map<string, Seg[]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
function addSeg(s: Seg) { segs.push(s); const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), z0 = Math.min(s.a[1], s.b[1]), z1 = Math.max(s.a[1], s.b[1]); for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)!).push(s); } }
function removeSeg(s: Seg) { grid.forEach(a => { const i = a.indexOf(s); if (i >= 0) a.splice(i, 1); }); }
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
  const RW: Record<string, number> = { primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.5 };
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
  const roadMesh = new THREE.Mesh(mergeGeometries(rg), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 })); roadMesh.receiveShadow = true; scene.add(roadMesh);
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
          sg.position.set(mid[0] + nx * 0.2, 3.0, mid[1] + nz * 0.2); sg.lookAt(mid[0] + nx * 5, 3.0, mid[1] + nz * 5); group.add(sg);
        }
      } else { wallBox(a, c, 0, h); addSeg({ a, b: c }); }
    }
    const mi = id % wallMats.length; (b as any).mi = mi;
    b.walls = new THREE.Mesh(mergeGeometries(wg), wallMats[mi]); b.walls.castShadow = true; b.walls.receiveShadow = true; group.add(b.walls);
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const rgeo = new THREE.ShapeGeometry(shape); rgeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(rgeo, roofMat); roof.position.y = h; roof.castShadow = true; b.roof.add(roof);
    const fl = new THREE.Mesh(rgeo, floorMat); fl.position.y = 0.03; fl.receiveShadow = true; group.add(fl);
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
  // street lamps / scooters for flavor
  const scooterG: THREE.BufferGeometry[] = [];
  for (const r of roads) if ((RW[r.t] ?? 3) >= 6) for (let i = 0; i < r.p.length - 1; i++) if (rnd() < 0.35) {
    const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const t = rnd(); const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const w = (RW[r.t] ?? 6) / 2 - 0.6; const ang = Math.atan2(bz - az, bx - ax); const nx = -Math.sin(ang), nz = Math.cos(ang);
    for (let k = 0; k < 3; k++) { const g = new THREE.BoxGeometry(0.5, 0.8, 1.6); g.rotateY(-ang + Math.PI / 2); g.translate(x + nx * w + Math.cos(ang) * k * 0.7, 0.4, z + nz * w + Math.sin(ang) * k * 0.7); scooterG.push(g); }
  }
  if (scooterG.length) { const sm = new THREE.Mesh(mergeGeometries(scooterG), new THREE.MeshStandardMaterial({ color: 0x9a3030, roughness: 0.5 })); sm.castShadow = true; scene.add(sm); }
}

// ---------- characters ----------
function makeHuman(body: number, head = 0xe0b08a, helmet?: number) {
  const g = new THREE.Group(); const m = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 8), m(body)); torso.position.y = 1.05; g.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.26), m(0x2a2a30)); legs.position.y = 0.38; g.add(legs);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m(head)); hd.position.y = 1.62; g.add(hd);
  if (helmet) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(helmet)); h.position.y = 1.66; g.add(h); }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.8), m(0x1a1a1a)); gun.position.set(0.25, 1.05, 0.35); gun.visible = !!helmet; g.add(gun); (g as any).gun = gun;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; }); scene.add(g); return g;
}

const player = {
  mesh: null as any as THREE.Group, pos: new THREE.Vector3(), hp: 100, hunger: 85, thirst: 85, fatigue: 10, bleed: false,
  inv: { water: 1, noodle: 1 } as Record<string, number>, equip: '' as string, sneak: false, cd: 0, kills: 0, sleeping: false, light: false,
};
type Sol = { id: number; mesh: THREE.Group; pos: THREE.Vector3; hp: number; route: V2[]; wi: number; dir: number; state: 'patrol' | 'investigate' | 'combat' | 'dead'; target?: V2; alert: number; timer: number; cd: number; sector: number; cone: THREE.Mesh; night: boolean; lastSeen?: V2 };
const sols: Sol[] = [];
const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 5, Math.PI * 2 / 5); coneGeo.rotateX(-Math.PI / 2); coneGeo.rotateY(Math.PI / 2);
function spawnSoldiers(dead: Set<number>) {
  const big = roads.filter(r => r.p.length >= 3 && r.t !== 'footway');
  for (let i = 0; i < 64; i++) {
    const r = pick(big); const s0 = Math.floor(rnd() * (r.p.length - 1)); const route = r.p.slice(Math.max(0, s0 - 3), s0 + 4) as V2[];
    const night = i >= 48;
    const mesh = makeHuman(0x4d5a35, 0xd9a87e, 0x3f4a2c);
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false })); cone.position.y = 0.06; scene.add(cone);
    const p = route[0]; const s: Sol = { id: i, mesh, pos: new THREE.Vector3(p[0], 0, p[1]), hp: 100, route, wi: 1, dir: 0, state: 'patrol', alert: 0, timer: 0, cd: 0, sector: sectorOf(p[0], p[1]), cone, night };
    if (dead.has(i)) { s.state = 'dead'; s.hp = 0; mesh.visible = false; cone.visible = false; }
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
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Tab') { e.preventDefault(); toggleInv(); } if (!started) return; if (e.code === 'KeyC') { player.sneak = !player.sneak; log(player.sneak ? '進入潛行' : '解除潛行'); } if (e.code === 'KeyE') interact(); if (e.code === 'KeyI') toggleInv(); if (e.code === 'KeyB') barricade(); if (e.code === 'KeyZ') sleep(); if (e.code === 'KeyF') { player.light = !player.light; } if (e.code === 'Escape') closePanel(); });
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
  for (const [k, n] of Object.entries(player.inv)) { const d = ITEMS[k]; const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span>${d.name}${player.equip === k ? ' ★' : ''} ×${n}</span><small>${{ food: '食用', drink: '飲用', med: '治療', melee: '裝備', gun: '裝備', ammo: '彈藥', tool: '工具' }[d.kind]}</small>`; e.onclick = () => useItem(k); inv.appendChild(e); }
  if (!Object.keys(player.inv).length) inv.innerHTML += '<small>空的</small>';
  if (curCont) {
    const c = col(curCont.label); const cc = curCont;
    for (const [k, n] of Object.entries(cc.items)) { const e = document.createElement('div'); e.className = 'it'; e.innerHTML = `<span>${ITEMS[k].name} ×${n}</span><small>拿取</small>`; e.onclick = () => take(cc, k); c.appendChild(e); }
    if (!Object.keys(cc.items).length) c.innerHTML += '<small>已經搜刮一空</small>';
    const b = document.createElement('button'); b.textContent = '全部拿取'; b.onclick = () => { for (const k of Object.keys(cc.items)) take(cc, k, true); renderPanel(); }; c.appendChild(b);
  }
  const close = document.createElement('button'); close.textContent = '關閉 (Esc)'; close.onclick = closePanel; p.lastElementChild!.appendChild(close);
}
function take(c: Cont, k: string, all = false) { const n = all ? c.items[k] : (ITEMS[k].kind === 'ammo' ? c.items[k] : 1); if (weight() + ITEMS[k].w * n > 15) { log('背包太重了', '#f99'); return; } addItem(k, n); c.items[k] -= n; if (c.items[k] <= 0) delete c.items[k]; if (!all) renderPanel(); }
function toggleInv() { if (!started) return; if (panelOpen) closePanel(); else { curCont = null; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
function closePanel() { panelOpen = false; curCont = null; $('panel').classList.add('hidden'); }

function nearestCont() { let best: Cont | null = null, bd = 1.8; for (const c of conts) { const d = Math.hypot(c.p[0] - player.pos.x, c.p[1] - player.pos.z); if (d < bd) { bd = d; best = c; } } return best; }
function nearestDoor() { let best: Door | null = null, bd = 2.2; for (const d of doors) { const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z); if (x < bd) { bd = x; best = d; } } return best; }
function interact() { const c = nearestCont(); if (c) { curCont = c; panelOpen = true; $('panel').classList.remove('hidden'); renderPanel(); } }
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
function playerAttack() {
  const k = player.equip; const d = k ? ITEMS[k] : { dmg: 8, range: 1.1, noise: 2, cd: 0.5, kind: 'melee' } as any;
  if (player.cd > 0) return; player.cd = d.cd;
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
  if (s.hp <= 0) { s.state = 'dead'; s.mesh.rotation.z = Math.PI / 2; s.mesh.position.y = 0.3; s.cone.visible = false; player.kills++; log('擊倒一名佔領軍士兵', '#ffd76a');
    const it: Record<string, number> = { a556: 5 + Math.floor(rnd() * 20) }; if (rnd() < 0.3) it.rifle = 1; if (rnd() < 0.5) it.ration = 1; if (rnd() < 0.3) it.bandage = 1;
    makeCont('d' + s.id, [s.pos.x, s.pos.z], 'crate', undefined, it); checkSectors();
  } else { s.state = 'combat'; s.alert = 1; s.lastSeen = [player.pos.x, player.pos.z]; }
}
const liberated = new Set<number>();
function checkSectors(silent = false) {
  for (let i = 0; i < SX * SZ; i++) { if (liberated.has(i)) continue; const alive = sols.filter(s => s.sector === i && s.state !== 'dead').length; const total = sols.filter(s => s.sector === i).length; if (total > 0 && alive === 0) { liberated.add(i); if (!silent) log(`★ ${SECTOR_LABEL(i)} 街區已解放！`, '#7fff7f'); } }
}

// ---------- save ----------
const SAVE = 'defendtaipei-save-v1';
function save() { if (!started || dead) return; localStorage.setItem(SAVE, JSON.stringify({ p: [player.pos.x, player.pos.z], hp: player.hp, hu: player.hunger, th: player.thirst, fa: player.fatigue, bl: player.bleed, inv: player.inv, eq: player.equip, k: player.kills, t: gameMin, conts: conts.map(c => [c.id, c.items, c.p]), dead: sols.filter(s => s.state === 'dead').map(s => s.id), bar: doors.map((d, i) => d.barricaded ? i : -1).filter(i => i >= 0) })); }

// ---------- main loop ----------
let started = false, dead = false; const clock = new THREE.Clock(); let acc = 0, saveT = 0, streetT = 0;
function update(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t -= dt; if (fx[i].t <= 0) { scene.remove(fx[i].o); fx.splice(i, 1); } }
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
  player.cd -= dt;
  // movement
  if (!player.sleeping) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(), r = new THREE.Vector3(1, 0, -1).normalize(); const mv = new THREE.Vector3();
    if (keys.KeyW) mv.add(f); if (keys.KeyS) mv.sub(f); if (keys.KeyD) mv.add(r); if (keys.KeyA) mv.sub(r);
    const running = (keys.ShiftLeft || keys.ShiftRight) && !player.sneak && player.fatigue < 95;
    let sp = player.sneak ? 1.6 : running ? 6 : 3.4; if (player.fatigue > 80) sp *= 0.7; if (weight() > 12) sp *= 0.8;
    if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(sp * dt); player.pos.add(mv); collide(player.pos, 0.35); if (running) { player.fatigue += dt * 0.25; acc += dt; if (acc > 0.5) { acc = 0; noise(player.pos.x, player.pos.z, 11); } } else if (!player.sneak) { acc += dt; if (acc > 1) { acc = 0; noise(player.pos.x, player.pos.z, 3.5); } } }
    ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(plane, aimPt);
    player.mesh.rotation.y = Math.atan2(aimPt.x - player.pos.x, aimPt.z - player.pos.z);
    if (clicking && !panelOpen) playerAttack();
  }
  player.mesh.position.copy(player.pos); player.mesh.scale.y = player.sneak ? 0.8 : 1; (player.mesh as any).gun.visible = !!player.equip;
  // buildings cutaway
  const inside = bldAt(player.pos.x, player.pos.z);
  for (const b of blds) {
    const dx = b.c[0] - player.pos.x, dz = b.c[1] - player.pos.z; const near = Math.abs(dx) < 40 && Math.abs(dz) < 40;
    const front = near && (dx + dz) > -4 && (dx + dz) < 30 && Math.abs(dx - dz) < 22 && b.h > 4;
    const mi = (b as any).mi; b.walls.material = (front || b === inside) ? wallMatsT[mi] : wallMats[mi]; b.roof.visible = b !== inside && !front; b.walls.scale.y = b === inside ? 0.12 : 1;
  }
  // soldiers
  const night = isNight(); const pp: V2 = [player.pos.x, player.pos.z];
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
        if (s.cd <= 0) { s.cd = 1.1 + rnd() * 0.6; noise(s.pos.x, s.pos.z, 40); const hitP = (0.55 - dist / 60) * (player.sneak ? 0.7 : 1) * (night ? 0.7 : 1);
          const miss = new THREE.Vector3(player.pos.x + (rnd() - 0.5) * 3, 0, player.pos.z + (rnd() - 0.5) * 3); tracer(s.pos, rnd() < hitP ? player.pos : miss);
          if (rnd() < hitP) { player.hp -= 10 + rnd() * 12; if (rnd() < 0.45 && !player.bleed) { player.bleed = true; log('你中彈流血了！用繃帶止血', '#f66'); } else log('你被擊中了！', '#f66'); flashRed(); } }
      } else if (s.lastSeen) { goal = s.lastSeen; sp = 3.2; if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1.2) { s.lastSeen = undefined; s.state = 'investigate'; s.target = [s.pos.x + (rnd() - .5) * 10, s.pos.z + (rnd() - .5) * 10]; s.timer = 12; s.alert = 0.5; } }
      else { s.state = 'investigate'; s.target = [s.pos.x, s.pos.z]; s.timer = 8; }
    }
    if (goal) { const gx = goal[0] - s.pos.x, gz = goal[1] - s.pos.z; const gl = Math.hypot(gx, gz); if (gl > 0.3) { const td = Math.atan2(gz, gx); let dd = Math.atan2(Math.sin(td - s.dir), Math.cos(td - s.dir)); s.dir += clamp(dd, -dt * 5, dt * 5); s.pos.x += gx / gl * sp * dt; s.pos.z += gz / gl * sp * dt; collide(s.pos, 0.35); } }
    s.mesh.position.copy(s.pos); s.mesh.rotation.y = Math.PI / 2 - s.dir;
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
  spawnSoldiers(new Set(sv?.dead || []));
  player.mesh = makeHuman(0x2f5f8a, 0xe0b08a);
  // start inside a home near Ximending (north-east-ish)
  const homes = blds.filter(b => b.door && b.type === 'home' && sectorOf(b.c[0], b.c[1]) === 4);
  const start = homes.length ? homes[Math.floor(homes.length / 2)] : blds.find(b => b.door)!;
  const sp = start.door!.p; const ip: V2 = [sp[0] + (start.c[0] - sp[0]) * 0.3, sp[1] + (start.c[1] - sp[1]) * 0.3];
  player.pos.set(ip[0], 0, ip[1]);
  if (!sv) { makeCont('start', [ip[0] + 0.5, ip[1] + 0.5], 'home', start, { knife: 1, water: 1, plank: 2, hammer: 1, bandage: 1 }); }
  // move soldiers away from start
  for (const s of sols) if (s.state !== 'dead' && s.pos.distanceTo(player.pos) < 25) { s.pos.x += 40; }
  checkSectors(true);
  const btns = $('btns'); $('loadmsg').textContent = `地圖：萬華・西門町（${blds.length} 棟建築，${roads.length} 條街道）`;
  const go = (load: boolean) => {
    if (load && sv) { player.pos.set(sv.p[0], 0, sv.p[1]); Object.assign(player, { hp: sv.hp, hunger: sv.hu, thirst: sv.th, fatigue: sv.fa, bleed: sv.bl, inv: sv.inv, equip: sv.eq, kills: sv.k }); gameMin = sv.t;
      const map = new Map<string, any>(sv.conts.map((c: any) => [c[0], c])); for (const c of conts) { const s = map.get(c.id); if (s) c.items = s[1]; map.delete(c.id); } map.forEach(c => makeCont(c[0], c[2], 'crate', undefined, c[1])); (sv.bar || []).forEach((i: number) => doors[i] && setBarricade(doors[i])); checkSectors(true); }
    else { localStorage.removeItem(SAVE); }
    $('title').style.display = 'none'; started = true; log('解放軍已佔領台北。活下去，把他們趕出萬華。', '#ffd76a'); log('提示：先搜刮身邊的櫥櫃（E），按 Tab 開背包裝備菜刀。', '#ccc');
  };
  if (sv) { const b = document.createElement('button'); b.textContent = '繼續遊戲'; b.onclick = () => go(true); btns.appendChild(b); }
  const n = document.createElement('button'); n.textContent = sv ? '新的倖存者' : '開始'; n.onclick = () => go(false); btns.appendChild(n);
  camera.position.copy(player.pos).add(CAM_OFF); camera.lookAt(player.pos);
  addEventListener('beforeunload', save);
  (window as any).__game = { player, sols, blds, started: () => started, go };
}
boot().catch(e => { console.error(e); $('loadmsg').textContent = '載入失敗：' + e; });
loop();
