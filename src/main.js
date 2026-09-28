import * as THREE from 'three';
import { loadAssets, assets } from './assets.js';
import { createRenderer, createPipeline, QUALITY, LAYER_FX, LAYER_HITBOX } from './gfx.js';
import { initEffects, updateEffects, spawnParticle, spawnTracer, addDecal, clearDecals, impactFx, bloodFx, explosionFx, spawnCasing, TEX } from './effects.js';
import { buildWorld, world, HALF, colliders, mapRects, shafts, raycastWorld, hasLOS, inSunlight, resolveCollisions, groundHeightAt, buildNav, updateFlow, flowDir } from './world.js';
import { createCharacter } from './characters.js';
import { buildViewModel } from './viewmodels.js';
import * as SFX from './audio.js';

// ============================================================
//  DATA: weapons, classes, enemies
// ============================================================
const WEAPONS = {
  tavor: {
    name: 'IWI Tavor X95', caliber: '5.56×45mm NATO · bullpup', type: 'rifle', model: 'tavor',
    mag: 30, reserveMags: 6, chamber: true, rpm: 850, damage: 32, headMult: 2.4, range: 250,
    spread: 0.035, adsSpread: 0.003, bloomPerShot: 0.006, recoil: 0.011,
    reload: 2.3, reloadEmpty: 2.9, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.18, tracerEvery: 3,
    optic: 'Meprolight M21 reflex', sound: { cut: 3600, dur: 0.16, thump: 130, gain: 0.9 },
  },
  m4: {
    name: 'Colt M4A1 Carbine', caliber: '5.56×45mm NATO', type: 'rifle', model: 'm4',
    mag: 30, reserveMags: 6, chamber: true, rpm: 800, damage: 31, headMult: 2.4, range: 250,
    spread: 0.038, adsSpread: 0.0035, bloomPerShot: 0.006, recoil: 0.012,
    reload: 2.1, reloadEmpty: 2.7, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.17, tracerEvery: 3,
    optic: 'Meprolight M5 red dot', sound: { cut: 3800, dur: 0.15, thump: 140, gain: 0.9 },
  },
  negev: {
    name: 'IWI Negev NG7', caliber: '7.62×51mm NATO · belt-fed', type: 'lmg', model: 'negev',
    mag: 125, reserveMags: 2, chamber: false, rpm: 650, damage: 40, headMult: 2.2, range: 300,
    spread: 0.06, adsSpread: 0.011, bloomPerShot: 0.004, recoil: 0.014, moveMult: 0.9,
    reload: 5.2, reloadEmpty: 6.0, modes: ['AUTO', 'SEMI'], adsFov: 55, adsTime: 0.32, tracerEvery: 2,
    optic: 'Trijicon ACOG 4×', sound: { cut: 2600, dur: 0.22, thump: 90, gain: 1.05 },
  },
  m24: {
    name: 'M24 SWS', caliber: '7.62×51mm NATO · bolt-action', type: 'sniper', model: 'm24',
    mag: 5, reserveMags: 6, chamber: false, rpm: 48, damage: 140, headMult: 3, range: 800,
    spread: 0.09, adsSpread: 0.0, bloomPerShot: 0, recoil: 0.045, scope: true,
    reload: 3.4, reloadEmpty: 3.8, modes: ['BOLT'], adsFov: 14, adsTime: 0.3, tracerEvery: 0,
    optic: 'Leupold Mark 4 10× scope', sound: { cut: 2800, dur: 0.55, thump: 65, gain: 1.25 },
  },
  glock: {
    name: 'Glock 17', caliber: '9×19mm Parabellum', type: 'pistol', model: 'glock',
    mag: 17, reserveMags: 4, chamber: true, rpm: 420, damage: 25, headMult: 2, range: 50,
    spread: 0.03, adsSpread: 0.007, bloomPerShot: 0.012, recoil: 0.02,
    reload: 1.5, reloadEmpty: 1.9, modes: ['SEMI'], adsFov: 62, adsTime: 0.12, tracerEvery: 0,
    optic: 'Iron sights', sound: { cut: 4000, dur: 0.1, thump: 190, gain: 0.7 },
  },
  jericho: {
    name: 'IWI Jericho 941', caliber: '9×19mm Parabellum', type: 'pistol', model: 'jericho',
    mag: 16, reserveMags: 4, chamber: true, rpm: 380, damage: 27, headMult: 2, range: 50,
    spread: 0.028, adsSpread: 0.006, bloomPerShot: 0.012, recoil: 0.022,
    reload: 1.6, reloadEmpty: 2.0, modes: ['SEMI'], adsFov: 62, adsTime: 0.12, tracerEvery: 0,
    optic: 'Iron sights', sound: { cut: 3800, dur: 0.11, thump: 180, gain: 0.75 },
  },
};

const CLASSES = [
  {
    id: 'rifleman', name: 'RIFLEMAN', unit: 'Givati Brigade · 84th Infantry',
    desc: 'Balanced frontline infantry. Reliable bullpup rifle and full protection.',
    primary: 'tavor', secondary: 'glock', armor: 100, speed: 1.0, frags: 2, ifaks: 3,
    gear: ['Ceramic plate carrier (NIJ Level IV)', 'Rabintex RBH-303 ballistic helmet', 'Meprolight M21 reflex sight', '2× M67 frag grenades', '3× IFAK (Israeli bandage, CAT tourniquet)'],
    stats: { armor: 0.7, mobility: 0.6, firepower: 0.65 },
  },
  {
    id: 'assault', name: 'ASSAULT', unit: 'Egoz Commando Unit · 89th',
    desc: 'Fast-moving commando. Light armor, extra grenades for clearing rooms.',
    primary: 'm4', secondary: 'jericho', armor: 75, speed: 1.12, frags: 4, ifaks: 2,
    gear: ['Low-profile plate carrier (Level III+)', 'High-cut helmet w/ NVG shroud', 'Meprolight M5 red dot', '4× M67 frag grenades', '2× IFAK'],
    stats: { armor: 0.5, mobility: 0.9, firepower: 0.6 },
  },
  {
    id: 'support', name: 'MACHINE GUNNER', unit: 'Golani Brigade · 1st Infantry',
    desc: 'Heavy weapons. Suppress with 125-round belts. Slow but durable.',
    primary: 'negev', secondary: 'glock', armor: 130, speed: 0.88, frags: 1, ifaks: 3,
    gear: ['Heavy plate carrier w/ side plates', 'Rabintex RBH-303 ballistic helmet', 'Trijicon ACOG 4× optic', '1× M67 frag grenade', '3× IFAK', '125-rd belt pouches'],
    stats: { armor: 0.95, mobility: 0.35, firepower: 0.95 },
  },
  {
    id: 'marksman', name: 'MARKSMAN', unit: 'Paratroopers Brigade · 35th',
    desc: 'Long-range precision. One-shot kills, but vulnerable up close.',
    primary: 'm24', secondary: 'jericho', armor: 60, speed: 1.0, frags: 1, ifaks: 2,
    gear: ['Light plate carrier (Level III)', 'Rabintex RBH-303 ballistic helmet', 'Leupold Mark 4 10× scope', 'Laser rangefinder', '1× M67 frag grenade', '2× IFAK'],
    stats: { armor: 0.4, mobility: 0.6, firepower: 0.8 },
  },
];

const ENEMY_TYPES = {
  hamas: {
    name: 'Hamas militant', weapon: 'AKM', hp: 100, speed: 3.6, range: 75, prefer: 22,
    dmg: 8, burst: [3, 5], burstGap: 0.12, pause: [0.9, 1.8], acc: 0.3, react: 0.75, gun: 'ak',
    sound: { cut: 2100, dur: 0.2, thump: 110, gain: 0.85 },
  },
  pij: {
    name: 'PIJ militant', weapon: 'AK-47', hp: 100, speed: 3.9, range: 70, prefer: 18,
    dmg: 8, burst: [4, 6], burstGap: 0.11, pause: [0.8, 1.6], acc: 0.27, react: 0.7, gun: 'ak',
    sound: { cut: 2000, dur: 0.2, thump: 105, gain: 0.85 },
  },
  rpg: {
    name: 'Hamas RPG gunner', weapon: 'RPG-7', hp: 110, speed: 3.1, range: 85, prefer: 45,
    rocket: true, rocketCd: 6, react: 1.1, gun: 'rpg',
  },
  sniper: {
    name: 'Hamas sniper', weapon: 'Al-Ghoul rifle', hp: 80, speed: 3.0, range: 160, prefer: 999,
    sniper: true, dmg: 48, aimTime: 1.5, cooldown: 3.5, react: 0.4, gun: 'sniper',
    sound: { cut: 2400, dur: 0.45, thump: 70, gain: 1.05 },
  },
};

// ============================================================
//  UTIL
// ============================================================
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
const $ = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const tmpV = V(), tmpV2 = V();

// ============================================================
//  RENDERER / SCENES / LIGHTS
// ============================================================
const renderer = createRenderer();
const canvas = renderer.domElement;
const scene = new THREE.Scene();

