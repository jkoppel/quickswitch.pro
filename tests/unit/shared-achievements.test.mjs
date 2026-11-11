import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluate, unlocked } = require('../../platform/shared/achievements.js');

const T0 = Date.UTC(2026, 10, 1, 18);
const day = (i) => new Date(T0 + i * 86400000).toISOString().slice(0, 10);
const routine = (i, extra = {}) => ({ ts: T0 + i * 86400000, day: day(i), key: 'routine:daily', routineCompleted: true, score: 50, ...extra });
const ids = (runs) => evaluate(runs).map(a => a.id);

test('first routine and streaks', () => {
  const runs = [0, 1, 2].map(i => routine(i));
  assert.deepEqual(ids(runs), ['first-routine', 'streak-3']);
  assert.equal(evaluate(runs).find(a => a.id === 'streak-3').earnedAt, runs[2].ts);
});

test('a gap restarts the streak count', () => {
  assert.ok(!ids([routine(0), routine(1), routine(3)]).includes('streak-3'));
});

test('abandoned routines earn nothing', () => {
  assert.deepEqual(ids([routine(0, { routineCompleted: false })]), []);
});

test('personal best needs a previous counted score; warm-up runs never count', () => {
  const runs = [
    { ts: 1, key: 'flick:mk12', score: 100 },
    { ts: 2, key: 'flick:mk12', score: 150, warmup: true },
    { ts: 3, key: 'flick:mk12', score: 90 },
  ];
  assert.deepEqual(ids(runs), []);
  runs.push({ ts: 4, key: 'flick:mk12', score: 101 });
  assert.deepEqual(ids(runs), ['first-pb']);
});

test('tier achievements fill in every tier passed, once', () => {
  const runs = [
    { ts: 1, key: 'staticClick:v3', scenario: 'staticClick', benchmark: true, score: 10, tier: 'Bronze' },
    { ts: 2, key: 'staticClick:v3', scenario: 'staticClick', benchmark: true, score: 90, tier: 'Gold' },
    { ts: 3, key: 'dodge:v3', scenario: 'dodge', benchmark: true, score: 90, tier: 'Silver' },
  ];
  const got = evaluate(runs).filter(a => a.id.startsWith('tier-')).map(a => a.id);
  assert.deepEqual(got.sort(), ['tier-gold', 'tier-silver']);
});

test('one-run feats', () => {
  const got = ids([{ ts: 1, key: 'bankShot:v3', score: 5, ricochetHits: 2, quickSwitchShots: 12, challengeBeat: true }]);
  assert.deepEqual(got.sort(), ['beat-challenge', 'first-ricochet', 'quickswitch-10']);
});

test('evaluate is deterministic and order-independent', () => {
  const runs = [routine(2), routine(0), routine(1)];
  assert.deepEqual(evaluate(runs), evaluate(runs.slice().reverse()));
});

test('unlocked lists only new achievements', () => {
  const before = evaluate([routine(0)]);
  const after = evaluate([0, 1, 2].map(i => routine(i)));
  assert.deepEqual(unlocked(before, after).map(a => a.id), ['streak-3']);
});
