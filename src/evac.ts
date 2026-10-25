import * as THREE from 'three';
// 撤離區 marker + extraction cinematic (fictional / generic models, no real insignia)
export const cine = { set on(v: boolean) { this._on = v; document.body.classList.toggle('cine', v); }, get on() { return this._on; }, _on: false };
const M = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: e ? c : 0, emissiveIntensity: e });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
function label(text: string, bg: string, w = 4, h = 1) { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d')!; x.fillStyle = bg; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, 500, 116); x.fillStyle = '#fff'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); }

export function buildEvacZone(scene: THREE.Scene, x: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 40), new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const H = label('H', '#1d6b34', 4, 4); H.rotation.x = -Math.PI / 2; H.position.y = 0.05; g.add(H);
  const pole = box(0.12, 5, 0.12, M(0xcccccc), 6.5, 2.5, 0); g.add(pole);
  const flag = box(1.4, 0.8, 0.04, M(0xff7a00, 0.3), 7.2, 4.5, 0); g.add(flag);
  const sign = label('撤離區 EVAC', '#b02020', 3.4, 0.85); sign.position.set(-6.5, 2.2, 0); g.add(sign, box(0.1, 2.2, 0.1, M(0x666666), -6.5, 1.1, 0.05));
  const flare = new THREE.PointLight(0xff3020, 0, 30); flare.position.set(0, 1.2, 3); g.add(flare);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4020 })); fl.position.copy(flare.position); g.add(fl);
  scene.add(g); let t = 0;
  return { g, pos: [x, z] as [number, number], update(dt: number, open: boolean) { t += dt; g.visible = true; ring.visible = fl.visible = open; flare.intensity = open ? 40 + Math.sin(t * 23) * 15 + Math.random() * 10 : 0; (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(t * 3); flag.rotation.y = Math.sin(t * 2) * 0.2; } };
}

function heli() {
  const g = new THREE.Group(); const body = M(0x4a5560), dark = M(0x22272c), glass = M(0x1a2a3a);
  g.add(box(2.4, 2.0, 6, body, 0, 1.6, 0), box(2.0, 1.2, 1.6, glass, 0, 2.0, -3.5), box(0.6, 0.7, 7, body, 0, 2.2, 6), box(0.15, 2.0, 1.2, body, 0, 3.1, 9.3), box(1.2, 0.5, 0.5, dark, 0, 3.0, 0), box(0.2, 0.2, 5, dark, 1.1, 0.25, 0), box(0.2, 0.2, 5, dark, -1.1, 0.25, 0), box(3.4, 0.08, 0.6, body, 0, 2.6, 7.8));
  const rotor = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = box(16, 0.08, 0.5, dark); b.rotation.y = i * Math.PI / 4; rotor.add(b); } rotor.position.y = 3.3; g.add(rotor);
  const tr = new THREE.Group(); tr.add(box(0.05, 2.6, 0.25, dark), box(0.05, 0.25, 2.6, dark)); tr.position.set(0.25, 3.1, 9.5); g.add(tr);
  return { g, spin(dt: number) { rotor.rotation.y += dt * 25; tr.rotation.x += dt * 40; } };
}
function carrier() {
  const g = new THREE.Group(); const hull = M(0x6b7178), deck = M(0x3a3d40), isl = M(0x7a8088);
  const sh = new THREE.Shape(); sh.moveTo(-20, -165); sh.lineTo(20, -165); sh.lineTo(38, -40); sh.lineTo(38, 120); sh.lineTo(14, 168); sh.lineTo(-14, 168); sh.lineTo(-38, 40); sh.lineTo(-20, -165);
  const dg = new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false }); dg.rotateX(Math.PI / 2); const d = new THREE.Mesh(dg, deck); d.position.y = 20; g.add(d);
  g.add(box(36, 18, 320, hull, 0, 10, 0));
  g.add(box(10, 14, 22, isl, 30, 28, 55), box(6, 10, 8, isl, 30, 40, 52), box(1, 10, 1, M(0x333333), 30, 50, 52));
  const lm = new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }); for (let i = -150; i < 160; i += 12) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), lm); l.rotation.x = -Math.PI / 2; l.position.set(0, 20.05, i); g.add(l); }
  const ang = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 220), new THREE.MeshBasicMaterial({ color: 0xd8c040 })); ang.rotation.set(-Math.PI / 2, 0, 0.16); ang.position.set(-8, 20.06, 40); g.add(ang);
  const no = label('78', '#3a3d40', 30, 14); no.rotation.x = -Math.PI / 2; no.position.set(0, 20.07, -120); g.add(no);
  const pad = label('H', '#3a3d40', 10, 10); pad.rotation.x = -Math.PI / 2; pad.position.set(-12, 20.07, 90); g.add(pad);
  for (let i = 0; i < 6; i++) { const j = box(8, 2, 12, M(0x8a9098), -18 + (i % 2) * 8, 21, -60 - i * 14); g.add(j); }
  return g;
}

