// 256 m × 256 m tile grid for chunked map streaming (foundation only, not wired in yet).
// World units are metres on the x/z plane, same as the rest of src/map/.
export const TILE = 256;
export type TileKey = string; // "tx,tz"
export const tileOf = (x: number, z: number): [number, number] => [Math.floor(x / TILE), Math.floor(z / TILE)];
export const keyOf = (tx: number, tz: number): TileKey => `${tx},${tz}`;
export const parseKey = (k: TileKey): [number, number] => {
  const [a, b] = k.split(',');
  return [Number(a), Number(b)];
};
export const tileBounds = (tx: number, tz: number) => ({
  minx: tx * TILE,
  minz: tz * TILE,
  maxx: (tx + 1) * TILE,
  maxz: (tz + 1) * TILE,
});
/** distance (m) from a point to the nearest edge of a tile (0 inside) */
export function tileDist(tx: number, tz: number, x: number, z: number) {
  const b = tileBounds(tx, tz);
  const dx = Math.max(b.minx - x, 0, x - b.maxx);
  const dz = Math.max(b.minz - z, 0, z - b.maxz);
  return Math.hypot(dx, dz);
}
