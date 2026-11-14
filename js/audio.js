// Sound effects from survev (GPL-3.0), vendored under vendor/survev/audio/. Uses HTMLAudio elements so
// the trainer keeps working from file:// where fetch-based decoding is blocked.
window.ST = window.ST || {};

ST.audio = (function () {
  const BASE = 'vendor/survev/audio/';
  const FILES = {
    // guns: <name>_01 / <name>_reload_01 / cycle / pull
    empty_fire_01: 'guns/empty_fire_01.mp3', empty_fire_02: 'guns/empty_fire_02.mp3', gun_switch_01: 'guns/gun_switch_01.mp3',
    player_bullet_hit_01: 'hits/player_bullet_hit_01.mp3', player_bullet_hit_02: 'hits/player_bullet_hit_02.mp3',
    stone_bullet_hit_01: 'hits/stone_bullet_hit_01.mp3',
    metal_bullet_hit_01: 'hits/metal_bullet_hit_01.mp3', metal_bullet_hit_02: 'hits/metal_bullet_hit_02.mp3',
    // Throwables and explosions (frag grenades, barrels).
    explosion_01: 'sfx/explosion_01.mp3', explosion_02: 'sfx/explosion_02.mp3', explosion_03: 'sfx/explosion_03.mp3', explosion_04: 'sfx/explosion_04.mp3',
    barrel_break_01: 'sfx/barrel_break_01.mp3',
    frag_pin_01: 'sfx/frag_pin_01.mp3', frag_throw_01: 'sfx/frag_throw_01.mp3', frag_ground_01: 'sfx/frag_ground_01.mp3',
    bullet_whiz_01: 'sfx/bullet_whiz_01.mp3', bullet_whiz_02: 'sfx/bullet_whiz_02.mp3', bullet_whiz_03: 'sfx/bullet_whiz_03.mp3',
  };
  // Every gun's own shot, reload, pump and pull sounds, named in its survev definition.
  for (const w of Object.values(ST.WEAPONS || {})) {
    for (const k of ['shoot', 'reload', 'cycle', 'pull']) {
      const name = w.sound && w.sound[k];
      if (name && !FILES[name]) FILES[name] = `guns/${name}.mp3`;
    }
  }

  const GROUPS = {
    player_bullet_hit: ['player_bullet_hit_01', 'player_bullet_hit_02'],
    bullet_whiz: ['bullet_whiz_01', 'bullet_whiz_02', 'bullet_whiz_03'],
  };

  let enabled = true;
  let unlocked = false;
  const base = {};   // name -> HTMLAudioElement (template)
  const pool = {};   // name -> array of clones for overlapping playback
  const MAX_VOICES = 6;

  function ensure(name) {
    if (base[name] || !FILES[name]) return base[name] || null;
    const a = new Audio(BASE + FILES[name]);
    a.preload = 'auto';
    base[name] = a;
    pool[name] = [];
    return a;
  }
  function preload() { for (const name of Object.keys(FILES)) ensure(name); }

  // Distance attenuation like survev's positional audio: full volume within a few units, fading with distance.
  function volumeFor(dist, fallOff) {
    if (dist === undefined || dist === null) return 1;
    const range = 45 * (fallOff || 1);
    return Math.max(0, Math.min(1, 1 - dist / range)) ** 1.5;
  }

  function play(name, opts) {
    if (!enabled || !unlocked) return;
    const src = ensure(name);
    if (!src) return;
    const vol = (opts && opts.volume !== undefined ? opts.volume : 1) * volumeFor(opts && opts.dist, opts && opts.fallOff);
    if (vol <= 0.01) return;
    let voices = pool[name];
    let a = voices.find(v => v.paused || v.ended);
    if (!a) {
      if (voices.length >= MAX_VOICES) a = voices[0];
      else { a = src.cloneNode(); voices.push(a); }
    }
    a.volume = vol;
    a.currentTime = 0;
    a.play().catch(() => { /* autoplay policy: wait for a gesture */ });
  }
  function playGroup(group, opts) {
    const names = GROUPS[group];
    if (!names) return;
    play(names[Math.floor(Math.random() * names.length)], opts);
  }

  // Gun helpers driven straight from the survev gun def's sound block.
  function shot(def, opts) { play(def.sound.shoot, opts); }
  function empty(def) { play(def.sound.empty); }
  function reload(def, opts) { play(def.sound.reload, opts); }
  function cycle(def, opts) { if (def.sound.cycle) play(def.sound.cycle, opts); }

  return {
    setEnabled(v) { enabled = !!v; },
    unlock() { if (!unlocked) { unlocked = true; preload(); } },
    play, playGroup, shot, empty, reload, cycle,
    hit(opts) { playGroup('player_bullet_hit', opts); },
    whiz(opts) { playGroup('bullet_whiz', opts); },
    hurt() { play('player_bullet_hit_02', { volume: 0.9 }); },
    kill() { /* survev has no kill jingle; the hit sound is the feedback */ },
  };
})();
