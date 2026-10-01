import * as THREE from 'three';
import { loadAssets, assets } from './assets.js';
import { createRenderer, createPipeline, QUALITY, LAYER_FX, LAYER_HITBOX } from './gfx.js';
import { initEffects, updateEffects, spawnParticle, spawnTracer, addDecal, clearDecals, impactFx, bloodFx, explosionFx, spawnCasing, TEX } from './effects.js';
import { buildWorld, world, HALF, colliders, mapRects, shafts, raycastWorld, hasLOS, inSunlight, resolveCollisions, groundHeightAt, buildNav, updateFlow, flowDir } from './world.js';
import { createCharacter, createPlayerBody } from './characters.js';
import { singlePassTransparent } from './merge.js';
import { buildViewModel, buildGrenadeViewModel, buildMedViewModel, NADE_TIMING, STAB_TIMING } from './viewmodels.js';
import { MED_TIMING } from './bandage.js';
import { makeGrenadeMesh } from './grenade.js';
import { createSquad, MAX_BOTS } from './squad.js';
import { createNet } from './net.js';
import * as SFX from './audio.js';

// ============================================================
//  DATA: weapons, classes, enemies
// ============================================================
const WEAPONS = {
  tavor: {
    name: 'IWI Tavor TAR-21', tag: 'TAR-21', caliber: '5.56×45mm NATO · bullpup', type: 'rifle', model: 'tavor',
    mag: 30, reserveMags: 6, chamber: true, rpm: 850, damage: 32, headMult: 2.4, range: 250,
    spread: 0.035, adsSpread: 0.003, bloomPerShot: 0.006, recoil: 0.011,
    reload: 2.3, reloadEmpty: 2.9, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.18, tracerEvery: 3,
    optic: 'Reflex sight · suppressor', sound: { cut: 3600, dur: 0.16, thump: 130, gain: 0.9 },
  },
  m4: {
    name: 'Colt M4A1 (RIS II)', tag: 'M4A1', caliber: '5.56×45mm NATO', type: 'rifle', model: 'm4',
    mag: 30, reserveMags: 6, chamber: true, rpm: 800, damage: 31, headMult: 2.4, range: 250,
    spread: 0.038, adsSpread: 0.0035, bloomPerShot: 0.006, recoil: 0.012,
    reload: 2.1, reloadEmpty: 2.7, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.17, tracerEvery: 3,
    optic: 'EOTech holographic sight', sound: { cut: 3800, dur: 0.15, thump: 140, gain: 0.9 },
  },
  negev: {
    name: 'FN MAG 58', tag: 'MAG 58', caliber: '7.62×51mm NATO · belt-fed', type: 'lmg', model: 'negev',
    mag: 100, reserveMags: 3, chamber: false, rpm: 650, damage: 40, headMult: 2.2, range: 300,
    spread: 0.06, adsSpread: 0.011, bloomPerShot: 0.004, recoil: 0.014, moveMult: 0.9,
    reload: 5.2, reloadEmpty: 6.0, modes: ['AUTO', 'SEMI'], adsFov: 55, adsTime: 0.32, tracerEvery: 2,
    optic: 'Iron sights · bipod', sound: { cut: 2600, dur: 0.22, thump: 90, gain: 1.05 },
  },
  m24: {
    name: 'M24 SWS', tag: 'M24', caliber: '7.62×51mm NATO · bolt-action', type: 'sniper', model: 'm24',
    mag: 5, reserveMags: 6, chamber: false, rpm: 48, damage: 140, headMult: 3, range: 800,
    spread: 0.09, adsSpread: 0.0, bloomPerShot: 0, recoil: 0.045, scope: true,
    reload: 3.4, reloadEmpty: 3.8, modes: ['BOLT'], adsFov: 14, adsTime: 0.3, tracerEvery: 0,
    optic: 'Leupold Mark 4 10× scope', sound: { cut: 2800, dur: 0.55, thump: 65, gain: 1.25 },
  },
  glock: {
    name: 'Glock 17', tag: 'G17', caliber: '9×19mm Parabellum', type: 'pistol', model: 'glock',
    mag: 17, reserveMags: 4, chamber: true, rpm: 420, damage: 25, headMult: 2, range: 50,
    spread: 0.03, adsSpread: 0.007, bloomPerShot: 0.012, recoil: 0.02,
    reload: 1.5, reloadEmpty: 1.9, modes: ['SEMI'], adsFov: 62, adsTime: 0.12, tracerEvery: 0,
    optic: 'Iron sights', sound: { cut: 4000, dur: 0.1, thump: 190, gain: 0.7 },
  },
  jericho: {
    name: 'IWI Jericho 941', tag: 'JERICHO', caliber: '9×19mm Parabellum', type: 'pistol', model: 'jericho',
    mag: 16, reserveMags: 4, chamber: true, rpm: 380, damage: 27, headMult: 2, range: 50,
    spread: 0.028, adsSpread: 0.006, bloomPerShot: 0.012, recoil: 0.022,
    reload: 1.6, reloadEmpty: 2.0, modes: ['SEMI'], adsFov: 62, adsTime: 0.12, tracerEvery: 0,
    optic: 'Iron sights', sound: { cut: 3800, dur: 0.11, thump: 180, gain: 0.75 },
  },
  karambit: {
    name: 'Karambit', tag: 'KNIFE', caliber: 'Melee', type: 'melee', model: 'karambit',
    mag: 1, reserveMags: 0, chamber: false, rpm: 120, damage: 75, headMult: 1, range: 1.8,
    spread: 0.01, adsSpread: 0.01, bloomPerShot: 0, recoil: 0, moveMult: 1.06,
    reload: 1, reloadEmpty: 1, modes: ['STAB'], adsFov: 75, adsTime: 0.2, tracerEvery: 0,
    optic: 'Claw blade · a stab in the back kills', sound: null,
  },
};

const CLASSES = [
  {
    id: 'rifleman', name: 'RIFLEMAN', unit: 'Givati Brigade · 84th Infantry',
    desc: 'Balanced frontline infantry. Reliable bullpup rifle and full protection.',
    primary: 'tavor', secondary: 'glock', armor: 100, speed: 1.0, frags: 2, ifaks: 3,
    gear: ['Ceramic plate carrier (NIJ Level IV)', 'Rabintex RBH-303 ballistic helmet', 'Reflex sight + suppressor', '2× M67 frag grenades', '3× IFAK (Israeli bandage, CAT tourniquet)'],
    stats: { armor: 0.7, mobility: 0.6, firepower: 0.65 },
  },
  {
    id: 'assault', name: 'ASSAULT', unit: 'Egoz Commando Unit · 89th',
    desc: 'Fast-moving commando. Light armor, extra grenades for clearing rooms.',
    primary: 'm4', secondary: 'jericho', armor: 75, speed: 1.12, frags: 4, ifaks: 2,
    gear: ['Low-profile plate carrier (Level III+)', 'High-cut helmet w/ NVG shroud', 'EOTech sight + vertical grip', '4× M67 frag grenades', '2× IFAK'],
    stats: { armor: 0.5, mobility: 0.9, firepower: 0.6 },
  },
  {
    id: 'support', name: 'MACHINE GUNNER', unit: 'Golani Brigade · 1st Infantry',
    desc: 'Heavy weapons. Suppress with 100-round belts. Slow but durable.',
    primary: 'negev', secondary: 'glock', armor: 130, speed: 0.88, frags: 1, ifaks: 3,
    gear: ['Heavy plate carrier w/ side plates', 'Rabintex RBH-303 ballistic helmet', 'Folding bipod', '1× M67 frag grenade', '3× IFAK', '100-rd belt pouches'],
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
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
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
const settings = {
  volume: Number(localStorage.getItem('idf-volume') ?? 75),
  sens: Number(localStorage.getItem('idf-sens') ?? 100),
  fov: Number(localStorage.getItem('idf-fov') ?? BASE_FOV),
};
function lookFov() { return clamp(settings.fov, 60, 100); }
function applySettings() {
  settings.volume = clamp(settings.volume, 0, 100);
  settings.sens = clamp(settings.sens, 20, 250);
  settings.fov = lookFov();
  localStorage.setItem('idf-volume', String(settings.volume));
  localStorage.setItem('idf-sens', String(settings.sens));
  localStorage.setItem('idf-fov', String(settings.fov));
  SFX.setVolume(settings.volume / 100);
  document.querySelectorAll('.set-vol').forEach((el) => { el.value = settings.volume; });
  document.querySelectorAll('.set-sens').forEach((el) => { el.value = settings.sens; });
  document.querySelectorAll('.set-fov').forEach((el) => { el.value = settings.fov; });
  document.querySelectorAll('.set-vol-n').forEach((el) => { el.textContent = Math.round(settings.volume); });
  document.querySelectorAll('.set-sens-n').forEach((el) => { el.textContent = (settings.sens / 100).toFixed(2); });
  document.querySelectorAll('.set-fov-n').forEach((el) => { el.textContent = Math.round(settings.fov); });
}
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
  crouch: false, prone: false, eye: 1.65, sprinting: false, cls: null, weapons: [], cur: 0,
  kills: 0, headshots: 0, score: 0, shots: 0, hits: 0,
};
const S = {
  state: 'loading', wave: 0, toSpawn: 0, spawnT: 0, intermission: 0, alive: 0,
  reloading: false, reloadT: 0, reloadDur: 0, switchT: 0, ifakT: 0, fireCD: 0, boltT: 0,
  adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, bobT: 0, shake: 0, sprintT: 0,
  breath: 4, swayT: 0, flashT: 0, hurtT: 0, flowT: 0, time: 0, msgT: 0, triggerFresh: false,
  supp: 0, flashW: 0, landDip: 0, airVy: 0, lastStep: 0, punchP: 0, punchY: 0, beatT: 0, sunT: 0, inSun: 1,
  thirdPerson: localStorage.getItem('idf-tp') === '1', tpK: 0, camD: 2, tpDead: false, deadT: 0, inspectT: -1,
};
// Third-person body; created once the models have loaded.
let body = null;
let seller = null;
// True while the over-the-shoulder camera is in use (scoped ADS drops back to first person).
const tpActive = () => S.tpK > 0.5;
const keys = {};
const mouse = { left: false, right: false };
const vmSway = V();
let mouseDX = 0, mouseDY = 0;

const enemies = [], grenades = [], rockets = [], pickups = [];
let enemyHitMeshes = [];

let botCount = clamp(parseInt(localStorage.getItem('idf-bots') ?? '0', 10) || 0, 0, MAX_BOTS);
const squad = createSquad({
  scene, player, enemies, WEAPONS,
  damageEnemy: (...a) => damageEnemy(...a),
  onDown: (b) => flashMsg(`${b.name.toUpperCase()} IS DOWN\n<small>Reinforced when the wave is cleared</small>`, 2),
});

const curW = () => player.weapons[player.cur];
function makeWeapon(id) {
  const def = WEAPONS[id];
  const melee = def.type === 'melee';
  return {
    id, def, mag: melee ? 0 : def.mag + (def.chamber ? 1 : 0), reserve: melee ? 0 : def.mag * def.reserveMags,
    mode: 0, shotN: 0, model: buildViewModel(def.model, vmRoot),
  };
}

// ============================================================
//  ENEMIES
// ============================================================
let glintMat = null;
let enemySeq = 1, nadeSeq = 1, rocketSeq = 1;
let net = null;
let spectateI = 0;
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
    t, typeId, nid: enemySeq++, ch, hp: t.hp * (1 + Math.max(0, S.wave - 1) * 0.08),
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

  e.losT -= dt;
  if (e.losT <= 0) {
    e.losT = rand(0.18, 0.3);
    // Nearest visible soldier: the host, a joined friend, or a squad bot. Nobody is preferred.
    let best = null;
    if (S.state === 'playing' || (net && net.isHost)) {
      const cands = [player, ...squad.alive(), ...(net ? net.targets() : [])]
        .filter((c) => c !== player || playerInFight())
        .map((c) => ({ c, d: Math.hypot(c.pos.x - e.pos.x, c.pos.z - e.pos.z) }))
        .filter((o) => o.d < t.range)
        .sort((a, b) => a.d - b.d);
      for (const { c } of cands) {
        if (hasLOS(eEye, pEye.set(c.pos.x, c.pos.y + c.eye - 0.15, c.pos.z))) { best = c; break; }
      }
    }
    const vis = !!best;
    if (vis && (!e.seen || best !== e.tgt)) {
      // Switching between targets already in view is quicker than reacting to a new contact.
      e.reactT = t.react * rand(0.7, 1.3) * (e.seen ? 0.5 : 1);
      e.seen = true; e.burstLeft = 0; e.fireT = 0;
    }
    if (!vis) { e.seen = false; e.aimT = Math.min(e.aimT, 0); }
    e.vis = vis;
    if (best) e.tgt = best;
  }
  if (!e.tgt || (e.tgt !== player && !e.tgt.alive) || (e.tgt === player && !playerInFight())) {
    e.tgt = (net && net.targets().find((h) => h.alive)) || player;
    if (e.vis) { e.vis = e.seen = false; }
  }
  const T = e.tgt;
  pEye.set(T.pos.x, T.pos.y + T.eye - 0.15, T.pos.z);
  const dx = T.pos.x - e.pos.x, dz = T.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);

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
  if (S.state !== 'playing' && !(net && net.isHost)) wantMove = false;
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
      const T = e.tgt, sp = Math.hypot(T.vel.x, T.vel.z);
      const chance = 0.72 * (sp > 1 ? 0.5 : 1) * (T.prone ? 0.5 : T.crouch ? 0.85 : 1);
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
  const T = e.tgt, sp = Math.hypot(T.vel.x, T.vel.z);
  let chance = t.acc * (1 - Math.min(dist / t.range, 1) * 0.6) * (sp > 1 ? 0.65 : 1) * (T.prone ? 0.45 : T.crouch ? 0.75 : 1) * (1 + (S.wave - 1) * 0.04);
  if (T.sprinting) chance *= 0.8;
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
  const T = e.tgt;
  // Near-miss suppression is always measured against the player, whoever the shot was meant for.
  const eye = V(player.pos.x, player.pos.y + player.eye - 0.1, player.pos.z);
  const target = V(T.pos.x, T.pos.y + T.eye - 0.35, T.pos.z);
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
    if (T === player) damagePlayer(dmg, e.pos);
    else if (T.net) net.hurt(T.netId, dmg, e.pos, false);
    else squad.damage(T, dmg, e.pos);
  }
  SFX.playShot(e.t.sound, from);
  enemyMuzzleFlash(from);
}