export function playEvac(renderer: THREE.WebGLRenderer, mode: 'heli' | 'boat', onEnd: () => void) {
  if (mode === 'boat') return playBoat(renderer, onEnd);
  cine.on = true;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0xa8c4d8); sc.fog = new THREE.Fog(0xa8c4d8, 300, 1800);
  sc.add(new THREE.HemisphereLight(0xdfeeff, 0x2a3a4a, 1.4)); const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(200, 400, 100); sc.add(sun);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x1d4a66, roughness: 0.35, metalness: 0.3 })); sea.rotation.x = -Math.PI / 2; sc.add(sea);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), M(0x55584f)); land.rotation.x = -Math.PI / 2; land.position.set(-400, 0.5, 0); sc.add(land);
  for (let i = 0; i < 160; i++) { const h = 6 + Math.random() * 25; const bx = -30 - Math.random() * 400, bz = (Math.random() - 0.5) * 500; if (bx > -130 && bz > -25 && bz < 70) continue; sc.add(box(8 + Math.random() * 10, h, 8 + Math.random() * 10, M([0x8a8478, 0x9a9488, 0x6e6a62][i % 3]), bx, h / 2, bz)); }
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5030 })); smoke.position.set(-40, 1, 0); sc.add(smoke);
  const cv = carrier(); cv.position.set(900, 0, 60); cv.rotation.y = Math.PI / 2; sc.add(cv);
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(60, 400), new THREE.MeshBasicMaterial({ color: 0xdfeaf0, transparent: true, opacity: 0.35 })); wake.rotation.x = -Math.PI / 2; wake.rotation.z = Math.PI / 2; wake.position.set(1260, 0.3, 60); sc.add(wake);
  const h = heli(); sc.add(h.g);
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 5000);
  const cap = document.createElement('div'); cap.id = 'cinecap'; document.body.appendChild(cap);
  const fade = document.createElement('div'); fade.id = 'cinefade'; document.body.appendChild(fade);
  const caps: [number, string][] = [[0, '撤離直升機抵達，信號彈標示降落點'], [4, '登機完成——飛越淡水河，前往台灣海峽'], [9, '前方：福特號航空母艦（CVN-78）'], [12.5, '著艦']];
  const P0 = new THREE.Vector3(-40, 60, 0), P1 = new THREE.Vector3(-40, 2, 0), P2 = new THREE.Vector3(300, 90, 30), P3 = new THREE.Vector3(840, 50, 60 - 12), P4 = new THREE.Vector3(900 + 90, 20.2, 60 + 12);
  const T = 16; let t = 0, last = performance.now();
  const tick = () => {
    const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now; t += (window as any).__cineFast ? 0.25 : dt; h.spin(dt);
    const hp = h.g.position; let look: THREE.Vector3;
    if (t < 4) { const k = Math.min(t / 3, 1); hp.lerpVectors(P0, P1, k * k * (3 - 2 * k)); h.g.rotation.set(0, -Math.PI / 2, 0); cam.position.set(-75, 14, 30); look = hp.clone(); }
    else if (t < 12.5) { const k = (t - 4) / 8.5; const a = k < 0.6 ? P1.clone().lerp(P2, k / 0.6) : P2.clone().lerp(P3, (k - 0.6) / 0.4); a.y = k < 0.15 ? 2 + (k / 0.15) * 60 : a.y; hp.copy(a); h.g.rotation.set(0.12, -Math.PI / 2, 0); cam.position.copy(hp).add(new THREE.Vector3(-40 + k * 10, 14, 30)); look = k > 0.55 ? cv.position.clone().add(new THREE.Vector3(0, 20, 0)) : hp.clone(); }
    else { const k = Math.min((t - 12.5) / 2.8, 1); hp.lerpVectors(P3, P4, k * k * (3 - 2 * k)); h.g.rotation.set(0.1 * (1 - k), -Math.PI / 2, 0); cam.position.set(940, 55, 150); look = hp.clone(); }
    cam.lookAt(look); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    for (const [s, txt] of caps) if (t >= s) cap.textContent = txt;
    fade.style.opacity = String(t > T - 1.2 ? Math.min((t - (T - 1.2)) / 1.2, 1) : t < 0.6 ? 1 - t / 0.6 : 0);
    renderer.render(sc, cam);
    if (t < T) requestAnimationFrame(tick); else { cap.remove(); cine.on = false; onEnd(); setTimeout(() => fade.remove(), 50); }
  };
  (window as any).__cineT = () => t; tick();
}

