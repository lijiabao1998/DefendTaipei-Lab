// Fetch Wanhua/Ximending OSM data via Overpass and write processed JSON.
// Data © OpenStreetMap contributors, ODbL.
import fs from 'node:fs';
const bbox = [25.0365, 121.4975, 25.0455, 121.5085]; // S,W,N,E
const q = `[out:json][timeout:60];(way["building"](${bbox});way["highway"](${bbox}););out geom;`;
const urls = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let j;
for (const u of urls) {
  try {
    const r = await fetch(u, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DefendTaipei-Lab' },
    });
    if (r.ok) {
      j = await r.json();
      break;
    }
    console.error(u, r.status);
  } catch (e) {
    console.error(u, e.message);
  }
}
if (!j) process.exit(1);
const lat0 = (bbox[0] + bbox[2]) / 2,
  lon0 = (bbox[1] + bbox[3]) / 2;
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180),
  ky = 110540;
const P = g => [+((g.lon - lon0) * kx).toFixed(1), +(-(g.lat - lat0) * ky).toFixed(1)];
const buildings = [],
  roads = [];
for (const w of j.elements) {
  if (!w.geometry) continue;
  const pts = w.geometry.map(P);
  if (w.tags.building) {
    if (pts.length < 4) continue;
    const lv = parseInt(w.tags['building:levels']) || 0;
    buildings.push({ p: pts.slice(0, -1), l: lv, n: w.tags.name || '', s: w.tags.shop || w.tags.amenity || '' });
  } else if (w.tags.highway) {
    roads.push({ p: pts, t: w.tags.highway, n: w.tags.name || '' });
  }
}
fs.writeFileSync(
  'public/data/wanhua.json',
  JSON.stringify({ attribution: '© OpenStreetMap contributors (ODbL)', bbox, buildings, roads }),
);
console.log('buildings', buildings.length, 'roads', roads.length);