const BASE_FOV = 75;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 1500);
camera.rotation.order = 'YXZ';
camera.layers.enable(LAYER_FX);
scene.add(camera);

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
const vmSun = new THREE.DirectionalLight(0xfff0dc, 3);
vmScene.add(vmSun);
const vmFill = new THREE.DirectionalLight(0xb8c8e0, 0.25);
vmFill.position.set(-1, 0.3, 1);
vmScene.add(vmFill);
const vmFlash = new THREE.PointLight(0xffb060, 0, 1.5, 2);
vmScene.add(vmFlash);
const vmRoot = new THREE.Group();
vmScene.add(vmRoot);

const sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
sun.castShadow = true;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
// Warm sand bounce light — the environment map alone under-lights shaded streets.
const bounce = new THREE.HemisphereLight(0xc8d8f0, 0xb89a74, 0.55);
scene.add(bounce);

const muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2);
const explLight = new THREE.PointLight(0xffa050, 0, 40, 2);
const enemyLights = [new THREE.PointLight(0xffa860, 0, 12, 2), new THREE.PointLight(0xffa860, 0, 12, 2)];
scene.add(muzzleLight, explLight, ...enemyLights);
let enemyLightI = 0;

let qualityId = localStorage.getItem('idf-quality') || 'high';
if (!QUALITY[qualityId]) qualityId = 'high';
let pipe = null;
function applyQuality(id) {
  qualityId = id;
  localStorage.setItem('idf-quality', id);
  const q = QUALITY[id];
  if (pipe) pipe.dispose();
  pipe = createPipeline(renderer, scene, camera, vmScene, vmCamera, q);
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  const R = q.shadowRange;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  document.querySelectorAll('#quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === id));
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
  if (pipe) pipe.resize();
});

// Keep the shadow frustum centred on the player, snapped to shadow-map texels to avoid shimmering.
const lightQ = new THREE.Quaternion(), lightQInv = new THREE.Quaternion();
function setupSun() {
  const m = new THREE.Matrix4().lookAt(assets.sunDir, V(), UP);
  lightQ.setFromRotationMatrix(m);
  lightQInv.copy(lightQ).invert();
}
function updateSun(center) {
  const q = QUALITY[qualityId];
  const texel = (q.shadowRange * 2) / q.shadow;
  const p = tmpV.copy(center).applyQuaternion(lightQInv);
  p.x = Math.round(p.x / texel) * texel;
  p.y = Math.round(p.y / texel) * texel;
  p.applyQuaternion(lightQ);
  sun.target.position.copy(p);
  sun.position.copy(p).addScaledVector(assets.sunDir, 200);
  sun.target.updateMatrixWorld();
}

// ============================================================
//  GAME STATE
// ============================================================
const player = {
  pos: V(), vel: V(), vy: 0, onGround: true,
  yaw: 0, pitch: 0, recoilP: 0, hp: 100, armor: 100, armorMax: 100, ifaks: 3, frags: 2,
  crouch: false, eye: 1.65, sprinting: false, cls: null, weapons: [], cur: 0,
  kills: 0, headshots: 0, score: 0, shots: 0, hits: 0,
};
const S = {
  state: 'loading', wave: 0, toSpawn: 0, spawnT: 0, intermission: 0, alive: 0,
  reloading: false, reloadT: 0, reloadDur: 0, switchT: 0, ifakT: 0, fireCD: 0, boltT: 0,
  adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, bobT: 0, shake: 0, sprintT: 0,
  breath: 4, swayT: 0, flashT: 0, hurtT: 0, flowT: 0, time: 0, msgT: 0, triggerFresh: false,
  supp: 0, flashW: 0, landDip: 0, airVy: 0, lastStep: 0, punchP: 0, punchY: 0, beatT: 0, sunT: 0, inSun: 1,
};
const keys = {};
const mouse = { left: false, right: false };
const vmSway = V();
let mouseDX = 0, mouseDY = 0;

const enemies = [], grenades = [], rockets = [], pickups = [];
let enemyHitMeshes = [];

const curW = () => player.weapons[player.cur];
function makeWeapon(id) {
  const def = WEAPONS[id];
  return { id, def, mag: def.mag + (def.chamber ? 1 : 0), reserve: def.mag * def.reserveMags, mode: 0, shotN: 0, model: buildViewModel(def.model, vmRoot) };
}

// ============================================================
//  ENEMIES
// ============================================================
let glintMat = null;
function pickEnemyType() {
  const w = S.wave;
  const pool = [['hamas', 50], ['pij', 30]];
  if (w >= 2) pool.push(['rpg', 8 + w * 1.5]);
  if (w >= 3) pool.push(['sniper', 5 + w]);
  const total = pool.reduce((a, p) => a + p[1], 0);
  let r = Math.random() * total;
  for (const [id, wt] of pool) { r -= wt; if (r <= 0) return id; }
  return 'hamas';
}

function spawnEnemy() {
  const typeId = pickEnemyType();
  const t = ENEMY_TYPES[typeId];
  let cand = shafts.filter((s) => s.distanceTo(player.pos) > 45);
  if (!cand.length) cand = shafts.slice().sort((a, b) => b.distanceTo(player.pos) - a.distanceTo(player.pos)).slice(0, 2);
  const s = cand[randInt(0, cand.length - 1)];
  const ch = createCharacter(typeId, t.gun);
  const e = {
    t, typeId, ch, hp: t.hp * (1 + (S.wave - 1) * 0.03),
    pos: V(s.x + rand(-0.3, 0.3), s.y, s.z + rand(-0.3, 0.3)),
    rot: rand(0, Math.PI * 2), emerge: 1.4, dead: false, deathT: 0, removeT: 12, fallDir: 1,
    losT: rand(0, 0.3), vis: false, seen: false, reactT: 0, fireT: 0, burstLeft: 0,
    aimT: 0, strafeDir: 0, strafeT: 0, flinch: 0, moving: false, speed: 0, glint: null,
  };
  ch.root.rotation.order = 'YXZ';
  ch.root.position.set(e.pos.x, s.y - 1.9, e.pos.z);
  ch.root.rotation.y = e.rot;
  for (const m of ch.hit) m.userData.enemy = e;
  if (t.sniper) {
    if (!glintMat) glintMat = new THREE.SpriteMaterial({ map: TEX.flash, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    e.glint = new THREE.Sprite(glintMat.clone());
    e.glint.position.set(0, 0.12, 0.3);
    e.glint.scale.set(1.2, 1.2, 1);
    e.glint.layers.set(LAYER_FX);
    e.glint.visible = false;
    ch.gunPivot.add(e.glint);
  }
  scene.add(ch.root);
  enemies.push(e);
  S.alive++;
  rebuildHitList();
}
function rebuildHitList() {
  enemyHitMeshes = [];
  for (const e of enemies) if (!e.dead) enemyHitMeshes.push(...e.ch.hit);
}
function removeEnemy(e) {
  scene.remove(e.ch.root);
  e.ch.dispose();
  enemies.splice(enemies.indexOf(e), 1);
}

const eEye = V(), pEye = V(), moveDir = V(), muzzleW = V();
function updateEnemy(e, dt) {
  const ch = e.ch, root = ch.root;
  if (e.dead) {
    e.deathT += dt;
    const p = Math.min(1, e.deathT / 0.75);
    root.rotation.x = -p * p * 1.5 * e.fallDir;
    root.rotation.z = p * p * e.fallRoll;
    root.position.y = e.pos.y - p * 0.05;
    ch.update(dt, 0, 0, false);
    e.removeT -= dt;
    if (e.removeT <= 0) removeEnemy(e);
    return;
  }
  if (e.emerge > 0) {
    e.emerge -= dt;
    root.position.set(e.pos.x, e.pos.y - 1.9 * Math.max(0, e.emerge / 1.4), e.pos.z);
    root.rotation.y = e.rot;
    ch.update(dt, 1.2, 0, false);
    return;
  }
  const t = e.t;
  eEye.set(e.pos.x, e.pos.y + 1.6, e.pos.z);
  pEye.set(player.pos.x, player.pos.y + player.eye - 0.15, player.pos.z);
  const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);

  e.losT -= dt;
  if (e.losT <= 0) {
    e.losT = rand(0.18, 0.3);
    const vis = S.state === 'playing' && dist < t.range && hasLOS(eEye, pEye);
    if (vis && !e.seen) { e.seen = true; e.reactT = t.react * rand(0.7, 1.3); e.burstLeft = 0; e.fireT = 0; }
    if (!vis) { e.seen = false; e.aimT = Math.min(e.aimT, 0); }
    e.vis = vis;
  }

  let wantMove = true, speedMul = 1;
  moveDir.set(0, 0, 0);
  if (e.vis) {
    if (t.sniper || (t.rocket && dist < t.prefer + 15)) wantMove = false;
    else if (dist < t.prefer) {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = rand(1, 2.5); e.strafeDir = [-1, 0, 1][randInt(0, 2)]; }
      if (e.strafeDir) {
        const f = Math.atan2(dx, dz);
        moveDir.set(Math.cos(f) * e.strafeDir, 0, -Math.sin(f) * e.strafeDir);
        speedMul = 0.45;
      } else wantMove = false;
    } else speedMul = 0.5;
  }
  if (S.state !== 'playing') wantMove = false;
  if (wantMove && moveDir.lengthSq() === 0) {
    if (!flowDir(e.pos.x, e.pos.z, moveDir)) moveDir.set(dx, 0, dz).normalize();
  }
  e.moving = wantMove && moveDir.lengthSq() > 0;
  if (e.flinch > 0) { e.flinch -= dt; speedMul *= 0.3; }
  let sp = 0;
  if (e.moving) {
    sp = t.speed * speedMul;
    e.pos.x += moveDir.x * sp * dt;
    e.pos.z += moveDir.z * sp * dt;
    resolveCollisions(e.pos, 0.38, e.pos.y);
  }
  e.speed = lerp(e.speed, sp, Math.min(1, dt * 8));
  const gh = groundHeightAt(e.pos.x, e.pos.z, e.pos.y, 0.15);
  e.pos.y = approach(e.pos.y, gh, dt * 3);

  const targetRot = e.vis ? Math.atan2(dx, dz) : e.moving ? Math.atan2(moveDir.x, moveDir.z) : e.rot;
  let dr = targetRot - e.rot;
  while (dr > Math.PI) dr -= Math.PI * 2;
  while (dr < -Math.PI) dr += Math.PI * 2;
  e.rot += dr * Math.min(1, dt * 7);
  root.position.set(e.pos.x, e.pos.y, e.pos.z);
  root.rotation.y = e.rot;

  const engaged = e.vis && e.seen;
  const aimPitch = Math.atan2(pEye.y - (e.pos.y + 1.4), Math.max(dist, 0.5));
  ch.update(dt, e.speed, aimPitch, engaged);

  if (engaged) {
    e.reactT -= dt;
    if (e.reactT <= 0) enemyAttack(e, dt, dist);
  } else if (e.glint) e.glint.visible = false;
}

