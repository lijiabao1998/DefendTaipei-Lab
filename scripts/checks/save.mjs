// Node-only storage contract checks; not a browser gameplay lifecycle test.
import assert from 'node:assert/strict';
import * as save from '../../src/systems/save.ts';

const data = new Map();
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
};
assert.equal(save.readSave(), null);
const legacy = { r: 'nurse', p: [1, 2], inv: { water: 2 }, radio: [] };
save.writeSave(legacy);
assert.deepEqual(save.readSave(), legacy, 'old saves without story retain their fields');
const progress = { ...legacy, story: ['act1_siren_test'] };
save.writeSave(progress);
assert.deepEqual(save.readSave(), progress, 'optional story progress round-trips');
data.set(save.GAME_SAVE_KEY, '{broken');
assert.equal(save.readSave(), null);
assert.equal(save.hasSave(), true, 'corrupt data still counts as a stored save');
for (const key of [save.DISTRICT_TILES_KEY, save.ROAD_TILES_KEY, save.MAP_SAVE_KEY, 'dt.settings', 'dt.keys'])
  data.set(key, 'retained');
save.clearSave();
assert.equal(data.has(save.GAME_SAVE_KEY), false);
assert.equal(data.has(save.DISTRICT_TILES_KEY), false);
for (const key of [save.ROAD_TILES_KEY, save.MAP_SAVE_KEY, 'dt.settings', 'dt.keys'])
  assert.equal(data.get(key), 'retained', `${key} is not removed by progress clear`);
localStorage.setItem = () => {
  throw new Error('quota exceeded');
};
assert.throws(() => save.writeSave(progress), /quota exceeded/, 'save failures reach the caller');
console.log('save storage contract checks passed (mock storage, not browser lifecycle)');
