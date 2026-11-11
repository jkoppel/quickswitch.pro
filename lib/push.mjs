// Web push: subscriptions and the reminder cron.
import webpush from 'web-push';
import { q } from './db.mjs';
import { HttpError } from './http.mjs';
import { localNow, streak, validTimeZone } from './shared.mjs';

export const DEFAULT_REMIND_HOUR = 18;
export const RISK_HOUR = 20;

let configured = false;
function configure() {
  if (configured) return;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys are not set');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export function publicKey() {
  if (!process.env.VAPID_PUBLIC_KEY) throw new HttpError(503, 'push is not configured');
  return { publicKey: process.env.VAPID_PUBLIC_KEY };
}

export async function subscribe(ctx, body) {
  const sub = body && body.subscription;
  const endpoint = sub && sub.endpoint;
  const keys = (sub && sub.keys) || {};
  if (typeof endpoint !== 'string' || !/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000) throw new HttpError(400, 'invalid subscription endpoint');
  if (typeof keys.p256dh !== 'string' || keys.p256dh.length > 200 || typeof keys.auth !== 'string' || keys.auth.length > 100) throw new HttpError(400, 'invalid subscription keys');
  const set = {};
  if (body.tz !== undefined && body.tz !== null) {
    if (!validTimeZone(body.tz)) throw new HttpError(400, 'tz must be an IANA time zone');
    set.tz = body.tz;
  }
  if (body.remindHour !== undefined && body.remindHour !== null) {
    if (!Number.isInteger(body.remindHour) || body.remindHour < 0 || body.remindHour > 23) throw new HttpError(400, 'remindHour must be an integer 0–23');
    set.remind_hour = body.remindHour;
  }
  const user = await ctx.ensureUser();
  await q(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [endpoint, user.id, keys.p256dh, keys.auth]);
  if ('tz' in set || 'remind_hour' in set) {
    await q('UPDATE users SET tz = COALESCE($2, tz), remind_hour = COALESCE($3, remind_hour) WHERE id = $1',
      [user.id, set.tz ?? null, set.remind_hour ?? null]);
  }
  return { ok: true };
}

export async function unsubscribe(body) {
  const endpoint = body && body.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 1000) throw new HttpError(400, 'invalid endpoint');
  await q('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  return { ok: true };
}

// Plan routine ids as players see them (js/benchmark.js and the plan's re-test).
const ROUTINE_LABELS = {
  daily: 'Daily 5', clicking: 'Clicking focus', tracking: 'Tracking focus', switching: 'Switching focus',
  moving: 'Moving focus', utility: 'Utility focus', leads: 'Bullet leads', diagnostic: 'the diagnostic', retest: 'the re-test',
};

// Which reminder (if any) a user is due right now. Pure, so it is unit-tested directly.
// `planToday`, when the player has a week plan, is today's plan day ({ n, label }) so the reminder
// names the session instead of a generic five minutes.
export function dueReminder({ localHour, remindHour, practicedToday, currentStreak, planToday = null }) {
  if (practicedToday) return null;
  if (localHour === RISK_HOUR && currentStreak > 0) {
    return { kind: 'risk', title: `Your ${currentStreak}-day streak ends at midnight`, body: 'One routine keeps it alive. Five minutes.' };
  }
  if (localHour === (remindHour ?? DEFAULT_REMIND_HOUR)) {
    const session = planToday ? `Day ${planToday.n}: ${planToday.label}, five minutes.` : 'Five minutes of drills before you play.';
    return {
      kind: 'warmup', title: 'Warm up before you queue',
      body: currentStreak > 0 ? `Your ${currentStreak}-day streak is waiting. ${session}` : session,
    };
  }
  return null;
}

// Sends every reminder due this hour. `send` is injectable for tests.
// `onlyUserIds` restricts the run (tests use it so they never touch real subscriptions).
export async function runReminders({ now = new Date(), dryRun = false, send = null, onlyUserIds = null } = {}) {
  const subs = await q(
    `SELECT s.endpoint, s.p256dh, s.auth, s.last_sent_day::text AS last_sent_day, s.last_kind, s.user_id, u.tz, u.remind_hour, u.plan
     FROM push_subscriptions s JOIN users u ON u.id = s.user_id
     WHERE $1::uuid[] IS NULL OR s.user_id = ANY($1::uuid[])`, [onlyUserIds]);
  const report = { checked: subs.length, due: 0, sent: 0, removed: 0, failed: 0, decisions: [] };
  if (!subs.length) return report;
  const userIds = [...new Set(subs.map(s => s.user_id))];
  const dayRows = await q(
    `SELECT user_id, array_agg(DISTINCT day::text) AS days FROM runs
     WHERE user_id = ANY($1::uuid[]) AND routine_completed AND day > current_date - 400 GROUP BY user_id`, [userIds]);
  const daysOf = new Map(dayRows.map(r => [r.user_id, r.days]));
  if (!dryRun && !send) configure();
  const deliver = send || ((sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600 }));
  for (const s of subs) {
    const local = localNow(s.tz, now);
    const st = streak.computeStreak(daysOf.get(s.user_id) || [], local.day);
    const pd = s.plan && Array.isArray(s.plan.days) ? s.plan.days.find(d => d.day === local.day) : null;
    const planToday = pd ? { n: pd.n, label: ROUTINE_LABELS[pd.routine] || 'today’s session' } : null;
    const r = dueReminder({ localHour: local.hour, remindHour: s.remind_hour, practicedToday: st.practicedToday, currentStreak: st.current, planToday });
    if (!r) continue;
    if (s.last_sent_day === local.day && s.last_kind === r.kind) continue;
    report.due++;
    report.decisions.push({ userId: s.user_id, kind: r.kind, localDay: local.day });
    if (dryRun) continue;
    try {
      await deliver({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: r.title, body: r.body, url: '/', tag: r.kind }));
      await q('UPDATE push_subscriptions SET last_sent_day = $2, last_kind = $3 WHERE endpoint = $1', [s.endpoint, local.day, r.kind]);
      report.sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await q('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]);
        report.removed++;
      } else {
        report.failed++;
        console.error('push failed:', e && (e.statusCode || e.message));
      }
    }
  }
  return report;
}
