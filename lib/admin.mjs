// KPIs for the admin page and the daily digest: funnel, retention cohorts, streaks, challenges,
// feedback, errors, and every visitor of the last 24 hours. Calendar days are the reader's (`tz`); each player's streak uses their own zone.
import { q } from './db.mjs';
import { localNow, streak, validTimeZone } from './shared.mjs';

export async function kpis({ tz = 'UTC' } = {}) {
  if (!validTimeZone(tz)) tz = 'UTC';
  const [funnel] = await q(`
    WITH f AS (
      SELECT anon_id, min(ts) AS first_ts FROM events
      WHERE name = 'landing' AND anon_id IS NOT NULL AND ts > now() - interval '30 days' GROUP BY anon_id
    )
    SELECT count(*)::int AS landing,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND e.name = 'routine_complete'))::int AS routine_complete,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND e.name = 'signup'))::int AS signup,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND (e.ts AT TIME ZONE $1)::date > (f.first_ts AT TIME ZONE $1)::date))::int AS returned_later_day
    FROM f`, [tz]);

  const cohorts = await q(`
    WITH first AS (SELECT anon_id, min(ts AT TIME ZONE $1)::date AS d0 FROM events WHERE anon_id IS NOT NULL GROUP BY anon_id),
         days AS (SELECT DISTINCT anon_id, (ts AT TIME ZONE $1)::date AS d FROM events WHERE anon_id IS NOT NULL)
    SELECT date_trunc('week', f.d0)::date::text AS cohort_week, count(*)::int AS size,
      count(*) FILTER (WHERE f.d0 + 1 <= (now() AT TIME ZONE $1)::date)::int AS d1_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 1))::int AS d1,
      count(*) FILTER (WHERE f.d0 + 7 <= (now() AT TIME ZONE $1)::date)::int AS d7_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 7))::int AS d7,
      count(*) FILTER (WHERE f.d0 + 30 <= (now() AT TIME ZONE $1)::date)::int AS d30_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 30))::int AS d30
    FROM first f GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, [tz]);

  const dau = await q(`
    SELECT (ts AT TIME ZONE $1)::date::text AS day, count(DISTINCT anon_id)::int AS active FROM events
    WHERE ts > now() - interval '14 days' AND anon_id IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`, [tz]);

  const streakRows = await q(`
    SELECT u.id, u.tz, array_agg(DISTINCT r.day::text) AS days FROM users u JOIN runs r ON r.user_id = u.id
    WHERE r.routine_completed GROUP BY u.id, u.tz`);
  const buckets = { '0': 0, '1': 0, '2-6': 0, '7-29': 0, '30+': 0 };
  for (const r of streakRows) {
    const n = streak.computeStreak(r.days, localNow(r.tz).day).current;
    buckets[n === 0 ? '0' : n === 1 ? '1' : n < 7 ? '2-6' : n < 30 ? '7-29' : '30+']++;
  }

  const [challenges] = await q(`
    SELECT (SELECT count(*) FROM challenges)::int AS created,
           (SELECT count(*) FROM events WHERE name = 'challenge_opened')::int AS opened,
           (SELECT count(*) FROM challenge_results)::int AS completed`);
  const [users] = await q(`
    SELECT count(*) FILTER (WHERE kind = 'anon')::int AS anon, count(*) FILTER (WHERE kind = 'member')::int AS members,
           (SELECT count(*) FROM runs)::int AS runs FROM users`);
  const feedback = await q(`SELECT id, text, context, created_at FROM feedback ORDER BY id DESC LIMIT 20`);
  const errors = await q(`SELECT props, ts FROM events WHERE name = 'error' ORDER BY id DESC LIMIT 20`);

  // One row per browser seen in the last 24 hours: when it arrived, where from, and how far it got.
  // Our own events table counts visitors that ad blockers hide from PostHog and Google Analytics.
  const recentVisitors = await q(`
    SELECT v.first_ts, v.last_ts, v.referrer, v.ref, v.aim_tier, v.aim_score, v.last_step, v.routines,
      v.signed_up, u.handle AS member,
      (SELECT min(ts) FROM events e WHERE e.anon_id = v.anon_id) < v.first_ts - interval '1 hour' AS returning
    FROM (
      SELECT anon_id, min(ts) AS first_ts, max(ts) AS last_ts,
        (array_agg(props->>'referrer' ORDER BY ts) FILTER (WHERE name = 'landing'))[1] AS referrer,
        (array_agg(props->>'ref' ORDER BY ts) FILTER (WHERE name = 'landing'))[1] AS ref,
        (array_agg(props->>'tier' ORDER BY ts DESC) FILTER (WHERE name = 'onboarding_step' AND props->>'step' = 'aim_test_done'))[1] AS aim_tier,
        (array_agg((props->>'score')::numeric ORDER BY ts DESC) FILTER (WHERE name = 'onboarding_step' AND props->>'step' = 'aim_test_done'))[1]::int AS aim_score,
        (array_agg(props->>'step' ORDER BY ts DESC) FILTER (WHERE name = 'onboarding_step'))[1] AS last_step,
        coalesce(array_remove(array_agg(props->>'routine' ORDER BY ts) FILTER (WHERE name = 'routine_complete'), NULL), '{}') AS routines,
        bool_or(name = 'signup') AS signed_up,
        (array_agg(user_id ORDER BY ts DESC) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id
      FROM events WHERE anon_id IS NOT NULL AND ts > now() - interval '24 hours' GROUP BY anon_id
    ) v LEFT JOIN users u ON u.id = v.user_id AND u.kind = 'member'
    ORDER BY v.first_ts DESC LIMIT 200`);

  return {
    generatedAt: new Date().toISOString(), tz,
    funnel30d: funnel, cohorts, dau, streakDistribution: buckets, challenges, users,
    feedback, errors, recentVisitors,
  };
}
