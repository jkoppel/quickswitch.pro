// Training drills. Each drill is a preset of settings; the menu lets you tweak them.
window.ST = window.ST || {};

ST.DEFAULT_SETTINGS = {
  weapon: 'mp5', secondary: '', throwable: '', throwableCount: 3, perks: [],
  scope: '2x', duration: 60, enemies: 1, behavior: 'strafe',
  enemyHp: 100, enemyShoots: false, enemyAim: 'normal', minDist: 8, maxDist: 16,
  ttl: 0, obstacles: true, stones: 14, barrels: 0, hugCover: false, arena: '',
  sound: true, hitmarker: true,
  adaptive: true, leadHint: false,
};

// Bots that shoot back respawn slowly enough that you can reload between fights, rather than the
// next one arriving while you are still cycling. A drill may override it by setting respawnDelay.
ST.respawnDelayFor = function (s) {
  if (s.ttl > 0) return 0.2;                       // flick targets are meant to keep popping
  const w = ST.WEAPONS[s.weapon];
  if (!s.enemyShoots) return 0.5;
  const full = w ? (w.reloadPerShell ? w.reload * w.mag : w.reload) : 2;
  return Math.max(2, full + 0.4);
};

// Tracking drills are the ones with bots tough enough that the fight is about holding the stream on
// them rather than killing them. They still take damage and still die; nothing is invincible.
ST.isTrackingDrill = (s) => s.enemyHp >= 200 && !s.enemyShoots;

