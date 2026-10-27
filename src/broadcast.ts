// v23.1 voiced radio broadcasts + 萬安-style air-raid sirens, all synthesized at runtime (no recordings).
// Speech: the browser's Web Speech API (zh-TW voice, else any zh-*); speechSynthesis cannot be routed through
// WebAudio, so a WebAudio "radio bed" (hiss, crackle, tuning blips, dropouts) plays alongside it in its own
// context, scaled by settings → 廣播. Sirens: 緊急警報 1 long 15 s + 2 short 5 s, 5 s gaps, ×3 (115 s, as
// published for the real drills); 解除警報 one long tone (90 s real, shortened to 30 s here). Several detuned,
// delayed street speakers + a synthetic reverb tail; muffled (low-pass) while the player is indoors.
import { SET, markRadio } from './settings';

let RC: AudioContext | null = null;
const rctx = () => {
  try {
    if (!RC) markRadio((RC = new AudioContext()));
    return RC;
  } catch {
    return null;
  }
};
export const bcStats = { spoken: 0, queued: 0, beds: 0, sirens: 0, voice: '' as string, last: '' };
let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!ss) return;
  const v = ss.getVoices();
  voice =
    v.find(x => /zh[-_]TW/i.test(x.lang)) ||
    v.find(x => /zh[-_](HK|Hant)/i.test(x.lang)) ||
    v.find(x => /^zh/i.test(x.lang)) ||
    null;
  bcStats.voice = voice ? `${voice.name} (${voice.lang})` : '';
}
/** mobile: speech + the bed context need a user gesture once */
export function unlockBroadcast() {
  const go = () => {
    rctx()?.resume();
    try {
      pickVoice();
      if (typeof speechSynthesis !== 'undefined' && !(unlockBroadcast as any).done) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
        (unlockBroadcast as any).done = 1;
      }
    } catch {
      /* no speech */
    }
  };
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) addEventListener(ev, go, { passive: true });
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = pickVoice;
}
let noise: AudioBuffer | null = null;
function noiseBuf(ac: BaseAudioContext) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}
/** AM-radio bed for `dur` seconds: band-passed hiss, random crackles, short tuning sweeps at both ends, dropouts */
function bed(dur: number) {
  const ac = rctx();
  if (!ac) return () => {};
  bcStats.beds++;
  const t0 = ac.currentTime + 0.02,
    out = ac.createGain();
  out.gain.value = 0.9;
  out.connect(ac.destination);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf(ac);
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const hg = ac.createGain();
  hg.gain.setValueAtTime(0, t0);
  hg.gain.linearRampToValueAtTime(0.05, t0 + 0.3);
  // dropouts: brief swells of static while the "signal" fades
  for (let t = 1.5; t < dur - 1; t += 2 + Math.random() * 4) {
    hg.gain.setValueAtTime(0.05, t0 + t);
    hg.gain.linearRampToValueAtTime(0.13, t0 + t + 0.08);
    hg.gain.linearRampToValueAtTime(0.05, t0 + t + 0.35 + Math.random() * 0.3);
  }
  hg.gain.setValueAtTime(0.05, t0 + dur);
  hg.gain.linearRampToValueAtTime(0, t0 + dur + 0.6);
  src.connect(bp).connect(hg).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.8);
  // crackles
  for (let t = 0.3; t < dur; t += 0.15 + Math.random() * 0.9) {
    const c = ac.createBufferSource();
    c.buffer = noiseBuf(ac);
    const g = ac.createGain();
    const at = t0 + t;
    g.gain.setValueAtTime(0.12 + Math.random() * 0.15, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.02 + Math.random() * 0.03);
    c.connect(g).connect(out);
    c.start(at, Math.random());
    c.stop(at + 0.06);
  }
  // tuning sweeps (heterodyne whistle) at start and end
  for (const [at, f0, f1] of [
    [t0, 2600, 600],
    [t0 + dur, 700, 2400],
  ]) {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + 0.35);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.06, at + 0.05);
    g.gain.linearRampToValueAtTime(0, at + 0.4);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.45);
  }
  return () => {
    try {
      out.gain.setTargetAtTime(0, ac.currentTime, 0.15);
      src.stop(ac.currentTime + 0.6);
    } catch {
      /* already stopped */
    }
  };
}
// ---------- voiced broadcasts: one at a time, queued ----------
const queue: { text: string; who: string }[] = [];
let busy = false;
/** read a broadcast aloud over the radio bed (settings → 廣播語音 / 廣播 volume) */
export function broadcast(who: string, text: string) {
  if (!SET.voice || SET.master * SET.radio <= 0.001) return;
  if (queue.length > 2) queue.shift();
  queue.push({ who, text });
  bcStats.queued++;
  next();
}
function next() {
  if (busy || !queue.length) return;
  const { who, text } = queue.shift()!;
  busy = true;
  bcStats.last = text;
  const clean = text.replace(/[…「」『』（）()—]/g, '，').replace(/，+/g, '，');
  const est = Math.min(30, 1.2 + clean.length * 0.22);
  const stopBed = bed(est + 0.5);
  const done = () => {
    if (!busy) return;
    busy = false;
    stopBed();
    setTimeout(next, 700);
  };
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!ss || (!voice && (pickVoice(), !voice) && !ss.getVoices().length)) {
    setTimeout(done, est * 1000); // no speech engine: static only
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance(clean);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'zh-TW';
    // occupation broadcasts slower / lower, the underground station hurried
    const occ = /佔領|解放軍|軍管/.test(who + text) && !/自由之聲/.test(who);
    u.rate = /自由之聲/.test(who) ? 1.12 : occ ? 0.9 : 1.0;
    u.pitch = occ ? 0.8 : 1.0;
    u.volume = Math.min(1, SET.master * SET.radio);
    u.onend = u.onerror = done;
    ss.cancel();
    ss.speak(u);
    bcStats.spoken++;
    setTimeout(done, (est + 8) * 1000); // safety if onend never fires (some mobile engines)
  } catch {
    setTimeout(done, est * 1000);
  }
}
export function stopBroadcasts() {
  queue.length = 0;
  try {
    speechSynthesis?.cancel();
  } catch {
    /* none */
  }
}
// ---------- 萬安-style air-raid sirens ----------
let sirenStop: (() => void) | null = null;
/** kind 'alert' = 緊急警報, 'clear' = 解除警報. indoor() is polled to muffle the sound inside buildings */
export function airRaid(kind: 'alert' | 'clear', indoor: () => boolean, sfx: AudioContext | null) {
  const ac = sfx;
  if (!ac) return () => {};
  sirenStop?.();
  bcStats.sirens++;
  const t0 = ac.currentTime + 0.1;
  const tones: [number, number][] = [];
  if (kind === 'alert')
    for (let c = 0; c < 3; c++) {
      const b = c * 40;
      tones.push([b, b + 15], [b + 20, b + 25], [b + 30, b + 35]);
    }
  else tones.push([0, 30]);
  const end = tones[tones.length - 1][1] + 6;
  const master = ac.createGain();
  master.gain.value = 0.32;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 9000;
  master.connect(lp).connect(ac.destination);
  // synthetic reverb: decaying noise impulse (city canyon echo)
  const conv = ac.createConvolver();
  const L = Math.floor(ac.sampleRate * 3.2),
    ir = ac.createBuffer(2, L, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2);
  }
  conv.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.55;
  conv.connect(wet).connect(master);
  const nodes: AudioScheduledSourceNode[] = [];
  // street speakers: distance → delay, level, high-frequency loss; each slightly detuned
  const spk = [
    [0.0, 1.0, 7000, 1.0],
    [0.35, 0.6, 3500, 1.018],
    [0.9, 0.42, 2200, 0.985],
    [1.6, 0.3, 1500, 1.03],
    [2.4, 0.2, 1100, 0.972],
  ];
  for (const [dl, lv, cut, det] of spk) {
    const g = ac.createGain();
    g.gain.value = 0;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cut;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) pan.pan.value = (Math.random() * 2 - 1) * 0.8;
    const d = ac.createDelay(3);
    d.delayTime.value = dl;
    // motor siren: two rotors → a sawtooth pair at roughly a minor third, + light vibrato
    const os = [1, 1.19].map(r => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      for (const [a, b] of tones) {
        const s = t0 + a,
          e = t0 + b;
        o.frequency.setValueAtTime(110 * r * det, s);
        o.frequency.exponentialRampToValueAtTime(560 * r * det, s + Math.min(3.2, (b - a) * 0.55));
        o.frequency.setValueAtTime(560 * r * det, e);
        o.frequency.exponentialRampToValueAtTime(140 * r * det, e + 4.2); // coast down in the gap
      }
      const og = ac.createGain();
      og.gain.value = r === 1 ? 0.55 : 0.4;
      o.connect(og).connect(f);
      o.start(t0);
      o.stop(t0 + end + 3);
      nodes.push(o);
      return o;
    });
    void os;
    for (const [a, b] of tones) {
      g.gain.setValueAtTime(0, t0 + a);
      g.gain.linearRampToValueAtTime(lv, t0 + a + Math.min(2.5, (b - a) * 0.4));
      g.gain.setValueAtTime(lv, t0 + b);
      g.gain.linearRampToValueAtTime(lv * 0.35, t0 + b + 1.5);
      g.gain.linearRampToValueAtTime(0, t0 + b + 4);
    }
    f.connect(g).connect(d);
    if (pan) (d.connect(pan).connect(master), pan.connect(conv));
    else (d.connect(master), d.connect(conv));
  }
  const iv = setInterval(() => {
    lp.frequency.setTargetAtTime(indoor() ? 650 : 9000, ac.currentTime, 0.4);
    master.gain.setTargetAtTime(indoor() ? 0.2 : 0.32, ac.currentTime, 0.4);
  }, 400);
  const stop = () => {
    clearInterval(iv);
    try {
      master.gain.setTargetAtTime(0, ac.currentTime, 0.5);
      nodes.forEach(n => n.stop(ac.currentTime + 2));
    } catch {
      /* stopped */
    }
    if (sirenStop === stop) sirenStop = null;
  };
  setTimeout(stop, (end + 4) * 1000);
  sirenStop = stop;
  return stop;
}
export const sirenOn = () => !!sirenStop;
