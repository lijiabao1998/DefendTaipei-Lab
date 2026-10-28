import assert from 'node:assert/strict';
import { Nav } from '../../src/systems/nav';
import { prepareNavOwnership } from '../../src/map/tiles/nav-ownership';
import { TilePublication, TilePublicationError } from '../../src/map/tiles/transaction';

const a = [2, 2],
  b = [5, 2];
for (const failure of ['before-nav', 'after-nav', 'after-grid', 'none']) {
  const nav = new Nav(0, 0, 10, 10);
  nav.markSeg(a, b, 1); // genuine existing Nav occupancy remains owned by legacy map
  const before = [...nav.block];
  const token = prepareNavOwnership(nav, a, b);
  const segments = new Set(['existing']),
    grid = new Set(['existing']);
  const tx = new TilePublication([
    {
      label: 'segments',
      apply() {
        segments.add('candidate');
      },
      undo() {
        segments.delete('candidate');
      },
    },
    {
      label: 'nav',
      apply() {
        if (failure === 'before-nav') throw new Error('before nav publication');
        token.publish();
        if (failure === 'after-nav') throw new Error('after nav publication');
      },
      undo() {
        token.release();
      },
    },
    {
      label: 'grid',
      apply() {
        grid.add('candidate');
        if (failure === 'after-grid') throw new Error('after grid');
      },
      undo() {
        grid.delete('candidate');
      },
    },
  ]);
  assert.deepEqual([...nav.block], before);
  if (failure === 'none') {
    tx.activate();
    tx.rollback();
  } else assert.throws(() => tx.activate(), TilePublicationError);
  assert.deepEqual([...nav.block], before, `${failure}: original navigation occupancy preserved`);
  assert.deepEqual([...segments], ['existing']);
  assert.deepEqual([...grid], ['existing']);
  token.release();
  assert.deepEqual([...nav.block], before);
}
const nav = new Nav(-10, -10, 10, 10);
const one = prepareNavOwnership(nav, [-2, -2], [2, 2]);
const two = prepareNavOwnership(nav, [-2, -2], [2, 2]);
one.publish();
two.publish();
one.release();
const reference = new Nav(-10, -10, 10, 10);
reference.markSeg([-2, -2], [2, 2], 1);
assert.deepEqual([...nav.block], [...reference.block], 'release preserves other owner and matches real Nav sampling');
two.release();
assert.equal(
  nav.block.some(v => v !== 0),
  false,
);
nav.block.fill(255);
const full = prepareNavOwnership(nav, [0, 0], [2, 2]);
assert.throws(() => full.publish(), /capacity/);
full.release();
assert.equal(
  nav.block.every(v => v === 255),
  true,
  'capacity failure is atomic',
);
assert.throws(() => prepareNavOwnership(nav, [NaN, 0], [0, 0]));
console.log(
  'real Nav ownership fault checks passed; original occupancy preserved, legacy API unchanged; not scene integration',
);
