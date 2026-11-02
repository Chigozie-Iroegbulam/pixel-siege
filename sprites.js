// sprites.js — pixel-art data, sprite builder, bitmap font, floor generator.
//
// Sprites are written as text grids. Each character maps to a palette color;
// '.' (or any unmapped char) is transparent. They are rendered once into small
// offscreen canvases and then drawn scaled-up with smoothing off.

const PALETTE = {
  K: '#1a1c2c', // outline
  S: '#f4c28c', // skin
  H: '#3b7d4f', // helmet
  h: '#25562f', // helmet shade
  B: '#5b8c3a', // vest
  b: '#3e6b2a', // vest shade
  P: '#41456b', // pants
  O: '#2b2026', // boots
  G: '#a7b4c8', // gun metal
  g: '#5d6f8a', // gun shade
  Y: '#ffe46b', // yellow
  W: '#ffffff', // white
  R: '#ff5a3a', // red / orange
};

function makeSprite(rows, palette = PALETTE) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = palette[row[i]];
      if (col) {
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
  });
  return c;
}

// ---------------------------------------------------------------- player
// Facing right. Body (rows 0-11) is shared; legs change per frame.
const PLAYER_TOP = [
  '................',
  '.....KKKKK......',
  '....KHHHHHK.....',
  '...KHHHHHHHK....',
  '...KhhHHHHHK....',
  '...KKKSSSSKK....',
  '....KSSSSKSK....',
  '....KSSSSSSK....',
  '...KKbBBBBKK....',
  '..KSKbBBBBKSK...',
  '..KKKbBBBBKKK...',
  '....KbBBBBK.....',
];
const LEGS_IDLE = [
  '....KPPKPPK.....',
  '....KPPKPPK.....',
  '....KOOKOOK.....',
  '....KKK.KKK.....',
];
const LEGS_STRIDE = [
  '....KPPKPPK.....',
  '...KPPK.KPPK....',
  '...KOOK.KOOK....',
  '...KKK...KKK....',
];
const LEGS_CROSS = [
  '....KPPKPPK.....',
  '.....KPPPK......',
  '.....KOOOK......',
  '.....KKKKK......',
];

// ---------------------------------------------------------------- weapon
// Pointing right; the grip pivot is at (2,2).
const GUN = [
  '.KKKKKKKKKK.',
  'KGGGGGGGGGGK',
  'KgggggggggK.',
  'KgKKKKKKKK..',
  'KgK.........',
  'KKK.........',
];
const GUN_PIVOT = { x: 2, y: 2 };
const GUN_LENGTH = 10; // pivot to barrel tip

const MUZZLE_1 = [
  '.R....',
  'RYWY..',
  'YWWWWR',
  'RYWY..',
  '.R....',
];
const MUZZLE_2 = [
  '..R...',
  '.YWYR.',
  'RWWWWW',
  '.YWYR.',
  '..R...',
];

const CROSSHAIR = [
  '...KWK...',
  '...KWK...',
  '.........',
  'KK.....KK',
  'WW..R..WW',
  'KK.....KK',
  '.........',
  '...KWK...',
  '...KWK...',
];

// ---------------------------------------------------------------- enemies
// Each enemy type has its own palette so shapes can be recolored later.
const ENEMY_PALETTES = {
  grunt: { K: '#1a1c2c', G: '#5fcd5f', g: '#2f8a3f', W: '#ffffff' },
  runner: { K: '#1a1c2c', R: '#ff5a5a', r: '#b02a3a', Y: '#ffe46b' },
  tank: { K: '#1a1c2c', P: '#9a5cd6', p: '#5e3399', W: '#ffffff', R: '#ff4d5a' },
  spitter: { K: '#1a1c2c', Y: '#ffd84a', y: '#c99a1e', W: '#f4f4f4' },
  boss: {
    K: '#1a1c2c', Y: '#ffd84a', y: '#c99a1e', M: '#d6466f', m: '#8a2050',
    E: '#ffe46b', W: '#ffffff', R: '#5a1020',
  },
};

// Runner: a small red bug, drawn pointing UP (it is rotated to face its motion).
const RUNNER_A = [
  'K..KKKK..K',
  '.KKRRRRKK.',
  '..KYRRYK..',
  'KKRRRRRRKK',
  '..KrRRrK..',
  'KKrrrrrrKK',
  '.K.KrrK.K.',
  'K...KK...K',
];
const RUNNER_B = [
  '.K.KKKK.K.',
  'K.KRRRRK.K',
  '..KYRRYK..',
  '.KRRRRRRK.',
  'KKKrRRrKKK',
  '.KrrrrrrK.',
  'K..KrrK..K',
  '....KK....',
];

