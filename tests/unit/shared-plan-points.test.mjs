import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const plan = require('../../platform/shared/plan.js');
const points = require('../../platform/shared/points.js');

const SCEN = {
  staticClick: { cat: 'Clicking', ref: 170 },
  dynamicClick: { cat: 'Clicking', ref: 110 },
  reactiveTrack: { cat: 'Tracking', ref: 520 },
  speedSwitch: { cat: 'Switching', ref: 480 },
  chase: { cat: 'Moving', ref: 300 },
  dodge: { cat: 'Moving', ref: 320 },
  warmup: { cat: 'Warm-up' },
};

// ---------- plan ----------

test('skill levels average each skill against its reference scores', () => {
  const lv = plan.skillLevels([
    { scenario: 'staticClick', score: 85 }, { scenario: 'dynamicClick', score: 55 },
    { scenario: 'reactiveTrack', score: 520 }, { scenario: 'warmup', score: 9 },
  ], SCEN);
  assert.deepEqual(lv, { Clicking: 0.5, Tracking: 1 });
});

test('the week spends two days on the weakest skill, never back to back, and ends on a re-test', () => {
  const p = plan.buildPlan({ Clicking: 0.6, Tracking: 0.3, Switching: 0.5, Moving: 0.8 }, '2026-11-10');
  assert.deepEqual(p.days.map(d => d.routine), ['diagnostic', 'tracking', 'switching', 'daily', 'tracking', 'clicking', 'retest']);
  assert.deepEqual(p.days.map(d => d.day), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']);
  for (let i = 1; i < p.days.length; i++) assert.notEqual(p.days[i].routine === p.days[i - 1].routine && p.days[i].focus, true);
});

test('ties break in a fixed order, so the same scores always give the same week', () => {
  const a = plan.buildPlan({ Moving: 0.5, Clicking: 0.5, Tracking: 0.5, Switching: 0.5 }, '2026-11-10');
  const b = plan.buildPlan({ Switching: 0.5, Tracking: 0.5, Clicking: 0.5, Moving: 0.5 }, '2026-11-10');
  assert.deepEqual(a.days, b.days);
  assert.equal(a.days[1].focus, 'Clicking');
});

test('with no measured skills the week is Daily 5 throughout', () => {
  const p = plan.buildPlan({}, '2026-11-10');
  assert.deepEqual(p.days.slice(1, 6).map(d => d.routine), ['daily', 'daily', 'daily', 'daily', 'daily']);
});

test('progress marks a plan day done only when its routine finished on that day', () => {
  const p = plan.buildPlan({ Clicking: 0.2, Tracking: 0.4, Switching: 0.6, Moving: 0.8 }, '2026-11-10');
  const runs = [
    { day: '2026-11-10', key: 'routine:diagnostic', routineCompleted: true },
    { day: '2026-11-11', key: 'routine:clicking', routineCompleted: false },   // ended early
    { day: '2026-11-12', key: 'routine:clicking', routineCompleted: true },    // day 2's routine, a day late
  ];
  const pr = plan.progress(p, runs, '2026-11-12');
  assert.deepEqual(pr.days.map(d => d.done), [true, false, false, false, false, false, false]);
  assert.equal(pr.today.n, 3);
  assert.equal(pr.over, false);
  assert.equal(plan.progress(p, runs, '2026-11-17').over, true);
});

// ---------- points ----------

let t = 0;
const run = (o) => ({ id: `r${++t}`, ts: t, day: '2026-11-10', duration: 30, ...o });

test('practice pays 10 a minute and stops at the 45-minute daily budget', () => {
  const runs = Array.from({ length: 100 }, () => run({ key: 'flick', duration: 60, score: null }));
  const r = points.evaluate(runs, { today: '2026-11-10' });
  assert.equal(r.total, points.DAILY_CAP);
  assert.equal(r.today, 450);
});

test('routine summary records never double-count practice time', () => {
  const r = points.evaluate([run({ key: 'routine:daily', duration: 300, routineCompleted: true })]);
  assert.equal(r.total, 0);
});

test('the first run sets a baseline; beating it pays 2 per percent, capped at 100', () => {
  const a = run({ key: 'staticClick:v2', score: 100, accuracy: 0.8, hitsPerSec: 1, duration: 0 });
  const b = run({ key: 'staticClick:v2', score: 110, accuracy: 0.8, hitsPerSec: 1.1, duration: 0 });
  const c = run({ key: 'staticClick:v2', score: 300, accuracy: 0.8, hitsPerSec: 3, duration: 0 });
  const r = points.evaluate([a, b, c]);
  assert.deepEqual(r.awards.map(x => [x.runId, x.kind, x.points]), [[b.id, 'best', 20], [c.id, 'best', 100]]);
});

test('warm-up runs earn practice points but neither set nor beat a best', () => {
  const a = run({ key: 'k', score: 100, accuracy: 0.5, hitsPerSec: 1, duration: 0 });
  const w = run({ key: 'k', score: 500, accuracy: 0.9, hitsPerSec: 5, duration: 60, warmup: true });
  const b = run({ key: 'k', score: 120, accuracy: 0.5, hitsPerSec: 1.2, duration: 0 });
  const r = points.evaluate([a, w, b]);
  assert.deepEqual(r.awards.map(x => [x.runId, x.kind, x.points]), [[w.id, 'practice', 10], [b.id, 'best', 40]]);
});

test('accuracy pays only when the hit rate holds', () => {
  const a = run({ key: 'k', score: null, accuracy: 0.70, hitsPerSec: 2.0, duration: 0 });
  const slow = run({ key: 'k', score: null, accuracy: 0.80, hitsPerSec: 1.5, duration: 0 });   // slowed down to aim
  const sharp = run({ key: 'k', score: null, accuracy: 0.85, hitsPerSec: 1.5, duration: 0 }); // against 0.80 at 1.5
  const r = points.evaluate([a, slow, sharp]);
  assert.deepEqual(r.awards.map(x => [x.runId, x.kind, x.points]), [[sharp.id, 'accuracy', 10]]);
});

test('finishing the plan routine on its day pays the plan bonus once', () => {
  const p = plan.buildPlan({ Clicking: 0.1, Tracking: 0.9 }, '2026-11-09');
  const day2 = p.days[1];
  const done = run({ day: day2.day, key: `routine:${day2.routine}`, routineCompleted: true, duration: 0 });
  const again = run({ day: day2.day, key: `routine:${day2.routine}`, routineCompleted: true, duration: 0 });
  const wrongDay = run({ day: '2026-11-12', key: `routine:${day2.routine}`, routineCompleted: true, duration: 0 });
  const r = points.evaluate([done, again, wrongDay], { plan: p });
  assert.deepEqual(r.awards.map(x => [x.runId, x.kind, x.points]), [[done.id, 'plan', 50]]);
});

test('week totals start on Monday', () => {
  assert.equal(points.weekStart('2026-11-10'), '2026-11-09');   // a Tuesday
  assert.equal(points.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(points.weekStart('2026-11-15'), '2026-11-09');   // Sunday
  const r = points.evaluate([run({ day: '2026-11-08', key: 'k', duration: 60 }), run({ day: '2026-11-10', key: 'k', duration: 60 })], { today: '2026-11-10' });
  assert.equal(r.week, 10);
  assert.equal(r.total, 20);
});

test('forRun groups one run’s awards', () => {
  const a = run({ key: 'k', score: 100, accuracy: 0.5, hitsPerSec: 1, duration: 0 });
  const b = run({ key: 'k', score: 150, accuracy: 0.6, hitsPerSec: 1.2, duration: 60 });
  const r = points.evaluate([a, b]);
  assert.deepEqual(points.forRun(r, b.id).by, { practice: 10, best: 100, accuracy: 20 });
});
