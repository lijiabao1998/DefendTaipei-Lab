// v21.3 paving for everything outside the carriageway (fictional, but it should feel like 萬華/台北):
// 10×20 cm high-pressure / permeable bricks in grey and earth tones (herringbone + running bond, a dark-grey
// 30×30 facility strip), granite-grey curb stones, yellow 導盲 warning tiles at crossings, mixed ceramic 騎樓
// floors (each lot tiled by its own owner), worn concrete + brick patchwork for alleys, lots and gaps between
// buildings, cast-iron manholes and tree pits. All textures are canvas-generated once and shared; geometry uses
// world-planar UVs so tiles line up across meshes and streamed tiles.
import * as THREE from 'three';
import { shrink } from './texq';

const cv = (w: number, h: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, seed = 7) => {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  draw(el.getContext('2d')!, r);
  const t = new THREE.CanvasTexture(shrink(el)); // v21.4 half-res on mobile
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const rgb = (c: number[], j: number, r: () => number) => {
  const k = 1 + (r() - 0.5) * j;
  return `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
};
// grime: dark blotches, gum spots, rain streak stains (decay theme)
function grime(c: CanvasRenderingContext2D, r: () => number, W: number, H: number, n = 18) {
  for (let i = 0; i < n; i++) {
    const g = c.createRadialGradient(0, 0, 1, 0, 0, 20 + r() * 60);
    g.addColorStop(0, `rgba(30,28,24,${0.12 + r() * 0.2})`);
    g.addColorStop(1, 'rgba(30,28,24,0)');
    c.save();
    c.translate(r() * W, r() * H);
    c.scale(1, 0.5 + r());
    c.fillStyle = g;
    c.fillRect(-80, -80, 160, 160);
    c.restore();
  }
  for (let i = 0; i < n * 3; i++) {
    c.fillStyle = `rgba(${r() < 0.5 ? '40,38,34' : '210,206,196'},${0.25 + r() * 0.3})`;
    c.beginPath();
    c.arc(r() * W, r() * H, 1 + r() * 2.5, 0, 7);
    c.fill();
  }
}
const MORTAR = 'rgba(60,56,50,.85)';
// 1 texture = 2 m × 2 m (512 px → 2.56 px/cm)
const PX = 256;
const SIDE_COL = [
  [150, 146, 140],
  [168, 150, 128],
  [132, 128, 124],
  [176, 162, 140],
  [120, 104, 92],
];
/** sidewalk bricks: herringbone field of 10×20 cm in a two-tone grey/earth mix, with a 30×30 border course */
export const sidewalkTex = cv(512, 512, (c, r) => {
  c.fillStyle = MORTAR;
  c.fillRect(0, 0, 512, 512);
  const u = PX / 10; // 10 cm in px (25.6)
  const pal = [SIDE_COL[0], SIDE_COL[1], SIDE_COL[2], SIDE_COL[0], SIDE_COL[3]];
  // herringbone: pairs of 20×10 bricks rotated 90°
  for (let y = -2; y < 22; y++)
    for (let x = -2; x < 22; x++) {
      const px = (x * 2 + (y % 2)) * u,
        py = y * u;
      const vert = (x + y) % 2 === 0;
      c.fillStyle = rgb(pal[Math.floor(r() * pal.length)], 0.12, r);
      if (vert) c.fillRect(px + 1, py + 1, u - 2, 2 * u - 2);
      else c.fillRect(px + 1, py + 1, 2 * u - 2, u - 2);
    }
  // 30 cm border course along both texture edges (v axis = across the walk)
  for (let x = 0; x < 512; x += u * 3) {
    c.fillStyle = MORTAR;
    c.fillRect(x, 0, u * 3, u * 3);
    c.fillStyle = rgb([110, 108, 104], 0.1, r);
    c.fillRect(x + 1.5, 1.5, u * 3 - 3, u * 3 - 3);
  }
  grime(c, r, 512, 512, 14);
});
/** worn patchwork for alleys / lots / gaps: concrete slabs, old 30×30 tiles and brick repairs */
export const lotTex = cv(
  512,
  512,
  (c, r) => {
    c.fillStyle = '#8a8680';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1800; i++) {
      const v = 110 + r() * 70;
      c.fillStyle = `rgba(${v},${v - 3},${v - 9},.25)`;
      c.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
    }
    const u = 64 / 10; // this texture spans 8 m (64 px/m)
    for (let k = 0; k < 2; k++) {
      // tiled patches (30×30 grey / earth) and brick repairs
      const w = (2 + Math.floor(r() * 6)) * u * 3,
        h = (2 + Math.floor(r() * 5)) * u * 3,
        x0 = Math.floor((r() * 512) / (u * 3)) * u * 3,
        y0 = Math.floor((r() * 512) / (u * 3)) * u * 3;
      const col = SIDE_COL[Math.floor(r() * SIDE_COL.length)];
      const brick = r() < 0.4;
      for (let y = y0; y < y0 + h; y += brick ? u : u * 3)
        for (let x = x0 - (brick && (y / u) % 2 ? u : 0); x < x0 + w; x += brick ? u * 2 : u * 3) {
          c.fillStyle = MORTAR;
          c.fillRect(x % 512, y % 512, brick ? u * 2 : u * 3, brick ? u : u * 3);
          c.fillStyle = rgb(col, 0.14, r);
          c.fillRect((x % 512) + 1.2, (y % 512) + 1.2, (brick ? u * 2 : u * 3) - 2.4, (brick ? u : u * 3) - 2.4);
        }
    }
    // slab joints + cracks
    c.strokeStyle = 'rgba(40,38,34,.45)';
    c.lineWidth = 1.2;
    for (let x = 0; x <= 512; x += 128) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.moveTo(0, x);
      c.lineTo(512, x);
      c.stroke();
    }
    c.lineWidth = 0.8;
    for (let i = 0; i < 12; i++) {
      let x = r() * 512,
        y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) c.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40));
      c.stroke();
    }
    // moss in joints
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(70,95,50,${0.2 + r() * 0.3})`;
      c.fillRect(Math.floor(r() * 4) * 128 - 2 + r() * 4, r() * 512, 3, 4 + r() * 20);
    }
    grime(c, r, 512, 512, 22);
  },
  31,
);
/** granite-grey curb stone, speckled, with 1 m joints */
export const curbTex = cv(
  256,
  64,
  (c, r) => {
    c.fillStyle = '#a8a69e';
    c.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 1500; i++) {
      const v = r() < 0.5 ? 60 + r() * 40 : 190 + r() * 50;
      c.fillStyle = `rgba(${v},${v},${v - 4},.5)`;
      c.fillRect(r() * 256, r() * 64, 1.2, 1.2);
    }
    c.fillStyle = 'rgba(40,40,36,.7)';
    for (let x = 0; x < 256; x += 128) c.fillRect(x, 0, 2, 64);
    grime(c, r, 256, 64, 4);
  },
  57,
);
/** yellow 導盲 warning tiles (30×30, dome studs) */
export const tactileTex = cv(
  128,
  128,
  (c, r) => {
    c.fillStyle = MORTAR;
    c.fillRect(0, 0, 128, 128);
    for (const [x, y] of [
      [0, 0],
      [64, 0],
      [0, 64],
      [64, 64],
    ]) {
      c.fillStyle = rgb([214, 176, 52], 0.15, r);
      c.fillRect(x + 1.5, y + 1.5, 61, 61);
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          c.fillStyle = 'rgba(255,230,120,.8)';
          c.beginPath();
          c.arc(x + 8 + i * 12, y + 8 + j * 12, 3.6, 0, 7);
          c.fill();
          c.fillStyle = 'rgba(120,90,20,.5)';
          c.beginPath();
          c.arc(x + 9 + i * 12, y + 9 + j * 12, 3.6, 0.2, 2.2);
          c.fill();
        }
    }
    grime(c, r, 128, 128, 3);
  },
  91,
);
/** 騎樓 floors: each lot is tiled by its own owner, so neighbouring bays use different ceramic tiles
 *  (maroon squares, beige/brown checker, grey slate, green-white mosaic). One texture = 1 m. */
