// Actual shipped indices + isolated lifecycle contracts; no renderer/map replacement claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacyKeys, LegacyLeases } from '../../src/map/tiles/legacy';

const available = new Set(['-2_-2', '-1_-2', '-2_-1', '-1_-1', '0_0', '1_0', '0_1', '1_1', '2_0', '2_1']);
assert.deepEqual(legacyKeys(0, 0, 200, available), ['0_0', '1_0', '0_1', '1_1']);
assert.deepEqual(legacyKeys(-1, -1, 200, available), ['-2_-2', '-1_-2', '-2_-1', '-1_-1']);
assert.deepEqual(legacyKeys(0, 0, 256, available), ['0_0']);
assert.throws(() => legacyKeys(0, 0, 0, available));
assert.throws(() => legacyKeys(0.5, 0, 200, available));
for (const [file, sizeField] of [
  ['district', 'T'],
  ['tiles', 'size'],
]) {
  const ix = JSON.parse(readFileSync(`public/data/${file}/index.json`, 'utf8'));
  const keys = new Set(Array.isArray(ix.tiles) ? ix.tiles : Object.keys(ix.tiles));
  const covered = new Set();
  for (const key of keys) {
    const [x, z] = key.split('_').map(Number);
    for (let tz = Math.floor((z * ix[sizeField]) / 256); tz < Math.ceil(((z + 1) * ix[sizeField]) / 256); tz++)
      for (let tx = Math.floor((x * ix[sizeField]) / 256); tx < Math.ceil(((x + 1) * ix[sizeField]) / 256); tx++)
        for (const source of legacyKeys(tx, tz, ix[sizeField], keys)) covered.add(source);
  }
  assert.deepEqual([...covered].sort(), [...keys].sort(), `${file}: every shipped source owner is preserved`);
  console.log(`${file}: ${keys.size} shipped source keys covered without renaming`);
}
let loads = 0,
  disposed = 0;
let resolve;
const pool = new LegacyLeases(
  () => {
    loads++;
    return new Promise(r => {
      resolve = r;
    });
  },
  () => {
    disposed++;
  },
);
const a = pool.acquire('1_0'),
  b = pool.acquire('1_0');
await Promise.resolve();
assert.equal(loads, 1);
a.release();
a.release();
resolve({ originalKey: '1_0' });
assert.equal((await b.ready).originalKey, '1_0');
assert.equal(disposed, 0, 'overlapping target retains source');
b.release();
b.release();
assert.equal(disposed, 1);
const c = pool.acquire('1_0');
await Promise.resolve();
c.release();
resolve({});
await c.ready;
assert.equal(disposed, 2, 'released pending result is disposed exactly once');
pool.close();
assert.throws(() => pool.acquire('1_0'), /closed/);
let attempts = 0;
const retry = new LegacyLeases(
  () => {
    if (++attempts === 1) throw new Error('failed');
    return 1;
  },
  () => {},
);
const failed = retry.acquire('0_0');
await assert.rejects(failed.ready, /failed/);
failed.release();
const good = retry.acquire('0_0');
assert.equal(await good.ready, 1);
good.release();
console.log('legacy ownership/lifecycle checks passed (not rendered map integration)');
