// End-to-end API flows through the router against the real database (DEV_DATABASE_URL from .env.local, never production).
// Every row created here belongs to users this file creates, and they are deleted at the end.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const hasDb = !!(process.env.DEV_DATABASE_URL || process.env.DATABASE_URL) && !!process.env.SESSION_SECRET;
const { handle } = await import('../../lib/router.mjs');
const { q } = await import('../../lib/db.mjs');
const { mergeUsers } = await import('../../lib/users.mjs');
const { runReminders } = await import('../../lib/push.mjs');
const { signInWithDiscord } = await import('../../lib/discord.mjs');
const { makeContext } = await import('../../lib/context.mjs');
const { startEmail, verifyEmail } = await import('../../lib/email.mjs');

const created = new Set();
const ANON = `test-${Date.now()}`;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function call(method, path, { body, cookie, headers = {} } = {}) {
  const req = new Request(`http://localhost:3000/api/${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
  });
  const res = await handle(req);
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).find(c => c.startsWith('st_session='));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: set || cookie };
}

async function newUser() {
  const r = await call('POST', 'session');
  assert.equal(r.status, 200);
  created.add(r.body.user.id);
  return { cookie: r.cookie, user: r.body.user };
}

function run(id, offsetDays, extra = {}) {
  return { id, ts: Date.now() + offsetDays * 86400000, day: day(offsetDays), key: 'routine:daily5', label: 'Daily 5', score: 50, duration: 300, routineCompleted: true, ...extra };
}

after(async () => {
  if (!hasDb) return;
  if (created.size) await q('DELETE FROM users WHERE id = ANY($1::uuid[])', [[...created]]);
  await q('DELETE FROM events WHERE anon_id LIKE $1', [`${ANON}%`]);
  await q('DELETE FROM feedback WHERE anon_id LIKE $1', [`${ANON}%`]);
});

test('health reports sign-in methods', { skip: !hasDb }, async () => {
  const r = await call('GET', 'health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.signIn.passkey, undefined, 'passkeys are gone');
  assert.equal(typeof r.body.signIn.email, 'boolean');
  assert.equal(typeof r.body.signIn.discord, 'boolean');
});

test('session, me and profile edits', { skip: !hasDb }, async () => {
  assert.deepEqual((await call('GET', 'me')).body, { user: null });
  assert.equal((await call('PATCH', 'me', { body: { displayName: 'x' } })).status, 401);
  const a = await newUser();
  assert.equal(a.user.kind, 'anon');
  assert.match(a.user.handle, /^p_[a-z0-9]{8}$/);
  const again = await call('POST', 'session', { cookie: a.cookie });
  assert.equal(again.body.user.id, a.user.id, 'an existing session is reused');
  const h = `t${Date.now().toString(36)}`.slice(0, 20);
  const p = await call('PATCH', 'me', { cookie: a.cookie, body: { handle: h, displayName: 'Tester', survevSlug: 'olimpiq', tz: 'Europe/Berlin', remindHour: 8 } });
  assert.equal(p.status, 200);
  assert.equal(p.body.user.handle, h);
  assert.equal(p.body.user.remindHour, 8);
  const b = await newUser();
  const clash = await call('PATCH', 'me', { cookie: b.cookie, body: { handle: h.toUpperCase() } });
  assert.equal(clash.status, 409);
  assert.equal((await call('PATCH', 'me', { cookie: b.cookie, body: { handle: 'no' } })).status, 400);
  const forged = a.cookie.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
  assert.deepEqual((await call('GET', 'me', { cookie: forged })).body, { user: null }, 'a forged cookie is no session');
});

test('runs sync is idempotent and feeds the public profile', { skip: !hasDb }, async () => {
  const a = await newUser();
  const runs = [run('r-1', -2), run('r-2', -1), run('r-3', 0), run('r-4', 0, { key: 'flick:v2', label: 'Flick', score: 900, routineCompleted: false, benchmark: true, scenario: 'flick' }), { junk: true }];
  const first = await call('POST', 'runs', { cookie: a.cookie, body: { runs } });
  assert.deepEqual(first.body, { accepted: 4 });
  const second = await call('POST', 'runs', { cookie: a.cookie, body: { runs: [run('r-3', 0, { score: 60 })] } });
  assert.deepEqual(second.body, { accepted: 1 });
  const list = await call('GET', 'runs', { cookie: a.cookie });
  assert.equal(list.body.runs.length, 4);
  assert.equal(list.body.runs.find(r => r.id === 'r-3').score, 60, 're-sync updates in place');
  const since = await call('GET', `runs?since=${encodeURIComponent(new Date(Date.now() - 12 * 3600000).toISOString())}`, { cookie: a.cookie });
  assert.ok(since.body.runs.every(r => r.ts > Date.now() - 12 * 3600000));
  assert.equal((await call('GET', 'runs?since=nope', { cookie: a.cookie })).status, 400);
  assert.deepEqual((await call('GET', 'runs')).body, { runs: [] }, 'no session, no runs');

  const prof = await call('GET', `users/${a.user.handle}`);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.streak, 3);
  assert.equal(prof.body.longestStreak, 3);
  assert.equal(prof.body.bests['flick:v2'], 900);
  assert.ok(prof.body.achievements.some(x => x.id === 'streak-3'));
  assert.deepEqual(prof.body.practiceDays, [day(-2), day(-1), day(0)]);
  assert.equal((await call('GET', 'users/nobody_here_zz')).status, 404);

  const tooMany = await call('POST', 'runs', { cookie: a.cookie, body: { runs: Array.from({ length: 201 }, (_, i) => run('x' + i, 0)) } });
  assert.equal(tooMany.status, 413);
  const anonPost = await call('POST', 'runs', { body: { runs: [run('fresh', 0)] } });
  assert.equal(anonPost.status, 200, 'the first run creates an anonymous user');
  assert.ok(anonPost.cookie);
  created.add((await call('GET', 'me', { cookie: anonPost.cookie })).body.user.id);
});

test('challenges create friendships and feed boards', { skip: !hasDb }, async () => {
  const a = await newUser();
  const b = await newUser();
  await call('POST', 'runs', { cookie: a.cookie, body: { runs: [run('a1', -1), run('a2', 0), run('a3', 0, { key: 'flick:v2', score: 1000, benchmark: true, routineCompleted: false })] } });
  await call('POST', 'runs', { cookie: b.cookie, body: { runs: [run('b1', 0), run('b2', 0, { key: 'flick:v2', score: 1200, benchmark: true, routineCompleted: false })] } });

  assert.equal((await call('POST', 'challenges', { cookie: a.cookie, body: { scenario: 'flick', key: 'flick:v2', seed: -1, score: 1 } })).status, 400);
  const c = await call('POST', 'challenges', { cookie: a.cookie, body: { scenario: 'flick', key: 'flick:v2', seed: 123456, score: 1000 } });
  assert.equal(c.status, 200);
  assert.match(c.body.id, /^[0-9A-Za-z]{8}$/);
  assert.equal(c.body.url, `http://localhost:3000/c/${c.body.id}`);

  const got = await call('GET', `challenges/${c.body.id}`);
  assert.equal(got.body.seed, 123456);
  assert.equal(got.body.creator.handle, a.user.handle);
  assert.equal((await call('GET', 'challenges/nope')).status, 404);

  const res = await call('POST', `challenges/${c.body.id}/result`, { cookie: b.cookie, body: { score: 1100 } });
  assert.deepEqual(res.body, { beat: true, creatorScore: 1000, yourScore: 1100, friendshipCreated: true });
  const again = await call('POST', `challenges/${c.body.id}/result`, { cookie: b.cookie, body: { score: 900 } });
  assert.equal(again.body.friendshipCreated, false);
  const results = (await call('GET', `challenges/${c.body.id}`)).body.results;
  assert.deepEqual(results.map(r => r.score), [1100], 'a worse retry keeps the best score');
  const own = await call('POST', `challenges/${c.body.id}/result`, { cookie: a.cookie, body: { score: 1 } });
  assert.equal(own.body.friendshipCreated, false, 'no friendship with yourself');

  const boards = await call('GET', 'boards', { cookie: a.cookie });
  const streakBoard = boards.body.friends.streak;
  assert.deepEqual(streakBoard.map(e => e.handle).sort(), [a.user.handle, b.user.handle].sort());
  assert.equal(streakBoard.find(e => e.you).handle, a.user.handle);
  assert.equal(streakBoard.find(e => e.handle === a.user.handle).value, 2);
  assert.deepEqual(boards.body.friends.benchmark['flick:v2'].map(e => e.value), [1200, 1000]);
  assert.deepEqual(boards.body.guilds, []);

  await q(`INSERT INTO user_guilds (user_id, guild_id, guild_name) VALUES ($1, 'g-shared', 'Clan'), ($2, 'g-shared', 'Clan'), ($1, 'g-solo', 'Solo')`, [a.user.id, b.user.id]);
  const withGuilds = await call('GET', 'boards', { cookie: a.cookie });
  assert.deepEqual(withGuilds.body.guilds.map(g => g.id), ['g-shared'], 'only guilds shared by 2+ players');
  assert.equal(withGuilds.body.guilds[0].board.streak.length, 2);
  assert.deepEqual((await call('GET', 'boards')).body, { friends: { streak: [], benchmark: {} }, guilds: [] });
});