// Tank: a heavy purple brute with stomping legs.
const TANK_BODY = [
  '....KKKKKKKK....',
  '...KPPPPPPPPK...',
  '..KPPPPPPPPPPK..',
  '.KPPKRKPPKRKPPK.',
  '.KPPKKKPPKKKPPK.',
  'KPPPPPPPPPPPPPPK',
  'KPPPKWKKKKWKPPPK',
  'KpPPPKKKKKKPPPpK',
  'KppPPPPPPPPPPppK',
  'KKppppppppppppKK',
  'KpKppppppppppKpK',
];
const TANK_A = [
  ...TANK_BODY,
  'KKK.KppKKppK.KKK',
  '....KKKK.KKKK...',
  '................',
];
const TANK_B = [
  '................',
  ...TANK_BODY,
  'KKKKppKK.KppKKKK',
  '...KKKK...KKKK..',
];

// Spitter: a floating eyeball. The pupil is drawn in code so it can track you.
const SPITTER_OPEN = [
  '...KKKKKK...',
  '..KYYYYYYK..',
  '.KYYWWWWYYK.',
  'KYYWWWWWWYYK',
  'KYWWWWWWWWYK',
  'KYWWWWWWWWYK',
  'KYWWWWWWWWYK',
  'KYWWWWWWWWYK',
  'KyYWWWWWWYyK',
  '.KyyWWWWyyK.',
  '..KyyyyyyK..',
  '...KKKKKK...',
];
const SPITTER_BLINK = [
  '............',
  '...KKKKKK...',
  '.KKYYYYYYKK.',
  'KYYYYYYYYYYK',
  'KYYYYYYYYYYK',
  'KKYYYYYYYYKK',
  'KYKKKKKKKKYK',
  'KYYYYYYYYYYK',
  'KyYYYYYYYYyK',
  '.KyyYYYYyyK.',
  '..KyyyyyyK..',
  '...KKKKKK...',
];

// Boss: the crowned Overlord.
const BOSS_ROWS = [
  '......KYK...KYK...KYK......',
  '.....KYYYK.KYYYK.KYYYK.....',
  '.....KYYYYKYYYYYKYYYYK.....',
  '.....KyyyyyyyyyyyyyyyK.....',
  '....KKKKKKKKKKKKKKKKKKK....',
  '...KMMMMMMMMMMMMMMMMMMMK...',
  '..KMMMMMMMMMMMMMMMMMMMMMK..',
  '.KMMKKMMMMMMMMMMMMMMMKKMMK.',
  'KMMMMKKKMMMMMMMMMMMKKKMMMMK',
  'KMMMMKEEKKMMMMMMMKKEEKMMMMK',
  'KMMMMKEEEKMMMMMMMKEEEKMMMMK',
  'KMMMMMKKKMMMMMMMMMKKKMMMMMK',
  'KMMMMMMMMMMMMMMMMMMMMMMMMMK',
  'KMMMMKKKKKKKKKKKKKKKKKMMMMK',
  'KMMMKWKWKWKWKWKWKWKWKWKMMMK',
  'KMMMKKRRRRRRRRRRRRRRRKKMMMK',
  'KmMMMKWKWKWKWKWKWKWKWKMMMmK',
  'KmmMMMKKKKKKKKKKKKKKKMMMmmK',
  'KmmmMMMMMMMMMMMMMMMMMMMmmmK',
  '.KmmmmMMMMMMMMMMMMMMMmmmmK.',
  '..KmmmmmmmmmmmmmmmmmmmmmK..',
  '...KKmmmKKmmmmmmmKKmmmKK...',
  '....KKKK.KKKKKKKKK.KKKK....',
];
const BOSS_A = BOSS_ROWS;
const BOSS_B = ['...........................', ...BOSS_ROWS.slice(0, 21), BOSS_ROWS[22]];

