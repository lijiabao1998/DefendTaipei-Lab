// v22.11 PLA squad tactics: pure, deterministic helpers (no Math.random, no time) so every client derives the
// same roles / points from the same soldier ids and positions (multiplayer-friendly). main.ts owns the state.
type V2 = [number, number];
export type Role = 'suppress' | 'flankL' | 'flankR' | 'rifle';
export type SquadMember = { id: number; x: number; z: number };
export const AI = {
  squadR: 25, // soldiers in combat this close share a squad
  flankDist: 7, // flank point: this far to the side of the player
  flankT: 7, // seconds spent working round before falling back to cover
  retreatHp: 35,
  retreatT: 5,
  radioR: 45, // radio pulls idle soldiers this close to a contact
  radioCd: 6,
  grenCamp: 7, // seconds the player sits still out of sight before a grenade
  grenCd: 25,
  grenMin: 5,
  grenMax: 22,
  grenFlight: 1.0,
  grenFuse: 1.6,
  grenCore: 2.5,
  grenWound: 6,
  grenCoreDmg: 70,
  grenWoundDmg: 40,
};
/** cluster combat soldiers (single-link, radius squadR); members sorted by id → stable roles */
export function squads<T extends SquadMember>(list: T[]): T[][] {
  const left = list.slice().sort((a, b) => a.id - b.id),
    out: T[][] = [];
  while (left.length) {
    const g = [left.shift()!];
    for (let i = 0; i < g.length; i++)
      for (let j = left.length - 1; j >= 0; j--)
        if (Math.hypot(left[j].x - g[i].x, left[j].z - g[i].z) < AI.squadR) g.push(...left.splice(j, 1));
    out.push(g.sort((a, b) => a.id - b.id));
  }
  return out;
}
/** slot 0 suppresses from cover, 1/2 flank left/right, the rest are riflemen; a lone soldier just fights */
export function roleOf(slot: number, n: number): Role {
  if (n < 2) return 'rifle';
  if (slot === 0) return 'suppress';
  if (slot === 1) return 'flankL';
  if (slot === 2) return 'flankR';
  return 'rifle';
}
/** point to the side of the player (relative to the squad's line of approach), pulled a little toward the soldier */
export function flankPoint(s: V2, p: V2, side: number): V2 {
  const dx = p[0] - s[0],
    dz = p[1] - s[1],
    L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L,
    nz = dx / L;
  return [p[0] + nx * side * AI.flankDist - (dx / L) * 2, p[1] + nz * side * AI.flankDist - (dz / L) * 2];
}
export function retreatPoint(s: V2, p: V2, d = 10): V2 {
  const dx = s[0] - p[0],
    dz = s[1] - p[1],
    L = Math.hypot(dx, dz) || 1;
  return [s[0] + (dx / L) * d, s[1] + (dz / L) * d];
}
/** peek-shoot in turns: squad members alternate crouch windows (3 s cycle, offset by slot) */
export function peekUp(peekT: number, slot: number) {
  return (peekT + slot * 1.5) % 3 >= 1.5;
}
/** coordinated search of the last-known position: each member gets a different sweep of 3 points.
 *  Inside a building the points stay inside its footprint (quadrants ≈ rooms). */
export function searchPoints(
  lkp: V2,
  slot: number,
  n: number,
  bld: { minx: number; maxx: number; minz: number; maxz: number } | null,
  inside: (x: number, z: number) => boolean,
): V2[] {
  const pts: V2[] = [];
  if (bld) {
    const cx = (bld.minx + bld.maxx) / 2,
      cz = (bld.minz + bld.maxz) / 2,
      hx = (bld.maxx - bld.minx) / 4,
      hz = (bld.maxz - bld.minz) / 4;
    const Q: V2[] = [
      [cx - hx, cz - hz],
      [cx + hx, cz - hz],
      [cx + hx, cz + hz],
      [cx - hx, cz + hz],
    ];
    for (let k = 0; k < 3; k++) {
      const q = Q[(slot + k) % 4];
      pts.push(inside(q[0], q[1]) ? q : lkp);
    }
    return pts;
  }
  const a0 = (slot / Math.max(1, n)) * Math.PI * 2 + 0.7;
  for (let k = 0; k < 3; k++) {
    const a = a0 + k * 0.9,
      r = 4 + k * 2.5;
    pts.push([lkp[0] + Math.cos(a) * r, lkp[1] + Math.sin(a) * r]);
  }
  return pts;
}
export function grenadeDmg(d: number) {
  if (d < AI.grenCore) return AI.grenCoreDmg * (1 - 0.3 * (d / AI.grenCore));
  if (d < AI.grenWound) return AI.grenWoundDmg * ((AI.grenWound - d) / (AI.grenWound - AI.grenCore)) ** 2;
  return 0;
}
