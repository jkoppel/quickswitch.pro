// Server logic that needs no database: session signing, validation, OAuth state, reminders.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET ||= 'x'.repeat(48);

const { signSession, verifySession, SESSION_MAX_AGE } = await import('../../lib/session.mjs');
const { validatePatch, HANDLE } = await import('../../lib/users.mjs');
const { safeReturn, signState, verifyState } = await import('../../lib/discord.mjs');
const { dueReminder } = await import('../../lib/push.mjs');
const { validateRun } = await import('../../lib/runs.mjs');
const { apiPath } = await import('../../lib/router.mjs');
const { inject, escapeHtml } = await import('../../lib/page.mjs');
const { localNow } = await import('../../lib/shared.mjs');

const ID = '3f1c2a4e-9b7d-4c1e-8a2f-0d6b5e4c3a21';

test('session round-trips and rejects tampering, expiry and junk', () => {
  const v = signSession(ID, 1_700_000_000);
  assert.equal(verifySession(v, 1_700_000_100), ID);
  const [a, b, sig] = v.split('.');
  assert.equal(verifySession(`${a}.${Number(b) + 1}.${sig}`, 1_700_000_100), null, 'changed issued-at');
  assert.equal(verifySession(`${Buffer.from('3f1c2a4e-9b7d-4c1e-8a2f-0d6b5e4c3a22').toString('base64url')}.${b}.${sig}`, 1_700_000_100), null, 'changed user');
  assert.equal(verifySession(v, 1_700_000_000 + SESSION_MAX_AGE + 1), null, 'expired');
  assert.equal(verifySession(v, 1_699_999_000), null, 'issued in the future');
  for (const junk of [undefined, '', 'a.b', 'a.b.c.d', 42]) assert.equal(verifySession(junk), null);
  const notUuid = signSession('not-a-uuid', 1_700_000_000);
  assert.equal(verifySession(notUuid, 1_700_000_100), null);
});

test('handles: lowercase letters, digits, underscore, 3–20 long', () => {
  assert.deepEqual(validatePatch({ handle: '  Sniper_Jim ' }), { handle: 'sniper_jim' });
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'émile', '', null]) {
    assert.throws(() => validatePatch({ handle: bad }), /handle/, String(bad));
  }
  assert.ok(HANDLE.test('p_0a1b2c3d'));
});

test('profile patch validates every field', () => {
  assert.deepEqual(validatePatch({ displayName: '  Jimmy ', survevSlug: 'olimpiq', tz: 'America/Los_Angeles', remindHour: 7 }),
    { display_name: 'Jimmy', survev_slug: 'olimpiq', tz: 'America/Los_Angeles', remind_hour: 7 });
  assert.deepEqual(validatePatch({ survevSlug: '', displayName: null, tz: null, remindHour: null }),
    { survev_slug: null, display_name: null, tz: null, remind_hour: null });
  assert.throws(() => validatePatch({ displayName: 'x'.repeat(41) }));
  assert.throws(() => validatePatch({ survevSlug: 'bad slug!' }));
  assert.throws(() => validatePatch({ tz: 'Mars/Olympus' }));
  assert.throws(() => validatePatch({ remindHour: 24 }));
  assert.throws(() => validatePatch({ remindHour: 7.5 }));
});

test('Discord return paths stay on this site; state is signed and expires', () => {
  assert.equal(safeReturn('/u/jim?x=1'), '/u/jim?x=1');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, '/a b']) assert.equal(safeReturn(bad), '/', String(bad));
  const now = Date.now();
  const s = signState({ r: '/profile', n: 'abc', t: now });
  assert.deepEqual(verifyState(s, now + 1000), { r: '/profile', n: 'abc', t: now });
  assert.equal(verifyState(s, now + 11 * 60 * 1000), null, 'expired');
  const [payload, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ r: '//evil.com', n: 'abc', t: now })).toString('base64url');
  assert.equal(verifyState(`${forged}.${sig}`, now), null);
  assert.equal(verifyState(`${payload}.x${sig.slice(1)}`, now), null);
});

