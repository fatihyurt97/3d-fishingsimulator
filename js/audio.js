// Harici ses dosyası yok: her şey WebAudio ile üretilir. iOS için ilk dokunuşta açılır.
let ctx = null;
let master = null;
let noiseBuf = null;
let ambient = null;
let enabled = true;

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(2);
      startAmbient();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* ses yoksa oyun sessiz devam eder */ }
}

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.05);
}

function makeNoise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + (Math.random() * 2 - 1) * 0.12) * 0.98; // kahverengi gürültü (rüzgâr)
    d[i] = last * 3;
  }
  return buf;
}

function startAmbient() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const g = ctx.createGain();
  g.gain.value = 0.12;
  src.connect(lp).connect(g).connect(master);
  src.start();
  ambient = { g, lp };
}

// Yağmur sesi: yüksek geçişli gürültü
let rainGain = null;
export function setRain(amount) {
  if (!ctx) return;
  if (!rainGain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    src.connect(hp).connect(rainGain).connect(master);
    src.start();
  }
  rainGain.gain.setTargetAtTime(amount * 0.12, ctx.currentTime, 0.5);
}

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, freq, vol, q = 1, sweepTo = null) {
  if (!ctx || !enabled) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(ctx.currentTime, Math.random() * 1.5, dur + 0.05);
}

export const sfx = {
  cast() { noise(0.35, 500, 0.35, 0.8, 2200); },
  splash() { noise(0.4, 900, 0.5, 0.6); tone(260, 0.2, 'sine', 0.05, 120); },
  nibble() { tone(1200, 0.04, 'triangle', 0.05); },
  bite() { tone(880, 0.12, 'square', 0.12); tone(660, 0.14, 'square', 0.1, null, 0.1); },
  hook() { tone(520, 0.2, 'triangle', 0.3, 240); },
  reel() { tone(190 + Math.random() * 40, 0.025, 'triangle', 0.05); },
  surge() { noise(0.5, 260, 0.25, 1.2); },
  snap() { tone(420, 0.35, 'sawtooth', 0.12, 90); noise(0.15, 2500, 0.3, 2); },
  escape() { tone(300, 0.3, 'sine', 0.1, 150); },
  catch() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, null, i * 0.09)); },
  coin() { tone(1320, 0.08, 'square', 0.06); tone(1760, 0.1, 'square', 0.05, null, 0.06); },
  ui() { tone(700, 0.05, 'sine', 0.08); },
  error() { tone(180, 0.18, 'square', 0.08); },
};

export function isEnabled() { return enabled; }
