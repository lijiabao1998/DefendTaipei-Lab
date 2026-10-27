// v22.4.1 readable doors: painted frame + threshold for every street door (instanced), live door leaves near the
// player (homes: red iron gate, shops: dark-green metal door) that swing open/closed on interact, a pulsing ground
// ring at the nearest door within 3 m. A closed door blocks only the player (soldiers path as before).
import * as THREE from 'three';
import type { Door, V2 } from '../core/world';

export type LiveDoor = Door & { open?: boolean; ang?: number };
const FR_H = 2.45,
  POOL = 14;
export function isHomeDoor(d: Door) {
  return d.b.type === 'home';
}
export function buildDoorDeco(scene: THREE.Scene, doors: Door[]) {
  const n = doors.length;
  const jamb = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, FR_H, 0.34),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.4 }),
    n * 2,
  );
  const head = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.16, 0.34),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.4 }),
    n,
  );
  const sill = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.06, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
    n,
  );
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0),
    col = new THREE.Color();
  doors.forEach((d, i) => {
    const w = Math.hypot(d.c[0] - d.a[0], d.c[1] - d.a[1]);
    q.setFromAxisAngle(Y, -Math.atan2(d.c[1] - d.a[1], d.c[0] - d.a[0]));
    col.set(isHomeDoor(d) ? 0xc0392b : 0xe8681c);
    for (const [k, e] of [
      [0, d.a],
      [1, d.c],
    ] as [number, V2][]) {
      m.compose(p.set(e[0], FR_H / 2, e[1]), q, s.set(1, 1, 1));
      jamb.setMatrixAt(i * 2 + k, m);
      jamb.setColorAt(i * 2 + k, col);
    }
    m.compose(p.set(d.p[0], FR_H - 0.02, d.p[1]), q, s.set(w + 0.28, 1, 1));
    head.setMatrixAt(i, m);
    head.setColorAt(i, col);
    m.compose(p.set(d.p[0], 0.03, d.p[1]), q, s.set(w + 0.2, 1, 1));
    sill.setMatrixAt(i, m);
  });
  for (const x of [jamb, head, sill]) {
    x.castShadow = x !== sill;
    x.receiveShadow = true;
    scene.add(x);
  }
}

import { sfxCtx } from '../audio/audio';
/** short metallic creak + latch clunk (synthesised) */
export function doorSound(open: boolean) {
  try {
    const c = sfxCtx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(open ? 180 : 260, t);
    o.frequency.exponentialRampToValueAtTime(open ? 320 : 140, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.45);
    const n = c.createOscillator(),
      ng = c.createGain();
    n.type = 'square';
    n.frequency.value = 70;
    ng.gain.setValueAtTime(0.12, t + (open ? 0 : 0.35));
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.08 : 0.45));
    n.connect(ng).connect(c.destination);
    n.start(t);
    n.stop(t + 0.5);
  } catch {
    /* no audio */
  }
}

export class DoorView {
  leaves: THREE.Group[] = [];
  slot = new Map<Door, THREE.Group>();
  ring: THREE.Mesh;
  t = 0;
  constructor(private scene: THREE.Scene) {
    const gate = new THREE.MeshStandardMaterial({ color: 0xb02a20, roughness: 0.45, metalness: 0.6 });
    const green = new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.5, metalness: 0.5 });
    const bar = new THREE.MeshStandardMaterial({ color: 0x2a1210, roughness: 0.4, metalness: 0.7 });
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group(); // pivot at the hinge (door.a); the leaf extends along +x
      const home = new THREE.Group();
      const pl = new THREE.Mesh(new THREE.BoxGeometry(1, 2.28, 0.05), gate);
      pl.position.set(0.5, 1.16, 0);
      home.add(pl);
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.9, 0.09), bar);
        b.position.set(0.12 + k * 0.19, 1.2, 0);
        home.add(b);
      }
      const shop = new THREE.Mesh(new THREE.BoxGeometry(1, 2.28, 0.06), green);
      shop.position.set(0.5, 1.16, 0);
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xe0c060, metalness: 0.9 }),
      );
      knob.position.set(0.88, 1.05, 0.06);
      g.add(home, shop, knob);
      g.userData = { home, shop };
      g.traverse(o => ((o as THREE.Mesh).castShadow = true));
      g.visible = false;
      scene.add(g);
      this.leaves.push(g);
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.0, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb030,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }
  /** per frame: assign pooled leaves to the closest doors, animate swing, place the highlight ring */
  update(doors: LiveDoor[], px: number, pz: number, dt: number, near: Door | null) {
    this.t += dt;
    const close = doors
      .map(d => [d, Math.hypot(d.p[0] - px, d.p[1] - pz)] as const)
      .filter(x => x[1] < 35)
      .sort((a, b) => a[1] - b[1])
      .slice(0, POOL)
      .map(x => x[0]);
    for (const [d, g] of [...this.slot]) if (!close.includes(d)) (this.slot.delete(d), (g.visible = false));
    for (const d of close) {
      let g = this.slot.get(d);
      if (!g) {
        g = this.leaves.find(l => ![...this.slot.values()].includes(l))!;
        if (!g) continue;
        this.slot.set(d, g);
        const w = Math.hypot(d.c[0] - d.a[0], d.c[1] - d.a[1]);
        g.position.set(d.a[0], 0, d.a[1]);
        g.scale.set(w, 1, 1);
        g.userData.home.visible = isHomeDoor(d);
        g.userData.shop.visible = !isHomeDoor(d);
        g.userData.base = -Math.atan2(d.c[1] - d.a[1], d.c[0] - d.a[0]);
        g.userData.out = d.b ? outSign(d) : 1;
        d.ang ??= d.open ? 1 : 0;
      }
      g.visible = !d.barricaded;
      const want = d.open ? 1 : 0;
      d.ang = d.ang! + Math.sign(want - d.ang!) * Math.min(Math.abs(want - d.ang!), dt * 2.5);
      const e = d.ang! * d.ang! * (3 - 2 * d.ang!);
      g.rotation.y = g.userData.base + g.userData.out * e * 1.75;
    }
    if (near && !near.barricaded) {
      this.ring.visible = true;
      this.ring.position.set(near.p[0], 0.07, near.p[1]);
      const k = 1 + Math.sin(this.t * 5) * 0.08;
      this.ring.scale.set(k, k, k);
    } else this.ring.visible = false;
  }
}
/** which way the leaf swings so it opens outward (to the street) */
function outSign(d: Door) {
  const ux = d.c[0] - d.a[0],
    uz = d.c[1] - d.a[1];
  const cx = d.b.c[0] - d.p[0],
    cz = d.b.c[1] - d.p[1];
  // leaf normal after +rotation: the side of (ux,uz) cross; building centre side = inward
  return ux * cz - uz * cx > 0 ? 1 : -1;
}
