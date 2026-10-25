// FPV kamikaze drone (pilot view w/ analog video look + OSD) and PLA recon drones.
import * as THREE from 'three';
type V2 = [number, number];
export type DroneDeps = { scene: THREE.Scene; renderer: THREE.WebGLRenderer; player: () => THREE.Vector3; blocked: (x: number, z: number, y: number) => boolean; los: (a: V2, b: V2) => boolean;
  jammers: () => V2[]; explode: (p: THREE.Vector3, fromAbove: boolean) => void; log: (m: string, c?: string) => void; mobile: boolean; wind: () => number };
const BATT = 150; // seconds of flight (2.5 min)
function stick(parent: HTMLElement, side: 'l' | 'r') { const J = document.createElement('div'); J.className = 'fstick ' + side; const K = document.createElement('div'); K.className = 'fknob'; J.appendChild(K); parent.appendChild(J);
  const st = { x: 0, y: 0, id: -1, el: J }; const R = 55; let cx = 0, cy = 0;
  const upd = (e: PointerEvent) => { let dx = e.clientX - cx, dy = e.clientY - cy; const L = Math.hypot(dx, dy); if (L > R) { dx *= R / L; dy *= R / L; } st.x = dx / R; st.y = dy / R; K.style.transform = `translate(${dx}px,${dy}px)`; };
  J.addEventListener('pointerdown', e => { e.preventDefault(); const b = J.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; st.id = e.pointerId; J.setPointerCapture(e.pointerId); upd(e); });
  J.addEventListener('pointermove', e => { if (e.pointerId === st.id) upd(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== st.id) return; st.id = -1; st.x = 0; if (side === 'r') st.y = 0; K.style.transform = side === 'l' ? `translate(0px,${st.y * R}px)` : ''; }; // throttle stick does not spring back
  J.addEventListener('pointerup', end); J.addEventListener('pointercancel', end); return st; }

export class FPV {
  active = false; cam = new THREE.PerspectiveCamera(105, 1, 0.05, 900); pos = new THREE.Vector3(); vel = new THREE.Vector3(); q = new THREE.Quaternion(); thr = 0; batt = BATT; sig = 1; lostT = 0; t = 0;
  el: HTMLDivElement; cv: HTMLCanvasElement; osd: HTMLDivElement; keys: Record<string, boolean> = {}; md = [0, 0]; ls?: ReturnType<typeof stick>; rs?: ReturnType<typeof stick>; onEnd: (why: string) => void = () => {}; prevPR = 1; audio?: { ctx: AudioContext; o: OscillatorNode; g: GainNode };
  constructor(public d: DroneDeps) {
    this.el = document.createElement('div'); this.el.id = 'fpv'; this.cv = document.createElement('canvas'); this.cv.width = 200; this.cv.height = 150; this.osd = document.createElement('div'); this.osd.className = 'osd'; this.el.append(this.cv, this.osd);
    const ch = document.createElement('div'); ch.className = 'fch'; this.el.appendChild(ch); document.body.appendChild(this.el);
    if (d.mobile) { this.ls = stick(this.el, 'l'); this.rs = stick(this.el, 'r'); this.ls.y = 0.1; }
    addEventListener('keydown', e => { if (!this.active) return; this.keys[e.code] = true; if (e.code === 'Escape') this.end('你放棄了操控，無人機墜毀'); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('mousemove', e => { if (this.active) { this.md[0] += e.movementX; this.md[1] += e.movementY; } }); }
  launch(onEnd: (why: string) => void) { const P = this.d.player(); this.pos.set(P.x, 1.6, P.z); this.vel.set(0, 4, 0); this.q.setFromEuler(new THREE.Euler(0, Math.PI * 0.75, 0, 'YXZ')); this.thr = 0.55; this.batt = BATT; this.sig = 1; this.lostT = 0; this.t = 0; this.onEnd = onEnd; this.active = true;
    document.body.classList.add('fpvon'); this.prevPR = this.d.renderer.getPixelRatio(); this.d.renderer.setPixelRatio(this.d.mobile ? 0.5 : 0.6); this.d.renderer.setSize(innerWidth, innerHeight); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 180; const g = ctx.createGain(); g.gain.value = 0.03; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(); this.audio = { ctx, o, g }; } catch { /* no audio */ }
    this.d.log('FPV 起飛！W 油門、滑鼠控制俯仰／滾轉、A/D 偏航；撞上目標即引爆。Esc 放棄', '#9cf'); }
  end(why: string) { if (!this.active) return; this.active = false; document.body.classList.remove('fpvon'); this.d.renderer.setPixelRatio(this.prevPR); this.d.renderer.setSize(innerWidth, innerHeight); if (this.audio) { this.audio.o.stop(); this.audio.ctx.close(); this.audio = undefined; } this.onEnd(why); }
  update(dt: number) { if (!this.active) return; this.t += dt; const k = this.keys;
    // ---- inputs → body rates (rad/s), acro-ish with mild self-level for playability
    let pr = 0, rr = 0, yr = 0, thrT = this.thr;
    if (this.d.mobile && this.ls && this.rs) { thrT = Math.min(1, Math.max(0, 0.5 - this.ls.y * 0.5)); yr = -this.ls.x * 2.6; pr = this.rs.y * 3.2; rr = -this.rs.x * 3.6; }
    else { pr = this.md[1] * 0.35; rr = -this.md[0] * 0.35; this.md[0] = this.md[1] = 0; yr = (k.KeyA ? 2.2 : 0) - (k.KeyD ? 2.2 : 0); thrT = k.KeyW ? 1 : k.KeyS ? 0.05 : 0.42; }
    this.thr += (thrT - this.thr) * Math.min(1, dt * 6);
    const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ'); // y=yaw x=pitch z=roll
    e.x += pr * dt - e.x * dt * 0.1; e.z += rr * dt - e.z * dt * 0.6; e.x = THREE.MathUtils.clamp(e.x, -1.35, 1.35); e.z = THREE.MathUtils.clamp(e.z, -1.2, 1.2); e.y += (yr + e.z * 1.4) * dt; // banked turns
    this.q.setFromEuler(e);
    // ---- physics: thrust along body up, gravity, drag, gusty wind, battery sag
    const sag = this.batt / BATT < 0.2 ? 0.75 : 1; const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q); const a = up.multiplyScalar(this.thr * 24 * sag); a.y -= 9.8;
    const w = this.d.wind(); a.x += Math.sin(this.t * 0.7) * w * 1.5 + w; a.z += Math.cos(this.t * 0.5) * w;
    a.addScaledVector(this.vel, -0.35 * this.vel.length() * 0.05 - 0.15); this.vel.addScaledVector(a, dt); this.pos.addScaledVector(this.vel, dt);
    this.batt -= dt * (0.4 + this.thr);
    // ---- signal: distance, building occlusion, PLA jammers
    const P = this.d.player(); const dist = Math.hypot(this.pos.x - P.x, this.pos.z - P.z); let s = THREE.MathUtils.clamp(1 - dist / 380, 0, 1);
    if (this.pos.y < 28 && !this.d.los([P.x, P.z], [this.pos.x, this.pos.z])) s *= 0.5;
    let jam = 1; for (const j of this.d.jammers()) { const dj = Math.hypot(this.pos.x - j[0], this.pos.z - j[1]); jam = Math.min(jam, THREE.MathUtils.clamp((dj - 15) / 70, 0.12, 1)); } s *= jam; this.sig += (s - this.sig) * Math.min(1, dt * 3);
    if (this.sig < 0.08) { this.lostT += dt; if (this.lostT > 1.2) return this.end(jam < 0.5 ? '訊號被解放軍干擾站壓制——圖傳中斷' : '訊號中斷（距離太遠或被建築遮擋）'); } else this.lostT = 0;
    if (this.batt <= 0) return this.end('電池耗盡，無人機墜落');
    // ---- impact: ground / building / target
    if (this.pos.y < 0.25 || this.d.blocked(this.pos.x, this.pos.z, this.pos.y)) { const above = this.vel.y < -3 && Math.abs(this.vel.y) > Math.hypot(this.vel.x, this.vel.z) * 0.6; this.d.explode(this.pos.clone(), above); return this.end('撞擊引爆！'); }
    // ---- camera (25° uptilt) + video FX + OSD
    this.cam.position.copy(this.pos); this.cam.quaternion.copy(this.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38)); this.cam.updateMatrixWorld();
    if (this.audio) { this.audio.o.frequency.value = 140 + this.thr * 260; this.audio.g.gain.value = 0.02 + this.thr * 0.04; }
    this.fx(); }
  fx() { const c = this.cv.getContext('2d')!, W = 200, H = 150; const bad = 1 - this.sig; c.clearRect(0, 0, W, H); const img = c.createImageData(W, H); const d = img.data;
    const amt = 0.06 + bad * 0.9; for (let i = 0; i < d.length; i += 4) { if (Math.random() < amt) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v * (0.8 + Math.random() * 0.4); d[i + 2] = v; d[i + 3] = 40 + bad * 200; } }
    c.putImageData(img, 0, 0); if (bad > 0.35) for (let i = 0; i < bad * 8; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.3})`; c.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); }
    this.cv.style.transform = bad > 0.5 ? `translateX(${(Math.random() - 0.5) * bad * 10}px)` : '';
    const bars = '▂▄▆█'.slice(0, Math.max(0, Math.ceil(this.sig * 4))).padEnd(4, '·'); const pct = Math.max(0, this.batt / BATT); const v = (13.2 + pct * 3.6).toFixed(1);
    const sp = (this.vel.length() * 3.6).toFixed(0), mm = Math.floor(this.t / 60), ss = Math.floor(this.t % 60).toString().padStart(2, '0');
    this.osd.innerHTML = `<span class="tl">RSSI ${bars} ${(this.sig * 100).toFixed(0)}%<br>LQ ${this.lostT > 0 ? '<b>LOST</b>' : 'OK'}</span><span class="tr">${v}V 4S<br>BAT ${(pct * 100).toFixed(0)}%</span><span class="bl">ALT ${this.pos.y.toFixed(0)}m<br>${sp} km/h</span><span class="br">THR ${(this.thr * 100).toFixed(0)}%<br>${mm}:${ss}</span><span class="tc">ARMED · 攻擊</span>`; }
}

// ---------- PLA recon drones circling overhead ----------
export class Recon {
  list: { g: THREE.Group; c: V2; r: number; a: number; h: number; spot: number; cd: number }[] = []; audio?: { ctx: AudioContext; g: GainNode; o: OscillatorNode };
  constructor(public scene: THREE.Scene, public deps: { player: () => THREE.Vector3; hidden: () => boolean; spotted: (p: V2) => void; log: (m: string, c?: string) => void }, centres: V2[]) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3e38, roughness: 0.6 }), lm = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    for (const c of centres) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), mat); g.add(b); for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), mat); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(-z, x); g.add(arm); const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.01, 12), new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 })); rot.position.set(x, 0.08, z); g.add(rot); } const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lm); l.position.y = -0.1; g.add(l); g.scale.setScalar(1.8); scene.add(g); this.list.push({ g, c, r: 30 + Math.random() * 25, a: Math.random() * 6, h: 30 + Math.random() * 10, spot: 0, cd: 0 }); } }
  update(dt: number, t: number) { const P = this.deps.player(); let near = 1e9;
    for (const d of this.list) { d.a += dt * 12 / d.r; // drift centre slowly toward player area
      d.c[0] += (P.x - d.c[0]) * dt * 0.004; d.c[1] += (P.z - d.c[1]) * dt * 0.004;
      d.g.position.set(d.c[0] + Math.cos(d.a) * d.r, d.h + Math.sin(t * 0.8) * 1.2, d.c[1] + Math.sin(d.a) * d.r); d.g.rotation.y = -d.a; (d.g.children[d.g.children.length - 1] as THREE.Mesh).visible = Math.sin(t * 6) > 0.4;
      const hd = Math.hypot(P.x - d.g.position.x, P.z - d.g.position.z); near = Math.min(near, Math.hypot(hd, d.h)); d.cd -= dt;
      if (hd < 24 && !this.deps.hidden()) { d.spot += dt; if (d.spot > 2.5 && d.cd <= 0) { d.cd = 70; d.spot = 0; this.deps.spotted([P.x, P.z]); } } else d.spot = Math.max(0, d.spot - dt * 0.5); }
    try { if (!this.audio) { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 230; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; const g = ctx.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(); this.audio = { ctx, g, o }; }
      this.audio.g.gain.setTargetAtTime(near < 70 ? (1 - near / 70) * 0.05 : 0, this.audio.ctx.currentTime, 0.2); this.audio.o.frequency.value = 220 + Math.sin(t * 3) * 12; } catch { /* audio blocked */ }
    return near; }
}

// ---------- explosion visual ----------
export function boom(scene: THREE.Scene, p: THREE.Vector3, big = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9, depthWrite: false })); m.position.copy(p); scene.add(m); const L = new THREE.PointLight(0xffa040, 60 * big, 30); L.position.copy(p).y += 1; scene.add(L);
  let t = 0; const f = () => { t += 0.016; m.scale.setScalar(1 + t * 14 * big); (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.6); (m.material as THREE.MeshBasicMaterial).color.setHSL(0.08 - t * 0.08, 1, 0.55 - t * 0.4); L.intensity = Math.max(0, 60 * big * (1 - t * 2)); if (t < 0.6) requestAnimationFrame(f); else { scene.remove(m, L); m.geometry.dispose(); } }; f(); }