function playBoat(renderer: THREE.WebGLRenderer, onEnd: () => void) {
  cine.on = true;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x0a1220); sc.fog = new THREE.Fog(0x0a1220, 120, 1400);
  sc.add(new THREE.HemisphereLight(0x6a80a8, 0x0a0f18, 0.9)); const moon = new THREE.DirectionalLight(0xbcd0ff, 1.0); moon.position.set(-200, 300, -100); sc.add(moon);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x0e2638, roughness: 0.25, metalness: 0.5 })); sea.rotation.x = -Math.PI / 2; sc.add(sea);
  // river banks along +x (downstream), river width 60, opening to sea at x=500
  for (const sd of [-1, 1]) { const bank = new THREE.Mesh(new THREE.BoxGeometry(560, 4, 400), M(0x23272a)); bank.position.set(220, 1, sd * 232); sc.add(bank);
    for (let i = 0; i < 70; i++) { const h = 6 + Math.random() * 30; const b = box(10 + Math.random() * 8, h, 10 + Math.random() * 8, M(0x1c1e22), -40 + Math.random() * 520, h / 2 + 3, sd * (50 + Math.random() * 250)); sc.add(b); if (Math.random() < 0.3) { const w = new THREE.PointLight(0xffa040, 6, 30); w.position.set(b.position.x, h * 0.6, b.position.z - sd * 6); sc.add(w); } } }
  const cv = carrier(); cv.position.set(1300, 0, 40); cv.rotation.y = 0.3; sc.add(cv);
  for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(i % 2 ? 0xff3030 : 0x40ff60, 60, 120); l.position.set(1300 + (i - 4) * 35, 24, 40); sc.add(l); }
  const boat = new THREE.Group(); const tube = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.38, 8, 16), M(0x2a2a2a)); tube.scale.set(1, 2.2, 1); tube.rotation.x = Math.PI / 2; boat.add(tube, box(1.8, 0.2, 4, M(0x3a3a3a), 0, -0.1, 0), box(0.4, 0.7, 0.4, M(0x111111), 0, 0.4, 2.8));
  for (const [x, z] of [[0.4, -0.6], [-0.4, 0.6], [0, 1.6]]) { const pp = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), M(x === 0 && z === 1.6 ? 0x2a3a2a : 0xeeeeee)); pp.position.set(x, 0.6, z); boat.add(pp); }
  sc.add(boat); boat.rotation.y = -Math.PI / 2;
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(3, 40), new THREE.MeshBasicMaterial({ color: 0xbcd0e0, transparent: true, opacity: 0.3 })); wake.rotation.x = -Math.PI / 2; wake.rotation.z = Math.PI / 2; sc.add(wake);
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 5000);
  const cap = document.createElement('div'); cap.id = 'cinecap'; document.body.appendChild(cap);
  const fade = document.createElement('div'); fade.id = 'cinefade'; document.body.appendChild(fade);
  const caps: [number, string][] = [[0, '深夜，橡皮艇在堤防下等你——是真的線人'], [4, '關掉引擎燈，順著淡水河往下游漂'], [8.5, '出海口——台灣海峽'], [11.5, '國際水域：福特號航空母艦（CVN-78）正在等候']];
  const T = 16; let t = 0, last = performance.now();
  const tick = () => { const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now; t += (window as any).__cineFast ? 0.25 : dt;
    const x = t < 2 ? 0 : t < 13 ? ((t - 2) / 11) ** 1.3 * 1180 : 1180 + (t - 13) * 25; const z = t < 13 ? Math.sin(t * 0.6) * 6 : 6 + (t - 13) * 6;
    boat.position.set(x, 0.4 + Math.sin(t * 5) * 0.12, z); boat.rotation.z = Math.sin(t * 3) * 0.05; wake.position.set(x - 22, 0.2, z); wake.visible = t > 2;
    if (t < 8.5) cam.position.set(x - 18, 6, z + 10); else if (t < 11.5) cam.position.set(x - 30, 14, z + 30); else cam.position.set(1180, 40, 160);
    cam.lookAt(t < 11.5 ? boat.position : cv.position.clone().add(new THREE.Vector3(-60, 10, 0))); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    for (const [s0, txt] of caps) if (t >= s0) cap.textContent = txt;
    fade.style.opacity = String(t > T - 1.2 ? Math.min((t - (T - 1.2)) / 1.2, 1) : t < 0.6 ? 1 - t / 0.6 : 0);
    renderer.render(sc, cam);
    if (t < T) requestAnimationFrame(tick); else { cap.remove(); cine.on = false; onEnd(); setTimeout(() => fade.remove(), 50); } };
  (window as any).__cineT = () => t; tick();
}
