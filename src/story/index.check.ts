// Manual check: npx tsx src/story/index.check.ts  (not bundled; nothing imports it)
// A test-level alert.issue emits alert kind 'test' (short test tone), not the full siren.
import { on } from '../core/bus';
import { ALL_CLEAR_ID, createStoryRunner, loadStory, runStoryEvent } from './index';

let fails = 0;
const ok = (c: boolean, m: string) => (console.log(c ? '  ok  ' : '  FAIL', m), c || fails++);

const hourly = loadStory().events.find(e => e.id === 'act1_siren_test');
ok(
  !!hourly && hourly.emits.some(s => s.type === 'alert.issue' && s.level === 'test'),
  'act 1 hourly air-raid test is alert.issue level test',
);

const kinds: string[] = [];
const stop = on('alert', e => kinds.push(e ? e.kind : 'bare'));
const ran = runStoryEvent('act1_siren_test');
stop();
ok(ran?.id === 'act1_siren_test', 'act1_siren_test runs');
ok(
  kinds.length === 1 && kinds[0] === 'test',
  `test-level alert.issue emits kind 'test' (${kinds.join(',') || 'none'})`,
);

const clearKinds: string[] = [];
const stopClear = on('alert', e => clearKinds.push(e ? e.kind : 'bare'));
runStoryEvent(ALL_CLEAR_ID);
stopClear();
ok(
  clearKinds.length === 1 && clearKinds[0] === 'clear',
  `alert.clear still emits kind 'clear' (${clearKinds.join(',') || 'none'})`,
);

const alerts: string[] = [];
const stopRestored = on('alert', e => alerts.push(e?.kind ?? 'bare'));
const session = createStoryRunner();
session.runStoryEvent('act1_siren_test');
session.runStoryEvent('act1_siren_test');
const saved = JSON.parse(JSON.stringify(session.snapshot()));
const resumed = createStoryRunner(saved);
resumed.runStoryEvent('act1_siren_test');
ok(alerts.length === 1, 'event fires once across save and restore; restore has no effects');
const fresh = createStoryRunner();
fresh.runStoryEvent('act1_siren_test');
ok(alerts.length === 2, 'new session starts with independent progress');
ok(
  createStoryRunner(['not-an-event', 4, 'act1_siren_test', 'act1_siren_test']).snapshot().length === 1,
  'restore ignores unknown and duplicate IDs',
);
ok(!fresh.runStoryEvent('not-an-event'), 'unknown event cannot fire');
stopRestored();

if (fails) throw new Error(`${fails} check(s) failed`);
export {};
