'use strict';
(() => {
  const S = Sprites;
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // ---------- Innstillinger ----------
  const PX_PER_M = 3;          // spillpiksler per meter
  const BASE_SPEED = 22;       // m/s ved start
  const MAX_SPEED = 55;        // m/s maks
  const SPEED_GAIN = 0.006;    // ekstra m/s per meter fløyet
  const ZONE_LENGTH = 1000;    // meter per planetsone
  const THRUST = -290;         // akselerasjon når fingeren holdes
  const GRAVITY = 210;         // akselerasjon når fingeren slippes
  const MAX_VY = 125;

  // ---------- Lagring ----------
  const SAVE_KEY = 'lilleLumi.save.v1';
  const save = (() => {
    const def = { best: 0, dust: 0, ownedColors: ['klassisk'], ownedHats: ['ingen'], color: 'klassisk', hat: 'ingen', sound: true };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(def, JSON.parse(raw));
    } catch (e) { /* privat modus e.l. */ }
    return def;
  })();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignorer */ }
  }
  Sound.enabled = save.sound;

  // ---------- Hjelpere ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (n) => Math.floor(n).toLocaleString('nb-NO');

  // ---------- Skjermstørrelse ----------
  // Spillet tegnes i lav oppløsning (ca. 160 piksler bredt) og skaleres opp
  // med et helt tall, slik at pikslene blir skarpe og like store.
  let W = 180, H = 320;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const appW = vw / vh > 0.75 ? Math.round(vh * 0.6) : vw; // portrettkolonne på PC/landskap
    app.style.width = appW + 'px';
    app.style.height = vh + 'px';
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(1, Math.round((appW * dpr) / 160));
    W = Math.ceil((appW * dpr) / scale);
    H = Math.ceil((vh * dpr) / scale);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = (W * scale) / dpr + 'px';
    canvas.style.height = (H * scale) / dpr + 'px';
    ctx.imageSmoothingEnabled = false;
    initStars();
    bgDirty = true;
    if (state === 'menu' || state === 'shop') lumi.x = W / 2;
  }

  // ---------- Fargepalett med myk overgang mellom soner ----------
  let palFrom = S.zone(0), palTo = S.zone(0), palT = 1;
  let pal = palTo;
  function blendPal() {
    if (palT >= 1) { pal = palTo; return; }
    const t = palT;
    pal = {
      sky: palTo.sky.map((c, i) => S.lerpColor(palFrom.sky[i], c, t)),
      stars: palTo.stars.map((c, i) => S.lerpColor(palFrom.stars[i], c, t)),
      ast: palTo.ast,
      planet: palTo.planet,
    };
  }

  // ---------- Bakgrunn (gradert himmel med dithering, cachet) ----------
  const bgCanvas = S.mkCanvas(1, 1);
  let bgDirty = true, bgAge = 0;
  function renderBg() {
    bgCanvas.width = W;
    bgCanvas.height = H;
    const g = bgCanvas.getContext('2d');
    const bands = 10, bh = H / bands;
    const colAt = (i) => S.lerpColor(pal.sky[0], pal.sky[1], i / (bands - 1));
    for (let i = 0; i < bands; i++) {
      g.fillStyle = colAt(i);
      g.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
    }
    for (let i = 1; i < bands; i++) {
      const y = Math.floor(i * bh);
      g.fillStyle = colAt(i - 1);
      for (let x = 0; x < W; x += 2) g.fillRect(x, y, 1, 1);
      for (let x = 1; x < W; x += 4) g.fillRect(x, y + 1, 1, 1);
    }
    bgDirty = false;
    bgAge = 0;
  }

  // ---------- Parallax-stjerner ----------
  const LAYERS = [
    { n: 45, speed: 0.06 },
    { n: 26, speed: 0.22 },
    { n: 12, speed: 0.55 },
  ];
  let stars = [];
  function initStars() {
    const area = (W * H) / (180 * 320);
    stars = LAYERS.map((L) => Array.from({ length: Math.round(L.n * area) }, () => ({
      x: Math.random() * W, y: Math.random() * H, t: Math.random() * 6.28,
    })));
  }
  function updateStars(dt, speed) {
    stars.forEach((layer, li) => {
      const v = speed * LAYERS[li].speed * dt;
      for (const s of layer) {
        s.x -= v;
        s.t += dt * 3;
        if (s.x < -2) { s.x += W + 4; s.y = Math.random() * H; }
      }
    });
  }
  function drawStars(li) {
    ctx.fillStyle = pal.stars[li];
    for (const s of stars[li]) {
      const x = Math.round(s.x), y = Math.round(s.y);
      if (li === 2 && Math.sin(s.t) > 0.5) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      } else if (li === 0 && Math.sin(s.t * 0.7) < -0.8) {
        continue; // svak blinking i bakerste lag
      } else {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // ---------- Planeter i bakgrunnen ----------
  let planets = [];
  function spawnPlanet() {
    const r = Math.round(rand(14, 24));
    const img = S.makePlanet(r, palTo.planet, palTo.sky[0], (Math.random() * 1e9) | 0);
    planets.push({ img, x: W + img.width / 2 + 4, y: rand(H * 0.12, H * 0.6) });
  }

  // ---------- Partikler ----------
  let particles = [];
  function emit(x, y, vx, vy, life, color, size = 1) {
    particles.push({ x, y, vx, vy, life, max: life, color, size });
  }
  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(speed * 0.3, speed);
      emit(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.8), colors[i % colors.length], Math.random() < 0.3 ? 2 : 1);
    }
  }
  const FLAME = ['#fff3a8', '#ffd447', '#ff9f43', '#ff6b8b', '#a04a7a'];

  // ---------- Tilstand ----------
  let state = 'menu';           // menu | play | dying | over | shop | paused
  let time = 0, shake = 0, holding = false;
  const lumi = { x: 90, y: 160, vy: 0, angle: 0, spin: 0, alpha: 1 };
  let run = null;
  let asteroids = [], dust = [];

  function newRun() {
    return {
      distM: 0, speedM: BASE_SPEED, dust: 0, zone: 0,
      astTimer: 1.6, dustTimer: 0.8, combo: 0, comboTimer: 0, dyingTimer: 0,
    };
  }

  // ---------- Skjermer ----------
  const screens = { menu: $('screenStart'), over: $('screenOver'), shop: $('screenShop'), paused: $('screenPause') };
  function setState(s) {
    state = s;
    for (const k in screens) screens[k].classList.toggle('active', k === s);
    const inGame = s === 'play' || s === 'dying';
    $('hud').classList.toggle('hidden', !inGame && s !== 'paused');
    $('soundBtn').classList.toggle('hidden', inGame || s === 'paused');
    if (s === 'menu') refreshMenu();
  }

  function refreshMenu() {
    $('menuBest').textContent = fmt(save.best) + ' m';
    $('menuDust').textContent = fmt(save.dust);
  }

  function updateSoundBtn() {
    $('soundBtn').textContent = save.sound ? '♪ PÅ' : '♪ AV';
    $('soundBtn').classList.toggle('off', !save.sound);
  }

  // ---------- Spillstart / slutt ----------
  function startGame() {
    run = newRun();
    asteroids = [];
    dust = [];
    particles = [];
    planets = [];
    lumi.x = Math.round(W * 0.26);
    lumi.y = H * 0.5;
    lumi.vy = 0;
    lumi.angle = 0;
    lumi.spin = 0;
    lumi.alpha = 1;
    holding = false;
    enterZone(0);
    $('hint').classList.add('show');
    setState('play');
    updateHud(true);
  }

  function enterZone(z) {
    palFrom = pal;
    palTo = S.zone(z);
    palT = z === 0 && palFrom === palTo ? 1 : 0;
    bgDirty = true;
    spawnPlanet();
    const banner = $('zoneBanner');
    $('zoneNum').textContent = 'SONE ' + (z + 1);
    $('zoneName').textContent = palTo.name;
    banner.classList.remove('show');
    void banner.offsetWidth; // start CSS-animasjonen på nytt
    banner.classList.add('show');
    if (z > 0) {
      Sound.zone();
      burst(lumi.x, lumi.y, 24, ['#ffffff', palTo.planet.a, palTo.planet.ring], 90);
    }
  }

  function crash() {
    state = 'dying';
    run.dyingTimer = 1.1;
    shake = 0.45;
    holding = false;
    lumi.vy = -70;
    lumi.spin = rand(6, 9) * (Math.random() < 0.5 ? -1 : 1);
    Sound.crash();
    burst(lumi.x, lumi.y, 40, ['#ffffff', '#ffd447', '#ff9f43', '#ff6b8b', pal.ast.l], 130);
    if (navigator.vibrate) navigator.vibrate(80);
  }

  const OVER_TITLES = ['BONK!', 'AU DA!', 'OI SANN!', 'KRÆSJ!', 'PUFF!'];
  function gameOver() {
    const dist = Math.floor(run.distM);
    const record = dist > save.best;
    if (record) save.best = dist;
    save.dust += run.dust;
    persist();
    $('overTitle').textContent = OVER_TITLES[Math.floor(Math.random() * OVER_TITLES.length)];
    $('overDist').textContent = fmt(dist) + ' m';
    $('overBest').textContent = fmt(save.best) + ' m';
    $('overDust').textContent = '+' + run.dust;
    $('overTotal').textContent = fmt(save.dust);
    $('overRecord').classList.toggle('hidden', !record);
    setState('over');
    if (record && dist > 0) setTimeout(() => Sound.record(), 150);
  }

  // ---------- Hindringer og stjernestøv ----------
  function spawnAsteroid() {
    const diff = clamp(run.distM / 5000, 0, 1);
    const big = Math.random() < 0.15 + 0.3 * diff;
    const r = Math.round(big ? rand(9, 13) : rand(4, 8));
    let y = 0;
    for (let tries = 0; tries < 6; tries++) {
      // Noen asteroider siktes mot Lumi, så det ikke lønner seg å ligge stille.
      y = Math.random() < 0.3 ? lumi.y + rand(-25, 25) : rand(r, H - r);
      y = clamp(y, r, H - r);
      const clash = asteroids.some((a) => a.x > W - 30 && Math.abs(a.y - y) < a.r + r + 8);
      if (!clash) break;
    }
    const x = W + r + 2;
    const vy = Math.random() < 0.25 + diff * 0.3 ? rand(-1, 1) * (8 + diff * 22) : 0;
    asteroids.push({
      x, y, r, vy, extra: rand(0, 0.25),
      img: S.makeAsteroid(r, palTo.ast, (Math.random() * 1e9) | 0),
    });
    dust = dust.filter((d) => Math.hypot(d.x - x, d.y - y) > r + 6);
  }

  function spawnDust() {
    const n = Math.round(rand(5, 9));
    const type = Math.floor(Math.random() * 4);
    const baseY = rand(30, H - 30);
    for (let i = 0; i < n; i++) {
      const x = W + 8 + i * 9;
      let y = baseY;
      if (type === 1) y = baseY + Math.sin(i * 0.8) * 18;
      else if (type === 2) y = baseY - Math.sin((i / (n - 1)) * Math.PI) * 26;
      else if (type === 3) y = baseY + (i - n / 2) * 6;
      y = clamp(y, 8, H - 8);
      if (asteroids.some((a) => Math.hypot(a.x - x, a.y - y) < a.r + 6)) continue;
      dust.push({ x, y, t: Math.random() * 6 });
    }
  }

  function astInterval() {
    return Math.max(0.32, 0.95 - run.distM * 0.00013);
  }

  // Treffsoner for raketten (relativt til midten av kroppen), litt tilgivende.
  const HITBOX = [[-6, 0, 3.2], [0, 0, 3.4], [6, 0, 3], [0, -6, 3.4]];
  function hitsLumi(a) {
    const c = Math.cos(lumi.angle), s = Math.sin(lumi.angle);
    for (const [hx, hy, hr] of HITBOX) {
      const px = lumi.x + hx * c - hy * s, py = lumi.y + hx * s + hy * c;
      if (Math.hypot(a.x - px, a.y - py) < a.r * 0.82 + hr) return true;
    }
    return false;
  }

  // ---------- Oppdatering ----------
  function update(dt) {
    if (state === 'paused') return;
    time += dt;
    if (palT < 1) {
      palT = Math.min(1, palT + dt / 2.5);
      blendPal();
      bgAge += dt;
      if (bgAge > 0.08 || palT >= 1) bgDirty = true;
    }
    shake = Math.max(0, shake - dt);

    let speedPx = 40;
    if (state === 'play') speedPx = run.speedM * PX_PER_M;
    else if (state === 'dying') speedPx = run.speedM * PX_PER_M * (run.dyingTimer / 1.1) * 0.6;
    else if (state === 'over') speedPx = 18;

    updateStars(dt, speedPx);
    for (const p of planets) p.x -= speedPx * 0.04 * dt + 2 * dt;
    planets = planets.filter((p) => p.x > -p.img.width);

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (state === 'play') updatePlay(dt, speedPx);
    else if (state === 'dying') updateDying(dt, speedPx);
    else {
      // Meny/butikk: Lumi svever rolig midt på skjermen.
      lumi.x = W / 2;
      lumi.y = H * 0.5 + Math.sin(time * 2) * 4;
      lumi.angle = Math.sin(time * 1.5) * 0.08;
      lumi.alpha = 1;
      if (state !== 'over') emitFlame(true);
      for (const a of asteroids) a.x -= speedPx * dt;
      for (const d of dust) d.x -= speedPx * dt;
    }
    asteroids = asteroids.filter((a) => a.x > -a.r * 2);
    dust = dust.filter((d) => d.x > -6 && !d.taken);
  }

  function updatePlay(dt, speedPx) {
    run.distM += run.speedM * dt;
    run.speedM = Math.min(MAX_SPEED, BASE_SPEED + run.distM * SPEED_GAIN);
    const z = Math.floor(run.distM / ZONE_LENGTH);
    if (z > run.zone) { run.zone = z; enterZone(z); }

    // Myk, flytende bevegelse: akselerasjon + litt luftmotstand.
    lumi.vy += (holding ? THRUST : GRAVITY) * dt;
    lumi.vy *= 1 - 0.9 * dt;
    lumi.vy = clamp(lumi.vy, -MAX_VY, MAX_VY);
    lumi.y += lumi.vy * dt;
    if (lumi.y < 10) { lumi.y = 10; lumi.vy = Math.max(0, lumi.vy); }
    if (lumi.y > H - 7) { lumi.y = H - 7; lumi.vy = Math.min(0, lumi.vy); }
    const target = clamp(lumi.vy / 260, -0.38, 0.45);
    lumi.angle += (target - lumi.angle) * Math.min(1, dt * 10);
    emitFlame(holding);

    run.astTimer -= dt;
    if (run.astTimer <= 0) {
      spawnAsteroid();
      if (run.distM > 2500 && Math.random() < 0.25) spawnAsteroid();
      run.astTimer = astInterval() * rand(0.7, 1.3);
    }
    run.dustTimer -= dt;
    if (run.dustTimer <= 0) {
      spawnDust();
      run.dustTimer = rand(1.3, 2.4);
    }

    for (const a of asteroids) {
      a.x -= speedPx * (1 + a.extra) * dt;
      a.y += a.vy * dt;
      if (a.y < a.r || a.y > H - a.r) a.vy = -a.vy;
      if (hitsLumi(a)) { crash(); return; }
    }

    run.comboTimer -= dt;
    if (run.comboTimer <= 0) run.combo = 0;
    for (const d of dust) {
      d.x -= speedPx * dt;
      d.t += dt;
      const dx = lumi.x - d.x, dy = lumi.y - d.y, dist = Math.hypot(dx, dy);
      if (dist < 20) { // liten magnet
        d.x += (dx / dist) * 110 * dt;
        d.y += (dy / dist) * 110 * dt;
      }
      if (dist < 8) {
        d.taken = true;
        run.dust++;
        Sound.pickup(run.combo);
        run.combo++;
        run.comboTimer = 0.6;
        burst(d.x, d.y, 6, ['#fffbe0', '#ffd447'], 50);
      }
    }
    if (run.distM > 40) $('hint').classList.remove('show');
    updateHud();
  }

  function updateDying(dt) {
    lumi.vy += GRAVITY * 1.2 * dt;
    lumi.y += lumi.vy * dt;
    lumi.x -= 15 * dt;
    lumi.angle += lumi.spin * dt;
    lumi.alpha = clamp(run.dyingTimer / 0.6, 0, 1);
    if (Math.random() < 0.5) emit(lumi.x, lumi.y, rand(-20, 20), rand(-30, -10), 0.6, '#8a7aa8', 2);
    for (const a of asteroids) a.x -= 20 * dt;
    run.dyingTimer -= dt;
    if (run.dyingTimer <= 0) gameOver();
  }

  function emitFlame(strong) {
    const n = strong ? 2 : Math.random() < 0.4 ? 1 : 0;
    const c = Math.cos(lumi.angle), s = Math.sin(lumi.angle);
    for (let i = 0; i < n; i++) {
      const lx = -13, ly = rand(-1.5, 1.5);
      const vx = -rand(strong ? 40 : 20, strong ? 80 : 40);
      emit(lumi.x + lx * c - ly * s, lumi.y + lx * s + ly * c, vx * c, vx * s + rand(-8, 8),
        rand(0.15, strong ? 0.4 : 0.25), FLAME[0], 1);
    }
  }

  // ---------- HUD ----------
  let hudDist = -1, hudDust = -1;
  function updateHud(force) {
    const d = Math.floor(run.distM);
    if (force || d !== hudDist) {
      hudDist = d;
      $('hudDist').textContent = fmt(d) + ' m';
      $('hudZone').textContent = 'SONE ' + (run.zone + 1);
    }
    if (force || run.dust !== hudDust) {
      hudDust = run.dust;
      $('hudDust').textContent = run.dust;
    }
  }

  // ---------- Tegning ----------
  function render() {
    if (bgDirty) renderBg();
    ctx.save();
    if (shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
    ctx.drawImage(bgCanvas, 0, 0);
    drawStars(0);
    for (const p of planets) ctx.drawImage(p.img, Math.round(p.x - p.img.width / 2), Math.round(p.y - p.img.height / 2));
    drawStars(1);
    drawStars(2);

    for (const d of dust) {
      const f = Math.floor(d.t * 5) % 2;
      ctx.drawImage(S.DUST_FRAMES[f], Math.round(d.x) - 2, Math.round(d.y) - 2);
    }
    for (const a of asteroids) {
      ctx.drawImage(a.img, Math.round(a.x - a.img.width / 2), Math.round(a.y - a.img.height / 2));
    }
    for (const p of particles) {
      const t = 1 - p.life / p.max;
      ctx.fillStyle = p.color === FLAME[0] ? FLAME[Math.min(FLAME.length - 1, Math.floor(t * FLAME.length))] : p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    if (state !== 'over' && state !== 'shop' && lumi.alpha > 0) {
      drawLumi(ctx, lumi.x, lumi.y, lumi.angle, state === 'play' ? holding : true, lumi.alpha, save.color, save.hat);
    }
    ctx.restore();

    if (state === 'shop') drawShopPreview();
  }

  function drawLumi(g, x, y, angle, strong, alpha, colorId, hatId) {
    const frames = S.lumiFrames(colorId, hatId);
    const img = frames[Math.floor(time * 6) % 2];
    g.save();
    g.globalAlpha = alpha;
    g.translate(Math.round(x), Math.round(y));
    g.rotate(Math.round(angle * 12) / 12); // trinnvis vinkel gir mindre «flimring» i pikslene
    // Flamme bak raketten
    const len = (strong ? 5 : 2) + (Math.random() < 0.5 ? 1 : 0);
    g.fillStyle = '#ff9f43';
    g.fillRect(-11 - len, 0, len, 1);
    g.fillStyle = '#ffd447';
    g.fillRect(-11 - len + 2, -1, len - 1, 3);
    g.fillStyle = '#fff3a8';
    g.fillRect(-12, 0, 1, 1);
    g.drawImage(img, -S.PIVOT_X, -S.PIVOT_Y);
    g.restore();
  }

  // ---------- Butikk ----------
  const shop = { tab: 'colors', sel: null };
  const previewCanvas = $('shopPreview');
  previewCanvas.width = S.LUMI_W + 8;
  previewCanvas.height = S.LUMI_H + 4;
  const pctx = previewCanvas.getContext('2d');
  pctx.imageSmoothingEnabled = false;

  const listFor = (tab) => (tab === 'colors' ? S.ROCKET_COLORS : S.HATS);
  const isOwned = (tab, id) => (tab === 'colors' ? save.ownedColors : save.ownedHats).includes(id);
  const isEquipped = (tab, id) => (tab === 'colors' ? save.color : save.hat) === id;

  function previewLook() {
    let color = save.color, hat = save.hat;
    if (shop.sel) {
      if (shop.tab === 'colors') color = shop.sel;
      else hat = shop.sel;
    }
    return { color, hat };
  }

  function drawShopPreview() {
    const { color, hat } = previewLook();
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    const img = S.lumiFrames(color, hat)[Math.floor(time * 6) % 2];
    pctx.drawImage(img, 6, 2 + Math.round(Math.sin(time * 3)));
    pctx.fillStyle = Math.random() < 0.5 ? '#ffd447' : '#ff9f43';
    pctx.fillRect(6 + S.OX - 1, 2 + S.OY + 4 + Math.round(Math.sin(time * 3)), 3, 1);
  }

  function openShop() {
    shop.sel = null;
    setState('shop');
    renderShop();
  }

  function renderShop() {
    $('shopDust').textContent = fmt(save.dust);
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === shop.tab));
    const grid = $('shopGrid');
    grid.innerHTML = '';
    for (const it of listFor(shop.tab)) {
      const owned = isOwned(shop.tab, it.id);
      const equipped = isEquipped(shop.tab, it.id);
      const b = document.createElement('button');
      b.className = 'item' + (equipped ? ' equipped' : '') + (shop.sel === it.id ? ' selected' : '');
      const cv = S.mkCanvas(S.LUMI_W, S.LUMI_H);
      S.drawLumi(cv.getContext('2d'), shop.tab === 'colors' ? it.id : save.color, shop.tab === 'hats' ? it.id : 'ingen', 0);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = equipped ? 'VALGT' : owned ? 'BRUK' : '✦ ' + it.price;
      if (!owned && it.price > save.dust) price.classList.add('poor');
      b.append(cv, name, price);
      b.addEventListener('click', () => {
        Sound.click();
        if (owned) {
          if (shop.tab === 'colors') save.color = it.id; else save.hat = it.id;
          shop.sel = null;
          persist();
        } else {
          shop.sel = shop.sel === it.id ? null : it.id;
        }
        renderShop();
      });
      grid.append(b);
    }
    const buyBtn = $('buyBtn');
    const sel = shop.sel && S.byId(listFor(shop.tab), shop.sel);
    if (sel) {
      buyBtn.classList.remove('hidden');
      buyBtn.classList.toggle('poor', sel.price > save.dust);
      buyBtn.textContent = 'KJØP ' + sel.name.toUpperCase() + ' ✦ ' + sel.price;
      $('shopInfo').textContent = sel.price > save.dust
        ? 'Du trenger ' + (sel.price - save.dust) + ' stjernestøv til.'
        : 'Forhåndsvisning – trykk KJØP!';
    } else {
      buyBtn.classList.add('hidden');
      $('shopInfo').textContent = 'Trykk på noe for å se hvordan det ser ut.';
    }
  }

  function buySelected() {
    const it = S.byId(listFor(shop.tab), shop.sel);
    if (!it) return;
    if (it.price > save.dust) {
      Sound.deny();
      const b = $('buyBtn');
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      return;
    }
    save.dust -= it.price;
    if (shop.tab === 'colors') { save.ownedColors.push(it.id); save.color = it.id; }
    else { save.ownedHats.push(it.id); save.hat = it.id; }
    shop.sel = null;
    persist();
    Sound.buy();
    renderShop();
  }

  // ---------- Input ----------
  const pointers = new Set();
  function press() {
    if (state === 'play') {
      if (!holding) Sound.thrust();
      holding = true;
    }
  }
  function releaseAll() {
    pointers.clear();
    holding = false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.unlock();
    pointers.add(e.pointerId);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignorer */ }
    press();
  });
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) holding = false;
  };
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      Sound.unlock();
      if (state === 'paused') resume();
      else if (state === 'play') press();
      else if (state === 'menu' || state === 'over') startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && pointers.size === 0) holding = false;
  });

  // Hindre scrolling, zoom og iOS-forstørrelsesglass (unntatt i butikklisten).
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.scroll')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('pointerdown', () => Sound.unlock(), true);
  document.addEventListener('touchend', () => Sound.unlock(), { passive: true });

  function pause() {
    if (state !== 'play') return;
    releaseAll();
    setState('paused');
  }
  function resume() {
    releaseAll();
    setState('play');
    last = performance.now();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => { releaseAll(); pause(); });

  // Knapper
  const on = (id, fn) => $(id).addEventListener('click', () => { Sound.click(); fn(); });
  on('playBtn', startGame);
  on('shopBtn', openShop);
  on('retryBtn', startGame);
  on('overShopBtn', openShop);
  on('menuBtn', () => setState('menu'));
  on('shopBackBtn', () => setState('menu'));
  $('buyBtn').addEventListener('click', buySelected);
  $('screenPause').addEventListener('click', resume);
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    Sound.click();
    shop.tab = t.dataset.tab;
    shop.sel = null;
    renderShop();
  }));
  $('soundBtn').addEventListener('click', () => {
    save.sound = !save.sound;
    Sound.enabled = save.sound;
    persist();
    updateSoundBtn();
    Sound.click();
  });

  // ---------- Hovedløkke ----------
  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  S.drawTitle($('title'));
  window.addEventListener('resize', resize);
  resize();
  updateSoundBtn();
  setState('menu');
  requestAnimationFrame(frame);
})();