function enemyAttack(e, dt, dist) {
  const t = e.t;
  if (t.sniper) {
    e.aimT += dt;
    e.glint.visible = e.aimT > 0;
    if (e.glint.visible) {
      const k = 0.6 + Math.sin(S.time * 25) * 0.4;
      e.glint.material.opacity = k;
      const s = 0.6 + dist * 0.02;
      e.glint.scale.set(s, s, 1);
    }
    if (e.aimT >= t.aimTime) {
      e.aimT = -t.cooldown;
      const sp = Math.hypot(player.vel.x, player.vel.z);
      const chance = 0.72 * (sp > 1 ? 0.5 : 1) * (player.crouch ? 0.85 : 1);
      enemyShot(e, dist, Math.random() < chance, t.dmg);
    }
    return;
  }
  if (t.rocket) {
    e.fireT -= dt;
    if (e.fireT <= 0) { e.fireT = t.rocketCd * rand(0.8, 1.2); launchRocket(e, dist); }
    return;
  }
  e.fireT -= dt;
  if (e.fireT > 0) return;
  if (e.burstLeft <= 0) { e.burstLeft = randInt(t.burst[0], t.burst[1]); e.fireT = rand(t.pause[0], t.pause[1]); return; }
  e.burstLeft--;
  e.fireT = t.burstGap;
  const sp = Math.hypot(player.vel.x, player.vel.z);
  let chance = t.acc * (1 - Math.min(dist / t.range, 1) * 0.6) * (sp > 1 ? 0.65 : 1) * (player.crouch ? 0.75 : 1) * (1 + (S.wave - 1) * 0.04);
  if (player.sprinting) chance *= 0.8;
  enemyShot(e, dist, Math.random() < Math.min(chance, 0.75), t.dmg * rand(0.8, 1.25));
}

function enemyMuzzleFlash(from) {
  spawnParticle(from.clone(), V(), { tex: TEX.flash, color: 0xffd090, size: rand(0.5, 0.8), life: 0.05, additive: true, grav: 0 });
  spawnParticle(from.clone(), V(rand(-0.2, 0.2), 0.4, rand(-0.2, 0.2)), { tex: TEX.smoke, color: 0xb8b0a0, size: 0.4, life: 0.8, opacity: 0.35, grav: 0.2, grow: 1.5, drag: 2 });
  const l = enemyLights[enemyLightI++ % enemyLights.length];
  l.position.copy(from);
  l.intensity = 30;
  l.userData.t = 0.05;
}

function enemyShot(e, dist, hit, dmg) {
  const from = e.ch.muzzle.getWorldPosition(V());
  const eye = V(player.pos.x, player.pos.y + player.eye - 0.1, player.pos.z);
  const target = V(player.pos.x, player.pos.y + player.eye - 0.35, player.pos.z);
  if (!hit) {
    target.x += rand(-1.3, 1.3); target.y += rand(-0.7, 1.0); target.z += rand(-1.3, 1.3);
    const dir = target.clone().sub(from).normalize();
    const w = eye.clone().sub(from);
    const along = w.dot(dir);
    const miss = w.addScaledVector(dir, -along).length();
    const wh = raycastWorld(from, dir, dist * 2 + 30);
    const end = wh ? wh.point : from.clone().addScaledVector(dir, dist * 2 + 30);
    if (wh) {
      impactFx(wh.point, wh.normal, wh.surf);
      if (wh.point.distanceTo(player.pos) < 12) { addDecal(wh.point, wh.normal); SFX.playImpact(wh.point, wh.surf); }
    }
    if (Math.random() < 0.45) spawnTracer(from, end, 0xff9050, 0.02, 380);
    if (along > 0 && miss < 3 && (!wh || wh.t > along)) {
      S.supp = Math.min(1, S.supp + 0.22 * (1 - miss / 3));
      const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      SFX.playWhiz(clamp((target.x - eye.x) * rx + (target.z - eye.z) * rz, -1, 1) * 0.8);
    }
  } else {
    if (Math.random() < 0.45) spawnTracer(from, target, 0xff9050, 0.02, 380);
    damagePlayer(dmg, e.pos);
  }
  SFX.playShot(e.t.sound, from);
  enemyMuzzleFlash(from);
}

let rocketMats = null;
function launchRocket(e, dist) {
  const from = e.ch.muzzle.getWorldPosition(V());
  const lead = Math.min(dist / 32, 2) * 0.5;
  const target = V(player.pos.x + player.vel.x * lead + rand(-1.5, 1.5), player.pos.y + 1.0 + rand(-0.5, 0.5), player.pos.z + player.vel.z * lead + rand(-1.5, 1.5));
  const vel = target.sub(from).normalize().multiplyScalar(34);
  if (!rocketMats) rocketMats = {
    body: new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.6, metalness: 0.2 }),
    glow: new THREE.SpriteMaterial({ map: TEX.flash, color: 0xffc080, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
  };
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10).rotateX(Math.PI / 2), rocketMats.body);
  const war = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 12).rotateX(Math.PI / 2), rocketMats.body);
  war.position.z = 0.38;
  const glow = new THREE.Sprite(rocketMats.glow);
  glow.scale.set(1.2, 1.2, 1);
  glow.position.z = -0.35;
  glow.layers.set(LAYER_FX);
  m.add(body, war, glow);
  m.position.copy(from);
  m.lookAt(from.clone().add(vel));
  scene.add(m);
  rockets.push({ m, vel, life: 5 });
  SFX.playRocketLaunch(from);
  for (let i = 0; i < 10; i++) {
    spawnParticle(from.clone(), V(rand(-1.5, 1.5), rand(0, 1), rand(-1.5, 1.5)).addScaledVector(vel, -0.06), { tex: TEX.smoke, color: 0xd0c8b8, size: rand(0.8, 1.4), life: rand(1.5, 2.5), opacity: 0.6, grav: 0.3, grow: 1, drag: 2 });
  }
  enemyMuzzleFlash(from);
}

function damageEnemy(e, dmg, point, dir, headshot) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flinch = 0.25;
  if (!e.vis) { e.seen = true; e.vis = true; e.reactT = 0.35; }
  if (point) { bloodFx(point, dir); SFX.playFlesh(point); }
  if (e.hp <= 0) killEnemy(e, headshot, false, dir);
}
function killEnemy(e, headshot, byNade, dir) {
  e.dead = true;
  S.alive--;
  player.kills++;
  player.score += 100 + (headshot ? 50 : 0) + (byNade ? 25 : 0);
  if (headshot) player.headshots++;
  if (e.glint) e.glint.visible = false;
  const fx = Math.sin(e.rot), fz = Math.cos(e.rot);
  e.fallDir = dir && dir.x * fx + dir.z * fz > 0 ? 1 : -1;
  e.fallRoll = rand(-0.3, 0.3);
  e.ch.die();
  rebuildHitList();
  addKillfeed(e, headshot, byNade);
  const r = Math.random();
  if (r < 0.35) spawnPickup('ammo', e.pos);
  else if (r < 0.47) spawnPickup('ifak', e.pos);
  else if (r < 0.57) spawnPickup('plate', e.pos);
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.life -= dt;
    const prev = r.m.position.clone();
    r.m.position.addScaledVector(r.vel, dt);
    for (let k = 0; k < 2; k++) {
      spawnParticle(prev.clone().lerp(r.m.position, k / 2), V(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3)), { tex: TEX.smoke, color: 0xd8d0c0, size: rand(0.4, 0.7), life: rand(1.2, 2), opacity: 0.55, grav: 0.2, grow: 1.4, drag: 1 });
    }
    const dir = r.vel.clone().normalize();
    const wh = raycastWorld(prev, dir, r.vel.length() * dt);
    const pp = V(player.pos.x, player.pos.y + 1, player.pos.z);
    const near = r.m.position.distanceTo(pp) < 1.1;
    const toP = pp.clone().sub(r.m.position);
    if (toP.length() < 5 && toP.dot(dir) < 0 && !r.whiz) { r.whiz = true; SFX.playWhiz(0); S.supp = Math.min(1, S.supp + 0.4); }
    if (wh || near || r.life <= 0) {
      const at = wh ? wh.point.addScaledVector(wh.normal, 0.15) : r.m.position.clone();
      explode(at, 6.5, 85, false, wh ? wh.normal : UP, wh ? wh.point : null);
      scene.remove(r.m);
      rockets.splice(i, 1);
    }
  }
}