let rocketMats = null;
function launchRocket(e, dist) {
  const from = e.ch.muzzle.getWorldPosition(V());
  const lead = Math.min(dist / 32, 2) * 0.5, T = e.tgt;
  const target = V(T.pos.x + T.vel.x * lead + rand(-1.5, 1.5), T.pos.y + 1.0 + rand(-0.5, 0.5), T.pos.z + T.vel.z * lead + rand(-1.5, 1.5));
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
  rockets.push({ m, vel, life: 5, rid: rocketSeq++ });
  SFX.playRocketLaunch(from);
  for (let i = 0; i < 10; i++) {
    spawnParticle(from.clone(), V(rand(-1.5, 1.5), rand(0, 1), rand(-1.5, 1.5)).addScaledVector(vel, -0.06), { tex: TEX.smoke, color: 0xd0c8b8, size: rand(0.8, 1.4), life: rand(1.5, 2.5), opacity: 0.6, grav: 0.3, grow: 1, drag: 2 });
  }
  enemyMuzzleFlash(from);
}

// `bot` is the squad member who fired, or null for the player.
function damageEnemy(e, dmg, point, dir, headshot, credit = null) {
  if (e.dead) return { kill: true, head: !!headshot };
  e.hp -= dmg;
  e.flinch = 0.25;
  if (!e.vis) { e.seen = true; e.vis = true; e.reactT = 0.35; }
  if (point) { bloodFx(point, dir); SFX.playFlesh(point); }
  if (e.hp <= 0) killEnemy(e, headshot, false, dir, false, credit);
  return { kill: !!e.dead, head: !!headshot };
}
function killEnemy(e, headshot, byNade, dir, blast = false, credit = null) {
  e.dead = true;
  e.headDead = !!headshot;
  S.alive--;
  const pts = e.t.sniper ? 60 : e.t.rocket ? 50 : 30;
  if (credit && credit.remote) net.send({ t: 'marker', kill: true, head: !!headshot, nade: !!byNade, tally: true, pts }, credit.id);
  else if (!credit) {
    player.kills++;
    player.score += pts;
    if (headshot) player.headshots++;
  }
  if (e.glint) e.glint.visible = false;
  const fx = Math.sin(e.rot), fz = Math.cos(e.rot);
  e.fallDir = dir && dir.x * fx + dir.z * fz > 0 ? 1 : -1;
  e.fallRoll = rand(-0.3, 0.3);
  e.ch.die({ dir: e.fallDir, roll: e.fallRoll, headshot, blast });
  rebuildHitList();
  addKillfeed(e, headshot, byNade, credit);
  const r = Math.random();
  if (r < 0.1) spawnPickup('ammo', e.pos);
  else if (r < 0.14) spawnPickup('ifak', e.pos);
  else if (r < 0.17) spawnPickup('plate', e.pos);
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
    const near = r.m.position.distanceTo(pp) < 1.1
      || squad.alive().some((b) => r.m.position.distanceTo(tmpV.set(b.pos.x, b.pos.y + 1, b.pos.z)) < 1.1)
      || (net && net.targets().some((h) => r.m.position.distanceTo(tmpV.set(h.pos.x, h.pos.y + 1, h.pos.z)) < 1.1));
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
// G pulls the pin and throws; holding G keeps the pin pulled and the grenade cooking in hand.
// The fuse starts when the pin comes out, so a grenade held for the full fuse goes off in the hand.
const NADE_FUSE = 4;
const nade = { phase: null, t: 0, cook: -1, held: false, cocked: false, released: false };
// Karambit stab. t < 0 is ready; the hit is resolved when the thrust lands.
const stab = { t: -1 };
const STAB_DMG = 75, STAB_RANGE = 1.75;
function startGrenade() {
  if (S.state !== 'playing' || nade.phase || player.frags <= 0 || S.nadeCD > 0 || S.reloading || S.ifakT > 0 || S.switchT > 0) return;
  Object.assign(nade, { phase: 'pull', t: 0, cook: -1, held: true, cocked: false, released: false });
  stab.t = -1;
  S.boltT = 0;
  SFX.playGear();
}
function nadeHandPos(out) {
  const f = V(0, 0, -1).applyQuaternion(camera.quaternion);
  return out.set(player.pos.x, player.pos.y + player.eye - 0.25, player.pos.z).addScaledVector(f, 0.35);
}
function launchGrenade(fuse, dropped = false) {
  const dir = V(0, 0, -1).applyQuaternion(camera.quaternion);
  let pos, vel;
  if (dropped) {
    pos = V(player.pos.x, player.pos.y + 0.9, player.pos.z);
    vel = V(rand(-1, 1), 1, rand(-1, 1)).add(player.vel);
  } else {
    pos = V(player.pos.x, player.pos.y + player.eye, player.pos.z).addScaledVector(dir, 0.6);
    vel = dir.multiplyScalar(17).add(V(0, 3.5, 0)).add(player.vel);
  }
  if (net && net.isClient) {
    net.send({ t: 'nade', x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, fuse });
    return;
  }
  const g = makeGrenadeMesh();
  g.spoon.visible = g.ring.visible = false;
  g.root.position.copy(pos);
  scene.add(g.root);
  grenades.push({ m: g.root, pos, vel, fuse, gid: nadeSeq++ });
}
function updateGrenade(dt) {
  if (!nade.phase) return;
  nade.t += dt;
  if (nade.cook >= 0 && !nade.released) {
    nade.cook += dt;
    if (nade.cook >= NADE_FUSE) {
      const p = nadeHandPos(V());
      nade.phase = null;
      if (net && net.isClient) {
        net.send({ t: 'boom', x: p.x, y: p.y, z: p.z });
        explosionFx(p, 1);
      } else {
        explode(p, 9, 210, true, UP, V(p.x, groundHeightAt(p.x, p.z, p.y, 0), p.z));
        damagePlayer(1000, p, true);
      }
      S.switchT = 0.45;
      return;
    }
  }
  const T = NADE_TIMING;
  if (nade.phase === 'pull') {
    if (nade.cook < 0 && nade.t >= T.pinOut) { nade.cook = 0; player.frags--; SFX.playPin(); }
    if (nade.t >= T.pull) { nade.phase = nade.held ? 'hold' : 'throw'; nade.t = 0; }
  } else if (nade.phase === 'hold') {
    if (!nade.held) { nade.cocked = nade.t >= T.cock; nade.phase = 'throw'; nade.t = 0; }
  } else if (nade.phase === 'throw') {
    if (!nade.released && nade.t >= T.release) {
      nade.released = true;
      launchGrenade(NADE_FUSE - nade.cook);
      SFX.playGear();
    }
    if (nade.t >= T.throw) { nade.phase = null; S.switchT = 0.45; S.nadeCD = 0.3; }
  }
}
// Dying with a live grenade in hand drops it at the player's feet.
function dropLiveGrenade() {
  if (nade.phase && nade.cook >= 0 && !nade.released) launchGrenade(NADE_FUSE - nade.cook, true);
  nade.phase = null;
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
      explode(gr.pos.clone().add(V(0, 0.2, 0)), 9, 210, true, UP, V(gr.pos.x, groundHeightAt(gr.pos.x, gr.pos.z, gr.pos.y + 0.1, 0), gr.pos.z), gr.killer || null);
      scene.remove(gr.m);
      grenades.splice(i, 1);
    }
  }
}
function explode(pos, radius, maxDmg, byPlayer, normal, surfPoint, credit = null) {
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
      if (byPlayer && !credit) showHitmarker(e.hp - dmg <= 0);
      e.hp -= dmg; e.flinch = 0.5;
      if (e.hp <= 0) killEnemy(e, false, byPlayer, c.clone().sub(pos).normalize(), true, credit);
    }
  }
  const pc = V(player.pos.x, player.pos.y + 1, player.pos.z);
  const pd = pc.distanceTo(pos);
  if (pd < radius && hasLOS(pos, pc)) damagePlayer(maxDmg * (byPlayer ? 0.6 : 1) * (1 - pd / radius), pos, true);
  if (net) {
    for (const h of net.targets()) {
      const c = V(h.pos.x, h.pos.y + 1, h.pos.z);
      const d = c.distanceTo(pos);
      if (d < radius && hasLOS(pos, c)) net.hurt(h.netId, (d < 1.2 ? maxDmg : maxDmg * (byPlayer ? 0.6 : 1) * (1 - d / radius)), pos, true);
    }
  }
  if (!byPlayer) squad.blast(pos, radius, maxDmg);
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
  if (player.prone) s *= 0.45;
  else if (player.crouch) s *= 0.7;
  s += S.bloom * (1 - S.adsT * 0.5);
  return s * (1 - 0.35 * mount.k);
}
const raycaster = new THREE.Raycaster();
raycaster.layers.set(LAYER_HITBOX);

