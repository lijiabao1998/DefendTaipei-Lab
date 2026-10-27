// Mid/far LOD geometry builders (three.js). Mid: one merged mesh of extruded footprint boxes per tile.
// Far: a coarse terrain grid. Skyline colour blocks come with baked tile data in a later PR.
import * as THREE from 'three';
import type { V2 } from './types';

/** merge building footprints into one extruded-box geometry (axis-aligned bbox per footprint) */
export function midBuildings(blds: { pts: V2[]; h: number }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const b of blds) {
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const [x, z] of b.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const h = b.h;
    quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]); // roof
    quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]);
    quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]);
    quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]);
    quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** far LOD: (n+1)² vertex terrain grid over one tile, heights from a sampler (flat by default) */
export function farTerrain(
  x0: number,
  z0: number,
  size: number,
  n = 4,
  hAt: (x: number, z: number) => number = () => 0,
) {
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + size / 2, 0, z0 + size / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, hAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}
