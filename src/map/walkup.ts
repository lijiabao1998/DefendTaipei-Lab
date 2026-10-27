// v21.5 old 萬華 walk-up details (from street refs): cantilevered switchback concrete stairs in the rear light-wells
// (white-grey render, dark-red handrail caps, saw-tooth undersides), tin lean-to roofs over back courts, split AC
// units, exposed red brick where the render has peeled, rain stains, vertical shop signs, and enterable ground-floor
// shops / homes (old tile floor, 神明廳 altar, bed, fridge, TV cabinet, plastic stools, counter, shelves).
// Everything is built in an edge-local frame (x along the wall, y up, z outward) and returned as vertex-coloured
// geometry for the tile's merged meshes; rooms come back as wall segments + loot spots so the game can stream them.
import * as THREE from 'three';
import { shrink } from './texq';

export type Out = {
  col: THREE.BufferGeometry[];
  tin: THREE.BufferGeometry[];
  brick: THREE.BufferGeometry[];
  vsign: THREE.BufferGeometry[];
  tile: THREE.BufferGeometry[][];
};
const C = new THREE.Color();
export function tint(g: THREE.BufferGeometry, hex: number) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  C.setHex(hex);
  for (let i = 0; i < n; i++) a.set([C.r, C.g, C.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, rz = 0, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  return tint(g.translate(x, y, z), c);
};
const RENDER = [0xd9d5ca, 0xcfcbc0, 0xc4c0b6, 0xdcd6c6];
const CAP = 0x6a2620;

/** cantilevered switchback stair against a wall, floors 0..lv, centred at x = 0, sticking out D along +z */
export function stair(lv: number, GF: number, FH: number, r: () => number) {
  const o: THREE.BufferGeometry[] = [];
  const W = 2.6,
    D = 2.4,
    rc = RENDER[Math.floor(r() * RENDER.length)];
  const lvl = (f: number) => (f === 0 ? 0 : GF + (f - 1) * FH);
  for (let f = 0; f < lv; f++) {
    const y0 = lvl(f),
      y1 = lvl(f + 1),
      ym = (y0 + y1) / 2;
    // landings at each end (floor level on the left, half-landing on the right)
    for (const [x, y] of [
      [-W / 2 - 0.5, y1],
      [W / 2 + 0.5, ym],
    ] as [number, number][]) {
      if (y <= 0) continue;
      o.push(B(1.0, 0.16, D, x, y - 0.08, D / 2, rc));
      o.push(B(1.0, 0.9, 0.12, x, y + 0.45, D - 0.06, rc));
      o.push(B(1.06, 0.07, 0.2, x, y + 0.93, D - 0.06, CAP));
      o.push(B(0.12, 0.9, D, x + Math.sign(x) * 0.47, y + 0.45, D / 2, rc));
      o.push(B(0.14, 0.07, D, x + Math.sign(x) * 0.47, y + 0.93, D / 2, CAP));
    }
    // two flights: outer one rising +x (y0 → ym), inner one rising −x (ym → y1)
    for (const [za, ya, yb, dir] of [
      [D * 0.75, y0, ym, 1],
      [D * 0.25, ym, y1, -1],
    ] as [number, number, number, number][]) {
      const rise = yb - ya,
        ang = Math.atan2(rise, W) * dir,
        len = Math.hypot(W, rise),
        yc = (ya + yb) / 2;
      o.push(B(len, 0.16, D / 2, 0, yc, za, rc, ang));
      // saw-tooth underside (each step's riser shows)
      for (let k = 0; k < 8; k++) {
        const t = (k + 0.5) / 8;
        o.push(B(W / 8, rise / 8, D / 2 - 0.02, (t - 0.5) * W * dir, ya + rise * t - rise / 16 - 0.12, za, rc));
      }
      // solid parapet on the outer flight only (with the dark-red cap), plain rail on the inner one
      if (za > D / 2) {
        o.push(B(len, 0.9, 0.12, 0, yc + 0.45, D - 0.06, rc, ang));
        o.push(B(len, 0.07, 0.2, 0, yc + 0.93, D - 0.06, CAP, ang));
      }
    }
  }
  // stains on the parapets: a few dark streaks
  for (let k = 0; k < lv; k++)
    o.push(B(0.3 + r() * 0.5, 0.5 + r(), 0.01, (r() - 0.5) * W, lvl(k) + 0.6 + r(), D + 0.005, 0x8e8a80));
  return o;
}
/** tin lean-to roof over a back court (teal or rusty), local frame, width w, depth d, at height y */
export function leanTo(w: number, d: number, y: number, r: () => number) {
  const c = [0x3e8f8a, 0x2f7f86, 0x9a4a2c, 0x8a8f8c, 0xa85a3a][Math.floor(r() * 5)];
  const o = [B(w, 0.04, d, 0, y, d / 2, c, 0, 0.12)];
  for (let x = -w / 2 + 0.2; x < w / 2; x += 0.25) o.push(B(0.03, 0.03, d, x, y + 0.03, d / 2, c, 0, 0.12)); // ribs
  o.push(
    B(0.06, y, 0.06, -w / 2 + 0.1, y / 2, d - 0.1, 0x55585a),
    B(0.06, y, 0.06, w / 2 - 0.1, y / 2, d - 0.1, 0x55585a),
  );
  return o;
}
/** split AC outdoor unit on a bracket (local frame), plus its drip stain */
export function ac(x: number, y: number) {
  return [
    B(0.82, 0.56, 0.3, x, y, 0.2, 0xe6e2d8),
    B(0.42, 0.42, 0.02, x - 0.12, y, 0.36, 0x3a3c3e),
    B(0.84, 0.04, 0.4, x, y - 0.3, 0.2, 0x5a5048),
    B(0.08, 0.9, 0.01, x + 0.3, y - 0.8, 0.012, 0x7d7870),
  ];
}
/** peeled render patch: irregular planes showing red brick */
export function brickPatch(x: number, y: number, r: () => number) {
  const o: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 2 + r() * 2; k++) {
    const g = new THREE.PlaneGeometry(0.5 + r() * 1.2, 0.4 + r() * 0.9);
    const uv = g.attributes.uv as THREE.BufferAttribute,
      su = r() * 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + su, uv.getY(i) + su);
    o.push(g.translate(x + (r() - 0.5) * 0.8, y + (r() - 0.5) * 0.6, 0.015 + k * 0.002));
  }
  return o;
}
export const brickMat = (() => {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#7a5a4a';
  c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16)
    for (let x = (y / 16) % 2 ? -16 : 0; x < 128; x += 32) {
      const v = 120 + Math.random() * 50;
      c.fillStyle = `rgb(${v + 30},${v * 0.45},${v * 0.32})`;
      c.fillRect(x + 1, y + 1, 30, 14);
    }
  // ragged render edges
  c.fillStyle = 'rgba(210,205,192,.85)';
  for (let k = 0; k < 60; k++)
    c.fillRect(Math.random() * 128, Math.random() < 0.5 ? 0 : 120, 6 + Math.random() * 14, 8);
  const t = new THREE.CanvasTexture(shrink(cv));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
})();
// vertical shop signs (fictional names), one atlas column each
const VS = ['一家川菜', '老王麵店', '美美理髮', '金福當舖', '阿嬤小吃', '永興五金', '大眾診所', '好運彩券'];
const VSC = [
  ['#c8231c', '#fff'],
  ['#f2efe4', '#b01e18'],
  ['#1d4f8a', '#fff'],
  ['#f0c419', '#a01810'],
];
export const VSN = VS.length;
export const vsignMat = (() => {
  const cv = document.createElement('canvas');
  cv.width = 64 * VSN;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  VS.forEach((s, i) => {
    const [bg, fg] = VSC[i % VSC.length];
    c.fillStyle = bg;
    c.fillRect(i * 64, 0, 64, 256);
    c.strokeStyle = fg;
    c.lineWidth = 3;
    c.strokeRect(i * 64 + 4, 4, 56, 248);
    c.fillStyle = fg;
    c.font = 'bold 44px sans-serif';
    c.textAlign = 'center';
    [...s].forEach((ch, j) => c.fillText(ch, i * 64 + 32, 52 + j * 58));
  });
  const t = new THREE.CanvasTexture(shrink(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0x222222, emissiveMap: t });
})();
/** vertical sign blade sticking out of the wall at lateral x (local frame) */
export function vsign(x: number, y: number, idx: number) {
  const g = new THREE.BoxGeometry(0.1, 2.8, 0.75);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (idx + uv.getX(i)) / VSN);
  return g.translate(x, y, 0.5);
}

