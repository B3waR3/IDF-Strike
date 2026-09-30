const rand = (a, b) => a + Math.random() * (b - a);

let ctx = null, out = null, dry = null, wet = null, lp = null, noise = null, pink = null;
let ring = null, ringGain = null, windGain = null, ambT = 4, boomT = 12;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

function makeNoise(pinkish) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (!pinkish) { d[i] = w; continue; }
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return b;
}
function makeImpulse(sec, decay) {
  const len = ctx.sampleRate * sec;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    // Early slap-back echoes off building faces.
    for (const t of [0.045, 0.09, 0.16, 0.27]) {
      const k = Math.floor((t + rand(-0.01, 0.01)) * ctx.sampleRate);
      for (let j = 0; j < 400; j++) d[k + j] += (Math.random() * 2 - 1) * 0.5 * (1 - j / 400);
    }
  }
  return b;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
  const master = ctx.createGain(); master.gain.value = 0.75;
  lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
  comp.connect(lp); lp.connect(master); master.connect(ctx.destination);
  out = comp;
  dry = ctx.createGain(); dry.connect(out);
  const conv = ctx.createConvolver(); conv.buffer = makeImpulse(2.6, 3.2);
  wet = ctx.createGain(); wet.gain.value = 0.55;
  wet.connect(conv); conv.connect(out);
  noise = makeNoise(false);
  pink = makeNoise(true);

  ring = ctx.createOscillator(); ring.frequency.value = 3800;
  ringGain = ctx.createGain(); ringGain.gain.value = 0;
  ring.connect(ringGain); ringGain.connect(master); ring.start();

  const w = ctx.createBufferSource(); w.buffer = pink; w.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.035;
  lfo.connect(lfoG); lfoG.connect(windGain.gain);
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
  const lfo2G = ctx.createGain(); lfo2G.gain.value = 180;
  lfo2.connect(lfo2G); lfo2G.connect(wf.frequency);
  w.connect(wf); wf.connect(windGain); windGain.connect(dry);
  w.start(); lfo.start(); lfo2.start();
}

export function setListener(pos, yaw) { listener.x = pos.x; listener.y = pos.y; listener.z = pos.z; listener.yaw = yaw; }
function spatial(pos) {
  if (!pos) return { dist: 0, pan: 0 };
  const dx = pos.x - listener.x, dz = pos.z - listener.z;
  const dist = Math.hypot(dx, dz, pos.y - listener.y);
  const rx = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  return { dist, pan: dist > 0.5 ? Math.max(-1, Math.min(1, rx / dist)) * 0.85 : 0 };
}
function chain(pan, send) {
  const g = ctx.createGain();
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  g.connect(p); p.connect(dry);
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(wet); }
  return g;
}
function burst(dest, t, { type = 'lowpass', f = 2000, q = 0.7, dur = 0.1, vol = 1, attack = 0.001, rate = 1, fEnd = 0 }) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = rate * rand(0.92, 1.08);
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest);
  src.start(t, rand(0, 2)); src.stop(t + dur + 0.05);
}
function osc(dest, t, { f0 = 100, f1 = 40, dur = 0.1, vol = 1, type = 'sine' }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

// p: { cut, dur, thump, gain } weapon voicing. pos null = player's own gun.
export function playShot(p, pos = null, suppressed = false) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const att = 1 / (1 + dist / 12);
  const vol = p.gain * att;
  if (vol < 0.008) return;
  const t = ctx.currentTime + dist / 343;
  const air = Math.max(0.12, 1 - dist / 220);
  const d = chain(pan, 0.35 + Math.min(dist / 60, 1) * 0.9);
  if (dist < 60) burst(d, t, { type: 'highpass', f: 3500, dur: 0.025, vol: vol * 1.1 * (1 - dist / 60) });
  burst(d, t, { f: p.cut * air, dur: p.dur * (1 + dist / 60), vol: vol * 1.2, q: 0.9 });
  burst(d, t, { type: 'bandpass', f: 900 * air + 200, q: 0.8, dur: p.dur * 0.7, vol: vol * 0.7 });
  osc(d, t, { f0: p.thump * 1.4, f1: 28, dur: 0.18, vol: vol * (pos ? 0.8 : 1.4) });
  if (!pos) osc(d, t, { f0: 60, f1: 25, dur: 0.25, vol: vol * 0.8 });
  // Rolling tail: urban echo that grows relatively louder with distance.
  burst(d, t + 0.02, { f: 900 * air, dur: 0.9 + dist / 90, vol: vol * (0.18 + Math.min(dist / 100, 0.5)), attack: 0.05 });
  if (dist > 30) burst(d, t + 0.15 + dist / 500, { f: 500, dur: 1.2, vol: vol * 0.35, attack: 0.08 });
  if (!pos && !suppressed) {
    burst(d, t + 0.03, { type: 'bandpass', f: 7000, q: 3, dur: 0.05, vol: 0.05 });
  }
}

