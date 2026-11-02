// audio.js — retro sound effects synthesized with the Web Audio API.
// No audio files: every sound is a short oscillator or noise envelope.
// The AudioContext starts on the first click (browsers require a user gesture).

const MUTE_KEY = 'pixelSiege.muted';

const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,

  init() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }
    const unlock = () => {
      if (!this.ctx) this._create();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('mousedown', unlock);
    window.addEventListener('keydown', unlock);
  },

  _create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  },

  // A single oscillator "blip" with a pitch slide and a quick decay.
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  // Filtered noise burst (hits, explosions).
  noise(dur, vol, freq, type = 'lowpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  },

  notes(list, type = 'square', vol = 0.12, gap = 0.09, len = 0.14) {
    list.forEach((f, i) => this.tone(type, f, f * 0.98, len, vol, i * gap));
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot':
        this.tone('square', 880, 180, 0.07, 0.07);
        this.noise(0.05, 0.08, 4000, 'highpass');
        break;
      case 'hit':
        this.noise(0.04, 0.12, 2500, 'bandpass');
        break;
      case 'explode':
        this.noise(0.25, 0.25, 1800);
        this.tone('square', 260, 50, 0.2, 0.08);
        break;
      case 'bigExplode':
        this.noise(0.45, 0.35, 1200);
        this.tone('sawtooth', 160, 30, 0.4, 0.12);
        break;
      case 'bossDie':
        for (let i = 0; i < 5; i++) this.noise(0.4, 0.35, 1500 - i * 200, 'lowpass', i * 0.18);
        this.tone('sawtooth', 300, 25, 1.2, 0.15);
        break;
      case 'hurt':
        this.tone('sawtooth', 240, 70, 0.25, 0.15);
        this.noise(0.12, 0.15, 900);
        break;
      case 'die':
        this.tone('square', 400, 40, 0.8, 0.15);
        this.noise(0.6, 0.3, 1000);
        break;
      case 'enemyShoot':
        this.tone('sine', 620, 260, 0.14, 0.1);
        break;
      case 'burst':
        this.tone('square', 180, 90, 0.18, 0.1);
        this.tone('sine', 520, 200, 0.2, 0.08);
        break;
      case 'charge':
        this.tone('sawtooth', 80, 320, 0.6, 0.1);
        break;
      case 'roar':
        this.tone('sawtooth', 70, 40, 1.0, 0.18);
        this.noise(0.9, 0.15, 500);
        break;
      case 'clear':
        this.notes([523, 659, 784, 1047]);
        break;
      case 'start':
        this.notes([392, 523, 784], 'square', 0.1, 0.07, 0.1);
        break;
      case 'blip':
        this.tone('square', 660, 660, 0.05, 0.06);
        break;
      case 'gameover':
        this.notes([392, 330, 262, 196], 'triangle', 0.18, 0.22, 0.3);
        break;
      case 'victory':
        this.notes([523, 523, 523, 698, 880, 784, 880, 1047], 'square', 0.11, 0.13, 0.18);
        break;
    }
  },
};