// ============================================================
//  GRENADES & EXPLOSIONS
// ============================================================
let nadeMats = null;
function throwGrenade() {
  if (player.frags <= 0 || S.nadeCD > 0 || S.reloading || S.ifakT > 0 || S.switchT > 0) return;
  player.frags--;
  S.nadeCD = 1.0;
  S.switchT = 0.45;
  const dir = V(0, 0, -1).applyQuaternion(camera.quaternion);
  const pos = camera.position.clone().addScaledVector(dir, 0.6);
  const vel = dir.multiplyScalar(17).add(V(0, 3.5, 0)).add(player.vel);
  if (!nadeMats) nadeMats = {
    body: new THREE.MeshStandardMaterial({ color: 0x3e4630, roughness: 0.55, metalness: 0.3 }),
    spoon: new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.35, metalness: 1 }),
  };
  const m = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), nadeMats.body); b.scale.y = 1.15;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.03, 8), nadeMats.spoon); fuse.position.y = 0.04;
  m.add(b, fuse);
  m.children.forEach((c) => (c.castShadow = true));
  m.position.copy(pos);
  scene.add(m);
  grenades.push({ m, pos, vel, fuse: 3.0 });
  SFX.playPin();
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const gr = grenades[i];
    gr.fuse -= dt;
    gr.vel.y -= 20 * dt;
    const prev = gr.pos.clone();
    const next = gr.pos.clone().addScaledVector(gr.vel, dt);
    let bounced = false;
    if (next.y < 0.04) {
      next.y = 0.04;
      if (gr.vel.y < -1.5) bounced = true;
      gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6;
    }
    for (const c of colliders) {
      if (next.x > c.minX && next.x < c.maxX && next.z > c.minZ && next.z < c.maxZ && next.y < c.top && next.y > c.bottom) {
        if (prev.y >= c.top) { next.y = c.top + 0.04; if (gr.vel.y < -1.5) bounced = true; gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6; }
        else if (prev.x <= c.minX || prev.x >= c.maxX) { next.x = prev.x; gr.vel.x = -gr.vel.x * 0.4; bounced = true; }
        else { next.z = prev.z; gr.vel.z = -gr.vel.z * 0.4; bounced = true; }
      }
    }
    if (bounced) SFX.playImpact(next, 'metal');
    gr.pos.copy(next);
    gr.m.position.copy(next);
    gr.m.rotation.x += gr.vel.length() * dt * 3;
    if (gr.fuse <= 0) {
      explode(gr.pos.clone().add(V(0, 0.2, 0)), 9, 210, true, UP, V(gr.pos.x, groundHeightAt(gr.pos.x, gr.pos.z, gr.pos.y + 0.1, 0), gr.pos.z));
      scene.remove(gr.m);
      grenades.splice(i, 1);
    }
  }
}
function explode(pos, radius, maxDmg, byPlayer, normal, surfPoint) {
  const dist = pos.distanceTo(camera.position);
  SFX.playExplosion(pos, 1);
  SFX.concuss(clamp(1.25 - dist / 14, 0, 1));
  S.shake = Math.max(S.shake, clamp(1.3 - dist / 30, 0, 1));
  S.flashW = Math.max(S.flashW, clamp(0.3 - dist / 50, 0, 0.3));
  S.supp = Math.min(1, S.supp + clamp(1 - dist / 25, 0, 1));
  explLight.position.copy(pos).addScaledVector(normal, 0.5);
  explLight.intensity = 900;
  S.explT = 0.25;
  explosionFx(pos, 1);
  if (surfPoint) addDecal(surfPoint, normal, 'scorch', 4.5);

  for (const e of enemies) {
    if (e.dead) continue;
    const c = V(e.pos.x, e.pos.y + 1.0, e.pos.z);
    const d = c.distanceTo(pos);
    if (d < radius && hasLOS(pos, c)) {
      const dmg = maxDmg * (1 - d / radius);
      if (byPlayer) showHitmarker(e.hp - dmg <= 0);
      e.hp -= dmg; e.flinch = 0.5;
      if (e.hp <= 0) killEnemy(e, false, byPlayer, c.clone().sub(pos).normalize());
    }
  }
  const pc = V(player.pos.x, player.pos.y + 1, player.pos.z);
  const pd = pc.distanceTo(pos);
  if (pd < radius && hasLOS(pos, pc)) damagePlayer(maxDmg * (byPlayer ? 0.6 : 1) * (1 - pd / radius), pos, true);
}

// ============================================================
//  PICKUPS
// ============================================================
let pickMats = null;
function spawnPickup(type, at) {
  if (!pickMats) {
    const fab = assets.tex.hessian_230.normalMap;
    pickMats = {
      od: new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.85, normalMap: fab }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xd4b000, roughness: 0.6 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.8, normalMap: fab }),
      red: new THREE.MeshStandardMaterial({ color: 0xc01818, roughness: 0.6 }),
      plate: new THREE.MeshStandardMaterial({ color: 0x2d3440, roughness: 0.7 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x6ea8ff, roughness: 0.5, emissive: 0x1a3060 }),
    };
  }
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; return me; };
  const g = new THREE.Group();
  if (type === 'ammo') { g.add(box(0.5, 0.3, 0.3, pickMats.od), box(0.52, 0.06, 0.32, pickMats.yellow, 0, 0.08, 0)); }
  else if (type === 'ifak') { g.add(box(0.4, 0.25, 0.2, pickMats.white), box(0.26, 0.07, 0.21, pickMats.red), box(0.07, 0.19, 0.21, pickMats.red)); }
  else { g.add(box(0.3, 0.38, 0.05, pickMats.plate), box(0.31, 0.08, 0.06, pickMats.blue, 0, 0.1, 0)); }
  const gy = groundHeightAt(at.x, at.z, at.y + 0.3, 0);
  g.position.set(at.x + rand(-0.4, 0.4), gy + 0.35, at.z + rand(-0.4, 0.4));
  g.userData.gy = gy;
  scene.add(g);
  pickups.push({ g, type, life: 45, t: rand(0, 6) });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.t += dt;
    p.g.rotation.y += dt * 1.5;
    p.g.position.y = p.g.userData.gy + 0.4 + Math.sin(p.t * 3) * 0.08;
    const d = Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z);
    let taken = false;
    if (d < 1.5 && Math.abs(player.pos.y - p.g.userData.gy) < 2) {
      if (p.type === 'ammo') {
        for (const w of player.weapons) w.reserve = Math.min(w.reserve + w.def.mag * (w.def.type === 'lmg' ? 1 : 2), w.def.mag * w.def.reserveMags * 1.5);
        flashMsg('+ AMMO', 1); taken = true;
      } else if (p.type === 'ifak' && player.ifaks < 5) {
        player.ifaks++; flashMsg('+ IFAK', 1); taken = true;
      } else if (p.type === 'plate' && player.armor < player.armorMax) {
        player.armor = Math.min(player.armorMax, player.armor + 50); flashMsg('+ CERAMIC PLATE', 1); taken = true;
      }
      if (taken) { SFX.playGear(); SFX.playClick(0, 1200, 0.2); }
    }
    if (taken || p.life <= 0) { scene.remove(p.g); pickups.splice(i, 1); }
  }
}

// ============================================================
//  PLAYER COMBAT
// ============================================================
function currentSpread() {
  const d = curW().def;
  let s = lerp(d.spread, d.adsSpread, S.adsT);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  s *= 1 + (sp / 5) * 1.5 * (1 - S.adsT * 0.6);
  s += (sp / 5) * 0.015 * S.adsT;
  if (!player.onGround) s = s * 2.5 + 0.02;
  if (player.crouch) s *= 0.7;
  s += S.bloom * (1 - S.adsT * 0.5);
  return s;
}
const raycaster = new THREE.Raycaster();
raycaster.layers.set(LAYER_HITBOX);

function vmToWorld(m, local, out) {
  out.copy(local);
  m.group.localToWorld(out);
  return camera.localToWorld(out);
}

function fireRay(w, spread) {
  const def = w.def, q = camera.quaternion;
  const dir = V(0, 0, -1).applyQuaternion(q);
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  dir.addScaledVector(V(1, 0, 0).applyQuaternion(q), Math.cos(a) * r);
  dir.addScaledVector(V(0, 1, 0).applyQuaternion(q), Math.sin(a) * r);
  dir.normalize();
  const origin = camera.position.clone();
  const maxD = 800;
  const wh = raycastWorld(origin, dir, maxD);
  raycaster.set(origin, dir);
  raycaster.far = wh ? wh.t : maxD;
  const hits = raycaster.intersectObjects(enemyHitMeshes, false);
  let end;
  if (hits.length) {
    const h = hits[0];
    const e = h.object.userData.enemy;
    const part = h.object.userData.part;
    const head = part === 'head';
    let dmg = def.damage * (head ? def.headMult : part === 'legs' ? 0.75 : 1);
    if (h.distance > def.range) dmg *= 0.75;
    player.hits++;
    const willKill = e.hp - dmg <= 0;
    damageEnemy(e, dmg, h.point, dir.clone(), head);
    showHitmarker(willKill, head);
    end = h.point;
  } else if (wh) {
    impactFx(wh.point, wh.normal, wh.surf);
    addDecal(wh.point, wh.normal);
    SFX.playImpact(wh.point, wh.surf);
    end = wh.point;
  } else end = origin.clone().addScaledVector(dir, maxD);

  w.shotN++;
  if (def.tracerEvery && w.shotN % def.tracerEvery === 0) {
    const mz = vmToWorld(w.model, w.model.muzzle, V());
    spawnTracer(mz, end, 0xffc880, 0.018, 700);
  }
}

