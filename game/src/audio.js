// Synthesised sound: everything is WebAudio oscillators and filtered noise,
// no audio files, no network. Every call is guarded so the game still runs
// where audio is unavailable (headless screenshot runs included).
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* ignore */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ensure()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.4;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* ignore */ }
  }

  return {
    resume() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shoot() { noise(0.12, 0.5, 900); tone(180, 0.08, 'square', 0.2, 60); },
    punch() { noise(0.08, 0.35, 400); },
    pickup() { tone(660, 0.09, 'sine', 0.3); tone(990, 0.14, 'sine', 0.3); },
    cash() { tone(880, 0.08, 'triangle', 0.3); tone(1174, 0.1, 'triangle', 0.3); tone(1568, 0.16, 'triangle', 0.3); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.3), i * 90)); },
    crash() { noise(0.25, 0.5, 500); },
    busted() { tone(220, 0.5, 'sawtooth', 0.3, 110); },
    wasted() { tone(330, 0.7, 'sawtooth', 0.3, 55); },
    engine(on, speedNorm) {
      if (!ensure()) return;
      try {
        if (on && !engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0.03;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 500;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        if (!on && engineOsc) {
          engineOsc.stop();
          engineOsc = null;
          engineGain = null;
          return;
        }
        if (engineOsc) {
          engineOsc.frequency.setValueAtTime(60 + speedNorm * 160, ctx.currentTime);
          engineGain.gain.setValueAtTime(0.02 + speedNorm * 0.05, ctx.currentTime);
        }
      } catch { /* ignore */ }
    },
    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (!ensure()) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'triangle';
          sirenOsc.frequency.value = 700;
          sirenLfo = ctx.createOscillator();
          sirenLfo.type = 'square';
          sirenLfo.frequency.value = 0.9;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 220;
          sirenLfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenLfo.start();
        } else if (!on && sirenOsc) {
          sirenOsc.stop();
          sirenLfo.stop();
          sirenOsc = null;
          sirenLfo = null;
          sirenGain = null;
        }
      } catch { /* ignore */ }
    },
  };
}
