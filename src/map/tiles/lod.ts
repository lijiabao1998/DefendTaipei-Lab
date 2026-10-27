// Three LOD levels for streamed tiles.
//  near (~0–500 m): full buildings and roads (current renderer)
//  mid  (~500 m–2 km): extruded boxes, merged road mesh
//  far  (>2 km): one low-poly terrain mesh + skyline silhouette per tile
export type Lod = 'near' | 'mid' | 'far';
export const LOD_NEAR = 500;
export const LOD_MID = 2000;
/** drop tiles beyond this (m) */
export const LOD_DROP = 4000;
/** hysteresis (m) so tiles don't flicker between levels at a boundary */
export const LOD_HYST = 32;
export function lodFor(dist: number, prev?: Lod): Lod | null {
  const h = prev ? LOD_HYST : 0;
  const near = prev === 'near' ? LOD_NEAR + h : LOD_NEAR - (prev ? h : 0);
  const mid = prev === 'mid' || prev === 'near' ? LOD_MID + h : LOD_MID - (prev ? h : 0);
  if (dist <= near) return 'near';
  if (dist <= mid) return 'mid';
  if (dist <= LOD_DROP + h) return 'far';
  return null;
}
