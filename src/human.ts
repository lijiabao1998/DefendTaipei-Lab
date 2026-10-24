// Procedurally built, hierarchically rigged humanoid (joint skeleton) + procedural animation state machine.
import * as THREE from 'three';
export type AnimState = 'idle' | 'walk' | 'run' | 'sneak' | 'melee' | 'aim' | 'shoot' | 'loot' | 'hurt' | 'death' | 'sleep' | 'carry';
export type RigOpts = { gender: 'm' | 'f'; skin: number; hair: number; top: number; bottom: number; shoes: number; soldier?: boolean };
type J = THREE.Object3D;
export type Rig = {
  root: THREE.Group; body: THREE.Group; hips: J; spine: J; chest: J; neck: J; head: J;
  uaL: J; laL: J; uaR: J; laR: J; thL: J; shL: J; thR: J; shR: J; handR: J; weapon: THREE.Group;
  phase: number; meleeT: number; shootT: number; hurtT: number; deadT: number; lootT: number; state: AnimState; weaponKind: string; f: boolean;
};
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const M = (c: number, rough = 0.85) => { const k = c + ':' + rough; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough })); return matCache.get(k)!; };
function limb(parent: J, len: number, r0: number, r1: number, mat: THREE.Material) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1); g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r0, 10, 8), mat); cap.castShadow = false; parent.add(cap);
  const end = new THREE.Object3D(); end.position.y = -len; parent.add(end); return end;
}
function joint(parent: J, x: number, y: number, z: number) { const j = new THREE.Object3D(); j.position.set(x, y, z); parent.add(j); return j; }
export function makeRig(o: RigOpts): Rig {
  const f = o.gender === 'f'; const s = f ? 0.94 : 1;
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const skin = M(o.skin, 0.7), top = M(o.top), bot = M(o.bottom), shoe = M(o.shoes, 0.6), hairM = M(o.hair, 0.9);
  const hips = joint(body, 0, 0.92 * s, 0);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bot); pelvis.scale.set(f ? 0.17 : 0.16, 0.12, 0.11); pelvis.castShadow = true; hips.add(pelvis);
  const spine = joint(hips, 0, 0.06, 0);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(f ? 0.15 : 0.18, f ? 0.13 : 0.15, 0.42, 12), top); torso.position.y = 0.2; torso.scale.z = 0.66; torso.castShadow = true; spine.add(torso);
  const chest = joint(spine, 0, 0.36, 0);
  if (f) { const bust = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), top); bust.scale.set(1.15, 0.6, 0.6); bust.position.set(0, -0.08, 0.05); chest.add(bust); }
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), top); shoulders.scale.set(f ? 0.17 : 0.21, 0.07, 0.11); shoulders.castShadow = true; chest.add(shoulders);
  if (o.soldier) { const vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.24), M(0x3a4228)); vest.position.y = -0.15; chest.add(vest); for (let i = -1; i <= 1; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.05), M(0x2e3520)); p.position.set(i * 0.1, -0.22, 0.13); chest.add(p); } }
  const neck = joint(chest, 0, 0.05, 0);
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skin); nk.position.y = 0.04; neck.add(nk);
  const head = joint(neck, 0, 0.1, 0);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin); hd.scale.set(0.92, 1.08, 1); hd.position.y = 0.06; hd.castShadow = true; head.add(hd);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), skin); nose.position.set(0, 0.05, 0.105); head.add(nose);
  for (const x of [-0.04, 0.04]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), M(0x111111, 0.3)); e.position.set(x, 0.08, 0.098); head.add(e); }
  if (o.soldier) {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x4a5530)); helm.position.y = 0.08; helm.scale.set(1, 0.85, 1.08); helm.castShadow = true; head.add(helm);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 16), M(0x3e4828)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.08; head.add(rim);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, f ? Math.PI * 0.62 : Math.PI * 0.52), hairM); cap.position.set(0, 0.07, -0.008); cap.rotation.x = -0.25; head.add(cap);
    if (f) { const back = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 12, 1, true, Math.PI * 0.6, Math.PI * 1.8), hairM); back.position.set(0, -0.02, -0.01); head.add(back);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), hairM); tail.position.set(0, 0.0, -0.13); tail.rotation.x = 0.4; head.add(tail); }
  }
  // arms
  const mkArm = (side: number) => { const sh = joint(chest, side * (f ? 0.17 : 0.2), -0.02, 0); const el = limb(sh, 0.29, 0.05, 0.042, top); const la = joint(el, 0, 0, 0); const hand = limb(la, 0.26, 0.04, 0.035, o.soldier ? top : skin); const h = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), o.soldier ? M(0x2a2a20) : skin); h.position.y = -0.03; hand.add(h); return [sh, la, hand] as const; };
  const [uaL, laL] = mkArm(-1); const [uaR, laR, handR] = mkArm(1);
  const mkLeg = (side: number) => { const th = joint(hips, side * 0.09, -0.02, 0); const kn = limb(th, 0.44 * s, f ? 0.075 : 0.07, 0.055, bot); const sh = joint(kn, 0, 0, 0); const an = limb(sh, 0.42 * s, 0.052, 0.04, bot); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.22), shoe); foot.position.set(0, -0.02, 0.05); foot.castShadow = true; an.add(foot); return [th, sh] as const; };
  const [thL, shL] = mkLeg(-1); const [thR, shR] = mkLeg(1);
  const weapon = new THREE.Group(); handR.add(weapon);
  const r: Rig = { root, body, hips, spine, chest, neck, head, uaL, laL, uaR, laR, thL, shL, thR, shR, handR, weapon, phase: Math.random() * 6, meleeT: 0, shootT: 0, hurtT: 0, deadT: 0, lootT: 0, state: 'idle', weaponKind: '', f };
  return r;
}
export function setWeapon(r: Rig, kind: string) {
  if (r.weaponKind === kind) return; r.weaponKind = kind; r.weapon.clear();
  const add = (g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, M(c, 0.5)); m.position.set(x, y, z); m.castShadow = true; r.weapon.add(m); return m; };
  if (kind === 'rifle') { add(new THREE.BoxGeometry(0.05, 0.08, 0.75), 0x22261f, 0, -0.03, 0.12); add(new THREE.BoxGeometry(0.04, 0.16, 0.05), 0x1a1a1a, 0, -0.12, 0.12); add(new THREE.BoxGeometry(0.05, 0.1, 0.2), 0x4b5232, 0, -0.05, -0.3); r.weapon.rotation.set(Math.PI / 2, 0, 0); }
  else if (kind === 'pistol') { add(new THREE.BoxGeometry(0.035, 0.05, 0.2), 0x222222, 0, 0, 0.06); add(new THREE.BoxGeometry(0.03, 0.1, 0.04), 0x333333, 0, -0.06, 0); r.weapon.rotation.set(Math.PI / 2, 0, 0); }
  else if (kind === 'bat') { add(new THREE.CylinderGeometry(0.035, 0.018, 0.85, 8), 0xc08a4a, 0, 0, 0.36).rotation.x = Math.PI / 2; r.weapon.rotation.set(Math.PI / 2 - 0.3, 0, 0); }
  else if (kind === 'pipe') { add(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 8), 0x8a8a8a, 0, 0, 0.38).rotation.x = Math.PI / 2; r.weapon.rotation.set(Math.PI / 2 - 0.3, 0, 0); }
  else if (kind === 'knife') { add(new THREE.BoxGeometry(0.02, 0.1, 0.2), 0xd0d6da, 0, 0.02, 0.15); add(new THREE.BoxGeometry(0.025, 0.035, 0.1), 0x5a3a1a, 0, 0, 0.02); r.weapon.rotation.set(Math.PI / 2, 0, 0); }
}
const lerp = (j: J, ax: 'x' | 'y' | 'z', v: number, k: number) => { j.rotation[ax] += (v - j.rotation[ax]) * k; };
/** speed in m/s */
export function animate(r: Rig, state: AnimState, speed: number, dt: number) {
  r.state = state; r.meleeT = Math.max(0, r.meleeT - dt); r.shootT = Math.max(0, r.shootT - dt); r.hurtT = Math.max(0, r.hurtT - dt);
  const k = Math.min(1, dt * 14); const T = { hipY: 0.92 * (r.f ? 0.94 : 1), spX: 0, spY: 0, hdX: 0, thL: 0, thR: 0, shL: 0, shR: 0, uaL: 0.05, uaR: 0.05, uaLz: 0.12, uaRz: -0.12, laL: -0.15, laR: -0.15, uaRy: 0, uaLy: 0, bodyX: 0, bodyY: 0, bodyZ: 0 };
  const moving = speed > 0.2;
  const g = (a: number, f: number) => { r.phase += dt * f; const s = Math.sin(r.phase); const c = Math.cos(r.phase); T.thL = -s * a; T.thR = s * a; T.shL = Math.max(0, c) * a * 1.4 + 0.08; T.shR = Math.max(0, -c) * a * 1.4 + 0.08; T.uaL = s * a * 0.8; T.uaR = -s * a * 0.8; T.laL = -0.25 - a * 0.5; T.laR = -0.25 - a * 0.5; T.hipY -= Math.abs(c) * 0.03 * a; T.spY = s * 0.08 * a; };
  if (state === 'death') { r.deadT = Math.min(1, r.deadT + dt * 1.6); const d = r.deadT; T.bodyX = -Math.PI / 2 * (d * d); T.hipY = 0.92 - 0.75 * d; T.uaL = -2.6 * d; T.uaR = -2.2 * d; T.uaLz = 0.6; T.uaRz = -0.8; T.thL = -0.3; T.thR = 0.1; T.shL = 0.5; T.hdX = -0.4; }
  else if (state === 'sleep') { T.bodyX = -Math.PI / 2; T.bodyY = 0; T.hipY = 0.2; T.uaL = -0.3; T.uaR = -0.2; T.thR = -0.4; T.shR = 0.8; T.hdX = 0.2; }
  else {
    r.deadT = 0;
    if (state === 'walk' || state === 'carry') g(0.5, speed * 2.6 + 0.5);
    else if (state === 'run') { g(0.95, speed * 1.65); T.spX = 0.3; T.laL = T.laR = -1.4; T.uaL *= 1.1; T.uaR *= 1.1; }
    else if (state === 'sneak') { if (moving) g(0.35, speed * 4); T.hipY -= 0.28; T.thL -= 0.9; T.thR -= 0.9; T.shL += 1.3; T.shR += 1.3; T.spX = 0.55; T.hdX = -0.4; T.uaL = -0.5; T.uaR = -0.5; T.laL = T.laR = -0.9; }
    else if (state === 'loot') { r.lootT += dt * 4; T.hipY -= 0.35; T.thL = -1.3; T.thR = -0.5; T.shL = 1.6; T.shR = 1.2; T.spX = 0.6; T.uaL = -1.0 + Math.sin(r.lootT) * 0.3; T.uaR = -1.1 + Math.cos(r.lootT) * 0.3; T.laL = T.laR = -0.6; }
    else { // idle breathing
      r.phase += dt * 1.5; T.spX = Math.sin(r.phase) * 0.02; T.uaL = 0.05 + Math.sin(r.phase) * 0.03; T.uaR = 0.05 - Math.sin(r.phase) * 0.03; if (moving) g(0.5, speed * 2.6);
    }
    // upper-body overlays
    if (r.weaponKind === 'rifle' && state === 'carry') { T.uaR = -0.6; T.laR = -1.2; T.uaL = -0.9; T.laL = -1.3; T.uaLz = 0.6; }
    if (state === 'aim' || state === 'shoot' || r.shootT > 0) { if (state === 'aim' || state === 'shoot') { if (moving) g(0.35, speed * 2.6); } T.uaR = -1.5 - (r.shootT > 0.06 ? 0.25 : 0); T.laR = 0; T.uaRz = 0; T.uaL = -1.35; T.laL = -0.35; T.uaLz = r.weaponKind === 'pistol' ? 0.5 : 0.7; T.uaLy = 0; T.spY = 0; T.spX = Math.max(T.spX, 0.05) - (r.shootT > 0.06 ? 0.08 : 0); }
    if (r.meleeT > 0) { const p = 1 - r.meleeT / 0.45; const sw = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65 * 0.3; T.uaR = -2.7 + sw * 2.2 * (p < 0.35 ? 0 : 1) - (p < 0.35 ? sw * 0.2 : 0); if (p >= 0.35) T.uaR = -2.7 + Math.min(1, (p - 0.35) * 4) * 2.3; T.laR = -0.4; T.spY = p < 0.35 ? 0.4 : -0.5; T.spX = 0.15; T.uaL = -0.6; }
    if (r.hurtT > 0) { T.spX -= 0.4 * r.hurtT / 0.3; T.hdX = -0.5 * r.hurtT / 0.3; T.uaL -= 0.5; }
  }
  r.hips.position.y += (T.hipY - r.hips.position.y) * k;
  lerp(r.body, 'x', T.bodyX, k); lerp(r.spine, 'x', T.spX, k); lerp(r.spine, 'y', T.spY, k); lerp(r.head, 'x', T.hdX, k);
  lerp(r.thL, 'x', T.thL, k); lerp(r.thR, 'x', T.thR, k); lerp(r.shL, 'x', T.shL, k); lerp(r.shR, 'x', T.shR, k);
  lerp(r.uaL, 'x', T.uaL, k); lerp(r.uaR, 'x', T.uaR, k); lerp(r.uaL, 'z', T.uaLz, k); lerp(r.uaR, 'z', T.uaRz, k); lerp(r.uaL, 'y', T.uaLy, k); lerp(r.uaR, 'y', T.uaRy, k);
  lerp(r.laL, 'x', T.laL, k); lerp(r.laR, 'x', T.laR, k);
  r.body.position.y = state === 'sleep' ? 0.25 : state === 'death' ? 0.12 * r.deadT : 0;
}
