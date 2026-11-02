// game.js — main loop, state machine, levels, spawning, collisions, HUD, menus.
//
// Everything is drawn onto a small 320x240 buffer, which is then scaled up
// by a whole number onto the visible canvas for crisp retro pixels.
//
// States: MENU -> PLAYING <-> PAUSED
//                 PLAYING -> LEVEL_COMPLETE -> PLAYING (next level)
//                 PLAYING -> VICTORY -> MENU          (after the boss)
//                 PLAYING -> GAME_OVER -> MENU
//
// Tip for testing: open index.html?level=6 to start on a given level.

const VIEW_W = 320;
const VIEW_H = 240;
const STEP = 1 / 60; // fixed update rate
const BEST_KEY = 'pixelSiege.best';
const INTRO_TIME = 2.6;      // level banner duration
const COMPLETE_WAIT = 6;     // auto-continue from the level-complete screen

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* storage unavailable */ }
}
function startLevelFromUrl() {
  const n = parseInt(new URLSearchParams(location.search).get('level'), 10);
  return n >= 1 && n <= LEVELS.length ? n - 1 : 0;
}

const Game = {
  width: VIEW_W,
  height: VIEW_H,
  arena: { left: 10, right: VIEW_W - 10, top: 22, bottom: VIEW_H - 12 },
  state: 'MENU',

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    this.buf = document.createElement('canvas');
    this.buf.width = VIEW_W;
    this.buf.height = VIEW_H;
    this.bctx = this.buf.getContext('2d');
    this.bctx.imageSmoothingEnabled = false;

    buildSprites();
    this.menuFloor = buildFloor(VIEW_W, VIEW_H, FLOOR_THEMES[0]);

    Input.init(this.canvas, VIEW_W, VIEW_H);
    Sound.init();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.state === 'PLAYING') this.state = 'PAUSED';
    });
    this.resize();

    this.best = loadBest();
    this.menuT = 0;
    this.newWorld(0);
  },

  resize() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
    this.scale = s;
    this.canvas.width = VIEW_W * s;
    this.canvas.height = VIEW_H * s;
    this.ctx.imageSmoothingEnabled = false;
  },

  // ------------------------------------------------------------ run / level setup
  newWorld(levelIndex) {
    this.player = new Player(VIEW_W / 2, VIEW_H / 2);
    this.score = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.newBest = false;
    this.overT = 0;
    this.setupLevel(levelIndex);
  },

  setupLevel(i) {
    this.levelIndex = i;
    this.level = LEVELS[i];
    this.floor = buildFloor(VIEW_W, VIEW_H, FLOOR_THEMES[this.level.theme]);
    this.stains = document.createElement('canvas');
    this.stains.width = VIEW_W;
    this.stains.height = VIEW_H;
    this.stains.getContext('2d').drawImage(this.floor, 0, 0);

    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.hurtFlash = 0;

    const p = this.player;
    p.x = VIEW_W / 2;
    p.y = VIEW_H / 2;
    p.kbx = p.kby = 0;
    p.invuln = 0;
    p.fireCooldown = 0.25; // don't fire from the click that started the level

    this.time = 0;
    this.levelKills = 0;
    this.levelShotsStart = this.shotsFired;
    this.levelHitsStart = this.shotsHit;
    this.spawnTimer = 0;
    this.introT = INTRO_TIME;
    this.levelDone = false;
    this.levelEndT = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.deathTimer = 0;
  },

  startGame() {
    this.newWorld(startLevelFromUrl());
    this.state = 'PLAYING';
    Sound.play('start');
  },

  isLastLevel() {
    return this.levelIndex === LEVELS.length - 1;
  },

  levelAccuracy() {
    const shots = this.shotsFired - this.levelShotsStart;
    return shots ? Math.round(((this.shotsHit - this.levelHitsStart) / shots) * 100) : 0;
  },

  totalAccuracy() {
    return this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
  },

  // ------------------------------------------------------------ helpers
  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  },

  spawnSparks(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 60;
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.2 + Math.random() * 0.2, color, friction: 8,
      }));
    }
  },

  spawnBurst(x, y, colors, count, speed = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 80) * speed;
      this.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.5,
        color: colors[(Math.random() * colors.length) | 0],
        friction: 5, size: Math.random() < 0.4 ? 2 : 1,
      }));
    }
  },

  // Permanent splat on the floor where an enemy died.
  addStain(x, y, colors, size = 6) {
    const c = this.stains.getContext('2d');
    for (let i = 0; i < size * 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size;
      c.fillStyle = colors[(Math.random() * colors.length) | 0];
      c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + 3 + Math.sin(a) * r * 0.6), 1, 1);
    }
  },

  // A random point just outside one of the four screen edges.
  edgeSpawnPoint() {
    const m = 12;
    switch ((Math.random() * 4) | 0) {
      case 0: return { x: Math.random() * VIEW_W, y: -m };
      case 1: return { x: Math.random() * VIEW_W, y: VIEW_H + m };
      case 2: return { x: -m, y: Math.random() * VIEW_H };
      default: return { x: VIEW_W + m, y: Math.random() * VIEW_H };
    }
  },

  spawnEnemy(type) {
    const p = this.edgeSpawnPoint();
    this.enemies.push(new Enemy(type, p.x, p.y));
  },

  // ------------------------------------------------------------ events
  onEnemyKilled(e) {
    this.kills++;
    this.score += e.def.score;
    if (e === this.boss) {
      this.bossDefeated = true;
      this.spawnBurst(e.x, e.y, e.def.colors, 90, 1.6);
      this.addStain(e.x, e.y, e.def.stain, 16);
      this.texts.push(new FloatText(e.x, e.y - 18, '+' + e.def.score));
      Sound.play('bossDie');
    } else {
      this.levelKills++;
      this.spawnBurst(e.x, e.y, e.def.colors, e.def.ai === 'chase' && e.radius > 6 ? 28 : 16);
      this.addStain(e.x, e.y, e.def.stain, e.radius + 1);
      this.texts.push(new FloatText(e.x, e.y - 10, '+' + e.def.score));
      Sound.play(e.radius > 6 ? 'bigExplode' : 'explode');
    }
    this.addShake(e.def.shake || 2);
  },

  onPlayerDeath() {
    const p = this.player;
    this.spawnBurst(p.x, p.y, ['#3b7d4f', '#5b8c3a', '#f4c28c', '#ff4d5a', '#ffffff'], 40);
    this.addShake(6);
    Sound.play('die');
    this.deathTimer = 1.4; // let the explosion play before the game-over screen
  },

  // Target reached (or boss dead): pop every remaining enemy and wrap up.
  finishLevel() {
    this.levelDone = true;
    this.levelEndT = this.level.boss ? 2.8 : 1.6;
    if (!this.level.boss) Sound.play('clear');
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.dead = true;
      this.spawnBurst(e.x, e.y, e.def.colors, 10);
    }
    for (const b of this.enemyBullets) {
      b.dead = true;
      this.spawnSparks(b.x, b.y, 2, '#d65cff');
    }
  },

  levelComplete() {
    this.state = 'LEVEL_COMPLETE';
    this.completeT = 0;
    this.clearBonus = 250 * (this.levelIndex + 1);
    this.score += this.clearBonus;
    this.healed = this.player.hp < this.player.maxHp;
    if (this.healed) this.player.hp++;
    this.completeAcc = this.levelAccuracy();
    this.completeKills = this.levelKills;
  },

  nextLevel() {
    this.setupLevel(this.levelIndex + 1);
    this.state = 'PLAYING';
    Sound.play('start');
  },

  recordBest() {
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      saveBest(this.best);
    }
  },

  gameOver() {
    this.state = 'GAME_OVER';
    this.overT = 0;
    Sound.play('gameover');
    this.recordBest();
  },

  victory() {
    this.state = 'VICTORY';
    this.overT = 0;
    Sound.play('victory');
    this.fireworkT = 0;
    this.clearBonus = 250 * LEVELS.length;
    this.score += this.clearBonus;
    this.recordBest();
  },

  // ------------------------------------------------------------ update
  update(dt) {
    this.menuT += dt;
    if (Input.wasPressed('KeyM')) Sound.toggleMute();
    switch (this.state) {
      case 'MENU':
        if (Input.mouse.clicked) this.startGame();
        break;

      case 'PLAYING':
        if (Input.wasPressed('Escape', 'KeyP')) { this.state = 'PAUSED'; Sound.play('blip'); break; }
        this.updateWorld(dt);
        break;

      case 'PAUSED':
        if (Input.wasPressed('Escape', 'KeyP')) { this.state = 'PLAYING'; Sound.play('blip'); }
        else if (Input.wasPressed('KeyQ')) this.state = 'MENU';
        break;

      case 'LEVEL_COMPLETE':
        this.completeT += dt;
        if ((this.completeT > 0.8 && Input.mouse.clicked) || this.completeT >= COMPLETE_WAIT) this.nextLevel();
        break;

      case 'GAME_OVER':
        this.updateWorld(dt);
        this.overT += dt;
        if (this.overT > 1 && Input.mouse.clicked) this.state = 'MENU';
        break;

      case 'VICTORY':
        this.updateWorld(dt);
        this.overT += dt;
        this.fireworkT -= dt;
        if (this.fireworkT <= 0) {
          this.fireworkT = 0.35 + Math.random() * 0.3;
          const palettes = Object.values(ENEMY_TYPES).map(t => t.colors);
          this.spawnBurst(30 + Math.random() * (VIEW_W - 60), 30 + Math.random() * 120,
            palettes[(Math.random() * palettes.length) | 0], 30, 1.3);
        }
        if (this.overT > 1.5 && Input.mouse.clicked) this.state = 'MENU';
        break;
    }
    Input.endStep();
  },

  updateSpawning(dt) {
    const L = this.level;
    if (this.levelDone || this.player.dead) return;
    if (this.introT > INTRO_TIME - 1.2) return; // short breather at level start

    if (L.boss && !this.bossSpawned) {
      this.boss = new Enemy(L.boss, VIEW_W / 2, -16);
      this.enemies.push(this.boss);
      this.bossSpawned = true;
      this.spawnTimer = 3;
      this.addShake(5);
      Sound.play('roar');
    }

    const minions = this.enemies.filter(e => e !== this.boss).length;
    const progress = L.boss
      ? 1 - (this.boss ? this.boss.hp / this.boss.maxHp : 1)
      : this.levelKills / L.kills;
    const every = L.spawnEvery[0] + (L.spawnEvery[1] - L.spawnEvery[0]) * Math.min(1, progress);

    this.spawnTimer -= dt;
    const roomLeft = L.boss ? true : this.levelKills + minions < L.kills;
    if (this.spawnTimer <= 0 && minions < L.maxAlive && roomLeft) {
      this.spawnEnemy(pickWeighted(L.mix));
      this.spawnTimer = every;
    }
  },

  updateWorld(dt) {
    this.time += dt;
    this.introT -= dt;
    const player = this.player;
    player.update(dt, this);

    this.updateSpawning(dt);

    for (const e of this.enemies) e.update(dt, this);
    this.separateEnemies();
    for (const b of this.bullets) b.update(dt, this);
    for (const b of this.enemyBullets) b.update(dt, this);

    // player bullets vs enemies
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const r = e.radius + b.radius;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < r * r) {
          b.dead = true;
          this.shotsHit++;
          this.spawnSparks(b.x, b.y, 3, '#ffffff');
          e.hit(this, b.damage, b.angle);
          break;
        }
      }
    }

    if (!player.dead) {
      // enemies touching the player
      for (const e of this.enemies) {
        if (e.dead) continue;
        const r = e.radius + player.radius;
        if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 < r * r) {
          if (player.takeHit(this, e.x, e.y, e.def.damage)) {
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            const kb = 120 * (1 - e.def.kbResist);
            e.kbx += Math.cos(a) * kb;
            e.kby += Math.sin(a) * kb;
          }
        }
      }
      // enemy bullets vs player
      for (const b of this.enemyBullets) {
        if (b.dead) continue;
        const r = b.radius + player.radius - 1;
        if ((b.x - player.x) ** 2 + (b.y - player.y) ** 2 < r * r) {
          if (player.takeHit(this, b.x - b.vx, b.y - b.vy, 1)) b.dead = true;
        }
      }
    } else if (this.state === 'PLAYING') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.gameOver();
    }

    // level progress
    if (!this.levelDone && !player.dead) {
      const L = this.level;
      if (L.boss ? this.bossDefeated : this.levelKills >= L.kills) this.finishLevel();
    }
    if (this.levelDone && this.state === 'PLAYING') {
      this.levelEndT -= dt;
      if (this.levelEndT <= 0) {
        if (this.isLastLevel()) this.victory();
        else this.levelComplete();
      }
    }

    for (const p of this.particles) p.update(dt);
    for (const t of this.texts) t.update(dt);

    this.enemies = this.enemies.filter(e => !e.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);
    this.particles = this.particles.filter(p => !p.dead);
    this.texts = this.texts.filter(t => !t.dead);

    this.shake = Math.max(0, this.shake - dt * 10);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  },

  // Keep enemies from stacking. Bigger enemies shove smaller ones aside.
  separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const overlap = min - d;
          const ma = a.radius * a.radius, mb = b.radius * b.radius;
          const nx = dx / d, ny = dy / d;
          const pa = overlap * mb / (ma + mb), pb = overlap * ma / (ma + mb);
          a.x -= nx * pa; a.y -= ny * pa;
          b.x += nx * pb; b.y += ny * pb;
        }
      }
    }
  },

  // ------------------------------------------------------------ render
  render() {
    const c = this.bctx;

    if (this.state === 'MENU') {
      this.renderMenu(c);
    } else {
      this.renderWorld(c);
      this.renderHUD(c);
      if (this.state === 'PLAYING') this.renderBanners(c);
      if (this.state === 'PAUSED') this.renderPause(c);
      if (this.state === 'LEVEL_COMPLETE') this.renderLevelComplete(c);
      if (this.state === 'GAME_OVER') this.renderGameOver(c);
      if (this.state === 'VICTORY') this.renderVictory(c);
    }

    const ch = Sprites.crosshair;
    c.drawImage(ch, Math.round(Input.mouse.x) - 4, Math.round(Input.mouse.y) - 4);

    this.ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  },

  renderWorld(c) {
    c.save();
    if (this.shake > 0) {
      c.translate(
        Math.round((Math.random() * 2 - 1) * this.shake),
        Math.round((Math.random() * 2 - 1) * this.shake));
    }
    c.drawImage(this.stains, 0, 0);
    for (const p of this.particles) p.draw(c);

    // draw actors sorted by y so lower ones overlap higher ones
    const actors = [...this.enemies, this.player].sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw(c);

    for (const b of this.bullets) b.draw(c);
    for (const b of this.enemyBullets) b.draw(c);
    for (const t of this.texts) t.draw(c);
    c.restore();

    if (this.hurtFlash > 0) {
      c.fillStyle = `rgba(255,40,60,${this.hurtFlash * 0.6})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  },

  drawBar(c, x, y, w, h, frac, color) {
    c.fillStyle = '#1a1c2c';
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = '#3a3d5c';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 1);
  },

  renderHUD(c) {
    const p = this.player;
    const cx = VIEW_W / 2;
    for (let i = 0; i < p.maxHp; i++) {
      c.drawImage(i < p.hp ? Sprites.heart : Sprites.heartEmpty, 5 + i * 9, 4);
    }
    drawText(c, 'SCORE ' + this.score, VIEW_W - 5, 5, '#ffffff', 1, 'right');
    drawText(c, 'BEST ' + Math.max(this.best, this.score), VIEW_W - 5, 13, '#8b9bb4', 1, 'right');
    if (Sound.muted) drawText(c, 'MUTED', 5, 14, '#8b9bb4');

    // level progress (or boss health)
    const L = this.level;
    if (L.boss) {
      const frac = this.boss ? this.boss.hp / this.boss.maxHp : (this.bossDefeated ? 0 : 1);
      drawText(c, L.name, cx, 4, '#ff4d5a', 1, 'center');
      this.drawBar(c, cx - 50, 12, 100, 4, frac, '#d6466f');
    } else {
      const k = Math.min(this.levelKills, L.kills);
      drawText(c, `LEVEL ${this.levelIndex + 1}   ${k}/${L.kills}`, cx, 4, '#ffffff', 1, 'center');
      this.drawBar(c, cx - 50, 12, 100, 4, k / L.kills, '#ffe46b');
    }

    if (this.levelIndex === 0 && this.time < 6 && this.state === 'PLAYING') {
      drawText(c, 'ARROWS/WASD MOVE - MOUSE AIM - CLICK SHOOT', cx, VIEW_H - 9, '#8b9bb4', 1, 'center');
    }
  },

  // "LEVEL 3 / HEAVY METAL" intro and "LEVEL CLEAR!" outro.
  renderBanners(c) {
    const cx = VIEW_W / 2;
    const L = this.level;
    if (this.introT > 0) {
      if (this.introT < 0.5 && Math.floor(this.introT * 16) % 2) return;
      if (L.boss) {
        if (Math.floor(this.introT * 4) % 2 === 0) drawText(c, 'WARNING!', cx, 70, '#ff4d5a', 2, 'center');
        drawText(c, 'FINAL LEVEL', cx, 90, '#ffffff', 3, 'center');
        drawText(c, L.name, cx, 114, '#ff4d5a', 2, 'center');
      } else {
        drawText(c, 'LEVEL ' + (this.levelIndex + 1), cx, 86, '#ffffff', 3, 'center');
        drawText(c, L.name, cx, 110, '#ffe46b', 2, 'center');
        drawText(c, 'DEFEAT ' + L.kills + ' ENEMIES', cx, 128, '#c2c3d8', 1, 'center');
      }
    } else if (this.levelDone) {
      const msg = L.boss ? 'OVERLORD DEFEATED!' : 'LEVEL CLEAR!';
      drawText(c, msg, cx, 100, '#5fcd5f', L.boss ? 2 : 3, 'center');
    }
  },

  renderMenu(c) {
    const t = this.menuT;
    const cx = VIEW_W / 2;
    c.drawImage(this.menuFloor, 0, 0);
    c.fillStyle = 'rgba(10,10,22,0.55)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    // title
    const ty = 28 + Math.round(Math.sin(t * 2) * 2);
    drawText(c, 'PIXEL SIEGE', cx, ty, '#ffe46b', 4, 'center', '#b8452c');
    drawText(c, 'A TOP-DOWN RETRO SHOOTER', cx, ty + 28, '#8b9bb4', 1, 'center');

    // hero + two blobs, scaled up 3x
    const hero = Sprites.playerWalk[Math.floor(t * 8) % Sprites.playerWalk.length];
    c.drawImage(hero, cx - 24, 84, 48, 48);
    const g = Sprites.enemies.grunt;
    const gf = g.frames[Math.floor(t * 4) % g.frames.length];
    c.save();
    c.translate(cx - 60, 98);
    c.drawImage(gf, -18, 0, 36, 33);
    c.restore();
    c.save();
    c.translate(cx + 60, 98);
    c.scale(-1, 1);
    c.drawImage(gf, -18, 0, 36, 33);
    c.restore();

    if (Math.floor(t * 2.5) % 2 === 0) {
      drawText(c, 'CLICK TO START', cx, 146, '#ffffff', 2, 'center');
    }

    drawText(c, 'MOVE: ARROWS / WASD', cx, 172, '#c2c3d8', 1, 'center');
    drawText(c, 'AIM: MOUSE    SHOOT: CLICK', cx, 181, '#c2c3d8', 1, 'center');
    drawText(c, 'PAUSE: ESC / P    SOUND: M' + (Sound.muted ? ' (MUTED)' : ''), cx, 190, '#c2c3d8', 1, 'center');
    drawText(c, LEVELS.length + ' LEVELS - SURVIVE THEM ALL', cx, 204, '#8b9bb4', 1, 'center');

    drawText(c, 'BEST ' + this.best, cx, 222, '#ffe46b', 1, 'center');
  },

  dim(c, alpha) {
    c.fillStyle = `rgba(10,10,22,${alpha})`;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  renderPause(c) {
    const cx = VIEW_W / 2;
    this.dim(c, 0.65);
    drawText(c, 'PAUSED', cx, 90, '#ffffff', 3, 'center');
    drawText(c, 'ESC / P TO RESUME', cx, 120, '#c2c3d8', 1, 'center');
    drawText(c, 'Q TO QUIT TO MENU', cx, 130, '#c2c3d8', 1, 'center');
    drawText(c, 'M TO ' + (Sound.muted ? 'UNMUTE' : 'MUTE') + ' SOUND', cx, 140, '#c2c3d8', 1, 'center');
  },

  renderLevelComplete(c) {
    const cx = VIEW_W / 2;
    const t = this.completeT;
    this.dim(c, Math.min(0.75, t * 2));
    if (t < 0.15) return;

    drawText(c, `LEVEL ${this.levelIndex + 1} COMPLETE!`, cx, 44, '#5fcd5f', 2, 'center', '#1f4a2a');
    drawText(c, `KILLS ${this.completeKills}    ACCURACY ${this.completeAcc}%`, cx, 72, '#c2c3d8', 1, 'center');
    if (t > 0.4) drawText(c, 'CLEAR BONUS +' + this.clearBonus, cx, 84, '#ffe46b', 1, 'center');
    if (t > 0.7 && this.healed) {
      c.drawImage(Sprites.heart, cx - 22, 95);
      drawText(c, '+1 HEART', cx + 4, 96, '#ff4d5a', 1, 'center');
    }
    drawText(c, 'SCORE ' + this.score, cx, 114, '#ffffff', 2, 'center');

    const next = LEVELS[this.levelIndex + 1];
    drawText(c, 'NEXT UP', cx, 146, '#8b9bb4', 1, 'center');
    drawText(c, next.boss ? 'FINAL LEVEL - ' + next.name : `LEVEL ${this.levelIndex + 2} - ${next.name}`,
      cx, 156, next.boss ? '#ff4d5a' : '#ffe46b', 1, 'center');

    if (t > 0.8) {
      const secs = Math.ceil(COMPLETE_WAIT - t);
      drawText(c, `STARTING IN ${secs}  -  CLICK TO GO NOW`, cx, 184, '#ffffff', 1, 'center');
    }
  },

  renderGameOver(c) {
    const cx = VIEW_W / 2;
    this.dim(c, 0.7 * Math.min(1, this.overT * 1.5));
    if (this.overT < 0.15) return;

    drawText(c, 'GAME OVER', cx, 56, '#ff4d5a', 4, 'center', '#5a1020');
    drawText(c, 'REACHED LEVEL ' + (this.levelIndex + 1) + ' - ' + this.level.name, cx, 86, '#c2c3d8', 1, 'center');
    drawText(c, 'SCORE ' + this.score, cx, 102, '#ffffff', 2, 'center');
    if (this.newBest) {
      if (Math.floor(this.overT * 4) % 2 === 0) drawText(c, 'NEW HIGH SCORE!', cx, 120, '#ffe46b', 1, 'center');
    } else {
      drawText(c, 'BEST ' + this.best, cx, 120, '#8b9bb4', 1, 'center');
    }
    drawText(c, 'KILLS ' + this.kills + '    ACCURACY ' + this.totalAccuracy() + '%', cx, 134, '#c2c3d8', 1, 'center');

    if (this.overT > 1 && Math.floor(this.overT * 2.5) % 2 === 0) {
      drawText(c, 'CLICK TO CONTINUE', cx, 170, '#ffffff', 1, 'center');
    }
  },

  renderVictory(c) {
    const cx = VIEW_W / 2;
    this.dim(c, 0.55 * Math.min(1, this.overT));
    if (this.overT < 0.2) return;

    const ty = 44 + Math.round(Math.sin(this.overT * 3) * 2);
    drawText(c, 'VICTORY!', cx, ty, '#ffe46b', 4, 'center', '#b8452c');
    drawText(c, 'THE OVERLORD HAS FALLEN', cx, 76, '#ffffff', 1, 'center');
    drawText(c, 'FINAL BONUS +' + this.clearBonus, cx, 90, '#ffe46b', 1, 'center');
    drawText(c, 'SCORE ' + this.score, cx, 106, '#ffffff', 2, 'center');
    if (this.newBest) {
      if (Math.floor(this.overT * 4) % 2 === 0) drawText(c, 'NEW HIGH SCORE!', cx, 124, '#ffe46b', 1, 'center');
    } else {
      drawText(c, 'BEST ' + this.best, cx, 124, '#8b9bb4', 1, 'center');
    }
    drawText(c, 'KILLS ' + this.kills + '    ACCURACY ' + this.totalAccuracy() + '%', cx, 138, '#c2c3d8', 1, 'center');

    if (this.overT > 1.5 && Math.floor(this.overT * 2.5) % 2 === 0) {
      drawText(c, 'CLICK TO RETURN TO MENU', cx, 176, '#ffffff', 1, 'center');
    }
  },
};

// ---------------------------------------------------------------- loop
Game.init();
let lastTime = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  while (acc >= STEP) {
    Game.update(STEP);
    acc -= STEP;
  }
  Game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
