// Experimental ownership bridge only: never instantiates a renderer or changes the live map.
// Existing persisted state uses 200m source keys and must not be renamed to 256m target keys.
import { tileBounds } from './grid';

/** Existing source tile cells overlapping a target cell, using half-open cell bounds.
 * This maps ownership cells, NOT clipped geometry: source features can extend beyond a cell.
 */
export function legacyKeys(tx: number, tz: number, size: number, available: ReadonlySet<string>): string[] {
  if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(tz) || !Number.isFinite(size) || size <= 0)
    throw new Error('invalid tile coordinates or source size');
  const b = tileBounds(tx, tz);
  const keys: string[] = [];
  for (let z = Math.floor(b.minz / size); z < Math.ceil(b.maxz / size); z++)
    for (let x = Math.floor(b.minx / size); x < Math.ceil(b.maxx / size); x++) {
      const key = `${x}_${z}`;
      if (available.has(key)) keys.push(key);
    }
  return keys;
}

/** Shared source ownership: adjacent 256m cells may require the same original source.
 * Keep district and road pools separate. load must return a complete owned resource;
 * dispose removes its objects/colliders exactly once. A failed load must clean its partial work.
 * This does not call existing private District/RoadTiles builders and is not gameplay integration.
 */
export class LegacyLeases<T> {
  private entries = new Map<string, { refs: number; ready: Promise<T>; value?: T; settled: boolean }>();
  private closed = false;
  constructor(
    private load: (key: string) => T | Promise<T>,
    private dispose: (key: string, value: T) => void,
  ) {}

  acquire(key: string): { ready: Promise<T>; release: () => void } {
    if (this.closed) throw new Error('legacy lease pool is closed');
    let entry = this.entries.get(key);
    if (!entry) {
      const e = {
        refs: 0,
        settled: false,
        ready: undefined as unknown as Promise<T>,
        value: undefined as T | undefined,
      };
      this.entries.set(key, e);
      e.ready = Promise.resolve()
        .then(() => this.load(key))
        .then(
          value => {
            e.value = value;
            e.settled = true;
            if (e.refs === 0) {
              this.entries.delete(key);
              this.dispose(key, value);
            }
            return value;
          },
          error => {
            if (this.entries.get(key) === e) this.entries.delete(key);
            throw error;
          },
        );
      entry = e;
    }
    entry.refs++;
    const owned = entry;
    let released = false;
    return {
      ready: owned.ready,
      release: () => {
        if (released) return;
        released = true;
        if (--owned.refs === 0 && owned.settled) {
          if (this.entries.get(key) === owned) this.entries.delete(key);
          this.dispose(key, owned.value as T);
        }
      },
    };
  }

  /** Stop new acquisitions. Existing leases retain ownership until their callers release them. */
  close() {
    this.closed = true;
  }
}
