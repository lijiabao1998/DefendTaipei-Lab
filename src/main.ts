// Main game module: renderer, world state, the gameplay systems that share it, the main loop and boot.
// Self-contained pieces live in their own files (textures, geom, world, portrait, pla-loot, joystick) and so do
// the bigger systems (armor, drive, roads, traffic, roc, fpv, map, interiors, decay, alley, ...).
// Sections, in order (search for "// ----------"):
//   utils · renderer · world state (collision grid, line of sight) · sectors · build map · FPV + recon drones ·
//   國軍 support · PLA armour · street lamps · characters · player role / vehicles / road tiles / traffic ·
//   multiplayer glue · weather · airdrop · 線人 informant · curfew flashlights · time system, noise, log ·
//   effects · input · inventory UI · combat · save · story timeline · main loop + HUD · prologue · boot
// Test/debug hooks are exposed on window.__game at the end of boot().
import { buildEvacZone, playEvac, cine } from './evac';
import * as THREE from 'three';
import { buildFacade } from './facade';
import { buildParks } from './park';
import { ArmorSystem, type ArmorKind } from './armor';
import { Recon, boom } from './drone';
import { SPEC, DriveSystem, type DKind } from './drive';
import { ROLES, roleById, type Role } from './roles';
import type { FPV } from './fpv';
import type { GameMap } from './map';
import { RocSystem, ROC_NAME, type RocKind } from './roc';
import { placeRooftop, dressRoof, pickRoofMat, setShackNight, roofClass, roofStats } from './rooftin';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, LOOT } from './items';
import { iconURL, iconMat } from './icons';
import { GF, FH, ARC, arcadeFits, buildArcade, flushArcades, setArcadeDeps, arcadeAudit } from './arcade';
import { makeRig, animate, setWeapon, setLodFocus, Rig, AnimState } from './human';
import { Nav, smooth } from './nav';
import { RoadTiles } from './roads';
import { Traffic } from './traffic';
import { rolePortrait } from './portrait';
import { type V2, type Seg, type Door, type Bld, type Cont, ROADW } from './world';
import { clamp, pip, area, segInter, segX } from './geom';
import {
  canvasTex,
  wallMats,
  wallMatsT,
  tinMat,
  tankMat,
  floorMat,
  roadTex,
  groundTex,
  roadMat,
  groundMat,
  signTex,
  b2sign,
  extraSign,
  shopSignTex,
  contMat,
} from './textures';
import { plaDrop } from './pla-loot';
import { joy, initJoystick } from './joystick';
import {
  buildMetro,
  ensureInterior,
  metroTick,
  metroStats,
  svc,
  stationOrigin,
  pryLoot,
  setPried,
  type Shop,
  type Station,
} from './metro';
import * as SV from './survival';
import { VehicleSystem, VehicleKind } from './vehicles';
import { furnish, nightMarket, setPower } from './interiors';
import { buildDecay } from './decay';
import { buildAlley } from './alley';
import { updateOcclusion, OCC } from './occlusion';
import { lotTex } from './paving';
import { walkH } from './roads';
import { dressWalkup, District, type TileInfo } from './district';
import { SET, QPIX, isKey, K, keyLabel, markMusic, vibrate } from './settings';
import { openSettings, openHelp, openAbout, modalOpen, closeModal } from './menu';

// ---------- utils ----------
let seed = 20261024;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const $ = (id: string) => document.getElementById(id)!;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const MOBILE =
  matchMedia('(pointer: coarse)').matches ||
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0 ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
if (MOBILE) document.body.classList.add('mobile');
{
  // v21.5.1 portrait layout flag (title screen + HUD), follows rotation / resize
  const pq = matchMedia('(orientation: portrait)');
  const pu = () => document.body.classList.toggle('portrait', MOBILE && pq.matches);
  pu();
  addEventListener('resize', pu);
  pq.addEventListener?.('change', pu);
}
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? Math.min(1.25, QPIX[SET.quality]) : QPIX[SET.quality]));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9aa4ac, 60, 160);
let zoom = 1;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
function resize() {
  const a = innerWidth / innerHeight,
    s = (MOBILE && a < 1 ? Math.max(22, 16 / a) * 0.62 : 22) / zoom;
  camera.left = -s * a;
  camera.right = s * a;
  camera.top = s;
  camera.bottom = -s;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
const CAM_OFF = new THREE.Vector3(40, 56, 40);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const flash = new THREE.SpotLight(0xfff2cc, 0, 26, 0.5, 0.5, 1.2);
scene.add(flash, flash.target);
// ---------- world state ----------
const blds: Bld[] = [];
const segs: Seg[] = [];
const conts: Cont[] = [];
const doors: Door[] = [];
const roads: { p: V2[]; t: string; n: string }[] = [];
const CELL = 8;
const grid = new Map<string, Seg[]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
let nav: Nav | null = null;
// v21: hand-built core = the original 1.1 × 1.0 km bbox (西門町–龍山寺); the rest of 萬華區 streams via district.ts
const CORE = { minx: -555, maxx: 555, minz: -497, maxz: 497 };
const inCore = (x: number, z: number) => x > CORE.minx && x < CORE.maxx && z > CORE.minz && z < CORE.maxz;
const district = new District({
  scene,
  base: import.meta.env.BASE_URL,
  addSeg: s => addSeg(s as Seg),
  removeSeg: s => removeSeg(s as Seg),
  inCore,
  onLoad: t => onTileLoad(t),
  onUnload: k => onTileUnload(k),
});
function roadDist(x: number, z: number) {
  let best = 1e9;
  if (district?.ix && (x < CORE.minx + 40 || x > CORE.maxx - 40 || z < CORE.minz + 40 || z > CORE.maxz - 40))
    best = district.roadDist(x, z);
  for (const r of roads) {
    const hw = (ROADW[r.t.replace('_link', '')] ?? 3) / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az,
        l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - hw;
      if (d < best) best = d;
    }
  }
  return best;
}
function addSeg(s: Seg, low = false) {
  if (low) s.low = true;
  if (low && s.h == null) s.h = 1.0; // sandbags / jersey barriers / hedges: chest-high cover
  segs.push(s);
  nav?.markSeg(s.a, s.b, 1);
  const x0 = Math.min(s.a[0], s.b[0]),
    x1 = Math.max(s.a[0], s.b[0]),
    z0 = Math.min(s.a[1], s.b[1]),
    z1 = Math.max(s.a[1], s.b[1]);
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++)
    for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      const k = x + ',' + z;
      (grid.get(k) || grid.set(k, []).get(k)!).push(s);
    }
}
function removeSeg(s: Seg) {
  nav?.markSeg(s.a, s.b, -1);
  const x0 = Math.min(s.a[0], s.b[0]),
    x1 = Math.max(s.a[0], s.b[0]),
    z0 = Math.min(s.a[1], s.b[1]),
    z1 = Math.max(s.a[1], s.b[1]);
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++)
    for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      const a = grid.get(x + ',' + z);
      const i = a ? a.indexOf(s) : -1;
      if (i >= 0) a!.splice(i, 1);
    }
  const j = segs.indexOf(s);
  if (j >= 0) segs.splice(j, 1);
}
function nearSegs(x: number, z: number) {
  const out = new Set<Seg>();
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const a = grid.get(cx + i + ',' + (cz + j));
      if (a) a.forEach(s => out.add(s));
    }
  return out;
}
function los(p: V2, q: V2) {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.ceil(d / (CELL * 0.5)) + 1;
  const seen = new Set<Seg>();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = grid.get(gk(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t));
    if (!a) continue;
    for (const s of a) {
      if (seen.has(s)) continue;
      seen.add(s);
      if (segInter(p, q, s.a, s.b)) return false;
    }
  }
  return true;
}
// ---------- v21.4 cover shooting ----------
// Bullets are a 2-D ray against the wall/cover segments with a height: walls (h undefined) always stop it, cover
// (cars 1.45 m, sandbags / barriers / hedges 1 m, trunks) only where the ray passes below its top. Cover within `own`
// metres of the shooter is ignored (you fire over / lean around your own cover). Returns the clear fraction (1 = hit).
function shotRay(p: V2, q: V2, ys: number, yt: number, own = 1.0) {
  const dx = q[0] - p[0],
    dz = q[1] - p[1];
  const d = Math.hypot(dx, dz) || 1;
  const n = Math.ceil(d / (CELL * 0.5)) + 1;
  const seen = new Set<Seg>();
  let best = 1;
  for (let i = 0; i <= n; i++) {
    const a = grid.get(gk(p[0] + dx * (i / n), p[1] + dz * (i / n)));
    if (!a) continue;
    for (const s of a) {
      if (seen.has(s)) continue;
      seen.add(s);
      const ex = s.b[0] - s.a[0],
        ez = s.b[1] - s.a[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s.a[0] - p[0]) * ez - (s.a[1] - p[1]) * ex) / den,
        u = ((s.a[0] - p[0]) * dz - (s.a[1] - p[1]) * dx) / den;
      if (t < 0 || t > best || u < 0 || u > 1 || t * d < own) continue;
      if (s.h != null && ys + (yt - ys) * t > s.h) continue;
      best = t;
    }
  }
  return best;
}
/** aim-point height of the player: crouched behind low cover → 0.75 m (pops up to 1.25 m while firing) */
const coverStats = { enemyShots: 0, blocked: 0 };
/** cover spot for a soldier: just behind (relative to the target) the nearest cover segment within 8 m */
function solCover(s: { pos: THREE.Vector3 }, tg: V2): V2 | null {
  let best: V2 | null = null,
    bd = 8;
  const dT = Math.hypot(tg[0] - s.pos.x, tg[1] - s.pos.z);
  for (const g of nearSegs(s.pos.x, s.pos.z)) {
    if (g.door || g.h == null) continue;
    const mx = (g.a[0] + g.b[0]) / 2,
      mz = (g.a[1] + g.b[1]) / 2;
    const tx = mx - tg[0],
      tz = mz - tg[1],
      tl = Math.hypot(tx, tz) || 1;
    if (tl > dT || tl < 4) continue;
    const c: V2 = [mx + (tx / tl) * 0.7, mz + (tz / tl) * 0.7];
    const d = Math.hypot(c[0] - s.pos.x, c[1] - s.pos.z);
    if (d < bd && !bldAt(c[0], c[1]) && los([s.pos.x, s.pos.z], c)) ((best = c), (bd = d));
  }
  return best;
}
const playerAimH = () => (player.cover?.low && player.cd <= 0.05 ? 0.75 : player.sneak ? 0.9 : 1.25);
/** nearest cover segment within r of (x, z): low (h ≤ 1.6, crouch) or tall (lean-peek) */
function findCover(x: number, z: number, r = 1.4) {
  let best: { s: Seg; d: number } | null = null;
  for (const s of nearSegs(x, z)) {
    if (s.door) continue;
    const ex = s.b[0] - s.a[0],
      ez = s.b[1] - s.a[1];
    const t = clamp(((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    const d = Math.hypot(s.a[0] + ex * t - x, s.a[1] + ez * t - z);
    if (d < r && (!best || d < best.d)) best = { s, d };
  }
  return best && { low: (best.s.h ?? 99) <= 1.6, x, z, seg: best.s };
}
/** nearest live soldier in sight within r m */
function nearestFoe(r: number) {
  let best: Sol | null = null,
    bd = r;
  for (const s of sols) {
    if (s.state === 'dead' || !s.mesh.visible) continue;
    const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
    if (d < bd && los([player.pos.x, player.pos.z], [s.pos.x, s.pos.z])) ((best = s), (bd = d));
  }
  return best;
}
/** v21.5.1 mobile portrait: three big thumb buttons on the right (搜 / 打 / 撤); the joystick stays as it is */
function initPortraitButtons() {
  const wrap = document.createElement('div');
  wrap.id = 'pbtns';
  const buzz = () => vibrate(15);
  const mk = (t: string, title: string, down: () => void, up?: () => void) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.title = title;
    b.className = 'pbtn';
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      buzz();
      down();
    });
    const end = () => {
      b.classList.remove('on');
      up?.();
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    wrap.appendChild(b);
  };
  mk('搜', '搜刮／互動', () => interact());
  mk(
    '打',
    '攻擊最近目標（按住連射）',
    () => (MB.fire = true),
    () => (MB.fire = false),
  );
  mk('撤', '撤退／找掩體', () => {
    if (!player.cover && findCover(player.pos.x, player.pos.z)) toggleCover();
    else {
      if (player.cover) toggleCover();
      MB.retreat = 1.6;
    }
  });
  document.body.appendChild(wrap);
  // ☰ menu: pause / map / save, reachable on portrait phones
  const mb = document.createElement('button');
  mb.id = 'menubtn';
  mb.textContent = '☰';
  mb.title = '選單';
  mb.onclick = () => togglePause();
  document.body.appendChild(mb);
  const upd = () => document.body.classList.toggle('portrait', MOBILE && matchMedia('(orientation: portrait)').matches);
  upd();
  addEventListener('resize', upd);
  matchMedia('(orientation: portrait)').addEventListener?.('change', upd);
}
function toggleCover() {
  if (player.cover) {
    player.cover = null;
    log('離開掩體');
  } else {
    const c = findCover(player.pos.x, player.pos.z);
    if (!c) return log('附近沒有掩體');
    player.cover = c;
    log(c.low ? '進入掩體：蹲低（開火時探身）' : '進入掩體：貼牆側身射擊', '#9cf');
  }
  updateCoverUI();
}
function updateCoverUI() {
  let el = document.getElementById('coverind');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coverind';
    document.body.appendChild(el);
  }
  el.textContent = player.cover ? (player.cover.low ? '🛡 掩體・蹲低' : '🛡 掩體・側身') : '';
  el.style.display = player.cover ? 'block' : 'none';
}
function collide(pos: THREE.Vector3, r: number) {
  for (let it = 0; it < 2; it++)
    for (const s of nearSegs(pos.x, pos.z)) {
      const ax = s.a[0],
        az = s.a[1],
        bx = s.b[0],
        bz = s.b[1];
      const dx = bx - ax,
        dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / l2, 0, 1);
      const cx = ax + dx * t,
        cz = az + dz * t;
      const ox = pos.x - cx,
        oz = pos.z - cz;
      const d = Math.hypot(ox, oz);
      if (d < r && d > 1e-6) {
        pos.x = cx + (ox / d) * r;
        pos.z = cz + (oz / d) * r;
      }
    }
  pos.x = clamp(pos.x, WORLD.minx, WORLD.maxx);
  pos.z = clamp(pos.z, WORLD.minz, WORLD.maxz);
}

// ---- v21.2 spawn reachability: grid BFS (0.25 m) honouring walls (los + 0.35 m player radius) until a road is reached ----
function walkable(x: number, z: number) {
  const q = new THREE.Vector3(x, 0, z);
  collide(q, 0.35);
  return Math.hypot(q.x - x, q.z - z) < 0.03;
}
function escapeCheck(px: number, pz: number, R = 70) {
  const S = 0.25,
    N = Math.ceil(R / S);
  const seen = new Set<number>();
  const key = (i: number, j: number) => (i + N) * 8192 + (j + N);
  const qu: [number, number, number][] = [[0, 0, 0]];
  seen.add(key(0, 0));
  let n = 0;
  let qh = 0;
  while (qh < qu.length && n < 400000) {
    const [i, j, d] = qu[qh++];
    n++;
    const x = px + i * S,
      z = pz + j * S;
    if (d > 12 && !bldAt(x, z) && roadDist(x, z) < 2.5) return { ok: true, dist: d * S, x, z };
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        b = j + dj;
      if (Math.abs(a) > N || Math.abs(b) > N || seen.has(key(a, b))) continue;
      const nx = px + a * S,
        nz = pz + b * S;
      if (!los([x, z], [nx, nz]) || !walkable(nx, nz)) continue;
      seen.add(key(a, b));
      qu.push([a, b, d + 1]);
    }
  }
  return { ok: false, dist: -1, x: px, z: pz };
}
/** fallback: if the player cannot reach a street, nudge to the nearest point that can (rings out to 25 m) */
let nudges = 0;
function unstuck() {
  const P = player.pos;
  if (escapeCheck(P.x, P.z).ok) return false;
  for (let r = 0.5; r <= 25; r += 0.5)
    for (let k = 0; k < Math.max(8, r * 6); k++) {
      const t = (k / Math.max(8, r * 6)) * Math.PI * 2;
      const x = P.x + Math.cos(t) * r,
        z = P.z + Math.sin(t) * r;
      if (walkable(x, z) && escapeCheck(x, z, 50).ok) {
        P.set(x, 0, z);
        nudges++;
        return true;
      }
    }
  return false;
}
const bounds = { minx: -500, maxx: 500, minz: -500, maxz: 500 };
/** whole-district clamp (set from the district index; falls back to the core bounds) */
const WORLD = { minx: -500, maxx: 500, minz: -500, maxz: 500 };
const WORLD_B = { ...WORLD };
function bldAt(x: number, z: number) {
  for (const b of blds) if (x > b.minx && x < b.maxx && z > b.minz && z < b.maxz && pip([x, z], b.pts)) return b;
  return null;
}

// ---------- sectors ----------
// v21: named 萬華 areas (nearest anchor). Core areas are liberated by clearing their soldiers; outer areas by
// wiping the garrison at their outpost tile (streamed, saved per tile).
const SECTORS: { n: string; x: number; z: number }[] = [
  { n: '西門町', x: 330, z: -230 },
  { n: '中華路', x: 420, z: 260 },
  { n: '康定路', x: -40, z: 60 },
  { n: '龍山寺', x: -260, z: 360 },
  { n: '貴陽街', x: -430, z: -220 },
  { n: '華西街', x: -480, z: 330 },
  { n: '西園路', x: -600, z: 1100 },
  { n: '華江', x: -1300, z: 820 },
  { n: '東園', x: -1000, z: 1550 },
  { n: '萬大路', x: -200, z: 1430 },
  { n: '南機場', x: 150, z: 1320 },
  { n: '青年公園', x: 300, z: 1990 },
  { n: '加蚋仔', x: -1000, z: 2120 },
  { n: '馬場町', x: 420, z: 2350 },
  { n: '雙園', x: -1300, z: 2560 },
];
const NSEC = SECTORS.length;
const sectorNames = SECTORS.map(s => s.n);
const sectorOf = (x: number, z: number) => {
  let bi = 0,
    bd = 1e18;
  SECTORS.forEach((s, i) => {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) ((bd = d), (bi = i));
  });
  return bi;
};
const SECTOR_LABEL = (i: number) => sectorNames[i] ?? '第' + (i + 1) + '區';
const outerSector = (i: number) => !inCore(SECTORS[i].x, SECTORS[i].z);

// ---------- build map ----------
function shopType(s: string, n: string) {
  if (/convenience|supermarket/.test(s)) return 'store';
  if (/pharmacy|chemist/.test(s)) return 'pharmacy';
  if (/police/.test(s)) return 'police';
  const r = rnd();
  return r < 0.06 ? 'store' : r < 0.1 ? 'pharmacy' : r < 0.115 ? 'police' : 'home';
}
function setSign(b: Bld, k: string) {
  let tex = signTex[k];
  if (!tex) {
    const [t, bg, fg] = b2sign[k];
    tex =
      extraSign[k] ||
      (extraSign[k] = canvasTex(256, 64, c => {
        c.fillStyle = bg;
        c.fillRect(0, 0, 256, 64);
        c.fillStyle = fg;
        c.font = 'bold 38px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t, 128, 34);
      }));
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: k === 'betel' ? 1.2 : 0.4,
    side: THREE.DoubleSide,
  });
  if (b.sign) b.sign.material = mat;
  else if (b.door) {
    const d = b.door;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.9), mat);
    const ux = d.c[0] - d.a[0],
      uz = d.c[1] - d.a[1];
    const L = Math.hypot(ux, uz);
    let nx = -uz / L,
      nz = ux / L;
    if (pip([d.p[0] + nx * 0.6, d.p[1] + nz * 0.6], b.pts)) {
      nx = -nx;
      nz = -nz;
    }
    m.position.set(d.p[0] + nx * 0.2, 3.0, d.p[1] + nz * 0.2);
    m.lookAt(d.p[0] + nx * 5, 3.0, d.p[1] + nz * 5);
    b.group.add(m);
    b.sign = m;
  }
}
function dropGun(c: Cont, p: THREE.Vector3, it: Record<string, number>) {
  const g = Object.keys(it).find(k => ITEMS[k].kind === 'gun') || Object.keys(it).find(k => ITEMS[k].mag);
  if (!g) return;
  const L = ITEMS[g].kind === 'gun' ? (g === 'qsz92' ? 0.45 : g === 'qjy88' ? 1.5 : 1.15) : 0.5;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.7, L * 1.7), iconMat(g));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * 6.28;
  m.position.set(p.x + 0.7, 0.04, p.z + 0.3);
  scene.add(m);
  (c as any).gunMesh = m;
}
// ---------- FPV kamikaze drones + PLA recon drones ----------
let fpv: FPV | null = null,
  recon: Recon | null = null;
