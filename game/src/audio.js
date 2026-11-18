// Synthesized sound for Neon Bay: every effect is built with WebAudio, so
// the game ships no audio files. Engine hum follows speed, the siren wails
// while police are close, and pickups, shots and mission stings are blips.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this._sirenPhase = 0;
  }

  // Must be called from a user gesture the first time (autoplay policy).
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 55 * 1.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter); this.engineOsc2.connect(filter);
    filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // Siren: a square wave whose frequency alternates twice a second.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // speed 0..1 (car) or 0 when on foot; called every frame.
  engine(speed, on) {
    if (!this.ctx) return;
    const target = on ? 0.05 + speed * 0.1 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const f = 55 + speed * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, this.ctx.currentTime, 0.08);
  }

  siren(on, dt) {
    if (!this.ctx) return;
    this._sirenPhase += dt;
    const f = Math.floor(this._sirenPhase * 2) % 2 === 0 ? 720 : 960;
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  pickup() { this.blip(880, 0.1); setTimeout(() => this.blip(1318, 0.14), 90); }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  sting() {
    this.blip(523, 0.12); setTimeout(() => this.blip(659, 0.12), 110);
    setTimeout(() => this.blip(784, 0.2), 220);
  }

  thud() { this.blip(120, 0.18, 'triangle', 0.4); }
}
