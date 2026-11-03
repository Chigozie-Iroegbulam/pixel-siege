// input.js — keyboard + mouse state.
// Mouse coordinates are converted into the game's internal (low-res) pixels.
//
// isDown(...)     -> held right now
// wasPressed(...) -> pressed since the last update step (one-shot)
// mouse.clicked   -> left button pressed (or screen tapped) since the last update step
//
// Touch fields (written by touch.js):
// touchMode -> player is using a touch screen (changes HUD text and scaling)
// move      -> movement stick, {x, y} with length 0..1
// aim       -> aim stick direction as a unit vector, or null
// touchFire -> aim stick is pushed, so the gun should fire

const Input = {
  keys: {},
  pressed: {},
  mouse: { x: 160, y: 120, down: false, clicked: false },
  touchMode: false,
  move: { x: 0, y: 0 },
  aim: null,
  touchFire: false,
  _canvas: null,
  _viewW: 320,
  _viewH: 240,

  init(canvas, viewW, viewH) {
    this._canvas = canvas;
    this._viewW = viewW;
    this._viewH = viewH;

    const blockKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', e => {
      if (blockKeys.includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', e => this._updateMouse(e));
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this._updateMouse(e);
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Avoid "stuck" keys when the window loses focus.
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouse.down = false;
    });
  },

  _updateMouse(e) {
    const r = this._canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width) * this._viewW;
    this.mouse.y = ((e.clientY - r.top) / r.height) * this._viewH;
  },

  isDown(...codes) {
    return codes.some(c => this.keys[c]);
  },

  wasPressed(...codes) {
    return codes.some(c => this.pressed[c]);
  },

  // Called once at the end of every update step.
  endStep() {
    this.pressed = {};
    this.mouse.clicked = false;
  },
};