const shells: { t: number; p: V2 }[] = [];
let lastBlast: unknown = null;
function blast(p: THREE.Vector3, fromAbove: boolean) {
  lastBlast = { x: p.x, y: p.y, z: p.z, fromAbove };
  boom(scene, p, 1);
  noise(p.x, p.z, 45);
  for (const s of sols) if (s.state !== 'dead' && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 6) damageSol(s, 220, true);
  if (armor) armor.hit(p.x, p.z, fromAbove ? 160 : 55, true);
  const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
  if (dp < 6) {
    player.hp -= 45 * (1 - dp / 6);
    player.rig.hurtT = 0.35;
  }
}
async function launchFPV() {
  const { FPV } = await import('./fpv');
  fpv =
    fpv ||
    new FPV({
      scene,
      renderer,
      player: () => player.pos,
      mobile: MOBILE,
      surf: (x, z) => bldAt(x, z)?.h ?? 0,
      wind: () => (raining() ? 2.2 : 0.8),
      blocked: (x, z, y) => {
        const b = bldAt(x, z);
        if (b && y < b.h + 0.5) return true;
        return !!armor && armor.list.some(a => Math.hypot(a.g.position.x - x, a.g.position.z - z) < 2.6 && y < 3.2);
      },
      los: (a, b) => los(a, b),
      jammers: () =>
        checkpoints.filter((_, i) => i % 2 === 0 && !liberated.has(sectorOf(checkpoints[i][0], checkpoints[i][1]))),
      explode: blast,
      log,
    });
  if (!MOBILE) renderer.domElement.requestPointerLock?.();
  fpv.launch(why => {
    if (document.pointerLockElement) document.exitPointerLock();
    log('📡 ' + why, '#9cf');
  });
}
function setupRecon(c: V2) {
  const cs: V2[] = checkpoints.slice(0, 2).map(q => [q[0], q[1]] as V2);
  while (cs.length < 2) cs.push([c[0] + 60 * (cs.length ? 1 : -1), c[1] + 40]);
  recon = new Recon(
    scene,
    {
      player: () => player.pos,
      log,
      hidden: () => {
        const P = player.pos;
        return (
          !!bldAt(P.x, P.z) ||
          [
            [1.6, 0],
            [-1.6, 0],
            [0, 1.6],
            [0, -1.6],
          ].some(([dx, dz]) => bldAt(P.x + dx, P.z + dz))
        );
      },
      spotted: p => {
        log('⚠ 解放軍偵察無人機發現你！砲擊與巡邏隊正趕來——快躲進騎樓或室內！', '#f66');
        slowDown('被無人機發現');
        for (let i = 0; i < 4; i++)
          shells.push({ t: 6 + i * 1.3, p: [p[0] + (Math.random() - 0.5) * 14, p[1] + (Math.random() - 0.5) * 14] });
        sols
          .filter(s => s.state !== 'dead' && !s.post)
          .sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1]))
          .slice(0, 3)
          .forEach(s => {
            s.state = 'investigate';
            s.target = p;
            s.timer = 300;
          });
      },
    },
    cs,
  );
}
function updateShells(dt: number) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.t -= dt;
    if (s.t > 0) continue;
    shells.splice(i, 1);
    const p = new THREE.Vector3(s.p[0], 0.5, s.p[1]);
    boom(scene, p, 1.4);
    noise(p.x, p.z, 60);
    const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (dp < 7 && !bldAt(player.pos.x, player.pos.z)) {
      player.hp -= 55 * (1 - dp / 7);
      player.rig.hurtT = 0.4;
      if (!player.bleed) {
        player.bleed = true;
        log('被砲彈破片擊中，流血了！', '#f66');
      }
    }
  }
}
// ---------- 國軍 (ROC) support: weapons unlock, radio call-in, final counter-offensive ----------
const ROC = { unlocked: false, cd: 0, offensive: false, ended: false, n: 0 };
let roc: RocSystem | null = null;
let mainRoads: { p: V2[]; t: string; n: string }[] = [];
const ROC_PRESETS: Record<string, number>[] = [
  { t91: 1, stanag: 2, a556n: 30, bandage: 2 },
  { t65k2: 1, stanag: 1, a556n: 40, kestrel: 1, r67: 2 },
  { t75saw: 1, a556n: 120, at4: 1 },
  { t93: 1, a762n: 10, t75p: 1, a9: 15 },
];
function fireAT(k: string, d: (typeof ITEMS)[string], dir: THREE.Vector3) {
  const P = player.pos;
  let end = P.clone().addScaledVector(dir, d.range!),
    hitA: any = null;
  if (armor)
    for (const a of armor.list) {
      if (a.dead) continue;
      const to = a.g.position.clone().sub(P);
      to.y = 0;
      const t = to.dot(dir);
      if (
        t > 0 &&
        t < d.range! &&
        to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.6 &&
        (k === 'jav' || los([P.x, P.z], [a.g.position.x, a.g.position.z]))
      ) {
        hitA = a;
        end = a.g.position.clone();
        break;
      }
    }
  if (!hitA) {
    for (let t = 2; t < d.range!; t += 1) {
      const q = P.clone().addScaledVector(dir, t);
      if (bldAt(q.x, q.z)) {
        end = q;
        break;
      }
    }
  }
  tracer(P, end);
  const e = end.clone().setY(1.4);
  boom(scene, e, 1.2);
  noise(e.x, e.z, 50);
  if (hitA) armor!.hit(hitA.g.position.x, hitA.g.position.z, d.at!, true);
  for (const s of sols)
    if (s.state !== 'dead' && Math.hypot(s.pos.x - e.x, s.pos.z - e.z) < 4.5) damageSol(s, d.dmg!, true);
  if (k === 'at4') {
    delete player.inv.at4;
    player.equip = '';
    log('AT4 已射出——空筒拋棄', '#ccc');
  } else if (k === 'jav') log('標槍飛彈頂部攻擊！', '#ffd76a');
}
function rocTargets() {
  const T: { x: number; z: number; kind: 'armor' | 'sol' | 'post'; ref: unknown }[] = [];
  if (armor)
    for (const a of armor.list) if (!a.dead) T.push({ x: a.g.position.x, z: a.g.position.z, kind: 'armor', ref: a });
  checkpoints.forEach((c, i) => {
    if (sols.some(s => s.state !== 'dead' && Math.hypot(s.pos.x - c[0], s.pos.z - c[1]) < 15))
      T.push({ x: c[0], z: c[1], kind: 'post', ref: i });
  });
  for (const s of sols) if (s.state !== 'dead') T.push({ x: s.pos.x, z: s.pos.z, kind: 'sol', ref: s });
  return T;
}
function setupRoc() {
  const len = (r: { p: V2[] }) =>
    r.p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0), 0);
  mainRoads = roads.filter(
    r =>
      (/^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || '')) &&
      r.p.length >= 2 &&
      len(r) > 60,
  );
  roc = new RocSystem(scene, {
    targets: rocTargets,
    los: (a, b) => los(a, b),
    log,
    fire: (t, from) => {
      const to = new THREE.Vector3(t.x, 1.2, t.z);
      tracer(from, to);
      boom(scene, to, t.kind === 'sol' ? 0.6 : 1.3);
      noise(t.x, t.z, 50);
      if (t.kind === 'armor') {
        const a = t.ref as any;
        if (armor && !a.dead) {
          armor.hit(a.g.position.x, a.g.position.z, 120, true);
        }
      } else if (t.kind === 'post') {
        for (const s of sols)
          if (s.state !== 'dead' && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 15 && Math.random() < 0.6)
            damageSol(s, 300, true);
        log('國軍砲火摧毀了佔領軍據點！', '#9cf');
      } else damageSol(t.ref as Sol, 300, true);
      const dp = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
      if (dp < 3.5) {
        player.hp -= 25;
        player.rig.hurtT = 0.3;
      }
      checkSectors();
    },
  });
}
function routeNear(r: { p: V2[] }, x: number, z: number): V2[] {
  const a = r.p[0],
    b = r.p[r.p.length - 1];
  return Math.hypot(a[0] - x, a[1] - z) > Math.hypot(b[0] - x, b[1] - z) ? r.p.slice() : r.p.slice().reverse();
}
function nearestRoad(x: number, z: number, name?: RegExp) {
  let best = mainRoads[0],
    bd = 1e9;
  for (const r of mainRoads) {
    if (name && !name.test(r.n || '')) continue;
    for (const q of r.p) {
      const d = Math.hypot(q[0] - x, q[1] - z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
  }
  return best;
}
function callSupport() {
  if (!roc) return;
  if (ROC.cd > 0) {
    log(`📻 「收到，支援單位整補中——${Math.ceil(ROC.cd)} 秒後再呼叫。」`, '#ccc');
    return;
  }
  ROC.cd = 240;
  const P = player.pos;
  noise(P.x, P.z, 70);
  sols
    .filter(s => s.state !== 'dead' && !s.post)
    .sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))
    .slice(0, 4)
    .forEach(s => {
      s.state = 'investigate';
      s.target = [P.x, P.z];
      s.timer = 300;
    });
  const kind: RocKind = (['cm32', 'cm11', 'm1a2t'] as RocKind[])[ROC.n++ % 3];
  const r = nearestRoad(P.x, P.z);
  roc.spawn(kind, routeNear(r, P.x, P.z), 150, 8);
  log(`📻 聯絡官：「${ROC_NAME[kind]} 8 秒後沿 ${r.n || '主要道路'} 推進！」——通話聲引來了巡邏隊`, '#9cf');
  phone('📻 國軍無線電', `${ROC_NAME[kind]} 正沿 ${r.n || '主要道路'} 推進支援，冷卻 4 分鐘。`);
  slowDown('呼叫支援');
}
function rocCheck(silent: boolean) {
  if (!started && !silent) return;
  if (!ROC.unlocked && liberated.size >= 2) {
    ROC.unlocked = true;
    if (!silent) {
      phone(
        '📻 地下電台「自由之聲」',
        '國軍特戰部隊已在萬華外圍活動！他們在幾個被奪回的據點留下了補給——留意國軍武器與空投。有人看到一名受傷的聯絡官倒在附近，他身上有無線電。',
      );
      log('📻 自由之聲：國軍特戰部隊就在附近！據點與空投開始出現國軍武器', '#9cf');
      slowDown('國軍消息');
    }
    checkpoints.slice(0, 4).forEach((c, i) => {
      const p: V2 = [c[0] + 3, c[1] + 3];
      const ct = makeCont('roc' + i, p, 'crate', undefined, ROC_PRESETS[i % ROC_PRESETS.length]);
      ct.label = '國軍補給箱';
    });
    let lp: V2 = [player.pos.x + 14, player.pos.z + 10];
    for (let k = 0; k < 40 && bldAt(lp[0], lp[1]); k++) lp = [player.pos.x + 14 + k * 1.5, player.pos.z + 10 - k];
    const li = makeCont('liaison', lp, 'crate', undefined, { rocradio_b: 1, t75p: 1, a9: 15, bandage: 1 });
    li.label = '受傷聯絡官的背包';
    (ROC as any).liaison = lp;
  }
  if (ROC.unlocked && !ROC.offensive && liberated.size >= NSEC - 2 && roc && !silent) {
    ROC.offensive = true;
    const rest = [...Array(NSEC).keys()].filter(i => !liberated.has(i));
    const r = nearestRoad(player.pos.x, player.pos.z, /西園路/) || mainRoads[0];
    const route = r.p.length > 1 ? (r.p[0][1] > r.p[r.p.length - 1][1] ? r.p.slice() : r.p.slice().reverse()) : r.p;
    (ROC as any).col = route;
    (['m1a2t', 'm1a2t', 'cm11', 'cm32'] as RocKind[]).forEach((kd, i) => roc!.spawn(kd, route, 99999, i * 3.5));
    phone(
      '📻 國軍無線電',
      `全面反攻開始！國軍戰車縱隊開進 ${r.n || '西園路'}，目標：最後的佔領軍據點（${rest.map(SECTOR_LABEL).join('、')}）。`,
    );
    log(`🎖 國軍反攻！M1A2T、勇虎、雲豹縱隊開進 ${r.n || '西園路'}——奪回最後的據點！`, '#ffd76a');
    slowDown('國軍反攻');
  }
  if (ROC.offensive && !ROC.ended && liberated.size >= NSEC && !silent) {
    ROC.ended = true;
    rocEnding();
  }
}
let rocCine: { t: number; T: number } | null = null;
function rocEnding() {
  UT.ev.win = 1;
  save();
  closePanel();
  setSpeed(1);
  started = false;
  const ov = document.createElement('div');
  ov.id = 'roccine';
  ov.innerHTML =
    '<div class="lb t"></div><div class="lb b"></div><div class="ttl">奪回萬華</div><div class="sub">國軍戰車縱隊・西園路</div>';
  document.body.appendChild(ov);
  rocCine = { t: 0, T: 11 };
}
function rocCineStep(dt: number) {
  const c = rocCine!;
  c.t += dt;
  const lead = roc?.list[0]?.g.position || player.pos;
  const a = 0.6 + c.t * 0.18,
    r = 26 - c.t * 0.8,
    h = 9 + Math.sin(c.t * 0.4) * 3;
  camera.position.set(lead.x + Math.cos(a) * r, h, lead.z + Math.sin(a) * r);
  camera.lookAt(lead.x, 2, lead.z);
  roc?.update(dt);
  if (c.t > c.T) {
    rocCine = null;
    document.getElementById('roccine')?.remove();
    const day = Math.floor(gameMin / 1440) + 1;
    const d = document.createElement('div');
    d.id = 'evacend';
    d.className = 'win';
    d.innerHTML = `<h1>奪回萬華</h1><h2>結局：國軍與萬華的街坊並肩，把佔領軍趕出了艋舺。</h2><p class="survend">${SV.endingText(surv)}</p><table><tr><td>存活天數</td><td>${day} 天</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>擊毀裝甲</td><td>${armor ? armor.list.filter(a => a.dead).length : 0}</td></tr></table><p>另有兩種結局：搭直升機或小艇撤離至福特號航空母艦。</p><button onclick="location.reload()">再玩一次</button>`;
    document.body.appendChild(d);
  }
}
// ---------- PLA armour on main roads ----------
let armor: ArmorSystem | null = null;
function setupArmor(c: V2) {
  armor = new ArmorSystem(scene, {
    canSee: (ax, az, bx, bz) => !bldAt(bx, bz) && los([ax, az], [bx, bz]),
    hurt: dmg => {
      if (player.sleeping) player.sleeping = false;
      player.rig.hurtT = 0.35;
      player.rig.hurtSide = 1;
      player.stun = 0.25;
      player.hp -= dmg;
      if (!player.bleed && Math.random() < 0.35) {
        player.bleed = true;
        log('你被機槍擊中，流血了！', '#f66');
      }
    },
    alert: (x, z) => {
      sols
        .filter(s => s.state !== 'dead' && !s.post)
        .sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z))
        .slice(0, 3)
        .forEach(s => {
          s.state = 'investigate';
          s.target = [player.pos.x, player.pos.z];
          s.timer = 300;
        });
    },
    log,
    player: () => player.pos,
  });
  const len = (r: { p: V2[] }) =>
    r.p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0), 0);
  const main = roads
    .filter(
      r => /^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || ''),
    )
    .filter(r => r.p.length >= 2 && (ROADW[r.t.replace('_link', '')] ?? 0) >= 9 && len(r) > 70)
    .filter(r => r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 420))
    .sort((a, b) => len(b) - len(a));
  const kinds: ArmorKind[] = ['zbl08', 'zbd05', 'mengshi', 'ztd05'];
  const used = new Set<string>();
  for (const r of main) {
    if (armor.list.length >= kinds.length) break;
    const key = (r.n || '') + r.p[0].join();
    if (used.has(key)) continue;
    if (r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 30)) continue;
    used.add(key);
    armor.spawn(
      kinds[armor.list.length],
      r.p.map(q => [q[0], q[1]] as V2),
      Math.floor(r.p.length / 3),
    );
  }
  // pre-placed burnt wrecks
  let w = 0;
  for (const r of main.slice().reverse()) {
    if (w >= 3) break;
    const q = r.p[Math.floor(r.p.length / 2)],
      q2 = r.p[Math.floor(r.p.length / 2) + 1] || r.p[0];
    if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 25) continue;
    const ang = Math.atan2(-(q2[1] - q[1]), q2[0] - q[0]);
    const off = (ROADW[r.t.replace('_link', '')] ?? 9) / 2 - 2.2;
    armor.wreck(
      (['zbd05', 'mengshi', 'zbl08'] as ArmorKind[])[w],
      q[0] - Math.sin(ang) * off,
      q[1] - Math.cos(ang) * off,
      ang + 0.3,
    );
    w++;
  }
  (UT as any).armorN = armor.list.length;
}
function makeCont(id: string, p: V2, type: string, b?: Bld, preset?: Record<string, number>) {
  const items: Record<string, number> = preset || {};
  if (!preset) {
    const table = LOOT[type];
    const n = 1 + Math.floor(rnd() * 3);
    const tot = table.reduce((s, x) => s + x[1], 0);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.18) continue;
      let r = rnd() * tot;
      for (const [k, w, m] of table) {
        r -= w;
        if (r <= 0) {
          items[k] = (items[k] || 0) + 1 + Math.floor(rnd() * m);
          break;
        }
      }
    }
  }
  const kind =
    type === 'store'
      ? rnd() < 0.4
        ? 'fridge'
        : 'shelf'
      : type === 'pharmacy'
        ? 'shelf'
        : type === 'crate'
          ? 'crate'
          : 'cab';
  const label = { fridge: '冷藏櫃', shelf: '貨架', cab: '櫥櫃', crate: '遺留物' }[kind];
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(kind === 'crate' ? 0.8 : 1.1, kind === 'fridge' ? 1.9 : kind === 'crate' ? 0.4 : 1.2, 0.6),
    contMat[kind],
  );
  m.position.set(p[0], m.geometry.parameters.height / 2, p[1]);
  m.rotation.y = rnd() * Math.PI;
  m.castShadow = true;
  m.receiveShadow = true;
  (b ? b.group : scene).add(m);
  const c: Cont = { id, p, items, label, mesh: m, b };
  conts.push(c);
  return c;
}

function buildMap(data: any) {
  let minx = 1e9,
    maxx = -1e9,
    minz = 1e9,
    maxz = -1e9;
  for (const r of data.roads)
    for (const p of r.p) {
      minx = Math.min(minx, p[0]);
      maxx = Math.max(maxx, p[0]);
      minz = Math.min(minz, p[1]);
      maxz = Math.max(maxz, p[1]);
    }
  Object.assign(bounds, { minx: minx + 10, maxx: maxx - 10, minz: minz + 10, maxz: maxz - 10 });
  const W = maxx - minx,
    H = maxz - minz;
  // v21.3 everything off the carriageway is paved (worn concrete + tile/brick patchwork, 1 texture = 2 m)
  groundMat.map = lotTex; // 1 texture = 8 m
  lotTex.repeat.set((W + 200) / 8, (H + 200) / 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, H + 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minx + maxx) / 2, 0, (minz + maxz) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // roads
  const RW: Record<string, number> = ROADW;
  const rg: THREE.BufferGeometry[] = [],
    lg: THREE.BufferGeometry[] = [];
  for (const r of data.roads) {
    roads.push(r);
    const w = RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const g = new THREE.PlaneGeometry(len + w * 0.5, w);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate((ax + bx) / 2, 0.02 + w * 0.0005, (az + bz) / 2);
      rg.push(g);
      // v19.2: global centre line removed (per OSM way it doubled up on dual carriageways); markings live in roads.ts
    }
  }
  roadTex.repeat.set(1, 1);
  const roadMesh = new THREE.Mesh(mergeGeometries(rg), roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  if (lg.length)
    scene.add(
      new THREE.Mesh(
        mergeGeometries(lg),
        new THREE.MeshStandardMaterial({
          color: 0xd8b040,
          roughness: 0.8,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      ),
    );
  // buildings
  setArcadeDeps({ roadDist, pip: pip as any, addSeg });
  data.buildings.forEach((ob: any, id: number) => {
    const pts: V2[] = ob.p;
    const A = area(pts);
    if (A < 12 || A > 6000) return;
    let xs = pts.map(p => p[0]),
      zs = pts.map(p => p[1]);
    const hh = (k: number) => {
      const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    if (!ob.l) rnd();
    const rr = hh(1);
    const lv = ob.l
      ? Math.min(ob.l, rr < 0.45 ? 3 : 9)
      : rr < 0.5
        ? 2 + Math.floor(hh(2) * 2)
        : rr < 0.88
          ? 4 + Math.floor(hh(2) * 2)
          : 6 + Math.floor(hh(2) * 2);
    /* 透天 2-3F, 公寓 4-5F, few taller; v19.3 ground floor 3.8 m, upper floors 3.2 m */ const h =
      GF + (Math.min(lv, 7) - 1) * FH;
    const type = shopType(ob.s, ob.n);
    const cx = xs.reduce((a, b) => a + b) / xs.length,
      cz = zs.reduce((a, b) => a + b) / zs.length;
    const group = new THREE.Group();
    scene.add(group);
    const b: Bld = {
      id,
      pts,
      h,
      type,
      group,
      walls: null as any,
      roof: new THREE.Group(),
      c: [cx, cz],
      minx: Math.min(...xs),
      maxx: Math.max(...xs),
      minz: Math.min(...zs),
      maxz: Math.max(...zs),
    };
    // door: longest edge
    let di = 0,
      dl = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > dl) {
        dl = l;
        di = i;
      }
    }
    const wg: THREE.BufferGeometry[] = [];
    const wins: { x: number; z: number; y: number; ry: number; f: number }[] = [];
    (b as any).wins = wins;
    const wallBox = (a: V2, c: V2, y0: number, y1: number, win = y0 === 0) => {
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l < 0.05) return;
      const g = new THREE.BoxGeometry(l + 0.25, y1 - y0, 0.25);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, (uv.getX(k) * l) / 3.2, (y0 - (GF - FH) + uv.getY(k) * (y1 - y0)) / FH); // floor bands in world height
      g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0]));
      g.translate((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2);
      wg.push(g);
      /* window slots matching the painted wall-texture windows (for 3D window units near the player) */
      if (win && h > GF + 1) {
        const ux = (c[0] - a[0]) / l,
          uz = (c[1] - a[1]) / l;
        let nx = -uz,
          nz = ux,
          back = false;
        if (pip([(a[0] + c[0]) / 2 + nx * 0.5, (a[1] + c[1]) / 2 + nz * 0.5], pts)) {
          nx = -nx;
          nz = -nz;
          back = true;
        }
        const T = (3.2 * (l + 0.25)) / l;
        for (let k = 0; k < 40; k++) {
          const sd = back ? l + 0.125 - (k + 0.5) * T : -0.125 + (k + 0.5) * T;
          if (back ? sd < 0.9 : sd > l - 0.9) break;
          if (sd < 0.9 || sd > l - 0.9) continue;
          for (let f = 1; GF + (f - 1) * FH + 2.7 < h; f++)
            wins.push({
              x: a[0] + ux * sd + nx * 0.126,
              z: a[1] + uz * sd + nz * 0.126,
              y: GF + (f - 1) * FH + 1.95,
              ry: Math.atan2(nx, nz),
              f,
            });
        }
      }
    };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      if (i === di && dl > 2.6 && A > 20) {
        const ux = (c[0] - a[0]) / dl,
          uz = (c[1] - a[1]) / dl,
          m = dl / 2;
        const d1: V2 = [a[0] + ux * (m - 0.8), a[1] + uz * (m - 0.8)],
          d2: V2 = [a[0] + ux * (m + 0.8), a[1] + uz * (m + 0.8)];
        let mid: V2 = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
        // outward normal
        let nx = -uz,
          nz = ux;
        if (pip([mid[0] + nx * 0.6, mid[1] + nz * 0.6], pts)) {
          nx = -nx;
          nz = -nz;
        }
        const arcOk = h > 6 && rnd() < 0.7 ? arcadeFits(pts, a, c, ux, uz, nx, nz, dl, h) : null;
        let da = d1,
          dc = d2;
        if (arcOk) {
          // upper floors flush with the footprint edge; ground floor recessed behind the columns
          wallBox(a, c, GF, h, true);
          const ia: V2 = [a[0] - nx * ARC, a[1] - nz * ARC],
            ic: V2 = [c[0] - nx * ARC, c[1] - nz * ARC];
          da = [d1[0] - nx * ARC, d1[1] - nz * ARC];
          dc = [d2[0] - nx * ARC, d2[1] - nz * ARC];
          wallBox(ia, da, 0, GF, false);
          wallBox(dc, ic, 0, GF, false);
          wallBox(da, dc, 2.4, GF, false);
          addSeg({ a: ia, b: da });
          addSeg({ a: dc, b: ic });
          mid = [(da[0] + dc[0]) / 2, (da[1] + dc[1]) / 2];
        } else {
          wallBox(a, d1, 0, h);
          wallBox(d2, c, 0, h);
          wallBox(d1, d2, 2.4, h);
          addSeg({ a, b: d1 });
          addSeg({ a: d2, b: c });
        }
        const door: Door = { b, p: mid, a: da, c: dc, barricaded: false };
        b.door = door;
        doors.push(door);
        // v19.3 騎樓: built inside the footprint — columns on the street edge under the upper floors,
        // shopfront recessed ARC m behind them, continuous ceiling; only on edges facing a road
        if (arcOk) buildArcade(arcOk, b.roof);
        if ((h > 6 && rnd() < 0.6) || type !== 'home') {
          const tex = type !== 'home' ? signTex[type] : pick(shopSignTex);
          const sg = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(dl * 0.8, 5), 1.1),
            new THREE.MeshStandardMaterial({
              map: tex,
              emissive: 0xffffff,
              emissiveMap: tex,
              emissiveIntensity: 0.25,
              side: THREE.DoubleSide,
            }),
          );
          const sy = arcOk ? GF + 0.75 : 3.0,
            so = arcOk ? ARC + 0.16 : 0.16; // attached flat to the facade (fascia above the arcade)
          sg.position.set(mid[0] + nx * so, sy, mid[1] + nz * so);
          sg.lookAt(mid[0] + nx * (so + 5), sy, mid[1] + nz * (so + 5));
          group.add(sg);
          b.sign = sg;
        }
      } else {
        wallBox(a, c, 0, h);
        addSeg({ a, b: c });
      }
    }
    const mi = id % wallMats.length;
    (b as any).mi = mi;
    b.walls = new THREE.Mesh(mergeGeometries(wg), wallMats[mi]);
    b.walls.castShadow = true;
    b.walls.receiveShadow = true;
    group.add(b.walls);
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const rgeo = new THREE.ShapeGeometry(shape);
    rgeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(
      rgeo,
      pickRoofMat(() => hh(9)),
    );
    roof.position.y = h;
    roof.castShadow = true;
    b.roof.add(roof);
    const fl = new THREE.Mesh(rgeo, floorMat);
    fl.position.y = 0.03;
    fl.receiveShadow = true;
    group.add(fl);
    b.floor = fl;
    // rooftop additions 頂樓加蓋 + water tanks
    {
      const rcls = roofClass(pts as any, lv, type + ' ' + (ob.n || ''));
      if (A > 40) rnd(); // keep the world RNG sequence identical to v21 (soldier/loot placement)
      const shack = A > 30 && (rcls !== 'row' || hh(3) < 0.9);
      const s7 = Math.floor(hh(7) * 1e6) + 1,
        s8 = Math.floor(hh(8) * 1e6) + 7,
        roofG = b.roof;
      roofJobs.push({
        x: cx,
        z: cz,
        f: () => {
          if (shack) {
            let sd = s7;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            placeRooftop(roofG, pts as any, h, pr, pip as any, rcls);
          }
          {
            let sd = s8;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            dressRoof(roofG, pts as any, h, pr, pip as any, A > 25);
          }
          if (A < 600) {
            let sd = s8 ^ 0x5bd1;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            dressWalkup(pts as any, h, roadDist, pr, roofG);
          }
        },
      });
    }
    const tq = rnd();
    if (tq < 0.5 || hh(4) < (lv <= 3 ? 0.5 : 0)) {
      const st = lv <= 3 ? 1.6 : 0;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), tankMat);
      const tp: V2 =
        tq < 0.5 ? [cx + (rnd() - 0.5) * 2, cz + (rnd() - 0.5) * 2] : [cx + (hh(5) - 0.5) * 2, cz + (hh(6) - 0.5) * 2];
      if (pip(tp, pts)) {
        t.position.set(tp[0], h + 0.7 + st, tp[1]);
        t.castShadow = true;
        b.roof.add(t);
        if (st)
          for (const [ox, oz] of [
            [-0.45, -0.45],
            [0.45, -0.45],
            [0.45, 0.45],
            [-0.45, 0.45],
          ]) {
            const lg = new THREE.Mesh(new THREE.BoxGeometry(0.07, st, 0.07), tinMat);
            lg.position.set(tp[0] + ox, h + st / 2, tp[1] + oz);
            b.roof.add(lg);
          }
      }
    }
    group.add(b.roof);
    blds.push(b);
    (b as any).nm = ob.n || '';
    // containers
    if (b.door) {
      const n = clamp(Math.floor(A / 60), 1, type === 'store' ? 5 : 3);
      let tries = 0,
        k = 0;
      while (k < n && tries++ < 40) {
        const p: V2 = [b.minx + rnd() * (b.maxx - b.minx), b.minz + rnd() * (b.maxz - b.minz)];
        if (pip(p, pts) && Math.hypot(p[0] - b.door.p[0], p[1] - b.door.p[1]) > 1.8) {
          makeCont(`b${id}_${k}`, p, type, b);
          k++;
        }
      }
    }
  });
  flushArcades(scene);
  // parked vehicles (scooters on sidewalks, cars/taxis on bigger roads, occupation trucks) + street lamps
  const spots: { x: number; z: number; ang: number; kind: VehicleKind }[] = [];
  for (const r of roads) {
    const w = RW[r.t] ?? 3;
    if (w < 6) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 4) continue;
      const ang = Math.atan2(bz - az, bx - ax);
      const ux = Math.cos(ang),
        uz = Math.sin(ang),
        nx = -uz,
        nz = ux;
      for (let s = 2; s < L - 2; s += 26) {
        const side = rnd() < 0.5 ? 1 : -1;
        const lx = ax + ux * s + nx * (w / 2 + 0.4) * side,
          lz = az + uz * s + nz * (w / 2 + 0.4) * side;
        if (!bldAt(lx, lz)) lamps.push([lx, lz, Math.atan2(-nx * side, -nz * side)]);
      }
      if (rnd() < 0.06) {
        const t = rnd() * 0.6 + 0.2;
        const side = rnd() < 0.5 ? 1 : -1;
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const x = ax + (bx - ax) * t + ux * k * 0.75 + nx * (w / 2 - 0.7) * side,
            z = az + (bz - az) * t + uz * k * 0.75 + nz * (w / 2 - 0.7) * side;
          if (!bldAt(x, z)) spots.push({ x, z, ang: Math.atan2(-nx * side, -nz * side), kind: 'scooter' });
        }
      }
      if (w >= 9 && rnd() < 0.05) {
        const t = rnd() * 0.6 + 0.2;
        const side = rnd() < 0.5 ? 1 : -1;
        const x = ax + (bx - ax) * t + nx * (w / 2 - 1.6) * side,
          z = az + (bz - az) * t + nz * (w / 2 - 1.6) * side;
        const kind: VehicleKind = rnd() < 0.15 ? 'truck' : rnd() < 0.35 ? 'taxi' : 'car';
        if (!bldAt(x, z)) {
          spots.push({ x, z, ang: Math.atan2(ux, uz), kind });
          const hl = kind === 'truck' ? 3.25 : 2.2,
            hw = kind === 'truck' ? 1.15 : 0.9;
          const cs: V2[] = [
            [-hw, -hl],
            [hw, -hl],
            [hw, hl],
            [-hw, hl],
          ].map(([a, b]) => [x + a * nx + b * ux, z + a * nz + b * uz] as V2);
          for (let q = 0; q < 4; q++) addSeg({ a: cs[q], b: cs[(q + 1) % 4], h: kind === 'truck' ? 2.8 : 1.45 });
        }
      }
    }
  }
  vehicles.build(spots, mergeGeometries, rnd);
  buildLamps();
}

let facade: ReturnType<typeof buildFacade> | null = null;
let decay: ReturnType<typeof buildDecay> | null = null;
let alley: ReturnType<typeof buildAlley> | null = null;
let checkpoints: V2[] = [];
// ---------- street lamps ----------
const lamps: [number, number, number][] = [];
const lampPool: THREE.PointLight[] = [];
let lampHeadMat: THREE.MeshStandardMaterial;
const vehicles = new VehicleSystem(scene);
function buildLamps() {
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 5, 6);
  pole.translate(0, 2.5, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.2);
  arm.translate(0, 4.95, 0.55);
  const poleG = mergeGeometries([pole, arm]);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.5);
  head.translate(0, 4.88, 1.1);
  const pm = new THREE.InstancedMesh(
    poleG,
    new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.5, roughness: 0.5 }),
    lamps.length,
  );
  lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffc070, emissiveIntensity: 0 });
  const hm = new THREE.InstancedMesh(head, lampHeadMat, lamps.length);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion();
  lamps.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
    pm.setMatrixAt(i, m4);
    hm.setMatrixAt(i, m4);
  });
  pm.castShadow = true;
  scene.add(pm, hm);
  for (let i = 0; i < 8; i++) {
    const l = new THREE.PointLight(0xffc070, 0, 22, 1.6);
    scene.add(l);
    lampPool.push(l);
  }
}
let lampT = 0;
function updateLamps(night: number, dt: number) {
  setShackNight(night);
  lampHeadMat.emissiveIntensity = night * 2.5;
  lampT -= dt;
  if (lampT > 0) return;
  lampT = 0.5;
  const near = lamps
    .map(l => [l, (l[0] - player.pos.x) ** 2 + (l[1] - player.pos.z) ** 2] as const)
    .sort((a, b) => a[1] - b[1])
    .slice(0, lampPool.length);
  lampPool.forEach((L, i) => {
    const e = near[i];
    if (!e) {
      L.intensity = 0;
      return;
    }
    const [x, z, a] = e[0];
    L.position.set(x + Math.sin(a) * 1.1, 4.7, z + Math.cos(a) * 1.1);
    L.intensity = night * 40;
  });
}