function vmToWorld(m, local, out) {
  out.copy(local);
  m.group.localToWorld(out);
  return camera.localToWorld(out);
}
const muzzleWorld = (w, out) => (tpActive() ? body.muzzleWorld(out) : vmToWorld(w.model, w.model.muzzle, out));

// Shot origin and orientation. In third person the crosshair ray is cast from the camera, and the
// shot travels from the player's eye to whatever that ray hits, so walls behind the player don't count.
const aimO = V(), aimQ = new THREE.Quaternion(), aimM = new THREE.Matrix4();
function aimBasis() {
  if (!tpActive()) { aimO.copy(camera.position); aimQ.copy(camera.quaternion); return; }
  aimO.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  const f = V(0, 0, -1).applyQuaternion(camera.quaternion);
  const start = camera.position.clone().addScaledVector(f, Math.max(0, aimO.clone().sub(camera.position).dot(f)));
  const wh = raycastWorld(start, f, 800);
  raycaster.set(start, f);
  raycaster.far = wh ? wh.t : 800;
  const hits = raycaster.intersectObjects(enemyHitMeshes, false);
  const target = hits.length ? hits[0].point : wh ? wh.point : start.clone().addScaledVector(f, 800);
  if (target.distanceTo(aimO) < 0.5) { aimQ.copy(camera.quaternion); return; }
  aimQ.setFromRotationMatrix(aimM.lookAt(aimO, target, UP));
}

function fireRay(w, spread) {
  const def = w.def;
  aimBasis();
  const q = aimQ;
  const dir = V(0, 0, -1).applyQuaternion(q);
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  dir.addScaledVector(V(1, 0, 0).applyQuaternion(q), Math.cos(a) * r);
  dir.addScaledVector(V(0, 1, 0).applyQuaternion(q), Math.sin(a) * r);
  dir.normalize();
  const origin = aimO.clone();
  const maxD = 800;
  const wh = raycastWorld(origin, dir, maxD);
  raycaster.set(origin, dir);
  raycaster.far = wh ? wh.t : maxD;
  const hits = raycaster.intersectObjects(enemyHitMeshes, false);
  let end;
  if (net && net.isClient) net.send({ t: 'shot', ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, weapon: w.id });
  if (hits.length && !(net && net.isClient)) {
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
  } else if (hits.length) {
    end = hits[0].point;
  } else if (wh) {
    impactFx(wh.point, wh.normal, wh.surf);
    addDecal(wh.point, wh.normal);
    SFX.playImpact(wh.point, wh.surf);
    end = wh.point;
  } else end = origin.clone().addScaledVector(dir, maxD);

  w.shotN++;
  if (def.tracerEvery && w.shotN % def.tracerEvery === 0) {
    spawnTracer(muzzleWorld(w, V()), end, 0xffc880, 0.018, 700);
  }
}

function ejectCasing(w) {
  const m = w.model, d = w.def;
  const tp = tpActive();
  const port = tp ? body.ejectWorld(V()) : vmToWorld(m, tmpV2.set(0.03, d.type === 'pistol' ? 0.035 : 0.04, m.eject), V());
  const right = tp ? body.rightWorld(V()) : V(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = V(0, 1, 0).applyQuaternion(camera.quaternion);
  const fwd = V(0, 0, -1).applyQuaternion(camera.quaternion);
  const vel = right.multiplyScalar(rand(2, 3.2)).addScaledVector(up, rand(1.5, 2.6)).addScaledVector(fwd, rand(-0.6, 0.3)).add(player.vel);
  if (d.type === 'lmg') vel.set(rand(-0.5, 0.5), -1, rand(-0.5, 0.5)).add(player.vel);
  spawnCasing(port, vel, d.type === 'pistol' ? 'pistol' : 'rifle', player.pos.y, (p) => SFX.playCasing(p, d.type === 'pistol'));
}

function meleeStrike() {
  if (net && net.isClient) {
    net.send({ t: 'stab', x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, prone: !!player.prone });
    return;
  }
  resolveMelee(player, null);
}
function resolveMelee(at, credit) {
  const fx = -Math.sin(at.yaw), fz = -Math.cos(at.yaw);
  const origin = V(at.pos.x, at.pos.y + (at.prone ? 0.4 : 1.05), at.pos.z);
  let best = null, bestD = STAB_RANGE;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - at.pos.x, dz = e.pos.z - at.pos.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz > STAB_RANGE || horiz < 0.05) continue;
    if (Math.abs(e.pos.y + 1 - origin.y) > 1.5) continue;
    if ((dx * fx + dz * fz) / horiz < 0.4) continue;
    if (!hasLOS(origin, V(e.pos.x, e.pos.y + 1, e.pos.z))) continue;
    if (horiz < bestD) { best = e; bestD = horiz; }
  }
  if (!best) return;
  const bx = at.pos.x - best.pos.x, bz = at.pos.z - best.pos.z;
  const behind = Math.hypot(bx, bz) || 1;
  // Enemy forward is (sin rot, cos rot); the player is behind when that points away from them.
  const back = (bx * Math.sin(best.rot) + bz * Math.cos(best.rot)) / behind < -0.5;
  const point = V(best.pos.x, best.pos.y + (back ? 1.15 : 1.05), best.pos.z);
  const willKill = back || best.hp - STAB_DMG <= 0;
  if (back && !credit) flashMsg('BACKSTAB', 0.8);
  const hit = damageEnemy(best, back ? 9999 : STAB_DMG, point, V(fx, 0.1, fz), false, credit);
  if (credit && credit.remote) { if (!hit.kill) net.send({ t: 'marker', kill: false, head: back }, credit.id); }
  else showHitmarker(willKill, back);
}
function tryStab() {
  if (stab.t >= 0 || nade.phase || S.switchT > 0 || S.ifakT > 0 || player.sprinting || S.fireCD > 0 || S.inspectT >= 0) return;
  if (!S.triggerFresh) return;
  S.triggerFresh = false;
  stab.t = 0;
  stab.landed = false;
  S.fireCD = STAB_TIMING.dur + 0.08;
  SFX.playSwoosh();
}
function updateStab(dt) {
  if (stab.t < 0) return;
  stab.t += dt;
  if (!stab.landed && stab.t >= STAB_TIMING.hit) { stab.landed = true; meleeStrike(); }
  if (stab.t >= STAB_TIMING.dur) stab.t = -1;
}
function tryFire() {
  const w = curW(), d = w.def;
  if (d.type === 'melee') { tryStab(); return; }
  if (nade.phase || S.switchT > 0 || S.reloading || S.ifakT > 0 || player.sprinting || S.fireCD > 0 || S.boltT > 0 || S.inspectT >= 0) return;
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
  // A mounted LMG rests on its bipod, so it steadies even more.
  const braced = mount.k * (d.type === 'lmg' && mount.type === 'top' ? 0.75 : 0.6);
  const rm = (S.adsT > 0.5 ? 0.7 : 1) * (player.prone ? 0.6 : player.crouch ? 0.8 : 1) * (1 - braced);
  player.recoilP += d.recoil * rm * rand(0.8, 1.2);
  player.pitch += d.recoil * 0.3 * rm;
  player.yaw += (Math.random() - 0.5) * d.recoil * 0.7 * rm;
  S.bloom = Math.min(S.bloom + d.bloomPerShot * (1 - braced * 0.8), 0.08);
  S.kick = 1 - braced * 0.5;
  S.flashT = 0.045;
  const f = w.model.flash;
  f.visible = true;
  f.rotation.z = Math.random() * Math.PI;
  f.scale.setScalar(rand(0.75, 1.25));
  if (tpActive()) body.fire();
  muzzleWorld(w, muzzleLight.position);
  muzzleLight.intensity = d.type === 'pistol' ? 25 : 45;
  vmFlash.position.copy(w.model.muzzle).applyMatrix4(w.model.group.matrix);
  vmFlash.intensity = 1.2;
  spawnParticle(muzzleLight.position.clone(), V(rand(-0.2, 0.2), 0.3, rand(-0.2, 0.2)), { tex: TEX.smoke, color: 0xc8c0b0, size: 0.25, life: 0.9, opacity: 0.22, grav: 0.3, grow: 1.8, drag: 2 });
  if (mode !== 'BOLT') ejectCasing(w);
  SFX.playShot(d.sound, null);
}

