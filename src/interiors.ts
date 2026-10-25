import { shrink } from './texq';
// Hand-designed Taiwanese interiors placed procedurally inside real OSM footprints.
import * as THREE from 'three';
import { LOOT } from './items';
import { iconMat, PSIZE } from './icons';
export type V2 = [number, number];
export type Ctx = {
  rnd: () => number;
  pip: (p: V2, pts: V2[]) => boolean;
  addSeg: (s: { a: V2; b: V2 }) => void;
  addCont: (c: {
    id: string;
    p: V2;
    items: Record<string, number>;
    label: string;
    mesh: THREE.Object3D;
    b: any;
    half: number;
    axis: V2;
    vis: { im: THREE.InstancedMesh; max: number; item: string }[];
    init: Record<string, number>;
  }) => void;
  bldAt: (x: number, z: number) => any;
  scene: THREE.Scene;
};
const MC = new Map<string, THREE.Material>();
const M = (c: number, o: any = {}) => {
  const k = c + JSON.stringify(o);
  if (!MC.has(k)) MC.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }));
  return MC.get(k)!;
};
function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(shrink(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TX: Record<string, THREE.Texture> = {};
function textTex(key: string, lines: string[], bg: string, fg: string, w = 256, h = 128, size = 40) {
  if (TX[key]) return TX[key];
  return (TX[key] = tex(w, h, c => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.font = `900 ${size}px "Noto Sans TC",sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1)));
  }));
}
function box(
  g: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = false,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function plane(g: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}
function cyl(g: THREE.Object3D, r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}
function stool(g: THREE.Object3D, x: number, z: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.45, 10), M(0xd0261c, { roughness: 0.4 }));
  m.position.set(x, 0.225, z);
  g.add(m);
}
const emiss = (c: number, i = 1) => M(c, { emissive: c, emissiveIntensity: i });

function pickItems(table: string, rnd: () => number, n: number) {
  const t = LOOT[table];
  const out: Record<string, number> = {};
  const pool = t.slice();
  for (let k = 0; k < n && pool.length; k++) {
    const tot = pool.reduce((s, x) => s + x[1], 0);
    let r = rnd() * tot;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx][1];
      if (r <= 0) break;
    }
    const [id, , m] = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    out[id] = 1 + Math.floor(rnd() * (m + 1));
  }
  return out;
}
/** fill shelf levels with product cards; returns instanced meshes for loot visuals */
function stock(g: THREE.Object3D, items: Record<string, number>, w: number, levels: number[], z: number, back = false) {
  const ids = Object.keys(items).filter(i => PSIZE[i]);
  if (!ids.length) return [];
  const slots: Record<string, THREE.Matrix4[]> = {};
  ids.forEach(i => (slots[i] = []));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), back ? Math.PI : 0);
  for (const [li, y] of levels.entries()) {
    let x = -w / 2 + 0.08;
    let k = li % ids.length;
    while (x < w / 2 - 0.08) {
      const id = ids[k % ids.length];
      const [pw, ph] = PSIZE[id] || [0.1, 0.15];
      if (x + pw >= w / 2) break;
      const run = Math.max(2, Math.floor(0.6 / pw));
      for (let r = 0; r < run && x + pw < w / 2; r++) {
        for (let dz = 0; dz < 2; dz++) {
          slots[id].push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x + pw / 2, y + ph / 2, (z - dz * 0.12) * (back ? -1 : 1)),
              q,
              new THREE.Vector3(1, 1, 1),
            ),
          );
        }
        x += pw + 0.015;
      }
      k++;
    }
  }
  const vis: { im: THREE.InstancedMesh; max: number; item: string }[] = [];
  for (const id of ids) {
    const n = slots[id].length;
    if (!n) continue;
    const [pw, ph] = PSIZE[id];
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(pw, ph), iconMat(id), n);
    slots[id].forEach((mm, i) => im.setMatrixAt(i, mm));
    g.add(im);
    vis.push({ im, max: n, item: id });
  }
  void m4;
  return vis;
}
// ---------- fixtures (local: width along x, front +z, base y=0) ----------
type Fx = {
  g: THREE.Group;
  w: number;
  d: number;
  loot?: string;
  label?: string;
  levels?: number[];
  front?: number;
  twoSided?: boolean;
  nItems?: number;
};
const FX: Record<string, (w: number) => Fx> = {
  fridge: w => {
    const g = new THREE.Group();
    const d = 0.75;
    box(g, w, 2.1, d, M(0x2a2e33), 0, 0, 0, true);
    box(g, w - 0.1, 1.85, 0.05, emiss(0xf4f8ff, 0.6), 0, 0.15, -d / 2 + 0.12);
    for (const y of [0.15, 0.6, 1.05, 1.5]) box(g, w - 0.1, 0.03, d - 0.2, M(0xbfc6cc, { metalness: 0.6 }), 0, y, 0);
    const glass = plane(
      g,
      w - 0.1,
      1.9,
      M(0xcfe8ff, { transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5 }),
      0,
      1.1,
      d / 2 - 0.02,
    );
    glass.renderOrder = 2;
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.75)
      box(g, 0.04, 1.95, 0.04, M(0x9aa2a8, { metalness: 0.7 }), x, 0.1, d / 2 - 0.02);
    box(g, w, 0.18, 0.06, emiss(0x2a8a4a, 0.5), 0, 1.92, d / 2);
    return {
      g,
      w,
      d,
      loot: 'fridge',
      label: '飲料冷藏櫃',
      levels: [0.18, 0.63, 1.08, 1.53],
      front: d / 2 - 0.1,
      nItems: 4,
    };
  },
  gondola: w => {
    const g = new THREE.Group();
    const d = 0.9;
    box(g, w, 0.12, d, M(0xe8e8e8), 0, 0, 0);
    box(g, w, 1.5, 0.05, M(0xf0f0f0), 0, 0, 0, true);
    for (const y of [0.12, 0.55, 1.0])
      for (const s of [-1, 1]) box(g, w, 0.025, d / 2 - 0.05, M(0xd8d8d8), 0, y, (s * d) / 4);
    box(g, w, 0.12, 0.02, emiss(0xe23a28, 0.3), 0, 1.5, 0.03);
    return {
      g,
      w,
      d,
      loot: 'shelf',
      label: '泡麵零食貨架',
      levels: [0.14, 0.57, 1.02],
      front: d / 2 - 0.08,
      twoSided: true,
      nItems: 4,
    };
  },
  wallshelf: w => {
    const g = new THREE.Group();
    const d = 0.5;
    box(g, w, 1.9, 0.04, M(0xffffff), 0, 0, -d / 2 + 0.02, true);
    for (const y of [0.1, 0.55, 1.0, 1.45]) box(g, w, 0.025, d, M(0xe8f4ee), 0, y, 0);
    box(g, w, 0.15, 0.03, emiss(0x1d8a5a, 0.4), 0, 1.75, d / 2);
    return {
      g,
      w,
      d,
      loot: 'medshelf',
      label: '藥品架',
      levels: [0.12, 0.57, 1.02, 1.47],
      front: d / 2 - 0.1,
      nItems: 4,
    };
  },
  woodshelf: w => {
    const g = new THREE.Group();
    const d = 0.55;
    const wood = M(0x7a5232, { roughness: 0.9 });
    box(g, w, 2.0, 0.04, wood, 0, 0, -d / 2 + 0.02, true);
    for (const x of [-w / 2, w / 2]) box(g, 0.05, 2.0, d, wood, x, 0, 0);
    for (const y of [0.05, 0.5, 0.95, 1.4]) box(g, w, 0.03, d, wood, 0, y, 0);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.5) plane(g, 0.14, 0.5, iconMat('snack'), x, 1.75, d / 2 + 0.02);
    return {
      g,
      w,
      d,
      loot: 'grocery',
      label: '雜貨木架',
      levels: [0.08, 0.53, 0.98, 1.43],
      front: d / 2 - 0.1,
      nItems: 4,
    };
  },
  counter: w => {
    const g = new THREE.Group();
    const d = 0.75;
    box(g, w, 0.95, d, M(0xf2f2f2), 0, 0, 0, true);
    box(g, w, 0.18, d + 0.02, emiss(0xf08a1c, 0.25), 0, 0.6, 0);
    box(g, w + 0.04, 0.04, d + 0.06, M(0x9a9a9a, { metalness: 0.5 }), 0, 0.95, 0);
    box(g, 0.35, 0.25, 0.3, M(0x333333), w / 2 - 0.35, 0.99, 0);
    box(g, 0.3, 0.2, 0.02, emiss(0x7ad0ff, 0.7), w / 2 - 0.35, 1.18, 0.1);
    // 關東煮 oden tray
    box(g, 0.7, 0.14, 0.45, M(0xc0c4c8, { metalness: 0.8, roughness: 0.3 }), -w / 2 + 0.5, 0.99, 0.05);
    box(g, 0.66, 0.02, 0.41, M(0xc9a35a, { roughness: 0.2 }), -w / 2 + 0.5, 1.12, 0.05);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25, 4), M(0xc9a46a));
      s.position.set(-w / 2 + 0.25 + (i % 6) * 0.1, 1.22, -0.08 + Math.floor(i / 6) * 0.2);
      s.rotation.x = 0.4;
      g.add(s);
    }
    // 茶葉蛋 pot
    cyl(g, 0.17, 0.22, M(0x1a1a1a, { metalness: 0.4 }), -w / 2 + 1.15, 0.99, 0);
    cyl(g, 0.15, 0.01, M(0x3a1e0c, { roughness: 0.2 }), -w / 2 + 1.15, 1.2, 0);
    for (let i = 0; i < 6; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0x6b3d1c));
      e.scale.y = 1.25;
      e.position.set(-w / 2 + 1.15 + Math.cos(i) * 0.08, 1.22, Math.sin(i) * 0.08);
      g.add(e);
    }
    // hot drink warmer + lottery stand
    box(g, 0.45, 0.4, 0.35, M(0x8a2a1a), w / 2 - 0.9, 0.99, 0);
    box(g, 0.4, 0.32, 0.02, emiss(0xffa040, 0.6), w / 2 - 0.9, 1.03, 0.18);
    const sign = plane(
      g,
      0.5,
      0.25,
      M(0xffffff, { map: textTex('hot', ['熱飲'], '#c22', '#fff', 128, 64, 36) }),
      w / 2 - 0.9,
      1.55,
      0.18,
    );
    void sign;
    return { g, w, d, loot: 'counter', label: '櫃台（關東煮・茶葉蛋）', levels: [], nItems: 3 };
  },
  kiosk: () => {
    const g = new THREE.Group();
    box(g, 0.6, 1.6, 0.5, M(0xe8e8e8), 0, 0, 0, true);
    box(g, 0.45, 0.35, 0.02, emiss(0x3a9ad8, 0.8), 0, 1.05, 0.26);
    plane(
      g,
      0.55,
      0.18,
      M(0xffffff, { map: textTex('ibox', ['i-Box 多媒體機'], '#ff7a00', '#fff', 256, 64, 30) }),
      0,
      1.5,
      0.26,
    );
    box(g, 0.3, 0.08, 0.1, M(0x333333), 0, 0.75, 0.25);
    return { g, w: 0.6, d: 0.5 };
  },
  lottery: () => {
    const g = new THREE.Group();
    box(g, 0.8, 1.0, 0.5, M(0xb81c1c), 0, 0, 0, true);
    plane(
      g,
      0.75,
      0.3,
      M(0xffffff, { map: textTex('lotto', ['幸運彩券'], '#b81c1c', '#ffe94a', 256, 96, 46) }),
      0,
      1.25,
      0.26,
    );
    box(g, 0.05, 0.4, 0.05, M(0x888888), 0, 1.0, 0.2);
    return { g, w: 0.8, d: 0.5 };
  },
  magazine: () => {
    const g = new THREE.Group();
    box(g, 1.2, 1.2, 0.35, M(0xdddddd), 0, 0, 0, true);
    const cols = ['#c22', '#e8a', '#28c', '#fc2', '#2a2', '#a3c'];
    for (let i = 0; i < 9; i++) {
      const t = textTex(
        'mag' + i,
        [['壹週', '時尚', '財經', '電玩', '娛樂', '汽車', '美食', '旅遊', '漫畫'][i]],
        cols[i % 6],
        '#fff',
        96,
        128,
        30,
      );
      const m = plane(
        g,
        0.34,
        0.45,
        M(0xffffff, { map: t }),
        -0.4 + (i % 3) * 0.4,
        0.45 + Math.floor(i / 3) * 0.32,
        0.19,
      );
      m.rotation.x = -0.2;
    }
    return { g, w: 1.2, d: 0.35 };
  },
  betelcase: w => {
    const g = new THREE.Group();
    const d = 0.6;
    box(g, w, 0.85, d, M(0x222222), 0, 0, 0, true);
    const gl = box(g, w, 0.35, d, M(0xcfffe0, { transparent: true, opacity: 0.25, roughness: 0.05 }), 0, 0.85, 0);
    gl.renderOrder = 2;
    box(g, w, 0.04, d, emiss(0x22ff66, 2.2), 0, 1.2, 0);
    box(g, 0.05, 0.85, 0.05, emiss(0xff2288, 2), -w / 2, 0.4, d / 2);
    box(g, 0.05, 0.85, 0.05, emiss(0xff2288, 2), w / 2, 0.4, d / 2);
    return { g, w, d, loot: 'betelcase', label: '檳榔玻璃櫃', levels: [0.86], front: 0.1, nItems: 3 };
  },
  griddle: w => {
    const g = new THREE.Group();
    const d = 0.75;
    box(g, w, 0.9, d, M(0xc8c8c8, { metalness: 0.6, roughness: 0.4 }), 0, 0, 0, true);
    box(g, w * 0.6, 0.03, d - 0.1, M(0x151515, { metalness: 0.8, roughness: 0.3 }), -w * 0.15, 0.9, 0);
    box(g, 0.4, 0.3, 0.35, M(0xe8e8e8), w / 2 - 0.3, 0.9, 0);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 12), M(0xf2c94a));
      p.position.set(-w * 0.3 + i * 0.25, 0.94, 0);
      g.add(p);
    }
    return { g, w, d, loot: 'breakfast', label: '早餐煎台', levels: [], nItems: 3 };
  },
  table: () => {
    const g = new THREE.Group();
    box(g, 0.8, 0.72, 0.6, M(0xf0f0f0), 0, 0, 0, true);
    stool(g, -0.55, 0);
    stool(g, 0.55, 0);
    stool(g, 0, 0.5);
    return { g, w: 0.8, d: 0.6 };
  },
  crates: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++)
      for (let j = 0; j <= i % 2; j++)
        box(g, 0.45, 0.3, 0.35, M([0x2a6ad8, 0xd8a02a, 0x2a9a4a][i]), -0.5 + i * 0.5, j * 0.3, 0, true);
    return { g, w: 1.5, d: 0.4 };
  },
  tv: () => {
    const g = new THREE.Group();
    box(g, 1.2, 0.5, 0.4, M(0x5a3a22), 0, 0, 0, true);
    box(g, 1.0, 0.6, 0.06, M(0x111111), 0, 0.5, 0);
    box(g, 0.92, 0.52, 0.01, emiss(0x2a4a6a, 0.6), 0, 0.54, 0.035);
    return { g, w: 1.2, d: 0.4 };
  },
  sofa: () => {
    const g = new THREE.Group();
    const c = M(0x8a5a3a, { roughness: 0.95 });
    box(g, 2.0, 0.42, 0.85, c, 0, 0, 0, true);
    box(g, 2.0, 0.5, 0.2, c, 0, 0.42, -0.33);
    for (const x of [-0.95, 0.95]) box(g, 0.15, 0.3, 0.85, c, x, 0.42, 0);
    return { g, w: 2.0, d: 0.85 };
  },
  altar: w => {
    const g = new THREE.Group();
    const red = M(0x8a1a12, { roughness: 0.5 });
    box(g, w, 0.95, 0.6, red, 0, 0, 0, true);
    box(g, w * 0.6, 0.7, 0.3, M(0x5a0e08), 0, 0.95, -0.12, true);
    box(
      g,
      w * 0.5,
      0.5,
      0.02,
      M(0xffffff, { map: textTex('god', ['福德正神'], '#d8a020', '#7a1010', 128, 128, 26) }),
      0,
      1.05,
      0.04,
    );
    for (const x of [-w * 0.35, w * 0.35]) {
      cyl(g, 0.05, 0.25, M(0xd02020), x, 0.95, 0.15);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), emiss(0xff3020, 2.5));
      l.position.set(x, 1.25, 0.15);
      g.add(l);
    }
    cyl(g, 0.08, 0.1, M(0xb8902a, { metalness: 0.7 }), 0, 0.95, 0.15);
    for (let i = -1; i <= 1; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), M(0xd0a060));
      s.position.set(i * 0.02, 1.15, 0.15);
      g.add(s);
    }
    return { g, w, d: 0.6, loot: 'altar', label: '神明桌', levels: [], nItems: 2 };
  },
  kitchen: w => {
    const g = new THREE.Group();
    const d = 0.6;
    box(g, w, 0.85, d, M(0xe8e2d6), 0, 0, 0, true);
    box(g, w, 0.04, d, M(0xa0a4a8, { metalness: 0.6 }), 0, 0.85, 0);
    const rc = cyl(g, 0.15, 0.24, M(0x6fa88a, { roughness: 0.3 }), -w / 2 + 0.3, 0.89, 0);
    void rc;
    cyl(g, 0.13, 0.02, M(0xd8d8d8, { metalness: 0.8 }), -w / 2 + 0.3, 1.13, 0);
    box(g, 0.6, 0.06, 0.4, M(0x222222), 0.2, 0.89, 0);
    box(g, 0.75, 1.8, 0.7, M(0xf2f2f2, { roughness: 0.3 }), w / 2 + 0.4, 0, 0, true);
    return { g, w: w + 0.8, d, loot: 'kitchen', label: '廚房（電鍋・冰箱）', levels: [], nItems: 4 };
  },
  bed: () => {
    const g = new THREE.Group();
    g.userData.bed = 1;
    box(g, 1.5, 0.35, 2.0, M(0x6a4a30), 0, 0, 0, true);
    box(g, 1.45, 0.15, 1.95, M(0xe8eef4), 0, 0.35, 0);
    box(g, 1.4, 0.06, 1.3, M(0x6a8ab8), 0, 0.5, 0.3);
    box(g, 0.5, 0.12, 0.35, M(0xffffff), -0.35, 0.5, -0.75);
    box(g, 0.5, 0.12, 0.35, M(0xffffff), 0.35, 0.5, -0.75);
    return { g, w: 1.5, d: 2.0 };
  },
  wardrobe: w => {
    const g = new THREE.Group();
    box(g, w, 2.0, 0.6, M(0xb88a5a), 0, 0, 0, true);
    box(g, 0.02, 1.9, 0.01, M(0x5a3a22), 0, 0.05, 0.305);
    return { g, w, d: 0.6, loot: 'wardrobe', label: '衣櫃', levels: [], nItems: 2 };
  },
  menu: w => {
    const g = new THREE.Group();
    plane(
      g,
      w,
      0.9,
      M(0xffffff, {
        map: textTex(
          'menu',
          ['蛋餅 25　蘿蔔糕 30', '漢堡 35　鐵板麵 45', '奶茶 20　豆漿 15'],
          '#fff6d8',
          '#a8221e',
          512,
          256,
          44,
        ),
      }),
      0,
      1.9,
      0.02,
    );
    return { g, w, d: 0.05 };
  },
};
// ---- researched Taiwanese domestic / shop fixtures (generic, no logos) ----
const woodD = () => M(0x5a2e16, { roughness: 0.55 }),
  woodL = () => M(0x9a6a3a, { roughness: 0.7 });
Object.assign(FX, {
  // 神明廳: 上桌 (神明桌, tall) + 下桌 (八仙桌), 神明彩 / 神像, 圓神明爐 + 方公媽爐, pair of red 神明燈, 公媽龕 on the tiger side, offerings
  shrine: (w: number) => {
    const g = new THREE.Group();
    const red = M(0x7a1410, { roughness: 0.45 });
    box(g, w, 1.12, 0.62, woodD(), 0, 0, -0.12, true);
    box(g, w + 0.1, 0.06, 0.7, red, 0, 1.12, -0.12);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
      box(g, 0.08, 0.05, 0.64, M(0xd8a030, { metalness: 0.6 }), x, 1.0, -0.12);
    box(g, w * 0.82, 0.8, 0.62, woodL(), 0, 0, 0.42, true);
    box(g, w * 0.86, 0.05, 0.66, woodD(), 0, 0.8, 0.42);
    plane(
      g,
      w * 0.7,
      0.9,
      M(0xffffff, { map: textTex('shenming', ['觀音佛祖', '福德正神'], '#7a1410', '#ffd060', 256, 256, 44) }),
      -0.05,
      1.75,
      -0.42,
    );
    const lathe = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.09, 0],
        [0.1, 0.08],
        [0.07, 0.2],
        [0.09, 0.32],
        [0.06, 0.42],
        [0, 0.48],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    );
    const st = new THREE.Mesh(lathe, M(0xc89040, { metalness: 0.3, roughness: 0.4 }));
    st.position.set(-0.12, 1.18, -0.28);
    g.add(st);
    box(g, 0.32, 0.5, 0.24, M(0x3a1a0a), w / 2 - 0.3, 1.18, -0.3);
    plane(
      g,
      0.24,
      0.4,
      M(0xffffff, { map: textTex('gongma', ['祖先'], '#2a0a04', '#ffd060', 64, 128, 30) }),
      w / 2 - 0.3,
      1.43,
      -0.17,
    );
    cyl(g, 0.12, 0.12, M(0xb08a40, { metalness: 0.7, roughness: 0.3 }), -0.1, 1.18, 0.0);
    box(g, 0.16, 0.1, 0.12, M(0x8a6a30, { metalness: 0.5 }), w / 2 - 0.3, 1.18, 0.0);
    for (let i = 0; i < 3; i++) box(g, 0.006, 0.22, 0.006, M(0xc8a060), -0.13 + i * 0.03, 1.3, 0.0);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.62]) {
      cyl(g, 0.02, 0.3, M(0xd8a030, { metalness: 0.6 }), x, 1.18, -0.05);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8).scale(0.8, 1.2, 0.8), emiss(0xff2a1a, 1.6));
      l.position.set(x, 1.55, -0.05);
      g.add(l);
    }
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M([0xf08a10, 0xe8d030, 0xd03030][i % 3]));
      f.position.set(-0.25 + i * 0.12, 0.88, 0.45);
      g.add(f);
    }
    cyl(g, 0.14, 0.03, M(0xeeeeee), 0.05, 0.83, 0.45);
    return { g, w, d: 1.2, loot: 'altar', label: '神明桌・公媽龕', levels: [], nItems: 2 };
  },
  // 木沙發 + 茶几 (泡茶組) with a 藤椅
  woodsofa: () => {
    const g = new THREE.Group();
    const w = woodD();
    box(g, 1.9, 0.42, 0.6, w, 0, 0, 0, true);
    box(g, 1.9, 0.5, 0.06, w, 0, 0.42, -0.27);
    for (const x of [-0.92, 0.92]) box(g, 0.08, 0.25, 0.6, w, x, 0.42, 0);
    for (let i = 0; i < 3; i++) box(g, 0.55, 0.06, 0.5, M(0xc8a878), -0.6 + i * 0.6, 0.42, 0.03);
    box(g, 1.0, 0.42, 0.5, w, 0, 0, 0.75, true);
    box(g, 0.4, 0.03, 0.28, M(0x3a2010), 0, 0.42, 0.75);
    cyl(g, 0.06, 0.09, M(0x8a5a3a), -0.08, 0.45, 0.75);
    for (let i = 0; i < 3; i++) cyl(g, 0.025, 0.035, M(0xf0f0e8), 0.06 + i * 0.06, 0.45, 0.7);
    const rat = M(0xc8a060, { roughness: 0.9 });
    const rc = new THREE.Group();
    box(rc, 0.6, 0.4, 0.6, rat, 0, 0, 0);
    box(rc, 0.6, 0.55, 0.08, rat, 0, 0.4, -0.26);
    for (const x of [-0.28, 0.28]) box(rc, 0.06, 0.2, 0.6, rat, x, 0.4, 0);
    rc.position.set(1.4, 0, 0.75);
    rc.rotation.y = -1.2;
    g.add(rc);
    return { g, w: 2.4, d: 1.1 };
  },
  // 飲水機 (hot/cold dispenser) — a tap source while 自來水 is on
  dispenser: () => {
    const g = new THREE.Group();
    box(g, 0.32, 1.0, 0.35, M(0xeef0f0), 0, 0, 0, true);
    box(g, 0.2, 0.12, 0.02, M(0x2a2a2a), 0, 0.7, 0.18);
    box(g, 0.03, 0.05, 0.03, M(0xd02020), -0.05, 0.75, 0.2);
    box(g, 0.03, 0.05, 0.03, M(0x2040d0), 0.05, 0.75, 0.2);
    box(g, 0.05, 0.04, 0.03, emiss(0x30ff60, 1), 0.1, 0.88, 0.18);
    return { g, w: 0.4, d: 0.4, loot: 'tapw', label: '飲水機（自來水）', levels: [], nItems: 1 };
  },
  // 保健食品櫃 glass cabinet with bottles
  healthcab: () => {
    const g = new THREE.Group();
    box(g, 1.0, 1.7, 0.35, woodL(), 0, 0, 0, true);
    const gl = box(
      g,
      0.95,
      1.2,
      0.02,
      M(0xd8f0ff, { transparent: true, opacity: 0.25, roughness: 0.05 }),
      0,
      0.45,
      0.18,
    );
    gl.renderOrder = 2;
    for (const y of [0.5, 0.9, 1.3]) {
      box(g, 0.92, 0.02, 0.3, M(0xeeeeee), 0, y, 0);
      for (let i = 0; i < 7; i++)
        cyl(
          g,
          0.035,
          0.12,
          M([0xf0f0f0, 0xb03020, 0x2a6a3a, 0xf0c030, 0x6a3a8a][i % 5]),
          -0.38 + i * 0.125,
          y + 0.02,
          0.02,
        );
    }
    return { g, w: 1.0, d: 0.35, loot: 'medshelf', label: '保健食品櫃', levels: [], nItems: 2 };
  },
  // 柑仔店 圓蓋糖果罐 counter
  candy: () => {
    const g = new THREE.Group();
    box(g, 1.6, 0.85, 0.6, woodL(), 0, 0, 0, true);
    box(g, 1.6, 0.04, 0.62, M(0x4a8a5a), 0, 0.85, 0);
    for (let i = 0; i < 6; i++) {
      const x = -0.65 + i * 0.26;
      const j = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.26, 12),
        M(0xe0f4ff, { transparent: true, opacity: 0.35, roughness: 0.05 }),
      );
      j.position.set(x, 1.02, 0);
      j.renderOrder = 2;
      g.add(j);
      cyl(g, 0.085, 0.16, M([0xe03050, 0xf0c020, 0x30a050, 0xf07020, 0x8040c0, 0xffffff][i]), x, 0.9, 0);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd03030));
      lid.position.set(x, 1.15, 0);
      g.add(lid);
    }
    box(g, 0.3, 0.12, 0.2, M(0xc8c8c8, { metalness: 0.5 }), 0.55, 0.85, 0.15); // 秤
    return { g, w: 1.6, d: 0.6, loot: 'grocery', label: '柑仔店糖果櫃', levels: [], nItems: 3 };
  },
  // 五金行 pegboard wall + bins + ladder + 瓦斯桶
  pegboard: (w: number) => {
    const g = new THREE.Group();
    box(g, w, 2.2, 0.04, M(0xb89a6a), 0, 0, -0.2, true);
    const tl = [0x3a3a3a, 0xd02020, 0xf0c020, 0x2050c0, 0x8a8a8a];
    for (let y = 0.6; y < 2.1; y += 0.28)
      for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.18) {
        const k = Math.floor(Math.random() * 5);
        box(
          g,
          0.05 + Math.random() * 0.08,
          0.14 + Math.random() * 0.1,
          0.03,
          M(tl[k], { metalness: k === 4 ? 0.7 : 0.1 }),
          x,
          y,
          -0.15,
        );
      }
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.2; x += 0.4) {
      box(g, 0.34, 0.25, 0.32, M(0x2a5aa8), x, 0, 0.0);
      box(g, 0.3, 0.02, 0.28, M(0x9a9a9a, { metalness: 0.8 }), x, 0.22, 0.0);
    }
    return { g, w, d: 0.45, loot: 'hardware', label: '五金工具牆', levels: [], nItems: 3 };
  },
  hwmisc: () => {
    const g = new THREE.Group();
    for (const x of [-0.2, 0.2]) box(g, 0.04, 1.8, 0.04, M(0xc0c0c0, { metalness: 0.7 }), x, 0, 0);
    for (let y = 0.3; y < 1.8; y += 0.3) box(g, 0.4, 0.03, 0.03, M(0xc0c0c0, { metalness: 0.7 }), 0, y, 0);
    cyl(g, 0.16, 0.6, M(0x5a7a9a, { metalness: 0.3 }), 0.6, 0, 0);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 16), M(0x2a8a3a));
      t.rotation.x = Math.PI / 2;
      t.position.set(-0.6, 0.03 + i * 0.05, 0);
      g.add(t);
    }
    return { g, w: 1.6, d: 0.4 };
  },
  checkout: () => {
    const g = new THREE.Group();
    box(g, 1.8, 0.85, 0.6, M(0xe8e8e8), 0, 0, 0, true);
    box(g, 1.2, 0.03, 0.5, M(0x222222), -0.3, 0.85, 0);
    box(g, 0.3, 0.3, 0.25, M(0x333333), 0.6, 0.85, 0);
    box(g, 0.26, 0.18, 0.02, emiss(0x7ad0ff, 0.6), 0.6, 1.2, 0.05);
    box(g, 0.05, 1.2, 0.05, M(0x888888), 0.85, 0.85, -0.25);
    box(g, 0.25, 0.25, 0.03, emiss(0xe82020, 0.7), 0.85, 2.05, -0.25);
    return { g, w: 1.8, d: 0.6, loot: 'counter', label: '結帳櫃台', levels: [], nItems: 2 };
  },
  aisle: (w: number) => {
    const f = FX.gondola(w);
    plane(
      f.g,
      0.9,
      0.3,
      M(0xffffff, {
        map: textTex(
          'aisle' + (w | 0),
          [['日用品', '泡麵・罐頭', '餅乾零食', '飲料'][((w * 7) | 0) % 4]],
          '#1a4aa8',
          '#fff',
          256,
          80,
          40,
        ),
        emissive: 0xffffff,
        emissiveMap: textTex('aisle' + (w | 0), [], '', ''),
        emissiveIntensity: 0.3,
      }),
      0,
      2.1,
      0,
    );
    return f;
  },
} as Record<string, (w: number) => Fx>);
const calTex = () => textTex('cal', ['十月', '25', '星期日'], '#fafaf0', '#c01818', 128, 192, 40);
const terrazzo = () => {
  if (TX.terr) return TX.terr;
  const t = tex(128, 128, c => {
    c.fillStyle = '#b8b2a6';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = ['#8a8478', '#d8d2c4', '#6a645a', '#a89a88'][i % 4];
      c.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    c.strokeStyle = 'rgba(60,50,40,.35)';
    c.strokeRect(0, 0, 128, 128);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (TX.terr = t);
};
// ---------- frame helpers ----------
export function furnish(b: any, kind: string, ctx: Ctx) {
  const door = b.door;
  if (!door) return false;
  const O = door.p as V2;
  const ex = door.c[0] - door.a[0],
    ez = door.c[1] - door.a[1];
  const el = Math.hypot(ex, ez);
  const U: V2 = [ex / el, ez / el];
  let N: V2 = [-U[1], U[0]];
  if (!ctx.pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], b.pts)) N = [-N[0], -N[1]];
  let umin = 1e9,
    umax = -1e9,
    D = 0;
  for (const p of b.pts) {
    const du = (p[0] - O[0]) * U[0] + (p[1] - O[1]) * U[1],
      dv = (p[0] - O[0]) * N[0] + (p[1] - O[1]) * N[1];
    umin = Math.min(umin, du);
    umax = Math.max(umax, du);
    D = Math.max(D, dv);
  }
  const W = umax - umin;
  if (W < 3 || D < 3.5) return false;
  const world = (u: number, v: number): V2 => [O[0] + U[0] * u + N[0] * v, O[1] + U[1] * u + N[1] * v];
  const dirs: Record<string, V2> = { door: [-N[0], -N[1]], back: N, 'side+': U, 'side-': [-U[0], -U[1]] };
  const inner = new THREE.Group();
  b.group.add(inner);
  b.inner = inner;
  let ci = 0;
  const place = (fx: Fx, u: number, v: number, face: string, tries = 6, step = 0.4) => {
    const fd = dirs[face];
    const th = Math.atan2(fd[0], fd[1]);
    const c = Math.cos(th),
      s = Math.sin(th);
    for (let t = 0; t < tries; t++) {
      const du = face === 'side+' ? step : face === 'side-' ? -step : 0,
        dv = face === 'door' ? -step : face === 'back' ? step : 0;
      const [cx, cz] = world(u + du * t, v + dv * t);
      const corner = (lx: number, lz: number): V2 => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const cs = [
        corner(-fx.w / 2, -fx.d / 2),
        corner(fx.w / 2, -fx.d / 2),
        corner(fx.w / 2, fx.d / 2),
        corner(-fx.w / 2, fx.d / 2),
      ];
      if (!cs.every(p => ctx.pip(p, b.pts))) continue;
      if (Math.hypot(cx - O[0], cz - O[1]) < 1.4 + fx.d / 2) continue;
      fx.g.position.set(cx, 0, cz);
      fx.g.rotation.y = th;
      inner.add(fx.g);
      for (let i = 0; i < 4; i++) ctx.addSeg({ a: cs[i], b: cs[(i + 1) % 4] });
      if (fx.loot) {
        const items = pickItems(fx.loot, ctx.rnd, fx.nItems || 3);
        const vis =
          fx.levels && fx.levels.length
            ? [
                ...stock(fx.g, items, fx.w, fx.levels, fx.front || 0),
                ...(fx.twoSided ? stock(fx.g, items, fx.w, fx.levels, fx.front || 0, true) : []),
              ]
            : [];
        ctx.addCont({
          id: `x${b.id}_${ci++}`,
          p: [cx, cz],
          items,
          label: fx.label!,
          mesh: fx.g,
          b,
          half: fx.w / 2,
          axis: [c, -s],
          vis,
          init: { ...items },
        });
      }
      return true;
    }
    return false;
  };
  const mid = (umin + umax) / 2;
  const r = ctx.rnd;
  const homeDeco = (v0: number) => {
    // 水泥/磨石子地 + 藍白拖 by the door + wall calendar
    const sh = new THREE.Shape(b.pts.map((p: V2) => new THREE.Vector2(p[0], p[1])));
    const fg = new THREE.ShapeGeometry(sh);
    const uv = fg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.6, uv.getY(i) / 0.6);
    fg.rotateX(Math.PI / 2);
    const t = terrazzo();
    t.repeat.set(1, 1);
    const fl = new THREE.Mesh(fg, M(0xffffff, { map: t, roughness: 0.6, side: THREE.DoubleSide }));
    fl.position.y = 0.04;
    fl.receiveShadow = true;
    inner.add(fl);
    for (const k of [0, 1]) {
      const sl = new THREE.Group();
      box(sl, 0.11, 0.025, 0.27, M(0x2a4ab8), 0, 0, 0);
      box(sl, 0.11, 0.02, 0.06, M(0xf0f0f0), 0, 0.025, 0.05);
      const [x, z] = world(mid + 0.9 + k * 0.2, 0.5 + v0);
      sl.position.set(x, 0.04, z);
      sl.rotation.y = r() * 0.5;
      inner.add(sl);
    }
    const cal = plane(inner, 0.3, 0.45, M(0xffffff, { map: calTex() }), 0, 0, 0);
    const [cx, cz] = world(umin + 0.14, 2.2 + v0);
    cal.position.set(cx, 1.7, cz);
    cal.rotation.y = Math.atan2(U[0], U[1]);
  };
  if (kind === 'store') {
    place(FX.fridge(Math.min(W - 0.8, 6)), mid, D - 0.6, 'door', 10);
    for (let v = 3.2, n = 0; v < D - 2.0 && n < 3; v += 2.3, n++)
      place(FX.gondola(Math.min(W - 2.6, 4.2)), mid, v, 'door', 2);
    place(FX.counter(2.6), umax - 1.6, 1.9, 'side-', 4) || place(FX.counter(2.2), mid + 0.6, 2.0, 'door', 4);
    place(FX.kiosk(0), umin + 0.6, 1.4, 'side+', 4);
    place(FX.magazine(0), umin + 0.4, 2.8, 'side+', 4);
    place(FX.lottery(0), umin + 0.6, D - 2.2, 'side+', 4);
  } else if (kind === 'pharmacy') {
    for (let v = 2.2; v < D - 1; v += 1.6) {
      place(FX.wallshelf(1.5), umin + 0.4, v, 'side+', 3);
      place(FX.wallshelf(1.5), umax - 0.4, v, 'side-', 3);
    }
    place(FX.wallshelf(Math.min(W - 1, 4)), mid, D - 0.4, 'door', 8);
    const c = FX.counter(2.0);
    place(c, mid, Math.min(D - 2.2, 3.5), 'door', 4);
    plane(
      c.g,
      0.9,
      0.3,
      M(0xffffff, { map: textTex('rx', ['藥師諮詢'], '#1d8a5a', '#fff', 256, 80, 40) }),
      0,
      1.45,
      0.4,
    );
  } else if (kind === 'hardware') {
    // 五金行
    for (let v = 1.8; v < D - 0.8; v += 2.0) {
      place(FX.pegboard(1.8), umin + 0.35, v, 'side+', 3);
      place(FX.pegboard(1.8), umax - 0.35, v, 'side-', 3);
    }
    place(FX.woodshelf(Math.min(W - 1.2, 3.5)), mid, D - 0.4, 'door', 8);
    place(FX.hwmisc(0), mid, 2.4, 'door', 4);
    const c = FX.counter(1.8);
    place(c, mid + 0.4, Math.min(D - 2, 4), 'door', 4);
    homeDeco(0);
  } else if (kind === 'market') {
    // 全聯-style neighbourhood supermarket
    place(FX.fridge(Math.min(W - 0.8, 7)), mid, D - 0.6, 'door', 10);
    for (let v = 3.6, n = 0; v < D - 2.2 && n < 5; v += 2.2, n++) {
      place(FX.aisle(Math.min(W / 2 - 1.4, 4)), umin + W * 0.28, v, 'door', 2);
      place(FX.aisle(Math.min(W / 2 - 1.4, 4) + 0.01), umin + W * 0.72, v, 'door', 2);
    }
    place(FX.checkout(0), umin + 1.4, 1.9, 'door', 3);
    place(FX.checkout(0), umin + 3.6, 1.9, 'door', 3);
    place(FX.wallshelf(1.5), umax - 0.4, 2.2, 'side-', 4);
  } else if (kind === 'grocery') {
    // 柑仔店 前店後居
    homeDeco(0);
    place(FX.candy(0), mid + 0.6, 1.8, 'door', 4);
    if (D > 7.5) {
      const vs = D * 0.55;
      const iw: THREE.BufferGeometry[] = [];
      for (const [a0, a1] of [
        [umin, mid - 0.5],
        [mid + 0.5, umax],
      ]) {
        const p = world(a0, vs),
          q = world(a1, vs);
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const g2 = new THREE.BoxGeometry(L, 2.6, 0.12);
        g2.rotateY(-Math.atan2(q[1] - p[1], q[0] - p[0]));
        g2.translate((p[0] + q[0]) / 2, 1.3, (p[1] + q[1]) / 2);
        iw.push(g2);
        ctx.addSeg({ a: p, b: q });
      }
      const { mergeGeometries } = (ctx as any).utils;
      const m = new THREE.Mesh(mergeGeometries(iw), M(0xe0d6c0));
      m.castShadow = true;
      inner.add(m);
      b.innerWalls = m;
      place(FX.shrine(1.3), mid, D - 1.0, 'door', 3);
      place(FX.woodsofa(0), mid, vs + 1.6, 'back', 2);
      place(FX.dispenser(0), umax - 0.4, vs + 0.5, 'side-', 3);
      place(FX.kitchen(1.4), umin + 1.0, D - 0.45, 'door', 3);
      for (let v = 1.4; v < vs - 0.4; v += 1.5) {
        place(FX.woodshelf(1.4), umin + 0.4, v, 'side+', 3);
        place(FX.woodshelf(1.4), umax - 0.4, v, 'side-', 3);
      }
      place(FX.healthcab(0), mid - 0.6, vs - 0.3, 'door', 3);
    } else {
      for (let v = 1.8; v < D - 0.6; v += 1.5) {
        place(FX.woodshelf(1.4), umin + 0.4, v, 'side+', 3);
        place(FX.woodshelf(1.4), umax - 0.4, v, 'side-', 3);
      }
      place(FX.woodshelf(Math.min(W - 1.2, 3.5)), mid, D - 0.4, 'door', 8);
      place(FX.crates(0), mid - 0.5, 2.2, 'door', 3);
      place(FX.tv(0), mid + 1, D - 1.6, 'door', 4);
      const st = new THREE.Group();
      stool(st, 0, 0);
      place({ g: st, w: 0.3, d: 0.3 }, mid + 0.8, 2.6, 'door', 2);
    }
  } else if (kind === 'betel') {
    place(FX.betelcase(1.6), mid, 1.7, 'door', 4);
    place(FX.fridge(1.2), umax - 1, D - 0.6, 'door', 6);
    const st = new THREE.Group();
    stool(st, 0, 0);
    place({ g: st, w: 0.3, d: 0.3 }, mid, 2.8, 'door', 3);
    if (b.sign) {
      (b.sign.material as any) = M(0xffffff, {
        map: textTex('betel', ['檳榔 · 香菸 · 飲料'], '#111', '#3f6', 512, 128, 60),
        emissive: 0xffffff,
        emissiveMap: textTex('betel', [], '', ''),
        emissiveIntensity: 0.9,
      });
    }
  } else if (kind === 'breakfast') {
    place(FX.griddle(2.4), umax - 1.4, 1.8, 'side-', 4) || place(FX.griddle(2.0), mid, 1.9, 'door', 4);
    place(FX.menu(2.4), mid, D - 0.15, 'door', 6);
    place(FX.fridge(1.4), umin + 0.9, D - 0.6, 'door', 6);
    for (let v = 3.2; v < D - 1.4; v += 1.6) place(FX.table(0), mid - 0.5, v, 'door', 1);
  } else {
    // home with rooms
    const iw: THREE.BufferGeometry[] = [];
    homeDeco(0);
    const wall = (a: V2, bb: V2) => {
      const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
      const n = Math.max(1, Math.floor(L / 0.5));
      for (let i = 0; i < n; i++) {
        const p0: V2 = [a[0] + ((bb[0] - a[0]) * i) / n, a[1] + ((bb[1] - a[1]) * i) / n],
          p1: V2 = [a[0] + ((bb[0] - a[0]) * (i + 1)) / n, a[1] + ((bb[1] - a[1]) * (i + 1)) / n];
        const m: V2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        if (!ctx.pip(m, b.pts)) continue;
        ctx.addSeg({ a: p0, b: p1 });
        const g = new THREE.BoxGeometry(L / n + 0.02, 1.3, 0.12);
        g.rotateY(-Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
        g.translate(m[0], 0.65, m[1]);
        iw.push(g);
      }
    };
    const split = D > 7 && W > 5.5;
    if (split) {
      const vs = D * 0.5,
        gap = mid + 1.2;
      wall(world(umin, vs), world(gap - 0.5, vs));
      wall(world(gap + 0.5, vs), world(umax, vs));
      wall(world(mid - 0.6, vs), world(mid - 0.6, vs + (D - vs) * 0.45));
      wall(world(mid - 0.6, vs + (D - vs) * 0.45 + 1.0), world(mid - 0.6, D));
      place(FX.shrine(1.6), mid - 1.0, vs - 0.75, 'door', 3) || place(FX.altar(1.4), mid - 1.2, vs - 0.45, 'door', 3);
      place(FX.woodsofa(0), mid + 0.2, 1.9, 'back', 3) || place(FX.sofa(0), umin + 1.2, 2.2, 'side+', 3);
      place(FX.dispenser(0), umax - 0.4, 1.6, 'side-', 4);
      place(FX.healthcab(0), umin + 0.3, vs - 1.4, 'side+', 3);
      place(FX.tv(0), mid + 0.4, vs - 0.4, 'door', 3);
      place(FX.kitchen(1.6), (umin + mid - 0.6) / 2, D - 0.45, 'door', 4);
      place(FX.bed(0), (mid - 0.6 + umax) / 2, D - 1.2, 'door', 4);
      place(FX.wardrobe(1.2), umax - 0.4, vs + 1.2, 'side-', 4);
    } else {
      place(FX.kitchen(1.4), mid, D - 0.45, 'door', 6);
      place(FX.bed(0), umin + 1.0, D - 1.5, 'door', 4);
      place(FX.shrine(1.2), umax - 0.9, D - 0.75, 'door', 4) || place(FX.altar(1.2), umax - 0.8, D - 0.45, 'door', 4);
      place(FX.dispenser(0), umin + 0.4, D - 1.4, 'side+', 4);
      place(FX.wardrobe(1.0), umin + 0.4, 2.0, 'side+', 3);
    }
    if (iw.length) {
      const { mergeGeometries } = (ctx as any).utils;
      const m = new THREE.Mesh(mergeGeometries(iw), M(0xe8dcc6));
      m.receiveShadow = true;
      m.castShadow = true;
      inner.add(m);
      b.innerWalls = m;
    }
  }
  void r;
  return true;
}
/** Night-market stalls along a road polyline */
export function nightMarket(pts: V2[], width: number, ctx: Ctx, idBase: string) {
  const names = [
    ['大雞排', '#c22'],
    ['烤香腸', '#a21'],
    ['珍珠奶茶', '#753'],
    ['蚵仔煎', '#258'],
    ['臭豆腐', '#552'],
    ['地瓜球', '#d82'],
    ['滷味', '#822'],
    ['蔥油餅', '#a82'],
  ];
  const stripe = tex(64, 64, c => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff' : '#d22';
      c.fillRect(i * 8, 0, 8, 64);
    }
  });
  let k = 0;
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1 && k < 14; i++) {
    const [ax, az] = pts[i],
      [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    const nx = -uz,
      nz = ux;
    for (let s = 2; s < L - 2 && k < 14; s += 3.2)
      for (const side of [-1, 1]) {
        const off = width / 2 + 1.0;
        const x = ax + ux * s + nx * off * side,
          z = az + uz * s + nz * off * side;
        if (
          ctx.bldAt(x, z) ||
          ctx.bldAt(x + nx * side * 0.6, z + nz * side * 0.6) ||
          ctx.bldAt(x + ux, z + uz) ||
          ctx.bldAt(x - ux, z - uz)
        )
          continue; /* on the sidewalk / 騎樓 edge, not in the road */
        const g = new THREE.Group();
        const [nm, col] = names[k % names.length];
        box(g, 1.6, 0.85, 0.8, M(0xbfc4c8, { metalness: 0.6, roughness: 0.4 }), 0, 0, 0, true);
        for (const px of [-0.9, 0.9]) for (const pz of [-0.5, 0.5]) box(g, 0.04, 2.3, 0.04, M(0x888888), px, 0, pz);
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.05, 1.2),
          new THREE.MeshStandardMaterial({ map: stripe }),
        );
        canopy.position.y = 2.3;
        canopy.castShadow = true;
        g.add(canopy);
        plane(
          g,
          1.6,
          0.4,
          M(0xffffff, {
            map: textTex('stall' + nm, [nm], col, '#fff', 256, 64, 44),
            emissive: 0xffffff,
            emissiveMap: textTex('stall' + nm, [nm], col, '#fff', 256, 64, 44),
            emissiveIntensity: 0.5,
          }),
          0,
          2.05,
          0.71,
        );
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), emiss(0xffd890, 3));
        bulb.position.set(0, 2.15, 0);
        g.add(bulb);
        stool(g, -0.5, 0.9);
        stool(g, 0.5, 0.9);
        const th = Math.atan2(-nx * side, -nz * side);
        g.rotation.y = th;
        g.position.set(x, 0, z);
        ctx.scene.add(g);
        const items = pickItems('stall', ctx.rnd, 2);
        const c = Math.cos(th),
          sn = Math.sin(th);
        const vis = stock(g, items, 1.6, [0.86], 0.25);
        ctx.addCont({
          id: idBase + k,
          p: [x, z],
          items,
          label: nm + '攤',
          mesh: g,
          b: null,
          half: 0.9,
          axis: [c, -sn],
          vis,
          init: { ...items },
        });
        out.push([x, z]);
        k++;
      }
  }
  return out;
}

/** 斷電: dim every emissive interior material (fridges, lamps, screens) */
const baseE = new Map<THREE.Material, number>();
export function setPower(on: boolean) {
  MC.forEach(m => {
    const mm = m as THREE.MeshStandardMaterial;
    if (!mm.emissive || mm.emissive.getHex() === 0) return;
    if (!baseE.has(mm)) baseE.set(mm, mm.emissiveIntensity);
    mm.emissiveIntensity = on ? baseE.get(mm)! : 0;
  });
}
