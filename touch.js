// touch.js — on-screen twin-stick controls for phones and tablets.
//
// While PLAYING:
//   left half of the screen  -> movement stick (analog)
//   right half of the screen -> aim stick; the gun fires while it's pushed
//   top-right corner         -> pause button
// Sticks "float": each one appears where the thumb first lands, and its base
// follows the thumb if it drags past the edge. In every other state a touch
// is a tap: it sets Input.mouse.x/y (buffer pixels) and Input.mouse.clicked.
//
// Touch only writes into Input (move, aim, touchFire, touchMode), so the game
// reads touch and keyboard/mouse the same way. The sticks are drawn on a
// full-screen overlay canvas, so they also work in the black bars around the game.

const STICK_R = 48;      // CSS px of thumb travel for full deflection
const DEADZONE = 0.2;    // fraction of STICK_R that counts as "centered"
const PAUSE_ZONE_W = 44, PAUSE_ZONE_H = 36; // buffer px, top-right corner

const TouchControls = {
  move: null,            // { id, ox, oy, x, y } in CSS px, or null
  aim: null,
  lastTouch: -1e9,

  init(canvas) {
    this.canvas = canvas;
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) Input.touchMode = true;

    const o = this.overlay = document.createElement('canvas');
    o.className = 'touch-overlay';
    document.body.appendChild(o);
    this.octx = o.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const opts = { passive: false };
    document.addEventListener('touchstart', e => this.onStart(e), opts);
    document.addEventListener('touchmove', e => this.onMove(e), opts);
    document.addEventListener('touchend', e => this.onEnd(e), opts);
    document.addEventListener('touchcancel', e => this.onEnd(e), opts);
    window.addEventListener('blur', () => { this.move = this.aim = null; this.sync(); });

    // A real mouse moving (not right after a touch) switches back to mouse mode.
    window.addEventListener('mousemove', e => {
      if (Input.touchMode && (e.movementX || e.movementY) && performance.now() - this.lastTouch > 1000) {
        this.setMode(false);
      }
    });
  },

  setMode(on) {
    if (Input.touchMode === on) return;
    Input.touchMode = on;
    Game.resize();
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.overlay.width = Math.round(window.innerWidth * dpr);
    this.overlay.height = Math.round(window.innerHeight * dpr);
  },

  toBuffer(t) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((t.clientX - r.left) / r.width) * VIEW_W,
      y: ((t.clientY - r.top) / r.height) * VIEW_H,
    };
  },

  onStart(e) {
    e.preventDefault(); // no scrolling, zooming, or fake mouse events
    this.lastTouch = performance.now();
    this.setMode(true);
    for (const t of e.changedTouches) {
      const b = this.toBuffer(t);
      if (Game.state === 'PLAYING') {
        if (b.x >= VIEW_W - PAUSE_ZONE_W && b.y < PAUSE_ZONE_H) {
          Input.pressed.Escape = true;
          continue;
        }
        const stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        if (t.clientX < window.innerWidth / 2) { if (!this.move) this.move = stick; }
        else if (!this.aim) this.aim = stick;
      } else {
        Input.mouse.x = b.x;
        Input.mouse.y = b.y;
        Input.mouse.clicked = true;
      }
    }
    this.sync();
  },

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const s of [this.move, this.aim]) {
        if (!s || s.id !== t.identifier) continue;
        s.x = t.clientX;
        s.y = t.clientY;
        // drag the base along so the stick never "runs out"
        const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
        if (d > STICK_R) {
          s.ox = s.x - (dx / d) * STICK_R;
          s.oy = s.y - (dy / d) * STICK_R;
        }
      }
    }
    this.sync();
  },

  onEnd(e) {
    e.preventDefault();
    this.lastTouch = performance.now();
    for (const t of e.changedTouches) {
      if (this.move && this.move.id === t.identifier) this.move = null;
      if (this.aim && this.aim.id === t.identifier) this.aim = null;
    }
    this.sync();
  },

  // Turn stick positions into Input.move / Input.aim / Input.touchFire.
  sync() {
    Input.move = { x: 0, y: 0 };
    if (this.move) {
      const dx = (this.move.x - this.move.ox) / STICK_R, dy = (this.move.y - this.move.oy) / STICK_R;
      const len = Math.hypot(dx, dy);
      if (len > DEADZONE) {
        const mag = Math.min(1, (len - DEADZONE) / (1 - DEADZONE));
        Input.move = { x: (dx / len) * mag, y: (dy / len) * mag };
      }
    }
    Input.aim = null;
    if (this.aim) {
      const dx = this.aim.x - this.aim.ox, dy = this.aim.y - this.aim.oy;
      const len = Math.hypot(dx, dy);
      if (len > DEADZONE * STICK_R) Input.aim = { x: dx / len, y: dy / len };
    }
    Input.touchFire = !!Input.aim;
  },

  // Called every frame from Game.render.
  draw(playing) {
    const c = this.octx, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!Input.touchMode || !playing) return;
    c.setTransform(d, 0, 0, d, 0, 0);

    const W = window.innerWidth, H = window.innerHeight;
    const ghostY = H - Math.min(90, H * 0.22);
    this.drawStick(c, this.move, Math.min(90, W * 0.18), ghostY, 'MOVE', '255,255,255');
    this.drawStick(c, this.aim, W - Math.min(90, W * 0.18), ghostY, 'AIM', '255,77,90');
  },

  drawStick(c, s, gx, gy, label, rgb) {
    const ox = s ? s.ox : gx, oy = s ? s.oy : gy;
    const kx = s ? s.x : gx, ky = s ? s.y : gy;
    const a = s ? 1 : 0.45; // ghost hint when the thumb is off the screen

    c.beginPath();
    c.arc(ox, oy, STICK_R, 0, Math.PI * 2);
    c.fillStyle = `rgba(255,255,255,${0.08 * a})`;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = `rgba(255,255,255,${0.3 * a})`;
    c.stroke();

    c.beginPath();
    c.arc(kx, ky, 20, 0, Math.PI * 2);
    c.fillStyle = `rgba(${rgb},${0.45 * a})`;
    c.fill();

    if (!s) {
      c.fillStyle = `rgba(255,255,255,${0.5 * a})`;
      c.font = 'bold 11px ui-monospace, Menlo, monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, ox, oy + STICK_R + 14);
    }
  },
};
