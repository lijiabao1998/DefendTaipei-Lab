// Experimental ownership token for the existing Nav grid. Not used by main or old markSeg API.
import type { Nav, V2 } from '../../systems/nav';

/** Prepare exact cells with Nav's current segment sampling, without publishing.
 * Supports synchronous publication only. All owners in a future integration must
 * honor receipts; mixing with unmatched legacy markSeg(-1) is NOT made safe here.
 */
export function prepareNavOwnership(nav: Nav, a: V2, b: V2) {
  if (![...a, ...b, nav.cs].every(Number.isFinite) || nav.cs <= 0) throw new Error('invalid navigation segment');
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(length / (nav.cs * 0.3)));
  if (!Number.isSafeInteger(n)) throw new Error('navigation segment sampling exceeds safe range');
  const cells = new Set<number>();
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const i = nav.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (i >= 0) cells.add(i);
  }
  const block = nav.block;
  let state: 'prepared' | 'active' | 'released' = 'prepared';
  return {
    get state() {
      return state;
    },
    publish() {
      if (state !== 'prepared') throw new Error(`cannot publish navigation ownership in ${state}`);
      if (nav.block !== block) throw new Error('navigation grid changed after preparation');
      // Uint8Array would wrap 255 -> 0. Reject the whole operation before any change.
      for (const i of cells) if (block[i] === 255) throw new Error('navigation occupancy capacity exceeded');
      for (const i of cells) block[i]++;
      state = 'active';
    },
    release() {
      if (state === 'released') return;
      if (state === 'active') {
        // An unmatched external legacy decrement invalidates ownership; do not hide it.
        for (const i of cells) if (block[i] === 0) throw new Error('navigation ownership was externally invalidated');
        for (const i of cells) block[i]--;
      }
      state = 'released';
    },
  };
}
