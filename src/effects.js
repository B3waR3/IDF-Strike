import * as THREE from 'three';
import { LAYER_FX } from './gfx.js';

const rand = (a, b) => a + Math.random() * (b - a);
let scene = null;

function canvasTexture(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function valueNoise(size, octaves) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array((cells + 1) * (cells + 1)).map(() => Math.random());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const g = (a, b) => grid[b * (cells + 1) + a];
      const v = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
      out[y * size + x] += v * amp;
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export const TEX = {};
function buildTextures() {
  TEX.soft = canvasTexture(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  TEX.smoke = canvasTexture(128, (x, s) => {
    const n = valueNoise(s, 5);
    const img = x.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) {
      const dx = (xx - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const fall = Math.max(0, 1 - d);
      const v = n[y * s + xx];
      const a = Math.max(0, Math.min(1, (v * 1.6 - 0.35) * fall * fall * 2.2));
      const i = (y * s + xx) * 4;
      const shade = 200 + v * 55;
      img.data[i] = shade; img.data[i + 1] = shade; img.data[i + 2] = shade; img.data[i + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
  });
  TEX.fire = canvasTexture(128, (x, s) => {
    const n = valueNoise(s, 4);
    const img = x.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) {
      const dx = (xx - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const v = n[y * s + xx];
      const a = Math.max(0, Math.min(1, (1 - d) * (0.6 + v) * 1.5));
      const i = (y * s + xx) * 4;
      img.data[i] = 255; img.data[i + 1] = 140 + v * 110; img.data[i + 2] = 40 + v * 60; img.data[i + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
  });
  TEX.flash = canvasTexture(128, (x, s) => {
    x.translate(s / 2, s / 2);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g;
    for (let i = 0; i < 7; i++) {
      x.rotate((Math.PI * 2) / 7 + rand(-0.2, 0.2));
      x.beginPath(); x.moveTo(0, -6); x.lineTo(s * rand(0.3, 0.5), 0); x.lineTo(0, 6); x.fill();
    }
    x.beginPath(); x.arc(0, 0, s * 0.18, 0, 7); x.fill();
  });
  TEX.hole = canvasTexture(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(8,6,5,1)'); g.addColorStop(0.18, 'rgba(15,12,10,0.95)'); g.addColorStop(0.35, 'rgba(60,55,50,0.6)'); g.addColorStop(1, 'rgba(60,55,50,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(20,18,15,0.6)'; x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, 7); x.beginPath(); x.moveTo(s / 2, s / 2);
      x.lineTo(s / 2 + Math.cos(a) * rand(10, 28), s / 2 + Math.sin(a) * rand(10, 28)); x.stroke();
    }
  });
  TEX.scorch = canvasTexture(128, (x, s) => {
    const n = valueNoise(s, 4);
    const img = x.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) {
      const dx = (xx - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, Math.min(1, (1 - d) * 1.6 * (0.5 + n[y * s + xx])));
      const i = (y * s + xx) * 4;
      img.data[i] = 12; img.data[i + 1] = 10; img.data[i + 2] = 8; img.data[i + 3] = a * 230;
    }
    x.putImageData(img, 0, 0);
  });
  TEX.spark = canvasTexture(32, (x, s) => {
    const g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(0.5, 'rgba(255,240,200,1)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, s / 2 - 2, s, 4);
  });
}

// ---------------------------------------------------------------- particles
const particles = [];
const debrisGeo = new THREE.DodecahedronGeometry(1, 0);
export function spawnParticle(pos, vel, o) {
  let me;
  if (o.mesh) {
    me = new THREE.Mesh(debrisGeo, o.material);
    me.scale.setScalar(o.size);
    me.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    me.castShadow = false;
  } else {
    const mat = new THREE.SpriteMaterial({
      map: o.tex || TEX.soft, color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 1, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, rotation: rand(0, Math.PI * 2), fog: o.fog ?? true,
    });
    me = new THREE.Sprite(mat);
    me.scale.set(o.size, o.size, 1);
  }
  me.layers.set(LAYER_FX);
  me.position.copy(pos);
  scene.add(me);
  particles.push({
    me, vel, life: o.life, max: o.life, grav: o.grav ?? -9.8, grow: o.grow || 0, base: o.opacity ?? 1,
    drag: o.drag || 0, spin: o.spin || 0, fadeIn: o.fadeIn || 0, floor: o.floor ?? 0.02, colorFade: o.colorFade || null,
  });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.me);
      if (p.me.isSprite) p.me.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vel.y += p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
    p.me.position.addScaledVector(p.vel, dt);
    if (p.me.position.y < p.floor) { p.me.position.y = p.floor; p.vel.set(p.vel.x * 0.3, 0, p.vel.z * 0.3); }
    if (p.grow) {
      const s = 1 + p.grow * dt;
      p.me.scale.x *= s; p.me.scale.y *= s;
      if (!p.me.isSprite) p.me.scale.z *= s;
    }
    if (p.me.isSprite) {
      const t = p.life / p.max;
      const fin = p.fadeIn ? Math.min(1, (1 - t) / p.fadeIn) : 1;
      p.me.material.opacity = p.base * t * fin;
      if (p.spin) p.me.material.rotation += p.spin * dt;
      if (p.colorFade) p.me.material.color.lerpColors(p.colorFade[0], p.colorFade[1], 1 - t);
    } else if (p.spin) {
      p.me.rotation.x += p.spin * dt;
    }
  }
}

// ---------------------------------------------------------------- tracers
const tracers = [];
const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateX(Math.PI / 2);
export function spawnTracer(a, b, color = 0xffd9a0, width = 0.012, speed = 600) {
  const len = a.distanceTo(b);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(tracerGeo, mat);
  m.layers.set(LAYER_FX);
  const seg = Math.min(len, 6);
  m.scale.set(width, width, seg);
  m.position.copy(a);
  m.lookAt(b);
  scene.add(m);
  const dir = b.clone().sub(a).normalize();
  tracers.push({ m, a: a.clone(), dir, len, seg, d: 0, speed });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.d += t.speed * dt;
    if (t.d - t.seg >= t.len) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); continue; }
    const head = Math.min(t.d, t.len), tail = Math.max(0, t.d - t.seg);
    const mid = (head + tail) / 2;
    t.m.position.copy(t.a).addScaledVector(t.dir, mid);
    t.m.scale.z = Math.max(0.01, head - tail);
  }
}

