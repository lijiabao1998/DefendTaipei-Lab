// v22.6 procedural audio: every sound is synthesised with WebAudio (no samples). Two shared contexts:
// SFX (settings → 音效) and AMB (ambience / rain / shelter life, tagged with markMusic → 音樂／環境).
import { markMusic } from './settings';

let SFX: AudioContext | null = null;
let AMB: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
function ctx(amb = false): AudioContext | null {
  try {
    if (amb) {
      if (!AMB) markMusic((AMB = new AudioContext()));
      return AMB;
    }
    return (SFX ||= new AudioContext());
  } catch {
    return null;
  }
}
/** mobile browsers start contexts suspended: resume on the first touch / click / key */
export function unlockAudio() {
  const go = () => {
    ctx()?.resume();
    ctx(true)?.resume();
  };
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) addEventListener(ev, go, { passive: true });
}
export const sfxCtx = () => ctx();
/** how many of each sound were started (checks / debugging) */
export const auStats: Record<string, number> = {};
const cnt = (k: string) => (auStats[k] = (auStats[k] || 0) + 1);
function noise(c: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}
type Env = { a?: number; d: number; v: number; at?: number };
function env(c: AudioContext, g: GainNode, e: Env) {
  const t = (e.at ?? 0) + c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.v), t + (e.a ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + (e.a ?? 0.003) + e.d);
  return t;
}
/** a filtered noise burst */
function burst(
  c: AudioContext,
  out: AudioNode,
  f: { type: BiquadFilterType; hz: number; q?: number },
  e: Env,
  rate = 1,
) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.playbackRate.value = rate;
  const bq = c.createBiquadFilter();
  bq.type = f.type;
  bq.frequency.value = f.hz;
  bq.Q.value = f.q ?? 0.8;
  const g = c.createGain();
  s.connect(bq).connect(g).connect(out);
  const t = env(c, g, e);
  s.start(t, Math.random());
  s.stop(t + (e.a ?? 0.003) + e.d + 0.05);
}
function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, e: Env) {
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  o.connect(g).connect(out);
  const t = env(c, g, e);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (e.a ?? 0.003) + e.d);
  o.start(t);
  o.stop(t + (e.a ?? 0.003) + e.d + 0.05);
}
/** distance + walls: a gain and a low-pass bus; indoor adds a short slap-back room */
function bus(c: AudioContext, dist: number, indoor = false, ref = 6) {
  const g = c.createGain();
  g.gain.value = 1 / (1 + Math.max(0, dist) / ref);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(500, 16000 / (1 + dist / 12));
  g.connect(lp).connect(c.destination);
  if (indoor) {
    const dl = c.createDelay(0.3);
    dl.delayTime.value = 0.045;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    g.connect(dl).connect(fb).connect(dl);
    fb.connect(lp);
  } else if (dist > 25) {
    // street echo off the façades
    const dl = c.createDelay(1);
    dl.delayTime.value = 0.18 + Math.random() * 0.1;
    const fb = c.createGain();
    fb.gain.value = 0.25;
    g.connect(dl).connect(fb).connect(lp);
  }
  setTimeout(() => g.disconnect(), 4000);
  return g;
}