test('merging an anonymous user moves runs, challenges and friends', { skip: !hasDb }, async () => {
  const target = await newUser();
  const anon = await newUser();
  const friend = await newUser();
  await call('POST', 'runs', { cookie: target.cookie, body: { runs: [run('same', 0, { score: 1 })] } });
  await call('POST', 'runs', { cookie: anon.cookie, body: { runs: [run('same', 0, { score: 2 }), run('only-anon', -1)] } });
  const ch = await call('POST', 'challenges', { cookie: anon.cookie, body: { scenario: 'flick', key: 'flick:v2', seed: 1, score: 10 } });
  await call('POST', `challenges/${ch.body.id}/result`, { cookie: friend.cookie, body: { score: 5 } });
  await q(`INSERT INTO user_guilds (user_id, guild_id, guild_name) VALUES ($1, 'g-merge', 'M')`, [anon.user.id]);

  assert.equal(await mergeUsers(anon.user.id, target.user.id), true);
  created.delete(anon.user.id);
  const runs = (await call('GET', 'runs', { cookie: target.cookie })).body.runs;
  assert.deepEqual(runs.map(r => r.id).sort(), ['only-anon', 'same']);
  assert.equal(runs.find(r => r.id === 'same').score, 1, "the target's own copy wins");
  assert.equal((await call('GET', `challenges/${ch.body.id}`)).body.creator.handle, target.user.handle);
  const friends = (await call('GET', 'boards', { cookie: target.cookie })).body.friends.streak.map(e => e.handle);
  assert.ok(friends.includes(friend.user.handle));
  assert.equal((await q('SELECT count(*)::int AS n FROM users WHERE id = $1', [anon.user.id]))[0].n, 0);
  assert.equal((await q(`SELECT count(*)::int AS n FROM user_guilds WHERE user_id = $1 AND guild_id = 'g-merge'`, [target.user.id]))[0].n, 1);
  assert.deepEqual((await call('GET', 'me', { cookie: anon.cookie })).body, { user: null }, "the merged user's old cookie is dead");
  assert.equal(await mergeUsers(target.user.id, target.user.id), false);
});