function ejectCasing(w) {
  const m = w.model, d = w.def;
  const port = vmToWorld(m, tmpV2.set(0.03, d.type === 'pistol' ? 0.035 : 0.04, m.eject), V());
  const right = V(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = V(0, 1, 0).applyQuaternion(camera.quaternion);
  const fwd = V(0, 0, -1).applyQuaternion(camera.quaternion);
  const vel = right.multiplyScalar(rand(2, 3.2)).addScaledVector(up, rand(1.5, 2.6)).addScaledVector(fwd, rand(-0.6, 0.3)).add(player.vel);
  if (d.type === 'lmg') vel.set(rand(-0.5, 0.5), -1, rand(-0.5, 0.5)).add(player.vel);
  spawnCasing(port, vel, d.type === 'pistol' ? 'pistol' : 'rifle', player.pos.y, (p) => SFX.playCasing(p, d.type === 'pistol'));
}

function tryFire() {
  const w = curW(), d = w.def;
  if (S.switchT > 0 || S.reloading || S.ifakT > 0 || player.sprinting || S.fireCD > 0 || S.boltT > 0) return;
  const mode = d.modes[w.mode];
  if (mode !== 'AUTO' && !S.triggerFresh) return;
  if (w.mag <= 0) {
    if (S.triggerFresh) { SFX.playClick(0, 2200, 0.2); S.triggerFresh = false; startReload(); }
    return;
  }
  S.triggerFresh = false;
  w.mag--;
  player.shots++;
  S.fireCD = 60 / d.rpm;
  if (mode === 'BOLT') { S.boltT = 1.15; SFX.playBolt(0.4); setTimeout(() => { if (curW() === w) ejectCasing(w); }, 600); }
  fireRay(w, currentSpread());
  const rm = (S.adsT > 0.5 ? 0.7 : 1) * (player.crouch ? 0.8 : 1);
  player.recoilP += d.recoil * rm * rand(0.8, 1.2);
  player.pitch += d.recoil * 0.3 * rm;
  player.yaw += (Math.random() - 0.5) * d.recoil * 0.7 * rm;
  S.bloom = Math.min(S.bloom + d.bloomPerShot, 0.08);
  S.kick = 1;
  S.flashT = 0.045;
  const f = w.model.flash;
  f.visible = true;
  f.rotation.z = Math.random() * Math.PI;
  f.scale.setScalar(rand(0.75, 1.25));
  vmToWorld(w.model, w.model.muzzle, muzzleLight.position);
  muzzleLight.intensity = d.type === 'pistol' ? 25 : 45;
  vmFlash.position.copy(w.model.muzzle).applyMatrix4(w.model.group.matrix);
  vmFlash.intensity = 1.2;
  spawnParticle(muzzleLight.position.clone(), V(rand(-0.2, 0.2), 0.3, rand(-0.2, 0.2)), { tex: TEX.smoke, color: 0xc8c0b0, size: 0.25, life: 0.9, opacity: 0.22, grav: 0.3, grow: 1.8, drag: 2 });
  if (mode !== 'BOLT') ejectCasing(w);
  SFX.playShot(d.sound, null);
}

function startReload() {
  const w = curW(), d = w.def;
  if (S.reloading || S.switchT > 0 || S.ifakT > 0) return;
  const cap = d.mag + (d.chamber && w.mag > 0 ? 1 : 0);
  if (w.mag >= cap) return;
  if (w.reserve <= 0) { flashMsg('NO RESERVE AMMO', 1.2); return; }
  S.reloading = true;
  S.reloadT = 0;
  const empty = w.mag === 0;
  S.reloadDur = empty ? d.reloadEmpty : d.reload;
  S.adsT = Math.min(S.adsT, 0.3);
  SFX.playGear();
  SFX.playMagOut(S.reloadDur * 0.2);
  SFX.playMagIn(S.reloadDur * 0.62);
  if (empty || !d.chamber) SFX.playBolt(S.reloadDur * 0.82);
}
function finishReload() {
  const w = curW(), d = w.def;
  const cap = d.mag + (d.chamber && w.mag > 0 ? 1 : 0);
  const take = Math.min(cap - w.mag, w.reserve);
  w.mag += take;
  w.reserve -= take;
  S.reloading = false;
}
function switchWeapon(i) {
  if (i === player.cur || i < 0 || i >= player.weapons.length || S.ifakT > 0) return;
  player.cur = i;
  S.reloading = false;
  S.boltT = 0;
  S.switchT = 0.5;
  S.adsT = 0;
  SFX.playGear();
  SFX.playClick(0.15, 700, 0.18);
}
function useIfak() {
  if (player.ifaks <= 0 || player.hp >= 100 || S.ifakT > 0) return;
  S.reloading = false;
  S.ifakT = 2.5;
  SFX.playBandage();
}
function resupply() {
  if (!world.resupplyPos || S.resupplyCD > 0) return;
  if (Math.hypot(player.pos.x - world.resupplyPos.x, player.pos.z - world.resupplyPos.z) > 3) return;
  for (const w of player.weapons) { w.reserve = w.def.mag * w.def.reserveMags; w.mag = w.def.mag + (w.def.chamber ? 1 : 0); }
  player.frags = player.cls.frags;
  player.armor = player.armorMax;
  player.ifaks = Math.max(player.ifaks, player.cls.ifaks);
  S.resupplyCD = 60;
  S.reloading = false;
  flashMsg('RESUPPLIED\n<small>Ammo, grenades, armor plates and IFAKs restocked</small>', 2);
  SFX.playGear(); SFX.playMagIn(0.1); SFX.playMagIn(0.4);
}

function damagePlayer(amount, fromPos, explosive) {
  if (S.state !== 'playing') return;
  let a = amount;
  if (player.armor > 0) {
    const absorb = a * (explosive ? 0.45 : 0.65);
    const taken = Math.min(player.armor, absorb);
    player.armor -= taken;
    a -= taken;
  }
  player.hp -= a;
  S.hurtT = Math.min(1, S.hurtT + amount / 40);
  S.supp = Math.min(1, S.supp + 0.25);
  S.punchP += rand(0.01, 0.025) * Math.min(amount / 10, 3);
  S.punchY += rand(-0.02, 0.02) * Math.min(amount / 10, 3);
  if (S.ifakT > 0 && amount > 15) S.ifakT = 0;
  SFX.playHurt();
  if (fromPos) addDamageIndicator(fromPos);
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

// ============================================================
//  HUD
// ============================================================
const hud = {
  hpBar: $('hp-bar'), hpText: $('hp-text'), arBar: $('ar-bar'), arText: $('ar-text'),
  ifak: $('ifak'), nades: $('nades'), wName: $('weapon-name'), wCal: $('weapon-cal'),
  mag: $('mag'), reserve: $('reserve'), mode: $('firemode'), slots: $('weapon-slots'),
  wave: $('wave-info'), obj: $('objective'), kills: $('kills'), score: $('score'), hostiles: $('hostiles'),
  cross: $('crosshair'), scope: $('scope'), heal: $('heal-vignette'),
  prompt: $('prompt'), msg: $('center-msg'), prog: $('progress'), progBar: $('progress-bar'), progLabel: $('progress-label'),
  hit: $('hitmarker'), kf: $('killfeed'), ind: $('dmg-indicators'), mm: $('minimap').getContext('2d'),
};
let hitT = 0;
function showHitmarker(kill, head) {
  hud.hit.style.opacity = 1;
  hud.hit.classList.toggle('kill', !!kill);
  hitT = kill ? 0.25 : 0.12;
  SFX.playHit(kill, head);
}
function flashMsg(html, dur = 2) {
  hud.msg.innerHTML = html;
  hud.msg.style.opacity = 1;
  S.msgT = dur;
}
function addKillfeed(e, head, nade) {
  const el = document.createElement('div');
  el.className = 'kf';
  const wname = nade ? 'M67 Frag' : curW().def.name;
  el.innerHTML = `<span class="you">You</span> <span class="wp">[${wname}]</span> <span class="en">${e.t.name}</span>${head ? ' <span class="hs">HEADSHOT</span>' : ''}`;
  hud.kf.prepend(el);
  while (hud.kf.children.length > 5) hud.kf.lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
function addDamageIndicator(from) {
  const dx = from.x - player.pos.x, dz = from.z - player.pos.z;
  const y = player.yaw;
  const sx = dx * Math.cos(y) - dz * Math.sin(y);
  const sy = dx * Math.sin(y) + dz * Math.cos(y);
  const ang = Math.atan2(sx, -sy);
  const el = document.createElement('div');
  el.className = 'dmg-ind';
  el.style.transform = `rotate(${ang}rad)`;
  hud.ind.appendChild(el);
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in' }).onfinish = () => el.remove();
}
function updateHUD(dt) {
  const w = curW(), d = w.def;
  hud.hpBar.style.width = player.hp + '%';
  hud.hpBar.classList.toggle('low', player.hp < 35);
  hud.hpText.textContent = Math.ceil(player.hp);
  hud.arBar.style.width = (player.armor / player.armorMax) * 100 + '%';
  hud.arText.textContent = Math.ceil(player.armor);
  hud.ifak.textContent = player.ifaks;
  hud.nades.textContent = player.frags;
  hud.wName.textContent = d.name;
  hud.wCal.textContent = `${d.caliber} · ${d.optic}`;
  hud.mag.textContent = w.mag;
  hud.mag.classList.toggle('low', w.mag <= Math.ceil(d.mag * 0.2));
  hud.reserve.textContent = '/ ' + w.reserve;
  hud.mode.textContent = S.reloading ? 'RELOADING…' : d.modes[w.mode];
  hud.slots.innerHTML = player.weapons.map((x, i) => `<span class="${i === player.cur ? 'active' : ''}">[${i + 1}] ${x.def.name}</span>`).join(' &nbsp; ');
  hud.kills.textContent = player.kills;
  hud.score.textContent = player.score;
  hud.hostiles.textContent = S.alive + S.toSpawn;
  hud.wave.textContent = 'WAVE ' + S.wave;
  hud.obj.textContent = S.intermission > 0
    ? (S.wave === 0 ? `Deploying — hostiles expected in ${Math.ceil(S.intermission)}s` : `Sector clear — next wave in ${Math.ceil(S.intermission)}s · Resupply at the Merkava`)
    : 'Eliminate militants emerging from the tunnel shafts';

  const scoped = d.scope && S.adsT > 0.9;
  hud.scope.style.display = scoped ? 'block' : 'none';
  const sp = currentSpread();
  hud.cross.style.setProperty('--gap', (6 + sp * 500) + 'px');
  hud.cross.style.opacity = S.adsT > 0.5 || player.sprinting ? 0 : 1;

  if (hitT > 0) { hitT -= dt; if (hitT <= 0) hud.hit.style.opacity = 0; }
  if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) hud.msg.style.opacity = 0; }

  if (S.ifakT > 0) {
    hud.prog.classList.remove('hidden');
    hud.progLabel.textContent = 'APPLYING IFAK';
    hud.progBar.style.width = (1 - S.ifakT / 2.5) * 100 + '%';
  } else if (S.reloading) {
    hud.prog.classList.remove('hidden');
    hud.progLabel.textContent = 'RELOADING';
    hud.progBar.style.width = (S.reloadT / S.reloadDur) * 100 + '%';
  } else hud.prog.classList.add('hidden');

  const rp = world.resupplyPos;
  const nearCrate = rp && Math.hypot(player.pos.x - rp.x, player.pos.z - rp.z) < 3;
  if (nearCrate) {
    hud.prompt.style.display = 'block';
    hud.prompt.innerHTML = S.resupplyCD > 0 ? `Resupply available in ${Math.ceil(S.resupplyCD)}s` : 'Press <kbd>F</kbd> to resupply';
  } else hud.prompt.style.display = 'none';
}

function drawMinimap() {
  const c = hud.mm, W = 200, R = 70, s = W / 2 / R;
  c.clearRect(0, 0, W, W);
  c.fillStyle = 'rgba(30,38,24,0.85)';
  c.fillRect(0, 0, W, W);
  c.save();
  c.translate(W / 2, W / 2);
  c.rotate(player.yaw);
  c.scale(s, s);
  c.translate(-player.pos.x, -player.pos.z);
  for (const r of mapRects) {
    if (Math.abs(r.x + r.w / 2 - player.pos.x) > R + 20 || Math.abs(r.z + r.d / 2 - player.pos.z) > R + 20) continue;
    c.fillStyle = r.kind === 'b' ? 'rgba(170,180,150,0.75)' : r.kind === 't' ? 'rgba(110,168,255,0.9)' : 'rgba(120,125,105,0.7)';
    c.fillRect(r.x, r.z, r.w, r.d);
  }
  c.strokeStyle = '#ff9a3c'; c.lineWidth = 1.2 / s * 2;
  for (const sh of shafts) { c.beginPath(); c.arc(sh.x, sh.z, 2, 0, 7); c.stroke(); }
  const rp = world.resupplyPos;
  if (rp) { c.fillStyle = '#6ea8ff'; c.fillRect(rp.x - 1.2, rp.z - 1.2, 2.4, 2.4); }
  for (const p of pickups) { c.fillStyle = '#7ddc6a'; c.fillRect(p.g.position.x - 0.8, p.g.position.z - 0.8, 1.6, 1.6); }
  for (const e of enemies) {
    if (e.dead || e.emerge > 0) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d > 45 && !e.vis) continue;
    c.fillStyle = e.t.sniper ? '#ffcf3c' : '#ff4a3c';
    c.beginPath(); c.arc(e.pos.x, e.pos.z, 1.6, 0, 7); c.fill();
  }
  c.restore();
  c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(W / 2, W / 2 - 7); c.lineTo(W / 2 - 5, W / 2 + 5); c.lineTo(W / 2 + 5, W / 2 + 5); c.fill();
}