// Bullet passing close by: supersonic crack plus a whistle.
export function playWhiz(pan = 0) {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(pan, 0.1);
  burst(d, t, { type: 'highpass', f: 2500, dur: 0.018, vol: 0.9 });
  burst(d, t + 0.005, { type: 'bandpass', f: 4200, q: 4, dur: 0.12, vol: 0.35, fEnd: 1800, attack: 0.02 });
}
export function playSnap(pos) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const t = ctx.currentTime, d = chain(pan, 0.2);
  burst(d, t, { type: 'highpass', f: 1800, dur: 0.01, vol: 0.4 / (1 + dist / 8) });
}
export function playImpact(pos, surf) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const v = 0.5 / (1 + dist / 5);
  if (v < 0.02) return;
  const t = ctx.currentTime + dist / 343, d = chain(pan, 0.3);
  if (surf === 'metal') {
    osc(d, t, { f0: rand(1800, 3200), f1: 1200, dur: 0.18, vol: v * 0.5, type: 'triangle' });
    burst(d, t, { type: 'highpass', f: 3000, dur: 0.04, vol: v });
  } else {
    burst(d, t, { f: surf === 'sand' ? 900 : 2200, dur: 0.07, vol: v });
    burst(d, t + 0.02, { type: 'highpass', f: 4000, dur: 0.12, vol: v * 0.25, attack: 0.02 });
  }
}
export function playFlesh(pos) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const t = ctx.currentTime + dist / 343, d = chain(pan, 0.1), v = 0.6 / (1 + dist / 6);
  burst(d, t, { f: 600, dur: 0.08, vol: v });
  osc(d, t, { f0: 180, f1: 60, dur: 0.07, vol: v * 0.6 });
}

export function playExplosion(pos, big = 1) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const att = 1 / (1 + dist / 16);
  const t = ctx.currentTime + dist / 343;
  const air = Math.max(0.15, 1 - dist / 250);
  const d = chain(pan, 0.9);
  burst(d, t, { f: 3500 * air, dur: 0.3, vol: 1.6 * att * big });
  burst(d, t, { f: 600 * air, dur: 2.2, vol: 1.6 * att * big, attack: 0.01 });
  osc(d, t, { f0: 90, f1: 22, dur: 1.2, vol: 1.8 * att * big });
  burst(d, t + 0.3, { f: 350, dur: 2.5, vol: 0.5 * att * big, attack: 0.2 });
  for (let i = 0; i < 6; i++) burst(d, t + rand(0.3, 1.4), { type: 'bandpass', f: rand(2000, 5000), q: 2, dur: 0.05, vol: 0.1 * att });
}
export function playRocketLaunch(pos) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const a = 1 / (1 + dist / 14), t = ctx.currentTime + dist / 343, d = chain(pan, 0.6);
  burst(d, t, { f: 1800, dur: 0.25, vol: 1.2 * a });
  burst(d, t + 0.05, { type: 'bandpass', f: 700, q: 0.8, dur: 1.4, vol: 0.9 * a, attack: 0.1, fEnd: 300 });
  osc(d, t, { f0: 140, f1: 40, dur: 0.4, vol: 0.9 * a });
}

export function playClick(delay = 0, f = 1800, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, d = chain(0, 0.05);
  osc(d, t, { f0: f, f1: f * 0.5, dur: 0.035, vol, type: 'square' });
  burst(d, t, { type: 'highpass', f: 3500, dur: 0.04, vol: vol * 0.8 });
  burst(d, t + 0.01, { type: 'bandpass', f: f * 0.6, q: 3, dur: 0.06, vol: vol * 0.5 });
}
export function playMagOut(delay) { if (!ctx) return; playClick(delay, 900, 0.22); const t = ctx.currentTime + delay + 0.04; burst(chain(0, 0.05), t, { f: 1500, dur: 0.12, vol: 0.12 }); }
export function playMagIn(delay) { if (!ctx) return; playClick(delay, 1200, 0.3); playClick(delay + 0.07, 1600, 0.18); }
export function playBolt(delay) { if (!ctx) return; playClick(delay, 700, 0.28); const t = ctx.currentTime + delay + 0.03; burst(chain(0, 0.05), t, { type: 'bandpass', f: 2500, q: 2, dur: 0.1, vol: 0.2 }); playClick(delay + 0.12, 1100, 0.28); }

