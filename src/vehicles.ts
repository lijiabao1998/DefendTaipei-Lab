// Vehicle system (stub for future drivable vehicles). Parked scooters/cars are registered as Vehicles
// so that a later round can add enter/drive/fuel/noise without touching map generation.
import * as THREE from 'three';
export type VehicleKind = 'scooter' | 'car' | 'taxi' | 'truck';
export interface Vehicle {
  id: number;
  kind: VehicleKind;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  fuel: number;
  drivable: boolean;
  occupied: boolean;
  obj?: THREE.Object3D;
  inst?: number;
}
const M = (c: number, r = 0.5, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function scooterParts() {
  const body: THREE.BufferGeometry[] = [],
    dark: THREE.BufferGeometry[] = [];
  const b1 = new THREE.BoxGeometry(0.34, 0.3, 0.9);
  b1.translate(0, 0.42, 0);
  body.push(b1);
  const b2 = new THREE.BoxGeometry(0.3, 0.55, 0.22);
  b2.translate(0, 0.65, 0.42);
  b2.rotateX(0);
  body.push(b2);
  const f = new THREE.BoxGeometry(0.36, 0.12, 0.5);
  f.translate(0, 0.63, -0.18);
  dark.push(f); // seat
  const h = new THREE.BoxGeometry(0.6, 0.05, 0.05);
  h.translate(0, 0.98, 0.5);
  dark.push(h);
  for (const z of [-0.42, 0.5]) {
    const w = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14);
    w.rotateZ(Math.PI / 2);
    w.translate(0, 0.2, z);
    dark.push(w);
  }
  return { body, dark };
}
export class VehicleSystem {
  list: Vehicle[] = [];
  scooterBody?: THREE.InstancedMesh;
  scooterDark?: THREE.InstancedMesh;
  constructor(public scene: THREE.Scene) {}
  build(
    spots: { x: number; z: number; ang: number; kind: VehicleKind }[],
    merge: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry,
    rnd: () => number,
  ) {
    const sc = spots.filter(s => s.kind === 'scooter');
    const parts = scooterParts();
    this.scooterBody = new THREE.InstancedMesh(merge(parts.body), M(0xffffff, 0.35, 0.3), sc.length);
    this.scooterDark = new THREE.InstancedMesh(merge(parts.dark), M(0x1e1e1e, 0.8), sc.length);
    const COLS = [0xc83a30, 0xe8e8e8, 0x2a5aa8, 0x8fc8c0, 0xf0c040, 0x222222, 0xe88aa8];
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      col = new THREE.Color();
    sc.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ang);
      m4.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
      this.scooterBody!.setMatrixAt(i, m4);
      this.scooterDark!.setMatrixAt(i, m4);
      this.scooterBody!.setColorAt(i, col.setHex(COLS[Math.floor(rnd() * COLS.length)]));
      this.list.push({
        id: this.list.length,
        kind: 'scooter',
        pos: new THREE.Vector3(s.x, 0, s.z),
        heading: s.ang,
        speed: 0,
        fuel: rnd(),
        drivable: false,
        occupied: false,
        inst: i,
      });
    });
    for (const m of [this.scooterBody, this.scooterDark]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    for (const s of spots.filter(s => s.kind !== 'scooter')) {
      const o = this.car(s.kind, rnd);
      o.position.set(s.x, 0, s.z);
      o.rotation.y = s.ang;
      this.scene.add(o);
      this.list.push({
        id: this.list.length,
        kind: s.kind,
        pos: o.position,
        heading: s.ang,
        speed: 0,
        fuel: rnd(),
        drivable: false,
        occupied: false,
        obj: o,
      });
    }
  }
  car(kind: VehicleKind, rnd: () => number) {
    const g = new THREE.Group();
    const c =
      kind === 'taxi'
        ? 0xf2c21a
        : kind === 'truck'
          ? 0x4a5530
          : [0xd8d8d8, 0x30343a, 0x8a1a1a, 0x2a4a7a, 0xbfbfbf][Math.floor(rnd() * 5)];
    const L = kind === 'truck' ? 6.5 : 4.4,
      W = kind === 'truck' ? 2.3 : 1.8;
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.7, L), M(c, 0.3, 0.5));
    b.position.y = 0.65;
    g.add(b);
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.9, kind === 'truck' ? 1.4 : 0.6, kind === 'truck' ? 2 : L * 0.5),
      M(kind === 'truck' ? c : 0x223038, 0.15, 0.6),
    );
    cab.position.set(0, kind === 'truck' ? 1.5 : 1.3, kind === 'truck' ? L / 2 - 1.1 : -0.2);
    g.add(cab);
    if (kind === 'truck') {
      const tarp = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, L - 2.3), M(0x55603a, 0.95, 0));
      tarp.position.set(0, 1.8, -1.1);
      g.add(tarp);
    }
    if (kind === 'taxi') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.25), M(0xffffff));
      s.position.y = 1.7;
      g.add(s);
    }
    for (const x of [-W / 2, W / 2])
      for (const z of [-L / 2 + 0.8, L / 2 - 0.8]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), M(0x151515, 0.9));
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.34, z);
        g.add(w);
      }
    g.traverse(o => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return g;
  }
  nearest(p: THREE.Vector3, r: number) {
    let b: Vehicle | null = null,
      bd = r;
    for (const v of this.list) {
      const d = v.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        b = v;
      }
    }
    return b;
  }
  /** future: enter / drive. Returns false while vehicles are not drivable yet. */
  enter(_v: Vehicle) {
    return false;
  }
  update(_dt: number) {}
}
