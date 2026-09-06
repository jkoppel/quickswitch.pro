// The menu backdrop: the same world the drills run in, drawn idly behind the panel.
// survev's own menu sits on a screenshot of the map, so this uses the real grass colour, grid,
// obstacle sprites and player sprites rather than a flat page background.
window.ST = window.ST || {};

ST.menuScene = (function () {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  let canvas = null, ctx = null, raf = null, running = false;
  let t = 0, last = 0, w = 0, h = 0, dpr = 1;
  let props = [], actors = [], cam = { x: 0, y: 0, vx: 0, vy: 0 };
  const PPU = 22;   // a touch tighter than a 1x scope, so the props read at panel size

  function build() {
    props = [];
    const kinds = [
      { sprite: 'map-tree-01.img', scale: 0.7, r: 5.5, weight: 3 },
      { sprite: 'map-bush-01.img', scale: 0.5, r: 3, weight: 3 },
      { sprite: 'map-stone-01.img', scale: 0.4, r: 1.9, weight: 3 },
      { sprite: 'map-barrel-01.img', scale: 0.4, r: 1.9, weight: 2 },
    ];
    const bag = [];
    for (const k of kinds) for (let i = 0; i < k.weight; i++) bag.push(k);
    for (let i = 0; i < 34; i++) {
      const k = bag[Math.floor(Math.random() * bag.length)];
      props.push({ k, x: rand(-90, 90), y: rand(-70, 70), rot: Math.random() < 0.5 ? 0 : rand(0, TAU) });
    }
    props.sort((a, b) => a.k.r - b.k.r);

    // A couple of idle players turning on the spot, the way the real menu shows the world moving.
    const guns = ['mp5', 'ak47', 'm870', 'mosin'].filter(g => ST.WEAPONS[g]);
    actors = [];
    for (let i = 0; i < 3; i++) {
      actors.push({
        x: rand(-55, 55), y: rand(-40, 40), aim: rand(0, TAU),
        spin: rand(-0.5, 0.5), gun: { def: ST.WEAPONS[guns[i % guns.length]], recoil: 0 },
        walk: rand(0, TAU), speed: rand(1.2, 2.6),
      });
    }
    cam = { x: 0, y: 0, vx: rand(-0.6, 0.6), vy: rand(-0.4, 0.4) };
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    cam.x += cam.vx * dt; cam.y += cam.vy * dt;
    if (Math.abs(cam.x) > 26) cam.vx *= -1;
    if (Math.abs(cam.y) > 18) cam.vy *= -1;
    for (const a of actors) {
      a.aim += a.spin * dt;
      a.walk += dt * 0.35;
      a.x += Math.cos(a.walk) * a.speed * dt;
      a.y += Math.sin(a.walk * 0.7) * a.speed * dt;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function draw() {
    const A = ST.assets, SV = ST.SURVEV;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = A.hex(SV.grass);
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(PPU, PPU);
    ctx.translate(-cam.x, -cam.y);

    // Grid, exactly as the map draws it.
    const halfW = w / (2 * PPU), halfH = h / (2 * PPU);
    ctx.strokeStyle = `rgba(0,0,0,${SV.gridAlpha})`;
    ctx.lineWidth = Math.max(1.5 / PPU, 0.03);
    ctx.beginPath();
    const G = SV.gridSize;
    for (let x = Math.floor((cam.x - halfW) / G) * G; x <= cam.x + halfW; x += G) { ctx.moveTo(x, cam.y - halfH); ctx.lineTo(x, cam.y + halfH); }
    for (let y = Math.floor((cam.y - halfH) / G) * G; y <= cam.y + halfH; y += G) { ctx.moveTo(cam.x - halfW, y); ctx.lineTo(cam.x + halfW, y); }
    ctx.stroke();

    for (const p of props) {
      const img = A.get(p.k.sprite);
      if (!img) continue;
      const size = 144 * p.k.scale / SV.ppuBase;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.rot) ctx.rotate(p.rot);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    for (const a of actors) drawActor(a);
    ctx.restore();

    // A soft vignette so the panel on top always has contrast to sit against.
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(10,14,8,0.28)');
    g.addColorStop(1, 'rgba(10,14,8,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // A cut-down copy of the in-game character draw: body, hands and gun at survev's own pivots.
  function drawActor(a) {
    const A = ST.assets, SV = ST.SURVEV, U = SV.ppuBase;
    const def = a.gun.def;
    const body = A.tint('player-base-01.img', A.hex(SV.skinTint));
    const hand = A.tint('player-hands-01.img', A.hex(SV.skinTint));
    const gunImg = def.worldImg && A.get(def.worldImg.sprite);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.aim);
    const pose = def.pistol ? SV.poses.pistol : def.bullpup ? SV.poses.bullpup : SV.poses.rifle;
    const handR = { x: pose.handR[0] / U, y: pose.handR[1] / U };
    const lho = (def.worldImg && def.worldImg.leftHandOffset) || { x: 0, y: 0 };
    const handL = { x: (pose.handL[0] + lho.x) / U, y: (pose.handL[1] + lho.y) / U };
    const bodySize = 140 * SV.bodySpriteScale / U;
    const handSize = 76 * SV.handSpriteScale / U;
    const bag = A.tint('player-circle-base-01.img', A.hex(SV.backpackTint));
    if (bag) {
      const bagScale = (0.4 + SV.backpack.level * 0.03) * 0.5;
      const bagSize = 148 * bagScale * 2 / U;
      ctx.drawImage(bag, -SV.backpack.offsets[0] / U - bagSize / 2, -bagSize / 2, bagSize, bagSize);
    }
    if (body) ctx.drawImage(body, -bodySize / 2, -bodySize / 2, bodySize, bodySize);
    if (gunImg) {
      const ax = handR.x + SV.gunHandOffset[0] / U, ay = handR.y + SV.gunHandOffset[1] / U;
      const gw = gunImg.naturalWidth * def.worldImg.scale.x * 0.5 / U;
      const gl = gunImg.naturalHeight * def.worldImg.scale.y * 0.5 / U;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.PI / 2);
      ctx.drawImage(gunImg, -gw / 2, -gl, gw, gl);
      ctx.restore();
    }
    if (hand) for (const p of [handL, handR]) ctx.drawImage(hand, p.x - handSize / 2, p.y - handSize / 2, handSize, handSize);
    ctx.restore();
  }

  function start(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    if (!props.length) build();
    resize();
    window.addEventListener('resize', resize);
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }
  return { start, stop, rebuild: build };
})();
