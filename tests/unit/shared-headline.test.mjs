import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickHeadline } = require('../../platform/shared/headline.js');

const all = {
  before: { streak: 6 }, after: { streak: 7 },
  run: { label: 'Flick', score: 200, prevBest: 150, tier: 'Gold', prevTier: 'Silver', insight: 'You overshoot.' },
  challenge: { name: 'sam', theirScore: 180, yourScore: 200 },
  survev: { enough: true, diff: 40, warm: { n: 12, dmgPerMin: 240 }, cold: { n: 30, dmgPerMin: 200 } },
};

test('priority order: streak > tier > best > friend > survev > insight', () => {
  const order = [];
  const input = structuredClone(all);
  order.push(pickHeadline(input).kind);
  input.after.streak = 6; order.push(pickHeadline(input).kind);
  input.run.prevTier = 'Gold'; order.push(pickHeadline(input).kind);
  input.run.prevBest = 300; order.push(pickHeadline(input).kind);
  input.challenge = null; order.push(pickHeadline(input).kind);
  input.survev.enough = false; order.push(pickHeadline(input).kind);
  input.run.insight = null; order.push(pickHeadline(input).kind);
  assert.deepEqual(order, ['streak', 'tier', 'best', 'friend', 'survev', 'insight', 'done']);
});

test('a non-milestone streak day does not take the headline', () => {
  const h = pickHeadline({ before: { streak: 4 }, after: { streak: 5 }, run: { label: 'Flick', score: 1 } });
  assert.equal(h.kind, 'done');
});

test('the first day of a streak is a milestone', () => {
  assert.equal(pickHeadline({ before: { streak: 0 }, after: { streak: 1 }, run: {} }).title, 'Streak started');
});

test('warm-up runs never claim a best or a tier', () => {
  const h = pickHeadline({ run: { label: 'Flick', score: 300, prevBest: 100, tier: 'Gold', prevTier: 'Bronze', warmup: true } });
  assert.equal(h.kind, 'done');
});

test('a first counted run is not a personal best', () => {
  assert.notEqual(pickHeadline({ run: { label: 'Flick', score: 300, prevBest: null } }).kind, 'best');
});
