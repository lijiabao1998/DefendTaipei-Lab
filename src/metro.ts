// v21.6 / v22.1 北都地下鐵 BEIDU METRO — a fictional metro (own identity: 橘 #e8681c + 深綠 #1f5a3a, 艋舺橘線,
// own station numbers and pictograms). Layout/feel follows a typical underground island-platform station:
// multi-exit street entrances (canopy, stairs, stopped escalator, lift), a B1 concourse split into unpaid and
// paid areas by the gate line + glass fence, and a B2 island platform with full-height screen doors.
// War state: power is out (emergency lights only, flickering), escalators stopped, refugees sleeping on
// cardboard in the concourse, dropped bags, scooters dumped at the entrances.
// The interiors are built lazily the first time someone goes down (streamed) at z ≈ -7000; geometry is merged
// per material, and every random choice comes from a per-station seed, so all players see the same station.
// B1 and B2 are laid out side by side on one plane (B1 north, B2 south) joined by the stair/escalator banks;
// camera-side walls are cut down low so the interior reads from the fixed camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V2, Seg } from './world';

export const METRO_ORANGE = 0xe8681c,
  METRO_GREEN = 0x1f5a3a;
export type Gate = { ent: V2; out: V2; inn: V2; exit: V2; no: number };
export type Station = {
  name: string;
  no: number;
  ent: V2;
  out: V2;
  inn: V2;
  exit: V2;
  gates: Gate[];
  loot: { id: string; p: V2; type: string }[];
  built: boolean;
};
export const STATIONS: { name: string; x: number; z: number }[] = [
  { name: '龍山寺', x: -300, z: 420 },
  { name: '西門', x: 420, z: -180 },
  { name: '萬大', x: -260, z: 1500 },
  { name: '華江', x: -1250, z: 760 },
];
const LINE = '艋舺橘線';

function prng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, rep = false) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** our logo: white disc, orange ring, green 北 */
function logo(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
  c.lineWidth = r * 0.22;
  c.strokeStyle = '#e8681c';
  c.beginPath();
  c.arc(x, y, r * 0.86, 0, 7);
  c.stroke();
  c.fillStyle = '#1f5a3a';
  c.font = `900 ${r * 1.05}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('北', x, y + r * 0.05);
}
/** station number badge: an orange rounded square with a circled numeral (our own style) */
function badge(c: CanvasRenderingContext2D, x: number, y: number, s: number, no: number) {
  c.fillStyle = '#e8681c';
  c.beginPath();
  c.roundRect(x - s / 2, y - s / 2, s, s, s * 0.25);
  c.fill();
  c.fillStyle = '#fff';
  c.font = `800 ${s * 0.62}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('橘' + no, x, y + s * 0.04);
}
const TX = new Map<string, THREE.Texture>();
const tex = (k: string, f: () => THREE.Texture) => TX.get(k) || (TX.set(k, f()), TX.get(k)!);
const nameTex = (name: string, no: number) =>
  tex('n' + name, () =>
    canvasTex(512, 128, c => {
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#e8681c';
      c.fillRect(0, 110, 512, 18);
      logo(c, 60, 56, 42);
      badge(c, 452, 56, 76, no);
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = '700 44px sans-serif';
      c.fillText(name, 118, 44);
      c.font = '400 20px sans-serif';
      c.fillText(`北都地下鐵・${LINE}`, 120, 88);
    }),
  );
/** hanging directional sign: dark green, white text, simple arrow */
const dirTex = (t: string, arrow: string) =>
  tex('d' + t + arrow, () =>
    canvasTex(512, 96, c => {
      c.fillStyle = '#123a26';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#e8681c';
      c.fillRect(0, 0, 10, 96);
      c.fillStyle = '#fff';
      c.font = '700 46px sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillText(arrow, 24, 50);
      c.font = '600 38px sans-serif';
      c.fillText(t, 92, 50);
    }),
  );
/** our pictograms (simple geometric figures, not anyone else's set) */
const picto = (k: 'wc' | 'lift' | 'info' | 'fire') =>
  tex('p' + k, () =>
    canvasTex(128, 128, c => {
      c.fillStyle = k === 'fire' ? '#c62a1e' : '#1f5a3a';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#fff';
      c.strokeStyle = '#fff';
      c.lineWidth = 8;
      if (k === 'wc') {
        for (const [x, tri] of [
          [38, false],
          [90, true],
        ] as const) {
          c.beginPath();
          c.arc(x, 30, 10, 0, 7);
          c.fill();
          if (tri) {
            c.beginPath();
            c.moveTo(x, 44);
            c.lineTo(x - 20, 100);
            c.lineTo(x + 20, 100);
            c.fill();
          } else c.fillRect(x - 12, 44, 24, 60);
        }
        c.fillRect(62, 20, 4, 90);
      } else if (k === 'lift') {
        c.strokeRect(24, 18, 80, 92);
        c.beginPath();
        c.moveTo(44, 54);
        c.lineTo(54, 38);
        c.lineTo(64, 54);
        c.moveTo(64, 74);
        c.lineTo(74, 90);
        c.lineTo(84, 74);
        c.stroke();
      } else if (k === 'info') {
        c.font = '900 92px serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('i', 64, 68);
      } else {
        c.font = '900 40px sans-serif';
        c.textAlign = 'center';
        c.fillText('滅火器', 64, 78);
      }
    }),
  );
