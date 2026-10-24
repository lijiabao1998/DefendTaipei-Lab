// Grid navigation (1m cells) with A* (8-dir, no corner cutting) + string pulling.
export type V2 = [number, number];
export class Nav {
  w: number; h: number; ox: number; oz: number; cs: number; block: Uint8Array; g: Float32Array; from: Int32Array; stamp: Uint32Array; closed: Uint32Array; cur = 1;
  constructor(minx: number, minz: number, maxx: number, maxz: number, cs = 1) {
    this.cs = cs; this.ox = minx; this.oz = minz; this.w = Math.ceil((maxx - minx) / cs) + 1; this.h = Math.ceil((maxz - minz) / cs) + 1; const n = this.w * this.h;
    this.block = new Uint8Array(n); this.g = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n);
  }
  idx(x: number, z: number) { const i = Math.floor((x - this.ox) / this.cs), j = Math.floor((z - this.oz) / this.cs); if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1; return j * this.w + i; }
  markSeg(a: V2, b: V2, d: number) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / (this.cs * 0.3))); const seen = new Set<number>(); for (let k = 0; k <= n; k++) { const t = k / n; const i = this.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (i >= 0 && !seen.has(i)) { seen.add(i); this.block[i] = Math.max(0, this.block[i] + d); } } }
  free(i: number) { return i >= 0 && this.block[i] === 0; }
  nearestFree(i: number) { if (this.free(i)) return i; const x = i % this.w, z = (i / this.w) | 0; for (let r = 1; r < 8; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= this.w || zz >= this.h) continue; const j = zz * this.w + xx; if (this.free(j)) return j; } return -1; }
  find(s: V2, t: V2, maxIter = 60000): V2[] | null {
    let si = this.nearestFree(this.idx(s[0], s[1])), ti = this.nearestFree(this.idx(t[0], t[1])); if (si < 0 || ti < 0) return null;
    const st = ++this.cur; const W = this.w; const tx = ti % W, tz = (ti / W) | 0;
    const heap: number[] = [], hf: number[] = [];
    const push = (i: number, f: number) => { heap.push(i); hf.push(f); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; [hf[p], hf[c]] = [hf[c], hf[p]]; c = p; } };
    const pop = () => { const top = heap[0]; const li = heap.pop()!, lf = hf.pop()!; if (heap.length) { heap[0] = li; hf[0] = lf; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; [hf[m], hf[c]] = [hf[c], hf[m]]; c = m; } } return top; };
    const H = (i: number) => { const dx = Math.abs(i % W - tx), dz = Math.abs(((i / W) | 0) - tz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    this.stamp[si] = st; this.g[si] = 0; this.from[si] = -1; push(si, H(si)); let it = 0; let best = si, bestH = H(si);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length && it++ < maxIter) {
      const c = pop(); if (c === ti) break; if (this.closed[c] === st) continue; this.closed[c] = st; const hc = H(c); if (hc < bestH) { bestH = hc; best = c; }
      const cx = c % W, cz = (c / W) | 0;
      for (const [dx, dz, cost] of D) { const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue; const n = nz * W + nx; if (!this.free(n)) continue; if (dx && dz && (!this.free(cz * W + nx) || !this.free(nz * W + cx))) continue;
        const ng = this.g[c] + cost; if (this.stamp[n] !== st || ng < this.g[n]) { this.stamp[n] = st; this.g[n] = ng; this.from[n] = c; push(n, ng + H(n)); } }
    }
    // unreachable / budget exhausted: return partial path to the closest explored cell
    const end = this.stamp[ti] === st ? ti : best; if (end === si) return null;
    const out: V2[] = []; for (let c = end; c >= 0; c = this.from[c]) out.push([this.ox + (c % W + 0.5) * this.cs, this.oz + (((c / W) | 0) + 0.5) * this.cs]);
    out.reverse(); return out;
  }
}
export function smooth(path: V2[], los: (a: V2, b: V2) => boolean) { if (path.length < 3) return path; const out: V2[] = [path[0]]; let i = 0; while (i < path.length - 1) { let j = Math.min(path.length - 1, i + 24); while (j > i + 1 && !los(path[i], path[j])) j--; out.push(path[j]); i = j; } return out; }