// ---------- characters ----------
const SOLDIER_OPTS = {
  gender: 'm' as const,
  hair: 0x111111,
  top: 0x55603c,
  bottom: 0x4a5434,
  shoes: 0x1a1a1a,
  soldier: true,
};
const HERO: Record<string, any> = {
  m: {
    gender: 'm',
    hair: 0x1a1410,
    top: 0xd8d4c8,
    jacket: 0x3d5a78,
    bottom: 0x34363e,
    shoes: 0xe8e8e8,
    pack: 0x2f3a2a,
  },
  f: { gender: 'f', hair: 0x1e1410, top: 0xb84a52, bottom: 0x2a3a5a, shoes: 0xe8e8e8, pack: 0x6a5240 },
};
function spawnRig(o: any) {
  const r = makeRig(o);
  scene.add(r.root);
  return r;
}
const player = {
  mesh: null as any as THREE.Group,
  rig: null as any as Rig,
  gender: 'm',
  anim: 'idle' as AnimState,
  moving: 0,
  pos: new THREE.Vector3(),
  hp: 100,
  hunger: 85,
  thirst: 85,
  fatigue: 10,
  bleed: false,
  inv: { water: 1, noodle: 1 } as Record<string, number>,
  vel: new THREE.Vector3(),
  vaultT: 0,
  stun: 0,
  vFrom: new THREE.Vector3(),
  vTo: new THREE.Vector3(),
  equip: '' as string,
  sneak: false,
  cd: 0,
  kills: 0,
  sleeping: false,
  light: false,
  cover: null as null | { low: boolean; x: number; z: number; seg: Seg },
};
type Sol = {
  rig: Rig;
  stun?: number;
  vs?: number;
  post?: V2;
  path?: V2[];
  pi?: number;
  repath?: number;
  pgoal?: V2;
  speed?: number;
  aiming?: boolean;
  cov?: V2 | null;
  covT?: number;
  crouch?: boolean;
  peekT?: number;
  id: number;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  hp: number;
  route: V2[];
  wi: number;
  dir: number;
  state: 'patrol' | 'investigate' | 'combat' | 'dead';
  target?: V2;
  alert: number;
  timer: number;
  cd: number;
  sector: number;
  cone: THREE.Mesh;
  night: boolean;
  lastSeen?: V2;
  /** v21: streamed district soldier (tile key + index within tile) */
  tile?: string;
  tid?: number;
};
const sols: Sol[] = [];
const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 5, (Math.PI * 2) / 5);
coneGeo.rotateX(-Math.PI / 2);
coneGeo.rotateY(Math.PI / 2);
function spawnSoldiers(dead: Set<number>) {
  const big = roads.filter(r => r.p.length >= 3 && r.t !== 'footway');
  for (let i = 0; i < 64; i++) {
    const r = pick(big);
    const s0 = Math.floor(rnd() * (r.p.length - 1));
    const route = r.p.slice(Math.max(0, s0 - 3), s0 + 4) as V2[];
    const night = i >= 48;
    const rig = spawnRig(SOLDIER_OPTS);
    setWeapon(rig, 'rifle');
    const mesh = rig.root;
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    cone.position.y = 0.06;
    scene.add(cone);
    const p = route[0];
    const s: Sol = {
      rig,
      id: i,
      mesh,
      pos: new THREE.Vector3(p[0], 0, p[1]),
      hp: 100,
      route,
      wi: 1,
      dir: 0,
      state: 'patrol',
      alert: 0,
      timer: 0,
      cd: 0,
      sector: sectorOf(p[0], p[1]),
      cone,
      night,
    };
    if (dead.has(i)) {
      s.state = 'dead';
      s.hp = 0;
      rig.deadT = 1;
      mesh.visible = false;
      cone.visible = false;
    }
    sols.push(s);
  }
}

// ---------- v21: district tile content (per-tile density budget, deterministic per-tile seed) ----------
const GARRISON = 5;
const DBUDGET = { loot: 3, patrol: 2, solCap: 36 };
const gKeys = new Map<number, string | null>();
function garrisonKey(i: number) {
  if (gKeys.has(i)) return gKeys.get(i)!;
  if (!district.ix) return null;
  const T = district.ix.T,
    a = SECTORS[i];
  let best: string | null = null,
    bd = 1e18;
  for (const [k, [nb, nr]] of Object.entries(district.ix.tiles)) {
    if (nr < 3 || nb < 4) continue;
    const [tx, tz] = k.split('_').map(Number);
    const cx = (tx + 0.5) * T,
      cz = (tz + 0.5) * T;
    if (inCore(cx, cz)) continue;
    const d = (cx - a.x) ** 2 + (cz - a.z) ** 2;
    if (d < bd) ((bd = d), (best = k));
  }
  gKeys.set(i, best);
  return best;
}
const garrisonOf = (i: number) => {
  const k = garrisonKey(i);
  return k ? { key: k } : null;
};
function rollLoot(type: string, r: () => number) {
  const items: Record<string, number> = {};
  const table = LOOT[type] || LOOT.home;
  const tot = table.reduce((s, x) => s + x[1], 0);
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
    let q = r() * tot;
    for (const [k, w, m] of table) {
      q -= w;
      if (q <= 0) {
        items[k] = (items[k] || 0) + 1 + Math.floor(r() * m);
        break;
      }
    }
  }
  return items;
}
const dTile = new Map<string, { sols: Sol[]; conts: Cont[]; marks: THREE.Object3D[]; cps: V2[] }>();
let dSolId = 100000;
const sandMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 });
/** v21.5 a visible sandbag wall (cover, 1 m) of n bags at (x, z) facing ang; returns the group */
function sandbags(x: number, z: number, ang: number, n = 4) {
  const g = new THREE.Group();
  const ux = Math.cos(ang),
    uz = Math.sin(ang);
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < n - (row === 2 ? 1 : 0); k++) {
      const sb = new THREE.Mesh(sandGeo, sandMat);
      const o = (k - (n - 1) / 2 + (row % 2) * 0.5) * 0.62;
      sb.position.set(x + ux * o, 0.17 + row * 0.3, z + uz * o);
      sb.rotation.y = -ang;
      sb.castShadow = true;
      g.add(sb);
    }
  scene.add(g);
  const hl = (n * 0.62) / 2;
  addSeg({ a: [x - ux * hl, z - uz * hl], b: [x + ux * hl, z + uz * hl] }, true);
  return g;
}
const sandGeo = new THREE.BoxGeometry(0.6, 0.3, 0.45);
function dSoldier(key: string, tid: number, route: V2[], sector: number, post?: V2) {
  const rig = spawnRig(SOLDIER_OPTS);
  setWeapon(rig, 'rifle');
  const cone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  cone.position.y = 0.06;
  scene.add(cone);
  const p = post || route[0];
  const s: Sol = {
    rig,
    id: dSolId++,
    mesh: rig.root,
    pos: new THREE.Vector3(p[0], 0, p[1]),
    hp: 100,
    route,
    wi: 1,
    dir: 0,
    state: 'patrol',
    alert: 0,
    timer: 0,
    cd: 0,
    sector,
    cone,
    night: false,
    tile: key,
    tid,
  };
  if (post) s.post = post;
  sols.push(s);
  return s;
}
function onTileLoad(t: TileInfo) {
  const rec = { sols: [] as Sol[], conts: [] as Cont[], marks: [] as THREE.Object3D[], cps: [] as V2[] };
  dTile.set(t.key, rec);
  const sv = district.saved[t.key] || {};
  const dead = sv.dead || {};
  const r = t.rnd;
  // loot: a few caches on the shop frontage
  const types = ['home', 'store', 'stall', 'breakfast', 'hardware', 'kitchen'];
  const nL = t.fronts.length ? Math.min(DBUDGET.loot, Math.floor(t.fronts.length / 8) + (r() < 0.5 ? 1 : 0)) : 0;
  for (let i = 0; i < nL; i++) {
    const f = t.fronts[Math.floor(r() * t.fronts.length)];
    const ty = types[Math.floor(r() * types.length)];
    const rolled = rollLoot(ty, r);
    const preset = sv.c?.[i] ?? rolled;
    rec.conts.push(
      makeCont(`t${t.key}:${i}`, [f.x + f.ux * (r() - 0.5) * 2, f.z + f.uz * (r() - 0.5) * 2], 'crate', undefined, {
        ...preset,
      }),
    );
  }
  // v21.5 enterable ground-floor rooms: a cabinet / fridge / shelf inside each (ids 100+, saved per tile)
  (t.rooms || []).forEach((rm, j) => {
    const i = 100 + j;
    const ty = rm.kind === 'shop' ? 'store' : 'home';
    const preset = sv.c?.[i] ?? rollLoot(ty, r);
    rec.conts.push(makeCont(`t${t.key}:${i}`, [rm.x - rm.nx * 1.2, rm.z - rm.nz * 1.2], ty, undefined, { ...preset }));
  });
  const big = t.roads.filter(q => q.p.length >= 2 && !/foot|path|steps|cycle|service/.test(q.t));
  // garrison outpost for the area this tile anchors
  const gs = SECTORS.findIndex((_, i) => outerSector(i) && garrisonKey(i) === t.key);
  if (gs >= 0 && big.length) {
    let cp: V2 = big[0].p[0],
      bd = 1e9;
    for (const q of big)
      for (const v of q.p) {
        const d = Math.hypot(v[0] - t.cx, v[1] - t.cz);
        if (d < bd) ((bd = d), (cp = v));
      }
    const g = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const sb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), sandMat);
      sb.position.set(cp[0] + Math.cos(a) * 4.2, 0.25 + (k % 2) * 0.02, cp[1] + Math.sin(a) * 4.2);
      sb.rotation.y = -a + Math.PI / 2;
      sb.castShadow = true;
      g.add(sb);
    }
    scene.add(g);
    rec.marks.push(g);
    rec.cps.push(cp);
    checkpoints.push(cp);
    for (let k = 0; k < GARRISON; k++) {
      if (dead[k]) continue;
      const a = (k / GARRISON) * Math.PI * 2;
      const post: V2 = [cp[0] + Math.cos(a) * 2.5, cp[1] + Math.sin(a) * 2.5];
      rec.sols.push(dSoldier(t.key, k, [post, cp], gs, post));
    }
  }
  // patrols (bounded globally)
  const live = sols.filter(q => q.tile && q.state !== 'dead').length;
  const nP =
    big.length && live < DBUDGET.solCap ? Math.min(DBUDGET.patrol, (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0)) : 0;
  for (let j = 0; j < nP; j++) {
    const q = big[Math.floor(r() * big.length)];
    if (dead[GARRISON + j] || q.p.length < 2) continue;
    rec.sols.push(dSoldier(t.key, GARRISON + j, q.p.slice(0, 6) as V2[], -1));
  }
}
function onTileUnload(key: string) {
  const rec = dTile.get(key);
  if (!rec) return;
  for (const q of rec.sols) {
    scene.remove(q.rig.root);
    scene.remove(q.cone);
    const i = sols.indexOf(q);
    if (i >= 0) sols.splice(i, 1);
  }
  const c: Record<number, Record<string, number>> = { ...(district.saved[key]?.c || {}) };
  for (const q of rec.conts) {
    c[+q.id.split(':')[1]] = q.items;
    q.mesh.parent?.remove(q.mesh);
    const i = conts.indexOf(q);
    if (i >= 0) conts.splice(i, 1);
  }
  if (rec.conts.length) district.save(key, 'c', c);
  for (const m of rec.marks) scene.remove(m);
  for (const cp of rec.cps) {
    const i = checkpoints.indexOf(cp);
    if (i >= 0) checkpoints.splice(i, 1);
  }
  dTile.delete(key);
}

// ---------- player role, drivable vehicles, streamed road detail, traffic ----------
let ROLE: Role = roleById('courier');
function roadWAt(x: number, z: number) {
  let best = 1e9,
    w = 0;
  for (const r of roads) {
    const hw = ROADW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az,
        l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) {
        best = d;
        w = hw;
      }
    }
  }
  return best < w / 2 + 1.5 ? w : 0;
}
const drive = new DriveSystem({
  scene,
  bldAt: (x, z) => bldAt(x, z),
  noise: (x, z, r) => noise(x, z, r),
  log: (m, c) => log(m, c || '#ddd'),
  power: () => UT.power,
  armor: () => (armor ? armor.list.map((a: any) => a.g.position) : []),
  skills: () => ROLE.skills,
  inv: () => player.inv,
  hurt: n => {
    player.hp -= n;
  },
  roadW: roadWAt,
});
const roadT = new RoadTiles({
  scene,
  base: import.meta.env.BASE_URL,
  bldAt: (x, z) => bldAt(x, z),
  power: () => UT.power,
  war: () => !PRO.on || PRO.stage >= 2,
  addSeg: s => addSeg(s as Seg),
  removeSeg: s => removeSeg(s as Seg),
});
const JN = new Set<string>();
const jk = (x: number, z: number) => Math.round(x) + ',' + Math.round(z);
function buildJunctions() {
  const cnt = new Map<string, number>();
  for (const r of roads)
    for (const q of r.p) {
      const k = jk(q[0], q[1]);
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  for (const [k, n] of cnt) if (n >= 2) JN.add(k);
}
const traffic = new Traffic({
  scene,
  junction: (x, z) => JN.has(jk(x, z)),
  green: (ux, uz) => roadT.green(ux, uz),
  player: () => player.pos,
  bldAt: (x, z) => bldAt(x, z),
  abandon: (kind, x, z, hd) => {
    const v = drive.spawn(kind, x, z, hd, Math.random, { key: Math.random() < 0.6 });
    if (!SPEC[kind].two) {
      const c = makeCont(
        'ab' + v.id,
        [x, z],
        'crate',
        undefined,
        Math.random() < 0.5 ? { water: 1, snack: 1 } : { tissue: 1, coffee: 1, bandage: 1 },
      );
      c.label = '棄置車內的物品';
      c.mesh.visible = false;
    }
  },
});
// ---- multiplayer glue (v20, local server only) ----
let net: import('./net').Net | null = null;
const MPQ = new URLSearchParams(location.search);
let MP: { base: string; code: string } | null = null;
const remRigs = new Map<string, Rig>(),
  enRigs = new Map<number, Rig>();
const remPrev = new Map<string, [number, number]>();
async function startNet() {
  if (!MP) return;
  const { Net } = await import('./net');
  net = new Net(MP.base, {
    onStatus: t => {
      const h = document.getElementById('mphud');
      if (h) h.textContent = '🌐 ' + t;
    },
    onCorrect: (x, z) => {
      if (!drive.cur) {
        player.pos.x = x;
        player.pos.z = z;
      }
    },
    onLog: l => {
      const m = l[l.length - 1];
      if (m) log('🌐 ' + m, '#8cf');
    },
  });
  const hud = document.createElement('div');
  hud.id = 'mphud';
  document.body.appendChild(hud);
  (window as any).__game.net = net;
  try {
    await net.join(MP.code, {
      name: ROLE.names[player.rig.f ? 1 : 0],
      role: ROLE.id,
      g: player.rig.f ? 'f' : 'm',
      x: player.pos.x,
      z: player.pos.z,
    });
  } catch (e) {
    hud.textContent = '🌐 連線失敗：' + (e as Error).message;
  }
}
function netFrame(dt: number) {
  if (!net || !net.s) return;
  net.update(dt, player.pos.x, player.pos.z, !!drive.cur);
  const s = net.s;
  for (const p of Object.values(s.players)) {
    if (p.id === net.you) continue;
    let r = remRigs.get(p.id);
    if (!r) {
      const rl = roleById(p.role);
      r = makeRig({ gender: p.g, ...rl.look[p.g], outfit: rl.id });
      scene.add(r.root);
      remRigs.set(p.id, r);
    }
    const q = net.remote(p.id) || [p.x, p.z];
    const pv = remPrev.get(p.id) || q;
    const sp = Math.hypot(q[0] - pv[0], q[1] - pv[1]) / Math.max(dt, 1e-3);
    remPrev.set(p.id, q);
    r.root.position.set(q[0], 0, q[1]);
    if (sp > 0.2) r.root.rotation.y = Math.atan2(q[0] - pv[0], q[1] - pv[1]);
    r.root.visible = p.on;
    animate(r, p.hp <= 0 ? 'death' : sp > 4 ? 'run' : sp > 0.3 ? 'walk' : 'idle', sp, dt);
  }
  for (const [id, r] of remRigs)
    if (!s.players[id]) {
      scene.remove(r.root);
      remRigs.delete(id);
    }
  for (const e of s.enemies) {
    let r = enRigs.get(e.id);
    if (!r) {
      r = makeRig({ gender: 'm', hair: 0x111111, top: 0x4c5733, bottom: 0x4c5733, shoes: 0x111111, soldier: true });
      scene.add(r.root);
      enRigs.set(e.id, r);
    }
    const o = r.root.position;
    const dx = e.x - o.x,
      dz = e.z - o.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
    o.x += dx * Math.min(1, dt * 10);
    o.z += dz * Math.min(1, dt * 10);
    if (Math.hypot(dx, dz) > 0.02) r.root.rotation.y = Math.atan2(dx, dz);
    animate(r, e.hp <= 0 ? 'death' : sp > 2 ? 'run' : sp > 0.2 ? 'walk' : 'idle', Math.min(sp, 4), dt);
  }
  const h = document.getElementById('mphud');
  if (h && net.status.startsWith('房間'))
    h.textContent = `🌐 ${net.status}｜${Object.values(s.players).filter(p => p.on).length}/4 人｜tick ${s.tick}｜${(net.bytes / 1024).toFixed(0)} kB 收`;
}
function netAttack() {
  if (!net?.s) return;
  let best = -1,
    bd = 1.9;
  for (const e of net.s.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
    if (d < bd) {
      bd = d;
      best = e.id;
    }
  }
  if (best >= 0) net.cmd({ t: 'attack', target: best } as any);
}
const WRECK_LOOT: [string, number][][] = [
  [
    ['water', 1],
    ['snack', 1],
  ],
  [
    ['bandage', 1],
    ['tissue', 1],
  ],
  [['gas', 2]],
  [
    ['patch', 1],
    ['hose', 1],
  ],
  [
    ['coffee', 1],
    ['noodle', 1],
  ],
  [['carbat', 1]],
];
function spawnDrivables(c: V2) {
  let sd = 977;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  let n = 0,
    bus = 0,
    gb = 0,
    dock = 0;
  const segs: [number, number, number, number, number][] = [];
  for (const rd of roads) {
    const w = ROADW[rd.t.replace('_link', '')] ?? 3;
    if (w < 4) continue;
    for (let i = 0; i < rd.p.length - 1; i++) {
      const [ax, az] = rd.p[i],
        [bx, bz] = rd.p[i + 1];
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      const d = Math.hypot(mx - c[0], mz - c[1]);
      if (d < 190 && Math.hypot(bx - ax, bz - az) > 8) segs.push([ax, az, bx, bz, w]);
    }
  }
  segs.sort(() => r() - 0.5);
  for (const [ax, az, bx, bz, w] of segs) {
    if (bus || w < 9) continue;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 16) continue;
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    const x = (ax + bx) / 2 - uz * (w / 2 - 1.6),
      z = (az + bz) / 2 + ux * (w / 2 - 1.6);
    if (bldAt(x, z)) continue;
    const v = drive.spawn('bus', x, z, Math.atan2(ux, uz), r);
    if (drive.blocked(v, x, z, v.hd)) {
      scene.remove(v.g);
      drive.list.pop();
      continue;
    }
    bus = 1;
  }
  for (const [ax, az, bx, bz, w] of segs) {
    if (n > 46) break;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L,
      uz = (bz - az) / L,
      nx = -uz,
      nz = ux;
    const hd = Math.atan2(ux, uz);
    const big = w >= 9;
    let kind: DKind = big
      ? (['taxi', 'sedan', 'sedan', 'van', 'kei', 'scooter', 'moto', 'delivery'] as DKind[])[Math.floor(r() * 8)]
      : (['scooter', 'scooter', 'escooter', 'moto', 'delivery', 'basket', 'kei'] as DKind[])[Math.floor(r() * 7)];
    if (big && !bus && r() < 0.3) {
      kind = 'bus';
      bus = 1;
    } else if (!gb && r() < 0.15) {
      kind = 'garbage';
      gb = 1;
    }
    const t = 0.25 + r() * 0.5,
      side = r() < 0.5 ? 1 : -1;
    const two = ['scooter', 'escooter', 'moto', 'delivery', 'basket'].includes(kind);
    const off = two ? w / 2 - 0.5 : w / 2 - 1.3;
    if (big && dock < 1 && r() < 0.25) {
      dock++;
      for (let k = 0; k < 4; k++) {
        const x = ax + ux * (L * t + k * 0.9) + nx * (w / 2 + 0.6) * side,
          z = az + uz * (L * t + k * 0.9) + nz * (w / 2 + 0.6) * side;
        if (bldAt(x, z)) continue;
        const v = drive.spawn('ubike', x, z, hd + Math.PI / 2, r, { docked: true });
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.9, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x2a9a8a }),
        );
        post.position.set(x + Math.sin(hd + Math.PI / 2) * 0.7, 0.45, z + Math.cos(hd + Math.PI / 2) * 0.7);
        scene.add(post);
        void v;
        n++;
      }
      continue;
    }
    const x = ax + ux * L * t + nx * off * side,
      z = az + uz * L * t + nz * off * side;
    if (bldAt(x, z)) continue;
    const v = drive.spawn(
      kind,
      x,
      z,
      two ? hd + (Math.PI / 2) * (r() < 0.7 ? 1 : 0) : hd + (r() < 0.5 ? Math.PI : 0),
      r,
    );
    if (drive.blocked(v, x, z, v.hd)) {
      scene.remove(v.g);
      drive.list.pop();
      continue;
    }
    n++;
  }
}
let lastHp = 100;
let parks: any = null;
let gmap: GameMap | null = null;
function mapIntelOutposts(lbl: string) {
  if (!gmap) return;
  checkpoints.forEach((c, i) => gmap!.intel('out' + i, c[0], c[1], 'out', lbl));
}
// ---------- weather: rain (visual drops, wet ground, optional sound) + rain buckets ----------
const WX = { rainNext: 15 * 60, rainUntil: 0, wet: 0, amt: 0 };
const NR = 2500;
const rainPos = new Float32Array(NR * 6);
const rainG = new THREE.BufferGeometry();
rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMesh = new THREE.LineSegments(
  rainG,
  new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0, depthWrite: false }),
);
rainMesh.frustumCulled = false;
for (let i = 0; i < NR; i++) {
  const x = (Math.random() - 0.5) * 70,
    y = Math.random() * 30,
    z = (Math.random() - 0.5) * 70;
  rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.05], i * 6);
}
let rainAudio: { g: GainNode } | null = null;
function startRainAudio() {
  try {
    const ac = new AudioContext();
    markMusic(ac);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.04;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
    rainAudio = { g };
  } catch {
    /* audio optional */
  }
}
const raining = () => gameMin < WX.rainUntil;
const bucketMat = new THREE.MeshStandardMaterial({ color: 0x2a6ab8, roughness: 0.5 });
const waterTopMat = new THREE.MeshStandardMaterial({ color: 0x6a8aa0, roughness: 0.1, metalness: 0.3 });
function makeBucket(id: string, p: V2, items: Record<string, number> = {}) {
  const c = makeCont(id, p, 'crate', undefined, items);
  (c.mesh.parent || scene).remove(c.mesh);
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.48, 14, 1, true), bucketMat);
  body.position.y = 0.24;
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14).rotateX(-Math.PI / 2), bucketMat);
  bot.position.y = 0.01;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2), waterTopMat);
  top.name = 'w';
  m.add(body, bot, top);
  bucketMat.side = THREE.DoubleSide;
  m.position.set(p[0], 0, p[1]);
  m.traverse(o => (o.castShadow = true));
  scene.add(m);
  c.mesh = m as any;
  c.label = '雨水桶';
  (c as any).rain = 0;
  return c;
}
function updateWeather(dt: number, gm: number) {
  if (gameMin >= WX.rainNext && !raining()) {
    WX.rainUntil = gameMin + 60 * (1.5 + rnd() * 4);
    WX.rainNext = WX.rainUntil + 60 * (8 + rnd() * 28);
    log('🌧 開始下雨了。外面的水桶會接到雨水。', '#9fd0ff');
  }
  const r = raining();
  WX.amt += ((r ? 1 : 0) - WX.amt) * Math.min(1, dt * 0.5);
  WX.wet = clamp(WX.wet + (r ? gm * 1.5 : -gm * 0.25), 0, 1);
  if (r)
    for (const c of conts)
      if (c.label === '雨水桶') {
        (c as any).rain += gm;
        if ((c as any).rain >= 0.75) {
          (c as any).rain = 0;
          if ((c.items.rainwater || 0) < 6) c.items.rainwater = (c.items.rainwater || 0) + 1;
        }
      }
  for (const c of conts)
    if (c.label === '雨水桶') {
      const w = (c.mesh as any).getObjectByName?.('w');
      if (w) {
        w.position.y = 0.04 + 0.4 * Math.min(1, (c.items.rainwater || 0) / 6);
        w.visible = !!c.items.rainwater;
      }
    }
  (rainMesh.material as THREE.LineBasicMaterial).opacity = WX.amt * 0.45;
  rainMesh.visible = WX.amt > 0.02;
  if (rainMesh.visible) {
    rainMesh.position.set(player.pos.x, 0, player.pos.z);
    const fall = dt * 22;
    for (let i = 0; i < NR; i++) {
      const o = i * 6;
      rainPos[o + 1] -= fall;
      rainPos[o + 4] -= fall;
      if (rainPos[o + 1] < 0) {
        rainPos[o + 1] += 30;
        rainPos[o + 4] += 30;
      }
    }
    rainG.attributes.position.needsUpdate = true;
  }
  const wet = WX.wet;
  roadMat.roughness = 0.95 - wet * 0.65;
  roadMat.metalness = wet * 0.25;
  roadMat.color.setScalar(1 - wet * 0.35);
  groundMat.roughness = 1 - wet * 0.55;
  groundMat.color.setScalar(1 - wet * 0.3);
  decay?.setWet(WX.wet);
  if (rainAudio) rainAudio.g.gain.value = WX.amt * 0.12;
}
// ---------- airdrop ----------
let smoke: THREE.Points | null = null;
let dropCont: Cont | null = null;