export function playCasing(pos, pistol) {
  if (!ctx) return;
  const { dist, pan } = spatial(pos);
  const v = 0.08 / (1 + dist / 4);
  const t = ctx.currentTime, d = chain(pan, 0.1);
  for (let i = 0; i < 3; i++) osc(d, t + i * rand(0.05, 0.11), { f0: rand(pistol ? 4200 : 3200, pistol ? 6000 : 5000), f1: 2500, dur: 0.05, vol: v / (i + 1), type: 'triangle' });
}
export function playStep(surf, run, crouch) {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(rand(-0.1, 0.1), 0.05);
  const v = (run ? 0.3 : 0.18) * (crouch ? 0.45 : 1);
  if (surf === 'metal') { burst(d, t, { f: 1500, dur: 0.07, vol: v }); osc(d, t, { f0: 420, f1: 200, dur: 0.1, vol: v * 0.3, type: 'triangle' }); return; }
  burst(d, t, { f: surf === 'sand' ? 700 : 1200, dur: 0.09, vol: v });
  burst(d, t + 0.02, { type: 'highpass', f: surf === 'sand' ? 3500 : 5000, dur: 0.11, vol: v * 0.35, attack: 0.02 });
  osc(d, t, { f0: 110, f1: 50, dur: 0.06, vol: v * 0.6 });
}
export function playLand(v) {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0.1);
  burst(d, t, { f: 800, dur: 0.14, vol: 0.35 * v });
  osc(d, t, { f0: 90, f1: 40, dur: 0.12, vol: 0.4 * v });
}
export function playGear() {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0.02);
  burst(d, t, { type: 'bandpass', f: 2200, q: 1.5, dur: 0.12, vol: 0.05, attack: 0.03 });
}
export function playSwoosh() {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0);
  burst(d, t, { type: 'bandpass', f: 2400, q: 0.6, dur: 0.14, vol: 0.16, attack: 0.03, fEnd: 700 });
}
export function playHit(kill, head) {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0);
  osc(d, t, { f0: head ? 2400 : kill ? 1100 : 1700, f1: head ? 1800 : kill ? 700 : 1500, dur: kill ? 0.1 : 0.05, vol: 0.18, type: 'triangle' });
  burst(d, t, { type: 'highpass', f: 5000, dur: 0.03, vol: 0.1 });
}
export function playHurt() {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0.1);
  burst(d, t, { f: 400, dur: 0.2, vol: 0.7 });
  osc(d, t, { f0: 110, f1: 45, dur: 0.22, vol: 0.6 });
}
export function playHeartbeat(v) {
  if (!ctx || v < 0.02) return;
  const t = ctx.currentTime, d = chain(0, 0);
  osc(d, t, { f0: 60, f1: 35, dur: 0.12, vol: 0.5 * v });
  osc(d, t + 0.16, { f0: 55, f1: 32, dur: 0.12, vol: 0.35 * v });
}
// Ripping the bandage pack open.
export function playTear() {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0.03);
  burst(d, t, { type: 'bandpass', f: 3400, q: 0.8, dur: 0.22, vol: 0.2, attack: 0.01, fEnd: 1300 });
  burst(d, t + 0.04, { type: 'highpass', f: 5200, dur: 0.12, vol: 0.08 });
}
// One turn of elastic bandage being pulled around the arm.
export function playWrap() {
  if (!ctx) return;
  const t = ctx.currentTime, d = chain(0, 0.03);
  burst(d, t, { type: 'bandpass', f: rand(800, 1100), q: 1.3, dur: 0.32, vol: 0.08, attack: 0.09, fEnd: 1700 });
}
export function playPin() {
  if (!ctx) return;
  playClick(0, 2600, 0.18); playClick(0.25, 900, 0.15);
}

// Tinnitus + muffling after nearby explosions.
let deaf = 0;
export function concuss(amount) { deaf = Math.min(1, deaf + amount); }
export function isDeaf() { return deaf; }

// Distant battle ambience: remote firefights, far explosions, wind.
export function updateAudio(dt, active) {
  if (!ctx) return;
  deaf = Math.max(0, deaf - dt * 0.18);
  const now = ctx.currentTime;
  lp.frequency.setTargetAtTime(20000 * Math.pow(1 - deaf * 0.96, 3) + 250, now, 0.05);
  ringGain.gain.setTargetAtTime(deaf > 0.2 ? (deaf - 0.2) * 0.05 : 0, now, 0.1);
  if (!active) return;
  ambT -= dt;
  if (ambT <= 0) {
    ambT = rand(2.5, 9);
    const ang = rand(0, Math.PI * 2), dist = rand(250, 700);
    const pos = { x: listener.x + Math.cos(ang) * dist, y: 0, z: listener.z + Math.sin(ang) * dist };
    const n = Math.floor(rand(3, 14)), gap = rand(0.08, 0.14), kind = Math.random();
    const p = kind < 0.6 ? { cut: 2000, dur: 0.18, thump: 110, gain: 0.9 } : { cut: 1700, dur: 0.22, thump: 90, gain: 1.2 };
    for (let i = 0; i < n; i++) setTimeout(() => playShot(p, pos), (i * gap + (Math.random() < 0.2 ? rand(0.1, 0.4) : 0)) * 1000);
  }
  boomT -= dt;
  if (boomT <= 0) {
    boomT = rand(10, 28);
    const ang = rand(0, Math.PI * 2), dist = rand(400, 1200);
    playExplosion({ x: listener.x + Math.cos(ang) * dist, y: 0, z: listener.z + Math.sin(ang) * dist }, rand(1, 2.5));
  }
}