const POSTERS = [
  ['停電期間', '請沿綠色緊急照明', '往出口移動'],
  ['防空疏散點', '本站 B1 大廳', '請保持通道淨空'],
  ['尋人', '阿明，西園路', '平安請回家'],
  ['互助站', '米・水・藥', '能給就給，能拿就拿'],
];
const posterTex = (i: number) =>
  tex('ps' + i, () =>
    canvasTex(128, 180, c => {
      c.fillStyle = ['#f3ead2', '#e8681c', '#fff', '#d8e6d0'][i];
      c.fillRect(0, 0, 128, 180);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 128, 26);
      logo(c, 18, 13, 10);
      c.fillStyle = '#111';
      c.textAlign = 'center';
      POSTERS[i].forEach((t, k) => {
        c.font = `${k ? 600 : 800} ${k ? 15 : 22}px sans-serif`;
        c.fillText(t, 64, 62 + k * 34);
      });
    }),
  );
const boardTex = () =>
  tex('board', () =>
    canvasTex(512, 96, c => {
      c.fillStyle = '#0a0a0a';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ff8a2a';
      c.font = '600 34px monospace';
      c.textBaseline = 'middle';
      c.fillText('往 新莊口　－－:－－', 16, 30);
      c.fillStyle = '#e44';
      c.fillText('全線停駛　請勿進入軌道', 16, 72);
    }),
  );
const mapTex = (name: string, no: number) =>
  tex('map' + name, () =>
    canvasTex(256, 192, c => {
      c.fillStyle = '#f4f1e8';
      c.fillRect(0, 0, 256, 192);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 256, 28);
      c.fillStyle = '#fff';
      c.font = '700 18px sans-serif';
      c.fillText(`${name}站 出口位置圖`, 10, 20);
      c.strokeStyle = '#bbb';
      c.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0, 50 + i * 30);
        c.lineTo(256, 40 + i * 32);
        c.stroke();
      }
      c.fillStyle = '#e8681c';
      c.fillRect(40, 100, 176, 22);
      for (const [x, y, n] of [
        [52, 70, 1],
        [200, 150, 2],
      ]) {
        c.beginPath();
        c.arc(x, y, 12, 0, 7);
        c.fill();
        c.fillStyle = '#fff';
        c.font = '700 14px sans-serif';
        c.fillText(String(n), x - 4, y + 5);
        c.fillStyle = '#e8681c';
      }
      badge(c, 230, 170, 30, no);
    }),
  );
const terrazzo = () =>
  tex('terr', () => {
    const t = canvasTex(
      256,
      256,
      c => {
        const r = prng(9);
        c.fillStyle = '#cfc8ba';
        c.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1400; i++) {
          c.fillStyle = ['#8a8274', '#e9e3d6', '#6a6458', '#b49a7a'][Math.floor(r() * 4)];
          c.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
        }
        c.strokeStyle = '#a49c8c';
        c.strokeRect(0, 0, 256, 256);
      },
      true,
    );
    t.repeat.set(12, 5);
    return t;
  });
const wallTile = () =>
  tex('wtile', () => {
    const t = canvasTex(
      128,
      128,
      c => {
        c.fillStyle = '#e4e1d8';
        c.fillRect(0, 0, 128, 128);
        c.strokeStyle = '#c8c3b6';
        for (let i = 0; i <= 128; i += 32) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, 128);
          c.moveTo(0, i);
          c.lineTo(128, i);
          c.stroke();
        }
        c.fillStyle = '#e8681c';
        c.fillRect(0, 96, 128, 8);
      },
      true,
    );
    return t;
  });
