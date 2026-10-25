// v17.2 character lineup (dev-only, served by `vite`): renders role rigs, a civilian crowd and a soldier for close-up checks.
// ?set=roles|crowd|soldier&g=m|f&walk=1
import * as THREE from 'three';
import { makeRig, animate, setWeapon } from '../../../src/human';
import { roleById } from '../../../src/roles';

const q = new URLSearchParams(location.search);
const set = q.get('set') || 'roles';
const R = new THREE.WebGLRenderer({ antialias: true });
R.setSize(innerWidth, innerHeight);
R.outputColorSpace = THREE.SRGBColorSpace;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.shadowMap.enabled = true;
document.body.appendChild(R.domElement);
const sc = new THREE.Scene();
sc.background = new THREE.Color(0xb9c2c8);
sc.add(new THREE.HemisphereLight(0xe8eeff, 0x5a5048, 1.4));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
sc.add(sun);
const gnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6a6a68 }));
gnd.rotation.x = -Math.PI / 2;
gnd.receiveShadow = true;
sc.add(gnd);
const rigs: { r: ReturnType<typeof makeRig>; st: 'idle' | 'walk' | 'aim'; sp: number }[] = [];
const walk = q.get('walk') === '1';
const add = (o: any, x: number, z: number, ry = 0) => {
  const r = makeRig(o);
  r.root.position.set(x, 0, z);
  r.root.rotation.y = ry;
  r.root.traverse(m => ((m as THREE.Mesh).receiveShadow = true));
  sc.add(r.root);
  rigs.push({ r, st: walk ? 'walk' : 'idle', sp: walk ? 1.3 : 0 });
  return r;
};
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
if (set === 'roles') {
  const g = (q.get('g') || 'm') as 'm' | 'f';
  ['office', 'student', 'courier', 'nurse', 'tech'].forEach((id, i) =>
    add({ gender: g, ...roleById(id).look[g], outfit: id }, (i - 2) * 0.95, 0, -0.25),
  );
  cam.position.set(0, 1.25, 6.2);
  cam.lookAt(0, 0.95, 0);
} else if (set === 'crowd') {
  const L = [
    { gender: 'm', hair: 0x1a1410, top: 0x9aa6b8, jacket: 0x1e2433, bottom: 0x4a6a92, shoes: 0x5a3a24 },
    { gender: 'f', hair: 0x2a1a12, top: 0xe8e2d6, jacket: 0x5a7aa0, bottom: 0x3e5a80, shoes: 0xf0f0f0 },
    { gender: 'm', hair: 0x111111, top: 0xf2f0ea, bottom: 0xb8a27a, shoes: 0x6a4a2e },
    { gender: 'f', hair: 0x3a2418, top: 0xd8c8b0, bottom: 0x2a3a5a, shoes: 0xe8e8e8 },
    { gender: 'm', hair: 0x222222, top: 0x7a3a3a, bottom: 0x44628a, shoes: 0x222222 },
    { gender: 'f', hair: 0x1a1410, top: 0x6a8a9a, jacket: 0x8a6a4a, bottom: 0x3a3a3a, shoes: 0x5a3a24 },
  ];
  L.forEach((o, i) => add(o, (i % 3) * 1.1 - 1.1 + (i > 2 ? 0.5 : 0), i > 2 ? -1.3 : 0, -0.3 + i * 0.25));
  cam.position.set(0.6, 1.5, 6);
  cam.lookAt(0, 0.9, -0.5);
} else {
  const r = add(
    { gender: 'm', hair: 0x111111, top: 0x55603c, bottom: 0x4a5434, shoes: 0x1a1a1a, soldier: true },
    -0.5,
    0,
    0.3,
  );
  setWeapon(r, 'rifle');
  rigs[0].st = 'aim';
  const r2 = add(
    { gender: 'm', hair: 0x111111, top: 0x55603c, bottom: 0x4a5434, shoes: 0x1a1a1a, soldier: true },
    0.6,
    -0.6,
    -0.4,
  );
  setWeapon(r2, 'rifle');
  cam.position.set(0, 1.3, 4.2);
  cam.lookAt(0, 0.95, -0.2);
}
let last = performance.now();
let frames = 0;
const loop = () => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const x of rigs) animate(x.r, x.st, x.sp, dt || 0.016);
  R.render(sc, cam);
  if (++frames === 30) (window as any).__ready = true;
  requestAnimationFrame(loop);
};
loop();