function startReload() {
  const w = curW(), d = w.def;
  if (d.type === 'melee' || nade.phase || S.reloading || S.switchT > 0 || S.ifakT > 0) return;
  const cap = d.mag + (d.chamber && w.mag > 0 ? 1 : 0);
  if (w.mag >= cap) return;
  if (w.reserve <= 0) { flashMsg('NO RESERVE AMMO', 1.2); return; }
  S.reloading = true;
  S.reloadT = 0;
  const empty = w.mag === 0;
  S.reloadDur = empty ? d.reloadEmpty : d.reload;
  S.reloadEmpty = empty;
  S.adsT = Math.min(S.adsT, 0.3);
  const pistol = d.type === 'pistol';
  const dur = S.reloadDur;
  SFX.playGear();
  SFX.playMagOut(dur * (pistol ? 0.08 : empty ? 0.1 : 0.22));
  SFX.playMagIn(dur * (pistol ? 0.64 : empty ? 0.62 : 0.74));
  if (d.type === 'sniper') SFX.playBolt(dur * 0.85);
  else if (empty) SFX.playBolt(dur * (pistol ? 0.85 : 0.82));
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
  if (nade.phase || i === player.cur || i < 0 || i >= player.weapons.length || S.ifakT > 0) return;
  player.cur = i;
  stab.t = -1;
  S.inspectT = -1;
  S.reloading = false;
  S.boltT = 0;
  S.switchT = 0.5;
  S.adsT = 0;
  SFX.playGear();
  SFX.playClick(0.15, 700, 0.18);
}
function useIfak() {
  if (nade.phase || player.ifaks <= 0 || player.hp >= 100 || S.ifakT > 0) return;
  S.reloading = false;
  S.inspectT = -1;
  S.ifakT = MED_TIMING.dur;
  S.medSfx = 0;
  SFX.playGear();
}
// Sounds keyed to the bandage animation: tear the pack, one stretch per turn, clip the bar.
function medSounds(t) {
  const T = MED_TIMING, turn = (T.wrapEnd - T.present) / T.turns;
  const cues = [T.tear + 0.03, ...Array.from({ length: T.turns }, (_, i) => T.present + i * turn), T.fasten - 0.06];
  while (S.medSfx < cues.length && t >= cues[S.medSfx]) {
    const i = S.medSfx++;
    if (i === 0) SFX.playTear();
    else if (i === cues.length - 1) SFX.playClick(0, 1300, 0.25);
    else SFX.playWrap();
  }
}
const SHOP = [
  { id: 'mag', name: 'Magazine', detail: 'One mag for the gun in your hands', price: 20 },
  { id: 'frag', name: 'M67 frag', detail: 'One grenade', price: 25 },
  { id: 'ifak', name: 'IFAK', detail: 'Israeli bandage', price: 40 },
  { id: 'plate', name: 'Armor plate', detail: 'Restore 40 armor', price: 50 },
  { id: 'glock', name: 'Glock 17', detail: '9mm sidearm', price: 90, weapon: 'glock' },
  { id: 'jericho', name: 'Jericho 941', detail: 'IWI 9mm sidearm', price: 120, weapon: 'jericho' },
  { id: 'tavor', name: 'Tavor X95', detail: 'IWI bullpup rifle', price: 200, weapon: 'tavor' },
  { id: 'm4', name: 'M4A1', detail: 'Carbine', price: 220, weapon: 'm4' },
  { id: 'negev', name: 'Negev', detail: 'IWI light machine gun', price: 340, weapon: 'negev' },
  { id: 'm24', name: 'M24 SWS', detail: '7.62 marksman rifle', price: 400, weapon: 'm24' },
];
const shopOpen = { on: false };
let suppressPause = false;
function nearShekem() {
  const p = world.shekemPos || world.resupplyPos;
  return p && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 3.2;
}
function matchNote(text) {
  const log = $('match-log');
  if (!log || !text) return;
  const el = document.createElement('div');
  el.className = 'match-line';
  el.textContent = text;
  log.appendChild(el);
  while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => el.remove(), 8000);
}
function renderShop() {
  $('shop-points').textContent = `POINTS  ${player.score}`;
  const list = $('shop-list');
  list.replaceChildren(...SHOP.map((item) => {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const owned = item.weapon && player.weapons.some((w) => w.id === item.weapon);
    const info = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = item.name;
    const detail = document.createElement('small');
    detail.textContent = item.detail;
    info.append(title, detail);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = owned ? 'EQUIPPED' : String(item.price);
    btn.disabled = owned || player.score < item.price;
    btn.onclick = () => buyItem(item);
    row.append(info, btn);
    return row;
  }));
}
function openShop() {
  if (S.state !== 'playing' || shopOpen.on || !nearShekem()) return;
  shopOpen.on = true;
  suppressPause = true;
  renderShop();
  $('shop').classList.remove('hidden');
  document.exitPointerLock();
}
function closeShop() {
  if (!shopOpen.on) return;
  shopOpen.on = false;
  $('shop').classList.add('hidden');
  if (S.state === 'playing') canvas.requestPointerLock();
}
function discardWeapon(w) {
  if (!w?.model) return;
  w.model.group.removeFromParent();
  w.model.arms.removeFromParent();
}
function buyItem(item) {
  if (!shopOpen.on || player.score < item.price) { renderShop(); return; }
  if (item.id === 'mag') {
    const w = curW();
    if (w.def.type === 'melee') { flashMsg('SWITCH TO A GUN', 1); return; }
    const cap = w.def.mag * (w.def.reserveMags + 3);
    if (w.reserve >= cap) { flashMsg('AMMO FULL', 1); return; }
    w.reserve = Math.min(cap, w.reserve + w.def.mag);
  } else if (item.id === 'frag') {
    if (player.frags >= 6) { flashMsg('GRENADES FULL', 1); return; }
    player.frags++;
  } else if (item.id === 'ifak') {
    if (player.ifaks >= 5) { flashMsg('IFAKS FULL', 1); return; }
    player.ifaks++;
  } else if (item.id === 'plate') {
    if (player.armor >= player.armorMax - 0.5) { flashMsg('ARMOR FULL', 1); return; }
    player.armor = Math.min(player.armorMax, player.armor + 40);
    if (net && net.isClient) net.send({ t: 'armor', v: player.armor });
  } else if (item.weapon) {
    if (player.weapons.some((w) => w.id === item.weapon)) { renderShop(); return; }
    const def = WEAPONS[item.weapon];
    const slot = def.type === 'pistol' ? 1 : 0;
    discardWeapon(player.weapons[slot]);
    player.weapons[slot] = makeWeapon(item.weapon);
    player.cur = slot;
    body.setWeapon(item.weapon);
  }
  player.score -= item.price;
  SFX.playGear();
  renderShop();
}