// ---------------------------------------------------------------- decals
const decals = [];
let holeMat, scorchMat;
const decalGeo = new THREE.PlaneGeometry(1, 1);
const _v = new THREE.Vector3();
export function addDecal(point, normal, kind = 'hole', size = 0.14) {
  const m = new THREE.Mesh(decalGeo, kind === 'hole' ? holeMat : scorchMat);
  m.scale.setScalar(size);
  m.position.copy(point).addScaledVector(normal, 0.012 + Math.random() * 0.004);
  m.lookAt(_v.copy(m.position).add(normal));
  m.rotateZ(rand(0, Math.PI * 2));
  m.receiveShadow = true;
  scene.add(m);
  decals.push(m);
  if (decals.length > 220) scene.remove(decals.shift());
}
export function clearDecals() {
  for (const d of decals) scene.remove(d);
  decals.length = 0;
}

// ---------------------------------------------------------------- impact & blood
let chipMatConcrete, chipMatSand, chipMatMetal;
export function impactFx(point, normal, surface = 'concrete') {
  const up = new THREE.Vector3(0, 1, 0);
  if (surface === 'metal') {
    for (let i = 0; i < 8; i++) {
      const v = normal.clone().multiplyScalar(rand(3, 7)).add(new THREE.Vector3(rand(-3, 3), rand(0, 4), rand(-3, 3)));
      spawnParticle(point.clone(), v, { tex: TEX.soft, color: 0xffc070, size: 0.04, life: rand(0.15, 0.35), additive: true, grav: -12 });
    }
    spawnParticle(point.clone(), new THREE.Vector3(), { tex: TEX.flash, color: 0xffd090, size: 0.25, life: 0.05, additive: true, grav: 0 });
  } else {
    const col = surface === 'sand' ? 0xb8a27a : 0xa89e8e;
    for (let i = 0; i < 5; i++) {
      const v = normal.clone().multiplyScalar(rand(2, 5)).add(new THREE.Vector3(rand(-2, 2), rand(0, 3), rand(-2, 2)));
      spawnParticle(point.clone(), v, { mesh: true, material: surface === 'sand' ? chipMatSand : chipMatConcrete, size: rand(0.012, 0.03), life: rand(0.5, 0.9), grav: -14, spin: 10 });
    }
    spawnParticle(point.clone().addScaledVector(normal, 0.05), normal.clone().multiplyScalar(0.8).addScaledVector(up, 0.3), {
      tex: TEX.smoke, color: col, size: 0.45, life: rand(0.9, 1.4), opacity: 0.75, grav: 0.15, grow: 1.6, drag: 2,
    });
    spawnParticle(point.clone().addScaledVector(normal, 0.05), normal.clone().multiplyScalar(3), {
      tex: TEX.smoke, color: col, size: 0.2, life: 0.35, opacity: 0.9, grav: 0, grow: 3, drag: 6,
    });
  }
}
export function bloodFx(point, dir) {
  for (let i = 0; i < 3; i++) {
    spawnParticle(point.clone(), dir.clone().multiplyScalar(rand(0.5, 1.5)).add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.2, 0.5), rand(-0.4, 0.4))), {
      tex: TEX.smoke, color: 0x5a0a08, size: rand(0.25, 0.4), life: rand(0.35, 0.6), opacity: 0.8, grav: -1, grow: 1.5, drag: 3,
    });
  }
}

