// v21.6 北都地下鐵 — a fictional metro (own logo and colours: 橘 #e8681c + 深綠 #1f5a3a). Stations sit inside
// 萬華 only; each is a surface entrance kiosk plus an underground interior (concourse, fare gates, stairs,
// platform with the yellow line, glass platform screen doors and a parked train). Interiors are built far
// off-map (z ≈ -7000) and reached by walking into the entrance: no rides or transfers, just shelter + loot.
// Everything is deterministic (no shared RNG), so all players get the same stations and loot ids.
import * as THREE from 'three';
import type { V2, Seg } from './world';

export const METRO_ORANGE = 0xe8681c,
  METRO_GREEN = 0x1f5a3a;
export type Station = {
  name: string;
  ent: V2; // surface trigger
  out: V2; // where you come back up
  inn: V2; // where you arrive underground
  exit: V2; // underground trigger back up
  loot: { id: string; p: V2; type: string }[];
};
/** station names (real 萬華 places; the system itself is fictional) and rough surface anchors */
export const STATIONS: { name: string; x: number; z: number }[] = [
  { name: '龍山寺', x: -300, z: 420 },
  { name: '西門', x: 420, z: -180 },
  { name: '萬大', x: -260, z: 1500 },
  { name: '華江', x: -1250, z: 760 },
];

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** the logo: an orange ring with a green 北 and two track ticks */
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
function signTex(name: string) {
  return canvasTex(512, 128, c => {
    c.fillStyle = '#1f5a3a';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#e8681c';
    c.fillRect(0, 108, 512, 20);
    logo(c, 64, 56, 44);
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '700 40px sans-serif';
    c.fillText(`${name}站`, 124, 42);
    c.font = '400 22px sans-serif';
    c.fillText('北都地下鐵 BEIDU METRO', 126, 86);
  });
}

const M = {
  floor: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6 }),
  plat: new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.7 }),
  green: new THREE.MeshStandardMaterial({ color: METRO_GREEN, roughness: 0.6 }),
  orange: new THREE.MeshStandardMaterial({ color: METRO_ORANGE, roughness: 0.5 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.6, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd0d8, transparent: true, opacity: 0.35, roughness: 0.1 }),
  train: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.4, roughness: 0.4 }),
  win: new THREE.MeshStandardMaterial({ color: 0x233038, roughness: 0.2 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x2f7a52, roughness: 0.7 }),
  void: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 }),
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(
  g: THREE.Object3D,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const b = new THREE.Mesh(BOX, m);
  b.position.set(x, y + sy / 2, z);
  b.scale.set(sx, sy, sz);
  b.castShadow = sy > 0.3;
  b.receiveShadow = true;
  g.add(b);
  return b;
}

export type MetroDeps = {
  scene: THREE.Scene;
  addSeg: (s: Seg, low?: boolean) => void;
  /** nudge a surface anchor onto a free sidewalk spot */
  snap: (x: number, z: number) => V2;
};

