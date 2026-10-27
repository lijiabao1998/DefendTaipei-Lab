// Tile manager: keeps tiles around the player loaded at the right LOD, unloads the rest.
// Off by default (?maptiles=1). Renderer-agnostic: the caller supplies load/unload hooks, so this file
// imports nothing outside src/map/. Nothing in the game calls it yet, so default behaviour is unchanged.
import { TILE, keyOf, parseKey, tileDist, tileOf, type TileKey } from './grid';
import { LOD_DROP, LOD_HYST, lodFor, type Lod } from './lod';

export const MAP_TILES_ON =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('maptiles') === '1';

export interface TileHooks<T> {
  /** build/load tile content at a LOD; may be async (fetch a baked tile file) */
  load: (tx: number, tz: number, lod: Lod) => T | Promise<T>;
  unload: (tx: number, tz: number, obj: T) => void;
  /** optional: tile has content (skip empty tiles) */
  has?: (tx: number, tz: number) => boolean;
  /** optional notifications, e.g. to forward to core/bus.ts later */
  onLoaded?: (tx: number, tz: number, lod: Lod) => void;
  onUnloaded?: (tx: number, tz: number) => void;
}
type Entry<T> = { lod: Lod; obj?: T; gen: number };

export class TileManager<T> {
  tiles = new Map<TileKey, Entry<T>>();
  /** max load starts per update, to spread work across frames */
  budget = 4;
  private gen = 0;
  constructor(public hooks: TileHooks<T>) {}

  /** call each frame (or every few) with the player position */
  update(x: number, z: number) {
    const [cx, cz] = tileOf(x, z);
    const r = Math.ceil((LOD_DROP + LOD_HYST) / TILE);
    const want: { tx: number; tz: number; lod: Lod; d: number }[] = [];
    const seen = new Set<TileKey>();
    for (let tz = cz - r; tz <= cz + r; tz++)
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (this.hooks.has && !this.hooks.has(tx, tz)) continue;
        const k = keyOf(tx, tz);
        const d = tileDist(tx, tz, x, z);
        const lod = lodFor(d, this.tiles.get(k)?.lod);
        if (!lod) continue;
        seen.add(k);
        want.push({ tx, tz, lod, d });
      }
    for (const [k, e] of this.tiles)
      if (!seen.has(k)) {
        const [tx, tz] = parseKey(k);
        this.drop(k, tx, tz, e);
      }
    want.sort((a, b) => a.d - b.d); // nearest first
    let n = 0;
    for (const w of want) {
      const k = keyOf(w.tx, w.tz);
      const e = this.tiles.get(k);
      if (e && e.lod === w.lod) continue;
      if (n++ >= this.budget) break;
      this.start(k, w.tx, w.tz, w.lod, e);
    }
  }

  private start(k: TileKey, tx: number, tz: number, lod: Lod, old?: Entry<T>) {
    const gen = ++this.gen;
    const e: Entry<T> = { lod, gen, obj: old?.obj }; // keep old LOD visible until the new one is ready
    this.tiles.set(k, e);
    const done = (obj: T) => {
      if (this.tiles.get(k) !== e || e.gen !== gen) return this.hooks.unload(tx, tz, obj); // stale
      if (e.obj !== undefined) this.hooks.unload(tx, tz, e.obj);
      e.obj = obj;
      this.hooks.onLoaded?.(tx, tz, lod);
    };
    const r = this.hooks.load(tx, tz, lod);
    if (r instanceof Promise) r.then(done, () => this.tiles.get(k) === e && this.tiles.delete(k));
    else done(r);
  }

  private drop(k: TileKey, tx: number, tz: number, e: Entry<T>) {
    this.tiles.delete(k);
    if (e.obj !== undefined) this.hooks.unload(tx, tz, e.obj);
    this.hooks.onUnloaded?.(tx, tz);
  }

  clear() {
    for (const [k, e] of this.tiles) {
      const [tx, tz] = parseKey(k);
      this.drop(k, tx, tz, e);
    }
  }
}
