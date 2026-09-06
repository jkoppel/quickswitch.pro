// Loads survev sprites (SVG) and provides tinted copies, mirroring how the survev client tints its
// white base sprites with PIXI. Images are vendored from survev (GPL-3.0) under vendor/survev/.
window.ST = window.ST || {};

ST.assets = (function () {
  const BASE = 'vendor/survev/img/';
  const SPRITES = {
    // survev ".img" key -> file
    'player-base-01.img': 'player/player-base-01.svg',
    'player-hands-01.img': 'player/player-hands-01.svg',
    'player-feet-01.img': 'player/player-feet-01.svg',
    'player-circle-base-01.img': 'player/player-circle-base-01.svg',
    'player-bullet-trail-02.img': 'player/player-bullet-trail-02.svg',
    'gun-short-01.img': 'guns/gun-short-01.svg',
    'gun-med-01.img': 'guns/gun-med-01.svg',
    'gun-long-01.img': 'guns/gun-long-01.svg',
    'gun-m4a1-01.img': 'guns/gun-m4a1-01.svg',
    'gun-scar-01.img': 'guns/gun-scar-01.svg',
    'gun-vector-01.img': 'guns/gun-vector-01.svg',
    'gun-dp28-01.img': 'guns/gun-dp28-01.svg',
    'gun-dp28-top-01.img': 'guns/gun-dp28-top-01.svg',
    'gun-spas12-01.img': 'guns/gun-spas12-01.svg',
    'gun-mosin-01.img': 'guns/gun-mosin-01.svg',
    'gun-sv98-01.img': 'guns/gun-sv98-01.svg',
    'gun-awc-01.img': 'guns/gun-awc-01.svg',
    'map-stone-01.img': 'map/map-stone-01.svg',
    'map-barrel-01.img': 'map/map-barrel-01.svg',
    'map-stone-03.img': 'map/map-stone-03.svg',
    'map-bush-01.img': 'map/map-bush-01.svg',
    'part-splat-01.img': 'particles/part-splat-01.svg',
    'part-splat-02.img': 'particles/part-splat-02.svg',
    'part-splat-03.img': 'particles/part-splat-03.svg',
    'part-shell-01.img': 'particles/part-shell-01.svg',
    'part-shell-02.img': 'particles/part-shell-02.svg',
    'part-shell-03.img': 'particles/part-shell-03.svg',
    'part-shell-04.img': 'particles/part-shell-04.svg',
    'part-frag-burst-01.img': 'particles/part-frag-burst-01.svg',
    'part-frag-burst-02.img': 'particles/part-frag-burst-02.svg',
    'part-frag-burst-03.img': 'particles/part-frag-burst-03.svg',
    'part-smoke-01.img': 'particles/part-smoke-01.svg',
    'part-smoke-02.img': 'particles/part-smoke-02.svg',
    'part-smoke-03.img': 'particles/part-smoke-03.svg',
    'proj-frag-pin-01.img': 'proj/proj-frag-pin-01.svg',
    'proj-frag-nopin-nolever-01.img': 'proj/proj-frag-nopin-nolever-01.svg',
    'map-tree-01.img': 'map/map-tree-01.svg',
    'crosshair000.img': 'crosshairs/crosshair000.svg',
  };
  // survev rasterizes SVGs at 2x; the "0.5" in the client's sprite scales undoes that. We load the
  // SVG at its declared size, so world sizes below are derived from the client's numbers directly.
  const images = {};
  const tinted = {};
  let ready = null;

  function load() {
    if (ready) return ready;
    ready = Promise.all(Object.entries(SPRITES).map(([key, file]) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = () => { console.warn('survev sprite failed to load', file); resolve(); };
      img.src = BASE + file;
    })));
    return ready;
  }

  function get(key) { return images[key] || null; }

  // Tint a white sprite the way PIXI's tint does: multiply by the color. Cached per (key, color).
  function tint(key, color) {
    const img = images[key];
    if (!img) return null;
    const ck = key + '|' + color;
    if (tinted[ck]) return tinted[ck];
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    tinted[ck] = c;
    return c;
  }

  const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

  return { load, get, tint, hex, SPRITES };
})();