const ARC_STYLES: [number, number[][], string, boolean][] = [
  [
    4,
    [
      [150, 80, 70],
      [140, 72, 64],
      [160, 92, 80],
    ],
    '#5a4038',
    false,
  ],
  [
    5,
    [
      [200, 186, 160],
      [120, 90, 70],
    ],
    '#6a5a4a',
    true,
  ],
  [
    3,
    [
      [120, 122, 120],
      [108, 110, 112],
      [134, 132, 126],
    ],
    '#3a3a3a',
    false,
  ],
  [
    10,
    [
      [210, 214, 206],
      [110, 150, 120],
      [200, 204, 196],
    ],
    '#8a8a84',
    false,
  ],
  [
    4,
    [
      [196, 190, 178],
      [186, 180, 170],
    ],
    '#7a746a',
    false,
  ],
];
export const arcadeTexes = ARC_STYLES.map(([n, cols, line, checker], k) =>
  cv(
    256,
    256,
    (c, r) => {
      const sz = 256 / n;
      c.fillStyle = line;
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const col = checker ? cols[(i + j) % 2] : cols[Math.floor(r() * cols.length)];
          c.fillStyle = rgb(col, 0.1, r);
          c.fillRect(i * sz + 1, j * sz + 1, sz - 2, sz - 2);
        }
      if (r() < 0.7) {
        // a cracked / replaced tile
        c.fillStyle = rgb([150, 146, 140], 0.2, r);
        const i = Math.floor(r() * n),
          j = Math.floor(r() * n);
        c.fillRect(i * sz + 1, j * sz + 1, sz - 2, sz - 2);
      }
      grime(c, r, 256, 256, 5);
    },
    113 + k * 17,
  ),
);
/** cast-iron manhole (circle) + square tree-pit grate */
export const manholeTex = cv(
  128,
  128,
  (c, r) => {
    c.clearRect(0, 0, 128, 128);
    c.fillStyle = '#3a3836';
    c.beginPath();
    c.arc(64, 64, 62, 0, 7);
    c.fill();
    c.strokeStyle = '#55524e';
    c.lineWidth = 3;
    for (let k = 1; k < 5; k++) {
      c.beginPath();
      c.arc(64, 64, k * 12, 0, 7);
      c.stroke();
    }
    for (let a = 0; a < 12; a++) {
      c.beginPath();
      c.moveTo(64, 64);
      c.lineTo(64 + Math.cos(a / 1.91) * 60, 64 + Math.sin(a / 1.91) * 60);
      c.stroke();
    }
    c.fillStyle = 'rgba(140,70,30,.35)';
    for (let i = 0; i < 20; i++) c.fillRect(20 + r() * 88, 20 + r() * 88, 4, 4);
  },
  5,
);
export const pitTex = cv(
  128,
  128,
  (c, r) => {
    c.fillStyle = '#4a3a2a';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(${r() < 0.3 ? '70,90,50' : '30,24,18'},.5)`;
      c.fillRect(r() * 128, r() * 128, 2, 2);
    }
    c.strokeStyle = '#6a6862';
    c.lineWidth = 8;
    c.strokeRect(4, 4, 120, 120);
  },
  9,
);
const M = (map: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness: 0.92, ...o });
export const PAVE = {
  walk: M(sidewalkTex),
  curb: M(curbTex, { roughness: 0.8 }),
  tactile: M(tactileTex, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  lot: M(lotTex),
  manhole: M(manholeTex, {
    transparent: true,
    alphaTest: 0.5,
    metalness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }),
  pit: M(pitTex, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
};
/** world-planar UVs (metres / size), so bricks continue across meshes and tiles */
export function worldUV(g: THREE.BufferGeometry, size = 2, alongAng?: number) {
  const p = g.attributes.position as THREE.BufferAttribute,
    uv = new Float32Array(p.count * 2);
  const c = alongAng === undefined ? 1 : Math.cos(alongAng),
    s = alongAng === undefined ? 0 : Math.sin(alongAng);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    uv[i * 2] = (x * c + z * s) / size;
    uv[i * 2 + 1] = (-x * s + z * c) / size + p.getY(i) / size;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export const ARCADE_MATS = arcadeTexes.map(t => M(t, { roughness: 0.55 }));