// ---------- 線人 informant + boat route ----------
type InfState = {
  fake: boolean;
  anc: number;
  spot: number;
  talked: number;
  rvT: number;
  scouted: number;
  saw: number;
  verified: number;
  trap: number;
  esc: number;
  hid: V2 | null;
  caught: number;
  elder: number;
  done: number;
};
let INF: InfState = {
  fake: false,
  anc: 0,
  spot: 0,
  talked: 0,
  rvT: 0,
  scouted: 0,
  saw: 0,
  verified: 0,
  trap: 0,
  esc: 0,
  hid: null,
  caught: 0,
  elder: 0,
  done: 0,
};
let infRig: Rig | null = null,
  elderRig: Rig | null = null;
let infPos: V2 = [0, 0],
  elderPos: V2 = [0, 0];
let RV: { p: V2; n: string }[] = [];
let trapT = 0,
  trapSols: Sol[] = [];
const infFx: THREE.Object3D[] = [];
const ANC = ['龍山寺廟口', '柑仔店後巷', '鄰里公園'];
function freeNear(p: V2, r = 3): V2 {
  for (let k = 0; k < 300; k++) {
    const a = k * 2.4,
      d = ((k * 0.15) % r) + 0.5;
    const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
    if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.8, q[1]) && !bldAt(q[0], q[1] + 0.8)) return q;
  }
  return p;
}
function setupInformant(st: V2, first: boolean) {
  if (first)
    INF = {
      ...INF,
      fake: Math.random() < 0.3,
      anc: Math.floor(Math.random() * 3),
      spot: Math.floor(Math.random() * 3),
    };
  const z0 = st[1];
  RV = [
    ['淡水河岸', -220, -70],
    ['碼頭（大稻埕式）', -70, 70],
    ['萬華河堤缺口', 70, 220],
  ].map(([n, a, b]) => {
    let best: V2 | null = null;
    for (const r of roads)
      for (const q of r.p)
        if (
          q[1] - z0 > (a as number) &&
          q[1] - z0 < (b as number) &&
          q[0] > bounds.minx + 8 &&
          !bldAt(q[0], q[1]) &&
          (!best || q[0] < best[0])
        )
          best = q;
    return { n: n as string, p: freeNear(best || [bounds.minx + 20, z0]) };
  });
  const near = roads
    .flatMap(r => r.p)
    .filter(q => Math.hypot(q[0] - st[0], q[1] - st[1]) > 25 && Math.hypot(q[0] - st[0], q[1] - st[1]) < 90);
  const pk = parks?.clusters?.[0] as V2 | undefined;
  const base: V2 =
    INF.anc === 2 && pk
      ? pk
      : near.length
        ? near[Math.floor(hh2i(INF.anc * 7 + 3) * near.length)]
        : [st[0] + 20, st[1]];
  infPos = INF.hid || freeNear(base);
  elderPos = freeNear([st[0] + 9, st[1] - 6]);
  infRig = spawnRig({
    gender: 'm',
    hair: 0x1a1a1a,
    top: 0x4a4038,
    bottom: 0x2a2a30,
    shoes: 0x202020,
    jacket: 0x3a3428,
  });
  infRig.root.position.set(infPos[0], 0, infPos[1]);
  elderRig = spawnRig({ gender: 'm', hair: 0xcccccc, top: 0xe8e2d4, bottom: 0x3a4050, shoes: 0x6a5a40 });
  elderRig.root.position.set(elderPos[0], 0, elderPos[1]);
  if (INF.caught || INF.done) infRig.root.visible = false;
}
const hh2i = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5;
  return x - Math.floor(x);
};
const hhmm = (m: number) =>
  `第 ${Math.floor(m / 1440) + 1} 天 ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:00`;
function dlg(title: string, text: string, btns: [string, () => void][]) {
  let d = document.getElementById('dlg');
  if (!d) {
    d = document.createElement('div');
    d.id = 'dlg';
    document.body.appendChild(d);
  }
  d.innerHTML = `<b>${title}</b><p>${text}</p><div></div>`;
  const bx = d.lastElementChild!;
  for (const [l, f] of btns.concat([['離開', () => {}]])) {
    const b = document.createElement('button');
    b.textContent = l;
    b.onclick = () => {
      d!.remove();
      f();
    };
    bx.appendChild(b);
  }
}
function rvLine() {
  const r = RV[INF.spot];
  const sec = sectorNames[sectorOf(r.p[0], r.p[1])] || '萬華';
  return INF.fake
    ? `${hhmm(INF.rvT)}，${r.n}。走「萬華中正一路」最快，過了第三個紅綠燈就到。<b>一個人來，武器全部留下</b>，帶槍的船不載。別跟任何人說。`
    : `${hhmm(INF.rvT)}，${r.n}（${sec}一帶）。從西園路尾走環河南路，過了水門沿堤防往下，鐵板下面就是。船只等十分鐘，水和藥帶在身上，刀也帶著。`;
}
function talkInformant() {
  if (INF.hid && !INF.caught) {
    INF.caught = 1;
    infRig!.root.visible = false;
    const reveal = Math.random() < 0.5;
    addItem('a556', 20);
    if (reveal) {
      INF.fake = false;
      INF.spot = (INF.spot + 1) % 3;
      INF.rvT = nextNight();
      INF.trap = 0;
      INF.esc = 0;
      INF.scouted = 0;
      dlg('抓到叛徒線人', `他跪地求饒：「我說、我說！真的船在 ${RV[INF.spot].n}，${hhmm(INF.rvT)}！」`, []);
    } else {
      const sec = Math.min(NSEC - 1, sectorOf(infPos[0], infPos[1]));
      for (const s of sols)
        if (s.sector === sec && s.state !== 'dead' && Math.random() < 0.5) {
          s.state = 'dead';
          s.hp = 0;
          s.mesh.visible = false;
          s.cone.visible = false;
        }
      liberated.add(sec);
      dlg(
        '抓到叛徒線人',
        `他供出了 ${sectorNames[sec]} 的佔領軍前哨位置。地下抵抗網連夜突襲——<b>${sectorNames[sec]} 已奪回！</b>`,
        [],
      );
    }
    return;
  }
  if (INF.done) return;
  if (!INF.talked) {
    INF.talked = 1;
    INF.rvT = nextNight();
  }
  const opts: [string, () => void][] = [];
  if (!INF.verified) opts.push(['用收音機向「自由之聲」查證', verifyInf]);
  dlg('🕶 線人（' + ANC[INF.anc] + '）', '「噓——聽說你想離開台北？有艘橡皮艇今晚走淡水河出海。」<br>' + rvLine(), opts);
}
function nextNight() {
  const d = Math.floor(gameMin / 1440) * 1440;
  let t = d + 22 * 60;
  if (gameMin > t - 60) t += 1440;
  return t;
}
function verifyInf() {
  const cost = player.inv.radio
    ? ['radio']
    : ['water', 'can', 'ration', 'noodle', 'cupnoodle', 'rice'].filter(k => player.inv[k]).slice(0, 2);
  if (!player.inv.radio && cost.length < 2) {
    log('需要收音機，或兩份食物／水交換頻道時段', '#f99');
    return;
  }
  for (const k of cost) {
    if (--player.inv[k] <= 0) delete player.inv[k];
  }
  INF.verified = 1;
  if (INF.fake) INF.saw = 1;
  phone(
    '📻 自由之聲（加密頻道）',
    INF.fake
      ? '我們沒有派人在那裡接應。那個人是佔領軍的線民——別去，或者……讓他們嚐嚐自己的陷阱。'
      : '確認：那艘船是我們的人。準時到，祝你平安。',
  );
}
function talkElder() {
  INF.elder = 1;
  dlg(
    '👴 廟口阿伯',
    INF.fake
      ? '「那個戴鴨舌帽的少年仔？講話不是萬華腔，連華西街在哪都說不清楚，還一直問誰家有槍……你自己卡注意。」'
      : '「那個人喔，以前在華西街幫人顧攤，嘴巴緊。他講的話可以信。」',
    [],
  );
}
function npcInteract() {
  const P = player.pos;
  if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4) {
    talkInformant();
    return true;
  }
  if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4) {
    talkElder();
    return true;
  }
  return false;
}
function npcPrompt() {
  const P = player.pos;
  if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4)
    return INF.hid ? '[E] 抓住叛徒線人' : '[E] 和線人交談';
  if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4) return '[E] 和廟口阿伯聊天';
  return '';
}
function infMark(p: V2, col: number, txt: string) {
  gmap?.intel('inf' + Math.round(p[0]) + ',' + Math.round(p[1]), p[0], p[1], 'dng', txt.slice(0, 14));
  const r = new THREE.Mesh(
    new THREE.RingGeometry(5, 6, 32),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  r.rotation.x = -Math.PI / 2;
  r.position.set(p[0], 0.07, p[1]);
  scene.add(r);
  infFx.push(r);
  log(txt, '#ffb0a0');
}
function springTrap(aware: boolean) {
  const p = RV[INF.spot].p;
  INF.trap = 1;
  trapT = aware ? 0 : 3;
  const cand = sols
    .filter(s => s.state !== 'dead' && !s.post)
    .sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1]))
    .slice(0, 4);
  trapSols = cand;
  cand.forEach((s, i) => {
    const a = i * 1.57 + 0.4;
    s.pos.set(p[0] + Math.cos(a) * 16, 0, p[1] + Math.sin(a) * 16);
    s.mesh.visible = true;
    if (aware) {
      s.state = 'patrol';
      s.post = [s.pos.x, s.pos.z];
      s.route = [
        [s.pos.x, s.pos.z],
        [s.pos.x + 1, s.pos.z],
      ];
    } else {
      s.state = 'investigate';
      s.target = [p[0], p[1]];
      s.timer = 600;
    }
  });
  const van = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a }));
  van.position.set(p[0] + 7, 1, p[1] + 3);
  van.castShadow = true;
  scene.add(van);
  infFx.push(van);
  if (aware) {
    const c = makeCont('ambush', [p[0] + 7, p[1] + 6.5], 'crate', undefined, {
      rifle: 1,
      a556: 40,
      medkit: 1,
      ration: 2,
    });
    c.label = '伏兵裝備箱';
    log('你看穿了陷阱：伏兵還沒發現你。反伏擊，拿走他們的裝備！', '#ffd27a');
  } else {
    phone('⚠ 陷阱！', '岸邊四周的手電筒同時亮起——沒有船。快跑！鑽進巷子、騎樓，或者跳進河裡！');
    slowDown('陷阱');
  }
}
function updateInformant(dt: number) {
  if (!infRig) return;
  const P = player.pos;
  for (const [rg, q] of [
    [infRig, infPos],
    [elderRig!, elderPos],
  ] as const) {
    rg.root.rotation.y = Math.atan2(P.x - q[0], P.z - q[1]);
    animate(rg, 'idle', 0, dt);
  }
  if (!INF.talked || INF.done) return;
  const r = RV[INF.spot];
  const d = Math.hypot(P.x - r.p[0], P.z - r.p[1]);
  if (!INF.scouted && d < 30 && gameMin < INF.rvT - 30) {
    INF.scouted = 1;
    if (INF.fake) {
      INF.saw = 1;
      const v = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a }));
      v.position.set(r.p[0] + 7, 1, r.p[1] + 3);
      scene.add(v);
      infFx.push(v);
      log('偵察：岸邊停著一台沒熄火的廂型車，泥地上沒有任何拖船痕跡……不對勁。', '#ffb0a0');
    } else {
      const b = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.6, 2.4, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
      );
      b.rotation.z = Math.PI / 2;
      b.position.set(r.p[0] - 3, 0.4, r.p[1]);
      scene.add(b);
      infFx.push(b);
      log('偵察：堤防下藏著一艘橡皮艇，泥地有新鮮的拖行痕跡。', '#a0ffb0');
    }
  }
  const win = gameMin >= INF.rvT && gameMin < INF.rvT + 180;
  if (win && d < 6 && !INF.trap && !INF.esc) {
    if (INF.fake) springTrap(!!INF.saw);
    else {
      INF.done = 1;
      doEvac('boat');
      return;
    }
  }
  if (INF.trap && !INF.esc) {
    if (trapT > 0) {
      trapT -= dt;
      if (trapT <= 0)
        trapSols.forEach(s => {
          if (s.state !== 'dead') {
            s.state = 'combat';
            s.alert = 1;
          }
        });
    }
    const river = P.x < bounds.minx + 3;
    if (!INF.saw && (d > 45 || river)) {
      INF.esc = 1;
      infMark(
        r.p,
        0xff2020,
        river
          ? '你跳進冰冷的淡水河，順流漂離伏擊點。此處標記為危險區。'
          : '你甩掉了追兵。此處標記為危險區——佔領軍掌握了你的行蹤。',
      );
      if (river) P.x = bounds.minx + 6;
      sols
        .filter(s => s.state !== 'dead' && !s.post)
        .slice(0, 4)
        .forEach(s => {
          s.state = 'investigate';
          s.target = [P.x, P.z];
          s.timer = 600;
        });
      INF.hid = freeNear([infPos[0] + 40 * (Math.random() - 0.5), infPos[1] + 40 * (Math.random() - 0.5)]);
      infPos = INF.hid;
      infRig.root.position.set(infPos[0], 0, infPos[1]);
      phone(
        '📻 自由之聲',
        `有人看到那個出賣你的線人躲在 ${sectorNames[sectorOf(infPos[0], infPos[1])]} 一帶。抓住他！`,
      );
    }
    if (INF.saw && trapSols.every(s => s.state === 'dead')) {
      INF.esc = 1;
      log('伏兵全滅。叛徒線人逃回街區躲了起來……', '#ffd27a');
      INF.hid = freeNear([infPos[0] + 30, infPos[1] - 20]);
      infPos = INF.hid;
      infRig.root.position.set(infPos[0], 0, infPos[1]);
    }
  }
}
function airdrop(at?: V2) {
  let p: V2 | null = at || null;
  for (let k = 0; !p && k < 200; k++) {
    const a = rnd() * Math.PI * 2,
      d = 45 + rnd() * 30;
    const q: V2 = [player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d];
    if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 1.5, q[1]) && !bldAt(q[0], q[1] + 1.5)) p = q;
  }
  if (!p) return;
  (UT as any).ad = p;
  dropCont = makeCont('airdrop', p, 'crate', undefined, {
    medkit: 2,
    ration: 4,
    water: 4,
    bandage: 3,
    pistol: 1,
    a9: 24,
    can: 3,
    fpv: 1,
    ...(ROC.unlocked
      ? { t91: 1, stanag: 2, a556n: 30, at4: 1, ...(Math.random() < 0.25 ? { jav: 1, javm: 1 } : {}) }
      : {}),
  });
  dropCont.label = '空投物資箱';
  dropCont.mesh.scale.set(1.6, 2.4, 1.6);
  dropCont.mesh.position.y = 0.48;
  const N = 160;
  const g = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++)
    pp.set([p[0] + (Math.random() - 0.5), Math.random() * 14, p[1] + (Math.random() - 0.5)], i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  smoke = new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: 0xff3a2a, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  smoke.frustumCulled = false;
  scene.add(smoke);
  // PLA contests the drop: nearest active patrols head there
  const cand = sols
    .filter(s => s.state !== 'dead' && !s.post && (!s.night || isNight()))
    .sort((a, b) => Math.hypot(a.pos.x - p![0], a.pos.z - p![1]) - Math.hypot(b.pos.x - p![0], b.pos.z - p![1]))
    .slice(0, 4);
  cand.forEach((s, i) => {
    if (Math.hypot(s.pos.x - p![0], s.pos.z - p![1]) > 60) {
      const a = i * 1.6;
      s.pos.set(p![0] + Math.cos(a) * 32, 0, p![1] + Math.sin(a) * 32);
    }
    s.state = 'investigate';
    s.target = [p![0] + (rnd() - 0.5) * 4, p![1] + (rnd() - 0.5) * 4];
    s.timer = 900;
  });
  slowDown('空投落地');
}
function updateSmoke(dt: number) {
  if (!smoke) return;
  const a = smoke.geometry.attributes.position as THREE.BufferAttribute;
  const pp = a.array as Float32Array;
  const p = (UT as any).ad as V2;
  for (let i = 0; i < pp.length; i += 3) {
    pp[i + 1] += dt * 2.2;
    pp[i] += dt * 0.8;
    if (pp[i + 1] > 16) {
      pp[i] = p[0] + (Math.random() - 0.5);
      pp[i + 1] = 0.5;
      pp[i + 2] = p[1] + (Math.random() - 0.5);
    }
  }
  a.needsUpdate = true;
  if (dropCont && !Object.keys(dropCont.items).length) {
    scene.remove(smoke);
    smoke = null;
  }
}
// ---------- PLA flashlights during curfew ----------
const plaFlash: THREE.SpotLight[] = [];
let gameMin = 8 * 60; // minutes since day 1 00:00
const isNight = () => {
  const h = (gameMin / 60) % 24;
  return h < 6 || h >= 20;
}; // 宵禁 20:00–06:00
// ---------- time system (PZ-style): day length + fast-forward ----------
let DAYH = 1;
const MPS = () => 1440 / (DAYH * 3600); // game minutes per real second
let speed = 1;
let metro: Station[] = [];
let paused = false;
let NOSAVE = false;
// v22 survival layer state (saved; day events seeded by day number)
let surv: SV.SurvState = SV.newSurv();
let survOpen = false;
let survDay = -1; // v21.5.1 menu pause (local only)
const SPEEDS = [1, 3, 20];
function dangerNear() {
  return sols.some(
    s =>
      s.state !== 'dead' &&
      s.mesh.visible &&
      (s.state === 'combat' ||
        (s.state === 'investigate' && s.pos.distanceTo(player.pos) < 40) ||
        s.pos.distanceTo(player.pos) < 18),
  );
}
function renderSpeed() {
  const el = document.getElementById('speed');
  if (!el) return;
  el.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', +(b as HTMLElement).dataset.s! === (player.sleeping ? 20 : speed)),
  );
  (el.querySelector('.st') as HTMLElement).textContent = player.sleeping
    ? '💤 睡眠快轉'
    : speed > 1
      ? `⏩ ×${speed}`
      : '▶ ×1';
}
function setSpeed(v: number) {
  if (v > 1 && dangerNear()) {
    log('附近有敵情，無法快轉', '#f99');
    v = 1;
  }
  speed = v;
  renderSpeed();
}
function slowDown(why: string) {
  if (speed > 1) {
    speed = 1;
    log(`⏸ 時間恢復正常：${why}`, '#ffb060');
    renderSpeed();
  }
  if (player.sleeping) {
    player.sleeping = false;
    log(`你被驚醒了！（${why}）`, '#f66');
    renderSpeed();
  }
}
function noise(x: number, z: number, r: number) {
  if (started && r >= 10) {
    const d = Math.hypot(player.pos.x - x, player.pos.z - z);
    if (d > 1.5 && d < r + 10) slowDown('附近有聲響');
  }
  for (const s of sols)
    if (s.state !== 'dead' && s.state !== 'combat' && (!s.night || isNight()) && s.mesh.visible) {
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < r) {
        s.state = 'investigate';
        s.target = [x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3];
        s.timer = 20;
      }
    }
}
function log(msg: string, col = '#e8e2d0') {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.color = col;
  $('log').prepend(d);
  setTimeout(() => (d.style.opacity = '0'), 7000);
  setTimeout(() => d.remove(), 8200);
  while ($('log').children.length > 8) $('log').lastChild!.remove();
}

// ---------- effects ----------
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true });
const fx: { o: THREE.Object3D; t: number }[] = [];
function tracer(a: THREE.Vector3, b: THREE.Vector3) {
  const g = new THREE.BufferGeometry().setFromPoints([a.clone().setY(1.2), b.clone().setY(1.2)]);
  const l = new THREE.Line(g, tracerMat);
  scene.add(l);
  fx.push({ o: l, t: 0.08 });
}

// ---------- input ----------
initJoystick(MOBILE);
const keys: Record<string, boolean> = {};
let mouse = new THREE.Vector2();
let clicking = false;
// v21.5.1 portrait thumb buttons: 打 held = fire at the nearest target, 撤 = retreat sprint for a moment
const MB = { fire: false, retreat: 0 };
addEventListener('keydown', e => {
  // v22.4: Esc backs out of whatever is on top (modal → shop/ride → shelter → map → panel), else opens the pause menu
  if (e.code === 'Escape') {
    e.preventDefault();
    if (fpv?.active) return;
    escBack();
    return;
  }
  if (modalOpen() || pauseOpen()) return;
  keys[e.code] = true;
  const is = (a: string) => isKey(e.code, a);
  if (started && is('map')) {
    gmap?.toggle();
    return;
  }
  if (is('inv')) {
    e.preventDefault();
    toggleInv();
  }
  if (!started) return;
  if (is('sneak')) {
    player.sneak = !player.sneak;
    log(player.sneak ? '進入潛行' : '解除潛行');
  }
  if (is('interact')) interact();
  if (is('barricade')) barricade();
  if (is('sleep')) sleep();
  if (is('speed1')) setSpeed(1);
  if (is('speed2')) setSpeed(3);
  if (is('speed3')) setSpeed(20);
  if (is('light')) {
    player.light = !player.light;
  }
  if (is('vault')) {
    e.preventDefault();
    tryVault();
  }
  if (is('shove')) shove();
  if (is('cover')) toggleCover();
  if (is('shelter')) survOpen ? closeSurv() : openSurv('home');
});
/** close the top-most overlay; returns false when nothing was open */
function closeTop(): boolean {
  if (modalOpen()) return (closeModal(), true);
  for (const id of ['shop', 'ride']) {
    const el = document.getElementById(id);
    if (el) return (el.remove(), true);
  }
  if (survOpen) return (closeSurv(), true);
  if (gmap?.open) return (gmap.toggle(false), true);
  if (panelOpen) return (closePanel(), true);
  return false;
}
function escBack() {
  if (closeTop()) return;
  if (started && !dead) togglePause();
  else if (!started) (window as any).__titleBack?.();
}
// ---- v22.4 pause menu (Esc / ☰). In multiplayer only the menu is local: the shared world keeps running ----
let pauseEl: HTMLElement | null = null;
const pauseOpen = () => !!pauseEl && !pauseEl.classList.contains('hidden');
function togglePause(on = !pauseOpen()) {
  if (!pauseEl) {
    pauseEl = document.createElement('div');
    pauseEl.id = 'pmenu';
    pauseEl.className = 'hidden';
    pauseEl.innerHTML =
      '<b>⏸ 已暫停</b><em id="pmp"></em>' +
      [
        ['go', '繼續'],
        ['save', '存檔'],
        ['load', '讀檔'],
        ['map', '地圖'],
        ['surv', '避難所'],
        ['set', '設定'],
        ['help', '操作說明'],
        ['quit', '返回主選單'],
      ]
        .map(([a, t]) => `<button data-a="${a}">${t}</button>`)
        .join('');
    pauseEl.querySelectorAll('button').forEach(
      b =>
        ((b as HTMLElement).onclick = () => {
          const a = (b as HTMLElement).dataset.a;
          if (a === 'go') togglePause(false);
          else if (a === 'save') {
            save();
            log('已存檔', '#9f9');
            b.textContent = '已存檔 ✓';
            setTimeout(() => (b.textContent = '存檔'), 1200);
          } else if (a === 'load') {
            if (!localStorage.getItem(SAVE)) return log('沒有存檔', '#f99');
            if (!confirm('讀取上次存檔？目前未存的進度會遺失。')) return;
            sessionStorage.setItem('dt.autoload', '1');
            NOSAVE = true;
            location.reload();
          } else if (a === 'map') {
            togglePause(false);
            gmap?.toggle();
          } else if (a === 'surv') {
            togglePause(false);
            openSurv('home');
          } else if (a === 'set') openSettings();
          else if (a === 'help') openHelp();
          else if (a === 'quit') {
            if (!confirm('返回主選單？進度會自動存檔。')) return;
            save();
            NOSAVE = true;
            location.reload();
          }
        }),
    );
    document.body.appendChild(pauseEl);
  }
  pauseEl.classList.toggle('hidden', !on);
  ($('pmp') as HTMLElement).textContent = on && MP ? '多人連線中：只有你的畫面暫停，世界仍在進行' : '';
  paused = on && !MP;
  if (on) for (const k in keys) keys[k] = false;
}
addEventListener('keyup', e => (keys[e.code] = false));
addEventListener('mousemove', e => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener('mousedown', e => {
  if (e.button === 0 && !fpv?.active) clicking = true;
});
addEventListener('mouseup', () => (clicking = false));
addEventListener('wheel', e => {
  zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.2);
  resize();
});
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
const aimPt = new THREE.Vector3();

