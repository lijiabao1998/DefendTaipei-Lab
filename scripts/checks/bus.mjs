// Run with Node 22.6+ (native TypeScript stripping): node --experimental-strip-types scripts/checks/bus.mjs
import assert from 'node:assert/strict';
import { emit, on } from '../../src/core/bus.ts';

const calls = [];
const callback = e => calls.push(e?.kind ?? 'bare');
const stopFirst = on('alert', callback);
const stopSecond = on('alert', callback);
stopFirst();
stopFirst();
emit('alert', { kind: 'test' });
assert.deepEqual(calls, ['test'], 'unsubscribe is idempotent and scoped to its own registration');
stopSecond();

calls.length = 0;
let stopLater;
let stopAdded;
const stopEarly = on('alert', () => {
  calls.push('early');
  stopLater();
  stopAdded ||= on('alert', () => calls.push('added'));
});
stopLater = on('alert', () => calls.push('later'));
emit('alert');
assert.deepEqual(calls, ['early', 'later'], 'current dispatch uses the initial listener snapshot');
calls.length = 0;
emit('alert');
assert.deepEqual(calls, ['early', 'added'], 'subscription changes apply to the next dispatch');
stopEarly();
stopAdded();

calls.length = 0;
let nested = false;
let stopNestedLater;
const stopNestedEarly = on('alert', () => {
  calls.push(nested ? 'nested early' : 'outer early');
  if (!nested) {
    stopNestedLater();
    nested = true;
    emit('alert');
  }
});
stopNestedLater = on('alert', () => calls.push('outer later'));
emit('alert');
assert.deepEqual(calls, ['outer early', 'nested early', 'outer later'], 'nested emits see current subscriptions');
stopNestedEarly();

console.log('bus checks passed');
