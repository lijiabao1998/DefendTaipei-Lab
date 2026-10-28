// Reproduce why the real Nav API cannot be blindly paired with pre-armed undo.
// This is an executable blocker demonstration, NOT a safe-renderer test.
import assert from 'node:assert/strict';
import { Nav } from '../../src/systems/nav';
import { TilePublication, TilePublicationError } from '../../src/map/tiles/transaction';

const nav = new Nav(0, 0, 10, 10);
const a = [2, 2],
  b = [5, 2];
nav.markSeg(a, b, 1); // pre-existing owned collider
const before = [...nav.block];
const tx = new TilePublication([
  {
    label: 'legacy addSeg callback failing before navigation increment',
    apply() {
      throw new Error('injected before markSeg(+1)');
    },
    undo() {
      nav.markSeg(a, b, -1);
    }, // what unconditional legacy removeSeg does
  },
]);
assert.throws(() => tx.activate(), TilePublicationError);
assert.notDeepEqual([...nav.block], before, 'unconditional undo corrupts a preexisting shared navigation cell');
assert.equal(nav.free(nav.idx(3, 2)), true, 'existing blocker was incorrectly removed');
console.log('BLOCKER reproduced against actual Nav: legacy unconditional removeSeg is not safe partial-apply undo');
