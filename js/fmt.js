// Dates and numbers in the player's own locale. Every date or number the trainer shows goes through
// here, so a German player sees "11. Nov." and "0,92" and a Japanese one "11月11日".
// Day strings ('YYYY-MM-DD', as history stores them) are local calendar days, never UTC midnights.
window.ST = window.ST || {};

ST.fmt = (function () {
  const cache = new Map();
  function dtf(opts) {
    const k = JSON.stringify(opts);
    if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(undefined, opts));
    return cache.get(k);
  }
  function nf(opts) {
    const k = 'n' + JSON.stringify(opts);
    if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(undefined, opts));
    return cache.get(k);
  }

  // A history day string as a local Date at noon (noon keeps DST shifts from crossing midnight).
  function parseDay(day) {
    const [y, m, d] = String(day).split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  const asDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? parseDay(v) : new Date(v);

  const STYLES = {
    short: { month: 'short', day: 'numeric' },                   // Nov 11 · 11. Nov. · 11月11日
    long: { year: 'numeric', month: 'short', day: 'numeric' },   // Nov 11, 2026
    month: { month: 'short' },                                   // Nov
    dayNum: { day: 'numeric' },                                  // 11
    weekday: { weekday: 'short' },                               // Mon · Mo. · 月
    weekdayNarrow: { weekday: 'narrow' },                        // M
  };
  function date(v, style = 'short') { return dtf(STYLES[style] || style).format(asDate(v)); }
  function dateTime(v) { return dtf({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(asDate(v)); }
  function time(v) { return dtf({ hour: 'numeric', minute: '2-digit' }).format(asDate(v)); }
  // An hour of the day (0-23) the way this locale writes clock times: "6 PM", "18 Uhr", "18時".
  function hour(h) { return dtf({ hour: 'numeric' }).format(new Date(2000, 0, 1, h)); }

  // "today", "yesterday", "3 days ago", in the locale's own words.
  function relDay(day, today) {
    const n = Math.round((parseDay(today) - parseDay(day)) / 86400000);
    const rtf = cache.get('rtf') || new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    cache.set('rtf', rtf);
    return rtf.format(-n, 'day');
  }

  // Monday-first weekday names (the calendar and week strips start on Monday).
  function weekdays(style = 'weekdayNarrow') {
    return Array.from({ length: 7 }, (_, i) => date(new Date(2024, 0, 1 + i, 12), style));   // 2024-01-01 was a Monday
  }

  function int(v) { return nf({ maximumFractionDigits: 0 }).format(Math.round(v)); }
  // As many decimals as the value has, up to `max`: 3.5, 2.7, 15 (weapon stats, tips).
  function dec(v, max = 2) { return nf({ maximumFractionDigits: max }).format(v); }
  function num(v, digits = 2) { return nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v); }
  // A 0-1 fraction as a percentage: "97%", "97 %", "97％".
  function pct(frac, digits = 0) { return nf({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(frac); }
  // Seconds with their unit: "0.45s" / "0,45 s".
  function sec(v, digits = 2) { return nf({ style: 'unit', unit: 'second', unitDisplay: 'narrow', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v); }

  return { parseDay, date, dateTime, time, hour, relDay, weekdays, int, dec, num, pct, sec };
})();
