// Offline preprocessing (v21): whole 萬華區 OSM extract -> 200 m tiles for streamed buildings / base roads.
// Input: Overpass JSON (out geom) of admin relation 萬華區. Usage: node scripts/district.mjs /path/raw.json
// Same local projection as public/data/wanhua.json so the core map lines up. Data © OpenStreetMap contributors, ODbL.
import fs from 'fs';
const T = 200;
const raw = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/osm/wh.json', 'utf8'));
const lat0 = (25.0365 + 25.0455) / 2,
  lon0 = (121.4975 + 121.5085) / 2;
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180),
  ky = 110540;
const P = g => [Math.round((g.lon - lon0) * kx * 10) / 10, Math.round(-(g.lat - lat0) * ky * 10) / 10];
const core = {
  minx: 25.0 - 25,
  x0: (121.4975 - lon0) * kx,
  x1: (121.5085 - lon0) * kx,
  z0: -(25.0455 - lat0) * ky,
  z1: -(25.0365 - lat0) * ky,
};
const inCore = (x, z) => x > core.x0 && x < core.x1 && z > core.z0 && z < core.z1;
const tk = (x, z) => Math.floor(x / T) + '_' + Math.floor(z / T);
const tiles = new Map();
const tile = k => tiles.get(k) || tiles.set(k, { b: [], r: [] }).get(k);
const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
// closed rings: simplify each half so the identical first/last point does not collapse the ring
const simpR = (p, e) => {
  if (p.length < 8) return p;
  const h = p.length >> 1;
  return [...simp(p.slice(0, h + 1), e).slice(0, -1), ...simp(p.slice(h), e)];
};
// Douglas-Peucker for map overlay lines
function simp(p, e) {
  if (p.length < 3) return p;
  let m = 0,
    i0 = 0;
  const [a, b] = [p[0], p[p.length - 1]];
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    L = Math.hypot(dx, dz) || 1;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs((p[i][0] - a[0]) * dz - (p[i][1] - a[1]) * dx) / L;
    if (d > m) ((m = d), (i0 = i));
  }
  return m > e ? [...simp(p.slice(0, i0 + 1), e).slice(0, -1), ...simp(p.slice(i0), e)] : [a, b];
}
const out = {
  attribution: '© OpenStreetMap contributors (ODbL 1.0)',
  T,
  boundary: [],
  landmarks: [],
  water: [],
  park: [],
  landuse: [],
  rail: [],
  mapRoads: [],
  tiles: {},
};
const fullRoads = [];
let nb = 0,
  nr = 0;