// Scopes are picked the way a player picks them: the smallest one that still shows the fight.
// ST.scopeForDistance uses the short screen axis, which is what limits a 16:9 view (see weapons.js).
ST.MODES = [
  {
    id: 'tracking', name: 'Tracking',
    desc: 'One enemy strafes at mid range. Keep your stream on them: SMG/AR spray control.',
    tip: 'Move your crosshair with the target, not to where it was. Reset your aim on every direction flip.',
    settings: { weapon: 'mp5', scope: '2x', duration: 60, enemies: 1, behavior: 'strafe', enemyHp: 500, minDist: 8, maxDist: 16 },
  },
  {
    id: 'flick', name: 'Flick',
    desc: 'Targets pop up one at a time anywhere on screen and vanish after 1.5 s. One hit kills.',
    tip: 'Snap, confirm, click. Chasing a missed shot is slower than resetting.',
    settings: { weapon: 'mk12', scope: '4x', duration: 60, enemies: 1, behavior: 'hold', enemyHp: 1, minDist: 6, maxDist: 22, ttl: 1.5, respawnDelay: 0.2 },
  },
  {
    id: 'duel', name: '1v1 Duel',
    desc: 'A juking enemy shoots back with the same gun. Dodge with WASD while you land shots.',
    tip: 'Strafe perpendicular to the enemy while firing; standing still doubles their hit rate.',
    settings: { weapon: 'ak47', scope: '2x', duration: 90, enemies: 1, behavior: 'juke', enemyHp: 100, enemyShoots: true, enemyAim: 'normal', minDist: 8, maxDist: 17 },
  },
  {
    id: 'shotgun', name: 'Shotgun Rush',
    desc: 'Enemies charge you. Hip-fire the M870, then quick-switch to the M9 (key 2 or Q) instead of waiting out the pump.',
    tip: 'The M870 takes 0.9 s between shells. A switch to a gun in a different deploy group costs 0.25 s, so shell, switch, tap, switch back beats standing there pumping.',
    settings: { weapon: 'm870', secondary: 'm9', scope: '1x', duration: 60, enemies: 2, behavior: 'push', enemyHp: 100, enemyShoots: true, enemyAim: 'easy', minDist: 8, maxDist: 13 },
  },
  {
    id: 'quickswitch', name: 'Quick Switch',
    desc: 'One-on-one with an M870 and an MP5. Every kill should use both guns: shell, switch, burst, switch.',
    tip: 'survev gives you one free switch a second (0.25 s instead of the gun’s own switch delay). Two shotguns share a deploy group and do not get it, which is why the pairing is shotgun plus anything else.',
    settings: { weapon: 'm870', secondary: 'mp5', enemyWeapon: 'mp5', scope: '1x', duration: 60, enemies: 1, behavior: 'juke', enemyHp: 100, enemyShoots: true, enemyAim: 'normal', minDist: 6, maxDist: 12 },
  },
  {
    id: 'sniper', name: 'Sniper Leads',
    desc: 'Long-range strafing targets on a 15x scope. Bullets take time to arrive: lead your shots.',
    tip: 'A Mosin round covers 178 units a second. At 40 units it is in the air for 0.22 s, and a running target moves almost three body widths in that time.',
    settings: { weapon: 'mosin', scope: '15x', duration: 90, enemies: 1, behavior: 'strafe', enemyHp: 1, minDist: 30, maxDist: 49, leadHint: true },
  },
  {
    id: 'swarm', name: 'Swarm',
    desc: 'Three enemies running lines across the field at once. Pick a target, finish it, switch.',
    tip: 'They are not circling you, they are crossing you, so the lead changes sign as they pass. Commit to one until it dies; splitting damage kills nobody.',
    settings: { weapon: 'm4a1', scope: '2x', duration: 90, enemies: 3, behavior: 'cross', enemyHp: 100, minDist: 8, maxDist: 17 },
  },
  {
    id: 'pistol', name: 'Pistol Tap',
    desc: 'M9 against an orbiting enemy. Semi-auto: every click counts.',
    tip: 'The M9 has a 3° cone standing and 8° while moving (survev adds moving spread on top). Stop to shoot.',
    settings: { weapon: 'm9', scope: '1x', duration: 60, enemies: 1, behavior: 'orbit', enemyHp: 100, minDist: 6, maxDist: 12 },
  },
  {
    id: 'chase', name: 'Chase',
    desc: 'The enemy runs. Chase with WASD and keep landing shots on the move. If they get more than ~6 units past max range for a second, they got away.',
    tip: 'Moving spread is real: the AK cone grows from 2.5° to 10° while running. Fire in short bursts at the moments you are closing, and never stop long enough to lose them.',
    settings: { weapon: 'ak47', scope: '2x', duration: 60, enemies: 1, behavior: 'flee', enemyHp: 100, minDist: 6, maxDist: 12, fleeSpeed: 0.95, leash: 6 },
  },
  {
    id: 'dodge', name: 'Dodge',
    desc: 'A strafing enemy with hard aim that leads your movement. Juke to avoid bullets while keeping your own shots on target.',
    tip: 'Predictable strafes get led. Change direction every half second or so, and shoot during the direction changes when you are briefly still.',
    settings: { weapon: 'ak47', scope: '2x', duration: 60, enemies: 1, behavior: 'strafe', enemyHp: 100, enemyShoots: true, enemyAim: 'hard', minDist: 8, maxDist: 14 },
  },
  {
    id: 'spin', name: 'Spin Dodge',
    desc: 'Two shooters with hard aim. Whirl your cursor while you reposition, then stop spinning to shoot back.',
    tip: 'Spinning swings your silhouette around and hides which way you are about to break, so a bot aiming where it last saw you misses wide. It also throws your own aim away, so the drill is the trade: spin while crossing open ground, settle to fire.',
    settings: { weapon: 'ak47', scope: '2x', duration: 75, enemies: 2, behavior: 'strafe', enemyHp: 100, enemyShoots: true, enemyAim: 'hard', minDist: 9, maxDist: 16 },
  },
  {
    id: 'frag', name: 'Frag Lob',
    desc: 'Throw frag grenades at targets that will not stand still. Hold left mouse to pull the pin, release to throw; strength comes from how far your cursor is from you.',
    tip: 'Full strength needs the cursor 18 units out, which is about 19 units of flight. Aim the cursor past the target, not at it, and remember the 4 s fuse gives them time to walk away.',
    settings: {
      weapon: 'mp5', throwable: 'frag', throwableCount: 99, scope: '4x', duration: 60,
      enemies: 2, behavior: 'strafe', enemyHp: 100, minDist: 12, maxDist: 20, stones: 8,
    },
  },
  {
    id: 'cook', name: 'Cooked Frag',
    desc: 'Same grenades, jukier targets. Hold the pin so the frag bursts as it arrives instead of giving them four seconds to leave.',
    tip: 'Cook about 2.5 s for a full-strength throw: roughly a second of flight plus the time they need to notice it. Hold too long and it goes off in your hand, which is survev’s own safety behaviour, not a bug.',
    settings: {
      weapon: 'mp5', throwable: 'frag', throwableCount: 99, scope: '4x', duration: 60,
      enemies: 2, behavior: 'juke', enemyHp: 100, minDist: 12, maxDist: 20, stones: 8,
    },
  },
  {
    id: 'ricochet', name: 'Ricochet',
    desc: 'A random one of survev\u2019s bunkers. The enemy keeps a metal wall between you and it and leans out to shoot, so the straight shot mostly is not there: bounce one off the wall instead.',
    tip: 'Metal is the only material in survev that reflects, and a wall is a flat mirror, so aim at it as far past the corner as the enemy is behind it. Bounced rounds do half damage and will come back at you if you bank one down your own line. It repositions when you do, so walking around the corner is not the answer.',
    settings: {
      weapon: 'm4a1', arena: 'bunker', scope: '2x', duration: 75,
      enemies: 1, behavior: 'cover', enemyHp: 100, enemyShoots: true, enemyAim: 'normal',
      minDist: 7, maxDist: 16,
    },
  },
  {
    id: 'barrel', name: 'Barrel Trap',
    desc: 'Enemies rush you through a barrel field. A barrel has 150 HP and detonates for 125 damage inside 5 units: pop it as they pass, not before.',
    tip: 'The blast falls off to nothing at 12 units and an obstacle in the way stops it dead. Shoot the barrel they are about to run past, not the one they just left.',
    settings: {
      weapon: 'mp5', scope: '4x', duration: 60, enemies: 2, behavior: 'push', enemyHp: 100,
      enemyShoots: true, enemyAim: 'easy', minDist: 14, maxDist: 20, barrels: 18, stones: 6,
    },
  },
  {
    id: 'custom', name: 'Custom',
    desc: 'Configure everything yourself.',
    tip: '',
    settings: {},
  },
];
