// The daily usage email: yesterday next to the seven days before it, then the 30-day funnel,
// retention, streaks, and any feedback and errors. Sent through Resend by the cron in vercel.json.
// DIGEST_TO, RESEND_API_KEY and optionally DIGEST_FROM / DIGEST_TZ come from the environment.
import { q } from './db.mjs';
import { HttpError } from './http.mjs';
import { kpis } from './admin.mjs';
import { escapeHtml } from './page.mjs';

const SITE = 'https://quickswitch.pro';
const DEFAULT_TZ = 'America/New_York';

// The calendar day before `now` in `tz`, as YYYY-MM-DD.
export function previousDay(now, tz) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// One row per day from day-7 to day, oldest first.
async function dailyCounts(day, tz) {
  return q(`
    WITH first AS (
      SELECT anon_id, min((ts AT TIME ZONE $1)::date) AS d0 FROM events WHERE anon_id IS NOT NULL GROUP BY anon_id
    ), ev AS (
      SELECT anon_id, name, (ts AT TIME ZONE $1)::date AS d FROM events
      WHERE anon_id IS NOT NULL AND ts BETWEEN ($2::date - 8)::timestamptz AND ($2::date + 2)::timestamptz
    )
    SELECT g.d::date::text AS day,
      count(DISTINCT e.anon_id)::int AS visitors,
      count(DISTINCT e.anon_id) FILTER (WHERE f.d0 = g.d)::int AS new_visitors,
      count(DISTINCT e.anon_id) FILTER (WHERE e.name = 'aim_test_done')::int AS aim_tests,
      count(*) FILTER (WHERE e.name = 'routine_complete')::int AS routines,
      count(DISTINCT e.anon_id) FILTER (WHERE e.name = 'routine_complete')::int AS trainers,
      count(*) FILTER (WHERE e.name = 'signup')::int AS signups,
      count(*) FILTER (WHERE e.name = 'challenge_created')::int AS challenges,
      count(*) FILTER (WHERE e.name = 'error')::int AS errors
    FROM generate_series($2::date - 7, $2::date, interval '1 day') g(d)
    LEFT JOIN ev e ON e.d = g.d::date
    LEFT JOIN first f ON f.anon_id = e.anon_id
    GROUP BY g.d ORDER BY g.d`, [tz, day]);
}

const ROWS = [
  ['visitors', 'Visitors'],
  ['new_visitors', '  new'],
  ['returning', '  returning'],
  ['aim_tests', 'Took the aim test'],
  ['trainers', 'Finished a routine'],
  ['routines', '  routines finished'],
  ['signups', 'Signed in for the first time'],
  ['challenges', 'Challenges created'],
  ['errors', 'Errors'],
];