export type GunKind = 'pistol' | 'rifle' | 'sniper' | 'mg' | 'shotgun' | 'at';
export function gunKind(id: string, d: any): GunKind {
  if (d.at) return 'at';
  if (/qsz|t75p|pistol|92/.test(id)) return 'pistol';
  if ((d.dmg ?? 0) >= 85) return 'sniper';
  if ((d.cd ?? 1) < 0.12) return 'mg';
  if (/12/.test(d.cal || '') || /shot/.test(id)) return 'shotgun';
  return 'rifle';
}
/** one gunshot; dist in m from the listener (the player), indoor = either end under a roof */
export function gunshot(k: GunKind, dist = 0, indoor = false) {
  const c = ctx();
  if (!c || dist > 260) return;
  cnt('gun_' + k);
  const o = bus(c, dist, indoor, k === 'pistol' ? 5 : 9);
  const P = {
    pistol: { crack: 2600, v: 0.55, body: 160, d: 0.12 },
    rifle: { crack: 2000, v: 0.75, body: 120, d: 0.2 },
    sniper: { crack: 1500, v: 1, body: 80, d: 0.45 },
    mg: { crack: 1800, v: 0.7, body: 110, d: 0.16 },
    shotgun: { crack: 900, v: 0.9, body: 90, d: 0.3 },
    at: { crack: 500, v: 1, body: 50, d: 0.9 },
  }[k];
  burst(c, o, { type: 'bandpass', hz: P.crack, q: 0.6 }, { d: P.d * 0.5, v: P.v });
  burst(c, o, { type: 'lowpass', hz: 900 }, { d: P.d * 1.6, v: P.v * 0.8 });
  tone(c, o, 'sine', P.body * 1.8, P.body * 0.5, { d: P.d, v: P.v * 0.9 });
  if (dist > 40) burst(c, o, { type: 'lowpass', hz: 300 }, { at: 0.08, d: 0.6, v: 0.25 }); // rolling report
}
export type Surface = 'tile' | 'asphalt' | 'wood' | 'metro';
export function footstep(sf: Surface, dist = 0, heavy = false, run = false) {
  const c = ctx();
  if (!c || dist > 22) return;
  cnt('step_' + sf + (heavy ? '_enemy' : ''));
  const o = bus(c, dist, sf === 'wood' || sf === 'metro', 3);
  const v = (run ? 0.22 : 0.13) * (heavy ? 1.4 : 1);
  if (sf === 'tile') burst(c, o, { type: 'highpass', hz: 2200 }, { d: 0.04, v });
  else if (sf === 'asphalt') burst(c, o, { type: 'bandpass', hz: 700, q: 0.7 }, { d: 0.07, v: v * 0.9 });
  else if (sf === 'wood') {
    tone(c, o, 'triangle', 190, 120, { d: 0.08, v: v * 0.9 });
    burst(c, o, { type: 'bandpass', hz: 1200 }, { d: 0.03, v: v * 0.5 });
  } else {
    burst(c, o, { type: 'bandpass', hz: 3200, q: 6 }, { d: 0.12, v: v * 0.8 }); // metal plate ring
    burst(c, o, { type: 'highpass', hz: 1800 }, { d: 0.04, v: v * 0.6 });
  }
  if (heavy) tone(c, o, 'sine', 90, 60, { d: 0.06, v: v * 0.6 }); // boots + kit
}
/** non-voice: a body thud with a sharp exhale of air */
export function hurt(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('hurt');
  const o = bus(c, dist, false, 4);
  tone(c, o, 'sine', 120, 55, { d: 0.18, v: 0.6 });
  burst(c, o, { type: 'bandpass', hz: 1100, q: 1.5 }, { a: 0.01, d: 0.22, v: 0.18 });
}
export function death(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('death');
  const o = bus(c, dist, false, 5);
  tone(c, o, 'sine', 100, 40, { d: 0.35, v: 0.7 });
  burst(c, o, { type: 'lowpass', hz: 400 }, { at: 0.22, d: 0.3, v: 0.5 }); // falls
  burst(c, o, { type: 'bandpass', hz: 2500, q: 3 }, { at: 0.3, d: 0.1, v: 0.12 }); // kit clatters
}
/** rummaging through a container: a few rustles, knocks and clinks */
export function rummage() {
  const c = ctx();
  if (!c) return;
  cnt('rummage');
  const o = bus(c, 0, true, 3);
  for (let i = 0; i < 6; i++) {
    const at = i * 0.12 + Math.random() * 0.08;
    if (Math.random() < 0.6)
      burst(c, o, { type: 'bandpass', hz: 2500 + Math.random() * 3000, q: 1 }, { at, d: 0.07, v: 0.12 });
    else if (Math.random() < 0.5) tone(c, o, 'triangle', 220 + Math.random() * 120, 150, { at, d: 0.06, v: 0.12 });
    else tone(c, o, 'sine', 2400 + Math.random() * 1500, 2300, { at, d: 0.09, v: 0.05 });
  }
}

