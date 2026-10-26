// v21.4 Taipei / 萬華 street and park trees, low-poly but recognisable by silhouette (fictional, feel over specs):
// 台灣欒樹 (round crown, autumn yellow flowers / red capsules), 樟樹 (broad lumpy yellow-green dome), 榕樹 (fat
// trunk, huge flat canopy, hanging aerial roots — parks and temple squares), 茄苳 (dense dark crown, reddish bark),
// 黑板樹 (tall straight trunk, whorled pagoda tiers), 小葉欖仁 (thin trunk, flat horizontal tiers), 大王椰子 (tall grey
// column, green crownshaft, drooping fronds), heavily pruned street trees, shrubs, park benches and lamps, and
// cast-iron tree-pit guard grates. Every kind is one merged vertex-coloured geometry drawn as an InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Kind =
  | 'luan'
  | 'luanY'
  | 'luanR'
  | 'camphor'
  | 'banyan'
  | 'bishop'
  | 'board'
  | 'termin'
  | 'palm'
  | 'pruned'
  | 'shrub'
  | 'grate'
  | 'bench'
  | 'plamp';

const P: { g: THREE.BufferGeometry; c: number }[] = [];
const pt = (g: THREE.BufferGeometry, c: number) => P.push({ g, c });
const cyl = (r0: number, r1: number, h: number, y: number, seg = 6) =>
  new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, y + h / 2, 0);
const blob = (r: number, x: number, y: number, z: number, sy = 0.75, d = 0) =>
  new THREE.IcosahedronGeometry(r, d).scale(1, sy, 1).translate(x, y, z);
const box = (x: number, y: number, z: number, tx: number, ty: number, tz: number) =>
  new THREE.BoxGeometry(x, y, z).translate(tx, ty, tz);
function bake() {
  const gs = P.splice(0).map(({ g, c }) => {
    const s = (g.index ? g.toNonIndexed() : g) as THREE.BufferGeometry;
    for (const k of Object.keys(s.attributes)) if (!['position', 'normal'].includes(k)) s.deleteAttribute(k);
    const n = s.attributes.position.count,
      cc = new THREE.Color(c),
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3);
    s.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return s;
  });
  const m = mergeGeometries(gs)!;
  m.computeVertexNormals();
  (m as any).shared = true;
  return m;
}
const BARK = 0x5e5040,
  GREY = 0x77706a;
