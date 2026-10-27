import * as THREE from 'three';
// 撤離區 marker + extraction cinematic (fictional / generic models, no real insignia)
export const cine = {
  set on(v: boolean) {
    this._on = v;
    document.body.classList.toggle('cine', v);
  },
  get on() {
    return this._on;
  },
  _on: false,
};
const M = (c: number, e = 0) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: e ? c : 0, emissiveIntensity: e });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};
function label(text: string, bg: string, w = 4, h = 1) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#fff';
  x.lineWidth = 8;
  x.strokeRect(6, 6, 500, 116);
  x.fillStyle = '#fff';
  x.font = 'bold 64px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

export function buildEvacZone(scene: THREE.Scene, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.2, 6, 40),
    new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const H = label('H', '#1d6b34', 4, 4);
  H.rotation.x = -Math.PI / 2;
  H.position.y = 0.05;
  g.add(H);
  const pole = box(0.12, 5, 0.12, M(0xcccccc), 6.5, 2.5, 0);
  g.add(pole);
  const flag = box(1.4, 0.8, 0.04, M(0xff7a00, 0.3), 7.2, 4.5, 0);
  g.add(flag);
  const sign = label('撤離區 EVAC', '#b02020', 3.4, 0.85);
  sign.position.set(-6.5, 2.2, 0);
  g.add(sign, box(0.1, 2.2, 0.1, M(0x666666), -6.5, 1.1, 0.05));
  const flare = new THREE.PointLight(0xff3020, 0, 30);
  flare.position.set(0, 1.2, 3);
  g.add(flare);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4020 }));
  fl.position.copy(flare.position);
  g.add(fl);
  scene.add(g);
  let t = 0;
  return {
    g,
    pos: [x, z] as [number, number],
    update(dt: number, open: boolean) {
      t += dt;
      g.visible = true;
      ring.visible = fl.visible = open;
      flare.intensity = open ? 40 + Math.sin(t * 23) * 15 + Math.random() * 10 : 0;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(t * 3);
      flag.rotation.y = Math.sin(t * 2) * 0.2;
    },
  };
}

export function playEvac(renderer: THREE.WebGLRenderer, mode: 'heli' | 'boat', onEnd: () => void) {
  cine.on = true; // lazy-load the cinematic (carrier, HDRI sky, ocean) only when needed
  import('../cine')
    .then(m =>
      m.play(renderer, mode, () => {
        cine.on = false;
        onEnd();
      }),
    )
    .catch(e => {
      console.error(e);
      cine.on = false;
      onEnd();
    });
}