const stoneTex = () =>
  tex('stone', () => {
    const t = canvasTex(
      128,
      128,
      c => {
        const r = prng(3);
        c.fillStyle = '#9d9a92';
        c.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 500; i++) {
          c.fillStyle = r() < 0.5 ? '#8c8981' : '#aeaba3';
          c.fillRect(r() * 128, r() * 128, 2, 2);
        }
        c.strokeStyle = '#7d7a73';
        c.strokeRect(0, 0, 128, 128);
      },
      true,
    );
    t.repeat.set(34, 4);
    return t;
  });

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const M = {
  wall: std(0xe9e6de),
  green: std(METRO_GREEN),
  orange: std(METRO_ORANGE, { roughness: 0.5 }),
  yellow: std(0xf5c400),
  tactile: std(0xe8b800, { roughness: 0.9 }),
  steel: std(0xb8bcc0, { metalness: 0.6, roughness: 0.35 }),
  black: std(0x1b1c1e),
  glass: std(0x9fd0d8, { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }),
  train: std(0xeef0f2, { metalness: 0.3, roughness: 0.35 }),
  win: std(0x1d2a30, { roughness: 0.2 }),
  seat: std(0x2f7a52),
  prio: std(0xc87a2a),
  void: std(0x070809, { roughness: 1 }),
  dark: std(0x3a3c40, { roughness: 0.9 }),
  rail: std(0x6a6058, { metalness: 0.5 }),
  ballast: std(0x2a2826, { roughness: 1 }),
  card: std(0xa98a5a, { roughness: 1 }),
  blanket: std(0x8a3a3a, { roughness: 1 }),
  blanket2: std(0x3a5a8a, { roughness: 1 }),
  red: std(0xc62a1e),
  white: std(0xf4f4f0),
  wood: std(0x7a5a3a),
  emerg: new THREE.MeshBasicMaterial({ color: 0x5aff8a }),
  lamp: new THREE.MeshBasicMaterial({ color: 0x3a3a34 }),
  lampOn: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
};
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** merges every box into one mesh per material */
class Builder {
  b = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(public g: THREE.Group) {}
  box(m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    const geo = BOX.clone();
    geo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + sy / 2, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(sx, sy, sz),
      ),
    );
    if (!this.b.has(m)) this.b.set(m, []);
    this.b.get(m)!.push(geo);
  }
  plane(t: THREE.Texture, x: number, y: number, z: number, w: number, h: number, ry = 0, basic = true) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      basic ? new THREE.MeshBasicMaterial({ map: t, side: 2 }) : new THREE.MeshStandardMaterial({ map: t, side: 2 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.g.add(m);
    return m;
  }
  floor(t: THREE.Texture, x: number, z: number, w: number, d: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    this.g.add(m);
  }
  done() {
    for (const [m, gs] of this.b) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), m);
      mesh.receiveShadow = true;
      mesh.castShadow = m !== M.glass;
      this.g.add(mesh);
      gs.forEach(x => x.dispose());
    }
    this.b.clear();
  }
}

export type MetroDeps = {
  scene: THREE.Scene;
  addSeg: (s: Seg, low?: boolean) => void;
  snap: (x: number, z: number) => V2;
};
const OXZ = (i: number) => [-1200 + i * 240, -7000] as const;
// interior layout constants (local)
const EXITS = [-17, 17]; // B1 exit passages (x)
const BANKS = [-12, 12]; // stair/escalator banks B1 → B2 (x centre, 4.4 m wide)
const lights: { l: THREE.PointLight; base: number; ph: number }[] = [];

function scooter(b: Builder, x: number, z: number, ry: number, r: () => number) {
  const col = [M.red, M.white, M.green, M.dark][Math.floor(r() * 4)];
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (u: number) => [x + c * u, z - s * u] as const;
  b.box(M.black, ...([P(-0.6)[0], 0, P(-0.6)[1]] as [number, number, number]), 0.35, 0.35, 0.12, ry);
  b.box(M.black, ...([P(0.6)[0], 0, P(0.6)[1]] as [number, number, number]), 0.35, 0.35, 0.12, ry);
  b.box(col, x, 0.25, z, 1.3, 0.35, 0.42, ry);
  b.box(col, P(0.55)[0], 0.3, P(0.55)[1], 0.2, 0.7, 0.4, ry);
  b.box(M.black, P(-0.15)[0], 0.6, P(-0.15)[1], 0.6, 0.12, 0.34, ry);
}

