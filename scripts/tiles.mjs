// Offline preprocessing: split OSM road graph into 200 m tiles (segments + junction nodes) for streamed road detail.
import fs from 'fs';
const T = 200;
const d = JSON.parse(fs.readFileSync('public/data/wanhua.json', 'utf8'));
const W = {
  trunk: 18,
  primary: 16,
  secondary: 12,
  tertiary: 9,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 6,
  footway: 2.5,
  path: 2,
  steps: 2,
  cycleway: 2.5,
};
const CL = {
  trunk: 'main',
  primary: 'main',
  secondary: 'main',
  tertiary: 'street',
  residential: 'lane',
  unclassified: 'lane',
  living_street: 'alley',
  service: 'alley',
  pedestrian: 'ped',
  footway: 'foot',
  path: 'foot',
  steps: 'foot',
  cycleway: 'foot',
};
const nodes = new Map();
const tiles = new Map();
const tk = (x, z) => Math.floor(x / T) + '_' + Math.floor(z / T);
const tile = k => {
  if (!tiles.has(k)) {
    const [tx, tz] = k.split('_').map(Number);
    tiles.set(k, { tx, tz, seed: ((tx * 73856093) ^ (tz * 19349663)) >>> 0, segs: [], nodes: [], clip: [] });
  }
  return tiles.get(k);
};
// v19.1: collect segments first so overlapping OSM ways (dual carriageways, links, duplicates) can be detected
const S = [];
d.roads.forEach((r, ri) => {
  const t = r.t.replace('_link', '');
  const w = W[t] ?? 3,
    c = CL[t] ?? 'foot';
  for (let i = 0; i < r.p.length - 1; i++) {
    const [ax, az] = r.p[i],
      [bx, bz] = r.p[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    S.push({ ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L, w, c, ri, n: r.n || '', f: 0 });
  }
});
const marked = s => s.c === 'main' || s.c === 'street';
const M = S.filter(marked).sort((a, b) => b.w - a.w || b.L - a.L);
let dual = 0,
  dup = 0;
for (let i = 0; i < M.length; i++) {
  const s = M[i];
  if (s.f === 2) continue;
  const mx = (s.ax + s.bx) / 2,
    mz = (s.az + s.bz) / 2;
  for (let j = 0; j < M.length; j++) {
    if (i === j) continue;
    const o = M[j];
    if (o.ri === s.ri || o.f === 2) continue;
    if (Math.abs(s.ux * o.ux + s.uz * o.uz) < 0.94) continue; // not parallel (~20 deg)
    const rx = mx - o.ax,
      rz = mz - o.az,
      t = rx * o.ux + rz * o.uz;
    if (t < -2 || t > o.L + 2) continue;
    const lat = rx * -o.uz + rz * o.ux;
    const al = Math.abs(lat);
    if (al > ((s.w + o.w) / 2) * 0.95) continue;
    if (al < Math.max(2.5, Math.min(s.w, o.w) * 0.35) && j < i) {
      s.f = 2;
      dup++;
      break;
    } // same carriageway drawn twice: keep the wider/earlier one only
    if (al >= Math.max(2.5, Math.min(s.w, o.w) * 0.35)) {
      // dual carriageway: each half keeps only its outer edge, partner side gets a single yellow line
      const side = Math.sign(lat * (s.ux * o.ux + s.uz * o.uz)) || 1; // outer side in s's own normal frame
      if (!s.f) {
        s.f = side > 0 ? 3 : 4;
        s.ow = Math.min(s.w, al * 2);
        dual++;
      }
    }
  }
}
S.forEach(s =>
  tile(tk((s.ax + s.bx) / 2, (s.az + s.bz) / 2)).segs.push([
    +s.ax.toFixed(2),
    +s.az.toFixed(2),
    +s.bx.toFixed(2),
    +s.bz.toFixed(2),
    s.w,
    s.c,
    s.ri,
    s.n,
    s.f,
    +(s.ow || s.w).toFixed(1),
  ]),
);
// junctions from vehicle roads only (footways/sidewalks/steps never make a junction)
const q = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
d.roads.forEach((r, ri) => {
  const t = r.t.replace('_link', '');
  const w = W[t] ?? 3;
  if ((CL[t] ?? 'foot') === 'foot' || CL[t] === 'ped' || w < 4) return;
  r.p.forEach((p, i) => {
    const k = q(p);
    const n = nodes.get(k) || { x: p[0], z: p[1], arms: [], w: 0 };
    n.w = Math.max(n.w, w);
    for (const j of [i - 1, i + 1])
      if (r.p[j]) {
        const dx = r.p[j][0] - p[0],
          dz = r.p[j][1] - p[1],
          L = Math.hypot(dx, dz);
        if (L > 0.5) n.arms.push([dx / L, dz / L, w, ri]);
      }
    nodes.set(k, n);
  });
});
const J = [...nodes.values()].filter(
  n => (n.arms.length >= 3 || new Set(n.arms.map(a => a[3])).size >= 2) && new Set(n.arms.map(a => a[3])).size >= 2,
);
// cluster nearby junction nodes (dual carriageway crossings make 2-4 nodes) into one junction
const used = new Set();
let clusters = 0;
for (const n of J.sort((a, b) => b.w - a.w)) {
  if (used.has(n)) continue;
  const C = [n];
  used.add(n);
  for (let k = 0; k < C.length; k++)
    for (const m of J)
      if (!used.has(m) && Math.hypot(m.x - C[k].x, m.z - C[k].z) < Math.max(C[k].w, m.w) * 0.9 + 2) {
        used.add(m);
        C.push(m);
      }
  const x = C.reduce((a, c) => a + c.x, 0) / C.length,
    z = C.reduce((a, c) => a + c.z, 0) / C.length;
  const rad = Math.max(...C.map(c => Math.hypot(c.x - x, c.z - z) + c.w / 2));
  const w = Math.max(...C.map(c => c.w));
  const arms = [];
  for (const c of C)
    for (const a of c.arms) {
      // drop arms that lead to another node of the same cluster; merge arms within ~30 deg
      if (
        C.some(
          o =>
            o !== c &&
            Math.hypot(o.x - c.x, o.z - c.z) > 0.5 &&
            ((o.x - c.x) * a[0] + (o.z - c.z) * a[1]) / Math.hypot(o.x - c.x, o.z - c.z) > 0.97,
        )
      )
        continue;
      const e = arms.find(b => b[0] * a[0] + b[1] * a[1] > 0.86);
      if (e) {
        if (a[2] > e[2]) {
          e[2] = a[2];
        }
        continue;
      }
      arms.push([a[0], a[1], a[2]]);
    }
  clusters++;
  tile(tk(x, z)).nodes.push([
    +x.toFixed(2),
    +z.toFixed(2),
    +w.toFixed(1),
    arms.map(a => [+a[0].toFixed(3), +a[1].toFixed(3), a[2]]),
    +rad.toFixed(2),
  ]);
  // clip circle (markings stop before zebra) registered in every tile it can touch
  const R = rad + 6;
  for (let gx = Math.floor((x - R - 30) / T); gx <= Math.floor((x + R + 30) / T); gx++)
    for (let gz = Math.floor((z - R - 30) / T); gz <= Math.floor((z + R + 30) / T); gz++) {
      const kk = gx + '_' + gz;
      if (tiles.has(kk)) tiles.get(kk).clip.push([+x.toFixed(2), +z.toFixed(2), +R.toFixed(2)]);
    }
}
console.log('dual', dual, 'dup', dup, 'raw junction nodes', J.length, '-> clusters', clusters);
for (const f of fs.readdirSync('public/data/tiles')) fs.unlinkSync('public/data/tiles/' + f);
const index = { size: T, tiles: [] };
for (const [k, t] of tiles) {
  fs.writeFileSync(`public/data/tiles/${k}.json`, JSON.stringify(t));
  index.tiles.push(k);
}
fs.writeFileSync('public/data/tiles/index.json', JSON.stringify(index));
console.log(
  'tiles',
  tiles.size,
  'segs',
  [...tiles.values()].reduce((a, t) => a + t.segs.length, 0),
  'junctions',
  [...tiles.values()].reduce((a, t) => a + t.nodes.length, 0),
);