function damagePlayer(amount, fromPos, explosive) {
  if (!playerInFight()) return;
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
  if (player.hp <= 0) {
    player.hp = 0;
    // Fall away from whoever landed the killing shot.
    const front = !fromPos || (fromPos.x - player.pos.x) * -Math.sin(player.yaw) + (fromPos.z - player.pos.z) * -Math.cos(player.yaw) > 0;
    gameOver(!!explosive, front ? -1 : 1);
  }
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
  mount: $('mount'), squad: $('squad'), nadeTimer: $('nade-timer'),
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
function escHud(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function addKillLine(who, weapon, enemy, head) {
  const el = document.createElement('div');
  el.className = 'kf';
  const you = who === 'You';
  el.innerHTML = `<span class="${you ? 'you' : 'mate'}">${escHud(who)}</span> <span class="wp">[${escHud(weapon)}]</span> <span class="en">${escHud(enemy)}</span>${head ? ' <span class="hs">HEADSHOT</span>' : ''}`;
  hud.kf.prepend(el);
  while (hud.kf.children.length > 5) hud.kf.lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
function addKillfeed(e, head, nade, bot = null) {
  const weapon = nade ? 'M67 Frag' : bot && bot.def ? bot.def.name : curW().def.name;
  const who = bot && bot.name ? bot.name : 'You';
  addKillLine(who, weapon, e.t.name, head);
  if (net && net.isHost) {
    net.send({
      t: 'feed',
      id: bot && bot.remote ? bot.id : 0,
      name: bot && bot.name ? bot.name : net.selfName(),
      weapon,
      enemy: e.t.name,
      head: !!head,
    });
  }
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
  hud.wCal.textContent = d.type === 'melee' ? d.optic : `${d.caliber} · ${d.optic}`;
  hud.mag.textContent = d.type === 'melee' ? '—' : w.mag;
  hud.mag.classList.toggle('low', d.type !== 'melee' && w.mag <= Math.ceil(d.mag * 0.2));
  hud.reserve.textContent = d.type === 'melee' ? '' : '/ ' + w.reserve;
  hud.mode.textContent = S.reloading ? 'RELOADING…' : d.type === 'melee' ? (stab.t >= 0 ? 'STABBING' : 'MELEE') : d.modes[w.mode];
  hud.slots.innerHTML = player.weapons.map((x, i) => `<span class="${i === player.cur ? 'active' : ''}">[${i + 1}] ${x.def.tag || x.def.name}</span>`).join(' &nbsp; ');
  hud.kills.textContent = player.kills;
  hud.score.textContent = player.score;
  hud.hostiles.textContent = S.alive + S.toSpawn;
  hud.wave.textContent = 'WAVE ' + S.wave;
  hud.obj.textContent = S.intermission > 0
    ? (S.wave === 0 ? `Deploying — hostiles expected in ${Math.ceil(S.intermission)}s` : `Sector clear — next wave in ${Math.ceil(S.intermission)}s · The Shekem is by the Merkava`)
    : 'Eliminate militants emerging from the tunnel shafts';

  const scoped = d.scope && S.adsT > 0.9;
  hud.scope.style.display = scoped ? 'block' : 'none';
  const sp = currentSpread();
  hud.cross.style.setProperty('--gap', (6 + sp * 500) + 'px');
  hud.cross.style.opacity = (S.adsT > 0.5 && !tpActive()) || player.sprinting ? 0 : 1;

  if (hitT > 0) { hitT -= dt; if (hitT <= 0) hud.hit.style.opacity = 0; }
  if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) hud.msg.style.opacity = 0; }

  if (S.ifakT > 0) {
    hud.prog.classList.remove('hidden');
    hud.progLabel.textContent = 'APPLYING IFAK';
    hud.progBar.style.width = (1 - S.ifakT / MED_TIMING.dur) * 100 + '%';
  } else if (S.reloading) {
    hud.prog.classList.remove('hidden');
    hud.progLabel.textContent = 'RELOADING';
    hud.progBar.style.width = (S.reloadT / S.reloadDur) * 100 + '%';
  } else hud.prog.classList.add('hidden');

  if (nearShekem() && !shopOpen.on) {
    hud.prompt.style.display = 'block';
    hud.prompt.innerHTML = 'Press <kbd>F</kbd> — שק״ם Shekem';
  } else hud.prompt.style.display = 'none';

  hud.mount.className = mount.k > 0.5 ? 'on' : mount.can ? 'can' : '';
  hud.mount.textContent = mount.k > 0.5 ? (mount.type === 'top' ? 'MOUNTED · LEDGE' : 'MOUNTED · CORNER') : 'RMB · MOUNT';

  const live = nade.phase && nade.cook >= 0 && !nade.released;
  hud.nadeTimer.style.display = live ? 'block' : 'none';
  if (live) {
    const left = Math.max(0, NADE_FUSE - nade.cook);
    hud.nadeTimer.lastChild.textContent = left.toFixed(1);
    hud.nadeTimer.classList.toggle('danger', left < 1.5);
  }

  const mates = [
    ...squad.bots.map((b) => ({ name: b.name, tag: b.alive ? b.tag : 'DOWN', hp: b.hp, down: !b.alive })),
    ...(net ? net.roster() : []),
  ];
  hud.squad.style.display = mates.length ? 'block' : 'none';
  mates.forEach((b, i) => {
    let row = hud.squad.children[i];
    if (!row) {
      row = document.createElement('div');
      row.className = 'mate-row';
      row.innerHTML = '<span></span><div class="bar"><div></div></div>';
      hud.squad.appendChild(row);
    }
    row.firstChild.textContent = `${b.name} · ${b.tag}`;
    row.classList.toggle('down', b.down);
    row.lastChild.firstChild.style.width = Math.max(0, Math.min(100, b.hp)) + '%';
  });
  while (hud.squad.children.length > mates.length) hud.squad.lastChild.remove();
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
  for (const e of (net && net.isClient ? net.enemyMarks() : enemies)) {
    if (e.dead || e.emerge > 0) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d > 45 && !e.vis) continue;
    c.fillStyle = (e.sniper || e.t?.sniper) ? '#ffcf3c' : '#ff4a3c';
    c.beginPath(); c.arc(e.pos.x, e.pos.z, 1.6, 0, 7); c.fill();
  }
  if (net && net.online) {
    c.fillStyle = '#9ad0ff';
    for (const b of net.peerMarks()) { c.beginPath(); c.arc(b.x, b.z, 1.5, 0, 7); c.fill(); }
  }
  for (const b of squad.bots) {
    c.fillStyle = b.alive ? '#6ec8ff' : 'rgba(110,200,255,0.35)';
    c.beginPath(); c.arc(b.pos.x, b.pos.z, 1.5, 0, 7); c.fill();
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
  if (e.code === 'Escape' && shopOpen.on) { closeShop(); e.preventDefault(); return; }
  if (S.state !== 'playing' || shopOpen.on) return;
  switch (e.code) {
    case 'KeyR': startReload(); break;
    case 'Digit1': switchWeapon(0); break;
    case 'Digit2': switchWeapon(1); break;
    case 'Digit3': switchWeapon(2); break;
    case 'KeyQ': switchWeapon(player.cur === 0 ? 1 : 0); break;
    case 'KeyB': { const w = curW(); if (w.def.modes.length > 1) { w.mode = (w.mode + 1) % w.def.modes.length; SFX.playClick(0, 2000, 0.15); } break; }
    case 'KeyG': if (!e.repeat) startGrenade(); break;
    case 'KeyH': useIfak(); break;
    case 'KeyF': openShop(); break;
    case 'KeyI':
      if (S.inspectT < 0 && !nade.phase && !S.reloading && S.switchT <= 0 && stab.t < 0 && S.ifakT <= 0) { S.inspectT = 0; SFX.playGear(); }
      break;
    case 'KeyC': player.crouch = !player.crouch; if (player.crouch) player.prone = false; SFX.playGear(); break;
    case 'KeyZ':
      if (player.onGround || player.prone) { player.prone = !player.prone; if (player.prone) player.crouch = false; SFX.playGear(); }
      break;
    case 'KeyV':
      S.thirdPerson = !S.thirdPerson;
      localStorage.setItem('idf-tp', S.thirdPerson ? '1' : '0');
      flashMsg(S.thirdPerson ? 'THIRD PERSON' : 'FIRST PERSON', 0.8);
      break;
    case 'Space':
      if (player.prone) { player.prone = false; SFX.playGear(); break; }
      if (player.onGround && S.ifakT <= 0) { player.vy = 6.2; player.onGround = false; player.crouch = false; SFX.playGear(); }
      break;
  }
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyG') nade.held = false;
});
document.addEventListener('mousedown', (e) => {
  if (shopOpen.on) return;
  if (e.button === 0 && S.state === 'dead' && net && net.online) spectateI++;
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
document.addEventListener('wheel', (e) => {
  if (S.state !== 'playing') return;
  const n = player.weapons.length;
  switchWeapon((player.cur + (e.deltaY > 0 ? 1 : -1) + n) % n);
});
document.addEventListener('mousemove', (e) => {
  if (S.state !== 'playing' || document.pointerLockElement !== canvas) return;
  const sens = 0.0022 * (settings.sens / 100) * (camera.fov / lookFov());
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = clamp(player.pitch, -1.5, 1.5);
  mouseDX += e.movementX; mouseDY += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { suppressPause = false; return; }
  if (suppressPause || shopOpen.on) return;
  if (S.state === 'playing') pauseGame();
});

// ============================================================
//  GAME FLOW
// ============================================================
function applyShot(peer, m) {
  if (!peer.alive) return;
  const origin = V(m.ox, m.oy, m.oz);
  const dir = V(m.dx, m.dy, m.dz);
  if (![origin.x, origin.y, origin.z, dir.x, dir.y, dir.z].every((n) => Number.isFinite(n)) || dir.lengthSq() < 1e-8) return;
  const eye = V(peer.x, peer.y + (peer.eye || 1.6), peer.z);
  if (origin.distanceTo(eye) > 3 && origin.distanceTo(V(peer.x, peer.y, peer.z)) > 3) return;
  const now = performance.now();
  if (peer.shotAt && now - peer.shotAt < 45) return;
  peer.shotAt = now;
  const def = WEAPONS[m.weapon];
  if (!def || def.type === 'melee') return;
  dir.normalize();
  const wh = raycastWorld(origin, dir, 800);
  raycaster.set(origin, dir);
  raycaster.far = wh ? wh.t : 800;
  const hits = raycaster.intersectObjects(enemyHitMeshes, false);
  if (!hits.length) return;
  const h = hits[0];
  const e = h.object.userData.enemy;
  if (!e || e.dead) return;
  const part = h.object.userData.part;
  const head = part === 'head';
  let dmg = def.damage * (head ? def.headMult : part === 'legs' ? 0.75 : 1);
  if (h.distance > def.range) dmg *= 0.75;
  const credit = { name: peer.name, def: { name: def.tag || def.name }, remote: true, id: peer.id };
  const hit = damageEnemy(e, dmg, h.point, dir, head, credit);
  if (!hit.kill) net.send({ t: 'marker', kill: false, head }, peer.id);
  if (def.tracerEvery) spawnTracer(origin, h.point, 0xffc880, 0.018, 700);
}
function applyStab(peer, m) {
  if (!peer.alive || !Number.isFinite(m.x)) return;
  const at = { pos: V(m.x, m.y, m.z), yaw: m.yaw, prone: !!m.prone };
  if (at.pos.distanceTo(V(peer.x, peer.y, peer.z)) > 3) at.pos.set(peer.x, peer.y, peer.z);
  resolveMelee(at, { name: peer.name, def: { name: 'Karambit' }, remote: true, id: peer.id });
}
function throwerCredit(peer) {
  return { name: peer.name, def: { name: 'M67 Frag' }, remote: true, id: peer.id };
}
function spawnGrenadeFrom(peer, m) {
  if (!peer.alive) return;
  const pos = V(m.x, m.y, m.z);
  const feet = V(peer.x, peer.y, peer.z);
  if (pos.distanceTo(feet) > 12) pos.set(peer.x, peer.y + (peer.eye || 1.6), peer.z);
  const vel = V(m.vx, m.vy, m.vz);
  if (vel.length() > 40) vel.setLength(40);
  const g = makeGrenadeMesh();
  g.spoon.visible = g.ring.visible = false;
  g.root.position.copy(pos);
  scene.add(g.root);
  grenades.push({
    m: g.root, pos, vel, fuse: Math.min(4, Math.max(0.05, m.fuse || 1)), gid: nadeSeq++,
    killer: throwerCredit(peer),
  });
}
function explodeFrom(peer, m) {
  const p = V(m.x, m.y, m.z);
  if (p.distanceTo(V(peer.x, peer.y + 1, peer.z)) > 4) p.set(peer.x, peer.y + 1, peer.z);
  explode(p, 9, 210, true, UP, V(p.x, groundHeightAt(p.x, p.z, p.y, 0), p.z), throwerCredit(peer));
}
function netRevive() {
  player.hp = 100;
  player.armor = player.armorMax;
  if (S.state !== 'dead') return;
  S.state = 'playing';
  S.tpDead = false;
  S.deadT = 0;
  camera.rotation.z = 0;
  body.revive();
  $('gameover').classList.add('hidden');
  $('gameover').classList.remove('spectate-mode');
  $('spectate').classList.add('hidden');
  $('hud').classList.remove('hidden');
  canvas.requestPointerLock();
}
function clearEntities() {
  for (const e of enemies.slice()) removeEnemy(e);
  for (const g of grenades) scene.remove(g.m);
  grenades.length = 0;
  for (const r of rockets) scene.remove(r.m);
  rockets.length = 0;
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  clearDecals();
  squad.clear();
  if (net) net.resetWorld();
  enemyHitMeshes = [];
  while (vmRoot.children.length) vmRoot.remove(vmRoot.children[0]);
  nadeVM = null;
  medVM = null;
  nade.phase = null;
}
function deploy(cls) {
  SFX.initAudio();
  clearEntities();
  player.cls = cls;
  player.weapons = [makeWeapon(cls.primary), makeWeapon(cls.secondary), makeWeapon('karambit')];
  player.cur = 0;
  player.hp = 100;
  player.armorMax = cls.armor;
  player.armor = cls.armor;
  player.ifaks = cls.ifaks;
  player.frags = cls.frags;
  player.pos.copy(world.spawn);
  player.vel.set(0, 0, 0);
  player.vy = 0; player.yaw = 0; player.pitch = 0; player.recoilP = 0; player.crouch = false; player.prone = false; player.eye = 1.65; player.onGround = true;
  player.kills = player.headshots = player.score = player.shots = player.hits = 0;
  Object.assign(S, {
    wave: 0, toSpawn: 0, spawnT: 0, intermission: 6, alive: 0, reloading: false, switchT: 0.5, ifakT: 0,
    fireCD: 0, boltT: 0, adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, shake: 0, hurtT: 0, flowT: 0, time: 0, inspectT: -1,
    supp: 0, flashW: 0, landDip: 0, punchP: 0, punchY: 0,
  });
  camera.rotation.z = 0;
  S.tpK = S.thirdPerson ? 1 : 0;
  S.camD = 2;
  S.tpDead = false;
  S.deadT = 0;
  Object.assign(mount, { k: 0, can: false, on: false, type: null, side: 0 });
  body.revive();
  body.setWeapon(player.weapons[0].id);
  squad.spawn(net && net.online ? 0 : botCount);
  if (net && net.isHost) net.hostBegan();
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
    S.intermission = 12;
    squad.reviveAll();
    if (net && net.isHost) {
      net.reviveHumans();
      if (player.hp <= 0 || S.state === 'dead') netRevive();
    }
    flashMsg(`WAVE ${S.wave} CLEARED\n<small>Regroup at the Shekem</small>`, 3);
  }
}
function hostMenuOpen() {
  return S.state === 'paused' && !!(net && net.isHost);
}
function playerInFight() {
  return S.state === 'playing' || hostMenuOpen();
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
function gameOver(explosive = false, fallDir = -1) {
  S.state = 'dead';
  shopOpen.on = false;
  $('shop').classList.add('hidden');
  $('pause').classList.add('hidden');
  dropLiveGrenade();
  S.tpDead = tpActive();
  S.deadT = 0;
  if (S.tpDead) body.die({ dir: fallDir, blast: explosive });
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
  shopOpen.on = false;
  $('shop').classList.add('hidden');
  suppressPause = false;
  if (net && net.isClient) net.depart();
  S.state = 'menu';
  document.exitPointerLock();
  clearEntities();
  body.root.visible = false;
  if (net && net.isHost) net.missionEnded();
  $('pause').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('spectate').classList.add('hidden');
  $('gameover').classList.remove('spectate-mode');
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
  if (player.sprinting) { player.crouch = false; player.prone = false; }
  let speed = 5 * player.cls.speed * (d.moveMult || 1);
  if (player.sprinting) speed *= 1.55;
  if (player.prone) speed *= 0.22;
  else if (player.crouch) speed *= 0.5;
  speed *= 1 - S.adsT * 0.4;
  if (S.ifakT > 0) speed *= 0.5;

  const accel = player.onGround ? 12 : 2.5;
  player.vel.x = lerp(player.vel.x, mx * speed, Math.min(1, accel * dt));
  player.vel.z = lerp(player.vel.z, mz * speed, Math.min(1, accel * dt));
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  resolveCollisions(player.pos, player.prone ? 0.35 : 0.4, player.pos.y, player.prone ? 0.45 : player.crouch ? 1.2 : 1.8);
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

  player.eye = approach(player.eye, player.prone ? 0.32 : player.crouch ? 1.05 : 1.65, dt * 4);

  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && sp > 0.5) {
    const prev = S.bobT;
    S.bobT += dt * sp * 1.7;
    if (Math.floor(prev / Math.PI) !== Math.floor(S.bobT / Math.PI)) SFX.playStep(surfaceAt(player.pos.x, player.pos.z, player.pos.y), player.sprinting, player.crouch || player.prone);
  }
}

// Weapon mounting: aiming down sights while braced on a wall corner or over a waist-high ledge rests
// the weapon on the cover, cutting recoil and sway. `side` is +1 when the wall is on the right.
const mount = { k: 0, can: false, on: false, type: null, side: 0, checkT: 0 };
function solidAt(x, y, z) {
  for (const c of colliders) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < c.top && y > c.bottom) return true;
  return false;
}
function detectMount() {
  const gy = player.pos.y + player.eye - 0.18;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;
  const px = player.pos.x, pz = player.pos.z;
  // The line of fire itself must be open.
  if (solidAt(px + fx * 0.45, gy, pz + fz * 0.45) || solidAt(px + fx * 0.9, gy, pz + fz * 0.9)) return null;
  // Ledge: a cover top below the gun (but not a kerb underfoot), within reach ahead.
  const floor = Math.max(gy - 0.75, player.pos.y + 0.3);
  for (const d of [0.4, 0.6, 0.8]) {
    const x = px + fx * d, z = pz + fz * d;
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.top < gy - 0.02 && c.top > floor) return { type: 'top', side: 0 };
    }
  }
  // Corner: a wall edge within arm's reach to one side, i.e. solid and open samples along that side.
  for (const s of [1, -1]) {
    let solid = 0, open = 0;
    for (const d of [-0.2, 0.1, 0.4, 0.7, 1.0]) {
      if (solidAt(px + rx * s * 0.55 + fx * d, gy, pz + rz * s * 0.55 + fz * d)) solid++; else open++;
    }
    if (solid && open) return { type: 'corner', side: s };
  }
  return null;
}
// Shots leave from the eye along the aim, so the cover must not sit anywhere in the spread cone.
// While mounted the leaned-out camera is tested, otherwise the unleaned eye (which is closer to the wall).
const mountO = V(), mountF = V(), mountR = V(), mountU = V(), mountD = V();
function mountAimBlocked() {
  if (mount.on) mountO.copy(camera.position);
  else mountO.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  const y = player.yaw, p = player.pitch + player.recoilP;
  mountF.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  mountR.set(Math.cos(y), 0, -Math.sin(y));
  mountU.crossVectors(mountR, mountF);
  for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    mountD.copy(mountF).addScaledVector(mountR, a * 0.04).addScaledVector(mountU, b * 0.04).normalize();
    const h = raycastWorld(mountO, mountD, 4);
    if (h && !(h.normal.y === 1 && h.point.y < 0.005)) return true;
  }
  return false;
}
function updateMount(dt, d) {
  mount.checkT -= dt;
  if (mount.checkT <= 0) {
    mount.checkT = 0.1;
    const m = player.onGround && !player.prone && Math.hypot(player.vel.x, player.vel.z) < 1.5 && !player.sprinting && d.type !== 'pistol' && d.type !== 'melee' ? detectMount() : null;
    mount.can = !!m;
    if (m) { mount.type = m.type; mount.side = m.side; }
  }
  if (mount.can && mountAimBlocked()) mount.can = false;
  const on = mount.can && S.adsT > 0.6 && !S.reloading && !nade.phase;
  if (on && !mount.on) { SFX.playGear(); S.landDip = Math.max(S.landDip, 0.12); }
  mount.on = on;
  mount.k = approach(mount.k, on ? 1 : 0, dt * 6);
}

