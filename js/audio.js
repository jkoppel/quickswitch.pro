// Tiny synthesized sound effects (no asset files needed).
window.ST = window.ST || {};

ST.audio = (function () {
  let ctx = null;
  let enabled = true;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function shot(def) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const t = c.currentTime;
    const big = def.dmg >= 60 || (def.pellets || 1) > 1;
    const dur = big ? 0.35 : 0.12;

    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 900 : 1800, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(big ? 0.5 : 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur);

    const osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(big ? 120 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(big ? 0.5 : 0.2, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(og); og.connect(c.destination);
    osc.start(t); osc.stop(t + dur);
  }

  function blip(freq, dur, vol) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + dur);
  }

  return {
    setEnabled(v) { enabled = !!v; },
    unlock() { ensure(); },
    shot,
    hit() { blip(1400, 0.05, 0.12); },
    kill() { blip(900, 0.08, 0.15); setTimeout(() => blip(1350, 0.12, 0.15), 70); },
    hurt() { blip(220, 0.12, 0.2); },
  };
})();