// ============================================================
//  INPUT
// ============================================================
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.state !== 'playing') return;
  switch (e.code) {
    case 'KeyR': startReload(); break;
    case 'Digit1': switchWeapon(0); break;
    case 'Digit2': switchWeapon(1); break;
    case 'KeyQ': switchWeapon(1 - player.cur); break;
    case 'KeyB': { const w = curW(); if (w.def.modes.length > 1) { w.mode = (w.mode + 1) % w.def.modes.length; SFX.playClick(0, 2000, 0.15); } break; }
    case 'KeyG': throwGrenade(); break;
    case 'KeyH': useIfak(); break;
    case 'KeyF': resupply(); break;
    case 'KeyC': player.crouch = !player.crouch; SFX.playGear(); break;
    case 'Space': if (player.onGround && S.ifakT <= 0) { player.vy = 6.2; player.onGround = false; player.crouch = false; SFX.playGear(); } break;
  }
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousedown', (e) => {
  if (S.state !== 'playing') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0) { mouse.left = true; S.triggerFresh = true; }
  if (e.button === 2) mouse.right = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', () => { if (S.state === 'playing') switchWeapon(1 - player.cur); });
document.addEventListener('mousemove', (e) => {
  if (S.state !== 'playing' || document.pointerLockElement !== canvas) return;
  const sens = 0.0022 * (camera.fov / BASE_FOV);
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = clamp(player.pitch, -1.5, 1.5);
  mouseDX += e.movementX; mouseDY += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && S.state === 'playing') pauseGame();
});

