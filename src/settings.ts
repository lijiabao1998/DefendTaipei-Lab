// v22.4 player settings + key bindings, persisted in localStorage.
export type Quality = 'low' | 'med' | 'high';
export interface Settings {
  master: number;
  sfx: number;
  music: number;
  quality: Quality;
  lang: string;
  sens: number;
  vib: boolean;
}
const SKEY = 'dt.settings';
const KKEY = 'dt.keys';
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
const DEF: Settings = {
  master: 0.8,
  sfx: 1,
  music: 0.7,
  quality: coarse ? 'low' : 'high',
  lang: 'zh-TW',
  sens: 1,
  vib: true,
};
function load<T>(k: string, d: T): T {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') };
  } catch {
    return { ...d };
  }
}
export const SET: Settings = load(SKEY, DEF);
export function saveSettings() {
  localStorage.setItem(SKEY, JSON.stringify(SET));
  applyVolumes();
}
export const QSCALE: Record<Quality, number> = { low: 0.5, med: 0.75, high: 1 };
export const QPIX: Record<Quality, number> = { low: 1, med: 1.25, high: 1.5 };

/** rebindable actions; fire = left mouse, menu = Esc are fixed */
export const ACTIONS: [id: string, label: string, def: string][] = [
  ['up', '前進', 'KeyW'],
  ['down', '後退', 'KeyS'],
  ['left', '向左', 'KeyA'],
  ['right', '向右', 'KeyD'],
  ['sprint', '奔跑（按住）', 'ShiftLeft'],
  ['sneak', '潛行／蹲低（切換）', 'KeyC'],
  ['cover', '掩體', 'KeyG'],
  ['interact', '搜刮／互動', 'KeyE'],
  ['vault', '翻越矮牆／沙包', 'Space'],
  ['shove', '推開', 'KeyQ'],
  ['inv', '背包（I 亦可）', 'Tab'],
  ['map', '地圖', 'KeyM'],
  ['shelter', '避難所', 'KeyH'],
  ['barricade', '封門', 'KeyB'],
  ['sleep', '睡覺（快轉）', 'KeyZ'],
  ['light', '手電筒', 'KeyF'],
  ['speed1', '時間 ×1', 'Digit1'],
  ['speed2', '時間 ×3', 'Digit2'],
  ['speed3', '時間 ×20', 'Digit3'],
];
const KDEF = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));
export const BIND: Record<string, string> = load(KKEY, KDEF);
const RESERVED = new Set(['Escape']);
/** key code bound to an action */
export const K = (a: string) => BIND[a];
/** does this key event code trigger the action (Shift either side for sprint, I also opens inventory) */
export function isKey(code: string, a: string) {
  const b = BIND[a];
  if (code === b) return true;
  if (a === 'sprint' && /^Shift/.test(b) && /^Shift/.test(code)) return true;
  if (a === 'inv' && code === 'KeyI' && !Object.values(BIND).includes('KeyI')) return true;
  return false;
}
export function keyName(code: string) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const m: Record<string, string> = {
    Space: '空白鍵',
    ShiftLeft: 'Shift',
    ShiftRight: '右 Shift',
    ControlLeft: 'Ctrl',
    ControlRight: '右 Ctrl',
    AltLeft: 'Alt',
    Tab: 'Tab',
    CapsLock: 'Caps',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Backquote: '`',
  };
  return m[code] || code.replace(/^Numpad/, '數字鍵 ');
}
export const keyLabel = (a: string) => keyName(BIND[a]);
/** bind; a key already used by another action is swapped onto it so there are never two actions on one key */
export function rebind(a: string, code: string): string | null {
  if (RESERVED.has(code)) return null;
  const other = Object.keys(BIND).find(k => k !== a && BIND[k] === code);
  if (other) BIND[other] = BIND[a];
  BIND[a] = code;
  localStorage.setItem(KKEY, JSON.stringify(BIND));
  return other || null;
}
export function resetKeys() {
  Object.assign(BIND, KDEF);
  localStorage.setItem(KKEY, JSON.stringify(BIND));
}
export function conflicts() {
  const seen = new Map<string, string>();
  const bad: string[] = [];
  for (const [a, c] of Object.entries(BIND)) {
    if (seen.has(c)) bad.push(`${seen.get(c)}/${a}`);
    seen.set(c, a);
  }
  return bad;
}
export const vibrate = (ms: number) => SET.vib && navigator.vibrate?.(ms);

// ---- volume: every AudioContext output goes through a per-context gain (music contexts are tagged) ----
const music = new WeakSet<BaseAudioContext>();
const gains = new Map<BaseAudioContext, GainNode>();
export const markMusic = (c: BaseAudioContext) => {
  music.add(c);
  applyVolumes();
};
const vol = (c: BaseAudioContext) => SET.master * (music.has(c) ? SET.music : SET.sfx);
export function applyVolumes() {
  gains.forEach((g, c) => (g.gain.value = vol(c)));
}
if (typeof AudioNode !== 'undefined') {
  const orig = AudioNode.prototype.connect as any;
  (AudioNode.prototype as any).connect = function (this: AudioNode, dst: any, ...a: any[]) {
    if (dst instanceof AudioDestinationNode) {
      const c = this.context;
      let g = gains.get(c);
      if (!g) {
        g = c.createGain();
        orig.call(g, c.destination);
        gains.set(c, g);
      }
      g.gain.value = vol(c);
      if (this !== g) return orig.call(this, g, ...a);
    }
    return orig.call(this, dst, ...a);
  };
}