// ---------------------------------------------------------------- explosion
export function explosionFx(pos, big = 1) {
  const up = new THREE.Vector3(0, 1, 0);
  spawnParticle(pos.clone(), new THREE.Vector3(), { tex: TEX.flash, color: 0xffe0a0, size: 5 * big, life: 0.12, additive: true, grav: 0, fog: false });
  for (let i = 0; i < 10; i++) {
    spawnParticle(pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0, 0.8), rand(-0.5, 0.5))), new THREE.Vector3(rand(-4, 4), rand(2, 7), rand(-4, 4)), {
      tex: TEX.fire, color: 0xffffff, size: rand(1.4, 2.4) * big, life: rand(0.25, 0.5), additive: true, grav: 0, grow: 1.5, drag: 4,
    });
  }
  const dark = new THREE.Color(0x2a2622), light = new THREE.Color(0x8a8070);
  for (let i = 0; i < 16; i++) {
    spawnParticle(pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1))), new THREE.Vector3(rand(-5, 5), rand(1, 6), rand(-5, 5)), {
      tex: TEX.smoke, color: 0x3a342e, size: rand(2, 3.5) * big, life: rand(3, 6), opacity: 0.85, grav: 0.35, grow: 0.35, drag: 1.8, spin: rand(-0.3, 0.3), colorFade: [dark, light],
    });
  }
  for (let i = 0; i < 18; i++) {
    spawnParticle(pos.clone(), new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(rand(6, 12)).addScaledVector(up, rand(0.3, 1.5)), {
      tex: TEX.smoke, color: 0xb0a080, size: rand(0.8, 1.5), life: rand(1.2, 2.2), opacity: 0.6, grav: 0, grow: 1.2, drag: 3,
    });
  }
  for (let i = 0; i < 22; i++) {
    spawnParticle(pos.clone(), new THREE.Vector3(rand(-9, 9), rand(3, 13), rand(-9, 9)), { mesh: true, material: chipMatConcrete, size: rand(0.03, 0.09), life: rand(1, 2), grav: -18, spin: 12 });
  }
  for (let i = 0; i < 14; i++) {
    spawnParticle(pos.clone(), new THREE.Vector3(rand(-14, 14), rand(4, 16), rand(-14, 14)), { tex: TEX.soft, color: 0xffb060, size: 0.07, life: rand(0.4, 0.9), additive: true, grav: -12 });
  }
}

// ---------------------------------------------------------------- casings
const casings = [];
let brassMat, casingGeo, pistolCasingGeo, linkGeo;
export function spawnCasing(pos, vel, kind, groundY, onBounce) {
  const m = new THREE.Mesh(kind === 'pistol' ? pistolCasingGeo : casingGeo, brassMat);
  m.position.copy(pos);
  m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  m.castShadow = false;
  scene.add(m);
  casings.push({ m, vel, life: 6, groundY, bounced: 0, onBounce, spin: new THREE.Vector3(rand(-25, 25), rand(-25, 25), rand(-25, 25)) });
  if (casings.length > 60) { const c = casings.shift(); scene.remove(c.m); }
}
function updateCasings(dt) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.life -= dt;
    if (c.life <= 0) { scene.remove(c.m); casings.splice(i, 1); continue; }
    if (c.bounced > 3) continue;
    c.vel.y -= 14 * dt;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
    if (c.m.position.y < c.groundY + 0.01) {
      c.m.position.y = c.groundY + 0.01;
      if (c.bounced === 0 && c.onBounce) c.onBounce(c.m.position);
      c.vel.y = -c.vel.y * 0.35; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.4);
      c.bounced++;
      if (c.bounced > 3) { c.m.rotation.x = Math.PI / 2; c.m.rotation.z = 0; }
    }
  }
}

