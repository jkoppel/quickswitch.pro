// Seeded randomness for runs two players must share: a challenge replays the creator's spawns.
window.ST = window.ST || {};

// mulberry32: tiny, fast, and good enough for spawn positions and bot timing.
ST.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Swap Math.random for a seeded stream until restore(). The game draws from Math.random everywhere,
// so this is the one switch that makes a whole scenario reproducible from its first spawn.
ST.seededRandom = function (seed) {
  const original = Math.random;
  Math.random = ST.mulberry32(seed);
  let restored = false;
  return {
    restore() { if (!restored) { Math.random = original; restored = true; } },
  };
};

ST.newSeed = function () {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
};