// Grunt: a hopping green blob. Frame B is the squashed half of the hop.
const GRUNT_A = [
  '...KKKKKK...',
  '..KGGGGGGK..',
  '.KGGGGGGGGK.',
  '.KGWKGGWKGK.',
  'KGGWKGGWKGGK',
  'KGGGGGGGGGGK',
  'KGGGKKKKGGGK',
  'KgGGGGGGGGgK',
  'KggGGGGGGggK',
  '.KggggggggK.',
  '..KKKKKKKK..',
];
const GRUNT_B = [
  '............',
  '............',
  '...KKKKKK...',
  '.KKGGGGGGKK.',
  'KGGWKGGWKGGK',
  'KGGWKGGWKGGK',
  'KGGGKKKKGGGK',
  'KgGGGGGGGGgK',
  'KggGGGGGGggK',
  'KggggggggggK',
  '.KKKKKKKKKK.',
];

// ---------------------------------------------------------------- HUD
const HEART = [
  '.KK.KK.',
  'KRRKRRK',
  'KRWRRRK',
  'KRRRRRK',
  '.KRRRK.',
  '..KRK..',
  '...K...',
];
const HEART_PAL = { K: '#1a1c2c', R: '#ff4d5a', W: '#ffffff' };
const HEART_EMPTY_PAL = { K: '#1a1c2c', R: '#3a3d5c', W: '#3a3d5c' };

// Palette that turns every pixel white — used for hit flashes.
const WHITE_PAL = new Proxy({}, { get: (t, k) => (k === '.' ? undefined : '#ffffff') });

function makeAnimSet(frames, palette) {
  return {
    frames: frames.map(f => makeSprite(f, palette)),
    flash: frames.map(f => makeSprite(f, WHITE_PAL)),
    w: frames[0][0].length,
    h: frames[0].length,
  };
}

const Sprites = {};

function buildSprites() {
  Sprites.enemies = {
    grunt: makeAnimSet([GRUNT_A, GRUNT_B], ENEMY_PALETTES.grunt),
    runner: makeAnimSet([RUNNER_A, RUNNER_B], ENEMY_PALETTES.runner),
    tank: makeAnimSet([TANK_A, TANK_B], ENEMY_PALETTES.tank),
    spitter: makeAnimSet([SPITTER_OPEN, SPITTER_BLINK], ENEMY_PALETTES.spitter),
    boss: makeAnimSet([BOSS_A, BOSS_B], ENEMY_PALETTES.boss),
  };
  Sprites.heart = makeSprite(HEART, HEART_PAL);
  Sprites.heartEmpty = makeSprite(HEART, HEART_EMPTY_PAL);

  const blank = '................';
  Sprites.playerIdle = [
    makeSprite([...PLAYER_TOP, ...LEGS_IDLE]),
    // breathing frame: body dips 1px, legs squash
    makeSprite([blank, ...PLAYER_TOP, ...LEGS_IDLE.slice(1)]),
  ];
  Sprites.playerWalk = [
    makeSprite([...PLAYER_TOP, ...LEGS_STRIDE]),
    makeSprite([blank, ...PLAYER_TOP, ...LEGS_IDLE.slice(1)]),
    makeSprite([...PLAYER_TOP, ...LEGS_CROSS]),
    makeSprite([blank, ...PLAYER_TOP, ...LEGS_IDLE.slice(1)]),
  ];
  Sprites.gun = makeSprite(GUN);
  Sprites.muzzle = [makeSprite(MUZZLE_1), makeSprite(MUZZLE_2)];
  Sprites.crosshair = makeSprite(CROSSHAIR);
}

// ---------------------------------------------------------------- font
// 3x5 bitmap font. Each glyph: five rows of three chars, '#' = pixel on.
const FONT = {
  'A': '.#. #.# ### #.# #.#', 'B': '##. #.# ##. #.# ##.', 'C': '.## #.. #.. #.. .##',
  'D': '##. #.# #.# #.# ##.', 'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..',
  'G': '.## #.. #.# #.# .##', 'H': '#.# #.# ### #.# #.#', 'I': '### .#. .#. .#. ###',
  'J': '..# ..# ..# #.# .#.', 'K': '#.# #.# ##. #.# #.#', 'L': '#.. #.. #.. #.. ###',
  'M': '#.# ### #.# #.# #.#', 'N': '##. #.# #.# #.# #.#', 'O': '.#. #.# #.# #.# .#.',
  'P': '##. #.# ##. #.. #..', 'Q': '.#. #.# #.# ##. .##', 'R': '##. #.# ##. #.# #.#',
  'S': '.## #.. .#. ..# ##.', 'T': '### .#. .#. .#. .#.', 'U': '#.# #.# #.# #.# ###',
  'V': '#.# #.# #.# #.# .#.', 'W': '#.# #.# ### ### #.#', 'X': '#.# #.# .#. #.# #.#',
  'Y': '#.# #.# .#. .#. .#.', 'Z': '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.', '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  '.': '... ... ... ... .#.', ':': '... .#. ... .#. ...', '!': '.#. .#. .#. ... .#.',
  '-': '... ... ### ... ...', '/': '..# ..# .#. #.. #..', '%': '#.# ..# .#. #.. #.#',
  '+': '... .#. ### .#. ...', '?': '##. ..# .#. ... .#.', "'": '.#. .#. ... ... ...',
  ',': '... ... ... .#. #..', '(': '.#. #.. #.. #.. .#.', ')': '.#. ..# ..# ..# .#.',
  ' ': '... ... ... ... ...',
};
const FONT_ROWS = {};
for (const ch in FONT) FONT_ROWS[ch] = FONT[ch].split(' ');

