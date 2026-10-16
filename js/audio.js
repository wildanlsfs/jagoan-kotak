// Suara game yang disintesis (tanpa file audio). Dibuat lazily setelah interaksi pengguna.
let ctx = null, master = null, muted = false, musicOn = true;
try { muted = localStorage.getItem('kotak.muted') === '1'; musicOn = localStorage.getItem('kotak.music') !== '0'; } catch {}

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
}
export function unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; try { localStorage.setItem('kotak.muted', m ? '1' : '0'); } catch {} if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.4, slide = 0, delay = 0 } = {}) {
  ensure(); if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = .3, freq = 1200, type = 'bandpass', delay = 0 } = {}) {
  ensure(); if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay, len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = vol;
  n.connect(f); f.connect(g); g.connect(master); n.start(t0);
}

export const sfx = {
  step: () => tone(180 + Math.random() * 40, { type: 'triangle', dur: .06, vol: .08 }),
  punch: () => { noise(.12, { vol: .35, freq: 900 }); tone(240, { type: 'triangle', dur: .1, vol: .15, slide: -120 }); },
  hit: () => { tone(520, { type: 'square', dur: .07, vol: .18, slide: -260 }); noise(.08, { vol: .25, freq: 2400 }); },
  poof: () => { noise(.3, { vol: .3, freq: 700, type: 'lowpass' }); [660, 880, 1175].forEach((f, i) => tone(f, { dur: .1, vol: .14, delay: .05 + i * .05 })); },
  gem: () => { tone(1318, { dur: .08, vol: .2 }); tone(1760, { dur: .14, vol: .2, delay: .06 }); },
  heart: () => [784, 988, 1318].forEach((f, i) => tone(f, { type: 'triangle', dur: .14, vol: .22, delay: i * .07 })),
  hurt: () => { tone(200, { type: 'sawtooth', dur: .25, vol: .3, slide: -120 }); noise(.15, { vol: .2, freq: 400, type: 'lowpass' }); },
  block: () => { tone(1200, { type: 'square', dur: .06, vol: .15 }); tone(1600, { dur: .18, vol: .18, delay: .03 }); },
  jump: () => tone(300, { type: 'triangle', dur: .2, vol: .25, slide: 380 }),
  slam: () => { tone(90, { type: 'sine', dur: .5, vol: .6, slide: -50 }); noise(.5, { vol: .45, freq: 300, type: 'lowpass' }); [523, 784, 1046].forEach((f, i) => tone(f, { type: 'triangle', dur: .2, vol: .2, delay: .1 + i * .06 })); },
  ready: () => [880, 1175, 1568].forEach((f, i) => tone(f, { type: 'square', dur: .08, vol: .1, delay: i * .06 })),
  warn: () => { tone(740, { type: 'square', dur: .08, vol: .12 }); tone(740, { type: 'square', dur: .08, vol: .12, delay: .14 }); },
  wave: () => [392, 523, 659, 784].forEach((f, i) => tone(f, { type: 'square', dur: .16, vol: .14, delay: i * .1 })),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { type: 'triangle', dur: .2, vol: .22, delay: i * .08 })),
  tick: () => tone(880, { dur: .06, vol: .15 }),
  check: () => { tone(988, { dur: .08, vol: .2 }); tone(1318, { dur: .16, vol: .2, delay: .07 }); },
  over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, { type: 'triangle', dur: .25, vol: .22, delay: i * .14 })),
};

// ---------------------------------------------------------------------------
// Musik latar ceria (disintesis, tanpa file): melodi + bas + drum, 8 birama berulang.
// Dijadwalkan sedikit di depan waktu (lookahead) supaya ketukannya tetap rapi.
// ---------------------------------------------------------------------------
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [45, 41, 36, 43, 45, 41, 43, 43];          // Am F C G | Am F G G — petualangan
const _ = null;
const MELODY = [
  [69, _, 72, _, 76, _, 74, 72], [72, _, 69, _, 65, _, 69, _], [67, _, 72, 76, 79, _, 76, _], [74, _, 71, _, 67, _, _, _],
  [69, 72, 76, _, 81, _, 79, 76], [77, _, 76, 74, 72, _, 69, _], [71, _, 74, _, 79, _, 77, 74], [76, _, 74, _, 71, _, 67, _],
]
let musicBus = null, noiseBuf = null, timer = 0, step = 0, nextT = 0, bpm = 118, playing = false;

function ensureMusic() {
  ensure(); if (!ctx || musicBus) return;
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function note(t, freq, { type = 'triangle', dur = .2, vol = .2, cutoff = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = o; if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); out = f; }
  out.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + .02);
}
function drum(t, kind) {
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + .12);
    g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + .16); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .18);
    return;
  }
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf;
  f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const dur = kind === 'hat' ? .04 : .12, vol = kind === 'hat' ? .07 : .2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(musicBus); n.start(t); n.stop(t + dur + .01);
}
function schedule() {
  const ahead = ctx.currentTime + .12;
  while (nextT < ahead) {
    const bar = Math.floor(step / 8) % 8, s8 = step % 8, len = 60 / bpm / 2, root = CHORDS[bar];
    const m = MELODY[bar][s8];
    if (m) note(nextT, midi(m), { type: 'square', dur: len * 1.6, vol: .07, cutoff: 2600 });
    if (s8 % 2 === 0) note(nextT, midi(root + [0, 7, 12, 7][s8 / 2]), { type: 'triangle', dur: len * 1.8, vol: .22 });
    if (s8 % 4 === 0) note(nextT, midi(root + 24 + (bar % 2 ? 4 : 7)), { type: 'sine', dur: len * 3.5, vol: .05 }); // isian lembut
    if (s8 === 0 || s8 === 4) drum(nextT, 'kick');
    if (s8 === 2 || s8 === 6) drum(nextT, 'snare');
    if (s8 % 2 === 1) drum(nextT, 'hat');
    nextT += len; step++;
  }
}
export const music = {
  start() {
    ensureMusic(); if (!ctx || playing || !musicOn) return;
    playing = true; step = 0; nextT = ctx.currentTime + .06;
    musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(.55, ctx.currentTime, .15);
    timer = setInterval(schedule, 25); schedule();
  },
  stop(fade = .25) {
    if (!playing) return; playing = false;
    musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    clearInterval(timer);
  },
  pause() { if (playing && ctx) { clearInterval(timer); musicBus.gain.setTargetAtTime(0, ctx.currentTime, .05); playing = false; this.paused = true; } },
  resume() { if (this.paused && musicOn) { this.paused = false; ensureMusic(); playing = true; nextT = ctx.currentTime + .06; musicBus.gain.setTargetAtTime(.55, ctx.currentTime, .1); timer = setInterval(schedule, 25); } },
  setTempo(v) { bpm = v; },
  get on() { return musicOn; },
  set on(v) { musicOn = v; try { localStorage.setItem('kotak.music', v ? '1' : '0'); } catch {} if (!v) { this.stop(.1); this.paused = false; } },
  paused: false,
};