test('Discord sign-in attaches, adopts a handle, and merges a second device', { skip: !hasDb }, async () => {
  const id = String(9e17 + Math.floor(Math.random() * 1e15));
  const uname = `tdisc${Date.now().toString(36)}`.slice(0, 20);
  const device1 = await newUser();
  const req = (cookie) => new Request('http://localhost:3000/api/x', { headers: { cookie } });
  const ctx1 = makeContext(req(device1.cookie), new URL('http://localhost:3000/'));
  const u1 = await signInWithDiscord(ctx1, { id, username: uname, global_name: 'Disc Tester', avatar: 'abc' }, [{ id: '123', name: 'G', icon: null }]);
  assert.equal(u1.id, device1.user.id, 'attached to the current anonymous user');
  assert.equal(u1.kind, 'member');
  assert.equal(u1.handle, uname);
  assert.equal(u1.display_name, 'Disc Tester');
  const device2 = await newUser();
  await call('POST', 'runs', { cookie: device2.cookie, body: { runs: [run('d2', 0)] } });
  const ctx2 = makeContext(req(device2.cookie), new URL('http://localhost:3000/'));
  const u2 = await signInWithDiscord(ctx2, { id, username: uname, global_name: 'Disc Tester', avatar: 'def' }, []);
  created.delete(device2.user.id);
  assert.equal(u2.id, device1.user.id, 'second device switches to the existing member');
  assert.equal(u2.discord_avatar, 'def');
  const me = await call('GET', 'me', { cookie: ctx2.cookies.at(-1).split(';')[0] });
  assert.equal(me.body.user.signIn.discord, true);
  assert.equal(me.body.user.avatarUrl, `https://cdn.discordapp.com/avatars/${id}/def.png?size=128`);
  assert.deepEqual((await call('GET', 'runs', { cookie: device1.cookie })).body.runs.map(r => r.id), ['d2'], "device 2's runs merged in");
});

