// Enemy movement patterns and aim skills, in one place.
//
// Every bot in every drill moves with one of ST.MOVEMENT and aims with one of ST.AIM. Drills pick a
// pattern by id and never define their own, so a change to how bots dodge or lead lands everywhere at
// once — including how spinning affects them, which is handled here rather than per drill.
window.ST = window.ST || {};

(function () {
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- movement ----------
  // update(e, c) returns a desired direction; the game normalises it and applies move speed.
  // `e` holds the bot's own state (timers, chosen heading), `c` is the world it can see.
  // Deliberately a small set: three that circle you at different tempos, two that change the range,
  // one that ignores you and runs lines across the field, and one that hides behind walls.
  ST.MOVEMENT = {
    hold: {
      name: 'Hold position',
      desc: 'Stands still. Pure clicking.',
      update() { return { x: 0, y: 0 }; },
    },

    strafe: {
      name: 'Strafe',
      desc: 'Runs side to side across you, flipping direction unpredictably.',
      update(e, c) {
        if (e.timer <= 0) {
          if (Math.random() < 0.8) e.dirSign = -e.dirSign;
          e.timer = c.rand(0.3, 1.1) * c.tempo;
        }
        let x = c.perp.x * e.dirSign, y = c.perp.y * e.dirSign;
        if (c.dist < c.minDist) { x -= c.toPlayer.x * 0.9; y -= c.toPlayer.y * 0.9; }
        if (c.dist > c.maxDist) { x += c.toPlayer.x * 0.9; y += c.toPlayer.y * 0.9; }
        return { x, y };
      },
    },

    orbit: {
      name: 'Orbit',
      desc: 'Circles you at a steady speed and distance. Predictable: for smooth tracking.',
      update(e, c) {
        const mid = (c.minDist + c.maxDist) / 2;
        const k = clamp((mid - c.dist) * 0.3, -0.8, 0.8);
        return { x: c.perp.x * e.dirSign - c.toPlayer.x * k, y: c.perp.y * e.dirSign - c.toPlayer.y * k };
      },
    },

    juke: {
      name: 'Juke',
      desc: 'Sharp direction changes and dead stops, like a player dodging.',
      update(e, c) {
        if (e.timer <= 0) {
          e.timer = c.rand(0.15, 0.55) * c.tempo;
          e.stopped = Math.random() < 0.15;
          const lateral = Math.random() < 0.5 ? -1 : 1;
          e.heading = Math.atan2(c.perp.y * lateral, c.perp.x * lateral) + c.gauss() * 0.7;
        }
        let x = 0, y = 0;
        if (!e.stopped) { x = Math.cos(e.heading); y = Math.sin(e.heading); }
        if (c.dist < c.minDist) { x -= c.toPlayer.x * 1.2; y -= c.toPlayer.y * 1.2; }
        if (c.dist > c.maxDist) { x += c.toPlayer.x * 1.2; y += c.toPlayer.y * 1.2; }
        return { x, y };
      },
    },

    push: {
      name: 'Push',
      desc: 'Closes the distance and dances at point-blank range.',
      update(e, c) {
        if (e.timer <= 0) { if (Math.random() < 0.6) e.dirSign = -e.dirSign; e.timer = c.rand(0.25, 0.7); }
        if (c.dist > 3.2) return { x: c.toPlayer.x + c.perp.x * e.dirSign * 0.5, y: c.toPlayer.y + c.perp.y * e.dirSign * 0.5 };
        return { x: c.perp.x * e.dirSign + c.toPlayer.x * 0.2, y: c.perp.y * e.dirSign + c.toPlayer.y * 0.2 };
      },
    },

    flee: {
      name: 'Flee',
      desc: 'Runs away with jukes. You have to chase while shooting.',
      update(e, c) {
        if (e.timer <= 0) { if (Math.random() < 0.7) e.dirSign = -e.dirSign; e.timer = c.rand(0.35, 0.9) * c.tempo; }
        let x = -c.toPlayer.x + c.perp.x * e.dirSign * 0.55;
        let y = -c.toPlayer.y + c.perp.y * e.dirSign * 0.55;
        const steer = c.avoid(e.pos, x, y, 7);
        return { x: x + steer.x, y: y + steer.y };
      },
    },

    cross: {
      name: 'Crossing runs',
      desc: 'Ignores you and runs straight lines across the field, stopping and cutting back.',
      update(e, c) {
        // A heading in world space, not relative to you, so it reads as a player crossing an
        // open area rather than circling your cursor.
        if (e.timer <= 0) {
          e.stopped = Math.random() < 0.22;
          e.timer = e.stopped ? c.rand(0.2, 0.5) : c.rand(0.7, 1.6) * c.tempo;
          if (!e.stopped) {
            const turn = Math.random() < 0.45 ? Math.PI + c.gauss() * 0.5 : c.gauss() * 1.1;
            e.heading = (e.heading === undefined ? c.rand(0, TAU) : e.heading + turn);
          }
        }
        if (e.stopped) return { x: 0, y: 0 };
        let x = Math.cos(e.heading), y = Math.sin(e.heading);
        // Turn back rather than grind along a wall or wander out of the fight.
        const steer = c.avoid(e.pos, x, y, 5);
        if (steer.x || steer.y) { x += steer.x; y += steer.y; e.heading = Math.atan2(y, x); }
        if (c.dist > c.maxDist * 1.3) { x += c.toPlayer.x * 1.4; y += c.toPlayer.y * 1.4; e.heading = Math.atan2(y, x); }
        else if (c.dist < c.minDist * 0.6) { x -= c.toPlayer.x * 1.4; y -= c.toPlayer.y * 1.4; e.heading = Math.atan2(y, x); }
        return { x, y };
      },
    },

    cover: {
      name: 'Hold cover',
      desc: 'Keeps a wall between you and it, leaning out to shoot and ducking straight back.',
      update(e, c) {
        // Swap between hiding and leaning out on a timer, but commit to the spot it picks: it walks
        // to its cover and stays there until that cover stops working, rather than re-solving every
        // fraction of a second and thrashing between candidates without ever arriving.
        e.coverT = (e.coverT || 0) - c.dt;
        if (e.coverT <= 0) {
          e.peeking = !e.peeking;
          e.coverT = e.peeking ? c.rand(0.5, 0.9) : c.rand(2.0, 3.4);
          e.goal = null;
        }
        // Cover is only still cover if it still breaks the line; a peek spot only works if it does not.
        const stillGood = e.goal
          && c.blocked(e.goal.x, e.goal.y, c.player.x, c.player.y) !== e.peeking
          && c.clearAt(e.goal.x, e.goal.y);
        if (!stillGood) e.goal = c.findSpot(e.pos, e.peeking) || e.goal;
        if (!e.goal) return { x: c.perp.x * e.dirSign, y: c.perp.y * e.dirSign };

        const dx = e.goal.x - e.pos.x, dy = e.goal.y - e.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.8) return { x: 0, y: 0 };
        const ux = dx / d, uy = dy / d;
        const steer = c.avoid(e.pos, ux, uy, 2.5);
        return { x: ux + steer.x * 0.5, y: uy + steer.y * 0.5 };
      },
    },
  };

  ST.MOVEMENT_ORDER = ['hold', 'strafe', 'orbit', 'juke', 'push', 'cross', 'cover', 'flee'];

  // ---------- aim ----------
  // Sigma is the spread of the bot's aim error in degrees; reaction is how stale its picture of you
  // is; lead is how much of the true lead it attempts; anticipation is how much of that lead it can
  // take from your current movement rather than from what it saw a reaction ago.
  //
  // Anticipation is the spin term, and it is why spinning works identically in every drill: your
  // facing is what tells an opponent which way you are about to break, so whirling the cursor scales
  // anticipation to zero for every skill alike and leaves them leading on stale information.
  //
  // Skill is carried by sigma and reaction: a worse opponent aims loosely and sees you late. Lead and
  // anticipation stay high for all of them, because trying to lead a moving target and reading which
  // way someone is about to break are things every player does, just less accurately. Keeping them
  // high is also what makes spinning worth the same everywhere instead of only against hard bots.
  ST.AIM = {
    easy:   { name: 'Easy',   sigma: 9, reaction: 0.60, lead: 0.70, anticipation: 0.75, burst: [0.3, 0.7], pause: [0.5, 1.0] },
    normal: { name: 'Normal', sigma: 6, reaction: 0.35, lead: 0.90, anticipation: 0.90, burst: [0.4, 1.0], pause: [0.3, 0.7] },
    hard:   { name: 'Hard',   sigma: 4, reaction: 0.20, lead: 1.00, anticipation: 1.00, burst: [0.5, 1.2], pause: [0.25, 0.5] },
  };

  // The one aim solution every bot uses.
  ST.aimSolution = function (e, c) {
    const sk = e.skill;
    e.aimErrT -= c.dt;
    if (e.aimErrT <= 0) {
      e.aimErr = c.gauss() * sk.sigma * c.aimScale * DEG;
      e.leadFrac = sk.lead * c.rand(0.7, 1.15);
      e.aimErrT = c.rand(0.15, 0.4);
    }
    // It shoots at the centre of the silhouette it saw a reaction ago, which your gun swings around
    // as you turn, and leads with a blend of what it saw and what it can anticipate.
    const seen = c.perceived(sk.reaction);
    const antic = (1 - c.spin) * sk.anticipation;
    const vx = lerp(seen.vx, c.playerVel.x, antic);
    const vy = lerp(seen.vy, c.playerVel.y, antic);
    const flight = c.dist / c.bulletSpeed;
    const ax = seen.x + vx * flight * e.leadFrac;
    const ay = seen.y + vy * flight * e.leadFrac;
    return Math.atan2(ay - e.pos.y, ax - e.pos.x) + e.aimErr;
  };

  // Bots fire in bursts and re-aim between them, at a tempo set by their skill.
  ST.aimBurst = function (e, c) {
    e.burstT = (e.burstT || 0) - c.dt;
    if (e.burstT <= 0) {
      e.bursting = !e.bursting;
      const w = e.bursting ? e.skill.burst : e.skill.pause;
      e.burstT = c.rand(w[0], w[1]);
    }
    return e.bursting;
  };
})();