// ---------- inventory / loot UI ----------
let panelOpen = false;
const weight = () => Object.entries(player.inv).reduce((s, [k, n]) => s + ITEMS[k].w * n, 0);
function addItem(k: string, n = 1) {
  player.inv[k] = (player.inv[k] || 0) + n;
}
function useItem(k: string) {
  const d = ITEMS[k];
  if (!player.inv[k]) return;
  if (d.kind === 'melee' || d.kind === 'gun') {
    player.equip = player.equip === k ? '' : k;
    log(player.equip ? `裝備了 ${d.name}` : '收起武器');
  } else if (k === 'rocradio_b') {
    const ok = player.inv.lipo && (player.inv.vtx || player.inv.lipo >= 2 || ROLE.skills.repair);
    if (!ok) {
      log('修理需要：鋰電池＋圖傳模組（或 2 顆鋰電池）', '#f99');
      return;
    }
    const use = ROLE.skills.repair ? ['lipo'] : player.inv.vtx ? ['lipo', 'vtx'] : ['lipo', 'lipo'];
    for (const q of use) {
      if (--player.inv[q] <= 0) delete player.inv[q];
    }
    delete player.inv[k];
    addItem('rocradio', 1);
    mapIntelOutposts('解放軍哨點（國軍情資）');
    if (evac) gmap?.intel('evac0', evac.pos[0], evac.pos[1], 'evac', '撤離點（國軍）');
    log('📻 無線電修好了！可以呼叫國軍裝甲支援（通話會引來巡邏）', '#9f9');
  } else if (k === 'tmap') {
    if (--player.inv[k] <= 0) delete player.inv[k];
    const si = Math.floor(Math.random() * NSEC);
    const x0 = SECTORS[si].x - 250,
      z0 = SECTORS[si].z - 250;
    gmap?.revealRect(x0, z0, x0 + 500, z0 + 500);
    checkpoints.forEach((c, n) => {
      if (sectorOf(c[0], c[1]) === si) gmap?.intel('out' + n, c[0], c[1], 'out', '解放軍哨點');
    });
    for (const c of conts.filter(c => c.p && sectorOf(c.p[0], c.p[1]) === si).slice(0, 3))
      gmap?.intel('sup' + c.id, c.p[0], c.p[1], 'sup', '手繪：物資');
    gmap?.save();
    log(`📜 攤開手繪地圖：${SECTOR_LABEL(si)} 街區的巷弄與哨點已標上地圖（按 M）`, '#ffd27a');
    closePanel();
  } else if (k === 'rocradio') {
    callSupport();
    closePanel();
  } else if (k === 'fpv') {
    if (bldAt(player.pos.x, player.pos.z)) {
      log('在室內無法起飛，先到戶外', '#f99');
      return;
    }
    if (--player.inv[k] <= 0) delete player.inv[k];
    closePanel();
    launchFPV();
  } else if (k === 'frame') {
    const need: Record<string, number> = { frame: 1, dmotor: 4, lipo: 1, vtx: 1, grenade: 1 };
    const miss = Object.entries(need)
      .filter(([q, n]) => (player.inv[q] || 0) < n)
      .map(([q, n]) => `${ITEMS[q].name}×${n - (player.inv[q] || 0)}`);
    if (miss.length) {
      log('還缺：' + miss.join('、'), '#f99');
      return;
    }
    for (const [q, n] of Object.entries(need)) {
      player.inv[q] -= n;
      if (player.inv[q] <= 0) delete player.inv[q];
    }
    addItem('fpv', 1);
    log('組好了一架 FPV 自殺無人機！', '#9f9');
  } else if (d.mag && d.ammo) {
    player.inv[d.ammo] = (player.inv[d.ammo] || 0) + d.mag;
    if (--player.inv[k] <= 0) delete player.inv[k];
    log(`退出 ${d.mag} 發 ${ITEMS[d.ammo].name}`);
  } else if (d.kind === 'food' || d.kind === 'drink' || d.kind === 'med') {
    player.hunger = clamp(player.hunger + (d.hunger || 0), 0, 100);
    player.thirst = clamp(player.thirst + (d.thirst || 0), 0, 100);
    player.fatigue = clamp(player.fatigue + (d.fatigue || 0), 0, 100);
    player.hp = clamp(player.hp + (d.hp || 0) * (d.kind === 'med' ? (ROLE.skills.medic ?? 1) : 1), 0, 100);
    if (d.stopBleed && player.bleed) {
      player.bleed = false;
      log('止血了', '#9f9');
    }
    log(`使用了 ${d.name}`);
    if (--player.inv[k] <= 0) delete player.inv[k];
  } else if (k === 'bucket') {
    if (bldAt(player.pos.x, player.pos.z)) {
      log('水桶要放在戶外（沒有屋頂遮的地方）才接得到雨', '#f99');
      return;
    }
    makeBucket('pb' + Date.now(), [player.pos.x + 0.6, player.pos.z]);
    if (--player.inv[k] <= 0) delete player.inv[k];
    log('放下了水桶，下雨時會慢慢裝滿雨水', '#9fd0ff');
  } else log(k === 'plank' || k === 'hammer' ? '靠近門口按 B 封門（需要木板與鐵鎚）' : '子彈會在開槍時自動使用');
  renderPanel();
}
let curCont: Cont | null = null;
function renderPanel() {
  if (!panelOpen) return;
  const p = $('panel');
  p.innerHTML = '';
  const col = (title: string) => {
    const c = document.createElement('div');
    c.className = 'col';
    c.innerHTML = `<h3>${title}</h3>`;
    p.appendChild(c);
    return c;
  };
  const inv = col(`背包（${weight().toFixed(1)} / 15 kg）`);
  for (const [k, n] of Object.entries(player.inv)) {
    const d = ITEMS[k];
    const e = document.createElement('div');
    e.className = 'it';
    e.innerHTML = `<span><img src="${iconURL(k)}">${d.name}${d.cal ? `<small style="opacity:.6"> ${d.cal}${d.cap ? `・${d.cap}發` : ''}・${d.w}kg</small>` : ''}${player.equip === k ? ' ★' : ''} ×${n}</span><small>${{ food: '食用', drink: '飲用', med: '治療', melee: '裝備', gun: '裝備', ammo: '彈藥', tool: '工具' }[d.kind]}</small>`;
    e.title = d.desc || '';
    e.onclick = () => useItem(k);
    inv.appendChild(e);
  }
  if (!Object.keys(player.inv).length) inv.innerHTML += '<small>空的</small>';
  if (curCont) {
    const c = col(curCont.label);
    const cc = curCont;
    for (const [k, n] of Object.entries(cc.items)) {
      const e = document.createElement('div');
      e.className = 'it';
      e.innerHTML = `<span><img src="${iconURL(k)}">${ITEMS[k].name} ×${n}</span><small>拿取</small>`;
      e.title = ITEMS[k].desc || '';
      e.onclick = () => take(cc, k);
      c.appendChild(e);
    }
    if (!Object.keys(cc.items).length) c.innerHTML += '<small>已經搜刮一空</small>';
    const b = document.createElement('button');
    b.textContent = '全部拿取';
    b.onclick = () => {
      for (const k of Object.keys(cc.items)) take(cc, k, true);
      renderPanel();
    };
    c.appendChild(b);
  }
  const close = document.createElement('button');
  close.textContent = '關閉 (Esc)';
  close.onclick = closePanel;
  p.lastElementChild!.appendChild(close);
}
function take(c: Cont, k: string, all = false) {
  const n = all ? c.items[k] : ITEMS[k].kind === 'ammo' ? c.items[k] : 1;
  if (weight() + ITEMS[k].w * n > 15) {
    log('背包太重了', '#f99');
    return;
  }
  addItem(k, n);
  c.items[k] -= n;
  if (c.items[k] <= 0) delete c.items[k];
  if (c.id[0] === 't' && c.id.includes(':')) {
    const [key, i] = c.id.slice(1).split(':');
    district.save(key, 'c', { ...(district.saved[key]?.c || {}), [i]: c.items });
  }
  const gm = (c as any).gunMesh;
  if (gm && !Object.keys(c.items).some(q => ITEMS[q].kind === 'gun' || ITEMS[q].mag)) gm.visible = false;
  updateVis(c);
  if (!all) renderPanel();
}
function toggleInv() {
  if (!started) return;
  if (panelOpen) closePanel();
  else {
    curCont = null;
    panelOpen = true;
    $('panel').classList.remove('hidden');
    renderPanel();
  }
}
function closePanel() {
  panelOpen = false;
  curCont = null;
  $('panel').classList.add('hidden');
}