function textWidth(str, scale = 1) {
  return str.length * 4 * scale - scale;
}

// Draws pixel text. align: 'left' | 'center' | 'right'. shadow: color or null.
function drawText(ctx, str, x, y, color = '#fff', scale = 1, align = 'left', shadow = '#1a1c2c') {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(str, scale) / 2);
  else if (align === 'right') x -= textWidth(str, scale);
  x = Math.round(x);
  y = Math.round(y);
  const pass = (ox, oy, col) => {
    ctx.fillStyle = col;
    for (let n = 0; n < str.length; n++) {
      const rows = FONT_ROWS[str[n]] || FONT_ROWS['?'];
      for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 3; i++) {
          if (rows[j][i] === '#') {
            ctx.fillRect(x + ox + (n * 4 + i) * scale, y + oy + j * scale, scale, scale);
          }
        }
      }
    }
  };
  if (shadow) { const o = Math.max(1, scale >> 1); pass(o, o, shadow); }
  pass(0, 0, color);
}

// ---------------------------------------------------------------- floor
const FLOOR_THEMES = [
  { a: '#2b2d42', b: '#2f3149', line: '#24253a', dot: '#3a3d5c', crack: '#1f2033' }, // stone
  { a: '#24362b', b: '#283c2f', line: '#1c2b22', dot: '#35503d', crack: '#16221a' }, // moss
  { a: '#3a2f2a', b: '#40342e', line: '#2e2521', dot: '#584a40', crack: '#231c19' }, // rust
  { a: '#2e2640', b: '#332a47', line: '#251f34', dot: '#463a60', crack: '#1c1728' }, // violet
  { a: '#4a3f2c', b: '#504431', line: '#3c3324', dot: '#655539', crack: '#30281c' }, // sand
  { a: '#3a1e24', b: '#402228', line: '#2e171c', dot: '#5a2a33', crack: '#231115' }, // hell
];

function buildFloor(w, h, theme) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const T = 16;
  for (let ty = 0; ty < h / T; ty++) {
    for (let tx = 0; tx < w / T; tx++) {
      x.fillStyle = (tx + ty) % 2 ? theme.a : theme.b;
      x.fillRect(tx * T, ty * T, T, T);
      x.fillStyle = theme.line;
      x.fillRect(tx * T, ty * T, T, 1);
      x.fillRect(tx * T, ty * T, 1, T);
    }
  }
  // speckles
  x.fillStyle = theme.dot;
  for (let i = 0; i < 260; i++) {
    x.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
  }
  // cracks (short random walks)
  x.fillStyle = theme.crack;
  for (let n = 0; n < 14; n++) {
    let cx = Math.random() * w, cy = Math.random() * h;
    for (let s = 0; s < 10; s++) {
      x.fillRect(cx | 0, cy | 0, 1, 1);
      cx += Math.round(Math.random() * 2 - 1);
      cy += Math.round(Math.random() * 2 - 1);
    }
  }
  // dark vignette around the edges
  for (let i = 0; i < 8; i++) {
    x.fillStyle = `rgba(0,0,0,${0.22 - i * 0.025})`;
    x.fillRect(i, i, w - i * 2, 1);
    x.fillRect(i, h - 1 - i, w - i * 2, 1);
    x.fillRect(i, i, 1, h - i * 2);
    x.fillRect(w - 1 - i, i, 1, h - i * 2);
  }
  return c;
}
