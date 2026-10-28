// v23.2 typed event bus: a tiny synchronous emit/on so modules can talk without importing each other.
// Handlers run immediately, in registration order, inside emit(), so routing a direct call through the bus
// keeps timing identical.
export interface GameEvents {
  /** air-raid sirens (萬安 pattern); payload optional, emit('alert') means kind 'alert', 'clear' is the all-clear,
   *  'test' is a short, quieter test chime (not the full siren) */
  alert: { kind: 'alert' | 'clear' | 'test' } | undefined;
  /** a 北廣 broadcast started */
  broadcast: { id: string; station: string; voice: 'synth'; text: string };
  /** a map tile finished loading at the given level of detail */
  tileLoaded: { tx: number; tz: number; lod: number };
  /** a map tile was unloaded */
  tileUnloaded: { tx: number; tz: number };
}
type Handler<K extends keyof GameEvents> = (e: GameEvents[K]) => void;
const handlers: { [K in keyof GameEvents]?: Handler<K>[] } = {};
export function on<K extends keyof GameEvents>(type: K, fn: Handler<K>): () => void {
  const list = (handlers[type] ||= []) as Handler<K>[];
  // Give every subscription its own identity, even when the same callback is registered twice.
  const listener: Handler<K> = e => fn(e);
  list.push(listener);
  return () => {
    const i = list.indexOf(listener);
    if (i >= 0) list.splice(i, 1);
  };
}
// events whose payload may be undefined (e.g. alert) can be emitted with no second argument
export function emit<K extends keyof GameEvents>(
  type: K,
  ...args: undefined extends GameEvents[K] ? [GameEvents[K]?] : [GameEvents[K]]
) {
  const e = args[0] as GameEvents[K];
  // Dispatch the listeners present at the start. Changes during a dispatch affect subsequent emits,
  // including nested emits, but do not skip or add listeners to the current dispatch.
  for (const fn of ((handlers[type] || []) as Handler<K>[]).slice()) fn(e);
}