export type Room = { kind: 'home' | 'shop'; w: number; d: number };
/** furnish a ground-floor room, local frame: door on z = 0 (street), room spans x ∈ [−w/2, w/2], z ∈ [−d, 0] */
export function furnishRoom(rm: Room, r: () => number, GF: number) {
  const o: THREE.BufferGeometry[] = [];
  const { w, d } = rm;
  const wallC = [0xe8e2d0, 0xd8dcd0, 0xe6d8c4][Math.floor(r() * 3)];
  // inner walls (both faces visible), ceiling, and a lower wainscot band
  o.push(B(0.08, GF, d, -w / 2, GF / 2, -d / 2, wallC), B(0.08, GF, d, w / 2, GF / 2, -d / 2, wallC));
  o.push(B(w, GF, 0.08, 0, GF / 2, -d, wallC));
  o.push(B(w, 0.06, d, 0, GF - 0.03, -d / 2, 0xd0ccc0));
  o.push(B(w - 0.1, 0.9, 0.02, 0, 0.45, -d + 0.05, 0x8a9a8c));
  o.push(B(0.6, 0.03, 0.6, 0, GF - 0.08, -d / 2, 0xfafaf0)); // ceiling lamp
  const stoolC = [0xd02a20, 0x2a5ad0, 0xe0c020];
  const stool = (x: number, z: number) =>
    o.push(tint(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 8).translate(x, 0.225, z), stoolC[Math.floor(r() * 3)]));
  if (rm.kind === 'home') {
    // 神明廳: red altar table on the back wall, upper offering table, god picture, red lamps
    o.push(B(1.6, 0.95, 0.6, 0, 0.475, -d + 0.38, 0x7a1c14));
    o.push(B(1.2, 0.25, 0.4, 0, 1.08, -d + 0.3, 0x8a2a1a));
    o.push(B(1.0, 1.2, 0.02, 0, 2.0, -d + 0.06, 0xd8a040));
    o.push(B(0.7, 0.8, 0.02, 0, 2.0, -d + 0.075, 0x9a4a20));
    for (const s of [-0.6, 0.6]) o.push(B(0.12, 0.25, 0.12, s, 1.65, -d + 0.2, 0xff3a2a));
    o.push(B(0.18, 0.12, 0.18, 0, 1.0, -d + 0.55, 0xb08a40)); // incense burner
    // bed, fridge, TV cabinet + TV
    o.push(B(1.4, 0.4, 1.9, -w / 2 + 0.8, 0.2, -1.4, 0x6a4a30), B(1.3, 0.12, 1.8, -w / 2 + 0.8, 0.46, -1.4, 0xe8d0d4));
    o.push(B(0.6, 1.65, 0.6, w / 2 - 0.4, 0.825, -0.6, 0xe4e0d4));
    o.push(
      B(0.4, 0.5, 1.5, w / 2 - 0.3, 0.25, -d / 2 - 0.3, 0x5a3a24),
      B(0.12, 0.55, 0.9, w / 2 - 0.25, 0.8, -d / 2 - 0.3, 0x18181a),
    );
    stool(0.2, -1.2);
    stool(-0.3, -1.6);
  } else {
    // shop: counter by the door, wall shelves with stock, plastic stools
    o.push(B(1.8, 1.0, 0.55, -w / 2 + 1.0, 0.5, -1.2, 0x8a7458), B(1.9, 0.04, 0.6, -w / 2 + 1.0, 1.02, -1.2, 0xcfc8b8));
    for (const y of [0.4, 1.0, 1.6]) o.push(B(0.4, 0.04, d - 1.4, w / 2 - 0.25, y, -d / 2 - 0.4, 0x777a78));
    for (let k = 0; k < 10; k++)
      o.push(
        B(
          0.25,
          0.25,
          0.3,
          w / 2 - 0.25,
          [0.53, 1.13, 1.73][k % 3],
          -1.2 - r() * (d - 2),
          [0xd84a30, 0x3a7ad0, 0xe8c030, 0x4aa060][k % 4],
        ),
      );
    o.push(B(1.4, 0.95, 0.6, 0, 0.475, -d + 0.38, 0x7a1c14), B(0.8, 0.8, 0.02, 0, 1.7, -d + 0.06, 0xd8a040)); // shop altar
    stool(0.3, -1.0);
    stool(0.8, -1.5);
    stool(-0.2, -2.2);
  }
  return o;
}
