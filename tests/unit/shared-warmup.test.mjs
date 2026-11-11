import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { compareWarmVsCold } = require('../../platform/shared/warmup.js');

const H = 3600000;
const base = Date.UTC(2026, 10, 10, 12);
// A match that started `startOffset` ms after base and lasted `alive` seconds.
const match = (startOffset, alive, dmg) => ({ end_time: new Date(base + startOffset + alive * 1000).toISOString(), time_alive: alive, damage_dealt: dmg });

test('a game is warm only if a routine finished within the window before it started', () => {
  const routines = [base];
  const r = compareWarmVsCold([
    match(10 * 60000, 120, 400),   // 10 min after: warm
    match(59 * 60000, 60, 100),    // 59 min after: warm
    match(61 * 60000, 60, 100),    // 61 min after: cold
    match(-5 * 60000, 60, 100),    // before the routine: cold
  ], routines);
  assert.equal(r.warm.n, 2); assert.equal(r.cold.n, 2);
});

test('rates are pooled over minutes alive', () => {
  const r = compareWarmVsCold([match(1000, 60, 300), match(2000, 180, 300), match(5 * H, 120, 200)], [base]);
  assert.equal(r.warm.dmgPerMin, 600 / 4);
  assert.equal(r.cold.dmgPerMin, 100);
  assert.equal(r.diff, 50);
});

test('enough needs 10 games on each side', () => {
  const warm = Array.from({ length: 10 }, (_, i) => match(i * 1000, 60, 100));
  const cold = Array.from({ length: 9 }, (_, i) => match(5 * H + i * 1000, 60, 100));
  assert.equal(compareWarmVsCold(warm.concat(cold), [base]).enough, false);
  cold.push(match(6 * H, 60, 100));
  assert.equal(compareWarmVsCold(warm.concat(cold), [base]).enough, true);
});

test('no games or no routines gives null rates, not NaN', () => {
  const r = compareWarmVsCold([], []);
  assert.equal(r.warm.dmgPerMin, null); assert.equal(r.diff, null); assert.equal(r.enough, false);
});