test('email codes: send, verify, rate limits, and a second device switches accounts', { skip: !hasDb }, async () => {
  // Neon Auth stands in as a stub: it accepts any send and only the code 123456.
  const sent = [];
  const fakeAuth = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/email-otp/send-verification-otp')) { sent.push(body); return new Response('{"success":true}', { status: 200 }); }
    if (url.endsWith('/sign-in/email-otp')) {
      return body.otp === '123456' ? new Response('{"token":"x"}', { status: 200 }) : new Response('{"code":"INVALID_OTP"}', { status: 400 });
    }
    return new Response('{}', { status: 404 });
  };
  const email = `t${Date.now().toString(36)}@example.com`;
  const req = (cookie) => new Request('http://localhost:3000/api/x', { headers: cookie ? { cookie } : {} });
  const ctxOf = (cookie) => makeContext(req(cookie), new URL('http://localhost:3000/'));
  const prevBase = process.env.DEV_NEON_AUTH_BASE_URL;
  process.env.DEV_NEON_AUTH_BASE_URL = 'https://auth.test/neondb/auth';
  try {
    const d1 = await newUser();
    await assert.rejects(startEmail(ctxOf(d1.cookie), { email: 'not an email' }, { fetchImpl: fakeAuth }), /email address/);
    const t0 = Date.now();
    assert.deepEqual(await startEmail(ctxOf(d1.cookie), { email: ` ${email.toUpperCase()} ` }, { fetchImpl: fakeAuth, now: t0 }), { ok: true, email });
    assert.deepEqual(sent.at(-1), { email, type: 'sign-in' });
    await assert.rejects(startEmail(ctxOf(d1.cookie), { email }, { fetchImpl: fakeAuth, now: t0 + 5000 }), (e) => e.status === 429);
    await assert.rejects(verifyEmail(ctxOf(d1.cookie), { code: '000000' }, { fetchImpl: fakeAuth }), /isn’t right/);
    const ctx1 = ctxOf(d1.cookie);
    const r1 = await verifyEmail(ctx1, { code: '123 456' }, { fetchImpl: fakeAuth });
    assert.equal(r1.user.id, d1.user.id);
    assert.equal(r1.merged, false);
    const me1 = await call('GET', 'me', { cookie: ctx1.cookies.at(-1).split(';')[0] });
    assert.equal(me1.body.user.kind, 'member');
    assert.equal(me1.body.user.emailVerified, true);
    assert.equal(me1.body.user.email, email);
    assert.equal(me1.body.user.signIn.email, true);

    // Another browser proves the same address: it becomes that account, guest runs included.
    const d2 = await newUser();
    await call('POST', 'runs', { cookie: d2.cookie, body: { runs: [run('e2', 0)] } });
    await startEmail(ctxOf(d2.cookie), { email }, { fetchImpl: fakeAuth });
    const ctx2 = ctxOf(d2.cookie);
    const r2 = await verifyEmail(ctx2, { code: '123456' }, { fetchImpl: fakeAuth });
    created.delete(d2.user.id);
    assert.equal(r2.user.id, d1.user.id);
    assert.equal(r2.merged, true);
    assert.deepEqual((await call('GET', 'runs', { cookie: d1.cookie })).body.runs.map(r => r.id), ['e2']);

    // The plan rides along on the account, validated.
    assert.equal((await call('PATCH', 'me', { cookie: d1.cookie, body: { plan: { startDay: 'x', days: [] } } })).status, 400);
    const plan = { startDay: day(0), days: [{ n: 1, day: day(0), routine: 'diagnostic' }, { n: 2, day: day(1), routine: 'tracking' }] };
    const pr = await call('PATCH', 'me', { cookie: d1.cookie, body: { plan } });
    assert.equal(pr.status, 200);
    assert.deepEqual(pr.body.user.plan, plan);
  } finally {
    if (prevBase === undefined) delete process.env.DEV_NEON_AUTH_BASE_URL; else process.env.DEV_NEON_AUTH_BASE_URL = prevBase;
  }
});

