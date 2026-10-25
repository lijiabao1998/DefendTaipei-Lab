// Character-select portraits: render each faceless role rig once with a small offscreen renderer
// and cache the result as a PNG data URL.
import * as THREE from 'three';
import { makeRig, animate } from './human';
import { roleById } from './roles';

const _pc = new Map<string, string>();
let _pr: THREE.WebGLRenderer | null = null;
export function rolePortrait(id: string, g: 'm' | 'f') {
  const key = id + g;
  if (_pc.has(key)) return _pc.get(key)!;
  try {
    if (!_pr) {
      _pr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      _pr.setSize(240, 320, false);
      _pr.outputColorSpace = THREE.SRGBColorSpace;
      _pr.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3430, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.4);
    d.position.set(1.5, 3, 2.5);
    sc.add(d);
    const b = new THREE.DirectionalLight(0x9fb8ff, 1.0);
    b.position.set(-2, 2, -2);
    sc.add(b);
    const rig = makeRig({ gender: g, ...roleById(id).look[g], outfit: id });
    rig.root.rotation.y = -0.45;
    sc.add(rig.root);
    animate(rig, 'idle', 0, 0.016);
    const cam = new THREE.PerspectiveCamera(26, 240 / 320, 0.1, 20);
    cam.position.set(0, 1.05, 4.1);
    cam.lookAt(0, 0.88, 0);
    _pr.setClearColor(0x000000, 0);
    _pr.render(sc, cam);
    const u = _pr.domElement.toDataURL('image/png');
    _pc.set(key, u);
    return u;
  } catch {
    return '';
  }
}
