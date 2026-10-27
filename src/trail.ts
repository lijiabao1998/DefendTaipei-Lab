// v22.10 melee motion trail: an additive ribbon between the weapon grip and tip, sampled each frame while
// the swing is in its fast arc, fading over ~0.12 s. One shared mesh, fixed-size buffers (mobile safe).
import * as THREE from 'three';
const N = 16;
export class SwingTrail {
  mesh: THREE.Mesh;
  private pos = new Float32Array(N * 2 * 3);
  private age = new Float32Array(N).fill(9);
  private col = new Float32Array(N * 2 * 4);
  private ring = new Float32Array(N * 6);
  private n = 0;
  private head = 0;
  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2,
        b = a + 1,
        c = a + 2,
        d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** push a grip→tip sample; samples are kept oldest → newest in ring order */
  add(base: THREE.Vector3, tip: THREE.Vector3) {
    const i = this.head;
    this.head = (this.head + 1) % N;
    this.n = Math.min(N, this.n + 1);
    this.ring.set([base.x, base.y, base.z, tip.x, tip.y, tip.z], i * 6);
    this.age[i] = 0;
  }
  clear() {
    this.n = 0;
  }
  update(dt: number) {
    let live = 0;
    for (let i = 0; i < N; i++) this.age[i] += dt;
    // write the strip in chronological order
    const P = this.ring;
    const pa = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < N; k++) {
      const src = (this.head - this.n + k + N * 2) % N;
      const kk = Math.min(k, this.n - 1);
      const s2 = (this.head - this.n + kk + N * 2) % N;
      const a = k < this.n ? this.age[src] : 9;
      const al = Math.max(0, 1 - a / 0.12) * (k / Math.max(1, this.n - 1));
      if (k < this.n && a < 0.12) live++;
      (pa.array as Float32Array).set(P.subarray(s2 * 6, s2 * 6 + 6), k * 6);
      this.col.set([1, 0.95, 0.85, al * 0.15, 1, 1, 1, al * 0.75], k * 8);
    }
    pa.needsUpdate = true;
    this.mesh.geometry.getAttribute('color').needsUpdate = true;
    this.mesh.visible = live > 1 && this.n > 1;
    if (!live) this.n = 0;
  }
}
