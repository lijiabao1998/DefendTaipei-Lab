// v22.9 pooled explosion VFX for shells / FPV / ROC hits. Everything is allocated once (quality-scaled pools):
// two Points clouds (additive fire + sparks, alpha-blended smoke + dust) with a tiny shader, one InstancedMesh of
// debris chunks with gravity + bounce, pooled shockwave rings, scorch decals and shell-warning circles, and a single
// permanent PointLight (no light added per blast → no shader recompiles). Shake is an offset the caller adds.
import * as THREE from 'three';

type Kind = 0 | 1 | 2 | 3 | 4; // 0 fire, 1 spark, 2 smoke, 3 dust, 4 flash
interface P {
  on: boolean;
  k: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
  j: number;
}
const VS = `attribute float size; attribute float alpha; attribute vec3 col; varying float vA; varying vec3 vC;
uniform float uScale; void main(){ vA=alpha; vC=col; vec4 mv=modelViewMatrix*vec4(position,1.0);
gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*uScale,1.0,256.0); }`;
const FS = `varying float vA; varying vec3 vC; uniform float uSoft; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0;
if(r>1.0) discard; float n=fract(sin(dot(floor(gl_PointCoord*6.0),vec2(12.9898,78.233)))*43758.5453);
float n2=fract(sin(dot(floor(gl_PointCoord*3.0)+vC.r*7.0,vec2(39.3468,11.1351)))*24634.6345);
float a=(1.0-smoothstep(uSoft,1.0,r+0.25*(n2-0.5)))*vA*(0.65+0.25*n+0.1*n2); gl_FragColor=vec4(vC,a); }`;

