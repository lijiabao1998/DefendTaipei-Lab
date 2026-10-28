import assert from 'node:assert/strict';
import { TilePublication, TilePublicationError } from '../../src/map/tiles/transaction';

// Model owned runtime registries. These are NOT actual renderer/browser checks.
const labels = ['scene', 'colliders', 'walks', 'containers', 'soldiers', 'checkpoints'];
for (let failAt = -1; failAt < labels.length; failAt++) {
  const live = new Map(labels.map(name => [name, new Set(['existing'])]));
  const saves = { original: 'unchanged' };
  const order = [];
  const tx = new TilePublication(
    labels.map((label, i) => ({
      label,
      apply() {
        live.get(label).add('candidate');
        if (i === failAt) throw new Error(`fault after ${label}`);
      },
      undo() {
        order.push(label);
        live.get(label).delete('candidate');
      },
    })),
  );
  assert.equal(tx.state, 'prepared');
  for (const values of live.values()) assert.deepEqual([...values], ['existing'], 'prepare is inactive');
  if (failAt < 0) {
    tx.activate();
    assert.equal(tx.state, 'active');
    tx.rollback();
  } else assert.throws(() => tx.activate(), TilePublicationError);
  assert.equal(tx.state, 'rolled-back');
  for (const values of live.values()) assert.deepEqual([...values], ['existing']);
  assert.deepEqual(order, labels.slice(0, failAt < 0 ? labels.length : failAt + 1).reverse());
  tx.rollback(); // repeated release does not undo twice
  assert.throws(() => tx.activate(), /cannot activate/);
  assert.deepEqual(saves, { original: 'unchanged' });
}
const order = [];
const broken = new TilePublication([
  {
    label: 'first',
    apply() {},
    undo() {
      order.push('first');
    },
  },
  {
    label: 'bad',
    apply() {},
    undo() {
      order.push('bad');
      throw new Error('cleanup fault');
    },
  },
  {
    label: 'last',
    apply() {},
    undo() {
      order.push('last');
    },
  },
]);
broken.activate();
assert.throws(() => broken.rollback(), TilePublicationError);
assert.deepEqual(order, ['last', 'bad', 'first'], 'cleanup continues after an undo failure');
assert.equal(broken.state, 'failed');
assert.throws(() => broken.activate());
assert.throws(() => broken.rollback());
let untouched = 0;
const abandoned = new TilePublication([
  {
    label: 'not-published',
    apply() {
      untouched++;
    },
    undo() {
      untouched--;
    },
  },
]);
abandoned.rollback();
assert.equal(untouched, 0);
let recursive;
recursive = new TilePublication([
  {
    label: 'reentrant',
    apply() {
      recursive.rollback();
    },
    undo() {},
  },
]);
assert.throws(() => recursive.activate(), TilePublicationError);
assert.equal(recursive.state, 'rolled-back');
console.log(
  'publication fault injection passed: prepare inactive, reverse rollback, partial apply, undo faults, reentrancy',
);