test('reminders: usual hour, streak-at-risk at 20:00, nothing once practiced', () => {
  assert.equal(dueReminder({ localHour: 18, remindHour: null, practicedToday: false, currentStreak: 0 }).kind, 'warmup');
  assert.match(dueReminder({ localHour: 9, remindHour: 9, practicedToday: false, currentStreak: 4 }).body, /4-day streak/);
  assert.equal(dueReminder({ localHour: 9, remindHour: 10, practicedToday: false, currentStreak: 4 }), null);
  assert.equal(dueReminder({ localHour: 20, remindHour: 20, practicedToday: false, currentStreak: 3 }).kind, 'risk', 'risk wins when both are due');
  assert.equal(dueReminder({ localHour: 20, remindHour: 18, practicedToday: false, currentStreak: 0 }), null, 'no streak, nothing at risk');
  assert.equal(dueReminder({ localHour: 18, remindHour: 18, practicedToday: true, currentStreak: 5 }), null);
});

test('reminders name the plan day when there is one', () => {
  const r = dueReminder({ localHour: 18, remindHour: 18, practicedToday: false, currentStreak: 2, planToday: { n: 3, label: 'Tracking focus' } });
  assert.equal(r.body, 'Your 2-day streak is waiting. Day 3: Tracking focus, five minutes.');
});

test('run validation keeps good entries and drops malformed ones', () => {
  const now = Date.UTC(2026, 10, 10);
  const good = { id: 'r1', ts: now - 1000, day: '2026-11-09', key: 'flick:v2', score: 812.5, duration: 30, routineCompleted: false };
  const v = validateRun(good, now);
  assert.equal(v.clientId, 'r1');
  assert.equal(v.day, '2026-11-09');
  assert.equal(v.score, 812.5);
  assert.equal(validateRun({ ...good, id: '' }, now), null);
  assert.equal(validateRun({ ...good, key: undefined }, now), null);
  assert.equal(validateRun({ ...good, ts: Date.UTC(2020, 0, 1) }, now), null);
  assert.equal(validateRun({ ...good, ts: now + 3 * 86400000 }, now), null);
  assert.equal(validateRun({ ...good, score: Infinity }, now), null);
  assert.equal(validateRun({ ...good, score: 'lots' }, now), null);
  assert.equal(validateRun({ ...good, blob: 'x'.repeat(20000) }, now), null);
  assert.equal(validateRun({ ...good, day: 'yesterday' }, now).day, '2026-11-09', 'bad day falls back to the UTC date of ts');
  assert.equal(validateRun([1, 2], now), null);
});

test('API path comes from the rewrite parameter or the pathname', () => {
  assert.equal(apiPath(new URL('https://x/api/index?__path=auth/email/start')), 'auth/email/start');
  assert.equal(apiPath(new URL('https://x/api/challenges/AbC123xY/result')), 'challenges/AbC123xY/result');
  const u = new URL('https://x/api/index?__path=runs&since=2026-01-01');
  assert.equal(apiPath(u), 'runs');
  assert.equal(u.searchParams.get('since'), '2026-01-01');
  assert.equal(u.searchParams.has('__path'), false);
});

test('share pages get a root base and escaped Open Graph tags', () => {
  const html = inject('<html><head><title>t</title></head></html>', 'https://site', { title: 'A "quoted" <name>', description: 'd', image: '/api/og?kind=profile&handle=a' }, 'https://site/u/a');
  assert.match(html, /^<html><head><base href="\/">/);
  assert.match(html, /og:title" content="A &quot;quoted&quot; &lt;name&gt;"/);
  assert.match(html, /og:image" content="https:\/\/site\/api\/og\?kind=profile&amp;handle=a"/);
  assert.equal(inject('<head></head>', 'https://s', null, 'https://s/').startsWith('<head><base href="/">'), true);
  assert.equal(escapeHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('local time follows the user time zone and falls back to UTC', () => {
  const t = new Date('2026-11-10T03:30:00Z');
  assert.deepEqual(localNow('America/Los_Angeles', t), { day: '2026-11-09', hour: 19 });
  assert.deepEqual(localNow('Asia/Tokyo', t), { day: '2026-11-10', hour: 12 });
  assert.deepEqual(localNow('Not/AZone', t), { day: '2026-11-10', hour: 3 });
  assert.deepEqual(localNow(null, t), { day: '2026-11-10', hour: 3 });
});