class Cloud {
  pts: THREE.Points;
  ps: P[] = [];
  pos: Float32Array;
  col: Float32Array;
  al: Float32Array;
  sz: Float32Array;
  mat: THREE.ShaderMaterial;
  next = 0;
  constructor(scene: THREE.Scene, n: number, additive: boolean, soft: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.al = new Float32Array(n);
    this.sz = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uScale: { value: 10 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = additive ? 6 : 5;
    scene.add(this.pts);
    for (let i = 0; i < n; i++)
      this.ps.push({
        on: false,
        k: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        s0: 1,
        s1: 1,
        a0: 1,
        j: 1,
      });
  }
  spawn(o: Partial<P>) {
    // round-robin: oldest particle is recycled when the pool is full
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.ps.length;
    Object.assign(p, { on: true, age: 0, vx: 0, vy: 0, vz: 0, a0: 1, j: 0.75 + Math.random() * 0.5 }, o);
  }
  get live() {
    let n = 0;
    for (const p of this.ps) if (p.on) n++;
    return n;
  }
}

const DEBRIS = new THREE.Color(0x5a5048);
export interface BlastDeps {
  wind: () => [number, number];
  /** ground height under x,z (0 on streets) */
  ground?: (x: number, z: number) => number;
}
export class BlastFX {
  fire: Cloud;
  smoke: Cloud;
  deb: THREE.InstancedMesh;
  dv: {
    on: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    sr: number;
    s: number;
    age: number;
    rest: number;
  }[] = [];
  dn = 0;
  rings: { m: THREE.Mesh; age: number; r: number; on: boolean }[] = [];
  scorch: { m: THREE.Mesh; age: number }[] = [];
  sn = 0;
  warns: { g: THREE.Group; on: boolean; t: number }[] = [];
  light: THREE.PointLight;
  lt = 0;
  lI = 0;
  shakeA = 0;
  shake = new THREE.Vector3();
  q: number;
  stats = { blasts: 0, peakParticles: 0 };
  private tmp = new THREE.Object3D();
  constructor(
    private scene: THREE.Scene,
    quality: 'low' | 'med' | 'high',
    private deps: BlastDeps,
  ) {
    this.q = { low: 0.45, med: 0.7, high: 1 }[quality];
    this.fire = new Cloud(scene, Math.round(500 * this.q), true, 0.0);
    this.smoke = new Cloud(scene, Math.round(1100 * this.q), false, 0.0);
    const nd = Math.round(80 * this.q);
    this.deb = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      nd,
    );
    this.deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.deb.frustumCulled = false;
    this.deb.castShadow = false;
    for (let i = 0; i < nd; i++) {
      this.dv.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, sr: 0, s: 0, age: 0, rest: 0 });
      this.deb.setColorAt(i, DEBRIS.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
      this.tmp.scale.setScalar(0);
      this.tmp.updateMatrix();
      this.deb.setMatrixAt(i, this.tmp.matrix);
    }
    scene.add(this.deb);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8c8b0, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), ringMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, age: 9, r: 1, on: false });
    }
    const st = new THREE.CanvasTexture(scorchCanvas());
    const ns = quality === 'low' ? 8 : 16;
    for (let i = 0; i < ns; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: st,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          opacity: 0,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.scorch.push({ m, age: 1e9 });
    }
    this.light = new THREE.PointLight(0xffb060, 0, 40, 1.6);
    scene.add(this.light);
  }
  /** a shell-warning telegraph: red lethal disc + dashed-looking outer wounding ring (radii in m) */
  warn(x: number, z: number, core: number, wound: number) {
    let w = this.warns.find(w => !w.on);
    if (!w) {
      const g = new THREE.Group();
      const mk = (r0: number, r1: number, c: number, o: number) => {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(r0, r1, 48),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.userData.o = o;
        g.add(m);
        return m;
      };
      mk(0, 1, 0xff2a1a, 0.16); // lethal disc (scaled to core)
      mk(0.93, 1, 0xff3a22, 0.85); // lethal edge
      mk(0.96, 1, 0xffb040, 0.55); // wounding edge (scaled to wound)
      g.renderOrder = 2;
      this.scene.add(g);
      w = { g, on: false, t: 0 };
      this.warns.push(w);
    }
    w.on = true;
    w.t = 0;
    w.g.visible = true;
    w.g.position.set(x, 0.06 + (this.deps.ground?.(x, z) ?? 0), z);
    w.g.children[0].scale.setScalar(core);
    w.g.children[1].scale.setScalar(core);
    w.g.children[2].scale.setScalar(wound);
    return w;
  }
  unwarn(w: { g: THREE.Group; on: boolean } | undefined) {
    if (!w) return;
    w.on = false;
    w.g.visible = false;
  }
  /** big ≈ 1 for an FPV grenade, 1.4 for a 120 mm shell */
  explode(p: THREE.Vector3, big = 1, scorch = true) {
    this.stats.blasts++;
    const q = this.q,
      gy = p.y < 1 ? (this.deps.ground?.(p.x, p.z) ?? 0) : p.y - 0.5;
    const x = p.x,
      z = p.z,
      y = gy;
    const R = () => Math.random() - 0.5;
    // flash
    this.fire.spawn({ k: 4, x, y: y + 1, z, life: 0.12, s0: 7 * big, s1: 9 * big, a0: 1 });
    this.light.position.set(x, y + 2.5, z);
    this.lI = 160 * big;
    this.lt = 0;
    // fireball: fast-expanding, short-lived
    for (let i = 0; i < 26 * q * big; i++) {
      const a = Math.random() * 6.28,
        v = 4 + Math.random() * 7;
      this.fire.spawn({
        k: 0,
        x: x + R() * 0.8,
        y: y + 0.4 + Math.random(),
        z: z + R() * 0.8,
        vx: Math.cos(a) * v * 0.7,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(a) * v * 0.7,
        life: 0.3 + Math.random() * 0.35,
        s0: 1.6 * big,
        s1: 4.5 * big,
        a0: 0.9,
      });
    }
    // sparks / hot fragments
    for (let i = 0; i < 40 * q * big; i++) {
      const a = Math.random() * 6.28,
        e = 0.2 + Math.random() * 1.1,
        v = 14 + Math.random() * 22;
      this.fire.spawn({
        k: 1,
        x,
        y: y + 0.5,
        z,
        vx: Math.cos(a) * Math.cos(e) * v,
        vy: Math.sin(e) * v,
        vz: Math.sin(a) * Math.cos(e) * v,
        life: 0.4 + Math.random() * 0.5,
        s0: 0.35,
        s1: 0.15,
        a0: 1,
      });
    }
    // dark smoke rising from the fireball, then grey-brown lingering smoke drifting with the wind
    for (let i = 0; i < 80 * q * big; i++)
      this.smoke.spawn({
        k: 2,
        x: x + R() * 4,
        y: y + 0.5 + Math.random() * 2,
        z: z + R() * 2,
        vx: R() * 5,
        vy: 1.5 + Math.random() * 6,
        vz: R() * 5,
        age: -Math.random() * 0.25,
        life: 4 + Math.random() * 5,
        s0: 1.5 * big,
        s1: (5 + Math.random() * 5) * big,
        a0: 1,
      });
    // dust / debris column: tall narrow plume of soil
    for (let i = 0; i < 22 * q * big; i++)
      this.smoke.spawn({
        k: 3,
        x: x + R() * 1.2,
        y: y + 0.3,
        z: z + R() * 1.2,
        vx: R() * 2,
        vy: 6 + Math.random() * 12,
        vz: R() * 2,
        life: 1.6 + Math.random() * 1.5,
        s0: 1 * big,
        s1: 3.8 * big,
        a0: 0.95,
      });
    // ground dust skirt: low, fast outward ring
    for (let i = 0; i < 28 * q * big; i++) {
      const a = (i / (28 * q * big)) * 6.28 + R() * 0.2,
        v = 9 + Math.random() * 6;
      this.smoke.spawn({
        k: 3,
        x,
        y: y + 0.3,
        z,
        vx: Math.cos(a) * v,
        vy: 0.4 + Math.random(),
        vz: Math.sin(a) * v,
        life: 1.4 + Math.random(),
        s0: 1 * big,
        s1: 3.5 * big,
        a0: 0.55,
      });
    }
    // debris chunks
    for (let i = 0; i < 12 * q * big; i++) {
      const d = this.dv[this.dn];
      this.dn = (this.dn + 1) % this.dv.length;
      const a = Math.random() * 6.28,
        e = 0.5 + Math.random() * 0.9,
        v = 6 + Math.random() * 12;
      Object.assign(d, {
        on: true,
        x: x + R(),
        y: y + 0.5,
        z: z + R(),
        vx: Math.cos(a) * Math.cos(e) * v,
        vy: Math.sin(e) * v,
        vz: Math.sin(a) * Math.cos(e) * v,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        sr: R() * 20,
        s: 0.2 + Math.random() * 0.35,
        age: 0,
        rest: 0,
      });
    }
    // shockwave ring
    const r = this.rings.find(r => !r.on) || this.rings[0];
    Object.assign(r, { on: true, age: 0, r: 9 * big });
    r.m.visible = true;
    r.m.position.set(x, y + 0.1, z);
    if (scorch) {
      const s = this.scorch[this.sn];
      this.sn = (this.sn + 1) % this.scorch.length;
      s.age = 0;
      s.m.visible = true;
      s.m.position.set(x, y + 0.12, z);
      s.m.rotation.z = Math.random() * 6.28;
      s.m.scale.setScalar(7 * big * (0.85 + Math.random() * 0.3));
    }
  }
  /** camera shake from a blast at distance d (m): small, fast-decaying offset only */
  kick(d: number, big = 1) {
    this.shakeA = Math.max(this.shakeA, Math.min(0.9, (big * 14) / (8 + d)) * (d < 80 ? 1 : 0));
  }
  update(dt: number, cam: THREE.Camera, viewH: number) {
    const [wx, wz] = this.deps.wind();
    // ortho: pixels per world metre
    const oc = cam as THREE.OrthographicCamera;
    const sc = oc.isOrthographicCamera ? viewH / ((oc.top - oc.bottom) / oc.zoom) : viewH / 60;
    this.fire.mat.uniforms.uScale.value = this.smoke.mat.uniforms.uScale.value = sc;
    this.step(this.fire, dt, wx, wz);
    this.step(this.smoke, dt, wx, wz);
    this.stats.peakParticles = Math.max(this.stats.peakParticles, this.fire.live + this.smoke.live);
    // light
    this.lt += dt;
    this.light.intensity = this.lI * Math.max(0, 1 - this.lt / 0.25) ** 2;
    // debris
    let any = false;
    for (let i = 0; i < this.dv.length; i++) {
      const d = this.dv[i];
      if (!d.on) continue;
      any = true;
      d.age += dt;
      const gy = this.deps.ground?.(d.x, d.z) ?? 0;
      if (d.rest === 0) {
        d.vy -= 9.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += d.sr * dt;
        d.ry += d.sr * 0.7 * dt;
        if (d.y < gy + d.s * 0.5) {
          d.y = gy + d.s * 0.5;
          if (Math.abs(d.vy) < 1.5) d.rest = 1;
          d.vy = -d.vy * 0.35;
          d.vx *= 0.55;
          d.vz *= 0.55;
          d.sr *= 0.5;
        }
      }
      const s = d.age > 6 ? Math.max(0, d.s * (1 - (d.age - 6) / 2)) : d.s;
      if (s <= 0) d.on = false;
      this.tmp.position.set(d.x, d.y, d.z);
      this.tmp.rotation.set(d.rx, d.ry, 0);
      this.tmp.scale.set(s, s * 0.7, s * 0.9);
      this.tmp.updateMatrix();
      this.deb.setMatrixAt(i, this.tmp.matrix);
    }
    if (any || this.deb.userData.was) this.deb.instanceMatrix.needsUpdate = true;
    this.deb.userData.was = any;
    // rings
    for (const r of this.rings) {
      if (!r.on) continue;
      r.age += dt;
      const k = r.age / 0.35;
      if (k >= 1) {
        r.on = false;
        r.m.visible = false;
        continue;
      }
      r.m.scale.setScalar(0.5 + r.r * (1 - (1 - k) ** 2));
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
    // scorch decals fade over 120 s
    for (const s of this.scorch) {
      if (!s.m.visible) continue;
      s.age += dt;
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.age * 8) * Math.max(0, 1 - s.age / 120);
      if (s.age > 120) s.m.visible = false;
    }
    // warnings: pulse faster as impact nears (caller removes them)
    for (const w of this.warns) {
      if (!w.on) continue;
      w.t += dt;
      const pul = 0.6 + 0.4 * Math.abs(Math.sin(w.t * (4 + w.t * 3)));
      for (const c of w.g.children)
        ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = c.userData.o * pul;
    }
    // shake: random offset, decays in ~0.4 s
    this.shakeA *= Math.exp(-dt * 9);
    if (this.shakeA < 0.01) this.shakeA = 0;
    this.shake.set(
      (Math.random() - 0.5) * this.shakeA,
      (Math.random() - 0.5) * this.shakeA * 0.5,
      (Math.random() - 0.5) * this.shakeA,
    );
  }
  private step(c: Cloud, dt: number, wx: number, wz: number) {
    const { pos, col, al, sz } = c;
    for (let i = 0; i < c.ps.length; i++) {
      const p = c.ps[i];
      if (!p.on) {
        if (al[i] !== 0) al[i] = 0;
        continue;
      }
      p.age += dt;
      if (p.age < 0) {
        al[i] = 0;
        continue;
      }
      const t = p.age / p.life;
      if (t >= 1) {
        p.on = false;
        al[i] = 0;
        continue;
      }
      let r = 1,
        g = 1,
        b = 1,
        a = p.a0;
      if (p.k === 1) {
        p.vy -= 9.8 * dt;
        p.vx *= 1 - dt * 1.5;
        p.vz *= 1 - dt * 1.5;
        r = 1;
        g = 0.75 - t * 0.4;
        b = 0.35 - t * 0.3;
        a = 1 - t;
      } else if (p.k === 0 || p.k === 4) {
        const dr = Math.exp(-dt * 6);
        p.vx *= dr;
        p.vz *= dr;
        p.vy = p.vy * dr + dt * 3;
        // white-yellow core → orange → dark red/black
        r = 1;
        g = Math.max(0.12, 0.85 - t * 1.3);
        b = Math.max(0.03, 0.55 - t * 1.6);
        a = p.a0 * (1 - t) ** 1.5;
      } else {
        const smoke = p.k === 2;
        const dr = Math.exp(-dt * (smoke ? 1.3 : 2.4));
        p.vx = p.vx * dr + wx * dt * (smoke ? 0.5 : 0.25);
        p.vz = p.vz * dr + wz * dt * (smoke ? 0.5 : 0.25);
        p.vy = smoke ? p.vy * dr + dt * 0.25 : p.vy * dr - dt * 5;
        // smoke starts near-black, fades to grey-brown; dust is soil brown
        const lv = smoke ? 0.05 + Math.min(1, t * 1.6) * 0.2 : 0.36;
        r = lv * p.j * (smoke ? 1 : 1.05);
        g = lv * p.j * 0.9;
        b = lv * p.j * (smoke ? 0.8 : 0.7);
        a = Math.min(1, p.a0 * (smoke ? 1.35 : 1.1)) * Math.min(1, t * 10) * (1 - t) ** (smoke ? 0.5 : 1);
      }
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
      al[i] = a;
      sz[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
    }
    const ge = c.pts.geometry.attributes;
    ge.position.needsUpdate = ge.col.needsUpdate = ge.alpha.needsUpdate = ge.size.needsUpdate = true;
  }
}
function scorchCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(4,3,2,1)');
  g.addColorStop(0.4, 'rgba(14,11,8,0.95)');
  g.addColorStop(0.72, 'rgba(30,24,18,0.6)');
  g.addColorStop(1, 'rgba(40,32,24,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  // radial streaks + a small crater pit
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.28,
      l = 30 + Math.random() * 32;
    x.strokeStyle = `rgba(10,8,6,${0.2 + Math.random() * 0.3})`;
    x.lineWidth = 1 + Math.random() * 3;
    x.beginPath();
    x.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10);
    x.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l);
    x.stroke();
  }
  x.fillStyle = 'rgba(0,0,0,0.9)';
  x.beginPath();
  x.ellipse(64, 64, 12, 10, 0, 0, 6.28);
  x.fill();
  x.fillStyle = 'rgba(70,60,50,0.6)';
  x.beginPath();
  x.arc(60, 60, 5, 0, 6.28);
  x.fill();
  return c;
}
