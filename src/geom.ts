// Small 2D geometry helpers for the x/z ground plane.
import type { V2 } from './world';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// point in polygon
export function pip(p: V2, pts: V2[]) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i],
      [xj, zj] = pts[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
export function area(pts: V2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
}
export function segInter(p: V2, q: V2, a: V2, b: V2) {
  const d1x = q[0] - p[0],
    d1z = q[1] - p[1],
    d2x = b[0] - a[0],
    d2z = b[1] - a[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((a[0] - p[0]) * d2z - (a[1] - p[1]) * d2x) / den;
  const u = ((a[0] - p[0]) * d1z - (a[1] - p[1]) * d1x) / den;
  return t > 0 && t < 1 && u > 0 && u < 1;
}
// do segments a-b and c-d cross?
export function segX(a: V2, b: V2, c: V2, d: V2) {
  const o = (p: V2, q: V2, r: V2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