// ---------- continuous beds + random street events ----------
let rainG: GainNode | null = null;
let rainLP: BiquadFilterNode | null = null;
let homeG: GainNode | null = null;
function rainBed(c: AudioContext) {
  if (rainG) return;
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  rainLP = c.createBiquadFilter();
  rainLP.type = 'lowpass';
  rainLP.frequency.value = 5000;
  rainG = c.createGain();
  rainG.gain.value = 0;
  s.connect(rainLP).connect(rainG).connect(c.destination);
  s.start();
}
function homeBed(c: AudioContext) {
  if (homeG) return;
  // a low room tone (fridge / fan hum)
  const o = c.createOscillator();
  o.frequency.value = 58;
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 350;
  bp.Q.value = 2;
  homeG = c.createGain();
  homeG.gain.value = 0;
  const og = c.createGain();
  og.gain.value = 0.15;
  o.connect(og).connect(homeG);
  s.connect(bp).connect(homeG);
  homeG.connect(c.destination);
  o.start();
  s.start();
}
export type AmbState = {
  rain: number;
  indoor: boolean;
  home: boolean;
  night: boolean;
  metro: boolean;
  combat: boolean;
};
let next = 4;
let homeNext = 3;
export function ambience(dt: number, st: AmbState) {
  const c = ctx(true);
  if (!c || c.state !== 'running') return;
  rainBed(c);
  homeBed(c);
  const rv = st.metro ? 0 : st.rain * (st.indoor ? 0.12 : 0.35);
  rainG!.gain.setTargetAtTime(rv, c.currentTime, 0.5);
  rainLP!.frequency.setTargetAtTime(st.indoor ? 900 : 5000, c.currentTime, 0.3);
  homeG!.gain.setTargetAtTime(st.home ? 0.05 : 0, c.currentTime, 0.6);
  if (st.home && (homeNext -= dt) <= 0) {
    homeNext = 4 + Math.random() * 7;
    shelterLife(c);
  }
  if ((next -= dt) > 0 || st.metro) return;
  next = 6 + Math.random() * 12;
  const r = Math.random();
  const far = st.indoor ? 0.4 : 1;
  if (r < 0.22) explosion(c, far);
  else if (r < 0.4 && !st.night) broadcast(c, far);
  else if (r < 0.6) dog(c, far);
  else if (r < 0.8 && !st.night) scooter(c, far);
  else explosion(c, far * 0.5);
}
function ambOut(c: AudioContext, v: number) {
  const g = c.createGain();
  g.gain.value = v;
  g.connect(c.destination);
  setTimeout(() => g.disconnect(), 9000);
  return g;
}
function explosion(c: AudioContext, v: number) {
  cnt('amb_explosion');
  const o = ambOut(c, 0.5 * v);
  burst(c, o, { type: 'lowpass', hz: 160 }, { a: 0.02, d: 2.4, v: 1 }, 0.5);
  tone(c, o, 'sine', 50, 28, { a: 0.02, d: 1.6, v: 0.8 });
}
/** a loudspeaker truck far down the street: a chime, then a muffled formant drone (no words) */
function broadcast(c: AudioContext, v: number) {
  cnt('amb_broadcast');
  const o = ambOut(c, 0.12 * v);
  const lp = c.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = 1100;
  lp.Q.value = 1.2;
  lp.connect(o);
  [784, 659, 523].forEach((f, i) => tone(c, lp, 'sine', f, f, { at: i * 0.35, d: 0.5, v: 0.6 }));
  const sq = c.createOscillator();
  sq.type = 'sawtooth';
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.5;
  const lg = c.createGain();
  lg.gain.value = 40;
  lfo.connect(lg).connect(sq.frequency);
  sq.frequency.value = 170;
  const am = c.createGain();
  am.gain.value = 0;
  const t = c.currentTime + 1.2;
  for (let i = 0; i < 14; i++) am.gain.setValueAtTime(Math.random() < 0.7 ? 0.5 : 0.05, t + i * 0.22);
  am.gain.setValueAtTime(0, t + 3.2);
  sq.connect(am).connect(lp);
  sq.start(t);
  lfo.start(t);
  sq.stop(t + 3.3);
  lfo.stop(t + 3.3);
}
function dog(c: AudioContext, v: number) {
  cnt('amb_dog');
  const o = ambOut(c, 0.18 * v);
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    tone(c, o, 'sawtooth', 520, 300, { at: i * 0.32, d: 0.12, v: 0.4 });
    burst(c, o, { type: 'bandpass', hz: 900, q: 3 }, { at: i * 0.32, d: 0.1, v: 0.3 });
  }
}
function scooter(c: AudioContext, v: number) {
  cnt('amb_scooter');
  const o = ambOut(c, 0.1 * v);
  const s = c.createOscillator();
  s.type = 'sawtooth';
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  s.connect(lp).connect(g).connect(o);
  const t = c.currentTime;
  s.frequency.setValueAtTime(95, t);
  s.frequency.linearRampToValueAtTime(130, t + 1.6); // approaching (doppler up)
  s.frequency.linearRampToValueAtTime(80, t + 3.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 1.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  s.start(t);
  s.stop(t + 3.6);
}
/** the shelter: a cup set down, a pot lid, a clock, a chair creak */
function shelterLife(c: AudioContext) {
  cnt('amb_shelter');
  const o = ambOut(c, 0.25);
  const r = Math.random();
  if (r < 0.3) tone(c, o, 'sine', 3100, 3000, { d: 0.25, v: 0.15 });
  else if (r < 0.55)
    for (let i = 0; i < 4; i++) burst(c, o, { type: 'highpass', hz: 4000 }, { at: i, d: 0.015, v: 0.15 });
  else if (r < 0.8) tone(c, o, 'triangle', 240, 180, { a: 0.05, d: 0.4, v: 0.15 });
  else {
    tone(c, o, 'triangle', 900, 880, { d: 0.5, v: 0.12 });
    tone(c, o, 'triangle', 1210, 1190, { d: 0.4, v: 0.06 });
  }
}