function luan(fl: number) {
  pt(cyl(0.2, 0.14, 3, 0), BARK);
  pt(blob(2.1, 0, 4.4, 0, 0.8, 1), 0x4f8034);
  if (fl)
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4;
      pt(blob(0.7, Math.cos(a) * 1.3, 5.2 + (k % 2) * 0.4, Math.sin(a) * 1.3, 0.5), fl);
    }
  return bake();
}
const GEO: Record<Kind, () => THREE.BufferGeometry> = {
  luan: () => luan(0),
  luanY: () => luan(0xd9b52e),
  luanR: () => luan(0xa9503a),
  camphor: () => {
    pt(cyl(0.3, 0.22, 2.6, 0), 0x4e4236);
    pt(cyl(0.18, 0.12, 2.2, 0).rotateZ(0.4).translate(0.4, 2.2, 0), 0x4e4236);
    pt(cyl(0.18, 0.12, 2.2, 0).rotateZ(-0.4).translate(-0.4, 2.2, 0), 0x4e4236);
    for (const [x, y, z, r] of [
      [0, 5.2, 0, 2.2],
      [1.6, 4.6, 0.6, 1.6],
      [-1.5, 4.7, -0.5, 1.7],
      [0.3, 4.5, -1.6, 1.5],
      [-0.4, 4.4, 1.5, 1.5],
    ])
      pt(blob(r, x, y, z, 0.75), 0x6f9b3a);
    return bake();
  },
  banyan: () => {
    pt(cyl(0.7, 0.45, 3.4, 0, 8), GREY);
    for (const a of [0.6, 2.6, 4.4]) pt(cyl(0.22, 0.14, 3, 0).rotateZ(0.7).rotateY(a).translate(0, 2.6, 0), GREY);
    for (const [x, z, r] of [
      [0, 0, 3.4],
      [2.8, 0.8, 2.6],
      [-2.7, -0.6, 2.7],
      [0.6, 2.7, 2.4],
      [-0.8, -2.8, 2.4],
    ])
      pt(blob(r, x, 5.4 + Math.abs(x) * -0.15, z, 0.45), 0x2f5a2a);
    // aerial roots hanging from the limbs; a few reach the ground as pillar roots
    for (let k = 0; k < 14; k++) {
      const a = k * 2.39,
        r = 1.4 + (k % 4) * 0.6,
        l = k % 5 === 0 ? 4.4 : 1.4 + (k % 3) * 0.6;
      pt(cyl(0.05, 0.04, l, 4.4 - l, 3).translate(Math.cos(a) * r, 0, Math.sin(a) * r), 0x5d544a);
    }
    return bake();
  },
  bishop: () => {
    pt(cyl(0.32, 0.24, 2.6, 0), 0x7a4a34);
    pt(blob(2.2, 0, 4.2, 0, 0.8, 1), 0x2d5e2b);
    pt(blob(1.4, 0.9, 5.3, 0.3, 0.7), 0x356a30);
    return bake();
  },
  board: () => {
    pt(cyl(0.24, 0.12, 9.5, 0), 0x8a857c);
    for (const [y, r] of [
      [3.6, 2.4],
      [5.6, 2.0],
      [7.4, 1.5],
      [9.0, 0.9],
    ])
      pt(new THREE.ConeGeometry(r, 1.6, 7).translate(0, y, 0), 0x2f6230);
    return bake();
  },
  termin: () => {
    pt(cyl(0.15, 0.08, 7, 0), 0x6e6256);
    for (const [y, r] of [
      [2.6, 2.3],
      [3.9, 1.9],
      [5.1, 1.4],
      [6.2, 0.9],
      [7.1, 0.45],
    ])
      pt(cyl(r, r * 0.9, 0.28, y, 7), 0x8bb24c);
    return bake();
  },
  palm: () => {
    pt(cyl(0.3, 0.26, 10, 0, 8), 0xb4b0a6);
    pt(blob(0.42, 0, 4, 0, 1.4), 0xb4b0a6);
    pt(cyl(0.3, 0.28, 2, 10, 8), 0x5f8a3a);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      pt(
        box(3.2, 0.06, 0.6, 1.5, 0, 0)
          .rotateZ(-0.35 - (k % 3) * 0.15)
          .rotateY(a)
          .translate(0, 12.1, 0),
        0x3f7a30,
      );
    }
    return bake();
  },
  pruned: () => {
    // 修剪過度的行道樹: short trunk, stubby limbs, thin regrowth tufts
    pt(cyl(0.2, 0.15, 3.2, 0), BARK);
    for (const a of [0, 2.1, 4.2]) {
      pt(cyl(0.1, 0.07, 1.4, 0).rotateZ(0.8).rotateY(a).translate(0, 3, 0), BARK);
      pt(blob(0.6, Math.cos(a) * 0.9, 4.1, -Math.sin(a) * 0.9, 0.8), 0x4c7c34);
    }
    return bake();
  },
  shrub: () => {
    pt(blob(0.7, 0, 0.45, 0, 0.7), 0x3b6d2f);
    pt(blob(0.5, 0.6, 0.35, 0.2, 0.7), 0x4a7d36);
    return bake();
  },
  grate: () => {
    for (const [x, z, w, d] of [
      [0, 0.5, 1.1, 0.1],
      [0, -0.5, 1.1, 0.1],
      [0.5, 0, 0.1, 0.9],
      [-0.5, 0, 0.1, 0.9],
      [0, 0.28, 0.9, 0.05],
      [0, -0.28, 0.9, 0.05],
      [0.28, 0, 0.05, 0.9],
      [-0.28, 0, 0.05, 0.9],
    ])
      pt(box(w, 0.03, d, x, 0.17, z), 0x2a2826);
    // guard hoop
    pt(new THREE.TorusGeometry(0.35, 0.025, 4, 10).rotateX(Math.PI / 2).translate(0, 0.9, 0), 0x3c4a3e);
    for (const a of [0, 1.57, 3.14, 4.71])
      pt(cyl(0.02, 0.02, 0.75, 0.15, 3).translate(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35), 0x3c4a3e);
    return bake();
  },
  bench: () => {
    pt(box(1.6, 0.06, 0.45, 0, 0.45, 0), 0x8a6a3a);
    pt(box(1.6, 0.35, 0.05, 0, 0.72, -0.2), 0x8a6a3a);
    for (const x of [-0.7, 0.7]) pt(box(0.06, 0.45, 0.4, x, 0.22, 0), 0x333333);
    return bake();
  },
  plamp: () => {
    pt(cyl(0.07, 0.05, 3.6, 0), 0x2f3a34);
    pt(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 3.8, 0), 0xf2efe2);
    return bake();
  },
};
const cache: Partial<Record<Kind, THREE.BufferGeometry>> = {};
const geo = (k: Kind) => (cache[k] ||= GEO[k]());
export const TREE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
/** trunk radius (cover / collision) per kind; 0 = no blocker */
export const TRUNK_R: Record<Kind, number> = {
  luan: 0.2,
  luanY: 0.2,
  luanR: 0.2,
  camphor: 0.3,
  banyan: 0.75,
  bishop: 0.32,
  board: 0.24,
  termin: 0.15,
  palm: 0.3,
  pruned: 0.2,
  shrub: 0,
  grate: 0,
  bench: 0,
  plamp: 0.07,
};