// ============================================================
//  GAME FLOW
// ============================================================
function clearEntities() {
  for (const e of enemies.slice()) removeEnemy(e);
  for (const g of grenades) scene.remove(g.m);
  grenades.length = 0;
  for (const r of rockets) scene.remove(r.m);
  rockets.length = 0;
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  clearDecals();
  enemyHitMeshes = [];
  while (vmRoot.children.length) vmRoot.remove(vmRoot.children[0]);
}
function deploy(cls) {
  SFX.initAudio();
  clearEntities();
  player.cls = cls;
  player.weapons = [makeWeapon(cls.primary), makeWeapon(cls.secondary)];
  player.cur = 0;
  player.hp = 100;
  player.armorMax = cls.armor;
  player.armor = cls.armor;
  player.ifaks = cls.ifaks;
  player.frags = cls.frags;
  player.pos.copy(world.spawn);
  player.vel.set(0, 0, 0);
  player.vy = 0; player.yaw = 0; player.pitch = 0; player.recoilP = 0; player.crouch = false; player.eye = 1.65; player.onGround = true;
  player.kills = player.headshots = player.score = player.shots = player.hits = 0;
  Object.assign(S, {
    wave: 0, toSpawn: 0, spawnT: 0, intermission: 6, alive: 0, reloading: false, switchT: 0.5, ifakT: 0,
    fireCD: 0, boltT: 0, adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, shake: 0, hurtT: 0, flowT: 0, time: 0,
    supp: 0, flashW: 0, landDip: 0, punchP: 0, punchY: 0,
  });
  camera.rotation.z = 0;
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  S.state = 'playing';
  canvas.requestPointerLock();
  flashMsg(`OPERATION SWORDS OF IRON\n<small>${cls.unit} — ${cls.name}. Tunnel shafts are marked orange on the UAV feed.</small>`, 5);
}
function startWave() {
  S.wave++;
  S.toSpawn = 5 + S.wave * 3;
  S.spawnT = 1;
  flashMsg(`WAVE ${S.wave}\n<small>${S.toSpawn} militants inbound${S.wave === 2 ? ' — RPG gunners spotted' : S.wave === 3 ? ' — Watch for sniper glint' : ''}</small>`, 3);
}
function updateWaves(dt) {
  if (S.intermission > 0) {
    S.intermission -= dt;
    if (S.intermission <= 0) startWave();
    return;
  }
  const maxAlive = Math.min(6 + S.wave, 14);
  S.spawnT -= dt;
  if (S.toSpawn > 0 && S.alive < maxAlive && S.spawnT <= 0) {
    spawnEnemy();
    S.toSpawn--;
    S.spawnT = Math.max(0.7, 2.6 - S.wave * 0.15);
  }
  if (S.toSpawn === 0 && S.alive === 0) {
    player.score += S.wave * 250;
    S.intermission = 12;
    flashMsg(`WAVE ${S.wave} CLEARED\n<small>+${S.wave * 250} bonus · Regroup and resupply</small>`, 3);
  }
}
function pauseGame() {
  S.state = 'paused';
  mouse.left = mouse.right = false;
  $('pause').classList.remove('hidden');
}
function resumeGame() {
  $('pause').classList.add('hidden');
  S.state = 'playing';
  canvas.requestPointerLock();
}
function gameOver() {
  S.state = 'dead';
  document.exitPointerLock();
  const acc = player.shots ? Math.round((player.hits / player.shots) * 100) : 0;
  $('go-stats').innerHTML = `
    <div>Class <b>${player.cls.name}</b></div>
    <div>Waves survived <b>${Math.max(0, S.wave - 1)}</b></div>
    <div>Kills <b>${player.kills}</b></div>
    <div>Headshots <b>${player.headshots}</b></div>
    <div>Accuracy <b>${acc}%</b></div>
    <div>Score <b>${player.score}</b></div>`;
  setTimeout(() => $('gameover').classList.remove('hidden'), 1200);
}
function toMenu() {
  S.state = 'menu';
  document.exitPointerLock();
  clearEntities();
  $('pause').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

// ============================================================
//  UPDATE
// ============================================================
function surfaceAt(x, z, y) {
  if (y < 0.05) return 'sand';
  for (const c of colliders) if (Math.abs(c.top - y) < 0.06 && x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return c.surf;
  return 'concrete';
}
function updatePlayer(dt) {
  const d = curW().def;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let mx = fx * f + rx * s, mz = fz * f + rz * s;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }

  const shift = keys.ShiftLeft || keys.ShiftRight;
  player.sprinting = shift && f > 0 && !mouse.right && S.ifakT <= 0 && player.onGround;
  if (player.sprinting && player.crouch) player.crouch = false;
  let speed = 5 * player.cls.speed * (d.moveMult || 1);
  if (player.sprinting) speed *= 1.55;
  if (player.crouch) speed *= 0.5;
  speed *= 1 - S.adsT * 0.4;
  if (S.ifakT > 0) speed *= 0.5;

  const accel = player.onGround ? 12 : 2.5;
  player.vel.x = lerp(player.vel.x, mx * speed, Math.min(1, accel * dt));
  player.vel.z = lerp(player.vel.z, mz * speed, Math.min(1, accel * dt));
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  resolveCollisions(player.pos, 0.4, player.pos.y, player.crouch ? 1.2 : 1.8);
  player.pos.x = clamp(player.pos.x, -HALF + 0.5, HALF - 0.5);
  player.pos.z = clamp(player.pos.z, -HALF + 0.5, HALF - 0.5);

  player.vy -= 20 * dt;
  player.pos.y += player.vy * dt;
  const gh = groundHeightAt(player.pos.x, player.pos.z, player.pos.y);
  const wasGround = player.onGround;
  const vyBefore = player.vy;
  if (player.pos.y <= gh) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  else if (wasGround && player.vy <= 0 && player.pos.y - gh < 0.35) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  else player.onGround = false;
  if (!wasGround && player.onGround && vyBefore < -3) {
    const k = clamp(-vyBefore / 10, 0.2, 1);
    S.landDip = Math.max(S.landDip, k);
    SFX.playLand(k);
  }
  S.landDip = approach(S.landDip, 0, dt * 3);

  player.eye = approach(player.eye, player.crouch ? 1.05 : 1.65, dt * 5);

  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && sp > 0.5) {
    const prev = S.bobT;
    S.bobT += dt * sp * 1.7;
    if (Math.floor(prev / Math.PI) !== Math.floor(S.bobT / Math.PI)) SFX.playStep(surfaceAt(player.pos.x, player.pos.z, player.pos.y), player.sprinting, player.crouch);
  }
}

function updateWeapon(dt) {
  const w = curW(), d = w.def;
  S.fireCD -= dt; S.nadeCD -= dt; S.resupplyCD -= dt;
  if (S.boltT > 0) S.boltT -= dt;
  if (S.switchT > 0) S.switchT -= dt;
  const wantAds = mouse.right && !player.sprinting && !S.reloading && S.switchT <= 0 && S.ifakT <= 0;
  S.adsT = approach(S.adsT, wantAds ? 1 : 0, dt / d.adsTime);
  S.bloom *= Math.exp(-dt * 5);
  S.kick *= Math.exp(-dt * 14);
  player.recoilP *= Math.exp(-dt * 6);
  S.punchP *= Math.exp(-dt * 8); S.punchY *= Math.exp(-dt * 8);
  if (S.reloading) { S.reloadT += dt; if (S.reloadT >= S.reloadDur) finishReload(); }
  if (S.ifakT > 0) {
    S.ifakT -= dt;
    if (S.ifakT <= 0) {
      player.hp = Math.min(100, player.hp + 50);
      player.ifaks--;
      hud.heal.style.opacity = 1;
      setTimeout(() => (hud.heal.style.opacity = 0), 400);
    }
  }
  if (mouse.left) tryFire();

  const scoped = d.scope && S.adsT > 0.9;
  const shift = keys.ShiftLeft || keys.ShiftRight;
  const holding = scoped && shift && S.breath > 0;
  if (holding) S.breath -= dt; else S.breath = Math.min(4, S.breath + dt * 0.8);
  S.swayT += dt;
  const amp = scoped ? (holding ? 0.0006 : 0.004 * (player.crouch ? 0.6 : 1)) : 0.0006 * S.adsT;
  const suppAmp = S.supp * 0.004;
  const swayP = Math.sin(S.swayT * 1.1) * (amp + suppAmp), swayY = Math.sin(S.swayT * 0.7) * (amp + suppAmp) * 1.3;

  const targetFov = scoped ? d.adsFov : lerp(BASE_FOV, d.scope ? 55 : d.adsFov, S.adsT) + (player.sprinting ? 6 : 0);
  const fov = lerp(camera.fov, targetFov, Math.min(1, dt * 18));
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const vmFov = lerp(58, 46, S.adsT);
  if (Math.abs(vmFov - vmCamera.fov) > 0.01) { vmCamera.fov = vmFov; vmCamera.updateProjectionMatrix(); }

  S.shake *= Math.exp(-dt * 4);
  const sh = S.shake * 0.08;
  const bobY = player.onGround ? -Math.abs(Math.sin(S.bobT)) * 0.025 * Math.min(Math.hypot(player.vel.x, player.vel.z) / 5, 1.5) * (1 - S.adsT * 0.7) : 0;
  camera.position.set(player.pos.x + rand(-sh, sh), player.pos.y + player.eye + bobY - S.landDip * 0.15 + rand(-sh, sh), player.pos.z);
  camera.rotation.set(player.pitch + player.recoilP + swayP + S.punchP, player.yaw + swayY + S.punchY, Math.sin(S.bobT * 0.5) * 0.004 * (1 - S.adsT));
  camera.updateMatrixWorld();

  if (S.flashT > 0) {
    S.flashT -= dt;
    if (S.flashT <= 0) { muzzleLight.intensity = 0; vmFlash.intensity = 0; for (const x of player.weapons) x.model.flash.visible = false; }
  }
}

