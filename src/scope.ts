// v22.5 sniper scope: a separate eye-height perspective view drawn into a circular window after the main
// render. The normal (orthographic) game camera is untouched.
import * as THREE from 'three';

export const SCOPED = new Set(['t93', 'qbu88']);
export class Scope {
  on = false;
  yaw = 0;
  pitch = 0;
  cam = new THREE.PerspectiveCamera(7, 1, 0.3, 600);
  el: HTMLDivElement;
  note: HTMLDivElement;
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'scope';
    this.el.innerHTML =
      '<div class="ring"></div><div class="xh h"></div><div class="xh v"></div><div class="mil"></div>';
    this.note = document.createElement('div');
    this.note.className = 'snote';
    this.el.appendChild(this.note);
    document.body.appendChild(this.el);
  }
  enter(yaw: number) {
    this.on = true;
    this.yaw = yaw;
    this.pitch = 0.04;
    this.el.style.display = 'block';
  }
  exit() {
    this.on = false;
    this.el.style.display = 'none';
    this.note.textContent = '';
  }
  look(dx: number, dy: number, sens = 1) {
    this.yaw -= dx * 0.0009 * sens;
    this.pitch = Math.max(-0.6, Math.min(0.7, this.pitch - dy * 0.0009 * sens));
  }
  dir() {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }
  place(x: number, y: number, z: number) {
    this.cam.position.set(x, y, z);
    this.cam.lookAt(this.cam.position.clone().add(this.dir()));
  }
  /** the circle's square in CSS px */
  box() {
    const s = Math.round(Math.min(innerWidth, innerHeight) * 0.82);
    return { s, x: Math.round((innerWidth - s) / 2), y: Math.round((innerHeight - s) / 2) };
  }
  render(r: THREE.WebGLRenderer, scene: THREE.Scene) {
    const { s, x, y } = this.box();
    const H = r.domElement.clientHeight || innerHeight;
    this.cam.aspect = 1;
    this.cam.updateProjectionMatrix();
    const ac = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(true);
    r.setScissor(x, H - y - s, s, s);
    r.setViewport(x, H - y - s, s, s);
    const cc = r.getClearColor(new THREE.Color()),
      ca = r.getClearAlpha();
    r.setClearColor((scene.fog as THREE.Fog | null)?.color ?? 0x9aa6b0, 1);
    r.clear(true, true);
    r.setClearColor(cc, ca);
    r.render(scene, this.cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.clientWidth || innerWidth, H);
    r.autoClear = ac;
  }
}
/** walk a dropping round (v m/s) from o along d; returns the first point where test() says hit */
export function ballistic(
  o: THREE.Vector3,
  d: THREE.Vector3,
  range: number,
  v: number,
  test: (p: THREE.Vector3, dist: number) => boolean,
) {
  const p = o.clone();
  const step = 0.25;
  for (let s = step; s <= range; s += step) {
    const t = s / v;
    p.copy(o).addScaledVector(d, s);
    p.y -= 0.5 * 9.8 * t * t;
    if (p.y < 0) return { p, s, ground: true };
    if (test(p, s)) return { p, s, ground: false };
  }
  return { p, s: range, ground: false };
}