function contDist(c: Cont) {
  let x = c.p[0],
    z = c.p[1];
  if (c.half && c.axis) {
    const t = clamp((player.pos.x - x) * c.axis[0] + (player.pos.z - z) * c.axis[1], -c.half, c.half);
    x += c.axis[0] * t;
    z += c.axis[1] * t;
  }
  return Math.hypot(x - player.pos.x, z - player.pos.z);
}
function nearestCont() {
  let best: Cont | null = null,
    bd = 1.5;
  for (const c of conts) {
    if (Math.abs(c.p[0] - player.pos.x) > 6 || Math.abs(c.p[1] - player.pos.z) > 6) continue;
    if (UT.power && SHOP_LOOT.test(c.id)) continue;
    const d = contDist(c);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
function updateVis(c: Cont) {
  if (!c.vis || !c.init) return;
  for (const v of c.vis) {
    const init = c.init[v.item] || 1;
    v.im.count = Math.ceil(v.max * clamp((c.items[v.item] || 0) / init, 0, 1));
  }
}
function nearestDoor() {
  let best: Door | null = null,
    bd = 2.2;
  for (const d of doors) {
    const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z);
    if (x < bd) {
      bd = x;
      best = d;
    }
  }
  return best;
}
let pendingCont: Cont | null = null;
function atHome() {
  const h = surv.home;
  return !!h && Math.hypot(player.pos.x - h[0], player.pos.z - h[1]) < 4;
}
function tradeAt() {
  return SV.TRADE_SPOTS.find(t => Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 4) || null;
}
function closeSurv() {
  survOpen = false;
  document.getElementById('surv')?.remove();
}
const iname = (k: string) => ITEMS[k]?.name || k;
const costTxt = (c: Record<string, number>) =>
  Object.entries(c)
    .map(([k, n]) => `${iname(k)}×${n}`)
    .join('、');
/** v22 overlay: home shelter / barter stall / moral choice */
function openSurv(kind: 'home' | 'trade' | 'moral') {
  closeSurv();
  survOpen = true;
  const d = document.createElement('div');
  d.id = 'surv';
  const S = surv;
  const btn = (a: string, t: string, dis = false) => `<button data-a="${a}"${dis ? ' disabled' : ''}>${t}</button>`;
  const render = () => {
    let h = '';
    if (kind === 'home') {
      const here = atHome();
      h += `<h3>🏠 避難所・第 ${S.day} 天 ${SV.isNight(gameMin) ? '🌙 夜晚（出去搜刮）' : '☀ 白天（巡邏多，留在家）'}</h3>`;
      h += `<p>${S.ev || ''}　平均心情 ${SV.avgMood(S)}　物資緊縮 ×${S.scarcity.toFixed(2)}　良心 ${S.karma}</p><table>`;
      for (const g of S.group)
        h += `<tr class="${g.dead ? 'dead' : g.here ? '' : 'away'}"><td><b>${g.name}</b><br><small>${g.role}</small></td><td>${
          g.dead
            ? '💀 已過世'
            : g.here
              ? `飽 ${Math.round(g.hunger)}｜病 ${Math.round(g.sick)}｜傷 ${Math.round(g.hurt)}｜心情 ${Math.round(g.mood)}`
              : '還沒來'
        }</td></tr>`;
      h += `</table><p>存糧：${
        Object.entries(S.stash)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${iname(k)}×${n}`)
          .join('、') || '空的'
      }</p>`;
      h += '<div class="row">';
      for (const [k, u] of Object.entries(SV.UPG)) {
        const has = S.upg[k as SV.Upg];
        const ok = Object.entries(u.cost).every(([i, n]) => (player.inv[i] || 0) >= n);
        h += btn(
          'u:' + k,
          has ? `✔ ${u.name}` : `${u.name}<small>${costTxt(u.cost)}｜${u.desc}</small>`,
          !!has || !ok || !here,
        );
      }
      h += '</div><div class="row">';
      h +=
        btn('dep', '把食物／水／藥放進存糧', !here) + btn('pray', '🙏 神明廳拜拜', !here) + btn('x', '關閉') + '</div>';
      if (!here) h += '<p><em>回到家（出生點）才能建造和存放。</em></p>';
      h += `<ul>${S.log
        .slice(0, 6)
        .map(t => `<li>${t}</li>`)
        .join('')}</ul>`;
    } else if (kind === 'trade') {
      const t = tradeAt();
      h += `<h3>🤝 ${t ? t.name : '以物易物'}</h3><p>你有 長樂菸×${player.inv.cig || 0}。今天的行情（物資緊縮 ×${S.scarcity.toFixed(2)}）：</p><div class="row">`;
      for (const k of Object.keys(SV.VAL)) {
        if (k === 'cig') continue;
        const pz = SV.price(S, k);
        h += btn('b:' + k, `買 ${iname(k)}<small>${pz} 包菸</small>`, (player.inv.cig || 0) < pz);
        if ((player.inv[k] || 0) > 0) h += btn('s:' + k, `賣 ${iname(k)}<small>得 ${Math.max(1, pz - 1)} 包菸</small>`);
      }
      h += '</div>' + btn('x', '離開');
    } else {
      h +=
        '<h3>🚪 這戶還有人住</h3><p>門縫裡，一位獨居的阿公縮在床邊，櫃子裡是他的藥和最後一點米。</p><div class="row">';
      h +=
        btn('take', '還是拿走（大家心情 −，良心 −）') +
        btn('give', '留一包米給他（良心 +）', !(player.inv.rice > 0)) +
        btn('leave', '輕輕把門帶上') +
        '</div>';
    }
    d.innerHTML = h;
  };
  d.onclick = e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const a = b.dataset.a!;
    if (a === 'x') return closeSurv();
    if (a.startsWith('u:')) {
      const k = a.slice(2) as SV.Upg;
      for (const [i, n] of Object.entries(SV.UPG[k].cost)) player.inv[i] -= n;
      S.upg[k] = 1;
      log(`🔨 避難所：${SV.UPG[k].name} 完成`, '#9f9');
    } else if (a === 'dep') {
      for (const k of Object.keys(player.inv)) {
        const it = ITEMS[k];
        if (it && (it.kind === 'food' || it.kind === 'drink' || it.kind === 'med') && player.inv[k] > 0) {
          S.stash[k] = (S.stash[k] || 0) + player.inv[k];
          delete player.inv[k];
        }
      }
      log('物資放進了存糧。', '#9f9');
    } else if (a === 'pray') log(SV.pray(S), '#fd9');
    else if (a.startsWith('b:')) {
      const k = a.slice(2);
      player.inv.cig -= SV.price(S, k);
      addItem(k, 1);
    } else if (a.startsWith('s:')) {
      const k = a.slice(2);
      player.inv[k]--;
      if (player.inv[k] <= 0) delete player.inv[k];
      addItem('cig', Math.max(1, SV.price(S, k) - 1));
    } else if (a === 'take' || a === 'give' || a === 'leave') {
      const c = pendingCont!;
      pendingCont = null;
      closeSurv();
      if (a === 'take') {
        S.karma--;
        S.stole++;
        S.group.forEach(g => (g.mood = Math.max(0, g.mood - 8)));
        log('你拿走了阿公的東西。回家的路上，誰都沒說話。', '#e99');
        (c as any).seen = 1;
        interact();
      } else if (a === 'give') {
        player.inv.rice--;
        S.karma += 2;
        S.gave++;
        S.group.forEach(g => (g.mood = Math.min(100, g.mood + 5)));
        log('你留下一包米。阿公合掌說了聲多謝。', '#9f9');
      } else {
        S.karma++;
        log('你輕輕把門帶上。', '#ccc');
      }
      return;
    }
    render();
  };
  render();
  document.body.appendChild(d);
}
/** v21.6 / v22.1 the metro entrance / exit the player stands at, if any */
function metroAt() {
  for (const st of metro)
    for (const gt of st.gates) {
      if (Math.hypot(player.pos.x - gt.ent[0], player.pos.z - gt.ent[1]) < 1.8) return { st, gt, down: true };
      if (Math.hypot(player.pos.x - gt.exit[0], player.pos.z - gt.exit[1]) < 2.2) return { st, gt, down: false };
    }
  return null;
}
function metroUse() {
  const m = metroAt();
  if (!m) return false;
  if (m.down) ensureInterior(scene, m.st, metro.indexOf(m.st));
  const [x, z] = m.down ? m.gt.inn : m.gt.out;
  player.pos.set(x, 0, z);
  player.vel.set(0, 0, 0);
  log(
    m.down
      ? `🚇 由 ${m.gt.no} 號出口進入北都地下鐵 ${m.st.name}站${UT.power ? '（正常營運）' : '（停電・停駛中）'}`
      : `從 ${m.gt.no} 號出口回到地面（${m.st.name}）`,
    '#fc8',
  );
  return true;
}
/** v22.2 standing on the platform beside an open train (day-1 service only) → station index, else -1 */
function metroBoard() {
  if (!UT.power) return -1;
  for (let i = 0; i < metro.length; i++) {
    if (!metro[i].built) continue;
    const [OX, OZ] = stationOrigin(i);
    const lx = player.pos.x - OX,
      lz = player.pos.z - OZ;
    const ph = svc(i, gameMin).phase;
    if (Math.abs(lx) < 27 && lz > 24.5 && lz < 28.3 && (ph === 'open' || ph === 'opening')) return i;
  }
  return -1;
}
let riding = false;
const PS: { src?: string[] } = {};
/** v22.3 wallet */
const wallet = () => (surv.cash ??= 1200);
const SHOP_LOOT = /^m\d+:[0678]$/; // shop shelves: only lootable once the shops are dead
function shopAt(): Shop | null {
  if (player.pos.z > -6000) return null;
  let best: Shop | null = null,
    bd = 1.3;
  for (const st of metro) {
    if (!st.built) continue;
    for (const sh of st.shops) {
      const d = Math.hypot(player.pos.x - sh.p[0], player.pos.z - sh.p[1]);
      if (d < bd && (UT.power || sh.vend) && !(surv.pried || []).includes(sh.id)) ((bd = d), (best = sh));
    }
  }
  return best;
}
function shopUse(sh: Shop) {
  if (UT.power) {
    if (sh.kind === 'locker') log('🔒 投幣置物櫃：每一格都有人在用，鎖著。', '#ccc');
    else openShop(sh);
    return true;
  }
  if (!sh.vend) return false;
  const tool = ['hammer', 'pipe', 'bat', 'knife'].find(k => player.inv[k]);
  const got = pryLoot(sh);
  for (const [k, n] of Object.entries(got)) addItem(k, n);
  (surv.pried ||= []).push(sh.id);
  setPried(new Set(surv.pried));
  noise(sh.p[0], sh.p[1], tool ? 24 : 36);
  const list = Object.entries(got)
    .map(([k, n]) => `${ITEMS[k]?.name || k}×${n}`)
    .join('、');
  log(`${tool ? `🔧 用${ITEMS[tool].name}撬開` : '💥 硬是砸開'}${sh.name}（好大聲）：${list}`, '#fc8');
  return true;
}
function openShop(sh: Shop) {
  document.getElementById('shop')?.remove();
  const d = document.createElement('div');
  d.id = 'shop';
  const draw = () =>
    (d.innerHTML =
      `<h3>${sh.vend ? '🥤' : '🏪'} ${sh.name}</h3><p>錢包 NT$ ${wallet()}</p>` +
      sh.stock
        .map(([k, pr]) => `<button data-k="${k}" data-p="${pr}">${ITEMS[k]?.name || k}　NT$ ${pr}</button>`)
        .join('') +
      '<button data-k="" class="x">離開</button>');
  draw();
  d.onclick = e => {
    const t = e.target as HTMLElement;
    const k = t.dataset?.k;
    if (k == null) return;
    if (!k) return d.remove();
    const pr = Number(t.dataset.p);
    if (wallet() < pr) return log('💸 錢不夠了', '#f99');
    surv.cash = wallet() - pr;
    addItem(k);
    log(
      sh.vend ? `🥤 喀噹！${ITEMS[k].name}掉了出來（NT$ ${pr}）` : `🏪 在${sh.name}買了 ${ITEMS[k].name}（NT$ ${pr}）`,
      '#cfc',
    );
    draw();
  };
  document.body.appendChild(d);
}
function openRide(i: number) {
  document.getElementById('ride')?.remove();
  const d = document.createElement('div');
  d.id = 'ride';
  d.innerHTML =
    `<h3>🚇 艋舺橘線・${metro[i].name}站</h3><p>選擇下車站（約 3 分鐘車程）</p>` +
    metro.map((s, j) => (j === i ? '' : `<button data-j="${j}">${s.name}站 橘${s.no}</button>`)).join('') +
    '<button data-j="-1" class="x">取消</button>';
  d.onclick = e => {
    const j = Number((e.target as HTMLElement).dataset?.j ?? NaN);
    if (Number.isNaN(j)) return;
    d.remove();
    if (j >= 0) rideTo(i, j);
  };
  document.body.appendChild(d);
}
function rideTo(i: number, j: number) {
  if (riding || !metro[j]) return;
  riding = true;
  const f = document.createElement('div');
  f.id = 'ridefade';
  f.innerHTML = `<div class="car"><div class="win"></div><div class="win"></div><div class="win"></div></div><p>車廂內・往 ${metro[j].name}站</p><small>下一站 ${metro[j].name}　請握緊扶手</small>`;
  document.body.appendChild(f);
  requestAnimationFrame(() => f.classList.add('on'));
  log(`🚇 在${metro[i].name}站上車，往${metro[j].name}站`, '#fc8');
  setTimeout(() => {
    ensureInterior(scene, metro[j], j);
    const [OX, OZ] = stationOrigin(j);
    player.pos.set(OX + 0.2, 0, OZ + 26.6);
    player.vel.set(0, 0, 0);
  }, 1400);
  setTimeout(() => {
    f.classList.remove('on');
    log(`🚇 ${metro[j].name}站到了`, '#fc8');
    setTimeout(() => (f.remove(), (riding = false)), 700);
  }, 3000);
}
function interact() {
  if (npcInteract()) return;
  if (metroUse()) return;
  if (document.getElementById('ride')) return document.getElementById('ride')!.remove();
  if (document.getElementById('shop')) return document.getElementById('shop')!.remove();
  {
    const sh = shopAt();
    if (sh && !nearestCont() && shopUse(sh)) return;
  }
  {
    const bi = metroBoard();
    if (bi >= 0) return openRide(bi);
  }
  if (survOpen) return closeSurv();
  {
    const t = tradeAt();
    if (t && !nearestCont()) return openSurv('trade');
  }
  if (atHome() && !nearestCont() && !drive.nearest(player.pos)) return openSurv('home');
  if (drive.cur) {
    const v = drive.cur;
    const o = drive.exit()!;
    player.pos.copy(o);
    collide(player.pos, 0.35);
    player.mesh.visible = true;
    log(`下車（${v.s.name}）`, '#ccc');
    return;
  }
  {
    const w = roadT.wreckNear(player.pos.x, player.pos.z, 2.8);
    if (w && !w.looted && !nearestCont() && !drive.nearest(player.pos, 1.5)) {
      roadT.loot(w);
      const got = WRECK_LOOT[Math.floor(Math.random() * WRECK_LOOT.length)];
      for (const [k, n] of got) addItem(k, n);
      log(
        `🚗 翻找${w.kind === 'bus' ? '燒毀的公車' : '廢棄車輛'}：` +
          got.map(([k, n]) => `${ITEMS[k]?.name || k}×${n}`).join('、'),
        '#9f9',
      );
      return;
    }
  }
  {
    const v = drive.nearest(player.pos);
    if (v && !nearestCont()) {
      const rf = drive.refuel(v);
      if (rf) {
        log('⛽ ' + rf, '#9f9');
        return;
      }
      const rp = drive.repair(v);
      if (rp) {
        log('🔧 ' + rp, '#9f9');
        return;
      }
      const m = drive.enter(v);
      if (!m) {
        player.mesh.visible = v.s.two;
        log(`${v.s.two ? '騎上' : '坐進'} ${v.s.name}｜${drive.status(v)}`, '#9f9');
        return;
      }
      if (player.inv.hose && !v.s.pedal && !v.s.elec && v.fuel > 1 && !/接線/.test(m)) {
        log(drive.siphon(v), '#fc8');
        return;
      }
      log(m + '｜' + drive.status(v), '#ccc');
      return;
    }
  }
  const c = nearestCont();
  const v = !c && vehicles.nearest(player.pos, 2.2);
  if (v) {
    log(v.kind === 'truck' ? '佔領軍卡車，油箱上鎖' : '這台被鎖死了，零件也被拆光，找別台吧', '#ccc');
    return;
  }
  if (c && /飲水機|流理台|廚房/.test(c.label)) {
    if (!UT.water) {
      log('水龍頭只流出幾滴…停水了。', '#e88');
    } else if ((c as any).tapT === undefined || gameMin > (c as any).tapT) {
      (c as any).tapT = gameMin + 90;
      c.items.water = (c.items.water || 0) + 1;
      log('接了一瓶自來水。', '#9cf');
    }
  }
  if (c && !(c as any).seen) {
    const id = c.id;
    let hsh = 0;
    for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) | 0;
    // v22 moral choice: some homes still have an old person living in them
    if (c.label === '櫥櫃' && Math.abs(hsh) % 5 === 0 && !(c as any).asked) {
      (c as any).asked = 1;
      pendingCont = c;
      return openSurv('moral');
    }
    (c as any).seen = 1;
    if (SV.isNight(gameMin) && Math.abs(hsh) % 3 === 0) {
      const k = ['cig', 'battery', 'can', 'rice', 'pill'][Math.abs(hsh) % 5];
      c.items[k] = (c.items[k] || 0) + 1;
      log('🌙 夜裡摸黑翻找，多找到一些東西。', '#adf');
    }
  }
  if (c) {
    curCont = c;
    panelOpen = true;
    $('panel').classList.remove('hidden');
    renderPanel();
  }
}
const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7040 });
function setBarricade(d: Door) {
  d.barricaded = true;
  d.seg = { a: d.a, b: d.c };
  addSeg(d.seg);
  const l = Math.hypot(d.c[0] - d.a[0], d.c[1] - d.a[1]);
  const m = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(l + 0.3, 0.25, 0.08), plankMat);
    p.position.y = 0.6 + i * 0.6;
    p.rotation.z = (i - 1) * 0.15;
    p.castShadow = true;
    m.add(p);
  }
  m.position.set(d.p[0], 0, d.p[1]);
  m.rotation.y = -Math.atan2(d.c[1] - d.a[1], d.c[0] - d.a[0]);
  scene.add(m);
  d.mesh = m as any;
}
function barricade() {
  const d = nearestDoor();
  if (!d) {
    log('附近沒有門');
    return;
  }
  if (d.barricaded) {
    removeSeg(d.seg!);
    scene.remove(d.mesh!);
    d.barricaded = false;
    addItem('plank');
    log('拆掉了封門木板');
    noise(player.pos.x, player.pos.z, 10);
    return;
  }
  if (!player.inv.hammer || !player.inv.plank) {
    log('封門需要 鐵鎚 + 木板', '#f99');
    return;
  }
  if (--player.inv.plank <= 0) delete player.inv.plank;
  setBarricade(d);
  noise(player.pos.x, player.pos.z, 18);
  log('門封好了（敲打聲可能引來巡邏）', '#9f9');
}
function sleep() {
  if (!bldAt(player.pos.x, player.pos.z)) {
    log('只能在室內睡覺', '#f99');
    return;
  }
  if (sols.some(s => s.state === 'combat')) {
    log('有敵人在追你，睡不著', '#f99');
    return;
  }
  if (player.fatigue < 20) {
    log('你還不累');
    return;
  }
  if (dangerNear()) {
    log('附近有佔領軍，現在睡太危險', '#f99');
    return;
  }
  player.sleeping = true;
  log('你閉上眼睛…（時間快轉 ×20）', '#aaf');
  renderSpeed();
}

// ---------- combat ----------
function tryVault() {
  if (player.vaultT > 0 || player.sleeping || dead) return;
  const fwd =
    player.vel.length() > 0.3
      ? player.vel.clone().setY(0).normalize()
      : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  const p: V2 = [player.pos.x, player.pos.z],
    q: V2 = [player.pos.x + fwd.x * 1.3, player.pos.z + fwd.z * 1.3];
  let hit: Seg | null = null;
  for (const sg of nearSegs(p[0], p[1]))
    if (segX(p, q, sg.a, sg.b)) {
      if (!sg.low) return log('太高了，翻不過去');
      hit = sg;
    }
  if (!hit) return;
  const to = new THREE.Vector3(player.pos.x + fwd.x * 1.5, 0, player.pos.z + fwd.z * 1.5);
  const chk = to.clone();
  collide(chk, 0.35);
  if (chk.distanceTo(to) > 0.2 || bldAt(to.x, to.z) !== bldAt(player.pos.x, player.pos.z)) return log('另一側沒有空間');
  player.vFrom.copy(player.pos);
  player.vTo.copy(to);
  player.vaultT = 0.55;
  player.rig.vaultT = 0.55;
  player.mesh.rotation.y = Math.atan2(fwd.x, fwd.z);
  noise(player.pos.x, player.pos.z, 4);
}
function shove() {
  if (player.cd > 0 || player.sleeping || dead) return;
  player.cd = 0.6;
  player.rig.shoveT = 0.35;
  noise(player.pos.x, player.pos.z, 3);
  const f = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  for (const s of sols) {
    if (s.state === 'dead') continue;
    const to = s.pos.clone().sub(player.pos);
    const d = to.length();
    if (d > 1.5 || to.normalize().dot(f) < 0.4) continue;
    s.stun = 1.6;
    s.rig.hurtT = 0.35;
    s.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
    s.pos.addScaledVector(f, 0.9);
    collide(s.pos, 0.35);
    s.state = 'combat';
    s.alert = 1;
    s.lastSeen = [player.pos.x, player.pos.z];
    log('推開！敵人踉蹌', '#ff9');
    break;
  }
}
function playerAttack() {
  const k = player.equip;
  const d = k ? ITEMS[k] : ({ dmg: 8, range: 1.1, noise: 2, cd: 0.5, kind: 'melee' } as any);
  if (player.cd > 0) return;
  netAttack();
  player.cd = d.cd;
  if (d.kind === 'gun') player.rig.shootT = 0.14;
  else player.rig.meleeT = 0.45;
  const dir = new THREE.Vector3(aimPt.x - player.pos.x, 0, aimPt.z - player.pos.z).normalize();
  if (d.kind === 'gun') {
    if (!player.inv[d.ammo]) {
      log('沒有子彈了', '#f99');
      player.cd = 0.5;
      return;
    }
    if (--player.inv[d.ammo] <= 0) delete player.inv[d.ammo];
    noise(player.pos.x, player.pos.z, d.noise);
    if (d.at) {
      fireAT(k, d, dir);
      return;
    }
    // v21.4 the round stops at the first wall / cover it meets (aimed at chest height)
    const P0: V2 = [player.pos.x, player.pos.z];
    let hit: Sol | null = null,
      hd = d.range * shotRay(P0, [player.pos.x + dir.x * d.range, player.pos.z + dir.z * d.range], 1.35, 1.25);
    for (const s of sols) {
      if (s.state === 'dead') continue;
      const to = s.pos.clone().sub(player.pos);
      const t = to.dot(dir);
      if (t < 0 || t > hd) continue;
      const perp = to.clone().sub(dir.clone().multiplyScalar(t)).length();
      if (perp < 0.55 && shotRay(P0, [s.pos.x, s.pos.z], 1.35, s.crouch ? 0.75 : 1.25) >= 1) {
        hit = s;
        hd = t;
      }
    }
    tracer(player.pos, player.pos.clone().add(dir.clone().multiplyScalar(hd)));
    if (hit) damageSol(hit, d.dmg * (0.8 + rnd() * 0.4), false);
    else if (armor) {
      for (const a of armor.list) {
        if (a.dead) continue;
        const to = a.g.position.clone().sub(player.pos);
        to.y = 0;
        const t = to.dot(dir);
        if (t > 0 && t < hd + 2 && to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.2) {
          armor.hit(a.g.position.x, a.g.position.z, d.dmg, false);
          break;
        }
      }
    }
  } else {
    noise(player.pos.x, player.pos.z, d.noise);
    for (const s of sols) {
      if (s.state === 'dead') continue;
      const to = s.pos.clone().sub(player.pos);
      const dist = to.length();
      if (dist > d.range + 0.3) continue;
      if (to.normalize().dot(dir) < 0.5) continue;
      const stealth = s.state !== 'combat' && s.alert < 0.5;
      damageSol(s, d.dmg * (stealth ? 3.2 : 1), stealth);
      break;
    }
  }
}
function damageSol(s: Sol, dmg: number, stealth: boolean) {
  s.hp -= dmg;
  if (stealth) log('偷襲！', '#ff9');
  if (s.hp <= 0) {
    s.state = 'dead';
    s.cone.visible = false;
    if (s.tile) district.save(s.tile, 'dead', { ...(district.saved[s.tile]?.dead || {}), [s.tid!]: 1 });
    player.kills++;
    log('擊倒一名佔領軍士兵', '#ffd76a');
    const it = plaDrop(s.id);
    const dc = makeCont('d' + s.id, [s.pos.x, s.pos.z], 'crate', undefined, it);
    dc.label = '士兵遺留裝備';
    dropGun(dc, s.pos, it);
    checkSectors();
  } else {
    s.rig.hurtT = 0.35;
    s.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
    s.stun = Math.max(s.stun || 0, 0.4);
    s.state = 'combat';
    s.alert = 1;
    s.lastSeen = [player.pos.x, player.pos.z];
  }
}
const liberated = new Set<number>();
function checkSectors(silent = false) {
  for (let i = 0; i < NSEC; i++) {
    if (liberated.has(i)) continue;
    let alive = sols.filter(s => s.sector === i && s.state !== 'dead').length;
    let total = sols.filter(s => s.sector === i).length;
    if (outerSector(i)) {
      const g = garrisonOf(i);
      total = g ? GARRISON : 0;
      alive = g
        ? GARRISON - Object.keys(district.saved[g.key]?.dead || {}).filter(k => +k >= 0 && +k < GARRISON).length
        : 0;
    }
    if (total > 0 && alive === 0) {
      liberated.add(i);
      if (!silent) log(`★ ${SECTOR_LABEL(i)} 街區已奪回！`, '#7fff7f');
    }
  }
  rocCheck(silent);
}

// ---------- save ----------
const SAVE = 'defendtaipei-save-v1';
// ---------- story: utilities timeline (有電有水 → 斷電 → 斷水) ----------
const UT = { power: true, water: true, ev: {} as Record<string, 1> };
const POWER_OFF = 2 * 1440 + 19 * 60,
  WATER_OFF = 4 * 1440 + 7 * 60; // 第3天 19:00 斷電・第5天 07:00 斷水
const EV0 = 6 * 1440 + 6 * 60,
  EV1 = 7 * 1440 + 18 * 60;
let evac: ReturnType<typeof buildEvacZone> | null = null;
const evacOpen = () => !UT.ev.ex && gameMin >= EV0 && gameMin < EV1;
function doEvac(mode: 'heli' | 'boat' = 'heli') {
  if (cine.on) return;
  if (mode === 'heli') UT.ev.ex = 1;
  save();
  closePanel();
  setSpeed(1);
  started = false;
  const items = Object.values(player.inv).reduce((a, b) => a + b, 0);
  const day = Math.floor(gameMin / 1440) + 1;
  const hh2 =
    String(Math.floor((gameMin % 1440) / 60)).padStart(2, '0') +
    ':' +
    String(Math.floor(gameMin % 60)).padStart(2, '0');
  playEvac(renderer, mode, () => {
    const d = document.createElement('div');
    d.id = 'evacend';
    d.innerHTML = `<h1>您已成功撤離至 福特號航空母艦（USS Gerald R. Ford, CVN-78）</h1><h2>另一個結局：你活了下來，把萬華的故事帶出去。（撤離路線：${mode === 'boat' ? '小艇・淡水河出海' : '直升機・河濱撤離區'}）</h2><table><tr><td>撤離路線</td><td>${mode === 'boat' ? '🚤 小艇（線人接應）' : '🚁 直升機'}</td></tr><tr><td>存活天數</td><td>${day} 天（第 ${day} 天 ${hh2}）</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>攜帶物品</td><td>${items} 件</td></tr></table><div><button id=evcont>繼續留在萬華（奪回之路）</button><button id=evnew>新遊戲</button></div><p style="font-size:12px;color:#678;margin-top:18px">虛構作品・艦艇與直升機為通用低多邊形模型</p>`;
    document.body.appendChild(d);
    $('evcont').onclick = () => {
      d.remove();
      started = true;
      log('你決定留下來，繼續奪回萬華。', '#ffd27a');
    };
    $('evnew').onclick = () => {
      (localStorage.removeItem(SAVE), localStorage.removeItem('dt.tiles'));
      location.reload();
    };
  });
}
const STORY: { t: number; id: string; who: string; msg: string; fx?: () => void }[] = [
  {
    t: 8 * 60 + 5,
    id: 'a',
    who: '📱 國家級警報',
    msg: '萬華、中正一帶實施戒嚴，民眾非必要請勿外出。夜間 20:00 後宵禁。',
  },
  { t: 12 * 60, id: 'b', who: '📻 中廣（收音機）', msg: '…佔領當局宣稱「水電維持正常供應」，但多處變電所已遭接管…' },
  {
    t: 1440 + 9 * 60,
    id: 'c',
    who: '💬 里長 LINE 群組',
    msg: '各位鄰居：聽說台電員工被帶走了，大家趕快把水桶裝滿、手機充飽電！',
  },
  {
    t: 2 * 1440 + 14 * 60,
    id: 'd',
    who: '📱 台電簡訊',
    msg: '【停電通知】因「軍事管制」，萬華區即日起停止供電，復電時間未定。',
  },
  {
    t: POWER_OFF,
    id: 'P',
    who: '⚡ 斷電',
    msg: '整條街一瞬間暗了下來。冰箱停了，裡面的食物撐不了多久。',
    fx: () => {
      UT.power = false;
    },
  },
  {
    t: 3 * 1440 + 10 * 60,
    id: 'e',
    who: '📻 收音機（電池）',
    msg: '…自來水事業處人員已撤離，加壓站停擺，高樓層將最先停水…',
  },
  {
    t: 1440 + 7 * 60,
    id: 'r1',
    who: '📻 地下電台「自由之聲」',
    msg: '…這裡是自由之聲。國軍與志願者仍在新店溪南岸堅守，請萬華的鄉親保持冷靜、儲水、避開大馬路…',
  },
  {
    t: 2 * 1440 + 21 * 60,
    id: 'r2',
    who: '📻 地下電台「自由之聲」',
    msg: '…停電了？別慌。收音機用電池還能撐。宵禁時佔領軍會帶手電筒巡邏，看到光束就躲進騎樓…',
  },
  {
    t: 3 * 1440 + 13 * 60,
    id: 'r3',
    who: '📻 地下電台「自由之聲」',
    msg: '…注意！今天 15:00 前後會有一批物資空投到萬華，紅色煙霧就是信號。佔領軍也會去搶，動作要快！',
  },
  {
    t: 3 * 1440 + 15 * 60,
    id: 'AD',
    who: '🪂 空投',
    msg: '遠處升起一道紅色煙霧——物資箱落地了！佔領軍的巡邏隊正往那邊移動。',
    fx: () => airdrop(),
  },
  {
    t: 4 * 1440 + 20 * 60,
    id: 'r4',
    who: '📻 地下電台「自由之聲」',
    msg: '…停水第一天。把水桶、臉盆放到頂樓或戶外，下雨就能接水。雨水記得煮過再喝…',
  },
  {
    t: 6 * 1440 + 12 * 60,
    id: 'r5',
    who: '📻 地下電台「自由之聲」',
    msg: '…西門町一帶已有三個街區被奪回！每一區的勝利，都讓他們更害怕…',
  },
  {
    t: 5 * 1440 + 20 * 60,
    id: 'e0',
    who: '📻 地下電台「自由之聲」',
    msg: '…有消息說，盟軍正在河濱準備一條撤離通道。明早請守在收音機旁…',
  },
  {
    t: EV0,
    id: 'e1',
    who: '📻 地下電台「自由之聲」',
    msg: '撤離窗口開啟！西側河濱撤離區（綠色 H、紅色信號彈）將有直升機接應，時限至第 8 天 18:00。想留下來奪回家園的人，我們也與你同在。',
    fx: () => slowDown('撤離廣播'),
  },
  { t: EV1, id: 'e2', who: '📻 地下電台「自由之聲」', msg: '撤離窗口已關閉。留下來的人——台北靠你們奪回。' },
  {
    t: WATER_OFF,
    id: 'W',
    who: '🚱 停水',
    msg: '水龍頭只流出幾滴黃水就停了。從現在起，每一瓶水都很珍貴。',
    fx: () => {
      UT.water = false;
    },
  },
];
function phone(who: string, msg: string) {
  const el = $('phone');
  el.innerHTML = `<b>${who}</b><br>${msg}`;
  el.classList.add('on');
  clearTimeout((phone as any).t);
  (phone as any).t = setTimeout(() => el.classList.remove('on'), 9000);
  log(`${who}：${msg}`, '#9fd0ff');
}
let spoilT = 0;
const PERISH = ['bento', 'rice', 'oden', 'soymilk', 'milktea', 'danbing', 'chicken', 'sausage', 'egg'];
function updateStory(gm: number) {
  for (const e of STORY)
    if (gameMin >= e.t && !UT.ev[e.id]) {
      UT.ev[e.id] = 1;
      e.fx?.();
      if (gameMin - e.t < 120) phone(e.who, e.msg);
    }
  if (gameMin >= POWER_OFF) UT.power = false;
  if (gameMin >= WATER_OFF) UT.water = false;
  if (!UT.power) {
    spoilT += gm;
    if (spoilT > 6) {
      spoilT = 0;
      for (const c of conts)
        if (/冷藏|櫃台|攤/.test(c.label))
          for (const k of PERISH)
            if (c.items[k] && rnd() < 0.15) {
              c.items[k]--;
              if (!c.items[k]) delete c.items[k];
              c.items.rotten = (c.items.rotten || 0) + 1;
            }
    }
  }
}
function save() {
  if (!started || dead || NOSAVE) return;
  gmap?.save();
  localStorage.setItem(
    SAVE,
    JSON.stringify({
      r: ROLE.id,
      surv,
      g: player.gender,
      p: [player.pos.x, player.pos.z],
      hp: player.hp,
      hu: player.hunger,
      th: player.thirst,
      fa: player.fatigue,
      bl: player.bleed,
      inv: player.inv,
      eq: player.equip,
      k: player.kills,
      t: gameMin,
      dl: DAYH,
      wx: WX,
      ex: UT.ev.ex || 0,
      inf: INF,
      ut: UT,
      conts: conts.map(c => [c.id, c.items, c.p]),
      dead: sols.filter(s => s.state === 'dead').map(s => s.id),
      bar: doors.map((d, i) => (d.barricaded ? i : -1)).filter(i => i >= 0),
    }),
  );
}

// ---------- main loop ----------
let started = false,
  dead = false;
const clock = new THREE.Clock();
let acc = 0,
  saveT = 0,
  streetT = 0;
function update(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) {
    fx[i].t -= dt;
    if (fx[i].t <= 0) {
      scene.remove(fx[i].o);
      fx.splice(i, 1);
    }
  }
  if (dead && player.rig) animate(player.rig, 'death', 0, dt);
  for (const s of sols) if (s.state === 'dead' && s.rig.deadT < 1) animate(s.rig, 'death', 0, dt);
  if (evac) evac.update(dt, evacOpen());
  if (metro.length && PS.src !== surv.pried) setPried(new Set((PS.src = surv.pried ||= [])));
  if (metro.length) metroTick(performance.now() / 1000, gameMin, UT.power, player.pos.x, player.pos.z);
  if (evac && evacOpen()) gmap?.intel('evac0', evac.pos[0], evac.pos[1], 'evac', '撤離點');
  if (started) {
    gmap?.update();
    updatePrologue(dt);
  }
  pumpRoofs(player.pos.x, player.pos.z, started ? 3 : 8);
  if (!started || dead || paused) return;
  updateInformant(dt);
  if (evac && evacOpen() && Math.hypot(player.pos.x - evac.pos[0], player.pos.z - evac.pos[1]) < 5) doEvac();
  if (speed > 1 && dangerNear()) slowDown('佔領軍接近');
  if (player.sleeping && dangerNear()) slowDown('佔領軍接近');
  if (player.hp < lastHp - 2) slowDown('你受傷了');
  lastHp = player.hp;
  const tscale = player.sleeping ? 20 : speed;
  gameMin += dt * tscale * MPS(); // day length chosen at new game (1h/2h/4h real per in-game day)
  const gm = (dt * tscale * MPS()) / 60; // game hours
  updateWeather(dt, gm);
  updateStory(gm);
  {
    // v22: every 06:00 the shelter's day is resolved
    const dn = Math.floor((gameMin - 360) / 1440);
    if (survDay < 0) survDay = dn;
    else if (dn > survDay) {
      survDay = dn;
      const out = SV.dayTick(surv, WX.amt > 0.2, {
        power: on => (UT.power = on),
        water: on => (UT.water = on),
      });
      out.forEach(t => log(t, '#fd9'));
    }
  }
  player.hunger -= gm * 2.2;
  player.thirst -= gm * 3.2;
  player.fatigue += player.sleeping ? -gm * 14 : gm * 2.6;
  if (player.sleeping && player.fatigue <= 0) {
    player.sleeping = false;
    log('你醒了', '#aaf');
    renderSpeed();
  }
  if (player.sleeping && sols.some(s => s.state === 'combat')) {
    player.sleeping = false;
    log('你被驚醒了！', '#f66');
  }
  player.hunger = clamp(player.hunger, 0, 100);
  player.thirst = clamp(player.thirst, 0, 100);
  player.fatigue = clamp(player.fatigue, 0, 100);
  if (player.hunger <= 0 || player.thirst <= 0) player.hp -= gm * 8;
  if (player.bleed) player.hp -= dt * 0.6;
  if (player.hunger > 50 && player.thirst > 50 && !player.bleed) player.hp = Math.min(100, player.hp + gm * 6);
  if (player.hp <= 0) return die();
  vehicles.update(dt);
  if (armor && started && !PRO.hide) armor.update(dt);
  if (recon && started && !PRO.hide) recon.update(dt, performance.now() / 1000);
  if (roc && started && !PRO.hide) roc.update(dt);
  ROC.cd = Math.max(0, ROC.cd - dt);
  updateShells(dt);
  player.cd -= dt;
  // movement
  if (drive.cur) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(),
      r = new THREE.Vector3(1, 0, -1).normalize();
    const mv = new THREE.Vector3();
    if (keys[K('up')]) mv.add(f);
    if (keys[K('down')]) mv.sub(f);
    if (keys[K('right')]) mv.add(r);
    if (keys[K('left')]) mv.sub(r);
    if (mv.lengthSq()) mv.normalize();
    const jm = Math.min(1, Math.hypot(joy.x, joy.y));
    if (jm > 0.12) mv.addScaledVector(f, -joy.y).addScaledVector(r, joy.x);
    drive.update(dt, mv, UT.power);
    const v = drive.cur;
    if (v) {
      player.pos.set(v.pos.x, 0, v.pos.z);
      player.mesh.position.set(v.pos.x, v.s.seatY - 0.45, v.pos.z);
      player.mesh.rotation.y = v.hd;
      player.moving = 0;
      player.vel.set(0, 0, 0);
    }
  } else drive.update(dt, new THREE.Vector3(), UT.power);
  roadT.update(player.pos.x, player.pos.z, dt);
  district.update(player.pos.x, player.pos.z);
  traffic.update(dt);
  netFrame(dt);
  if (drive.cur) {
    const v = drive.cur;
    const b = roadT.barrierAt(v.pos.x, v.pos.z, v.s.two ? 1.2 : 2.0);
    if (b) {
      if (Math.abs(v.v) > 6 && !v.s.two) {
        roadT.clear(b.key, b.id);
        v.v *= 0.5;
        v.eng = Math.max(0, v.eng - 0.08);
        noise(v.pos.x, v.pos.z, 30);
        log('💥 撞開路障！引擎受損', '#fc8');
      } else {
        v.pos.x -= Math.sin(v.hd) * Math.sign(v.v) * 0.3;
        v.pos.z -= Math.cos(v.hd) * Math.sign(v.v) * 0.3;
        v.v = 0;
      }
    }
    const w = roadT.wreckNear(v.pos.x, v.pos.z, v.s.two ? 1.6 : 2.6);
    if (w && Math.abs(v.v) > 0.5) {
      v.pos.x -= Math.sin(v.hd) * Math.sign(v.v) * 0.4;
      v.pos.z -= Math.cos(v.hd) * Math.sign(v.v) * 0.4;
      if (Math.abs(v.v) > 8) {
        v.eng = Math.max(0, v.eng - 0.1);
        log('💥 撞上廢棄車！', '#fc8');
      }
      v.v = 0;
    }
  } else {
    const b = roadT.barrierAt(player.pos.x, player.pos.z, 1.1);
    if (b) {
      const dx = player.pos.x - b.x,
        dz = player.pos.z - b.z,
        L = Math.hypot(dx, dz) || 1;
      player.pos.x = b.x + (dx / L) * 1.1;
      player.pos.z = b.z + (dz / L) * 1.1;
    }
    const w = roadT.wreckNear(player.pos.x, player.pos.z, 1.4);
    if (w) {
      const dx = player.pos.x - w.x,
        dz = player.pos.z - w.z,
        L = Math.hypot(dx, dz) || 1;
      player.pos.x = w.x + (dx / L) * 1.4;
      player.pos.z = w.z + (dz / L) * 1.4;
    }
  }
  if (!player.sleeping && !fpv?.active && !drive.cur) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(),
      r = new THREE.Vector3(1, 0, -1).normalize();
    const mv = new THREE.Vector3();
    if (keys[K('up')]) mv.add(f);
    if (keys[K('down')]) mv.sub(f);
    if (keys[K('right')]) mv.add(r);
    if (keys[K('left')]) mv.sub(r);
    const jm = Math.min(1, Math.hypot(joy.x, joy.y));
    if (jm > 0.12) {
      mv.addScaledVector(f, -joy.y).addScaledVector(r, joy.x);
    }
    if (MB.retreat > 0) {
      MB.retreat -= dt;
      const e = nearestFoe(30);
      if (e && jm < 0.12) mv.add(new THREE.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z).normalize());
    }
    const running =
      (keys[K('sprint')] ||
        (/^Shift/.test(K('sprint')) && (keys.ShiftLeft || keys.ShiftRight)) ||
        jm > 0.93 ||
        MB.retreat > 0) &&
      !player.sneak &&
      player.fatigue < 95;
    let sp = player.cover ? 1.4 : player.sneak ? 1.6 : running ? 6 : 3.4;
    if (player.cover && Math.hypot(player.pos.x - player.cover.x, player.pos.z - player.cover.z) > 1.8) {
      player.cover = null;
      updateCoverUI();
    }
    if (jm > 0.12 && !running) sp *= Math.max(0.3, Math.min(1, (jm - 0.12) / 0.7));
    if (player.fatigue > 80) sp *= 0.7;
    if (weight() > 12 * (ROLE.skills.carry ?? 1)) sp *= 0.8;
    // momentum: accelerate / decelerate toward desired velocity
    const want3 = mv.lengthSq() > 0 ? mv.clone().normalize().multiplyScalar(sp) : new THREE.Vector3();
    if (player.vaultT > 0) {
      player.vaultT -= dt;
      const q = 1 - player.vaultT / 0.55;
      player.pos.lerpVectors(player.vFrom, player.vTo, q < 0 ? 0 : q > 1 ? 1 : q * q * (3 - 2 * q));
      want3.set(0, 0, 0);
      player.vel.set(0, 0, 0);
    } else if (player.stun > 0) {
      player.stun -= dt;
      want3.multiplyScalar(0.25);
    }
    const accRate = want3.lengthSq() > player.vel.lengthSq() ? 9 : 7;
    player.vel.lerp(want3, Math.min(1, dt * accRate));
    if (player.vel.lengthSq() > 0.0004 && player.vaultT <= 0) {
      player.pos.addScaledVector(player.vel, dt);
      collide(player.pos, 0.35);
    }
    if (mv.lengthSq() > 0 && player.vaultT <= 0) {
      if (running) {
        player.fatigue += dt * 0.25;
        acc += dt;
        if (acc > 0.5) {
          acc = 0;
          noise(player.pos.x, player.pos.z, 11);
        }
      } else if (!player.sneak) {
        acc += dt;
        if (acc > 1) {
          acc = 0;
          noise(player.pos.x, player.pos.z, 3.5);
        }
      }
    }
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(plane, aimPt);
    if (MB.fire) {
      const e = nearestFoe(25);
      if (e) aimPt.set(e.pos.x, 0, e.pos.z);
      else
        aimPt.set(
          player.pos.x + Math.sin(player.mesh.rotation.y) * 5,
          0,
          player.pos.z + Math.cos(player.mesh.rotation.y) * 5,
        );
    }
    const eqk0 = player.equip ? ITEMS[player.equip].kind : '';
    const faceMove = player.vel.length() > 0.5 && (running || eqk0 !== 'gun') && !clicking;
    const want = faceMove
      ? Math.atan2(player.vel.x, player.vel.z)
      : Math.atan2(aimPt.x - player.pos.x, aimPt.z - player.pos.z);
    let dr = Math.atan2(Math.sin(want - player.mesh.rotation.y), Math.cos(want - player.mesh.rotation.y));
    player.mesh.rotation.y += dr * Math.min(1, dt * (faceMove ? 9 : 12));
    if ((clicking || MB.fire) && !panelOpen) playerAttack();
    player.moving = player.vel.length();
    const eqk = player.equip ? ITEMS[player.equip].kind : '';
    player.anim =
      panelOpen && curCont
        ? 'loot'
        : player.cover?.low && player.cd <= 0.05
          ? 'sneak'
          : eqk === 'gun' && !running
            ? 'aim'
            : player.sneak
              ? 'sneak'
              : running && player.moving > 3.5
                ? 'run'
                : player.moving > 0.15
                  ? 'walk'
                  : 'idle';
  } else player.anim = 'sleep';
  setWeapon(player.rig, player.equip);
  setLodFocus(player.pos);
  animate(player.rig, player.anim, player.moving, dt);
  if (!drive.cur) {
    player.mesh.position.copy(player.pos);
    player.mesh.position.y += walkH(player.pos.x, player.pos.z); // v21.4 stand on the raised walk
  }
  // v21.2 shader cutaway around the camera→player line (see occlusion.ts); camera itself unchanged
  updateOcclusion(player.pos.x, player.pos.y, player.pos.z);
  // buildings cutaway
  const inside = bldAt(player.pos.x, player.pos.z);
  for (const b of blds) {
    const dx = b.c[0] - player.pos.x,
      dz = b.c[1] - player.pos.z;
    const near = Math.abs(dx) < 40 && Math.abs(dz) < 40;
    const front = near && dx + dz > -4 && dx + dz < 30 && Math.abs(dx - dz) < 22 && b.h > 4;
    const mi = (b as any).mi;
    b.walls.material = front || b === inside ? wallMatsT[mi] : wallMats[mi];
    b.roof.visible = b !== inside && !front;
    b.walls.scale.y = b === inside ? 0.12 : 1;
    if (b.innerWalls) b.innerWalls.visible = b === inside;
  }
  // soldiers
  const night = isNight();
  const pp: V2 = [player.pos.x, player.pos.z];
  let pathBudget = 4;
  for (const s of sols) {
    if (s.state === 'dead') continue;
    if (PRO.hide) {
      s.mesh.visible = false;
      s.cone.visible = false;
      continue;
    }
    const active = !s.night || night;
    s.mesh.visible = active;
    s.cone.visible = active;
    if (!active) continue;
    const dx = player.pos.x - s.pos.x,
      dz = player.pos.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 120) continue; // dormant far away
    // vision
    let range = (night ? 11 : 20) * (player.sneak ? 0.55 : 1) * (player.light && night ? 2 : 1);
    if (inside) range *= 0.6;
    const facing =
      Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - s.dir), Math.cos(Math.atan2(dz, dx) - s.dir))) < Math.PI / 5;
    const sees =
      (dist < range &&
        (facing || dist < 1.6) &&
        !player.sleeping &&
        shotRay([s.pos.x, s.pos.z], pp, 1.6, playerAimH() + 0.1, 0.6) >= 1) ||
      (player.sleeping && dist < 2.5);
    if (sees) {
      s.alert += dt * (1.6 - dist / range) * 1.6;
      if (s.state !== 'combat') {
        s.state = 'investigate';
        s.target = pp.slice() as V2;
        s.timer = 15;
      }
    } else s.alert = Math.max(0, s.alert - dt * 0.15);
    if (s.alert >= 1 && s.state !== 'combat') {
      s.state = 'combat';
      log('你被佔領軍發現了！', '#f66');
      noise(s.pos.x, s.pos.z, 25);
    }
    if (sees && s.state === 'combat') s.lastSeen = pp.slice() as V2;
    let goal: V2 | null = null,
      sp = night ? 1.6 : 2.0;
    if (s.state === 'patrol') {
      goal = s.route[s.wi];
      if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) {
        s.wi += 1;
        if (s.wi >= s.route.length) {
          s.route.reverse();
          s.wi = 1;
        }
        goal = s.route[s.wi] || s.route[0];
      }
    } else if (s.state === 'investigate') {
      goal = s.target!;
      sp = 2.6;
      s.timer -= dt;
      if (s.timer <= 0 || Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) {
        if (s.timer <= 0) {
          s.state = 'patrol';
          s.alert = 0;
        } else {
          s.timer = Math.min(s.timer, 4);
          goal = null;
          s.dir += dt;
        }
      }
    } else if (s.state === 'combat') {
      s.cd -= dt;
      if (sees && dist < 24) {
        goal = dist > 8 ? pp : null;
        s.dir = Math.atan2(dz, dx);
        // v21.4 enemies use cover: run to the nearest cover between them and you, then crouch / peek and fire
        s.covT = (s.covT || 0) - dt;
        if (s.covT <= 0) {
          s.covT = 5 + rnd() * 3;
          s.cov = solCover(s, pp);
        }
        let atCov = false;
        if (s.cov) {
          const cd2 = Math.hypot(s.cov[0] - s.pos.x, s.cov[1] - s.pos.z);
          if (cd2 > 0.5) {
            goal = s.cov;
            sp = 3.2;
          } else {
            goal = null;
            atCov = true;
          }
        }
        s.peekT = (s.peekT || 0) + dt;
        s.crouch = atCov && s.peekT % 3 < 1.5;
        if (s.cd <= 0 && !(s.stun! > 0) && !s.crouch && (!s.cov || atCov || dist < 8)) {
          s.rig.shootT = 0.14;
          s.cd = 1.1 + rnd() * 0.6;
          noise(s.pos.x, s.pos.z, 40);
          // v21.4 ray against walls / cover first, then the hit roll (lower vs a covered target)
          const clear = shotRay([s.pos.x, s.pos.z], pp, 1.4, playerAimH(), 1.0);
          const hitP = (0.55 - dist / 60) * (player.sneak ? 0.7 : 1) * (night ? 0.7 : 1) * (player.cover ? 0.5 : 1);
          const hitIt = clear >= 1 && rnd() < hitP;
          const miss =
            clear < 1
              ? new THREE.Vector3(s.pos.x + (pp[0] - s.pos.x) * clear, 0, s.pos.z + (pp[1] - s.pos.z) * clear)
              : new THREE.Vector3(player.pos.x + (rnd() - 0.5) * 3, 0, player.pos.z + (rnd() - 0.5) * 3);
          tracer(s.pos, hitIt ? player.pos : miss);
          coverStats.enemyShots++;
          if (clear < 1) coverStats.blocked++;
          if (hitIt) {
            player.rig.hurtT = 0.35;
            player.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
            player.stun = 0.35;
            player.hp -= 10 + rnd() * 12;
            if (rnd() < 0.45 && !player.bleed) {
              player.bleed = true;
              log('你中彈流血了！用繃帶止血', '#f66');
            } else log('你被擊中了！', '#f66');
            flashRed();
          }
        }
      } else if (s.lastSeen) {
        goal = s.lastSeen;
        sp = 3.2;
        if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1.2) {
          s.lastSeen = undefined;
          s.state = 'investigate';
          s.target = [s.pos.x + (rnd() - 0.5) * 10, s.pos.z + (rnd() - 0.5) * 10];
          s.timer = 12;
          s.alert = 0.5;
        }
      } else {
        s.state = 'investigate';
        s.target = [s.pos.x, s.pos.z];
        s.timer = 8;
      }
    }
    let moved = 0;
    if (s.state !== 'combat') ((s.cov = null), (s.crouch = false));
    s.aiming = s.state === 'combat' && sees && dist < 24 && !(s.stun! > 0) && !s.crouch;
    if (s.stun! > 0) {
      s.stun! -= dt;
      goal = null;
    }
    if (s.post && s.state === 'patrol') {
      goal = Math.hypot(s.post[0] - s.pos.x, s.post[1] - s.pos.z) > 0.8 ? s.post : null;
      if (!goal) s.dir += Math.sin(gameMin * 0.05 + s.id) * dt * 0.3;
    }
    if (goal) {
      let tgt = goal;
      if (nav && (s.state !== 'patrol' || s.post || true)) {
        s.repath = (s.repath || 0) - dt;
        const need = !s.path || !s.pgoal || Math.hypot(goal[0] - s.pgoal[0], goal[1] - s.pgoal[1]) > 2 || s.repath <= 0;
        if (need && pathBudget > 0) {
          pathBudget--;
          s.repath = s.state === 'patrol' ? 4 : 1.5;
          s.pgoal = goal.slice() as V2;
          const me: V2 = [s.pos.x, s.pos.z];
          if (los(me, goal)) s.path = [goal];
          else {
            const pth = nav.find(me, goal);
            s.path = pth ? smooth(pth, los) : [goal];
          }
          s.pi = 0;
        }
        if (s.path) {
          while (s.pi! < s.path.length - 1 && Math.hypot(s.path[s.pi!][0] - s.pos.x, s.path[s.pi!][1] - s.pos.z) < 0.8)
            s.pi!++;
          tgt = s.path[s.pi!];
        }
      } else s.path = undefined;
      const gx = tgt[0] - s.pos.x,
        gz = tgt[1] - s.pos.z;
      const gl = Math.hypot(gx, gz);
      if (gl > 0.3) {
        const td = Math.atan2(gz, gx);
        let dd = Math.atan2(Math.sin(td - s.dir), Math.cos(td - s.dir));
        if (!s.aiming) s.dir += clamp(dd, -dt * 6, dt * 6);
        s.vs = (s.vs || 0) + (sp - (s.vs || 0)) * Math.min(1, dt * 4);
        const ox = s.pos.x,
          oz = s.pos.z;
        s.pos.x += (gx / gl) * s.vs * dt;
        s.pos.z += (gz / gl) * s.vs * dt;
        collide(s.pos, 0.35);
        moved = Math.hypot(s.pos.x - ox, s.pos.z - oz) / dt;
      }
    }
    if (!moved) s.vs = (s.vs || 0) * Math.max(0, 1 - dt * 6);
    animate(
      s.rig,
      s.crouch && !moved ? 'sneak' : s.aiming ? 'aim' : moved > 2.9 ? 'run' : moved > 0.2 ? 'carry' : 'idle',
      moved,
      dt,
    );
    s.mesh.position.copy(s.pos);
    s.mesh.position.y += walkH(s.pos.x, s.pos.z);
    {
      const ty = Math.PI / 2 - s.dir;
      const d0 = Math.atan2(Math.sin(ty - s.mesh.rotation.y), Math.cos(ty - s.mesh.rotation.y));
      s.mesh.rotation.y += d0 * Math.min(1, dt * 8);
    }
    s.cone.position.set(s.pos.x, 0.06, s.pos.z);
    s.cone.rotation.y = -s.dir;
    s.cone.scale.setScalar(night ? 11 : 20);
    const cm = s.cone.material as THREE.MeshBasicMaterial;
    cm.color.set(s.state === 'combat' ? 0xff3030 : s.state === 'investigate' ? 0xffa030 : night ? 0xfff6c0 : 0xffee88);
    cm.opacity = night ? 0.22 : 0.12;
  }
  // lighting by time of day
  const hr = (gameMin / 60) % 24;
  const dayF = clamp(Math.sin(((hr - 6) / 13) * Math.PI), 0, 1);
  sun.intensity = 0.15 + dayF * 2.2;
  hemi.intensity = 0.25 + dayF * 0.75;
  sun.color.setHSL(0.09, 0.6, 0.55 + dayF * 0.3);
  const ang = ((hr - 6) / 13) * Math.PI;
  sun.position.set(player.pos.x + Math.cos(ang) * 60, 20 + Math.sin(Math.max(ang, 0.3)) * 60, player.pos.z + 30);
  sun.target.position.copy(player.pos);
  if (!dayF) sun.position.set(player.pos.x - 30, 70, player.pos.z + 20);
  updateSmoke(dt);
  if (!plaFlash.length)
    for (let i = 0; i < 4; i++) {
      const L = new THREE.SpotLight(0xfff0d0, 0, 24, 0.32, 0.5, 1.2);
      scene.add(L, L.target);
      plaFlash.push(L);
    }
  {
    const nightNow = isNight();
    const ns = nightNow
      ? sols
          .filter(s => s.state !== 'dead' && s.mesh.visible)
          .map(s => [s, s.pos.distanceToSquared(player.pos)] as const)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 4)
      : [];
    plaFlash.forEach((L, i) => {
      const e = ns[i];
      if (!e || e[1] > 1600) {
        L.intensity = 0;
        return;
      }
      const s = e[0];
      L.position.set(s.pos.x, 1.5, s.pos.z);
      L.target.position.set(s.pos.x + Math.cos(s.dir) * 8, 0, s.pos.z + Math.sin(s.dir) * 8);
      L.intensity = 60;
    });
  }
  const fogC = new THREE.Color(0x0c1220)
    .lerp(new THREE.Color(0xa7b0b5), dayF)
    .lerp(new THREE.Color(0x5a6068).multiplyScalar(0.3 + dayF * 0.7), WX.amt * 0.5);
  sun.intensity *= 1 - WX.amt * 0.55;
  (scene.fog as THREE.Fog).color.copy(fogC);
  renderer.setClearColor(fogC);
  hemi.color.setHSL(0.6, 0.5, 0.35 + dayF * 0.45);
  if (player.pos.z < -6000) {
    // v22.3 underground: no sun or sky; only the station's own lights (or emergency lights after the cut)
    sun.intensity = 0;
    hemi.intensity = UT.power ? 0.5 : 0.07;
    hemi.color.set(0xdfe6f0);
    const uc = new THREE.Color(UT.power ? 0x14161a : 0x030405);
    (scene.fog as THREE.Fog).color.copy(uc);
    renderer.setClearColor(uc);
  }
  const PW = UT.power ? 1 : 0;
  if ((updateLamps as any).pw !== PW) {
    (updateLamps as any).pw = PW;
    setPower(!!PW);
  }
  updateLamps((1 - dayF) * PW, dt);
  decay?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z);
  facade?.update(1 - dayF, PW);
  alley?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z, PW);
  roadMat.roughness = 0.95 - (1 - dayF) * 0.55;
  roadMat.metalness = (1 - dayF) * 0.35;
  flash.intensity = player.light ? 60 : 0;
  flash.position.set(player.pos.x, 1.6, player.pos.z);
  flash.target.position.copy(aimPt);
  // camera
  camera.position.copy(player.pos).add(CAM_OFF);
  camera.lookAt(player.pos);
  // HUD
  saveT += dt;
  if (saveT > 20) {
    saveT = 0;
    save();
  }
  streetT -= dt;
  if (streetT < 0) {
    streetT = 0.7;
    updateStreet();
  }
  drawHud(inside);
}
let redT = 0;
function flashRed() {
  redT = 0.25;
  renderer.domElement.style.filter = 'saturate(2) hue-rotate(-20deg) brightness(1.2)';
  setTimeout(() => (renderer.domElement.style.filter = ''), 150);
}
function updateStreet() {
  let best = '',
    bd = 25;
  for (const r of roads) {
    if (!r.n) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((player.pos.x - ax) * dx + (player.pos.z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(player.pos.x - ax - dx * t, player.pos.z - az - dz * t);
      if (d < bd) {
        bd = d;
        best = r.n;
      }
    }
  }
  const sec = sectorOf(player.pos.x, player.pos.z);
  $('street').textContent =
    `📍 ${best || '巷弄'}・${SECTOR_LABEL(sec)}區 ${liberated.has(sec) ? '（已奪回）' : '（佔領中）'}`;
}
function bar(name: string, v: number, col: string) {
  return `<div class="bar"><div class="t"><span>${name}</span><span>${Math.round(v)}</span></div><div class="b"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></div></div>`;
}
function drawHud(inside: Bld | null) {
  const m: string[] = [];
  if (player.hunger < 25) m.push('飢餓');
  if (player.thirst < 25) m.push('口渴');
  if (player.fatigue > 75) m.push('疲憊');
  if (player.bleed) m.push('流血');
  if (player.hp < 30) m.push('重傷');
  if (player.sneak) m.push('潛行中');
  if (player.sleeping) m.push('睡眠中');
  if (sols.some(s => s.state === 'combat' && s.mesh.visible)) m.push('被追捕');
  $('stats').innerHTML =
    bar('生命', player.hp, '#c33') +
    bar('飽足', player.hunger, '#c9842a') +
    bar('水分', player.thirst, '#3a8ad6') +
    bar('精神', 100 - player.fatigue, '#8a6ad6') +
    `<div class="moodles">${m.map(x => `<span>${x}</span>`).join('')}</div>`;
  const day = Math.floor(gameMin / 1440) + 1,
    h = Math.floor(gameMin / 60) % 24,
    mi = Math.floor(gameMin) % 60;
  $('clock').textContent =
    `第 ${day} 天 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${isNight() ? '🌙 宵禁' : '☀'}${raining() ? ' 🌧' : ''}`;
  const alive = sols.filter(s => s.state !== 'dead').length;
  if (!PRO.on)
    $('objective').textContent =
      `已奪回街區 ${liberated.size} / ${NSEC}｜殘存佔領軍 ${alive}` +
      (evacOpen()
        ? `｜🚁 撤離窗口剩 ${Math.floor((EV1 - gameMin) / 60)} 小時 ${Math.floor((EV1 - gameMin) % 60)} 分`
        : '');
  const eq = player.equip ? ITEMS[player.equip] : null;
  $('equip').innerHTML =
    `武器：<b>${eq ? eq.name : '徒手'}</b>${eq && eq.kind === 'gun' ? `　彈藥 ${player.inv[eq.ammo!] || 0}` : ''}　負重 ${weight().toFixed(1)}kg${player.light ? '　🔦' : ''}`;
  const c = nearestCont(),
    d = nearestDoor();
  const pr = $('prompt');
  const np = npcPrompt();
  if (np && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = np;
  } else if (!panelOpen && !survOpen && tradeAt() && !c) {
    pr.style.display = 'block';
    pr.textContent = `[E] ${tradeAt()!.name}`;
  } else if (!panelOpen && !survOpen && atHome() && !c) {
    pr.style.display = 'block';
    pr.textContent = '[E] 避難所（升級／存糧／拜拜）';
  } else if (shopAt() && !panelOpen && !c) {
    const sh = shopAt()!;
    pr.style.display = 'block';
    pr.textContent = UT.power
      ? sh.kind === 'locker'
        ? `[E] ${sh.name}`
        : `[E] ${sh.vend ? '投幣購買' : '購物'}：${sh.name}（錢包 NT$ ${wallet()}）`
      : `[E] 撬開${sh.name}（會發出很大的聲響）`;
  } else if (metroBoard() >= 0 && !panelOpen && !riding) {
    pr.style.display = 'block';
    pr.textContent = '[E] 搭乘艋舺橘線（選擇目的地）';
  } else if (metroAt() && !panelOpen) {
    const m = metroAt()!;
    pr.style.display = 'block';
    pr.textContent = m.down
      ? `[E] 進站：北都地下鐵 ${m.st.name}站 ${m.gt.no} 號出口`
      : `[E] 往 ${m.gt.no} 號出口回地面（${m.st.name}）`;
  } else if (c && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = `[E] 搜刮 ${c.label}${Object.keys(c.items).length ? '' : '（空）'}`;
  } else if (!panelOpen && drive.cur) {
    pr.style.display = 'block';
    pr.textContent = `[E] 下車｜${drive.status(drive.cur)}｜${Math.round(Math.abs(drive.cur.v) * 3.6)} km/h`;
  } else if (!panelOpen && drive.nearest(player.pos)) {
    const v = drive.nearest(player.pos)!;
    pr.style.display = 'block';
    pr.textContent = `[E] ${v.s.drive ? (v.s.two ? '騎' : '開') : '查看'} ${v.s.name}${v.key || !v.s.key ? '（鑰匙還在）' : ''}`;
  } else if (!panelOpen && vehicles.nearest(player.pos, 2.2)) {
    pr.style.display = 'block';
    pr.textContent = '[E] 查看載具';
  } else if (d && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = d.barricaded ? '[B] 拆除封門' : '[B] 封門（鐵鎚+木板）';
  } else pr.style.display = 'none';
  // v22.4 prompts show the key actually bound (settings → 按鍵設定)
  const t0 = pr.textContent || '';
  if (t0.startsWith('[E]')) pr.textContent = `[${keyLabel('interact')}]` + t0.slice(3);
  else if (t0.startsWith('[B]')) pr.textContent = `[${keyLabel('barricade')}]` + t0.slice(3);
}
function die() {
  dead = true;
  (localStorage.removeItem(SAVE), localStorage.removeItem('dt.tiles'));
  closePanel();
  const t = $('title');
  t.style.display = 'flex';
  const day = Math.floor(gameMin / 1440) + 1;
  t.innerHTML = `<h1 style="color:#c33">你陣亡了</h1><h2>這就是你的結局。</h2><p>你在淪陷的台北撐過了 ${day} 天，擊倒 ${player.kills} 名佔領軍，奪回了 ${liberated.size} 個街區。</p><button onclick="location.reload()">重新開始（新的倖存者）</button>`;
}
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (cine.on) {
    requestAnimationFrame(loop);
    return;
  }
  if (rocCine) {
    rocCineStep(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
    return;
  }
  update(dt);
  if (fpv?.active) {
    fpv.update(dt);
    if (fpv.active) fpv.render(renderer);
    else renderer.render(scene, camera);
  } else renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- opening / prologue: normal morning → invasion mid-commute ----------
const PRO = {
  on: false,
  hide: false,
  t: 0,
  stage: 0,
  from: [0, 0] as V2,
  dest: [0, 0] as V2,
  label: '',
  beam: null as THREE.Object3D | null,
  nb: 0,
  sir: null as any,
  msgs: 0,
};
function siren(on: boolean) {
  try {
    if (on && !PRO.sir) {
      const ac = new AudioContext();
      const o = ac.createOscillator(),
        g = ac.createGain(),
        l = ac.createOscillator(),
        lg = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 520;
      l.frequency.value = 0.12;
      lg.gain.value = 260;
      l.connect(lg);
      lg.connect(o.frequency);
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      l.start();
      PRO.sir = ac;
    } else if (!on && PRO.sir) {
      PRO.sir.close();
      PRO.sir = null;
    }
  } catch {
    /* no audio */
  }
}
function scrFlash(col: string, ms = 600) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;inset:0;z-index:40;pointer-events:none;background:${col};transition:opacity ${ms}ms;opacity:1`;
  document.body.appendChild(f);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      f.style.opacity = '0';
    }),
  );
  setTimeout(() => f.remove(), ms + 100);
}
function startPrologue(from: V2, dest: V2, label: string) {
  Object.assign(PRO, { on: true, hide: true, t: 0, stage: 1, from, dest, label, msgs: 0, nb: 0 });
  gameMin = 7 * 60 + 20;
  roadT.rebuild();
  traffic.start(
    mainRoads.map(r => ({ p: r.p, w: ROADW[r.t.replace('_link', '')] ?? 9 })),
    from,
    26,
  );
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  beam.position.y = 20;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd040, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.position.set(dest[0], 0, dest[1]);
  scene.add(g);
  PRO.beam = g;
  const ov = document.createElement('div');
  ov.id = 'wake';
  ov.innerHTML = `<div>07:20　⏰ 鬧鐘響了</div><small>${ROLE.names[player.gender === 'm' ? 0 : 1]}・${ROLE.name}｜今天也要去${label}</small>`;
  document.body.appendChild(ov);
  const sk = document.createElement('button');
  sk.id = 'skipbtn';
  sk.textContent = '跳過開場 ⏭';
  sk.onclick = () => endPrologue();
  document.body.appendChild(sk);
}
function endPrologue() {
  if (!PRO.on) return;
  PRO.on = false;
  PRO.hide = false;
  PRO.stage = 9;
  siren(false);
  traffic.abandonAll();
  if (PRO.beam) scene.remove(PRO.beam);
  document.getElementById('skipbtn')?.remove();
  document.getElementById('wake')?.remove();
  log('解放軍已攻入萬華，街上到處是哨兵與裝甲車。從現在起，活下去，一區一區奪回來。', '#ffd76a');
}
const PRO_NEWS: [number, string, string][] = [
  [3, '📱 早安推播', '今日台北：多雲 26°C，午後局部陣雨。'],
  [12, '📱 新聞快訊', '國防部：共軍於台海周邊實施「聯合演習」，政府呼籲民眾照常上班上課。'],
  [24, '📱 交通', '北都地下鐵正常營運；西門町周邊道路車多請改道。'],
  [38, '📱 新聞快訊', '多處網站遭受大規模網路攻擊，部分銀行 App 暫停服務。'],
];
function updatePrologue(dt: number) {
  if (!PRO.on) return;
  PRO.t += dt;
  const P = player.pos;
  const tot = Math.hypot(PRO.dest[0] - PRO.from[0], PRO.dest[1] - PRO.from[1]) || 1;
  const left = Math.hypot(PRO.dest[0] - P.x, PRO.dest[1] - P.z);
  const prog = 1 - left / tot;
  {
    const ov = document.getElementById('wake');
    if (ov) {
      if (PRO.t > 2.6) ov.classList.add('out');
      if (PRO.t > 4.2) ov.remove();
    }
  }
  if (PRO.stage === 1) {
    while (PRO.msgs < PRO_NEWS.length && PRO.t > PRO_NEWS[PRO.msgs][0]) {
      const [, w, m] = PRO_NEWS[PRO.msgs++];
      phone(w, m);
    }
    $('objective').textContent = `🧭 前往${PRO.label}（還有 ${Math.round(left)} m）｜跟著黃色光柱`;
    if (prog > 0.45 || PRO.t > 75 || left < 6) {
      PRO.stage = 2;
      PRO.t = 0;
      siren(true);
      traffic.panic();
      roadT.rebuild();
      scrFlash('rgba(200,20,10,.55)', 900);
      phone('⚠️ 國家級警報', '飛彈空襲警報！共軍部隊於淡水河沿岸登陸，請立即就近避難，遠離窗戶。');
      log('📢 防空廣播：「這不是演習！這不是演習！請民眾立即進入地下室或避難處所……」', '#ff8a7a');
      noise(P.x, P.z, 1);
    }
  } else if (PRO.stage === 2) {
    $('objective').textContent = '⚠️ 空襲警報！找掩蔽！';
    PRO.nb -= dt;
    if (PRO.nb <= 0 && PRO.t < 14) {
      PRO.nb = 1.2 + Math.random() * 1.5;
      const a = Math.random() * 7,
        d = 16 + Math.random() * 34;
      const e = new THREE.Vector3(P.x + Math.cos(a) * d, 2, P.z + Math.sin(a) * d);
      boom(scene, e, 2);
      scrFlash('rgba(255,200,120,.25)', 400);
    }
    if (PRO.t > 5 && PRO.hide) {
      PRO.hide = false;
      phone('📱 LINE 家族群組', '你在哪？？西園路那邊有軍車開進來了！不要出門！');
      log('街口傳來履帶聲——穿著陌生迷彩的士兵封鎖了路口。', '#ff8a7a');
    }
    if (PRO.t > 16) endPrologue();
  }
}

