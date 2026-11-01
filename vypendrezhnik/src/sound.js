// Звук без файлов: всё синтезируется WebAudio. Контекст создаётся только после первого клика пользователя,
// по умолчанию звук включён, но без клика ничего не играет.

let ctx = null;
let master = null;
let muted = false;

// Вызывается из первого жеста пользователя (клик или касание)
export function unlockSound() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(value ? 0 : 0.7, ctx.currentTime, 0.05);
}

export function isMuted() {
  return muted;
}

function ready() {
  return ctx && !muted && ctx.state !== 'closed';
}

// Одна нота: sawtooth с фильтром, как медная труба
function tone(freq, start, dur, gain = 0.12, detune = 0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  o.detune.value = detune;
  f.type = 'lowpass';
  f.frequency.value = 1800;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(f).connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// Фанфары. Последняя нота намеренно фальшивит: −38 центов
export function fanfare() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.22, i === 3 ? 0.9 : 0.26, 0.12, i === 3 ? -38 : 0));
}

function noiseBuffer(sec) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Консервные аплодисменты: много коротких шлепков с разбросом по времени
export function applause(sec = 2.2) {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sec);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  for (let i = 0; i < 90; i++) {
    const at = t + Math.random() * sec;
    g.gain.setValueAtTime(0.0, at);
    g.gain.linearRampToValueAtTime(0.5 * (1 - (at - t) / sec), at + 0.005);
    g.gain.linearRampToValueAtTime(0.0, at + 0.04);
  }
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + sec);
}

// Треск воска: короткие щелчки
export function crackle(sec = 1.5) {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sec);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.value = 0.08;
  src.connect(hp).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + sec);
}

// Шорох занавеса
export function swish(sec = 1.2) {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sec);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, ctx.currentTime);
  lp.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + sec * 0.5);
  lp.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + sec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + sec * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + sec);
  src.connect(lp).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + sec);
}

// Воркование голубя: синус с вибрато и скольжением вниз
export function coo() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(640, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.5);
  lfo.frequency.value = 9;
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(master);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.65);
  lfo.stop(t + 0.65);
}

// Удар: лепнина разбивается о пол
export function shatter() {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  src.connect(hp).connect(g).connect(master);
  src.start();
  src.stop(ctx.currentTime + 0.6);
}
