// v22.10 animation harness (dev only, served by `vite`, not part of the build): side-on close-ups of rigs with a
// fixed timestep so frame grabs are deterministic. window.H.* is driven by scripts/checks/v2210anim.mjs.
import * as THREE from 'three';
import { makeRig, animate, setWeapon } from '../../src/human';
import * as HM from '../../src/human';
import { SwingTrail } from '../../src/trail';
const R = new THREE.WebGLRenderer({ antialias: true });
R.setSize(1200, 600);
document.body.appendChild(R.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8c4c8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 5);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: 0x777066 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
// semi-transparent ground slab so feet below y=0 show as clipped (red)
const under = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 20),
  new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.0 }),
);
const cam = new THREE.OrthographicCamera(-6, 6, 3, -3, -50, 50);
cam.position.set(0, 1, 10);
cam.lookAt(0, 1, 0);
const looks: any[] = [
  { gender: 'm', hair: 0x111111, top: 0x7a8a9a, bottom: 0x2a3550, shoes: 0x222222 },
  { gender: 'f', hair: 0x2a1a10, top: 0xc06a5a, bottom: 0x444444, shoes: 0xeeeeee },
  { gender: 'm', hair: 0x111111, top: 0x4c5733, bottom: 0x4c5733, shoes: 0x111111, soldier: true },
  { gender: 'f', hair: 0x111111, top: 0xffffff, bottom: 0xdddddd, shoes: 0xffffff, outfit: 'nurse' },
];
const rigs = looks.map((o, i) => {
  const r = makeRig(o);
  r.root.position.set(-4.5 + i * 3, 0, 0);
  r.root.rotation.y = Math.PI / 2; // facing +x (side view)
  r.phase = 0;
  r.t = 0;
  scene.add(r.root);
  return r;
});
const trails = rigs.map(() => new SwingTrail(scene));
const TIP: Record<string, number> = { knife: 0.27, bat: 0.8, pipe: 0.84 };
const tb = new THREE.Vector3(),
  tt = new THREE.Vector3();
(window as any).H = {
  rigs,
  trails,
  HM,
  /** step n frames of dt with state/speed; returns min foot-sole height and min knee gap seen */
  run(state: string, speed: number, n: number, dt = 1 / 60) {
    let minY = 9;
    const v = new THREE.Vector3(),
      bb = new THREE.Box3();
    for (let f = 0; f < n; f++)
      for (const r of rigs) {
        animate(r, state as any, speed, dt);
        const q = HM.meleeQ(r),
          tip = TIP[r.weaponKind],
          tr = trails[rigs.indexOf(r)];
        if (tip && q >= 0.3 && q <= 0.62) {
          r.weapon.updateWorldMatrix(true, false);
          tr.add(
            tb.set(0, 0, tip * 0.35).applyMatrix4(r.weapon.matrixWorld),
            tt.set(0, 0, tip).applyMatrix4(r.weapon.matrixWorld),
          );
        }
        tr.update(dt);
        r.root.updateMatrixWorld(true);
        for (const ft of [r.ftL, r.ftR]) {
          bb.setFromObject(ft);
          minY = Math.min(minY, bb.min.y);
        }
      }
    void v;
    return minY;
  },
  weapon(k: string) {
    for (const r of rigs) setWeapon(r, k);
  },
  melee(dur: number, variant?: number) {
    for (const r of rigs)
      if ((HM as any).startMelee) (HM as any).startMelee(r, dur, variant);
      else r.meleeT = dur;
  },
  shoot() {
    for (const r of rigs) r.shootT = 0.14;
  },
  view(front = false) {
    cam.position.set(front ? 10 : 0, 1, front ? 0 : 10);
    cam.lookAt(0, 1, 0);
  },
  render() {
    R.render(scene, cam);
  },
};
void under;