/** surface entrance: canopy + stairs + stopped escalator + lift, facing -z (open side) */
function entrance(
  scene: THREE.Scene,
  addSeg: MetroDeps['addSeg'],
  st: Station,
  ex: number,
  ez: number,
  no: number,
  r: () => number,
) {
  const g = new THREE.Group();
  g.position.set(ex, 0, ez);
  scene.add(g);
  const b = new Builder(g);
  b.box(M.green, -2.2, 0, 0.2, 0.15, 2.8, 4.4);
  b.box(M.green, 2.2, 0, 0.2, 0.15, 2.8, 4.4);
  b.box(M.green, 0, 0, 2.4, 4.5, 2.8, 0.15);
  b.box(M.glass, 0, 2.8, 0.2, 4.8, 0.08, 4.8);
  b.box(M.green, 0, 2.8, -2.1, 4.8, 0.2, 0.15);
  b.box(M.orange, 0, 2.6, -2.15, 4.6, 0.12, 0.05);
  // stairs (left) and stopped escalator (right) going down into the dark
  for (let k = 0; k < 7; k++) {
    b.box(M.dark, -0.9, -k * 0.05, -1.2 + k * 0.5, 1.8, 0.04, 0.5);
    b.box(M.black, 1.0, -k * 0.05, -1.2 + k * 0.5, 1.2, 0.04, 0.5);
  }
  b.box(M.steel, 0.3, 0, 0.4, 0.12, 0.95, 3.6);
  b.box(M.black, 1.7, 0, 0.4, 0.2, 0.95, 3.6);
  b.box(M.steel, 1.7, 0.95, 0.4, 0.24, 0.05, 3.6);
  // the lift tower beside the canopy
  b.box(M.green, 3.6, 0, 0.8, 1.6, 0.2, 1.6);
  b.box(M.glass, 3.6, 0.2, 0.8, 1.5, 2.6, 1.5);
  b.box(M.green, 3.6, 2.8, 0.8, 1.7, 0.25, 1.7);
  b.box(M.steel, 3.6, 0.2, 0.8, 0.9, 2.2, 0.9);
  // dumped scooters + a dropped bag
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) scooter(b, -4 - r() * 3, -2 + r() * 4, r() * 6, r);
  b.box(M.blanket2, 1 + r(), 0, -3 - r(), 0.45, 0.3, 0.3, r() * 3);
  b.done();
  const sm = b.plane(nameTex(st.name, st.no), 0, 3.25, -2.2, 3.6, 0.9, Math.PI);
  sm.scale.x = 1;
  const ex2 = canvasTex(64, 64, c => {
    c.fillStyle = '#e8681c';
    c.beginPath();
    c.arc(32, 32, 30, 0, 7);
    c.fill();
    c.fillStyle = '#fff';
    c.font = '800 38px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(no), 32, 34);
  });
  b.plane(ex2, -1.9, 3.25, -2.21, 0.6, 0.6, Math.PI);
  b.plane(picto('lift'), 3.6, 2.4, 0.03, 0.5, 0.5, Math.PI);
  const pole = tex('pole', () => canvasTex(128, 128, c => logo(c, 64, 64, 58)));
  b.plane(pole, -2.9, 3.0, -2.2, 0.9, 0.9, Math.PI);
  addSeg({ a: [ex - 2.2, ez - 2], b: [ex - 2.2, ez + 2.4] });
  addSeg({ a: [ex + 2.2, ez - 2], b: [ex + 2.2, ez + 2.4] });
  addSeg({ a: [ex - 2.2, ez + 2.4], b: [ex + 2.2, ez + 2.4] });
  addSeg({ a: [ex + 2.8, ez], b: [ex + 4.4, ez + 1.6] });
}

/** builds the surface entrances now and returns stations; interiors come from ensureInterior() */
export function buildMetro(d: MetroDeps): Station[] {
  return STATIONS.map((st, i) => {
    const [OX, OZ] = OXZ(i);
    const r = prng(1000 + i * 77);
    const gates: Gate[] = [];
    const S: Station = {
      name: st.name,
      no: i + 3,
      ent: [0, 0],
      out: [0, 0],
      inn: [0, 0],
      exit: [0, 0],
      gates,
      loot: [],
      built: false,
    };
    // two street exits per station, ~45 m apart
    [
      [st.x, st.z],
      [st.x + 34, st.z + 26],
    ].forEach(([ax, az], k) => {
      const [ex, ez] = d.snap(ax, az);
      entrance(d.scene, d.addSeg, S, ex, ez, k + 1, r);
      gates.push({
        no: k + 1,
        ent: [ex, ez],
        out: [ex, ez - 3.4],
        inn: [OX + EXITS[k], OZ - 4],
        exit: [OX + EXITS[k], OZ - 8.5],
      });
    });
    Object.assign(S, { ent: gates[0].ent, out: gates[0].out, inn: gates[0].inn, exit: gates[0].exit });
    S.loot = [
      { id: `m${i}:0`, p: [OX - 20, OZ + 0.5], type: 'store' }, // kiosk
      { id: `m${i}:1`, p: [OX + 16, OZ + 1.8], type: 'pharmacy' }, // service counter first-aid
      { id: `m${i}:2`, p: [OX - 6, OZ - 3.5], type: 'home' }, // refugee bundle
      { id: `m${i}:3`, p: [OX + 8, OZ + 30.1], type: 'store' }, // in the train
      { id: `m${i}:4`, p: [OX - 20, OZ + 30.1], type: 'home' }, // in the train
      { id: `m${i}:5`, p: [OX + 21, OZ + 8], type: 'home' }, // lockers
    ];
    // collision is cheap, register it now so loot and walls are consistent before the meshes stream in
    interiorSegs(d.addSeg, OX, OZ);
    return S;
  });
}