test('push subscriptions and the reminder cron', { skip: !hasDb }, async () => {
  const a = await newUser();
  const endpoint = `https://push.example.test/${ANON}/${Math.random()}`;
  assert.equal((await call('POST', 'push/subscribe', { cookie: a.cookie, body: { subscription: { endpoint: 'http://insecure', keys: { p256dh: 'k', auth: 'a' } } } })).status, 400);
  const sub = await call('POST', 'push/subscribe', { cookie: a.cookie, body: { subscription: { endpoint, keys: { p256dh: 'k', auth: 'a' } }, tz: 'UTC', remindHour: 9 } });
  assert.deepEqual(sub.body, { ok: true });
  assert.equal((await call('GET', 'push/key')).body.publicKey, process.env.VAPID_PUBLIC_KEY);

  const sent = [];
  const send = async (s, payload) => { sent.push(JSON.parse(payload)); };
  const at = (h) => new Date(`${day(0)}T${String(h).padStart(2, '0')}:10:00Z`);
  let r = await runReminders({ now: at(9), send, onlyUserIds: [a.user.id] });
  assert.equal(r.sent, 1);
  assert.equal(sent[0].title, 'Warm up before you queue');
  r = await runReminders({ now: at(9), send, onlyUserIds: [a.user.id] });
  assert.equal(r.sent, 0, 'once per day per kind');
  r = await runReminders({ now: at(20), send, onlyUserIds: [a.user.id] });
  assert.equal(r.sent, 0, 'no streak, so nothing at risk');

  await call('POST', 'runs', { cookie: a.cookie, body: { runs: [run('y', -1)] } });
  r = await runReminders({ now: at(20), send, onlyUserIds: [a.user.id] });
  assert.equal(r.sent, 1);
  assert.match(sent.at(-1).title, /1-day streak ends at midnight/);

  await call('POST', 'runs', { cookie: a.cookie, body: { runs: [run('t', 0)] } });
  await q('UPDATE push_subscriptions SET last_sent_day = NULL WHERE endpoint = $1', [endpoint]);
  r = await runReminders({ now: at(9), send, onlyUserIds: [a.user.id] });
  assert.equal(r.due, 0, 'practiced today: no reminder');

  await q('UPDATE push_subscriptions SET last_sent_day = NULL WHERE endpoint = $1', [endpoint]);
  await q(`DELETE FROM runs WHERE user_id = $1 AND client_id = 't'`, [a.user.id]);
  r = await runReminders({ now: at(9), send: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); }, onlyUserIds: [a.user.id] });
  assert.equal(r.removed, 1, 'expired subscriptions are dropped');
  assert.equal((await q('SELECT count(*)::int AS n FROM push_subscriptions WHERE endpoint = $1', [endpoint]))[0].n, 0);

  assert.equal((await call('GET', 'cron/hourly')).status, 401);
  const viaHttp = await call('GET', `cron/hourly?dry=1`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(viaHttp.status, 200);
  assert.equal(typeof viaHttp.body.checked, 'number');
});

