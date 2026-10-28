// Data-driven story loader/runner. Cross-module effects go out through core/bus only.
// Importing this module does not start the story and does not emit.
import { emit } from '../core/bus';
import { AM765, AM765_STATION, type RadioScript } from './broadcasts/am765';
import { STORY_ACTS, STORY_EVENTS } from './events/catalog';
import type { StoryEmit, StoryEvent } from './events/types';

export type { StoryEmit, StoryEvent } from './events/types';
export type { RadioScript } from './broadcasts/am765';
export { AM765_STATION } from './broadcasts/am765';
export { ALL_CLEAR_ID } from './events/act4';
export { STORY_ACTS };

const scripts = new Map<string, RadioScript>(AM765.map(s => [s.id, s]));

function assertCatalog() {
  const ids = new Set<string>();
  for (const ev of STORY_EVENTS) {
    if (ids.has(ev.id)) throw new Error(`story: duplicate event ${ev.id}`);
    ids.add(ev.id);
    for (const step of ev.emits) {
      if (step.type === 'broadcast.play' && !scripts.has(step.id)) {
        throw new Error(`story: ${ev.id} references missing broadcast ${step.id}`);
      }
    }
  }
  const allClear = STORY_EVENTS.find(e => e.act === 4 && e.ending && e.emits.some(s => s.type === 'alert.clear'));
  if (!allClear) throw new Error('story: act-4 all-clear ending is missing');
}

let checked = false;
function checkOnce() {
  if (checked) return;
  assertCatalog();
  checked = true;
}

/** Load events and AM765 scripts. Does not emit. */
export function loadStory(): {
  acts: typeof STORY_ACTS;
  events: readonly StoryEvent[];
  broadcasts: readonly RadioScript[];
} {
  checkOnce();
  return { acts: STORY_ACTS, events: STORY_EVENTS, broadcasts: AM765 };
}

function dispatch(step: StoryEmit) {
  // Draft actions → existing bus, plus `broadcast` for radio copy (no audio played here).
  // alert.issue level 'test' is the short hourly test tone: emit('alert', { kind: 'test' }).
  // any other issue level is the full 萬安 siren: emit('alert', { kind: 'alert' }).
  // alert.clear is 解除警報: emit('alert', { kind: 'clear' }).
  if (step.type === 'alert.issue') {
    emit('alert', { kind: step.level === 'test' ? 'test' : 'alert' });
    return;
  }
  if (step.type === 'alert.clear') {
    emit('alert', { kind: 'clear' });
    return;
  }
  const script = scripts.get(step.id);
  if (!script) return;
  emit('broadcast', { id: script.id, station: AM765_STATION, voice: script.voice, text: script.text });
}

/** Independent progress for one game. Restore only recognized IDs; never emit while restoring. */
export function createStoryRunner(saved?: unknown) {
  checkOnce();
  const known = new Set(STORY_EVENTS.map(e => e.id));
  const fired = new Set<string>(
    Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && known.has(id)) : [],
  );
  function runStoryEvent(id: string): StoryEvent | undefined {
    if (fired.has(id)) return undefined;
    const ev = STORY_EVENTS.find(e => e.id === id);
    if (!ev) return undefined;
    fired.add(id);
    for (const step of ev.emits) dispatch(step);
    return ev;
  }
  return {
    runStoryEvent,
    runNext: () => {
      const ev = STORY_EVENTS.find(e => !fired.has(e.id));
      return ev ? runStoryEvent(ev.id) : undefined;
    },
    snapshot: () => [...fired],
  };
}

// Preserve the original module API for existing callers. New games should use their own runner.
const defaultRunner = createStoryRunner();
export const runStoryEvent = defaultRunner.runStoryEvent;
export const runNext = defaultRunner.runNext;