function interiorSegs(addSeg: MetroDeps['addSeg'], OX: number, OZ: number) {
  const W = (ax: number, az: number, bx: number, bz: number, low = false) =>
    addSeg({ a: [OX + ax, OZ + az], b: [OX + bx, OZ + bz] }, low);
  // B1 concourse x∈[-24,24] z∈[-6,12], exit passages north at x = ±17
  W(-24, -6, -19.2, -6);
  W(-14.8, -6, 14.8, -6);
  W(19.2, -6, 24, -6);
  for (const x of EXITS) {
    W(x - 2.2, -6, x - 2.2, -10);
    W(x + 2.2, -6, x + 2.2, -10);
    W(x - 2.2, -10, x + 2.2, -10, true);
  }
  W(-24, -6, -24, 12);
  W(24, -6, 24, 12);
  // gate line z = 4: glass fence + gate cabinets (middle lanes jammed shut, outer lanes passable)
  W(-24, 4, -8.4, 4, true);
  W(8.4, 4, 24, 4, true);
  for (let k = -5; k <= 5; k++) {
    const x = k * 1.6;
    W(x, 3.2, x, 4.8, true);
    if (k < 5 && Math.abs(k + 0.5) < 3) W(x + 0.2, 4, x + 1.4, 4, true);
  }
  // B1 south wall with the two bank openings, bank corridors over the north track
  W(-24, 12, -14.2, 12);
  W(-9.8, 12, 9.8, 12);
  W(14.2, 12, 24, 12);
  for (const x of BANKS) {
    W(x - 2.2, 12, x - 2.2, 20);
    W(x + 2.2, 12, x + 2.2, 20);
  }
  // B2 island platform x∈[-34,34] z∈[20,28]; screen doors both sides (north side open at the banks)
  W(-34, 20, -34, 28);
  W(34, 20, 34, 28);
  W(-34, 20, -14.2, 20);
  W(-9.8, 20, 9.8, 20);
  W(14.2, 20, 34, 20);
  // south screen doors: one door pair jammed open at x = 0 into the train
  W(-34, 28, -1, 28);
  W(1, 28, 34, 28);
  // train body z∈[28.6, 31.6], door gap at x∈[-1, 1]
  W(-28, 28.6, -1, 28.6);
  W(1, 28.6, 28, 28.6);
  W(-28, 31.6, 28, 31.6);
  W(-28, 28.6, -28, 31.6);
  W(28, 28.6, 28, 31.6);
  // pillars on the island (they carry the roof beam)
  for (let x = -28; x <= 28; x += 8)
    if (Math.abs(Math.abs(x) - 12) > 3) (W(x - 0.4, 24, x + 0.4, 24), W(x, 23.6, x, 24.4));
}