function updateWeapon(dt) {
  const w = curW(), d = w.def;
  updateMount(dt, d);
  S.fireCD -= dt; S.nadeCD -= dt; S.resupplyCD -= dt;
  if (S.boltT > 0) S.boltT -= dt;
  if (S.switchT > 0) S.switchT -= dt;
  updateGrenade(dt);
  updateStab(dt);
  if (S.inspectT >= 0) {
    const was = S.inspectT;
    S.inspectT += dt / (w.model?.inspectDur ?? 2.4);
    // Swishes of the karambit spinning on the finger.
    if (d.type === 'melee') for (const at of [0.54, 0.63]) if (was < at && S.inspectT >= at) SFX.playSwoosh();
    if (S.inspectT >= 1) S.inspectT = -1;
  }
  const wantAds = mouse.right && !player.sprinting && !S.reloading && S.switchT <= 0 && S.ifakT <= 0 && !nade.phase && d.type !== 'melee' && S.inspectT < 0;
  S.adsT = approach(S.adsT, wantAds ? 1 : 0, dt / d.adsTime);
  S.bloom *= Math.exp(-dt * 5);
  S.kick *= Math.exp(-dt * 14);
  player.recoilP *= Math.exp(-dt * 6);
  S.punchP *= Math.exp(-dt * 8); S.punchY *= Math.exp(-dt * 8);
  if (S.reloading) { S.reloadT += dt; if (S.reloadT >= S.reloadDur) finishReload(); }
  if (S.ifakT > 0) {
    S.ifakT -= dt;
    medSounds(MED_TIMING.dur - S.ifakT);
    if (S.ifakT <= 0) {
      player.hp = Math.min(100, player.hp + 50);
      player.ifaks--;
      if (net && net.isClient) net.send({ t: 'ifak' });
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
  const amp = (scoped ? (holding ? 0.0006 : 0.004 * (player.crouch ? 0.6 : 1)) : 0.0006 * S.adsT) * (1 - 0.85 * mount.k);
  const suppAmp = S.supp * 0.004 * (1 - 0.5 * mount.k);
  const swayP = Math.sin(S.swayT * 1.1) * (amp + suppAmp), swayY = Math.sin(S.swayT * 0.7) * (amp + suppAmp) * 1.3;

  const targetFov = scoped ? d.adsFov : lerp(lookFov(), d.scope ? 55 : d.adsFov, S.adsT) + (player.sprinting ? 6 : 0);
  const fov = lerp(camera.fov, targetFov, Math.min(1, dt * 18));
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const vmFov = lerp(58, 46, S.adsT);
  if (Math.abs(vmFov - vmCamera.fov) > 0.01) { vmCamera.fov = vmFov; vmCamera.updateProjectionMatrix(); }

  S.shake *= Math.exp(-dt * 4);
  const sh = S.shake * 0.08;
  const bobY = player.onGround ? -Math.abs(Math.sin(S.bobT)) * 0.025 * Math.min(Math.hypot(player.vel.x, player.vel.z) / 5, 1.5) * (1 - S.adsT * 0.7) : 0;
  // Corner mounts lean the head out past the edge, away from the wall.
  const lean = mount.type === 'corner' ? -mount.side * mount.k : 0;
  camera.position.set(
    player.pos.x + rand(-sh, sh) + Math.cos(player.yaw) * lean * 0.12,
    player.pos.y + player.eye + bobY - S.landDip * 0.15 + rand(-sh, sh),
    player.pos.z - Math.sin(player.yaw) * lean * 0.12,
  );
  camera.rotation.set(player.pitch + player.recoilP + swayP + S.punchP, player.yaw + swayY + S.punchY, Math.sin(S.bobT * 0.5) * 0.004 * (1 - S.adsT) - lean * 0.045);
  camera.updateMatrixWorld();

  // Over-the-shoulder camera, pulled in when a wall is behind the player. Scoped ADS goes back to first person.
  S.tpK = approach(S.tpK, S.thirdPerson && !(d.scope && S.adsT > 0.5) ? 1 : 0, dt * 5);
  if (S.tpK > 0) {
    const k = S.tpK * S.tpK * (3 - 2 * S.tpK);
    tpOff.set(lerp(0.55, 0.42, S.adsT), 0.14, lerp(2.3, 1.2, S.adsT)).applyQuaternion(camera.quaternion);
    const len = tpOff.length();
    tpOff.divideScalar(len);
    const hit = raycastWorld(camera.position, tpOff, len + 0.3);
    const want = hit ? Math.max(0.2, hit.t - 0.3) : len;
    S.camD = want < S.camD ? want : approach(S.camD, want, dt * 3);
    camera.position.addScaledVector(tpOff, S.camD * k);
    camera.updateMatrixWorld();
  }

  if (S.flashT > 0) {
    S.flashT -= dt;
    if (S.flashT <= 0) { muzzleLight.intensity = 0; vmFlash.intensity = 0; for (const x of player.weapons) x.model.flash.visible = false; }
  }
}

const tpOff = V();
function updateSeller(dt) {
  if (!seller) return;
  seller.update(dt, {
    speed: 0, back: false, pitch: -0.28, crouch: false, sprint: false, ads: 0,
    reloadP: -1, empty: false, kick: 0, switchK: 0, nade: null,
    knife: false, stab: -1, prone: false, inspect: -1, ifak: -1,
  });
}
function updateBody(dt) {
  const dead = S.state === 'dead';
  // Hidden in first person, and when the camera is squeezed right up against the head.
  body.root.visible = dead ? S.tpDead : tpActive() && S.camD > 0.6;
  if (!body.root.visible) return;
  body.root.position.copy(player.pos);
  body.root.rotation.y = player.yaw + Math.PI;
  if (dead) { body.update(dt, null); return; }
  const w = curW();
  body.setWeapon(w.id);
  const fwd = player.vel.x * -Math.sin(player.yaw) + player.vel.z * -Math.cos(player.yaw);
  body.update(dt, {
    speed: Math.hypot(player.vel.x, player.vel.z), back: fwd < -0.3,
    pitch: player.pitch + player.recoilP, crouch: player.crouch, sprint: player.sprinting, ads: S.adsT,
    reloadP: S.reloading ? Math.min(1, S.reloadT / S.reloadDur) : -1, empty: S.reloadEmpty,
    kick: S.kick, switchK: S.switchT > 0 || S.ifakT > 0 ? 1 : 0,
    nade: nade.phase ? nade : null,
    knife: w.def.type === 'melee', stab: stab.t, prone: player.prone, inspect: S.inspectT,
    ifak: S.ifakT > 0 ? MED_TIMING.dur - S.ifakT : -1,
  });
}

let nadeVM = null, medVM = null;
function updateViewModel(dt) {
  const w = curW(), d = w.def;
  // The weapon drops away while the bandage is applied and comes back up at the end.
  const medT = S.ifakT > 0 ? MED_TIMING.dur - S.ifakT : -1;
  const medLow = medT < 0 ? 0 : Math.min(smoothstep(medT / 0.28), smoothstep(S.ifakT / 0.38));
  for (const x of player.weapons) if (x.model) x.model.group.visible = x.model.arms.visible = x === w && !nade.phase && medLow < 0.97;
  vmRoot.visible = !(d.scope && S.adsT > 0.9) && !tpActive();
  if (!nadeVM) nadeVM = buildGrenadeViewModel(vmRoot);
  nadeVM.group.position.set(vmSway.x * 0.8, vmSway.y * 0.8 - S.landDip * 0.05, 0);
  nadeVM.update(nade.phase ? nade : null, S.time);
  if (!medVM) medVM = buildMedViewModel(vmRoot);
  medVM.group.position.set(vmSway.x * 0.6, vmSway.y * 0.6 - S.landDip * 0.05, 0);
  medVM.update(medT);
  const m = w.model;
  const g = m.group;
  const pos = m.hip.clone().lerp(m.ads, S.adsT);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const bob = (1 - S.adsT * 0.92) * Math.min(sp / 5, 1.6) * (1 - mount.k) * (player.prone ? 0.25 : 1);
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
  if (player.prone) { pos.y -= 0.03; pos.z -= 0.02; }
  // Braced against a corner the rifle cants with the lean; on a ledge it settles slightly lower.
  if (mount.type === 'corner') rz += mount.side * 0.06 * mount.k;
  else pos.y -= 0.008 * mount.k;
  pos.y -= S.landDip * 0.05;
  pos.z += S.kick * 0.045 * (1 - S.adsT * 0.4) * (d.type === 'sniper' ? 2 : 1);
  rx += S.kick * (d.type === 'pistol' ? 0.15 : 0.05);
  const reloadP = S.reloading ? Math.min(1, S.reloadT / S.reloadDur) : -1;
  let pivot = null, holdQ = m.restQ;
  if (reloadP >= 0) {
    const r = m.reloadPose(reloadP, S.reloadEmpty);
    pos.x += r.x; pos.y += r.y; pos.z += r.z; rx += r.rx; ry += r.ry; rz += r.rz;
    pivot = r.pivot;
  } else if (d.type === 'melee' && stab.t >= 0) {
    const t = stab.t, cockT = STAB_TIMING.cock, hitT = STAB_TIMING.hit;
    const cock = Math.min(1, t / cockT);
    const thrust = t <= cockT ? 0 : Math.min(1, (t - cockT) / (hitT - cockT));
    const recover = t <= hitT ? 0 : Math.min(1, (t - hitT) / (STAB_TIMING.dur - hitT));
    const pull = cock * (1 - thrust), strike = thrust * (1 - recover);
    // Cock back to the right, then hook the claw forward and across.
    pos.x += 0.05 * pull - 0.14 * strike;
    pos.y += 0.06 * pull - 0.02 * strike;
    pos.z += 0.08 * pull - 0.3 * strike;
    rx += 0.25 * pull - 0.2 * strike;
    ry += -0.3 * pull + 0.5 * strike;
    rz += -0.2 * pull + 0.3 * strike;
  } else if (S.inspectT >= 0) {
    const r = m.inspectPose(S.inspectT);
    pos.x += r.x; pos.y += r.y; pos.z += r.z; rx += r.rx; ry += r.ry; rz += r.rz;
    pivot = r.pivot;
    if (r.q) holdQ = r.q;
  }
  if (S.switchT > 0) { const k = S.switchT / 0.5; pos.y -= k * 0.3; rx -= k * 0.9; }
  if (medLow > 0) { pos.y -= 0.35 * medLow; rx -= 0.6 * medLow; }
  if (S.boltT > 0) { const b = Math.sin((1 - S.boltT / 1.15) * Math.PI); rz += b * 0.25; rx -= b * 0.08; pos.y -= b * 0.02; }
  g.position.copy(pos);
  g.rotation.set(rx, ry, rz);
  if (holdQ) g.quaternion.multiply(holdQ);
  if (pivot) g.position.add(pivot).sub(tmpV.copy(pivot).applyQuaternion(g.quaternion));
  g.updateMatrixWorld(true);
  m.update(reloadP, d.type === 'pistol' ? S.kick : 0, S.reloadEmpty, S.reloadDur, S.boltT > 0 ? 1 - S.boltT / 1.15 : -1);

  // Light the weapon with the real sun direction (in camera space), dimmed when the player stands in shadow.
  S.sunT -= dt;
  if (S.sunT <= 0) { S.sunT = 0.1; S.inSunTarget = inSunlight(V(player.pos.x, player.pos.y + player.eye, player.pos.z), assets.sunDir) ? 1 : 0; }
  S.inSun = approach(S.inSun, S.inSunTarget ?? 1, dt * 3);
  vmSun.position.copy(assets.sunDir).applyQuaternion(tmpQ.copy(camera.quaternion).invert()).multiplyScalar(5);
  vmSun.intensity = lerp(0.25, 3.0, S.inSun);
}
const tmpQ = new THREE.Quaternion();
const flowCenter = V();

function updateEnemies(dt) {
  S.flowT -= dt;
  if (S.flowT <= 0) {
    S.flowT = 0.4;
    if (net && net.isHost && net.centroid(flowCenter)) updateFlow(flowCenter.x, flowCenter.z);
    else updateFlow(player.pos.x, player.pos.z);
  }
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
    for (const s of [player, ...squad.bots, ...(net ? net.targets() : [])]) {
      if (s.bot && !s.alive) continue;
      const px = s.pos.x - a.pos.x, pz = s.pos.z - a.pos.z, pd = Math.hypot(px, pz);
      if (pd < 0.8 && pd > 1e-4) { a.pos.x -= (px / pd) * (0.8 - pd); a.pos.z -= (pz / pd) * (0.8 - pd); }
    }
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
  frame(Math.min(clock.getDelta(), 0.05));
}
function frame(dt) {
  if (S.state === 'loading') return;
  if (S.state === 'playing' || hostMenuOpen() || (S.state === 'paused' && net && net.isClient)) {
    S.time += dt;
    if (net && net.online) net.tick(dt);
    if (S.state === 'playing') {
      updatePlayer(dt);
      updateWeapon(dt);
      updateViewModel(dt);
      updateBody(dt);
    }
    if (hostMenuOpen() || (S.state === 'playing' && !(net && net.isClient))) {
      squad.update(dt, true);
      updateEnemies(dt);
      updateRockets(dt);
      updateGrenades(dt);
      updatePickups(dt);
      updateWaves(dt);
    }
    if (S.state === 'playing') {
      updateHUD(dt);
      drawMinimap();
    }
  } else if (S.state === 'menu') {
    S.time += dt;
    menuT += dt;
    const a = menuT * 0.035;
    camera.position.set(Math.sin(a) * 58, 14 + Math.sin(menuT * 0.1) * 3, Math.cos(a) * 58);
    camera.lookAt(Math.sin(a + 0.8) * 10, 5, Math.cos(a + 0.8) * 10);
    if (Math.abs(camera.fov - lookFov()) > 0.5) { camera.fov = lookFov(); camera.updateProjectionMatrix(); }
    vmRoot.visible = false;
  } else if (S.state === 'dead') {
    S.time += dt;
    S.deadT += dt;
    if (net && net.online) net.tick(dt);
    if (net && net.isHost && S.state === 'dead') {
      updateEnemies(dt);
      updateRockets(dt);
      updateGrenades(dt);
      updateWaves(dt);
    }
    const allies = net && net.online ? net.livingAllies() : [];
    const spec = $('spectate');
    if (allies.length) {
      const s = allies[((spectateI % allies.length) + allies.length) % allies.length];
      const back = 2.8;
      camera.position.set(s.x + Math.sin(s.yaw) * back, s.y + (s.eye || 1.6) + 0.35, s.z + Math.cos(s.yaw) * back);
      camera.lookAt(s.x, s.y + (s.eye || 1.6) * 0.72, s.z);
      camera.rotation.z = 0;
      spec.classList.remove('hidden');
      spec.querySelector('b').textContent = s.name;
      $('gameover').classList.add('spectate-mode');
    } else {
      spec.classList.add('hidden');
      $('gameover').classList.remove('spectate-mode');
    if (S.tpDead) {
      // Slow orbit around the body.
      const a = player.yaw + S.deadT * 0.12, r = 3.4 - Math.min(1, S.deadT / 3) * 0.8;
      camera.position.set(player.pos.x + Math.sin(a) * r, player.pos.y + 1.9, player.pos.z + Math.cos(a) * r);
      camera.lookAt(player.pos.x, player.pos.y + 0.3, player.pos.z);
    } else {
      player.eye = approach(player.eye, 0.3, dt * 2);
      camera.position.y = player.pos.y + player.eye;
      camera.rotation.z = approach(camera.rotation.z, 0.8, dt);
    }
    }
    camera.updateMatrixWorld();
    vmRoot.visible = false;
    updateBody(dt);
    squad.update(dt, true);
    updateEnemies(dt);
    updateGrenades(dt);
  }
  if (S.state !== 'paused' || hostMenuOpen()) {
    updateLights(dt);
    updateEffects(dt, S.time, camera.position);
  }
  updateSeller(dt);
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
  const sq = $('squad-size');
  for (let n = 0; n <= MAX_BOTS; n++) {
    const b = document.createElement('button');
    b.textContent = n === 0 ? 'SOLO' : `${n} BOT${n > 1 ? 'S' : ''}`;
    b.classList.toggle('active', n === botCount);
    b.onclick = () => {
      botCount = n;
      localStorage.setItem('idf-bots', String(n));
      sq.querySelectorAll('button').forEach((x, i) => x.classList.toggle('active', i === n));
    };
    sq.appendChild(b);
  }
  $('deploy-btn').onclick = () => {
    if (!selectedClass) return;
    if (net && net.isClient) { net.ready(selectedClass); return; }
    deploy(selectedClass);
  };
  const nameBox = $('net-name');
  nameBox.value = localStorage.getItem('idf-name') || '';
  const remember = () => localStorage.setItem('idf-name', nameBox.value.trim());
  $('net-host').onclick = async () => {
    if (!net || !net.available) { $('net-status').textContent = 'Co-op runs in the desktop app.'; return; }
    remember();
    try { await net.host(nameBox.value); } catch (err) { $('net-status').textContent = 'Could not host (' + (err.message || 'port in use') + ').'; }
  };
  $('net-join').onclick = async () => {
    if (!net || !net.available) { $('net-status').textContent = 'Co-op runs in the desktop app.'; return; }
    remember();
    try { await net.join(nameBox.value, $('net-addr').value); }
    catch { $('net-status').textContent = 'Could not reach that host.'; }
  };
  $('resume-btn').onclick = resumeGame;
  $('shop-close').onclick = closeShop;
  $('quit-btn').onclick = toMenu;
  $('redeploy-btn').onclick = toMenu;
  $('credits-btn').onclick = showCredits;
  $('credits-close').onclick = () => $('credits').classList.add('hidden');
  const tpl = $('settings-tpl');
  for (const id of ['settings-menu', 'settings-pause']) $(id).appendChild(tpl.content.cloneNode(true));
  const bindSet = (sel, key) => {
    document.querySelectorAll(sel).forEach((el) => el.addEventListener('input', () => {
      settings[key] = Number(el.value);
      applySettings();
    }));
  };
  bindSet('.set-vol', 'volume');
  bindSet('.set-sens', 'sens');
  bindSet('.set-fov', 'fov');
  applySettings();
  // Only the desktop app can close its own window.
  if (navigator.userAgent.includes('Electron')) {
    $('exit-btn').classList.remove('hidden');
    $('exit-btn').onclick = () => window.close();
  }
}

let creditsLoaded = false;
async function showCredits() {
  $('credits').classList.remove('hidden');
  if (creditsLoaded) return;
  const list = $('credits-list');
  try {
    const items = await (await fetch('assets/models/credits.json')).json();
    list.replaceChildren(...items.map((c) => {
      const row = document.createElement('div');
      const a = document.createElement('a');
      a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = c.name;
      const by = document.createElement('span');
      by.textContent = ` by ${c.author} · ${c.license}`;
      row.append(a, by);
      return row;
    }));
    creditsLoaded = true;
  } catch {
    list.textContent = 'Could not load assets/models/credits.json';
  }
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
  const beforeWorld = new Set(scene.children);
  buildWorld(scene);
  singlePassTransparent(scene);
  // The map never moves: compute its matrices once so the per-frame scene update skips it. The scene
  // itself must not auto-update either, or it forces every descendant to recompute. Sprites are the
  // smoke plumes the map adds, which drift every frame.
  for (const o of scene.children) {
    if (beforeWorld.has(o)) continue;
    o.traverse((x) => { if (!x.isSprite) { x.matrixAutoUpdate = false; x.updateMatrix(); } });
  }
  scene.matrixAutoUpdate = false;
  scene.updateMatrix();
  scene.updateMatrixWorld(true);
  buildNav();
  net = createNet({
    scene,
    getPlayer: () => player,
    getState: () => S,
    enemies: () => enemies,
    grenades: () => grenades,
    rockets: () => rockets,
    spawnPoint: () => world.spawn,
    enter(cls, spawn) { deploy(cls); player.pos.set(spawn.x, spawn.y, spawn.z); },
    applyShot, applyStab, spawnGrenade: spawnGrenadeFrom, explodeAt: explodeFrom,
    hitmarker: showHitmarker,
    killLine: addKillLine,
    noteHit() { player.hits++; },
    creditKill(head, _nadeKill, pts) {
      player.kills++;
      if (head) player.headshots++;
      player.score += pts || 0;
    },
    notice: matchNote,
    applyVitals(you) {
      if (!net.isClient) return;
      const prev = player.hp;
      player.hp = you.hp;
      if (Number.isFinite(you.armor)) player.armor = you.armor;
      if (player.hp < prev - 0.4 && S.state === 'playing') { S.hurtT = Math.min(1, S.hurtT + 0.5); SFX.playHurt(); }
      if (player.hp <= 0 && S.state === 'playing') { player.hp = 0; gameOver(false, -1); }
      if (player.hp > 0 && S.state === 'dead') netRevive();
    },
    applyWave(m) {
      S.wave = m.wave;
      S.intermission = m.intermission;
      S.alive = m.alive;
      S.toSpawn = m.toSpawn;
    },
    disconnected() { if (S.state !== 'menu') toMenu(); },
    backToMenu() { if (S.state !== 'menu') toMenu(); },
  });
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
  body = createPlayerBody();
  body.setWeapon('tavor');
  scene.add(body.root);
  if (world.sellerPos) {
    seller = createPlayerBody();
    seller.setWeapon('tavor');
    seller.root.position.copy(world.sellerPos);
    seller.root.rotation.y = world.sellerFace || Math.PI;
    seller.root.userData.god = true;
    scene.add(seller.root);
  }
  renderer.compile(scene, camera);
  scene.remove(warm.root);
  warm.dispose();
  body.root.visible = false;

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  S.state = 'menu';
}
boot();
loop();
window.__game = { S, player, enemies, mouse, keys, camera, vmCamera, scene, renderer, spawnEnemy, world, deploy, CLASSES, assets, sun, frame, damagePlayer, squad, mount, colliders, detectMount, nade, startGrenade, grenades, stab, get net() { return net; }, get medVM() { return medVM; }, get body() { return body; }, get pipe() { return pipe; }, applyQuality };