const LM = [
  [/^艋舺龍山寺|^龍山寺/, 'temple', '龍山寺'],
  [/西門紅樓/, 'redhouse', '西門紅樓'],
  [/剝皮寮/, 'bopiliao', '剝皮寮'],
];
for (const e of raw.elements) {
  const t = e.tags || {};
  if (e.type === 'relation') {
    // outer rings of the admin boundary (for map + world clamp)
    // join outer member ways into closed rings
    const ws = (e.members || []).filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P));
    const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
    while (ws.length) {
      let ring = ws.shift();
      for (let grow = true; grow && !eq(ring[0], ring[ring.length - 1]);) {
        grow = false;
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i],
            end = ring[ring.length - 1];
          if (eq(w[0], end)) ring = ring.concat(w.slice(1));
          else if (eq(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse());
          else continue;
          ws.splice(i, 1);
          grow = true;
          break;
        }
      }
      if (ring.length > 10) {
        const h = ring.length >> 1;
        out.boundary.push([...simp(ring.slice(0, h + 1), 4).slice(0, -1), ...simp(ring.slice(h), 4)]);
      }
    }
    continue;
  }
  if (!e.geometry) continue;
  const p = e.geometry.map(P);
  const name = t.name || '';
  for (const [re, kind, n] of LM)
    if (re.test(name) && !out.landmarks.some(l => l.kind === kind)) {
      const c = cen(p);
      out.landmarks.push({ kind, n, x: Math.round(c[0]), z: Math.round(c[1]) });
    }
  if (t.building) {
    if (p.length < 4) continue;
    const c = cen(p);
    if (inCore(c[0], c[1])) continue; // core blocks come from wanhua.json
    const lv = +t['building:levels'] || 0;
    tile(tk(c[0], c[1])).b.push({
      p: p.slice(0, -1),
      l: lv,
      n: name || undefined,
      k: t.building !== 'yes' ? t.building : undefined,
      s: t.shop || t.amenity || undefined,
    });
    nb++;
  } else if (t.highway) {
    if (/^(motorway|motorway_link|construction|proposed|platform|corridor|elevator|bus_stop)$/.test(t.highway))
      continue;
    if (t.tunnel === 'yes' || t.layer < 0) continue;
    if (
      /^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)/.test(t.highway) &&
      !p.every(q => inCore(q[0], q[1]))
    )
      out.mapRoads.push({
        t: t.highway.replace('_link', ''),
        n: name || undefined,
        p: simp(p, 2).map(q => [Math.round(q[0]), Math.round(q[1])]),
      });
    {
      const c = cen(p);
      if (!p.every(q => inCore(q[0], q[1]))) fullRoads.push({ t: t.highway, p, n: name || undefined });
    }
    // split polyline into per-tile runs by segment midpoint
    let run = null,
      rk = null;
    for (let i = 0; i < p.length - 1; i++) {
      const k = tk((p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      if (k !== rk) {
        if (run) tile(rk).r.push(run);
        run = { t: t.highway, p: [p[i]], n: name || undefined, b: t.bridge ? 1 : undefined };
        rk = k;
      }
      run.p.push(p[i + 1]);
    }
    if (run) (tile(rk).r.push(run), nr++);
  } else if (t.railway) {
    if (t.tunnel !== 'yes' && /rail|light_rail/.test(t.railway)) out.rail.push(simp(p, 3));
  } else if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) out.water.push(simpR(p, 3));
  else if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.leisure === 'pitch')
    out.park.push({ n: name || undefined, p: simpR(p, 2) });
  else if (t.landuse) out.landuse.push({ t: t.landuse, p: simpR(p, 3) });
}
// ---- infill: OSM building coverage in southern 萬華 is sparse, so fill empty road frontage with
// generated walk-up footprints (deterministic, flagged g:1). Checked against roads, OSM buildings, water, parks.
const pip = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const RW = {
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
const G = 20,
  segG = new Map(),
  bG = new Map();
const gk = (x, z) => Math.floor(x / G) + ',' + Math.floor(z / G);
const put = (m, x0, z0, x1, z1, v) => {
  for (let x = Math.floor(x0 / G); x <= Math.floor(x1 / G); x++)
    for (let z = Math.floor(z0 / G); z <= Math.floor(z1 / G); z++)
      (m.get(x + ',' + z) || m.set(x + ',' + z, []).get(x + ',' + z)).push(v);
};
const allR = [...tiles.values()].flatMap(t => t.r);
for (const r of allR)
  for (let i = 0; i < r.p.length - 1; i++) {
    const [a, b] = [r.p[i], r.p[i + 1]];
    put(segG, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), [
      a,
      b,
      (RW[r.t] || 4) / 2,
    ]);
  }
const core0 = JSON.parse(fs.readFileSync('public/data/wanhua.json', 'utf8'));
const polys = [
  ...[...tiles.values()].flatMap(t => t.b.map(b => b.p)),
  ...core0.buildings.map(b => b.pts || b.p).filter(Boolean),
];
for (const p of polys) {
  const xs = p.map(q => q[0]),
    zs = p.map(q => q[1]);
  put(bG, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), p);
}
const blockers = [...out.water, ...out.park.map(q => q.p)];
// river edges of the boundary (outward normal west/south = 淡水河・新店溪 centre line); half-width limited so the
// water never covers a mapped building or road
out.river = [];
{
  const feats = [
    ...polys.flat(),
    ...allR.flatMap(r => (r.b || /^(footway|path|steps|cycleway|motorway)/.test(r.t) ? [] : r.p)),
  ];
  for (const b of out.boundary)
    for (let i = 0; i < b.length; i++) {
      const a = b[i],
        c = b[(i + 1) % b.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 1) continue;
      let nx = (c[1] - a[1]) / L,
        nz = -(c[0] - a[0]) / L;
      const mx = (a[0] + c[0]) / 2,
        mz = (a[1] + c[1]) / 2;
      if (pip([mx + nx * 3, mz + nz * 3], b)) ((nx = -nx), (nz = -nz));
      if (!((nx < -0.4 && mx < -500) || (nz > 0.5 && mz > 1800))) continue;
      let w = 150;
      const dx = c[0] - a[0],
        dz = c[1] - a[1];
      for (const q of feats) {
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (L * L)));
        const d = Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t);
        if (d < w + 15 && pip(q, b)) w = Math.max(20, d - 15);
      }
      out.river.push([a[0], a[1], c[0], c[1], Math.round(w), Math.round(-nx * 100) / 100, Math.round(-nz * 100) / 100]);
    }
}
const nearRiver = (x, z) =>
  out.river.some(([ax, az, bx, bz, w]) => {
    const dx = bx - ax,
      dz = bz - az,
      l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * t, z - az - dz * t) < w + 8;
  });
