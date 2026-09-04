// Small canvas charts for the menu and results screens. Single series, one hue, hover tooltips.
window.ST = window.ST || {};

ST.charts = (function () {
  const INK = '#e8e8e8', INK2 = '#9fb48c', MUTED = 'rgba(255,255,255,0.35)', GRID = 'rgba(255,255,255,0.08)';
  const ACCENT = '#ffd35c';

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function showTip(tip, canvas, x, y, html) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.display = 'block';
    const r = canvas.getBoundingClientRect();
    let left = r.left + x + 12, top = r.top + y - 10;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (left + tw > window.innerWidth - 8) left = r.left + x - tw - 12;
    if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = Math.max(4, top) + 'px';
  }
  // Round the axis maximum to a friendly step so ticks read 100 / 200 / 300 rather than 103 / 206.
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    const m = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
    return m * p;
  }
  function hideTip(tip) { if (tip) tip.style.display = 'none'; }

  // Score over runs. Warm-up runs are hollow; dashed lines mark day boundaries.
  function trend(canvas, runs, tip) {
    const { ctx, w, h } = setup(canvas);
    canvas.onmousemove = null; canvas.onmouseleave = null;
    if (!runs.length) {
      ctx.fillStyle = MUTED; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No runs yet. Scores will chart here.', w / 2, h / 2 + 4);
      return '';
    }
    const pad = { l: 40, r: 12, t: 10, b: 22 };
    const xs = runs.map((_, i) => pad.l + (runs.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (runs.length - 1)));
    const max = niceMax(Math.max(...runs.map(r => r.score)) * 1.1 || 1);
    const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
    // Grid (recessive) + axis labels.
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = INK2; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right';
    // Choose a division count whose steps are round numbers (80 -> 20/40/60/80, not 27/53).
    const divs = [4, 5, 3, 2].find(d => Number.isInteger(max / d) || Number.isInteger(max / d * 10)) || 4;
    for (let i = 0; i <= divs; i++) {
      const v = max * i / divs, yy = y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
      ctx.fillText(Math.round(v), pad.l - 6, yy + 4);
    }
    // Day boundaries.
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.fillStyle = INK2;
    let lastDay = null, lastLabelX = -Infinity;
    runs.forEach((r, i) => {
      if (r.day !== lastDay) {
        if (lastDay !== null) { ctx.beginPath(); ctx.moveTo(xs[i] - 4, pad.t); ctx.lineTo(xs[i] - 4, h - pad.b); ctx.stroke(); }
        const label = r.day.slice(5);
        const tw = ctx.measureText(label).width;
        let lx = xs[i];
        ctx.textAlign = 'center';
        if (lx + tw / 2 > w - pad.r) { ctx.textAlign = 'right'; lx = w - pad.r; }
        if (lx - tw / 2 > lastLabelX + 6) { ctx.fillText(label, lx, h - 6); lastLabelX = lx + tw / 2; }
        lastDay = r.day;
      }
    });
    ctx.setLineDash([]);
    // Line.
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    runs.forEach((r, i) => i ? ctx.lineTo(xs[i], y(r.score)) : ctx.moveTo(xs[i], y(r.score)));
    ctx.stroke();
    // Markers: filled = counted, hollow = warm-up.
    runs.forEach((r, i) => {
      ctx.beginPath(); ctx.arc(xs[i], y(r.score), 4, 0, Math.PI * 2);
      if (r.warmup) { ctx.fillStyle = '#23291f'; ctx.fill(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = ACCENT; ctx.fill(); }
    });
    // Best label.
    const bestI = runs.reduce((b, r, i) => (!r.warmup && (b < 0 || r.score > runs[b].score) ? i : b), -1);
    if (bestI >= 0) {
      ctx.fillStyle = INK; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(runs[bestI].score), xs[bestI], y(runs[bestI].score) - 9);
    }
    // Hover.
    canvas.onmousemove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      let bi = 0;
      xs.forEach((x, i) => { if (Math.abs(x - mx) < Math.abs(xs[bi] - mx)) bi = i; });
      const r = runs[bi];
      const d = new Date(r.ts);
      showTip(tip, canvas, xs[bi], y(r.score), `<b>${Math.round(r.score)}</b> score${r.warmup ? ' <i>(warm-up)</i>' : ''}<br>${Math.round(r.accuracy * 100)}% acc · ${r.hitsPerSec.toFixed(2)} hits/s<br>${r.day} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}${r.weapon ? ' · ' + r.weapon : ''}`);
    };
    canvas.onmouseleave = () => hideTip(tip);
    // Text alternative for the chart.
    const counted = runs.filter(r => !r.warmup);
    const lastRun = runs[runs.length - 1];
    const bestRun = bestI >= 0 ? runs[bestI] : null;
    const days = new Set(runs.map(r => r.day)).size;
    return `${runs.length} run${runs.length === 1 ? '' : 's'} over ${days} day${days === 1 ? '' : 's'}. Last ${Math.round(lastRun.score)}${bestRun ? `, best ${Math.round(bestRun.score)} on ${bestRun.day}` : ''}${counted.length ? '' : ', all warm-up'}.`;
  }

  // Direction rose: time to first hit by flick direction. Brighter wedge = slower.
  function rose(canvas, sectors, tip) {
    const { ctx, w, h } = setup(canvas);
    canvas.onmousemove = null; canvas.onmouseleave = null;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18;
    const valid = sectors.filter(s => s.n > 0 && s.firstHit !== null);
    if (valid.length < 2) {
      ctx.fillStyle = MUTED; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Not enough flicks for a direction map', cx, cy + 4);
      return 'Not enough flicks for a direction map.';
    }
    const vmax = Math.max(...valid.map(s => s.firstHit)), vmin = Math.min(...valid.map(s => s.firstHit));
    const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const wedges = [];
    sectors.forEach((s, i) => {
      const a0 = i * Math.PI / 4 - Math.PI / 8, a1 = a0 + Math.PI / 4;
      const has = s.n > 0 && s.firstHit !== null;
      const t = has && vmax > vmin ? (s.firstHit - vmin) / (vmax - vmin) : 0.5;
      // One hue, light->dark by magnitude, with a 2px surface gap between wedges.
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 + 0.02, a1 - 0.02); ctx.closePath();
      ctx.fillStyle = has ? `hsl(45 90% ${32 + t * 40}%)` : 'rgba(255,255,255,0.06)';
      ctx.fill();
      wedges.push({ a0, a1, s, i });
      const am = (a0 + a1) / 2;
      ctx.fillStyle = INK2; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(DIRS[i], cx + Math.cos(am) * (R + 10), cy + Math.sin(am) * (R + 10) + 4);
      if (has) {
        ctx.fillStyle = t > 0.55 ? '#1a1f16' : INK; ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(s.firstHit.toFixed(2), cx + Math.cos(am) * R * 0.62, cy + Math.sin(am) * R * 0.62 + 4);
      }
    });
    canvas.onmousemove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left - cx, my = ev.clientY - rect.top - cy;
      if (Math.hypot(mx, my) > R) { hideTip(tip); return; }
      let a = Math.atan2(my, mx); if (a < -Math.PI / 8) a += Math.PI * 2;
      const wdg = wedges.find(x => a >= x.a0 && a < x.a1) || wedges[0];
      const s = wdg.s;
      showTip(tip, canvas, mx + cx, my + cy, s.n ? `<b>${DIRS[wdg.i]}</b> · ${s.n} targets<br>${s.firstHit.toFixed(2)}s to first hit${s.gain !== null ? `<br>gain ${s.gain.toFixed(2)}` : ''}` : `<b>${DIRS[wdg.i]}</b> · no targets`);
    };
    canvas.onmouseleave = () => hideTip(tip);
    const slow = sectors.reduce((a, s, i) => (s.n && s.firstHit !== null && (a === null || s.firstHit > sectors[a].firstHit) ? i : a), null);
    const fast = sectors.reduce((a, s, i) => (s.n && s.firstHit !== null && (a === null || s.firstHit < sectors[a].firstHit) ? i : a), null);
    const NAMES = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
    return `Slowest toward ${NAMES[slow]} (${sectors[slow].firstHit.toFixed(2)}s), fastest toward ${NAMES[fast]} (${sectors[fast].firstHit.toFixed(2)}s). Brighter wedges are slower.`;
  }

  return { trend, rose };
})();
