import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeStreak, completionDays, addDays } = require('../../platform/shared/streak.js');

test('empty history has no streak', () => {
  assert.deepEqual(computeStreak([], '2026-11-10'), { current: 0, longest: 0, practicedToday: false });
});

test('practising today counts back through consecutive days', () => {
  const s = computeStreak(['2026-11-08', '2026-11-09', '2026-11-10'], '2026-11-10');
  assert.equal(s.current, 3); assert.equal(s.longest, 3); assert.equal(s.practicedToday, true);
});

test('yesterday keeps the streak alive until today ends', () => {
  const s = computeStreak(['2026-11-08', '2026-11-09'], '2026-11-10');
  assert.equal(s.current, 2); assert.equal(s.practicedToday, false);
});

test('missing one full day resets: no freezes, no repairs', () => {
  const s = computeStreak(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'], '2026-11-10');
  assert.equal(s.current, 0);
  assert.equal(s.longest, 4);
});

test('a gap inside the history splits runs', () => {
  const s = computeStreak(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'], '2026-11-05');
  assert.equal(s.current, 2); assert.equal(s.longest, 2);
});

test('duplicate days count once', () => {
  assert.equal(computeStreak(['2026-11-10', '2026-11-10'], '2026-11-10').current, 1);
});

test('day arithmetic crosses month, year and DST boundaries', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US DST start
  assert.equal(computeStreak(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02').current, 3);
});

test('the boundary is local midnight: the day string decides, not elapsed hours', () => {
  // 23:59 on the 9th and 00:01 on the 10th are two different days, two minutes apart.
  const s = computeStreak(['2026-11-09', '2026-11-10'], '2026-11-10');
  assert.equal(s.current, 2);
});

test('only finished routines count as practice days', () => {
  const runs = [
    { day: '2026-11-09', key: 'routine:daily', routineCompleted: true },
    { day: '2026-11-10', key: 'routine:daily', routineCompleted: false },
    { day: '2026-11-10', key: 'flick:mk12', score: 100 },
  ];
  assert.deepEqual(completionDays(runs), ['2026-11-09']);
});
