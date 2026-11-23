// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, two-tone sirens, gunshots, pickups and a small bass loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.setEngine(0, false);
    },
    isMuted() { return muted; },
    setEngine(speed01, on) {
      if (!ctx || muted) { if (engineGain) engineGain.gain.value = 0; return; }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 60 + speed01 * 140;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, ctx.currentTime, 0.1);
    },
    setSiren(on) {
      if (!ctx || muted) { if (sirenGain) sirenGain.gain.value = 0; return; }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'square';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        let high = false;
        window.setInterval(() => {
          if (sirenOsc) sirenOsc.frequency.value = high ? 950 : 700;
          high = !high;
        }, 420);
      }
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.1);
    },
    shot() { noise(0.14, 0.5, 2800); blip(160, 0.08, 'square', 0.25, 60); },
    punch() { noise(0.08, 0.3, 700); },
    hit() { blip(220, 0.1, 'triangle', 0.3, 110); },
    pickup() { blip(660, 0.09, 'sine', 0.3); window.setTimeout(() => blip(990, 0.12, 'sine', 0.3), 80); },
    crash() { noise(0.3, 0.5, 500); },
    explosion() { noise(0.8, 0.7, 300); blip(90, 0.6, 'sine', 0.5, 30); },
    mission() { [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.18, 'triangle', 0.3), i * 110)); },
    fail() { [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 140)); },
    click() { blip(800, 0.05, 'square', 0.15); },
    startMusic() {
      if (!ctx || musicTimer) return;
      const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 82.4];
      musicTimer = window.setInterval(() => {
        if (muted) return;
        blip(bass[musicStep % bass.length], 0.32, 'triangle', 0.12);
        if (musicStep % 4 === 2) blip(bass[musicStep % bass.length] * 2, 0.1, 'sine', 0.05);
        musicStep += 1;
      }, 300);
    },
    stopMusic() { if (musicTimer) { window.clearInterval(musicTimer); musicTimer = null; } },
  };
}