// ---------- boot ----------
const prog = async (f: number, msg: string) => {
  const i = document.querySelector('#loadbar i') as HTMLElement | null;
  if (i) i.style.width = Math.round(f * 100) + '%';
  $('loadmsg').textContent = msg;
  await new Promise(r => setTimeout(r, 0));
};
// deferred rooftop dressing, streamed in by distance to the player
const roofJobs: { x: number; z: number; f: () => void }[] = [];
function pumpRoofs(px: number, pz: number, budgetMs: number, maxD = 1e9) {
  if (!roofJobs.length) return;
  const t0 = performance.now();
  roofJobs.sort((a, b) => Math.hypot(b.x - px, b.z - pz) - Math.hypot(a.x - px, a.z - pz));
  while (roofJobs.length && performance.now() - t0 < budgetMs) {
    const j = roofJobs[roofJobs.length - 1];
    if (Math.hypot(j.x - px, j.z - pz) > maxD) break;
    roofJobs.pop();
    j.f();
  }
}
async function boot() {
  await prog(0.3, '下載萬華地圖資料（OpenStreetMap）…');
  const data = await (await fetch(import.meta.env.BASE_URL + 'data/wanhua.json')).json();
  await district.ready;
  {
    const [x0, z0, x1, z1] = district.ix.bbox;
    WORLD_B.minx = x0;
    WORLD_B.minz = z0;
    WORLD_B.maxx = x1;
    WORLD_B.maxz = z1;
    // landmark footprints replace the core's generic boxes there
    const R = District.rects(district.ix);
    data.buildings = data.buildings.filter((b: any) => {
      const c = b.p.reduce((a: V2, q: V2) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]);
      return !R.some(r => c[0] > r[0] && c[0] < r[2] && c[1] > r[1] && c[1] < r[3]);
    });
  }
  await prog(0.45, '建造街區…');
  buildMap(data);
  Object.assign(WORLD, WORLD_B);
  await prog(0.65, '佈置出生點附近的室內與巷弄…');
  const sv = (() => {
    try {
      return JSON.parse(localStorage.getItem(SAVE) || 'null');
    } catch {
      return null;
    }
  })();
  // ---- detailed blocks around spawn (剝皮寮 / 康定路 / 西門町 edge) ----
  const homes = blds.filter(b => b.door && b.type === 'home' && Math.abs(b.c[0]) < 167 && Math.abs(b.c[1]) < 167);
  const fx = {
    rnd,
    pip,
    addSeg: (q: { a: V2; b: V2 }) => addSeg(q),
    bldAt,
    scene,
    utils: { mergeGeometries },
    addCont: (c: any) => {
      const cc: Cont = c;
      conts.push(cc);
    },
  } as any;
  const area = (b: Bld) => (b.maxx - b.minx) * (b.maxz - b.minz);
  const startCands = homes
    .filter(b => area(b) > 70 && area(b) < 400)
    .sort(
      (a, b) =>
        Math.hypot(
          a.c[0] - homes[Math.floor(homes.length / 2)].c[0],
          a.c[1] - homes[Math.floor(homes.length / 2)].c[1],
        ) -
        Math.hypot(
          b.c[0] - homes[Math.floor(homes.length / 2)].c[0],
          b.c[1] - homes[Math.floor(homes.length / 2)].c[1],
        ),
    );
  let start: Bld | null = null;
  for (const c of startCands) {
    if (furnish(c, 'home', fx)) {
      start = c;
      c.detailed = 'home';
      break;
    }
  }
  if (!start) start = homes[0] || blds.find(b => b.door)!;
  const near = blds
    .filter(b => b !== start && b.door && !b.detailed && Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]) < 130)
    .sort(
      (a, b) =>
        Math.hypot(a.c[0] - start!.c[0], a.c[1] - start!.c[1]) - Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]),
    );
  const want = [
    'market',
    'store',
    'pharmacy',
    'grocery',
    'hardware',
    'breakfast',
    'betel',
    'grocery',
    'hardware',
    'store',
    'breakfast',
    'betel',
    'pharmacy',
    'grocery',
  ];
  const KIND_SIGN: Record<string, string> = { store: 'store', pharmacy: 'pharmacy' };
  for (const k of want) {
    const cand = near.find(
      b =>
        !b.detailed &&
        (k === 'betel' ? area(b) < 120 : k === 'market' ? area(b) > 220 : area(b) > 50) &&
        furnish(b, k, fx),
    );
    if (cand) {
      cand.detailed = k;
      cand.type = KIND_SIGN[k] || k;
      if (b2sign[k]) setSign(cand, k);
    }
  }
  for (const b of near.slice(0, 60)) if (!b.detailed && area(b) > 40 && furnish(b, 'home', fx)) b.detailed = 'home';
  // remove generic containers inside detailed buildings
  for (let i = conts.length - 1; i >= 0; i--) {
    const c = conts[i];
    if (c.b && c.b.detailed && !c.id.startsWith('x')) {
      c.mesh.parent?.remove(c.mesh);
      conts.splice(i, 1);
    }
  }
  // night market on the nearest named mid-size road
  let bestR: any = null,
    bd = 1e9;
  for (const r of roads) {
    if (!['tertiary', 'residential', 'pedestrian', 'unclassified'].includes(r.t) || r.p.length < 2) continue;
    const d = Math.min(...r.p.map(p => Math.hypot(p[0] - start!.c[0], p[1] - start!.c[1])));
    if (d < bd && d > 15) {
      bd = d;
      bestR = r;
    }
  }
  if (bestR) nightMarket(bestR.p, bestR.t === 'tertiary' ? 9 : 6, fx, 'nm');
  setupArmor(start!.c as V2);
  spawnDrivables(start!.c as V2);
  buildJunctions();
  await roadT.init();
  decay = buildDecay({
    scene,
    rnd,
    pip,
    bldAt,
    addSeg: (q, low) => addSeg(q, low),
    merge: mergeGeometries,
    roads,
    blds,
    RW: ROADW,
    center: start.c,
    R: 140,
    doors: doors.map(d => d.p),
  });
  checkpoints = decay.checkpoints;
  setupRecon(start!.c as V2);
  setupRoc();
  alley = buildAlley({
    poles: decay.polePos,
    scene,
    rnd,
    pip,
    bldAt,
    addSeg: (q, low) => addSeg(q, low),
    merge: mergeGeometries,
    roads,
    blds,
    RW: ROADW,
    center: start.c,
    R: 85,
    doors: doors.map(d => d.p),
  });
  facade = buildFacade({ scene, pip, bldAt, merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 110 });
  console.log('facade', JSON.stringify(facade.stats));
  parks = buildParks({
    scene,
    bldAt,
    merge: mergeGeometries,
    addSeg: (q, low) => addSeg(q, low),
    roadDist,
    center: start.c,
    R: 110,
  });
  console.log('parks', JSON.stringify(parks));
  // navigation grid (built after all collision geometry exists)
  nav = new Nav(start.c[0] - 170, start.c[1] - 170, start.c[0] + 170, start.c[1] + 170, 0.5);
  for (const q of segs) nav.markSeg(q.a, q.b, 1);
  spawnSoldiers(new Set(sv?.dead || []));
  scene.add(rainMesh);
  setupInformant(start.c as V2, !(sv && sv.inf));
  {
    let best: V2 | null = null;
    for (const r of roads)
      for (const q of r.p)
        if (
          Math.abs(q[1] - start.c[1]) < 250 &&
          q[0] > bounds.minx + 8 &&
          !bldAt(q[0], q[1]) &&
          !bldAt(q[0] + 6, q[1]) &&
          !bldAt(q[0] - 6, q[1]) &&
          (!best || q[0] < best[0])
        )
          best = q;
    if (best) evac = buildEvacZone(scene, best[0], best[1]);
  }
  {
    let n = 0;
    for (let k = 0; k < 400 && n < 3; k++) {
      const a = k * 0.7,
        d = 4 + k * 0.08;
      const q: V2 = [start.c[0] + Math.cos(a) * d, start.c[1] + Math.sin(a) * d];
      if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.6, q[1]) && !bldAt(q[0], q[1] + 0.6)) {
        makeBucket('rb' + n++, q);
      }
    }
  }
  const sp = start.door!.p;
  const ip: V2 = [sp[0] + (start.c[0] - sp[0]) * 0.25, sp[1] + (start.c[1] - sp[1]) * 0.25];
  player.pos.set(ip[0], 0, ip[1]);
  if (!sv) {
    makeCont('start', [ip[0] + 0.4, ip[1] + 0.4], 'home', start, {
      knife: 1,
      water: 1,
      plank: 2,
      hammer: 1,
      bandage: 1,
      rice: 1,
    });
  }
  for (const s of sols)
    if (s.state !== 'dead' && s.pos.distanceTo(player.pos) < 25) {
      s.pos.x += 40;
    }
  {
    let k = 0;
    for (const cp of checkpoints)
      for (let g = 0; g < 2; g++) {
        const s = sols[k++];
        if (!s || s.state === 'dead') continue;
        const p: V2 = [cp[0] + (g ? 2.2 : -2.2), cp[1] + (g ? 1 : -1)];
        s.post = p;
        s.pos.set(p[0], 0, p[1]);
        s.sector = sectorOf(p[0], p[1]);
        s.night = false;
      }
  }
  checkSectors(true);
  await prog(0.85, '加蓋頂樓（目前街區）…');
  pumpRoofs(start.c[0], start.c[1], 1e9, 160);
  (window as any).__roofLeft = () => roofJobs.length;
  import('./map').then(({ GameMap }) => {
    gmap = new GameMap({
      blds: blds as any,
      roads: roads as any,
      bounds: WORLD,
      sectors: SECTORS,
      sectorOf,
      sectorName: SECTOR_LABEL,
      district: {
        ...district.ix,
        more: async () => (await fetch(import.meta.env.BASE_URL + 'data/district/map.json')).json(),
      },
      liberated: () => liberated,
      player: () => ({ x: player.pos.x, z: player.pos.z, rot: player.mesh ? player.mesh.rotation.y : 0 }),
      parks: (parks?.clusters || []) as V2[],
      outposts: () => checkpoints,
      evac: () => (evac ? (evac.pos as V2) : null),
      home: () => start!.c as V2,
    });
    // v21.6 北都地下鐵 stations (interior only; walk into an entrance to go down)
    {
      let sd = 2166;
      const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      metro = buildMetro({
        scene,
        addSeg,
        removeSeg,
        snap: (x, z) => {
          for (let rad = 0; rad < 120; rad += 3)
            for (let a = 0; a < 6.28; a += 0.4) {
              const px = x + Math.cos(a) * rad,
                pz = z + Math.sin(a) * rad;
              const rd = roadDist(px, pz);
              if (rd > 3 && rd < 7 && !bldAt(px, pz) && !bldAt(px, pz + 2) && !bldAt(px, pz - 4)) return [px, pz];
            }
          return [x, z];
        },
      });
      for (const st of metro) for (const l of st.loot) makeCont(l.id, l.p, l.type, undefined, rollLoot(l.type, r));
    }
    if (player.inv.rocradio) mapIntelOutposts('解放軍哨點（國軍情資）');
    if (MOBILE) {
      const mb = document.createElement('button');
      mb.id = 'mapbtn';
      mb.textContent = '🗺';
      mb.title = '地圖';
      mb.style.display = 'none';
      mb.onclick = () => gmap?.toggle();
      document.body.appendChild(mb);
      const cb = document.createElement('button');
      cb.id = 'coverbtn';
      cb.textContent = '🛡';
      cb.title = '掩體';
      cb.onclick = () => toggleCover();
      document.body.appendChild(cb);
      initPortraitButtons();
    }
    (window as any).__game && ((window as any).__game.map = gmap);
  });
  await prog(1, '完成');
  const btns = $('btns');
  $('loadmsg').textContent = `地圖：萬華・西門町（${blds.length} 棟建築，${roads.length} 條街道）`;
  const findBed = (b: Bld): V2 | null => {
    let r: V2 | null = null;
    const v = new THREE.Vector3();
    scene.traverse(o => {
      if (r || !o.userData.bed) return;
      o.getWorldPosition(v);
      if (pip([v.x, v.z], b.pts)) r = [v.x, v.z];
    });
    return r;
  };
  const nearestBy = (f: (b: Bld) => boolean, from: V2, minD = 0, maxD = 1e9) =>
    blds
      .filter(b => b.door && f(b))
      .map(b => [b, Math.hypot(b.c[0] - from[0], b.c[1] - from[1])] as const)
      .filter(([, d]) => d >= minD && d <= maxD)
      .sort((a, b) => a[1] - b[1])[0]?.[0];
  const doorIn = (b: Bld): V2 => {
    const d = b.door!.p;
    return [d[0] + (b.c[0] - d[0]) * 0.2, d[1] + (b.c[1] - d[1]) * 0.2];
  };
  const spawnRole = (r: Role, skip: boolean) => {
    const sc = start!.c as V2;
    let from: V2 = [player.pos.x, player.pos.z];
    let home: Bld = start!;
    const hosp = nearestBy(b => /醫院/.test((b as any).nm), sc);
    if (r.spawn === 'hospital' && hosp) {
      const dorm = nearestBy(b => b.type === 'home' && b !== hosp && area(b) > 50, hosp.c as V2, 25, 160);
      if (dorm) {
        if (!dorm.detailed && furnish(dorm, 'home', fx)) dorm.detailed = 'home';
        home = dorm;
        from = doorIn(dorm);
      }
    }
    if (r.spawn === 'scooter') {
      const d = start!.door!.p;
      const nx = d[0] + (d[0] - sc[0]) * 0.6,
        nz = d[1] + (d[1] - sc[1]) * 0.6;
      if (!bldAt(nx, nz)) from = [nx, nz];
      drive.spawn('delivery', from[0] + 1.2, from[1] + 0.6, 0, Math.random, {
        key: true,
        fuel: 4,
        tyre: 1,
        eng: 1,
        bat: 1,
      });
      log('你的外送機車就停在門口，鑰匙在身上。', '#9cf');
    } else {
      const bed = findBed(home);
      // v21.2: wake beside the bed on whichever side is open floor inside the home and connected to the door
      // (a fixed +x offset put some roles inside the wall next to a bed against the east wall → stuck)
      if (bed) {
        from = doorIn(home);
        for (const [ox, oz] of [
          [0.9, 0],
          [-0.9, 0],
          [0, 0.9],
          [0, -0.9],
          [1.3, 0],
          [-1.3, 0],
          [0, 1.3],
          [0, -1.3],
        ]) {
          const x = bed[0] + ox,
            z = bed[1] + oz;
          if (pip([x, z], home.pts) && walkable(x, z) && escapeCheck(x, z).ok) {
            from = [x, z];
            break;
          }
        }
      }
    }
    player.pos.set(from[0], 0, from[1]);
    if (unstuck()) console.warn('spawn: nudged to a walkable point');
    const dest =
      r.dest === 'hospital' && hosp
        ? hosp
        : r.dest === 'office'
          ? nearestBy(b => /商業大樓|大樓|銀行/.test((b as any).nm), from, 120)
          : r.dest === 'school'
            ? nearestBy(b => /文教|學/.test((b as any).nm) || area(b) > 900, from, 150)
            : r.dest === 'delivery'
              ? nearestBy(b => b.type === 'store' || b.type === 'market', from, 120)
              : nearestBy(b => area(b) > 200, from, 140, 260);
    if (r.skills.streets && gmap) gmap.revealRect(bounds.minx, bounds.minz, bounds.maxx, bounds.maxz);
    if (!skip && dest) startPrologue(from, dest.door!.p as V2, r.destLabel);
  };
  const go = (load: boolean, gender = 'm', roleId = 'courier', skipIntro = false) => {
    if (load && sv) {
      gender = sv.g || 'm';
      roleId = sv.r || (gender === 'f' ? 'nurse' : 'courier');
    }
    ROLE = roleById(roleId);
    player.gender = gender;
    player.rig = spawnRig({ gender, ...ROLE.look[gender as 'm' | 'f'], outfit: ROLE.id });
    player.mesh = player.rig.root;
    if (load && sv) {
      player.pos.set(sv.p[0], 0, sv.p[1]);
      Object.assign(player, {
        hp: sv.hp,
        hunger: sv.hu,
        thirst: sv.th,
        fatigue: sv.fa,
        bleed: sv.bl,
        inv: sv.inv,
        equip: sv.eq,
        kills: sv.k,
      });
      gameMin = sv.t;
      DAYH = sv.dl || 1;
      if (sv.wx) Object.assign(WX, sv.wx);
      if (sv.ex) UT.ev.ex = 1;
      if (sv.inf) INF = sv.inf;
      if (sv.ut) Object.assign(UT, sv.ut);
      if (sv.surv) surv = sv.surv;
      const map = new Map<string, any>(sv.conts.map((c: any) => [c[0], c]));
      for (const c of conts) {
        const s = map.get(c.id);
        if (s) c.items = s[1];
        map.delete(c.id);
      }
      map.forEach(c =>
        String(c[0]).startsWith('pb') ? makeBucket(c[0], c[2], c[1]) : makeCont(c[0], c[2], 'crate', undefined, c[1]),
      );
      (sv.bar || []).forEach((i: number) => doors[i] && setBarricade(doors[i]));
      checkSectors(true);
      conts.forEach(updateVis);
    } else {
      (localStorage.removeItem(SAVE), localStorage.removeItem('dt.tiles'));
      gmap?.reset();
      roadT.reset();
      player.inv = { ...ROLE.inv };
      spawnRole(ROLE, skipIntro);
    }
    if (MP) startNet();
    $('title').style.display = 'none';
    started = true;
    if (!surv.home) surv.home = [player.pos.x, player.pos.z];
    document.body.classList.add('ingame');
    document.getElementById('startbar')?.remove();
    {
      const mb = document.getElementById('mapbtn');
      if (mb) mb.style.display = '';
    }
    lastHp = player.hp;
    startRainAudio();
    {
      const sp = document.createElement('div');
      sp.id = 'speed';
      sp.innerHTML =
        '<span class="st"></span>' +
        SPEEDS.map(
          (v, i) => `<button data-s="${v}" title="按 ${i + 1}">${v === 1 ? '▶' : v === 3 ? '⏩' : '⏭'} ×${v}</button>`,
        ).join('') +
        `<small>一天 = ${DAYH} 小時</small>`;
      sp.querySelectorAll('button').forEach(
        b => ((b as HTMLElement).onclick = () => setSpeed(+(b as HTMLElement).dataset.s!)),
      );
      $('topright').appendChild(sp);
      renderSpeed();
    }
    PRO.on || log('十月某日清晨，解放軍登陸後三天，台北淪陷。萬華的電燈還亮著，水龍頭還有水——但能撐多久？', '#ffd76a');
    log(
      MOBILE
        ? '提示：先按「搜」搜刮身邊的櫥櫃，☰ 開選單。'
        : `提示：先搜刮身邊的櫥櫃（${keyLabel('interact')}），按 ${keyLabel('inv')} 開背包裝備菜刀；Esc 開選單。`,
      '#ccc',
    );
  };
  // v22.4 title menu: 繼續遊戲 / 新遊戲 / 多人連線 / 設定 / 操作說明 / 製作名單; 新遊戲 and 多人連線 open the role select
  const tm = document.createElement('div');
  tm.id = 'tmenu';
  tm.innerHTML =
    (sv ? '<button data-a="cont" class="pri">繼續遊戲</button>' : '') +
    `<button data-a="new"${sv ? '' : ' class="pri"'}>新遊戲</button><button data-a="mp">多人連線</button><button data-a="set">設定</button><button data-a="help">操作說明</button><button data-a="about">製作名單／關於</button>`;
  const showSel = (mp = false) => {
    document.body.classList.add('selmode');
    btns.style.display = '';
    tm.style.display = 'none';
    if (mp) document.getElementById('mpsel')?.scrollIntoView({ block: 'center' });
    document.getElementById('mpsel')?.classList.toggle('hl', mp);
  };
  const showTm = () => {
    document.body.classList.remove('selmode');
    btns.style.display = 'none';
    tm.style.display = '';
  };
  tm.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        const a = (b as HTMLElement).dataset.a;
        if (a === 'cont') go(true);
        else if (a === 'new') {
          if (sv && !confirm('開始新遊戲會覆蓋目前的存檔，確定？')) return;
          showSel();
        } else if (a === 'mp') showSel(true);
        else if (a === 'set') openSettings();
        else if (a === 'help') openHelp();
        else openAbout();
      }),
  );
  btns.parentElement!.insertBefore(tm, btns);
  {
    const back = document.createElement('button');
    back.id = 'selback';
    back.textContent = '← 返回主選單';
    back.onclick = showTm;
    btns.appendChild(back);
  }
  showTm();
  (window as any).__newGame = () => showSel();
  (window as any).__titleBack = () => document.body.classList.contains('selmode') && showTm();
  const sel = document.createElement('div');
  sel.id = 'charsel';
  let selG: 'm' | 'f' = 'm';
  let skipI = false;
  const gsw = document.createElement('div');
  gsw.id = 'gsel';
  gsw.innerHTML = `<button data-x="m" class="on">男</button><button data-x="f">女</button><label><input type="checkbox" id="skipintro"> 跳過開場</label>`;
  const mpw = document.createElement('div');
  mpw.id = 'mpsel';
  const defB = MPQ.get('mp') || 'http://localhost:8787';
  mpw.innerHTML = `<span>🌐 多人連線（實驗・2–4 人）：</span><input id="mpbase" value="${defB}" size="22"><button id="mpnew">建立房間</button><input id="mpcode" placeholder="房間代碼" maxlength="5" size="6" value="${MPQ.get('room') || ''}"><button id="mpjoin">加入</button><em id="mpmsg"></em>`;
  const mpMsg = (t: string) => {
    (mpw.querySelector('#mpmsg') as HTMLElement).textContent = t;
  };
  (mpw.querySelector('#mpnew') as HTMLElement).onclick = async () => {
    const base = (mpw.querySelector('#mpbase') as HTMLInputElement).value.replace(/\/$/, '');
    mpMsg('建立中…');
    try {
      const { Net } = await import('./net');
      const code = await new Net(base).create();
      (mpw.querySelector('#mpcode') as HTMLInputElement).value = code;
      MP = { base, code };
      mpMsg(`房間 ${code} 已建立，選角色開始；把代碼給朋友`);
    } catch (e) {
      mpMsg('伺服器連不上：' + (e as Error).message);
    }
  };
  (mpw.querySelector('#mpjoin') as HTMLElement).onclick = () => {
    const base = (mpw.querySelector('#mpbase') as HTMLInputElement).value.replace(/\/$/, '');
    const code = (mpw.querySelector('#mpcode') as HTMLInputElement).value.trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) return mpMsg('代碼是 5 碼');
    MP = { base, code };
    mpMsg(`將加入 ${code}，選角色開始`);
  };
  if (MPQ.get('room')) MP = { base: defB, code: MPQ.get('room')!.toUpperCase() };
  let selR = ROLES[0].id;
  const markSel = () => {
    sel.querySelectorAll('.ch').forEach(x => x.classList.toggle('on', (x as HTMLElement).dataset.r === selR));
    const r = roleById(selR);
    const sb = document.getElementById('startbar');
    if (sb) sb.querySelector('b')!.textContent = `${r.names[selG === 'm' ? 0 : 1]}・${r.name}`;
  };
  const drawSel = () => {
    sel.innerHTML = ROLES.map(r => {
      const o = r.look[selG];
      return `<div class="ch" data-g="${selG}" data-r="${r.id}"><img class="pv" alt="" src="${rolePortrait(r.id, selG)}"><b>${r.names[selG === 'm' ? 0 : 1]}・${r.name}</b><small>${selG === 'm' ? '男' : '女'}・${r.age[selG === 'm' ? 0 : 1]} 歲<br>${r.blurb}<br><em>${r.perks.join('・')}</em></small></div>`;
    }).join('');
    sel.querySelectorAll('.ch').forEach(
      el =>
        ((el as HTMLElement).onclick = () => {
          const rid = (el as HTMLElement).dataset.r!;
          // v21.5.1 portrait phones: a tap picks the role, the sticky 開始遊戲 bar starts
          if (document.body.classList.contains('portrait')) {
            selR = rid;
            markSel();
          } else go(false, selG, rid, skipI);
        }),
    );
    markSel();
  };
  gsw.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        selG = (b as HTMLElement).dataset.x as 'm' | 'f';
        gsw.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        drawSel();
      }),
  );
  (gsw.querySelector('#skipintro') as HTMLInputElement).onchange = e => {
    skipI = (e.target as HTMLInputElement).checked;
  };
  drawSel();
  (window as any).__selG = (g: 'm' | 'f') => {
    selG = g;
    drawSel();
  };
  const dl = document.createElement('div');
  dl.id = 'daylen';
  dl.innerHTML =
    '<span>新遊戲・一天長度（現實時間）：</span>' +
    [1, 2, 4]
      .map(x => `<button data-h="${x}" class="${x === 1 ? 'on' : ''}">${x} 小時${x === 1 ? '（預設）' : ''}</button>`)
      .join('');
  dl.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        DAYH = +(b as HTMLElement).dataset.h!;
        dl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      }),
  );
  const h = document.createElement('div');
  h.className = 'selh';
  h.textContent = '選擇你的倖存者：';
  btns.appendChild(h);
  btns.appendChild(dl);
  btns.appendChild(gsw);
  btns.appendChild(sel);
  btns.appendChild(mpw);
  {
    const sb = document.createElement('div');
    sb.id = 'startbar';
    sb.innerHTML = '<span>已選：<b></b></span><button id="startgo">開始遊戲 ▶</button>';
    (sb.querySelector('#startgo') as HTMLElement).onclick = () => go(false, selG, selR, skipI);
    document.body.appendChild(sb);
    markSel();
  }
  camera.position.copy(player.pos).add(CAM_OFF);
  camera.lookAt(player.pos);
  addEventListener('beforeunload', save);
  // pause menu 讀檔 reloads straight into the save
  if (sv && sessionStorage.getItem('dt.autoload')) {
    sessionStorage.removeItem('dt.autoload');
    setTimeout(() => go(true), 0);
  }
  (window as any).__game = {
    roofStats,
    OCC,
    escapeCheck,
    unstuck,
    spawnTest: (roleId: string, g: string, skip: boolean) => {
      player.gender = g;
      spawnRole(roleById(roleId), skip);
      const e = escapeCheck(player.pos.x, player.pos.z);
      if (!skip) endPrologue();
      return { ...e, nudges, p: [player.pos.x, player.pos.z] };
    },
    district,
    sectorOf,
    SECTORS,
    arcadeAudit: () => arcadeAudit(bldAt),
    roadT,
    traffic,
    drive,
    PRO,
    role: () => ROLE,
    endPrologue: () => endPrologue(),
    map: gmap,
    player,
    sols,
    blds,
    conts,
    nav,
    started: () => started,
    go,
    vehicles,
    decay: () => decay,
    alley: () => alley,
    facade: () => facade,
    setSpeed,
    speed: () => speed,
    WX,
    airdrop,
    makeBucket,
    noise,
    dayh: () => DAYH,
    evac: () => evac && evac.pos,
    evacOpen,
    doEvac,
    INF: () => INF,
    RV: () => RV,
    infPos: () => infPos,
    elderPos: () => elderPos,
    npcInteract,
    verifyInf,
    setMin: (m: number) => {
      gameMin = m;
    },
    parks: () => parks,
    simRain: (h: number) => {
      for (let i = 0; i < h * 20; i++) updateWeather(0.05, 0.05);
    },
    camera,
    CAM_OFF,
    setTime: (m: number) => {
      gameMin = m;
    },
    start: () => start!.c,
    scene,
    gm: () => gameMin,
    roadDist,
    shotRay,
    sandbags,
    metro: () => metro,
    metroUse,
    metroBoard,
    shopAt,
    shopUse,
    openShop,
    metroStats,
    svc,
    rideTo,
    openRide,
    UT,
    surv: () => surv,
    SV,
    openSurv,
    closeSurv,
    MB,
    addSeg,
    removeSeg,
    findCover,
    toggleCover,
    coverStats,
    solCover,
    tp: (x: number, z: number) => player.pos.set(x, 0, z),
    damageSol,
    toggleInv,
    addItem,
    armor: () => armor,
    fpv: () => fpv,
    recon: () => recon,
    ROC,
    roc: () => roc,
    useItem,
    testAT: (k: string) => {
      const a = armor!.list.find(a => !a.dead)!;
      const dir = a.g.position.clone().sub(player.pos).setY(0).normalize();
      fireAT(k, ITEMS[k], dir);
      return a.hp;
    },
    callSupport,
    rocCheck,
    liberate: (n: number) => {
      for (let i = 0; i < NSEC && liberated.size < n; i++)
        if (!liberated.has(i)) {
          for (const q of sols)
            if (q.sector === i) {
              q.state = 'dead';
              q.hp = 0;
              q.mesh.visible = false;
            }
          liberated.add(i);
        }
      rocCheck(false);
    },
    lastBlast: () => lastBlast,
    shells,
    launchFPV,
    blast,
    sim: (n: number, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        update(dt);
        if (fpv?.active) fpv.update(dt);
      }
    },
    roadPt: () => {
      let best: V2 = [player.pos.x, player.pos.z],
        bd = 1e9;
      for (const r of roads)
        if (/primary|secondary|tertiary/.test(r.t))
          for (const q of r.p) {
            const d = Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z);
            if (d < bd && d > 8 && !bldAt(q[0], q[1])) {
              bd = d;
              best = q;
            }
          }
      return best;
    },
    checkpoints: () => checkpoints,
  };
}
boot().catch(e => {
  console.error(e);
  $('loadmsg').textContent = '載入失敗：' + e;
});
loop();
// PWA: offline play after the first load (cache is versioned per deploy in sw.js)
if ('serviceWorker' in navigator && import.meta.env.PROD)
  addEventListener('load', () =>
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(e => console.warn('sw', e)),
  );