test('events, feedback and the admin KPIs', { skip: !hasDb }, async () => {
  const e = await call('POST', 'e', { body: { anonId: `${ANON}-a`, events: [{ name: 'landing', props: { referrer: null, ref: 'discord' } }, { name: 'onboarding_step', props: { step: 'aim_test_done', tier: 'Gold', score: 104.6 } }, { name: 'routine_complete', props: { routine: 'daily5' } }, { name: 'Bad Name' }] } });
  assert.deepEqual(e.body, { ok: true, accepted: 3 });
  await call('POST', 'e', { body: { anonId: `${ANON}-a`, events: [{ name: 'error', props: { message: 'x' } }] } });
  await call('POST', 'e', { body: { anonId: `${ANON}-b`, events: [{ name: 'landing', props: { referrer: 'www.google.com' } }] } });
  assert.equal((await call('POST', 'e', { body: { events: 'nope' } })).status, 400);
  assert.equal((await call('POST', 'feedback', { body: { text: '  ', anonId: ANON } })).status, 400);
  assert.deepEqual((await call('POST', 'feedback', { body: { text: 'More sniper drills', context: { route: '/' }, anonId: `${ANON}-f` } })).body, { ok: true });

  assert.equal((await call('GET', 'admin/kpis')).status, 401);
  assert.equal((await call('GET', 'admin/kpis', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const k = await call('GET', 'admin/kpis', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
  assert.equal(k.status, 200);
  for (const f of ['funnel30d', 'cohorts', 'dau', 'streakDistribution', 'challenges', 'users', 'feedback', 'errors', 'recentVisitors']) assert.ok(f in k.body, f);
  assert.ok(k.body.funnel30d.landing >= 1);
  const visitor = k.body.recentVisitors.find(x => x.ref === 'discord' && x.aim_score === 105);
  assert.ok(visitor, 'the visitor posted above is listed');
  assert.equal(visitor.aim_tier, 'Gold');
  assert.equal(visitor.last_step, 'aim_test_done');
  assert.deepEqual(visitor.routines, ['daily5']);
  assert.equal(visitor.returning, false);
  const looker = k.body.recentVisitors.find(x => x.referrer === 'www.google.com' && x.last_step === null && !x.aim_tier);
  assert.deepEqual(looker && looker.routines, [], 'a visitor who finished nothing has an empty list, not null');
  const kt = await call('GET', 'admin/kpis?tz=Pacific/Kiritimati', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
  assert.equal(kt.body.tz, 'Pacific/Kiritimati');
  assert.equal((await call('GET', 'admin/kpis?tz=Not/AZone', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } })).body.tz, 'UTC');
  assert.ok(k.body.feedback.some(f => f.text === 'More sniper drills'));

  assert.equal((await call('GET', 'admin/feedback')).status, 401);
  const fb = await call('GET', 'admin/feedback?limit=500', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
  assert.equal(fb.status, 200);
  const mine = fb.body.items.find(f => f.text === 'More sniper drills');
  assert.equal(mine.context.route, '/');
  assert.ok(fb.body.total >= fb.body.items.length);
  assert.equal((await call('GET', 'admin/feedback?before=x', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } })).status, 400);
});

test('the daily digest', { skip: !hasDb }, async () => {
  const { previousDay, buildDigest } = await import('../../lib/digest.mjs');
  // 03:00 UTC on the 12th is still the 11th in New York, so "yesterday" there is the 10th.
  assert.equal(previousDay(new Date('2026-11-12T03:00:00Z'), 'America/New_York'), '2026-11-10');
  assert.equal(previousDay(new Date('2026-11-12T03:00:00Z'), 'UTC'), '2026-11-11');

  const anon = `${ANON}-digest`;
  await call('POST', 'e', { body: { anonId: anon, events: [{ name: 'landing' }, { name: 'aim_test_done' }, { name: 'routine_complete' }] } });
  const today = new Date().toISOString().slice(0, 10);
  const d = await buildDigest({ day: today, tz: 'UTC' });
  assert.equal(d.days.length, 8);
  assert.equal(d.days[7].day, today);
  assert.ok(d.days[7].visitors >= 1 && d.days[7].aim_tests >= 1 && d.days[7].trainers >= 1);
  assert.match(d.subject, new RegExp(`^Quickswitch ${today}: \\d+ visitors?, \\d+ finished a routine$`));
  assert.match(d.text, /Took the aim test/);
  assert.match(d.html, /<table/);

  // The reader's zone comes from their account unless DIGEST_TZ pins one; the report goes out at 8 am there.
  const { digestIfDue, readerTimeZone } = await import('../../lib/digest.mjs');
  const reader = await newUser();
  const handle = `dg${Date.now().toString(36)}`;
  await q('UPDATE users SET handle = $2, tz = $3 WHERE id = $1', [reader.user.id, handle, 'Asia/Tokyo']);
  const saved = { tz: process.env.DIGEST_TZ, handle: process.env.DIGEST_HANDLE };
  delete process.env.DIGEST_TZ;
  process.env.DIGEST_HANDLE = handle;
  try {
    assert.equal(await readerTimeZone(), 'Asia/Tokyo');
    // 23:30 UTC is 08:30 the next day in Tokyo, 17:30 in New York.
    const due = await digestIfDue({ now: new Date('2026-11-11T23:30:00Z'), dryRun: true });
    assert.deepEqual(due, { due: true, tz: 'Asia/Tokyo', sent: false, day: '2026-11-11' });
    assert.equal((await digestIfDue({ now: new Date('2026-11-11T22:30:00Z'), dryRun: true })).due, false);
    process.env.DIGEST_TZ = 'America/New_York';
    assert.equal(await readerTimeZone(), 'America/New_York');
  } finally {
    if (saved.tz === undefined) delete process.env.DIGEST_TZ; else process.env.DIGEST_TZ = saved.tz;
    if (saved.handle === undefined) delete process.env.DIGEST_HANDLE; else process.env.DIGEST_HANDLE = saved.handle;
  }

  assert.equal((await call('GET', 'cron/digest?dry=1')).status, 401);
  const dry = await call('GET', `cron/digest?dry=1&day=${today}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(dry.status, 200);
  assert.equal(dry.body.sent, false);
  assert.equal((await call('GET', 'cron/digest?dry=1&day=nope', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).status, 400);
  await q('DELETE FROM events WHERE anon_id = $1', [anon]);
});

test('unknown routes and wrong methods', { skip: !hasDb }, async () => {
  assert.equal((await call('GET', 'nope')).status, 404);
  assert.equal((await call('DELETE', 'health')).status, 405);
  const big = await handle(new Request('http://localhost:3000/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(20000) }) }));
  assert.equal(big.status, 413);
});

test('gun votes: one per user per gun, changeable, and capped per address', { skip: !hasDb }, async () => {
  const { VOTERS_PER_ADDRESS_PER_DAY } = await import('../../lib/votes.mjs');
  const ip = `203.0.113.${Date.now() % 250}`;
  const as = (cookie) => ({ cookie, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
  const a = await newUser();
  const before = (await call('GET', 'votes')).body.tallies.m870 || { up: 0, down: 0 };

  let r = await call('POST', 'votes', { body: { gun: 'm870', vote: 1 }, ...as(a.cookie) });
  assert.deepEqual(r.body, { gun: 'm870', up: before.up + 1, down: before.down, mine: 1 });
  r = await call('POST', 'votes', { body: { gun: 'm870', vote: -1 }, ...as(a.cookie) });
  assert.deepEqual([r.body.up, r.body.down], [before.up, before.down + 1], 'a second vote replaces the first');
  assert.equal((await call('GET', 'votes', { cookie: a.cookie })).body.mine.m870, -1);
  r = await call('POST', 'votes', { body: { gun: 'm870', vote: 0 }, ...as(a.cookie) });
  assert.deepEqual([r.body.up, r.body.down], [before.up, before.down], 'a vote can be taken back');

  assert.equal((await call('POST', 'votes', { body: { gun: 'm9_cursed', vote: 1 }, ...as(a.cookie) })).status, 400);
  assert.equal((await call('POST', 'votes', { body: { gun: 'm870', vote: 5 }, ...as(a.cookie) })).status, 400);

  // A voter with no session gets one; after the daily cap of voters, a new account from the same
  // address is refused, while one that already voted from it can still change its votes.
  let first = null;
  for (let i = 0; i < VOTERS_PER_ADDRESS_PER_DAY; i++) {
    const v = await call('POST', 'votes', { body: { gun: 'mp5', vote: 1 }, headers: { 'x-forwarded-for': ip } });
    assert.equal(v.status, 200, `voter ${i}`);
    created.add((await call('GET', 'me', { cookie: v.cookie })).body.user.id);
    first = first || v.cookie;
  }
  assert.equal((await call('POST', 'votes', { body: { gun: 'mp5', vote: 1 }, headers: { 'x-forwarded-for': ip } })).status, 429);
  assert.equal((await call('POST', 'votes', { body: { gun: 'ak47', vote: 1 }, ...as(first) })).status, 200);
});
