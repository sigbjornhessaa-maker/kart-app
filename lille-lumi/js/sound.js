'use strict';
// Enkle 8-bit-lyder laget med Web Audio API.
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true;

  // Nettlesere (særlig iOS) krever at lyd startes etter et trykk fra brukeren.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, o = {}) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    const vol = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, o = {}) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(o.freq || 1500, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const arp = (notes, step, vol, type) =>
    notes.forEach((f, i) => tone(f, step * 1.4, { delay: i * step, vol, type }));

  return {
    unlock,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
    pickup(combo) {
      const f = 660 * Math.pow(2, Math.min(combo, 12) / 12);
      tone(f, 0.05, { vol: 0.2 });
      tone(f * 1.5, 0.07, { delay: 0.045, vol: 0.16 });
    },
    thrust() { tone(150, 0.09, { type: 'triangle', to: 280, vol: 0.14 }); },
    crash() {
      noise(0.6, { vol: 0.5, freq: 1800 });
      tone(300, 0.45, { type: 'sawtooth', to: 50, vol: 0.18 });
    },
    zone() { arp([523, 659, 784, 1047], 0.09, 0.18); },
    click() { tone(520, 0.04, { vol: 0.14 }); tone(780, 0.04, { delay: 0.03, vol: 0.1 }); },
    buy() { arp([784, 988, 1175, 1568], 0.07, 0.18); },
    deny() { tone(180, 0.12, { vol: 0.18 }); tone(140, 0.16, { delay: 0.1, vol: 0.18 }); },
    record() { arp([659, 784, 988, 1319, 988, 1319], 0.08, 0.16, 'triangle'); },
  };
})();