// ---------------------------------------------------------------- smoke plumes & fires (ambient)
const plumes = [];
export function addSmokePlume(pos, scale = 1, fire = false) {
  const p = { pos: pos.clone(), scale, fire, t: 0, parts: [] };
  const n = Math.round(26 * Math.min(scale, 1.4));
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: TEX.smoke, color: 0x2e2a26, transparent: true, depthWrite: false, opacity: 0, rotation: rand(0, 6) });
    const s = new THREE.Sprite(mat);
    s.layers.set(LAYER_FX);
    scene.add(s);
    p.parts.push({ s, age: (i / n) * 14, life: 14, spin: rand(-0.1, 0.1), off: new THREE.Vector2(rand(-1, 1), rand(-1, 1)) });
  }
  if (fire) {
    p.fires = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({ map: TEX.fire, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
      const s = new THREE.Sprite(mat);
      s.layers.set(LAYER_FX);
      scene.add(s);
      p.fires.push({ s, ph: rand(0, 6) });
    }
  }
  plumes.push(p);
}
const wind = new THREE.Vector2(1.6, 0.6);
function updatePlumes(dt, time) {
  for (const p of plumes) {
    for (const q of p.parts) {
      q.age += dt;
      if (q.age > q.life) { q.age -= q.life; q.off.set(rand(-1, 1), rand(-1, 1)); }
      const k = q.age / q.life;
      const h = k * 55 * p.scale;
      const spread = (0.8 + k * 9) * p.scale;
      q.s.position.set(p.pos.x + wind.x * k * 18 * p.scale + q.off.x * spread * 0.4, p.pos.y + h, p.pos.z + wind.y * k * 18 * p.scale + q.off.y * spread * 0.4);
      const size = (3 + k * 16) * p.scale;
      q.s.scale.set(size, size, 1);
      q.s.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.75;
      q.s.material.rotation += q.spin * dt;
      const shade = 0.16 + k * 0.28;
      q.s.material.color.setRGB(shade, shade * 0.95, shade * 0.9);
    }
    if (p.fires) {
      for (const f of p.fires) {
        const fl = 0.7 + Math.sin(time * 9 + f.ph) * 0.2 + Math.sin(time * 23 + f.ph * 2) * 0.1;
        f.s.position.set(p.pos.x + Math.sin(f.ph) * 0.8 * p.scale, p.pos.y + 0.6 * p.scale + fl * 0.5, p.pos.z + Math.cos(f.ph) * 0.8 * p.scale);
        const s = (1.4 + fl) * p.scale;
        f.s.scale.set(s, s * 1.4, 1);
        f.s.material.opacity = fl;
      }
    }
  }
}

// ---------------------------------------------------------------- floating dust
let dust = null;
const DUST_N = 500, DUST_R = 18;
function buildDust() {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i++) { arr[i * 3] = rand(-DUST_R, DUST_R); arr[i * 3 + 1] = rand(0, 10); arr[i * 3 + 2] = rand(-DUST_R, DUST_R); }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({ map: TEX.soft, color: 0xfff0d0, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.layers.set(LAYER_FX);
  dust.frustumCulled = false;
  scene.add(dust);
}
function updateDust(dt, camPos) {
  const a = dust.geometry.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    let x = a[i * 3] + wind.x * 0.15 * dt, y = a[i * 3 + 1] + Math.sin(i + performance.now() * 0.0003) * 0.05 * dt, z = a[i * 3 + 2] + wind.y * 0.15 * dt;
    if (x - camPos.x > DUST_R) x -= DUST_R * 2; else if (x - camPos.x < -DUST_R) x += DUST_R * 2;
    if (z - camPos.z > DUST_R) z -= DUST_R * 2; else if (z - camPos.z < -DUST_R) z += DUST_R * 2;
    a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
  }
  dust.geometry.attributes.position.needsUpdate = true;
}

export function initEffects(sc, pbr) {
  scene = sc;
  buildTextures();
  holeMat = new THREE.MeshStandardMaterial({ map: TEX.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1, metalness: 0 });
  scorchMat = new THREE.MeshStandardMaterial({ map: TEX.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1, metalness: 0 });
  chipMatConcrete = new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 1, metalness: 0, map: pbr.concrete_wall_008.map });
  chipMatSand = new THREE.MeshStandardMaterial({ color: 0xa89470, roughness: 1, metalness: 0 });
  chipMatMetal = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 1 });
  brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 });
  casingGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 6).rotateX(Math.PI / 2);
  pistolCasingGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.02, 6).rotateX(Math.PI / 2);
  linkGeo = casingGeo;
  buildDust();
}

export function updateEffects(dt, time, camPos) {
  updateParticles(dt);
  updateTracers(dt);
  updateCasings(dt);
  updatePlumes(dt, time);
  updateDust(dt, camPos);
}