/** street-tree mix seen along 萬華 roads (欒樹 / 樟樹 / 茄苳 / 黑板樹 / 小葉欖仁, some hacked back) */
export function streetKind(r: () => number): Kind {
  const v = r();
  return v < 0.12
    ? 'pruned'
    : v < 0.3
      ? r() < 0.5
        ? 'luanY'
        : r() < 0.5
          ? 'luanR'
          : 'luan'
      : v < 0.48
        ? 'camphor'
        : v < 0.63
          ? 'bishop'
          : v < 0.8
            ? 'termin'
            : 'board';
}
/** park mix (青年公園 / 華江 / 艋舺公園 feel): big 榕樹, 樟樹, 大王椰子 rows, 茄苳, 欒樹 */
export function parkKind(r: () => number): Kind {
  const v = r();
  return v < 0.22
    ? 'banyan'
    : v < 0.42
      ? 'camphor'
      : v < 0.54
        ? 'palm'
        : v < 0.68
          ? 'bishop'
          : v < 0.82
            ? r() < 0.6
              ? 'luanY'
              : 'luan'
            : v < 0.91
              ? 'termin'
              : 'board';
}

/** Collects instances, then builds one InstancedMesh per kind. */
export class Forest {
  items = new Map<Kind, THREE.Matrix4[]>();
  tints = new Map<Kind, number[]>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(k: Kind, x: number, z: number, rot: number, s = 1, lean = 0, tint = 1, y = 0) {
    this.e.set(lean, rot, lean * 0.5);
    this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s, s, s));
    (this.items.get(k) || this.items.set(k, []).get(k)!).push(m);
    (this.tints.get(k) || this.tints.set(k, []).get(k)!).push(tint);
  }
  /** a street tree: kind + iron grate, sometimes leaning (decay). Returns the trunk radius for a blocker. */
  street(x: number, z: number, r: () => number, ang = 0, grate = true) {
    const k = streetKind(r);
    if (grate) this.add('grate', x, z, ang, 1, 0, 1);
    this.add(k, x, z, r() * 6.28, 0.8 + r() * 0.35, r() < 0.12 ? 0.08 + r() * 0.08 : 0, 0.85 + r() * 0.25);
    return TRUNK_R[k];
  }
  park(x: number, z: number, r: () => number) {
    const k = parkKind(r);
    this.add(k, x, z, r() * 6.28, k === 'banyan' ? 1 + r() * 0.5 : 0.85 + r() * 0.35, 0, 0.85 + r() * 0.25);
    return { k, r: TRUNK_R[k] * (k === 'banyan' ? 1.2 : 1) };
  }
  build(par: THREE.Object3D, shadow = true) {
    const out: THREE.InstancedMesh[] = [];
    const col = new THREE.Color();
    for (const [k, ms] of this.items) {
      if (!ms.length) continue;
      const im = new THREE.InstancedMesh(geo(k), TREE_MAT, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      this.tints.get(k)!.forEach((t, i) => im.setColorAt(i, col.setScalar(t)));
      im.castShadow = shadow && k !== 'grate';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      par.add(im);
      out.push(im);
    }
    return out;
  }
}