const pct = (n, d) => (d ? ` (${Math.round((100 * n) / d)}%)` : '');
const avg = (rows, key) => (rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(1);

export async function buildDigest({ day, tz = DEFAULT_TZ }) {
  const days = (await dailyCounts(day, tz)).map(r => ({ ...r, returning: r.visitors - r.new_visitors }));
  const today = days[days.length - 1];
  const before = days.slice(0, -1);
  const k = await kpis();
  const feedback = await q(`SELECT text, context FROM feedback WHERE (created_at AT TIME ZONE $1)::date = $2 ORDER BY id`, [tz, day]);
  const errors = await q(`
    SELECT coalesce(props->>'message', '(no message)') AS message, count(*)::int AS n FROM events
    WHERE name = 'error' AND (ts AT TIME ZONE $1)::date = $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [tz, day]);

  const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const subject = `Quickswitch ${day}: ${today.visitors} visitor${today.visitors === 1 ? '' : 's'}, ${today.trainers} finished a routine`;

  const table = ROWS.map(([key, label]) => ({ label, value: today[key], average: avg(before, key) }));
  const f = k.funnel30d;
  const funnel = `${f.landing} landed, ${f.routine_complete} finished a routine${pct(f.routine_complete, f.landing)}, `
    + `${f.signup} signed in${pct(f.signup, f.landing)}, ${f.returned_later_day} came back another day${pct(f.returned_later_day, f.landing)}.`;
  const retention = k.cohorts.slice(0, 4).map(c => {
    const r = (n, eligible) => (eligible ? `${Math.round((100 * n) / c.size)}%` : '–');
    return `week of ${c.cohort_week}: ${c.size} visitors, D1 ${r(c.d1, c.d1_eligible)}, D7 ${r(c.d7, c.d7_eligible)}, D30 ${r(c.d30, c.d30_eligible)}`;
  });
  const streaks = Object.entries(k.streakDistribution).filter(([b, n]) => b !== '0' && n > 0).map(([b, n]) => `${n} at ${b} day${b === '1' ? '' : 's'}`).join(', ');

  const text = [
    `${dateLabel} (${tz} time)`,
    '',
    `${''.padEnd(30)}${'Yesterday'.padStart(10)}${'7-day avg'.padStart(11)}`,
    ...table.map(r => `${r.label.padEnd(30)}${String(r.value).padStart(10)}${r.average.padStart(11)}`),
    '',
    `Last 30 days: ${funnel}`,
    `Retention by first visit, ${retention.length ? retention.join('; ') : 'no visitors yet'}.`,
    `Live streaks: ${streaks || 'none'}. Signed-in players: ${k.users.members}.`,
    '',
    `Feedback (${feedback.length}):`,
    ...(feedback.length ? feedback.map(x => `- ${x.text}${x.context && x.context.route ? ` [${x.context.route}]` : ''}`) : ['- none']),
    '',
    `Errors (${today.errors}):`,
    ...(errors.length ? errors.map(e => `- ${e.n}× ${e.message}`) : ['- none']),
    '',
    `Dashboard: ${SITE}/admin.html`,
  ].join('\n');

  const cell = 'padding:4px 12px;border-bottom:1px solid #e5e5e5';
  const list = (items, empty) => (items.length ? `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : `<p>${empty}</p>`);
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;max-width:560px">
<p style="color:#666">${escapeHtml(dateLabel)} (${escapeHtml(tz)} time)</p>
<table style="border-collapse:collapse"><tr><th style="${cell}"></th><th style="${cell};text-align:right">Yesterday</th><th style="${cell};text-align:right">7-day avg</th></tr>
${table.map(r => `<tr><td style="${cell}${r.label.startsWith(' ') ? ';padding-left:28px;color:#666' : ''}">${escapeHtml(r.label.trim())}</td><td style="${cell};text-align:right"><b>${r.value}</b></td><td style="${cell};text-align:right;color:#666">${r.average}</td></tr>`).join('\n')}
</table>
<p><b>Last 30 days:</b> ${escapeHtml(funnel)}</p>
<p><b>Retention by first visit:</b></p>${list(retention, 'No visitors yet.')}
<p><b>Live streaks:</b> ${escapeHtml(streaks || 'none')}. Signed-in players: ${k.users.members}.</p>
<p><b>Feedback (${feedback.length})</b></p>${list(feedback.map(x => x.text), 'None.')}
<p><b>Errors (${today.errors})</b></p>${list(errors.map(e => `${e.n}× ${e.message}`), 'None.')}
<p><a href="${SITE}/admin.html">Open the dashboard</a></p></div>`;

  return { day, tz, subject, text, html, days };
}

export async function sendDigest({ now = new Date(), day, dryRun = false } = {}) {
  const tz = process.env.DIGEST_TZ || DEFAULT_TZ;
  const d = day || previousDay(now, tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'invalid day');
  const digest = await buildDigest({ day: d, tz });
  if (dryRun) return { sent: false, ...digest };

  const { RESEND_API_KEY, DIGEST_TO } = process.env;
  if (!RESEND_API_KEY || !DIGEST_TO) throw new HttpError(503, 'the digest email is not configured');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
      // A retried or doubled cron run sends one email, not two. A send for a day picked by hand
      // skips the key, so testing today's report doesn't swallow tomorrow's scheduled one.
      ...(day ? {} : { 'idempotency-key': `digest-${d}` }),
    },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM || 'Quickswitch <reports@quickswitch.pro>',
      to: DIGEST_TO.split(',').map(s => s.trim()),
      subject: digest.subject, text: digest.text, html: digest.html,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend answered ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { sent: true, id: body.id, day: d, subject: digest.subject };
}