function clear(x, z, r) {
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const [a, b, w] of segG.get(Math.floor(x / G) + i + ',' + (Math.floor(z / G) + j)) || []) {
        const dx = b[0] - a[0],
          dz = b[1] - a[1],
          l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
        if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w + r) return false;
      }
  for (const p of bG.get(gk(x, z)) || []) if (pip([x, z], p)) return false;
  return true;
}
let rs = 12345;
const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
let ng = 0;
for (const r of allR) {
  if (!/^(residential|tertiary|secondary|unclassified|living_street|primary)$/.test(r.t) || r.b) continue;
  const w = RW[r.t] / 2;
  for (let i = 0; i < r.p.length - 1; i++) {
    const [a, b] = [r.p[i], r.p[i + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 10) continue;
    const ux = (b[0] - a[0]) / L,
      uz = (b[1] - a[1]) / L;
    for (const sd of [1, -1]) {
      const nx = -uz * sd,
        nz = ux * sd;
      for (let s = 5; s + 5 < L; s += 9 + Math.floor(rnd() * 3)) {
        const wd = 7 + rnd() * 3,
          dp = 9 + rnd() * 6,
          off = w + 1.6;
        const cx = a[0] + ux * s + nx * (off + dp / 2),
          cz = a[1] + uz * s + nz * (off + dp / 2);
        if (inCore(cx, cz)) continue;
        if (!out.boundary.some(bp => pip([cx, cz], bp))) continue;
        if (blockers.some(bp => pip([cx, cz], bp)) || nearRiver(cx, cz)) continue;
        // corners + centre must be clear of roads/buildings
        const cs = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([i, j]) => [cx + ux * (wd / 2) * i + nx * (dp / 2) * j, cz + uz * (wd / 2) * i + nz * (dp / 2) * j]);
        if (!clear(cx, cz, 1) || !cs.every(q => clear(q[0], q[1], 0.3))) continue;
        const pp = cs.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
        tile(tk(cx, cz)).b.push({ p: pp, l: 3 + Math.floor(rnd() * 3), g: 1 });
        const xs = pp.map(q => q[0]),
          zs = pp.map(q => q[1]);
        put(bG, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), pp);
        ng++;
      }
    }
  }
}
out.landmarks.push({ kind: 'bopiliao', n: '剝皮寮', x: -160, z: 445 });
out.generated = ng;
fs.writeFileSync('/tmp/osm/district-roads.json', JSON.stringify(fullRoads));
fs.rmSync('public/data/district', { recursive: true, force: true });
fs.mkdirSync('public/data/district', { recursive: true });
for (const [k, v] of tiles) {
  fs.writeFileSync(`public/data/district/${k}.json`, JSON.stringify(v));
  out.tiles[k] = [v.b.length, v.r.length];
}
let mx = [1e9, 1e9, -1e9, -1e9];
for (const r of out.boundary)
  for (const [x, z] of r) mx = [Math.min(mx[0], x), Math.min(mx[1], z), Math.max(mx[2], x), Math.max(mx[3], z)];
out.bbox = mx.map(Math.round);
// paper-map extras (loaded lazily by the M map, not part of the initial load)
const mapB = [...tiles.values()].flatMap(t => t.b.map(b => b.p.flat().map(Math.round)));
fs.writeFileSync('public/data/district/map.json', JSON.stringify({ b: mapB, r: out.mapRoads }));
delete out.mapRoads;
fs.writeFileSync('public/data/district/index.json', JSON.stringify(out));
console.log({
  generated: ng,
  tiles: tiles.size,
  buildings: nb,
  roads: nr,
  landmarks: out.landmarks,
  bbox: out.bbox,
  water: out.water.length,
  park: out.park.length,
  indexKB: Math.round(fs.statSync('public/data/district/index.json').size / 1024),
});
