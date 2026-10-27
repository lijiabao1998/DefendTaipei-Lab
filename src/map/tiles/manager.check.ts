// Manual check: npx tsx src/map/tiles/manager.check.ts  (not bundled; nothing imports it)
import { on } from '../../core/bus';
import { TileManager } from './manager';

let fails = 0;
const ok = (c: boolean, m: string) => (console.log(c ? '  ok  ' : '  FAIL', m), c || fails++);
const live = new Set<string>();
const ev: string[] = [];
on('tileLoaded', e => ev.push(`L${e.tx},${e.tz},${e.lod}`));
on('tileUnloaded', e => ev.push(`U${e.tx},${e.tz}`));
let reject = false;
const m = new TileManager<string>({
  load: (x, z, l) => {
    if (reject) return Promise.reject(new Error('fail'));
    const k = `${x},${z},${l}`;
    live.add(k);
    return k;
  },
  unload: (_x, _z, o) => void live.delete(o),
});
m.budget = 1e9;
m.update(0, 0);
ok(ev.includes('L0,0,0') && ev.some(s => s.endsWith(',1')) && ev.some(s => s.endsWith(',2')), 'tileLoaded lod 0/1/2');
ok(live.size === m.tiles.size, `loaded ${live.size}`);
reject = true; // every LOD change now fails asynchronously
m.update(1500, 0);
await new Promise(r => setTimeout(r, 0));
const leaked = [...live].filter(k => !m.tiles.has(k.split(',').slice(0, 2).join(',')));
ok(leaked.length === 0, `no leaked objects after failed loads (${leaked.length})`);
ok(
  ev.some(s => s.startsWith('U')),
  'tileUnloaded emitted',
);
// a tile whose first load fails, or that is dropped before its first load finishes, must not emit tileUnloaded
const m2 = new TileManager<string>({
  load: (x, z) => (x === 0 && z === 0 ? Promise.reject(new Error('fail')) : new Promise<string>(() => {})),
  unload: () => {},
});
m2.budget = 1e9;
ev.length = 0;
m2.update(0, 0);
await new Promise(r => setTimeout(r, 0));
m2.update(100000, 0); // drop all still-pending tiles
await new Promise(r => setTimeout(r, 0));
ok(ev.filter(s => s.startsWith('U')).length === 0, `no tileUnloaded for never-loaded tiles (${ev.length})`);
m2.clear();
m.clear();
ok(live.size === 0, `clear leaves ${live.size}`);
if (fails) throw new Error(`${fails} check(s) failed`);
export {};
