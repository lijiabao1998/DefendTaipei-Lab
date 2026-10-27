// v23.2 typed event bus: a tiny synchronous emit/on so modules can talk without importing each other.
// Handlers run immediately, in registration order, inside emit(), so routing a direct call through the bus
// keeps timing identical.
export interface GameEvents {
  /** the prologue's attack begins: street air-raid sirens (萬安 pattern). kind 'clear' is 解除警報. */
  alert: { kind: 'alert' | 'clear' };
  /** radio script for audio/ to speak (synthetic voice text). emitters do not play audio. */
  broadcast: { id: string; station: string; voice: 'synth'; text: string };
}
type Handler<K extends keyof GameEvents> = (e: GameEvents[K]) => void;
const handlers: { [K in keyof GameEvents]?: Handler<K>[] } = {};
export function on<K extends keyof GameEvents>(type: K, fn: Handler<K>): () => void {
  const list = (handlers[type] ||= []) as Handler<K>[];
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}
export function emit<K extends keyof GameEvents>(type: K, e: GameEvents[K]) {
  for (const fn of (handlers[type] || []) as Handler<K>[]) fn(e);
}
