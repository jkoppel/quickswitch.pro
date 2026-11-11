// The pure modules in platform/shared are UMD scripts written for the browser. The server loads
// the same files so streaks and achievements are computed identically on both sides.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const streak = require('../platform/shared/streak.js');
export const achievements = require('../platform/shared/achievements.js');

// Today's date ('YYYY-MM-DD') and hour in an IANA time zone; UTC if the zone is missing or bad.
export function localNow(tz, now = new Date()) {
  let zone = 'UTC';
  if (tz && validTimeZone(tz)) zone = tz;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function validTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
