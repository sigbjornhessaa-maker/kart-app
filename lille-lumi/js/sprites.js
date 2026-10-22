'use strict';
// Pikselgrafikk for Lille Lumi. Alt tegnes i koden – ingen bildefiler.
// En sprite er en liste med strenger: hvert tegn er en fargenøkkel, '.' er gjennomsiktig.
const Sprites = (() => {
  // ---------- Hjelpere ----------
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function lerpColor(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawMap(g, map, colors, x, y) {
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < row.length; c++) {
        const col = colors[row[c]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  // ---------- Lumi og raketten ----------
  // Raketten peker mot høyre. B=kropp, L=lys kant, b=skygge, F=finner, R=nesespiss.
  const ROCKET = [
    'FFF...................',
    'FFFF.LLLLLLLLLLLL.....',
    '.FFLLBBBBBBBBBBBBRR...',
    '..BBBBBBBBBBBFBBBRRRR.',
    '..BBBBBBBBBBBFBBBRRRRR',
    '..bBBBBBBBBBBFBBBRRRR.',
    '.FFbbbbbbbbbbbbbbRR...',
    'FFFF.bbbbbbbbbbbb.....',
    'FFF...................',
  ];

  const WINDSHIELD = ['W.', 'Ww', 'WW', 'WW'];

  // Lumi sitt hode som stikker opp av cockpiten.
  const HEAD = [
    '...GGGG...',
    '.GhhGGGGG.',
    'GhGwEGGwEG',
    'GGGEEGGEEG',
    'GPGGGGGGPG',
    'gGGGGmmGGg',
    'ggGGGGGGgg',
  ];

  const LUMI_COLORS = {
    G: '#8be38a', g: '#4fae62', h: '#cdf7b8', E: '#231a3a', w: '#ffffff',
    P: '#ff9fc0', m: '#2f6e45', Y: '#ffe066',
  };

  // Sammensatt sprite: kroppens origo ligger på (OX, OY) i lerretet.
  const OX = 3, OY = 11, LUMI_W = 26, LUMI_H = 20;
  // Rotasjonspunkt (midt på kroppen) i sprite-koordinater.
  const PIVOT_X = OX + 11, PIVOT_Y = OY + 4;

  const ROCKET_COLORS = [
    { id: 'klassisk', name: 'Klassisk', price: 0, B: '#f2efff', L: '#ffffff', b: '#bdb6e0', F: '#ff6b8b', R: '#ff6b8b' },
    { id: 'himmel', name: 'Himmelblå', price: 60, B: '#7fc8ff', L: '#c4e8ff', b: '#4b8fd6', F: '#ffe066', R: '#ffe066' },
    { id: 'tyggis', name: 'Tyggis', price: 120, B: '#ff9fd0', L: '#ffd3ec', b: '#d96aa6', F: '#8be0ff', R: '#8be0ff' },
    { id: 'sitron', name: 'Sitron', price: 180, B: '#ffe066', L: '#fff4b8', b: '#d9b23c', F: '#7a6cff', R: '#7a6cff' },
    { id: 'mint', name: 'Mint', price: 250, B: '#8ef0c8', L: '#d4fff0', b: '#4cbf98', F: '#ff8f6b', R: '#ff8f6b' },
    { id: 'natt', name: 'Natt', price: 400, B: '#4a3f7a', L: '#7466b8', b: '#2e2652', F: '#ffd447', R: '#7fe3ff' },
    { id: 'gull', name: 'Gull', price: 800, B: '#ffd447', L: '#fff1a0', b: '#c99a1c', F: '#ff5e7e', R: '#ffffff' },
  ];

  // ox = kolonnen i hatten som skal ligge midt på hodet. dy flytter hatten opp (negativ).
  const HATS = [
    { id: 'ingen', name: 'Antenne', price: 0 },
    {
      id: 'party', name: 'Partyhatt', price: 75, ox: 3, dy: 0,
      colors: { P: '#ff7eb6', W: '#fff3a8', Y: '#7fe3ff' },
      frames: [[
        '...Y...',
        '...P...',
        '..PWP..',
        '..WPW..',
        '.PWPWP.',
        'PWPWPWP',
      ]],
    },
    {
      id: 'flosshatt', name: 'Flosshatt', price: 150, ox: 4, dy: 0,
      colors: { K: '#5a4a8a', k: '#9482d0', R: '#ff6b8b' },
      frames: [[
        '.KKKKKK.',
        '.KkKKKK.',
        '.KkKKKK.',
        '.KkKKKK.',
        '.RRRRRR.',
        'KKKKKKKK',
      ]],
    },
    {
      id: 'propell', name: 'Propell', price: 220, ox: 4, dy: 0,
      colors: { R: '#ff6b6b', B: '#5ec8ff', Y: '#ffe066', K: '#3a3355' },
      frames: [
        [
          'RRRRKBBBB..',
          '....K......',
          '..RRYBB....',
          '.RRRYBBB...',
          'RRRRYBBBBYY',
        ],
        [
          '..RRKBB....',
          '....K......',
          '..RRYBB....',
          '.RRRYBBB...',
          'RRRRYBBBBYY',
        ],
      ],
    },
    {
      id: 'heks', name: 'Heksehatt', price: 300, ox: 5, dy: 0,
      colors: { V: '#8a5cff', Y: '#ffe066' },
      frames: [[
        '.......VV.',
        '......VV..',
        '.....VVV..',
        '....VVVV..',
        '...VVVVV..',
        '...YYYYY..',
        'VVVVVVVVVV',
      ]],
    },
    {
      id: 'krone', name: 'Krone', price: 450, ox: 4, dy: 0,
      colors: { Y: '#ffd447', y: '#e0a420', R: '#ff5e7e', B: '#5ec8ff' },
      frames: [[
        'Y..YY..Y',
        'YY.YY.YY',
        'YYYYYYYY',
        'YRYBBYRY',
        'yyyyyyyy',
      ]],
    },
    {
      id: 'glorie', name: 'Glorie', price: 650, ox: 4, dy: -3,
      colors: { Y: '#fff1a0', y: '#ffd447' },
      frames: [
        ['..YYYY..', '.y....y.', '..YYYY..'],
        ['..yyyy..', '.Y....Y.', '..yyyy..'],
      ],
    },
  ];

  const byId = (list, id) => list.find((x) => x.id === id) || list[0];

  function drawLumi(g, colorId, hatId, frame) {
    const col = byId(ROCKET_COLORS, colorId);
    const hat = byId(HATS, hatId);
    drawMap(g, HEAD, LUMI_COLORS, OX + 6, OY - 5);
    if (hat.id === 'ingen') {
      g.fillStyle = LUMI_COLORS.g;
      g.fillRect(OX + 11, OY - 7, 1, 2);
      // Antennekulen blinker mellom to gultoner.
      g.fillStyle = frame ? '#ffb347' : LUMI_COLORS.Y;
      g.fillRect(OX + 11, OY - 9, 2, 2);
      g.fillStyle = '#fff8d0';
      g.fillRect(OX + 11, OY - 9, 1, 1);
    } else {
      const map = hat.frames[frame % hat.frames.length];
      const x = OX + 11 - hat.ox;
      const y = OY - 4 - (map.length - 1) + hat.dy;
      drawMap(g, map, hat.colors, x, y);
    }
    drawMap(g, ROCKET, col, OX, OY);
    drawMap(g, WINDSHIELD, { W: '#bfefff', w: '#ffffff' }, OX + 16, OY - 3);
  }

  const lumiCache = new Map();
  // Returnerer to animasjonsrammer (lerreter) for valgt farge og hatt.
  function lumiFrames(colorId, hatId) {
    const key = colorId + '|' + hatId;
    if (!lumiCache.has(key)) {
      lumiCache.set(key, [0, 1].map((f) => {
        const c = mkCanvas(LUMI_W, LUMI_H);
        drawLumi(c.getContext('2d'), colorId, hatId, f);
        return c;
      }));
    }
    return lumiCache.get(key);
  }

  // ---------- Stjernestøv ----------
  const DUST_FRAMES = [
    ['..Y..', '.YWY.', 'YWWWY', '.YWY.', '..Y..'],
    ['..W..', '..Y..', 'WYWYW', '..Y..', '..W..'],
  ].map((map) => {
    const c = mkCanvas(5, 5);
    drawMap(c.getContext('2d'), map, { Y: '#ffd447', W: '#fffbe0' }, 0, 0);
    return c;
  });

  // ---------- Soner (ny fargepalett hver 1000 m) ----------
  const ZONES = [
    {
      name: 'Melkeveien', sky: ['#17132f', '#3d2c6e'], stars: ['#5d5a9e', '#a9a4e8', '#ffffff'],
      ast: { o: '#1b1530', d: '#5a4a7a', b: '#8a78b0', l: '#c2b4e6' },
      planet: { a: '#ff9ec7', b: '#ffcfe2', ring: '#ffe9a8' },
    },
    {
      name: 'Rosa Tåke', sky: ['#2a1240', '#8a3a7a'], stars: ['#a0508f', '#ffb3d9', '#fff0f8'],
      ast: { o: '#2a0f2a', d: '#7a3a5e', b: '#b8648a', l: '#f0a0c0' },
      planet: { a: '#8fe8ff', b: '#d0f6ff', ring: '#ffffff' },
    },
    {
      name: 'Mintmånen', sky: ['#0d2a33', '#1f6b6b'], stars: ['#3f8f8a', '#9ff0d8', '#effff8'],
      ast: { o: '#0a1f22', d: '#3a6a5e', b: '#6aa08a', l: '#a8dcc0' },
      planet: { a: '#ffd07a', b: '#fff0c0', ring: '#ff9fb8' },
    },
    {
      name: 'Ferskentåken', sky: ['#2d1530', '#c0605a'], stars: ['#b06a6a', '#ffc8a0', '#fff4e8'],
      ast: { o: '#2a1018', d: '#7a3e3a', b: '#b8705a', l: '#f0b08a' },
      planet: { a: '#b49cff', b: '#e0d6ff', ring: '#ffe066' },
    },
    {
      name: 'Isplaneten', sky: ['#101a40', '#4a7ac0'], stars: ['#5a7ab8', '#b8dcff', '#ffffff'],
      ast: { o: '#0c1430', d: '#4a5a8a', b: '#7a90c0', l: '#c0d8f8' },
      planet: { a: '#ffffff', b: '#bfe9ff', ring: '#ff9ec7' },
    },
    {
      name: 'Lavendelland', sky: ['#1e1440', '#7a5ab8'], stars: ['#7a68b8', '#d8c8ff', '#ffffff'],
      ast: { o: '#1a1030', d: '#5e4a8a', b: '#9078c0', l: '#c8b8f0' },
      planet: { a: '#8ef0c8', b: '#d8fff0', ring: '#ffd447' },
    },
  ];

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function zone(i) {
    const z = ZONES[i % ZONES.length];
    const round = Math.floor(i / ZONES.length);
    return Object.assign({}, z, { name: round ? z.name + ' ' + (ROMAN[round + 1] || round + 1) : z.name });
  }

  // ---------- Asteroider ----------
  function makeAsteroid(r, ast, seed) {
    const rng = mulberry32(seed);
    const size = r * 2 + 3;
    const c = mkCanvas(size, size);
    const g = c.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const k1 = rng() * 6.28, k2 = rng() * 6.28;
    const inside = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const a = Math.atan2(dy, dx);
        const rr = r * (0.86 + 0.08 * Math.sin(3 * a + k1) + 0.06 * Math.sin(5 * a + k2));
        inside[y * size + x] = Math.hypot(dx, dy) <= rr ? 1 : 0;
      }
    }
    const isIn = (x, y) => x >= 0 && y >= 0 && x < size && y < size && inside[y * size + x];
    const isEdge = (x, y) => !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isIn(x, y)) continue;
        let col;
        if (isEdge(x, y)) col = ast.o;
        else {
          const l = -((x + 0.5 - cx) + (y + 0.5 - cy)) / (r * 1.41);
          col = l > 0.35 ? ast.l : l < -0.3 ? ast.d : ast.b;
        }
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }

    const craters = r > 8 ? 3 : r > 5 ? 2 : 1;
    for (let i = 0; i < craters; i++) {
      const a = rng() * 6.28, d = rng() * r * 0.5;
      const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d);
      const cr = 0.8 + rng() * r * 0.18;
      for (let y = py - 4; y <= py + 4; y++) {
        for (let x = px - 4; x <= px + 4; x++) {
          if (!isIn(x, y) || isEdge(x, y)) continue;
          const dd = Math.hypot(x - px, y - py);
          if (dd <= cr) g.fillStyle = ast.d;
          else if (dd <= cr + 1 && (x - px) + (y - py) > 0) g.fillStyle = ast.l;
          else continue;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  // ---------- Bakgrunnsplaneter ----------
  function makePlanet(r, pl, skyTop, seed) {
    const rng = mulberry32(seed);
    const ring = rng() < 0.65;
    const rx = r * 1.7, ry = r * 0.45;
    const w = Math.ceil(ring ? rx * 2 : r * 2) + 4, h = r * 2 + 4;
    const c = mkCanvas(w, h);
    const g = c.getContext('2d');
    const cx = w / 2, cy = h / 2;
    const dark = lerpColor(pl.a, skyTop, 0.5);
    const ringDark = lerpColor(pl.ring, skyTop, 0.35);
    const tilt = -0.25, ct = Math.cos(tilt), st = Math.sin(tilt);
    const bandOff = rng() * 10;

    const ringAt = (dx, dy) => {
      if (!ring) return 0;
      const ux = dx * ct + dy * st, uy = -dx * st + dy * ct;
      const e = (ux / rx) ** 2 + (uy / ry) ** 2;
      if (Math.abs(e - 1) > 0.16) return 0;
      return uy < 0 ? 1 : 2; // 1 = bak planeten, 2 = foran
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const ra = ringAt(dx, dy);
        const inPlanet = Math.hypot(dx, dy) <= r;
        let col = null;
        if (ra === 2) col = pl.ring;
        else if (inPlanet) {
          const band = Math.floor((dy + r) / (r / 2.5) + Math.sin(dx * 0.3 + bandOff) * 0.6) % 2;
          col = band ? pl.b : pl.a;
          const l = -(dx * 0.6 + dy * 0.8) / r;
          if (l < -0.45 || (l < -0.3 && (x + y) % 2 === 0)) col = dark;
        } else if (ra === 1) col = ringDark;
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  // ---------- Tittel med pikselfont ----------
  const FONT = {
    L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
    I: ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'],
  };

  function drawTitle(canvas) {
    const lines = [
      { text: 'LILLE', from: '#ff9ec7', to: '#ffd0a8' },
      { text: 'LUMI', from: '#8be38a', to: '#7fd8ff' },
    ];
    const width = (t) => [...t].reduce((s, ch) => s + FONT[ch][0].length + 1, -1);
    const W = Math.max(...lines.map((l) => width(l.text))) + 3, H = 7 * 2 + 3 + 3;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    const plot = (offX, offY, colorFn) => {
      lines.forEach((line, li) => {
        let x = Math.floor((W - 3 - width(line.text)) / 2) + 1;
        const y0 = 1 + li * 10;
        for (const ch of line.text) {
          const glyph = FONT[ch];
          glyph.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++) {
              if (row[rx] !== 'X') continue;
              g.fillStyle = colorFn(line, ry);
              g.fillRect(x + rx + offX, y0 + ry + offY, 1, 1);
            }
          });
          x += glyph[0].length + 1;
        }
      });
    };
    const ink = () => '#231a3a';
    plot(1, 1, ink);
    plot(0, 0, (line, ry) => lerpColor(line.from, line.to, ry / 6));
  }

  return {
    mkCanvas, lerpColor, mulberry32, drawMap,
    ROCKET_COLORS, HATS, ZONES, LUMI_W, LUMI_H, PIVOT_X, PIVOT_Y, OX, OY,
    lumiFrames, drawLumi, DUST_FRAMES, zone, makeAsteroid, makePlanet, drawTitle, byId,
  };
})();