/** builds a station interior the first time it is needed (lazy streaming) */
export function ensureInterior(scene: THREE.Scene, S: Station, i: number) {
  if (S.built) return;
  S.built = true;
  const [OX, OZ] = OXZ(i);
  const r = prng(5000 + i * 131);
  const g = new THREE.Group();
  g.position.set(OX, 0, OZ);
  scene.add(g);
  const b = new Builder(g);
  // the black void around everything (rock / tunnel)
  b.box(M.void, 0, -0.62, 12, 150, 0.6, 80);
  // ===== B1 concourse =====
  b.floor(terrazzo(), 0, 3, 48, 18);
  const tw = new THREE.MeshStandardMaterial({ map: wallTile(), roughness: 0.6 });
  const wall = (x: number, z: number, sx: number, sz: number, h: number) => b.box(tw, x, 0, z, sx, h, sz);
  // north wall (far side, full height, tiled) with the exit passages
  wall(-21.6, -6, 4.8, 0.3, 3.4);
  wall(0, -6, 29.6, 0.3, 3.4);
  wall(21.6, -6, 4.8, 0.3, 3.4);
  wall(-24, 3, 0.3, 18, 3.4);
  wall(24, 3, 0.3, 18, 1.2); // camera side: cut low
  // soffit with recessed (dead) lights along the far wall, green emergency lights over the exits
  b.box(M.white, 0, 3.1, -5.2, 48, 0.3, 1.6);
  for (let x = -22; x <= 22; x += 2.5) b.box(M.lamp, x, 3.08, -5.2, 0.9, 0.02, 0.4);
  for (const x of EXITS) {
    b.box(M.emerg, x, 2.7, -5.85, 0.8, 0.25, 0.05);
    // exit passage: stairs + stopped escalator up to the street
    for (let k = 0; k < 6; k++) {
      b.box(M.dark, x - 0.9, 0, -6.4 - k * 0.6, 2.0, 0.04 + k * 0.05, 0.6);
      b.box(M.black, x + 1.2, 0, -6.4 - k * 0.6, 1.4, 0.04 + k * 0.05, 0.6);
    }
    b.box(M.steel, x + 0.35, 0, -8, 0.1, 1.0, 4);
    b.box(M.orange, x - 2.1, 0, -8, 0.1, 1.0, 4);
    b.box(M.orange, x + 2.1, 0, -8, 0.1, 1.0, 4);
  }
  // lift in the unpaid area
  b.box(M.glass, 0, 0, -4.9, 2, 3, 1.8);
  b.box(M.steel, 0, 0, -5.6, 1.2, 2.4, 0.2);
  b.box(M.green, 0, 3, -4.9, 2.1, 0.2, 1.9);
  // ticket vending machines (orange face) + add-value machines (green)
  for (let k = 0; k < 4; k++) {
    b.box(M.green, -13 + k * 1.3, 0, -5.4, 1.1, 1.8, 0.8);
    b.box(M.orange, -13 + k * 1.3, 1.1, -4.99, 0.8, 0.45, 0.02);
    b.box(M.black, -13 + k * 1.3, 0.8, -4.99, 0.25, 0.08, 0.02);
  }
  for (let k = 0; k < 2; k++) {
    b.box(M.dark, 7 + k * 1.3, 0, -5.4, 1.0, 1.7, 0.7);
    b.box(M.green, 7 + k * 1.3, 1.1, -5.04, 0.7, 0.35, 0.02);
  }
  // service counter at the gate line (paid / unpaid both sides)
  b.box(M.green, 13, 0, 4, 5, 1.1, 1.2);
  b.box(M.glass, 13, 1.1, 4, 5, 1.3, 0.05);
  b.box(M.white, 13, 2.4, 4, 5.2, 0.15, 1.3);
  // gates
  for (let k = -5; k <= 5; k++) {
    const x = k * 1.6;
    b.box(M.steel, x, 0, 4, 0.35, 1.0, 1.6);
    b.box(M.orange, x, 1.0, 4, 0.36, 0.05, 1.6);
    b.box(M.black, x, 1.05, 3.4, 0.2, 0.02, 0.2);
    if (k < 5 && Math.abs(k + 0.5) < 3) b.box(M.glass, x + 0.8, 0.45, 4, 1.25, 0.55, 0.05);
  }
  // glass fence between the gates and the walls
  for (const [a, c] of [
    [-24, -8.4],
    [8.4, 10.5],
    [15.5, 24],
  ]) {
    b.box(M.glass, (a + c) / 2, 0, 4, c - a, 1.4, 0.05);
    b.box(M.steel, (a + c) / 2, 1.4, 4, c - a, 0.05, 0.08);
  }
  // fictional convenience kiosk (巷口便利站) in the unpaid area
  b.box(M.orange, -20, 0, -0.5, 3.6, 1.0, 1.6);
  b.box(M.white, -20, 2.3, -0.5, 3.8, 0.4, 1.8);
  b.box(M.dark, -20, 0, -1.6, 3.4, 2.0, 0.4);
  // lockers in the paid area
  for (let a = 0; a < 3; a++) for (let c = 0; c < 4; c++) b.box(M.steel, 23.5, a * 0.6, 6 + c * 0.55, 0.5, 0.56, 0.52);
  // benches
  for (const x of [-18, -14, 18]) (b.box(M.wood, x, 0.4, 9, 2.2, 0.08, 0.5), b.box(M.steel, x, 0, 9, 2.0, 0.4, 0.1));
  // refugees: cardboard + bedding along the walls of the unpaid area, dropped bags, debris
  for (let k = 0; k < 9; k++) {
    const x = -22 + k * 2.6 + r() * 0.6,
      z = -4.2 + (k % 2) * 3.6 + r();
    if (Math.abs(x) < 1.6 || Math.abs(x - 7.6) < 2) continue;
    b.box(M.card, x, 0, z, 1.0, 0.02, 2.0, r() * 0.3);
    if (r() < 0.75) b.box(r() < 0.5 ? M.blanket : M.blanket2, x, 0.02, z + 0.2, 0.9, 0.12, 1.4, r() * 0.4);
    if (r() < 0.6) b.box(M.dark, x + 0.4, 0, z - 0.9, 0.4, 0.3, 0.3, r() * 2);
  }
  for (let k = 0; k < 14; k++)
    b.box(
      r() < 0.5 ? M.card : M.dark,
      -22 + r() * 44,
      0,
      -3 + r() * 14,
      0.2 + r() * 0.5,
      0.06,
      0.2 + r() * 0.4,
      r() * 3,
    );
  // ===== banks down to B2 (stairs + stopped escalator), crossing over the north track =====
  for (const x of BANKS) {
    b.box(tw, x - 2.2, 0, 16, 0.2, 1.0, 8);
    b.box(tw, x + 2.2, 0, 16, 0.2, 1.0, 8);
    for (let k = 0; k < 14; k++) {
      b.box(M.dark, x - 1, 0, 12.3 + k * 0.55, 2.2, 0.08 - k * 0.004, 0.55);
      b.box(M.black, x + 1.2, 0, 12.3 + k * 0.55, 1.4, 0.08 - k * 0.004, 0.55);
    }
    b.box(M.steel, x + 0.4, 0, 16, 0.1, 1.0, 8);
  }
  // B1 south wall (camera side → low)
  wall(-19.1, 12, 9.8, 0.3, 0.9);
  wall(0, 12, 19.6, 0.3, 0.9);
  wall(19.1, 12, 9.8, 0.3, 0.9);
  // ===== north track pit (empty) between B1 and the island =====
  b.box(M.ballast, 0, -0.6, 16, 72, 0.58, 7.6);
  for (const z of [15.3, 16.7]) b.box(M.rail, 0, -0.02, z, 72, 0.06, 0.08);
  for (let x = -34; x <= 34; x += 0.8) b.box(M.wood, x, -0.04, 16, 0.25, 0.04, 2.2);
  // ===== B2 island platform =====
  b.floor(stoneTex(), 0, 24, 68, 8);
  b.box(M.tactile, 0, 0.015, 20.5, 68, 0.01, 0.5);
  b.box(M.tactile, 0, 0.015, 27.5, 68, 0.01, 0.5);
  // full-height screen doors: north (far, no train) and south (train side). South framing kept light.
  for (const [z, hh] of [
    [20, 2.6],
    [28, 2.6],
  ] as const) {
    for (let x = -34; x < 34; x += 2.2) {
      if (z === 20 && BANKS.some(c => Math.abs(x + 1.1 - c) < 2.6)) continue;
      const open = z === 28 && Math.abs(x + 1.1) < 1.2;
      b.box(M.steel, x, 0, z, 0.1, hh, 0.12);
      if (!open) b.box(M.glass, x + 1.1, 0, z, 2.0, hh - 0.2, 0.04);
      b.box(M.green, x + 1.1, hh - 0.2, z, 2.2, 0.2, 0.16);
      // queue markings: green arrows each side of each door, orange stop line in the middle
      b.box(M.green, x + 0.5, 0.016, z + (z === 20 ? 1.1 : -1.1), 0.2, 0.01, 1.0);
      b.box(M.green, x + 1.7, 0.016, z + (z === 20 ? 1.1 : -1.1), 0.2, 0.01, 1.0);
      b.box(M.orange, x + 1.1, 0.016, z + (z === 20 ? 0.9 : -0.9), 0.6, 0.01, 0.12);
    }
  }
  // pillars (carry the roof beam) with name panels, extinguisher cabinets, CCTV
  b.box(M.orange, 0, 3.2, 24, 68, 0.3, 0.5);
  for (let x = -28; x <= 28; x += 8) {
    if (Math.abs(Math.abs(x) - 12) <= 3) continue;
    b.box(M.green, x, 0, 24, 0.8, 3.2, 0.8);
    b.box(M.red, x + 0.42, 0.6, 24, 0.06, 0.8, 0.5);
    b.box(M.black, x, 2.9, 24.5, 0.15, 0.15, 0.3);
  }
  // seats incl. a priority area (warm orange seats + its own sign)
  for (const [x, prio] of [
    [-24, false],
    [-4, false],
    [4, true],
    [24, false],
  ] as const) {
    b.box(prio ? M.prio : M.seat, x, 0.42, 25.5, 2.4, 0.08, 0.5);
    b.box(M.steel, x, 0, 25.5, 2.2, 0.42, 0.1);
  }
  // dropped stuff on the platform
  for (let k = 0; k < 6; k++)
    b.box([M.blanket2, M.dark, M.card][k % 3], -30 + r() * 60, 0, 21.5 + r() * 5, 0.5, 0.3, 0.35, r() * 3);
  // B2 end walls (low on the camera side)
  wall(-34, 24, 0.3, 8, 1.0);
  wall(34, 24, 0.3, 8, 1.0);
  // ===== parked train (south track) — no roof so it reads from above; strong livery =====
  const TL = 56;
  b.box(M.ballast, 0, -0.6, 30.1, 72, 0.58, 4.4);
  b.box(M.train, 0, 0, 28.65, TL, 1.4, 0.1);
  b.box(M.train, 0, 0, 31.55, TL, 1.4, 0.1);
  b.box(M.green, -TL / 2, 0, 30.1, 0.6, 2.4, 3);
  b.box(M.green, TL / 2, 0, 30.1, 0.6, 2.4, 3);
  b.box(M.win, -TL / 2 - 0.31, 1.2, 30.1, 0.02, 0.8, 2.2);
  b.box(M.win, TL / 2 + 0.31, 1.2, 30.1, 0.02, 0.8, 2.2);
  b.box(M.train, 0, 0, 30.1, TL, 0.03, 2.8); // light floor so the car reads from above
  b.box(M.orange, 0, 0.035, 30.1, TL, 0.005, 0.5);
  b.box(M.orange, 0, 1.4, 28.65, TL, 0.08, 0.14);
  b.box(M.orange, 0, 1.4, 31.55, TL, 0.08, 0.14);
  b.box(M.orange, 0, 0.55, 28.59, TL, 0.16, 0.02);
  b.box(M.green, 0, 0.75, 28.59, TL, 0.06, 0.02);
  for (let c = -2; c <= 1; c++) b.box(M.black, (c + 0.5) * 14, 0, 30.1, 0.15, 1.6, 2.9); // car gangways
  for (let x = -26; x <= 26; x += 3.5) {
    if (Math.abs(x) > 1.2) b.box(M.win, x, 0.85, 28.58, 2.2, 0.45, 0.02);
    b.box(M.seat, x, 0, 31.1, 2.6, 0.45, 0.6);
    b.box(M.steel, x + 1.75, 1.3, 30.1, 0.05, 0.05, 2.8);
    b.box(M.steel, x + 1.75, 0, 30.1, 0.04, 1.3, 0.04);
  }
  b.done();
  // ===== textured planes: signs, maps, posters, boards =====
  const NT = nameTex(S.name, S.no);
  b.plane(NT, -8, 2.3, -5.83, 3.6, 0.9);
  b.plane(NT, 8, 2.3, -5.83, 3.6, 0.9);
  for (let x = -28; x <= 28; x += 8) if (Math.abs(Math.abs(x) - 12) > 3) b.plane(NT, x, 2.1, 23.58, 1.6, 0.4);
  b.plane(dirTex('往月台', '↓'), -12, 2.7, 8, 2.6, 0.5);
  b.plane(dirTex('往月台', '↓'), 12, 2.7, 8, 2.6, 0.5);
  b.plane(dirTex('出口 1', '↖'), -12, 2.7, 0, 2.6, 0.5);
  b.plane(dirTex('出口 2', '↗'), 12, 2.7, 0, 2.6, 0.5);
  b.plane(dirTex('出口・往大廳', '↑'), -12, 2.7, 22, 2.6, 0.5);
  b.plane(dirTex('出口・往大廳', '↑'), 12, 2.7, 22, 2.6, 0.5);
  b.plane(mapTex(S.name, S.no), -3.8, 1.6, -5.83, 1.6, 1.2);
  b.plane(picto('wc'), 20, 2.4, -5.83, 0.6, 0.6);
  b.plane(picto('info'), 13, 2.75, 3.9, 0.5, 0.5);
  b.plane(picto('lift'), 1.3, 2.4, -5.83, 0.5, 0.5);
  b.plane(posterTex(0), -2, 1.5, -5.83, 0.7, 1.0);
  b.plane(posterTex(1), 4, 1.5, -5.83, 0.7, 1.0);
  b.plane(posterTex(2), -23.83, 1.5, 6, 0.7, 1.0, Math.PI / 2);
  b.plane(posterTex(3), -23.83, 1.5, 9, 0.7, 1.0, Math.PI / 2);
  const kt = tex('kiosk', () =>
    canvasTex(256, 48, c => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 256, 48);
      c.fillStyle = '#e8681c';
      c.font = '800 30px sans-serif';
      c.fillText('巷口便利站', 46, 34);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 40, 256, 8);
    }),
  );
  b.plane(kt, -20, 2.5, 0.42, 3.6, 0.38);
  b.plane(picto('fire'), 3.4, 0.9, 24.42, 0.4, 0.4);
  for (const x of [-20, 20]) {
    b.plane(boardTex(), x, 2.75, 20.6, 2.6, 0.5);
    b.plane(boardTex(), x, 2.75, 27.4, 2.6, 0.5);
  }
  const pr = tex('prio', () =>
    canvasTex(128, 64, c => {
      c.fillStyle = '#c87a2a';
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#fff';
      c.font = '700 26px sans-serif';
      c.textAlign = 'center';
      c.fillText('博愛座', 64, 42);
    }),
  );
  b.plane(pr, 4, 1.3, 25.78, 1.0, 0.5);
  // emergency lighting only (power out) — flickers in metroTick
  for (const [x, y, z, base] of [
    [-14, 2.8, -2, 5],
    [14, 2.8, 6, 4],
    [-20, 2.8, 24, 4],
    [10, 2.8, 25, 5],
    [-14, 2.4, 30.1, 6],
    [14, 2.4, 30.1, 6],
  ]) {
    const l = new THREE.PointLight(0xffd9a0, base, 22, 1.4);
    l.position.set(x, y, z);
    g.add(l);
    lights.push({ l, base, ph: r() * 10 });
    const e = new THREE.Mesh(BOX, M.lampOn);
    e.scale.set(0.5, 0.08, 0.2);
    e.position.set(x, y + 0.3, z);
    g.add(e);
  }
}
/** emergency-light flicker */
export function metroTick(t: number) {
  for (const L of lights) {
    const f = Math.sin(t * 13 + L.ph) * Math.sin(t * 3.1 + L.ph * 2);
    L.l.intensity = L.base * (f > 0.93 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 40 + L.ph));
  }
}