/** builds all stations; returns their triggers + loot spots */
export function buildMetro(d: MetroDeps): Station[] {
  return STATIONS.map((st, i) => {
    const OX = -1200 + i * 220,
      OZ = -7000;
    const g = new THREE.Group();
    g.position.set(OX, 0, OZ);
    d.scene.add(g);
    const W = (ax: number, az: number, bx: number, bz: number, low = false, h = 3.2) => {
      d.addSeg({ a: [OX + ax, OZ + az], b: [OX + bx, OZ + bz] }, low);
      const L = Math.hypot(bx - ax, bz - az);
      if (low) return;
      const m = box(g, M.wall, (ax + bx) / 2, 0, (az + bz) / 2, ax === bx ? 0.3 : L, h, ax === bx ? L : 0.3);
      return m;
    };
    // the dark rock around the box so nothing but the station shows
    box(g, M.void, 0, -0.2, 6, 140, 0.19, 70);
    // ---- concourse z∈[-6, 12]
    box(g, M.floor, 0, 0, 3, 44, 0.02, 18);
    W(-22, -6, -4, -6);
    W(4, -6, 22, -6);
    W(-22, -6, -22, 12);
    W(22, -6, 22, 12);
    // entrance stairs (coming down) behind the gap in the north wall
    for (let k = 0; k < 6; k++) box(g, M.dark, 0, 0, -6.6 - k * 0.5, 7.6, 0.02 + (5 - k) * 0.03, 0.5);
    box(g, M.orange, -3.9, 0, -8, 0.15, 1.0, 4);
    box(g, M.orange, 3.9, 0, -8, 0.15, 1.0, 4);
    W(-4, -6, -4, -9);
    W(4, -6, 4, -9);
    W(-4, -9, 4, -9, true);
    // station name band on the walls
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: signTex(st.name) }));
    nm.position.set(-12, 2.4, -5.8);
    g.add(nm);
    const nm2 = nm.clone();
    nm2.position.set(12, 2.4, -5.8);
    g.add(nm2);
    // ticket machines + service counter
    for (let k = 0; k < 4; k++) {
      box(g, M.green, -19 + k * 1.4, 0, -5.2, 1.1, 1.8, 0.8);
      box(g, M.orange, -19 + k * 1.4, 1.2, -4.78, 0.7, 0.3, 0.02);
    }
    W(-19.7, -4.6, -14.3, -4.6, true);
    box(g, M.green, 16, 0, 0.5, 5, 1.1, 1.2);
    box(g, M.glass, 16, 1.1, 0.5, 5, 1.2, 0.05);
    W(13.5, 0, 18.5, 0, true);
    // fare gates (z = 4): cabinets with gaps; the outer two lanes are passable
    for (let k = -5; k <= 5; k++) {
      const x = k * 1.6;
      box(g, M.steel, x, 0, 4, 0.35, 1.0, 1.6);
      box(g, M.orange, x, 1.0, 4, 0.36, 0.05, 1.6);
      d.addSeg({ a: [OX + x, OZ + 3.2], b: [OX + x, OZ + 4.8] }, true);
      if (k < 5 && Math.abs(k + 0.5) < 3) {
        // closed flaps in the middle lanes (power is off)
        box(g, M.glass, x + 0.8, 0.5, 4, 1.25, 0.5, 0.05);
        d.addSeg({ a: [OX + x + 0.2, OZ + 4], b: [OX + x + 1.4, OZ + 4] }, true);
      }
    }
    W(-22, 4, -8.2, 4, true);
    W(8.2, 4, 22, 4, true);
    box(g, M.steel, -15, 0, 4, 13.6, 1.0, 0.08);
    box(g, M.steel, 15, 0, 4, 13.6, 1.0, 0.08);
    // ---- down to the platform: two stairwells at x = ±15 through the south wall (z = 12)
    // camera-side walls are cut away low (like the room cutaways) so the platform stays visible
    W(-22, 12, -17, 12, false, 0.9);
    W(-13, 12, 13, 12, false, 0.9);
    W(17, 12, 22, 12, false, 0.9);
    for (const sx of [-15, 15])
      for (let k = 0; k < 5; k++) box(g, M.dark, sx, 0, 12.2 + k * 0.5, 3.8, 0.12 - k * 0.02, 0.5);
    // ---- platform z∈[12, 22]
    box(g, M.plat, 0, 0, 17, 64, 0.02, 10);
    W(-32, 12, -22, 12, false, 0.9);
    W(22, 12, 32, 12, false, 0.9);
    W(-32, 12, -32, 22, false, 1.2);
    W(32, 12, 32, 22, false, 1.2);
    box(g, M.yellow, 0, 0.02, 21.2, 62, 0.01, 0.3);
    for (let k = -30; k <= 30; k += 0.6) box(g, M.yellow, k, 0.03, 20.8, 0.3, 0.01, 0.3);
    // columns down the middle of the platform (dressed, not free-standing: they carry the orange beam)
    box(g, M.orange, 0, 3.0, 16.5, 62, 0.25, 0.4);
    for (let x = -24; x <= 24; x += 12) {
      box(g, M.green, x, 0, 16.5, 0.7, 3.0, 0.7);
      d.addSeg({ a: [OX + x - 0.35, OZ + 16.5], b: [OX + x + 0.35, OZ + 16.5] });
    }
    // platform screen doors (z = 22): glass panels, one pair jammed open at x = 0
    for (let x = -30; x < 30; x += 2) {
      const open = Math.abs(x + 1) < 1.5;
      box(g, M.steel, x, 0, 22, 0.12, 1.6, 0.2);
      if (!open) box(g, M.glass, x + 1, 0, 22, 1.8, 1.5, 0.06);
      box(g, M.green, x + 1, 1.5, 22, 2, 0.15, 0.22);
      if (!open) d.addSeg({ a: [OX + x, OZ + 22], b: [OX + x + 2, OZ + 22] });
    }
    // ---- parked train (z∈[22.8, 25.8]) with the matching door open; walk in to loot
    const TL = 56;
    box(g, M.void, 0, -0.6, 24.3, 70, 0.6, 3.4);
    box(g, M.train, 0, 0, 22.9, TL, 1.3, 0.12);
    box(g, M.train, 0, 0, 25.7, TL, 1.3, 0.12);
    box(g, M.train, -TL / 2, 0, 24.3, 0.12, 1.3, 2.9);
    box(g, M.train, TL / 2, 0, 24.3, 0.12, 1.3, 2.9);
    box(g, M.floor, 0, 0, 24.3, TL, 0.02, 2.8);
    box(g, M.orange, 0, 0.5, 22.82, TL, 0.18, 0.02);
    box(g, M.green, 0, 0.7, 22.82, TL, 0.08, 0.02);
    for (let x = -26; x <= 26; x += 4) {
      if (Math.abs(x) > 1) box(g, M.win, x, 0.85, 22.83, 2.4, 0.4, 0.02);
      box(g, M.steel, x + 2, 1.25, 24.3, 0.05, 0.05, 2.8); // grab rails show the cut roofline
      box(g, M.seat, x, 0, 25.3, 2.6, 0.45, 0.6);
    }
    d.addSeg({ a: [OX - TL / 2, OZ + 22.9], b: [OX - 1, OZ + 22.9] });
    d.addSeg({ a: [OX + 1, OZ + 22.9], b: [OX + TL / 2, OZ + 22.9] });
    d.addSeg({ a: [OX - TL / 2, OZ + 25.7], b: [OX + TL / 2, OZ + 25.7] });
    d.addSeg({ a: [OX - TL / 2, OZ + 22.9], b: [OX - TL / 2, OZ + 25.7] });
    d.addSeg({ a: [OX + TL / 2, OZ + 22.9], b: [OX + TL / 2, OZ + 25.7] });
    // lights
    const L = new THREE.PointLight(0xfff2dd, 14, 40, 1.6);
    L.position.set(0, 3.2, 8);
    g.add(L);
    // ---- surface entrance kiosk: glass canopy on green frame, logo sign, steps down
    const [ex, ez] = d.snap(st.x, st.z);
    const k = new THREE.Group();
    k.position.set(ex, 0, ez);
    d.scene.add(k);
    box(k, M.green, -1.6, 0, 0, 0.12, 2.6, 3.2);
    box(k, M.green, 1.6, 0, 0, 0.12, 2.6, 3.2);
    box(k, M.green, 0, 0, 1.6, 3.3, 2.6, 0.12);
    box(k, M.glass, 0, 2.6, 0, 3.4, 0.08, 3.4);
    box(k, M.orange, 0, 2.5, -1.62, 3.3, 0.18, 0.1);
    box(k, M.dark, 0, 0, -0.2, 3.0, 0.03, 2.6);
    const sm = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({ map: signTex(st.name) }),
    );
    sm.position.set(0, 3.15, -1.7);
    sm.rotation.y = Math.PI;
    k.add(sm);
    const pole = canvasTex(128, 128, c => logo(c, 64, 64, 58));
    const lg = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: pole, side: 2 }));
    lg.position.set(2.2, 3.0, -1.7);
    k.add(lg);
    box(k, M.green, 2.2, 0, -1.7, 0.08, 2.5, 0.08);
    d.addSeg({ a: [ex - 1.6, ez - 1.6], b: [ex - 1.6, ez + 1.6] });
    d.addSeg({ a: [ex + 1.6, ez - 1.6], b: [ex + 1.6, ez + 1.6] });
    d.addSeg({ a: [ex - 1.6, ez + 1.6], b: [ex + 1.6, ez + 1.6] });
    const loot = [
      { id: `m${i}:0`, p: [OX - 16, OZ + 1.5] as V2, type: 'store' },
      { id: `m${i}:1`, p: [OX + 16, OZ + 1.8] as V2, type: 'pharmacy' },
      { id: `m${i}:2`, p: [OX - 26, OZ + 14] as V2, type: 'home' },
      { id: `m${i}:3`, p: [OX + 10, OZ + 24.3] as V2, type: 'store' },
      { id: `m${i}:4`, p: [OX - 18, OZ + 24.3] as V2, type: 'home' },
    ];
    return {
      name: st.name,
      ent: [ex, ez] as V2,
      out: [ex, ez - 3] as V2,
      inn: [OX, OZ - 4.5] as V2,
      exit: [OX, OZ - 7.5] as V2,
      loot,
    };
  });
}
