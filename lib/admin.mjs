// KPIs for the daily digest: funnel, retention cohorts, streaks, challenges, feedback, errors.
import { q } from './db.mjs';
import { localNow, streak } from './shared.mjs';

export async function kpis() {
  const [funnel] = await q(`
    WITH f AS (
      SELECT anon_id, min(ts) AS first_ts FROM events
      WHERE name = 'landing' AND anon_id IS NOT NULL AND ts > now() - interval '30 days' GROUP BY anon_id
    )
    SELECT count(*)::int AS landing,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND e.name = 'routine_complete'))::int AS routine_complete,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND e.name = 'signup'))::int AS signup,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.anon_id = f.anon_id AND e.ts::date > f.first_ts::date))::int AS returned_later_day
    FROM f`);

  const cohorts = await q(`
    WITH first AS (SELECT anon_id, min(ts)::date AS d0 FROM events WHERE anon_id IS NOT NULL GROUP BY anon_id),
         days AS (SELECT DISTINCT anon_id, ts::date AS d FROM events WHERE anon_id IS NOT NULL)
    SELECT date_trunc('week', f.d0)::date::text AS cohort_week, count(*)::int AS size,
      count(*) FILTER (WHERE f.d0 + 1 <= current_date)::int AS d1_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 1))::int AS d1,
      count(*) FILTER (WHERE f.d0 + 7 <= current_date)::int AS d7_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 7))::int AS d7,
      count(*) FILTER (WHERE f.d0 + 30 <= current_date)::int AS d30_eligible,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM days x WHERE x.anon_id = f.anon_id AND x.d = f.d0 + 30))::int AS d30
    FROM first f GROUP BY 1 ORDER BY 1 DESC LIMIT 12`);

  const dau = await q(`
    SELECT ts::date::text AS day, count(DISTINCT anon_id)::int AS active FROM events
    WHERE ts > now() - interval '14 days' AND anon_id IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`);

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

  return {
    generatedAt: new Date().toISOString(),
    funnel30d: funnel, cohorts, dau, streakDistribution: buckets, challenges, users,
    feedback, errors,
  };
}
