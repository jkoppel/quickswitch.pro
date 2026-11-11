// Profile charts: practice calendar, multi-series lines, and a dot strip for survev games.
// Thin marks, recessive grid, hover tooltips; text never wears a series color.
window.ST = window.ST || {};

ST.pcharts = (function () {
  const INK2 = '#b6c9a3', MUTED = 'rgba(238,238,238,0.45)', GRID = 'rgba(255,255,255,0.08)';
  const WELL = 'rgba(255,255,255,0.06)';
  const SURFACE = '#141b0b';   // what the chart well composites to over the field; rings use it
  // Single-series data stays tracer yellow. Two-series charts use a pair that passes the dataviz
  // validator on this surface (lightness band, CVD and normal-vision separation, contrast).
  const YELLOW = '#ffd35c';
  const PAIR = ['#c08a1e', '#5a8be0'];

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    canvas.onmousemove = null; canvas.onmouseleave = null;
    return { ctx, w, h };
  }
  function tipShow(tip, canvas, x, y, html) {
    if (!tip) return;
    tip.innerHTML = html; tip.style.display = 'block';
    const r = canvas.getBoundingClientRect();
    let left = r.left + x + 12, top = r.top + y - 10;
    if (left + tip.offsetWidth > innerWidth - 8) left = r.left + x - tip.offsetWidth - 12;
    if (top + tip.offsetHeight > innerHeight - 8) top = innerHeight - tip.offsetHeight - 8;
    tip.style.left = Math.max(4, left) + 'px'; tip.style.top = Math.max(4, top) + 'px';
  }
  const tipHide = (tip) => { if (tip) tip.style.display = 'none'; };
  function empty(ctx, w, h, text) {
    ctx.fillStyle = MUTED; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2 + 4);
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * p;
  }
  // How many gridline steps make round numbers of `max`: 150 → 5 steps of 30, 2.5 → 5 of 0.5.
  function divisions(max) {
    const round = (s) => Number.isInteger(s) || (s < 1 && Number.isInteger(Math.round(s * 1e6) / 1e5));
    return [4, 5, 3, 2].find(d => round(max / d)) || 4;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Practice calendar: one cell per day, weeks as columns, Monday on top, the most recent `weeks`
  // weeks (default: as many as fit, up to a year). Drawn at its natural width so it never stretches.
  // levels: Map day → 1 (practised, no finished routine) or 2 (finished a routine).
  function calendar(canvas, levels, today, tip, opts = {}) {
    const cell = 16, gap = 4, step = cell + gap, top = 18;
    const names = ST.fmt.weekdays('weekday');
    const probe = canvas.getContext('2d');
    probe.font = '11px system-ui, sans-serif';
    const left = Math.ceil(Math.max(...[0, 2, 4].map(i => probe.measureText(names[i]).width))) + 8;
    const avail = (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
    const fit = Math.floor((avail - left + gap) / step);
    const weeks = Math.max(1, Math.min(opts.weeks || 53, fit, 53));
    canvas.style.width = (left + weeks * step - gap) + 'px';
    canvas.style.height = (top + 7 * step - gap) + 'px';
    const { ctx } = setup(canvas);
    const t = ST.fmt.parseDay(today);
    const dow = (t.getDay() + 6) % 7;                 // 0 = Monday
    const start = new Date(t); start.setDate(t.getDate() - dow - (weeks - 1) * 7);
    const cells = [];
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = INK2; ctx.textAlign = 'left';
    [0, 2, 4].forEach((i) => ctx.fillText(names[i], 0, top + i * step + cell - 4));
    let lastMonth = -1, lastLabelEnd = -Infinity;
    for (let wk = 0; wk < weeks; wk++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(start.getDate() + wk * 7 + d);
        if (day > t) continue;
        const key = ST.history.dayKey(day.getTime());
        const x = left + wk * step, y = top + d * step;
        if (d === 0 && day.getMonth() !== lastMonth) {
          lastMonth = day.getMonth();
          const label = ST.fmt.date(day, 'month');
          if (x > lastLabelEnd + 6) { ctx.fillStyle = INK2; ctx.fillText(label, x, 11); lastLabelEnd = x + ctx.measureText(label).width; }
        }
        const lv = levels.get(key) || 0;
        ctx.fillStyle = lv === 2 ? YELLOW : lv === 1 ? 'rgba(255,211,92,0.32)' : WELL;
        roundRect(ctx, x, y, cell, cell, 3); ctx.fill();
        if (key === today) { ctx.strokeStyle = 'rgba(238,238,238,0.7)'; ctx.lineWidth = 1; roundRect(ctx, x - 1.5, y - 1.5, cell + 3, cell + 3, 4); ctx.stroke(); }
        cells.push({ x, y, key, lv });
      }
    }
    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const c = cells.find(c => mx >= c.x - 1 && mx <= c.x + cell + 1 && my >= c.y - 1 && my <= c.y + cell + 1);
      if (!c) return tipHide(tip);
      tipShow(tip, canvas, mx, my, `${ST.fmt.date(c.key, 'long')}<br><b>${c.lv === 2 ? 'Routine finished' : c.lv === 1 ? 'Practised' : 'No practice'}</b>`);
    };
    canvas.onmouseleave = () => tipHide(tip);
  }

  // Lines over a shared categorical x axis (days or weeks). series: [{ name, points: [{ x, v }] }],
  // with null values leaving gaps. One series is yellow; two use the validated pair.
  function lines(canvas, xs, series, opts, tip) {
    const { ctx, w, h } = setup(canvas);
    const anyData = series.some(s => s.points.some(p => p.v !== null && p.v !== undefined));
    if (!xs.length || !anyData) { empty(ctx, w, h, opts.empty || 'Not enough runs yet.'); return; }
    const colors = series.length === 1 ? [YELLOW] : PAIR;
    const pad = { l: 40, r: 14, t: 10, b: 22 };
    const vals = series.flatMap(s => s.points.map(p => p.v)).filter(v => v !== null && v !== undefined);
    const max = opts.max || niceMax(Math.max(...vals) * 1.1);
    const X = (i) => pad.l + (xs.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (xs.length - 1));
    const Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right';
    const divs = divisions(max);
    for (let i = 0; i <= divs; i++) {
      const v = max * i / divs, yy = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
      ctx.fillText(opts.fmt ? opts.fmt(v) : ST.fmt.dec(v), pad.l - 6, yy + 4);
    }
    ctx.textAlign = 'center';
    const labelIdx = xs.length <= 2 ? xs.map((_, i) => i) : [0, Math.floor((xs.length - 1) / 2), xs.length - 1];
    for (const i of labelIdx) {
      ctx.textAlign = labelIdx.length > 1 && i === 0 ? 'left' : labelIdx.length > 1 && i === xs.length - 1 ? 'right' : 'center';
      const x = ctx.textAlign === 'left' ? Math.max(pad.l - 8, X(i) - 8) : ctx.textAlign === 'right' ? Math.min(w - 4, X(i) + 8) : X(i);
      ctx.fillText(opts.xLabel ? opts.xLabel(xs[i]) : xs[i], x, h - 6);
    }
    series.forEach((s, si) => {
      const col = colors[si];
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let pen = false;
      s.points.forEach((p, i) => {
        if (p.v === null || p.v === undefined) { pen = false; return; }
        if (!pen) { ctx.moveTo(X(i), Y(p.v)); pen = true; } else ctx.lineTo(X(i), Y(p.v));
      });
      ctx.stroke();
      // Points get a surface ring so they read where lines cross; a lone point still shows.
      s.points.forEach((p, i) => {
        if (p.v === null || p.v === undefined) return;
        ctx.beginPath(); ctx.arc(X(i), Y(p.v), 4, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = SURFACE; ctx.stroke();
      });
    });
    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let best = 0, bd = Infinity;
      xs.forEach((_, i) => { const d = Math.abs(X(i) - mx); if (d < bd) { bd = d; best = i; } });
      const rows = series.map((s, si) => {
        const v = s.points[best] ? s.points[best].v : null;
        const key = series.length > 1 ? `<span class="key" style="background:${colors[si]}"></span>` : '';
        return `${key}${s.name}: <b>${v === null || v === undefined ? '—' : (opts.fmt ? opts.fmt(v) : ST.fmt.num(v))}</b>`;
      }).join('<br>');
      tipShow(tip, canvas, X(best), e.clientY - r.top, `${opts.xLabel ? opts.xLabel(xs[best]) : xs[best]}<br>${rows}`);
    };
    canvas.onmouseleave = () => tipHide(tip);
  }

  // One dot per game, oldest left. groups: [{ name, test(point) }] picks the pair colour.
  function dots(canvas, points, groups, opts, tip) {
    const { ctx, w, h } = setup(canvas);
    if (!points.length) { empty(ctx, w, h, opts.empty || 'No games yet.'); return; }
    const pad = { l: 40, r: 14, t: 10, b: 22 };
    const max = niceMax(Math.max(...points.map(p => p.v)) * 1.1);
    const X = (i) => pad.l + (points.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (points.length - 1));
    const Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right';
    const divs = divisions(max);
    for (let i = 0; i <= divs; i++) {
      const v = max * i / divs, yy = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
      ctx.fillText(ST.fmt.int(v), pad.l - 6, yy + 4);
    }
    ctx.textAlign = 'center';
    ctx.fillText(opts.firstLabel || 'oldest', X(0), h - 6);
    ctx.fillText(opts.lastLabel || 'latest', X(points.length - 1), h - 6);
    const colorOf = (p) => PAIR[Math.max(0, groups.findIndex(g => g.test(p)))];
    points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(p.v), 4, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(p); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = SURFACE; ctx.stroke();
    });
    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bd = 14;
      points.forEach((p, i) => { const d = Math.hypot(X(i) - mx, Y(p.v) - my); if (d < bd) { bd = d; best = i; } });
      if (best < 0) return tipHide(tip);
      tipShow(tip, canvas, mx, my, opts.tipHtml(points[best]));
    };
    canvas.onmouseleave = () => tipHide(tip);
  }

  return { calendar, lines, dots, PAIR, YELLOW };
})();
