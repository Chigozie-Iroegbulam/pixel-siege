// entities.js — Player, Enemy, Bullet, Particle, FloatText.

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.speed = 85;      // px / second
    this.radius = 5;      // collision radius
    this.angle = 0;       // aim angle (radians)
    this.facing = 1;      // 1 = right, -1 = left
    this.moving = false;
    this.animT = 0;
    this.fireCooldown = 0;
    this.fireRate = 0.14; // seconds between shots
    this.kick = 0;        // gun recoil offset
    this.flashT = 0;      // muzzle flash timer

    this.maxHp = 5;
    this.hp = this.maxHp;
    this.invuln = 0;      // seconds of invulnerability left
    this.kbx = 0;         // knockback velocity
    this.kby = 0;
    this.dead = false;
  }

  update(dt, game) {
    if (this.dead) return;

    // --- movement
    let dx = 0, dy = 0;
    if (Input.isDown('ArrowLeft', 'KeyA')) dx -= 1;
    if (Input.isDown('ArrowRight', 'KeyD')) dx += 1;
    if (Input.isDown('ArrowUp', 'KeyW')) dy -= 1;
    if (Input.isDown('ArrowDown', 'KeyS')) dy += 1;
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * this.speed * dt;
      this.y += (dy / len) * this.speed * dt;
    }
    this.x += this.kbx * dt;
    this.y += this.kby * dt;
    const damp = Math.max(0, 1 - 10 * dt);
    this.kbx *= damp;
    this.kby *= damp;

    const a = game.arena;
    this.x = Math.max(a.left, Math.min(a.right, this.x));
    this.y = Math.max(a.top, Math.min(a.bottom, this.y));

    this.animT += dt;
    this.invuln -= dt;

    // --- aiming
    const p = this.gunPivot();
    this.angle = Math.atan2(Input.mouse.y - p.y, Input.mouse.x - p.x);
    this.facing = Math.cos(this.angle) < 0 ? -1 : 1;

    // --- shooting
    this.fireCooldown -= dt;
    this.flashT -= dt;
    this.kick = Math.max(0, this.kick - dt * 20);
    if (Input.mouse.down && this.fireCooldown <= 0) this.shoot(game);
  }

  gunPivot() {
    return { x: this.x + this.facing * 2, y: this.y + 2 };
  }

  shoot(game) {
    this.fireCooldown = this.fireRate;
    const p = this.gunPivot();
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const spread = (Math.random() - 0.5) * 0.06;
    game.bullets.push(new Bullet(p.x + ca * GUN_LENGTH, p.y + sa * GUN_LENGTH, this.angle + spread));
    game.shotsFired++;
    Sound.play('shoot');

    this.kick = 2;
    this.flashT = 0.06;
    game.addShake(1.2);

    // eject a shell casing sideways
    const side = this.facing;
    game.particles.push(new Particle(p.x + ca * 3, p.y + sa * 3, {
      vx: -sa * side * (40 + Math.random() * 30) - ca * 15,
      vy: ca * side * (40 + Math.random() * 30) - sa * 15 - 20,
      life: 1.2, color: '#e8b84a', friction: 6, size: 1,
    }));
  }

  // Called when an enemy touches the player. Returns true if damage was taken.
  takeHit(game, fromX, fromY, damage = 1) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= damage;
    this.invuln = 1.2;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.kbx = Math.cos(a) * 160;
    this.kby = Math.sin(a) * 160;
    game.addShake(4);
    game.hurtFlash = 0.35;
    game.spawnSparks(this.x, this.y, 8, '#ff4d5a');
    Sound.play('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.onPlayerDeath();
    }
    return true;
  }

  draw(ctx) {
    if (this.dead) return;
    // blink while invulnerable
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2) return;

    const frames = this.moving ? Sprites.playerWalk : Sprites.playerIdle;
    const fps = this.moving ? 10 : 2;
    const img = frames[Math.floor(this.animT * fps) % frames.length];

    // when aiming upward the gun goes behind the body
    const gunBehind = Math.sin(this.angle) < -0.4;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(Math.round(this.x) - 5, Math.round(this.y) + 7, 10, 2);

    if (gunBehind) this.drawGun(ctx);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -8, -8);
    ctx.restore();
    if (!gunBehind) this.drawGun(ctx);
  }

  drawGun(ctx) {
    const p = this.gunPivot();
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(this.angle);
    if (this.facing < 0) ctx.scale(1, -1); // keep the gun upright when aiming left
    ctx.drawImage(Sprites.gun, -GUN_PIVOT.x - Math.round(this.kick), -GUN_PIVOT.y);
    if (this.flashT > 0) {
      const f = Sprites.muzzle[(Math.random() * 2) | 0];
      ctx.drawImage(f, GUN_LENGTH - Math.round(this.kick), -3);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- enemies
// Data-driven so new types (runner, tank, spitter, boss) slot in easily.
// ai:       chase | zigzag | keepAway | boss
// kbResist: 0 = full knockback, 1 = immovable
// rotate:   sprite is drawn pointing up and rotated toward its motion
const ENEMY_TYPES = {
  grunt: {
    sprite: 'grunt', ai: 'chase', hp: 2, speed: 32, radius: 5, damage: 1, score: 100, fps: 4,
    kbResist: 0, colors: ['#5fcd5f', '#2f8a3f', '#ffffff'], stain: ['#1f4a2a', '#2a5e34'],
  },
  runner: {
    sprite: 'runner', ai: 'zigzag', hp: 1, speed: 68, radius: 4, damage: 1, score: 150, fps: 12,
    kbResist: 0, rotate: true, colors: ['#ff5a5a', '#b02a3a', '#ffe46b'], stain: ['#5a1a22', '#6e2230'],
  },
  tank: {
    sprite: 'tank', ai: 'chase', hp: 9, speed: 17, radius: 7, damage: 2, score: 400, fps: 3,
    kbResist: 0.8, colors: ['#9a5cd6', '#5e3399', '#ff4d5a', '#ffffff'], stain: ['#3a1f5a', '#4a2a70'],
    shake: 3,
  },
  spitter: {
    sprite: 'spitter', ai: 'keepAway', hp: 3, speed: 34, radius: 5, damage: 1, score: 250, fps: 1,
    kbResist: 0.2, shootEvery: 2.2, colors: ['#ffd84a', '#c99a1e', '#f4f4f4', '#ff4d5a'],
    stain: ['#5a4a14', '#6e5a1c'],
  },
  boss: {
    sprite: 'boss', ai: 'boss', hp: 120, speed: 28, radius: 12, damage: 1, score: 5000, fps: 3,
    kbResist: 0.95, colors: ['#d6466f', '#8a2050', '#ffd84a', '#ffe46b', '#ffffff'],
    stain: ['#4a1028', '#5e1a36', '#6e1f40'], shake: 10, name: 'THE OVERLORD',
  },
};

class Enemy {
  constructor(type, x, y) {
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.x = x;
    this.y = y;
    this.hp = this.maxHp = this.def.hp;
    this.speed = this.def.speed * (type === 'boss' ? 1 : 0.9 + Math.random() * 0.2);
    this.radius = this.def.radius;
    this.animT = Math.random() * 2;
    this.facing = 1;
    this.heading = 0;   // movement angle (for rotated sprites)
    this.hitT = 0;
    this.kbx = 0;
    this.kby = 0;
    this.dead = false;
    this.seed = Math.random() * 10;
    this.lookX = 0;     // spitter pupil direction
    this.lookY = 0;
    this.shootT = (this.def.shootEvery || 0) * (0.6 + Math.random() * 0.6);
    if (this.def.ai === 'boss') {
      this.phase = 'enter';
      this.phaseT = 0;
      this.nextAttack = 'burst';
      this.burstsLeft = 0;
    }
  }

  onScreen(game, m = 8) {
    return this.x > m && this.x < game.width - m && this.y > m && this.y < game.height - m;
  }

  update(dt, game) {
    const p = game.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    let vx = 0, vy = 0;

    switch (this.def.ai) {
      case 'chase':
        vx = ux * this.speed;
        vy = uy * this.speed;
        break;

      case 'zigzag': {
        // weave side to side while closing in
        const w = Math.sin(this.animT * 6 + this.seed) * 0.9;
        vx = (ux - uy * w) * this.speed;
        vy = (uy + ux * w) * this.speed;
        break;
      }

      case 'keepAway': {
        this.lookX = ux;
        this.lookY = uy;
        if (!this.onScreen(game, 14)) {
          vx = ux * this.speed;           // come into view first
          vy = uy * this.speed;
        } else {
          let dir = 0;
          if (d > 110) dir = 1;
          else if (d < 75) dir = -1;
          // strafe around the player while holding distance
          const s = Math.sin(this.seed) > 0 ? 1 : -1;
          vx = (ux * dir - uy * s * 0.6) * this.speed;
          vy = (uy * dir + ux * s * 0.6) * this.speed;
          this.shootT -= dt;
          if (this.shootT <= 0 && !p.dead) {
            this.shootT = this.def.shootEvery * (0.8 + Math.random() * 0.4);
            game.enemyBullets.push(new EnemyBullet(this.x + ux * 6, this.y + uy * 6, Math.atan2(dy, dx), 85));
            Sound.play('enemyShoot');
          }
        }
        break;
      }

      case 'boss':
        ({ vx, vy } = this.updateBoss(dt, game, ux, uy));
        break;
    }

    this.x += (vx + this.kbx) * dt;
    this.y += (vy + this.kby) * dt;
    const damp = Math.max(0, 1 - 8 * dt);
    this.kbx *= damp;
    this.kby *= damp;

    // once on screen, the spitter and boss stay on screen
    if ((this.def.ai === 'keepAway' && this.onScreen(game, 14)) ||
        (this.def.ai === 'boss' && this.phase !== 'enter')) {
      const m = this.radius + 2;
      this.x = Math.max(m, Math.min(game.width - m, this.x));
      this.y = Math.max(m + 8, Math.min(game.height - m, this.y));
    }

    if (vx || vy) this.heading = Math.atan2(vy, vx);
    if (Math.abs(dx) > 1) this.facing = dx < 0 ? -1 : 1;
    this.animT += dt;
    this.hitT -= dt;
  }

  // Boss cycle: enter -> chase -> (windup -> charge | burst) -> chase -> ...
  updateBoss(dt, game, ux, uy) {
    this.phaseT -= dt;
    const enraged = this.hp < this.maxHp * 0.4;
    switch (this.phase) {
      case 'enter':
        if (this.y >= 60) { this.phase = 'chase'; this.phaseT = 2; }
        return { vx: 0, vy: 30 };

      case 'chase':
        if (this.phaseT <= 0) {
          if (this.nextAttack === 'charge') {
            this.phase = 'windup';
            this.phaseT = enraged ? 0.45 : 0.7;
            Sound.play('charge');
            this.nextAttack = 'burst';
          } else {
            this.phase = 'burst';
            this.burstsLeft = enraged ? 4 : 3;
            this.phaseT = 0;
            this.nextAttack = 'charge';
          }
        }
        return { vx: ux * this.speed, vy: uy * this.speed };

      case 'windup':
        if (this.phaseT <= 0) {
          this.phase = 'charge';
          this.phaseT = 0.75;
          this.chargeX = ux;
          this.chargeY = uy;
          game.addShake(3);
        }
        return { vx: 0, vy: 0 };

      case 'charge':
        if (this.phaseT <= 0) { this.phase = 'chase'; this.phaseT = enraged ? 1.6 : 2.4; }
        if (Math.random() < 0.5) {
          game.particles.push(new Particle(this.x, this.y + 10, {
            vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
            life: 0.4, color: '#8a2050', friction: 4, size: 2,
          }));
        }
        return { vx: this.chargeX * 175, vy: this.chargeY * 175 };

      case 'burst':
        if (this.phaseT <= 0) {
          if (this.burstsLeft <= 0) {
            this.phase = 'chase';
            this.phaseT = enraged ? 1.6 : 2.4;
          } else {
            const n = enraged ? 16 : 12;
            const off = this.burstsLeft * 0.25;
            for (let i = 0; i < n; i++) {
              const a = off + (i / n) * Math.PI * 2;
              game.enemyBullets.push(new EnemyBullet(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 10, a, 70));
            }
            game.addShake(2);
            Sound.play('burst');
            this.burstsLeft--;
            this.phaseT = 0.4;
          }
        }
        return { vx: 0, vy: 0 };
    }
    return { vx: 0, vy: 0 };
  }

  hit(game, damage, angle) {
    this.hp -= damage;
    this.hitT = this.def.ai === 'boss' ? 0.04 : 0.08;
    const kb = 70 * (1 - this.def.kbResist);
    this.kbx += Math.cos(angle) * kb;
    this.kby += Math.sin(angle) * kb;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.onEnemyKilled(this);
    } else {
      Sound.play('hit');
    }
  }

  draw(ctx) {
    const def = this.def;
    const set = Sprites.enemies[def.sprite];
    let i = Math.floor(this.animT * def.fps) % set.frames.length;
    let flash = this.hitT > 0;

    if (def.ai === 'keepAway') {
      i = (this.animT + this.seed) % 3 < 0.15 ? 1 : 0;                  // blink now and then
      if (this.shootT < 0.35 && Math.floor(this.shootT * 20) % 2) flash = true; // about to fire
    }
    if (def.ai === 'boss' && this.phase === 'windup' && Math.floor(this.phaseT * 20) % 2) flash = true;

    const img = flash ? set.flash[i] : set.frames[i];
    let x = Math.round(this.x), y = Math.round(this.y);
    if (def.ai === 'boss' && this.phase === 'windup') {
      x += Math.round(Math.random() * 2 - 1);
      y += Math.round(Math.random() * 2 - 1);
    }
    const hw = Math.floor(set.w / 2), hh = Math.floor(set.h / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - hw + 1, y + Math.ceil(set.h / 2) - 1, set.w - 2, 2);

    ctx.save();
    ctx.translate(x, y);
    if (def.rotate) {
      // snap to 8 directions for a crisper retro look
      const step = Math.PI / 4;
      ctx.rotate(Math.round((this.heading + Math.PI / 2) / step) * step);
    } else if (this.facing < 0) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, -hw, -hh);
    ctx.restore();

    // spitter pupil tracks the player
    if (def.ai === 'keepAway' && i === 0 && !flash) {
      const px = x + Math.round(this.lookX * 2), py = y + Math.round(this.lookY * 2);
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(px - 2, py - 2, 4, 4);
      ctx.fillStyle = '#ff4d5a';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }
}

// Slow glowing orb fired by spitters and the boss.
class EnemyBullet {
  constructor(x, y, angle, speed = 85) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 2;
    this.t = 0;
    this.dead = false;
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.t += dt;
    if (this.x < -10 || this.x > game.width + 10 || this.y < -10 || this.y > game.height + 10) this.dead = true;
  }

  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = Math.floor(this.t * 12) % 2 ? '#d65cff' : '#ff7bd5';
    ctx.fillRect(x - 2, y - 1, 4, 2);
    ctx.fillRect(x - 1, y - 2, 2, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

// ---------------------------------------------------------------- projectiles & fx
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 280;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.radius = 2;
    this.damage = 1;
    this.life = 1.5;
    this.dead = false;
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    const out = this.x < 0 || this.x > game.width || this.y < 0 || this.y > game.height;
    if (out || this.life <= 0) {
      this.dead = true;
      if (out) game.spawnSparks(
        Math.max(1, Math.min(game.width - 1, this.x)),
        Math.max(1, Math.min(game.height - 1, this.y)), 4, '#ffe46b');
    }
  }

  draw(ctx) {
    const nx = this.vx / this.speed, ny = this.vy / this.speed;
    const x = Math.round(this.x), y = Math.round(this.y);
    // trail
    ctx.fillStyle = '#ff5a3a';
    ctx.fillRect(Math.round(this.x - nx * 4), Math.round(this.y - ny * 4), 1, 1);
    ctx.fillStyle = '#ffe46b';
    ctx.fillRect(Math.round(this.x - nx * 2), Math.round(this.y - ny * 2), 2, 2);
    // head
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

class Particle {
  constructor(x, y, o = {}) {
    this.x = x;
    this.y = y;
    this.vx = o.vx || 0;
    this.vy = o.vy || 0;
    this.life = this.maxLife = o.life || 0.5;
    this.color = o.color || '#fff';
    this.friction = o.friction || 0;
    this.size = o.size || 1;
    this.dead = false;
  }

  update(dt) {
    const f = Math.max(0, 1 - this.friction * dt);
    this.vx *= f;
    this.vy *= f;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    // blink out during the last 25% of life (retro style, no alpha fade)
    const t = this.life / this.maxLife;
    if (t < 0.25 && Math.floor(this.life * 30) % 2) return;
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
  }
}

// Rising "+100" style text.
class FloatText {
  constructor(x, y, text, color = '#ffe46b') {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = this.maxLife = 0.8;
    this.dead = false;
  }

  update(dt) {
    this.y -= 22 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    if (this.life < 0.25 && Math.floor(this.life * 30) % 2) return;
    drawText(ctx, this.text, this.x, this.y, this.color, 1, 'center');
  }
}