function updateViewModel(dt) {
  const w = curW(), m = w.model, d = w.def;
  for (const x of player.weapons) x.model.group.visible = x === w;
  vmRoot.visible = !(d.scope && S.adsT > 0.9);
  const g = m.group;
  const pos = m.hip.clone().lerp(m.ads, S.adsT);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const bob = (1 - S.adsT * 0.92) * Math.min(sp / 5, 1.6);
  pos.x += Math.sin(S.bobT) * 0.012 * bob;
  pos.y -= Math.abs(Math.cos(S.bobT)) * 0.014 * bob;
  // Idle breathing.
  pos.y += Math.sin(S.time * 1.6) * 0.0025 * (1 - S.adsT * 0.8);
  vmSway.x = lerp(vmSway.x, clamp(-mouseDX * 0.0006, -0.04, 0.04), Math.min(1, dt * 10));
  vmSway.y = lerp(vmSway.y, clamp(mouseDY * 0.0006, -0.04, 0.04), Math.min(1, dt * 10));
  mouseDX = mouseDY = 0;
  pos.x += vmSway.x * (1 - S.adsT * 0.8);
  pos.y += vmSway.y * (1 - S.adsT * 0.8);
  let rx = 0, ry = vmSway.x * 1.2 * (1 - S.adsT * 0.8), rz = -vmSway.x * 2 * (1 - S.adsT * 0.9);
  S.sprintT = approach(S.sprintT, player.sprinting ? 1 : 0, dt * 6);
  pos.x += S.sprintT * 0.04; pos.y -= S.sprintT * 0.05;
  ry += S.sprintT * 0.6; rx -= S.sprintT * 0.2;
  if (player.crouch) rz += 0.04 * (1 - S.adsT);
  pos.y -= S.landDip * 0.05;
  pos.z += S.kick * 0.045 * (1 - S.adsT * 0.4) * (d.type === 'sniper' ? 2 : 1);
  rx += S.kick * (d.type === 'pistol' ? 0.15 : 0.05);
  const mb = m.mag.userData.base;
  if (S.reloading) {
    const p = S.reloadT / S.reloadDur;
    const dip = Math.sin(Math.min(p, 1) * Math.PI);
    rx -= dip * 0.45; rz += dip * 0.4; pos.y -= dip * 0.05;
    let off = 0;
    if (p < 0.15) off = 0;
    else if (p < 0.35) off = -((p - 0.15) / 0.2) * 0.35;
    else if (p < 0.55) off = -0.35;
    else if (p < 0.72) off = -0.35 * (1 - (p - 0.55) / 0.17);
    m.mag.position.set(mb.x, mb.y + off, mb.z);
    m.mag.visible = off > -0.33;
  } else { m.mag.position.copy(mb); m.mag.visible = true; }
  if (S.switchT > 0) { const k = S.switchT / 0.5; pos.y -= k * 0.3; rx -= k * 0.9; }
  if (S.ifakT > 0) { pos.y -= 0.35; rx -= 0.6; }
  if (S.boltT > 0) { const b = Math.sin((1 - S.boltT / 1.15) * Math.PI); rz += b * 0.25; rx -= b * 0.08; pos.y -= b * 0.02; }
  g.position.copy(pos);
  g.rotation.set(rx, ry, rz);
  g.updateMatrixWorld(true);

  // Light the weapon with the real sun direction (in camera space), dimmed when the player stands in shadow.
  S.sunT -= dt;
  if (S.sunT <= 0) { S.sunT = 0.1; S.inSunTarget = inSunlight(V(player.pos.x, player.pos.y + player.eye, player.pos.z), assets.sunDir) ? 1 : 0; }
  S.inSun = approach(S.inSun, S.inSunTarget ?? 1, dt * 3);
  vmSun.position.copy(assets.sunDir).applyQuaternion(tmpQ.copy(camera.quaternion).invert()).multiplyScalar(5);
  vmSun.intensity = lerp(0.25, 3.0, S.inSun);
}
const tmpQ = new THREE.Quaternion();

function updateEnemies(dt) {
  S.flowT -= dt;
  if (S.flowT <= 0) { S.flowT = 0.4; updateFlow(player.pos.x, player.pos.z); }
  for (let i = enemies.length - 1; i >= 0; i--) updateEnemy(enemies[i], dt);
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead || a.emerge > 0) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead || b.emerge > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.8 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
        a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
      }
    }
    const px = player.pos.x - a.pos.x, pz = player.pos.z - a.pos.z, pd = Math.hypot(px, pz);
    if (pd < 0.8 && pd > 1e-4) { a.pos.x -= (px / pd) * (0.8 - pd); a.pos.z -= (pz / pd) * (0.8 - pd); }
  }
}

function updateLights(dt) {
  for (const l of enemyLights) {
    if (l.intensity > 0) { l.userData.t -= dt; if (l.userData.t <= 0) l.intensity = 0; }
  }
  if (S.explT > 0) {
    S.explT -= dt;
    explLight.intensity = 900 * Math.max(0, S.explT / 0.25) ** 2;
  } else explLight.intensity = 0;
}

function updatePost(dt) {
  const u = pipe.grade.uniforms;
  S.supp = Math.max(0, S.supp - dt * 0.35);
  S.flashW = Math.max(0, S.flashW - dt * 1.5);
  S.hurtT = Math.max(0, S.hurtT - dt * 0.8);
  const low = S.state === 'playing' || S.state === 'dead' ? clamp(1 - player.hp / 40, 0, 1) : 0;
  u.uTime.value = S.time;
  u.uHurt.value = S.state === 'dead' ? 0.8 : Math.min(1, S.hurtT * 0.8 + low * (0.35 + Math.sin(S.time * 5) * 0.1));
  u.uLow.value = S.state === 'dead' ? 0.9 : low * 0.8;
  u.uSupp.value = S.supp;
  u.uFlash.value = S.flashW;
  if (S.state === 'playing' && low > 0) {
    S.beatT -= dt;
    if (S.beatT <= 0) { S.beatT = lerp(1.0, 0.6, low); SFX.playHeartbeat(low); }
  }
}

// ============================================================
//  MAIN LOOP
// ============================================================
const clock = new THREE.Clock();
let menuT = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.state === 'loading') return;
  if (S.state === 'playing') {
    S.time += dt;
    updatePlayer(dt);
    updateWeapon(dt);
    updateViewModel(dt);
    updateEnemies(dt);
    updateRockets(dt);
    updateGrenades(dt);
    updatePickups(dt);
    updateWaves(dt);
    updateHUD(dt);
    drawMinimap();
  } else if (S.state === 'menu') {
    S.time += dt;
    menuT += dt;
    const a = menuT * 0.035;
    camera.position.set(Math.sin(a) * 58, 14 + Math.sin(menuT * 0.1) * 3, Math.cos(a) * 58);
    camera.lookAt(Math.sin(a + 0.8) * 10, 5, Math.cos(a + 0.8) * 10);
    if (camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
    vmRoot.visible = false;
  } else if (S.state === 'dead') {
    S.time += dt;
    player.eye = approach(player.eye, 0.3, dt * 2);
    camera.position.y = player.pos.y + player.eye;
    camera.rotation.z = approach(camera.rotation.z, 0.8, dt);
    camera.updateMatrixWorld();
    vmRoot.visible = false;
    updateEnemies(dt);
  }
  if (S.state !== 'paused') {
    updateLights(dt);
    updateEffects(dt, S.time, camera.position);
  }
  updateSun(S.state === 'menu' ? V(camera.position.x * 0.4, 0, camera.position.z * 0.4) : player.pos);
  SFX.setListener(camera.position, player.yaw);
  SFX.updateAudio(dt, S.state === 'playing');
  updatePost(dt);
  pipe.composer.render(dt);
}

// ============================================================
//  MENU
// ============================================================
let selectedClass = null;
function buildMenu() {
  const list = $('class-list');
  for (const c of CLASSES) {
    const p = WEAPONS[c.primary], s = WEAPONS[c.secondary];
    const card = document.createElement('div');
    card.className = 'class-card';
    const stat = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><div style="width:${v * 100}%"></div></div></div>`;
    card.innerHTML = `
      <h3>${c.name}</h3>
      <div class="unit">${c.unit}</div>
      <div class="desc">${c.desc}</div>
      <div class="wpn">PRIMARY: <b>${p.name}</b><small>${p.caliber} · ${p.mag}-rd · ${p.optic}</small></div>
      <div class="wpn">SIDEARM: <b>${s.name}</b><small>${s.caliber} · ${s.mag}-rd</small></div>
      ${stat('ARMOR', c.stats.armor)}${stat('MOBILITY', c.stats.mobility)}${stat('FIREPOWER', c.stats.firepower)}
      <ul>${c.gear.map((g) => `<li>${g}</li>`).join('')}</ul>`;
    card.onclick = () => {
      selectedClass = c;
      document.querySelectorAll('.class-card').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
      const btn = $('deploy-btn');
      btn.disabled = false;
      btn.textContent = `DEPLOY AS ${c.name}`;
    };
    list.appendChild(card);
  }
  const qd = $('quality');
  for (const [id, q] of Object.entries(QUALITY)) {
    const b = document.createElement('button');
    b.textContent = q.label;
    b.dataset.q = id;
    b.onclick = () => applyQuality(id);
    qd.appendChild(b);
  }
  $('deploy-btn').onclick = () => { if (selectedClass) deploy(selectedClass); };
  $('resume-btn').onclick = resumeGame;
  $('quit-btn').onclick = toMenu;
  $('redeploy-btn').onclick = toMenu;
}

// ============================================================
//  BOOT
// ============================================================
async function boot() {
  const bar = $('load-bar'), txt = $('load-text');
  await loadAssets((p) => { bar.style.width = (p * 100).toFixed(0) + '%'; txt.textContent = `Loading assets… ${(p * 100).toFixed(0)}%`; });
  txt.textContent = 'Building Gaza City…';
  await new Promise((r) => setTimeout(r, 30));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(assets.hdr).texture;
  scene.environment = env;
  vmScene.environment = env;
  scene.background = assets.hdr;
  scene.backgroundIntensity = 1;
  const hz = assets.horizon.clone();
  const mx = Math.max(hz.r, hz.g, hz.b);
  if (mx > 0.9) hz.multiplyScalar(0.9 / mx);
  scene.fog = new THREE.FogExp2(hz, 0.0062);
  setupSun();

  initEffects(scene, assets.tex);
  buildWorld(scene);
  buildNav();
  buildMenu();
  applyQuality(qualityId);

  txt.textContent = 'Compiling shaders…';
  await new Promise((r) => setTimeout(r, 30));
  camera.position.set(0, 20, 60);
  camera.lookAt(0, 5, 0);
  updateSun(V());
  renderer.compile(scene, camera);
  const warm = createCharacter('hamas', 'ak');
  scene.add(warm.root);
  warm.root.position.set(0, -50, 0);
  renderer.compile(scene, camera);
  scene.remove(warm.root);
  warm.dispose();

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  S.state = 'menu';
}
boot();
loop();
window.__game = { S, player, enemies, mouse, keys, camera, scene, renderer, spawnEnemy, world, deploy, CLASSES, assets, sun, get pipe() { return pipe; }, applyQuality };
