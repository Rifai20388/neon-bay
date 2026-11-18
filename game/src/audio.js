// All sound in Neon Bay is synthesized with WebAudio — no audio files, so
// the game stays fully offline. Everything is created lazily on the first
// user gesture, because browsers block audio before one.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOn = false;
  let sirenTimer = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.stopSiren();
    },
    isMuted() {
      return muted;
    },
    // A low engine hum whose pitch follows speed; call every frame.
    engine(speedNorm) {
      if (!ensure() || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 95, t, 0.08);
      engineGain.gain.setTargetAtTime(0.02 + speedNorm * 0.05, t, 0.1);
    },
    engineOff() {
      if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (!on) {
        this.stopSiren();
        return;
      }
      if (!ensure() || muted) return;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.035;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      let hi = true;
      sirenTimer = window.setInterval(() => {
        if (!sirenOsc) return;
        hi = !hi;
        sirenOsc.frequency.setTargetAtTime(hi ? 880 : 620, ctx.currentTime, 0.05);
      }, 380);
    },
    stopSiren() {
      sirenOn = false;
      if (sirenTimer) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
      }
      if (sirenOsc) {
        try {
          sirenOsc.stop();
        } catch {
          /* already stopped */
        }
        sirenOsc = null;
        sirenGain = null;
      }
    },
    blip() {
      tone(880, 0.12, 'sine', 0.22, 1320);
    },
    shot() {
      noise(0.14, 0.4, 2400);
      tone(180, 0.1, 'square', 0.12, 60);
    },
    sting() {
      tone(523, 0.35, 'triangle', 0.22);
      window.setTimeout(() => tone(784, 0.4, 'triangle', 0.22), 140);
    },
    thud() {
      tone(90, 0.18, 'sine', 0.3, 45);
      noise(0.1, 0.2, 500);
    },
    fail() {
      tone(320, 0.25, 'sawtooth', 0.15, 160);
      window.setTimeout(() => tone(210, 0.35, 'sawtooth', 0.15, 110), 160);
    },
  };
}
