// Offline preprocessing: split OSM road graph into 200 m tiles (segments + junction nodes) for streamed road detail.
import fs from 'fs';
const T = 200; const d = JSON.parse(fs.readFileSync('public/data/wanhua.json', 'utf8'));
const W = { trunk: 18, primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5, service: 4, pedestrian: 6, footway: 2.5, path: 2, steps: 2, cycleway: 2.5 };
const CL = { trunk: 'main', primary: 'main', secondary: 'main', tertiary: 'street', residential: 'lane', unclassified: 'lane', living_street: 'alley', service: 'alley', pedestrian: 'ped', footway: 'foot', path: 'foot', steps: 'foot', cycleway: 'foot' };
const q = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
const nodes = new Map(); const tiles = new Map(); const tk = (x, z) => Math.floor(x / T) + '_' + Math.floor(z / T);
const tile = k => { if (!tiles.has(k)) { const [tx, tz] = k.split('_').map(Number); tiles.set(k, { tx, tz, seed: ((tx * 73856093) ^ (tz * 19349663)) >>> 0, segs: [], nodes: [] }); } return tiles.get(k); };
d.roads.forEach((r, ri) => { const t = r.t.replace('_link', ''); const w = W[t] ?? 3, c = CL[t] ?? 'foot';
  r.p.forEach((p, i) => { const k = q(p); const n = nodes.get(k) || { x: p[0], z: p[1], arms: [], w: 0 }; n.w = Math.max(n.w, w);
    for (const j of [i - 1, i + 1]) if (r.p[j]) { const dx = r.p[j][0] - p[0], dz = r.p[j][1] - p[1], L = Math.hypot(dx, dz); if (L > 0.5) n.arms.push([+(dx / L).toFixed(3), +(dz / L).toFixed(3), w, ri]); }
    nodes.set(k, n); });
  for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; if (Math.hypot(bx - ax, bz - az) < 0.5) continue;
    tile(tk((ax + bx) / 2, (az + bz) / 2)).segs.push([+ax.toFixed(2), +az.toFixed(2), +bx.toFixed(2), +bz.toFixed(2), w, c, ri, r.n || '']); } });
for (const n of nodes.values()) { const roadsAt = new Set(n.arms.map(a => a[3])); if (n.arms.length < 3 && roadsAt.size < 2) continue; if (n.w < 4) continue;
  tile(tk(n.x, n.z)).nodes.push([+n.x.toFixed(2), +n.z.toFixed(2), n.w, n.arms.map(a => [a[0], a[1], a[2]])]); }
for (const f of fs.readdirSync('public/data/tiles')) fs.unlinkSync('public/data/tiles/' + f);
const index = { size: T, tiles: [] };
for (const [k, t] of tiles) { fs.writeFileSync(`public/data/tiles/${k}.json`, JSON.stringify(t)); index.tiles.push(k); }
fs.writeFileSync('public/data/tiles/index.json', JSON.stringify(index));
console.log('tiles', tiles.size, 'segs', [...tiles.values()].reduce((a, t) => a + t.segs.length, 0), 'junctions', [...tiles.values()].reduce((a, t) => a + t.nodes.length, 0));
