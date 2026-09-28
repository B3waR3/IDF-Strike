'use strict';
/* global THREE */

// ============================================================
//  DATA: weapons, classes, enemies
// ============================================================
const WEAPONS = {
  tavor: {
    name: 'IWI Tavor X95', caliber: '5.56×45mm NATO · bullpup', type: 'rifle', model: 'tavor',
    mag: 30, reserveMags: 6, chamber: true, rpm: 850, damage: 32, headMult: 2.4, range: 250,
    spread: 0.035, adsSpread: 0.003, bloomPerShot: 0.006, recoil: 0.011,
    reload: 2.3, reloadEmpty: 2.9, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.18,
    optic: 'Meprolight M21 reflex', sound: { cut: 3200, dur: 0.16, thump: 130, gain: 0.9 },
  },
  m4: {
    name: 'Colt M4A1 Carbine', caliber: '5.56×45mm NATO', type: 'rifle', model: 'm4',
    mag: 30, reserveMags: 6, chamber: true, rpm: 800, damage: 31, headMult: 2.4, range: 250,
    spread: 0.038, adsSpread: 0.0035, bloomPerShot: 0.006, recoil: 0.012,
    reload: 2.1, reloadEmpty: 2.7, modes: ['AUTO', 'SEMI'], adsFov: 50, adsTime: 0.17,
    optic: 'Meprolight M5 red dot', sound: { cut: 3400, dur: 0.15, thump: 140, gain: 0.9 },
  },
  negev: {
    name: 'IWI Negev NG7', caliber: '7.62×51mm NATO · belt-fed', type: 'lmg', model: 'negev',
    mag: 125, reserveMags: 2, chamber: false, rpm: 650, damage: 40, headMult: 2.2, range: 300,
    spread: 0.06, adsSpread: 0.011, bloomPerShot: 0.004, recoil: 0.014, moveMult: 0.9,
    reload: 5.2, reloadEmpty: 6.0, modes: ['AUTO', 'SEMI'], adsFov: 55, adsTime: 0.32,
    optic: 'Trijicon ACOG 4×', sound: { cut: 2400, dur: 0.22, thump: 90, gain: 1.0 },
  },
  m24: {
    name: 'M24 SWS', caliber: '7.62×51mm NATO · bolt-action', type: 'sniper', model: 'm24',
    mag: 5, reserveMags: 6, chamber: false, rpm: 48, damage: 140, headMult: 3, range: 800,
    spread: 0.09, adsSpread: 0.0, bloomPerShot: 0, recoil: 0.045, scope: true,
    reload: 3.4, reloadEmpty: 3.8, modes: ['BOLT'], adsFov: 14, adsTime: 0.3,
    optic: 'Leupold Mark 4 10× scope', sound: { cut: 2600, dur: 0.55, thump: 65, gain: 1.2 },
  },
  glock: {
    name: 'Glock 17', caliber: '9×19mm Parabellum', type: 'pistol', model: 'glock',
    mag: 17, reserveMags: 4, chamber: true, rpm: 420, damage: 25, headMult: 2, range: 50,
    spread: 0.03, adsSpread: 0.007, bloomPerShot: 0.012, recoil: 0.02,
    reload: 1.5, reloadEmpty: 1.9, modes: ['SEMI'], adsFov: 62, adsTime: 0.12,
    optic: 'Iron sights', sound: { cut: 3800, dur: 0.1, thump: 190, gain: 0.7 },
  },
  jericho: {
    name: 'IWI Jericho 941', caliber: '9×19mm Parabellum', type: 'pistol', model: 'jericho',
    mag: 16, reserveMags: 4, chamber: true, rpm: 380, damage: 27, headMult: 2, range: 50,
    spread: 0.028, adsSpread: 0.006, bloomPerShot: 0.012, recoil: 0.022,
    reload: 1.6, reloadEmpty: 2.0, modes: ['SEMI'], adsFov: 62, adsTime: 0.12,
    optic: 'Iron sights', sound: { cut: 3600, dur: 0.11, thump: 180, gain: 0.75 },
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
    dmg: 8, burst: [3, 5], burstGap: 0.12, pause: [0.9, 1.8], acc: 0.3, react: 0.75,
    clothes: 0x4f5236, vest: 0x3a3a2a, band: 0x1c8c3c, gun: 'ak', sound: { cut: 1900, dur: 0.2, thump: 110, gain: 0.8 },
  },
  pij: {
    name: 'PIJ militant', weapon: 'AK-47', hp: 100, speed: 3.9, range: 70, prefer: 18,
    dmg: 8, burst: [4, 6], burstGap: 0.11, pause: [0.8, 1.6], acc: 0.27, react: 0.7,
    clothes: 0x1e1e1e, vest: 0x2c2c2c, band: 0x0a0a0a, gun: 'ak', sound: { cut: 1800, dur: 0.2, thump: 105, gain: 0.8 },
  },
  rpg: {
    name: 'Hamas RPG gunner', weapon: 'RPG-7', hp: 110, speed: 3.1, range: 85, prefer: 45,
    rocket: true, rocketCd: 6, react: 1.1,
    clothes: 0x5a5540, vest: 0x3a3a2a, band: 0x1c8c3c, gun: 'rpg',
  },
  sniper: {
    name: 'Hamas sniper', weapon: 'Al-Ghoul rifle', hp: 80, speed: 3.0, range: 160, prefer: 999,
    sniper: true, dmg: 48, aimTime: 1.5, cooldown: 3.5, react: 0.4,
    clothes: 0x7d7152, vest: 0x5d5540, band: 0x1c8c3c, gun: 'sniper', sound: { cut: 2200, dur: 0.45, thump: 70, gain: 1.0 },
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
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

// ============================================================
//  RENDERER / SCENES
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);

const SKY = 0xcdbd9c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 190);

const BASE_FOV = 75;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);

const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a3a, 0.9));
const vmSun = new THREE.DirectionalLight(0xffe8c8, 0.8);
vmSun.position.set(0.5, 1, 0.3);
vmScene.add(vmSun);
const vmRoot = new THREE.Group();
vmScene.add(vmRoot);

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x8a7355, 0.75));
const sun = new THREE.DirectionalLight(0xffe7c4, 1.05);
sun.position.set(70, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 320 });
sun.shadow.bias = -0.0008;
scene.add(sun);

const flashLight = new THREE.PointLight(0xffc070, 0, 12);
scene.add(flashLight);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
});

// ============================================================
//  TEXTURES & MATERIALS
// ============================================================
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
function noise(x, s, n, dark, light) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * dark})` : `rgba(255,255,255,${Math.random() * light})`;
    x.fillRect(Math.random() * s, Math.random() * s, rand(1, 4), rand(1, 4));
  }
}
function wallTexture(base, soot) {
  return canvasTex(256, (x, s) => {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    noise(x, s, 3000, 0.08, 0.05);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const ox = tx * 128, oy = ty * 128;
      x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(ox, oy + 120, 128, 8);
      const wx = ox + 34, wy = oy + 30, ww = 60, wh = 58;
      x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      const kind = (tx + ty * 2 + (soot ? 1 : 0)) % 4;
      if (kind === 0) { x.fillStyle = '#16130f'; x.fillRect(wx, wy, ww, wh); }
      else if (kind === 1) {
        x.fillStyle = '#6a746e'; x.fillRect(wx, wy, ww, wh);
        for (let k = 0; k < wh; k += 5) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(wx, wy + k, ww, 1.5); }
      } else if (kind === 2) {
        x.fillStyle = '#221e19'; x.fillRect(wx, wy, ww, wh);
        x.fillStyle = '#8a8a80'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh); x.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      } else {
        x.fillStyle = '#0c0a08'; x.beginPath();
        x.moveTo(wx - 8, wy + 4); x.lineTo(wx + 30, wy - 12); x.lineTo(wx + ww + 10, wy + 8);
        x.lineTo(wx + ww + 4, wy + wh + 10); x.lineTo(wx + 20, wy + wh + 4); x.lineTo(wx - 12, wy + wh - 10);
        x.fill();
      }
    }
    if (soot) {
      for (let i = 0; i < 12; i++) {
        const gx = rand(0, s), gy = rand(0, s);
        const g = x.createRadialGradient(gx, gy, 2, gx, gy, rand(30, 80));
        g.addColorStop(0, 'rgba(10,8,6,0.5)'); g.addColorStop(1, 'rgba(10,8,6,0)');
        x.fillStyle = g; x.fillRect(0, 0, s, s);
      }
    }
  });
}

const wallMats = [
  ['#c2b69c', false], ['#a89f8c', false], ['#d2c3a2', false], ['#9c978b', false], ['#8e8778', true], ['#b0a58c', true],
].map(([c, soot]) => new THREE.MeshStandardMaterial({ map: wallTexture(c, soot), roughness: 0.95 }));
const roofMat = new THREE.MeshStandardMaterial({ map: canvasTex(128, (x, s) => { x.fillStyle = '#8f8878'; x.fillRect(0, 0, s, s); noise(x, s, 1500, 0.1, 0.06); }), roughness: 1 });
const concreteTex = canvasTex(128, (x, s) => { x.fillStyle = '#a39c8c'; x.fillRect(0, 0, s, s); noise(x, s, 1500, 0.12, 0.08); });
const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 1 });
const groundMat = new THREE.MeshStandardMaterial({
  map: canvasTex(256, (x, s) => { x.fillStyle = '#b9a47e'; x.fillRect(0, 0, s, s); noise(x, s, 6000, 0.12, 0.1); }, 70), roughness: 1,
});
const asphaltTex = canvasTex(256, (x, s) => {
  x.fillStyle = '#58544c'; x.fillRect(0, 0, s, s); noise(x, s, 5000, 0.18, 0.08);
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(185,164,126,0.35)'; x.beginPath(); x.arc(rand(0, s), rand(0, s), rand(8, 30), 0, 7); x.fill(); }
});
const matCache = {};
function mat(color, rough = 0.85, metal = 0.05) {
  const k = color + '_' + rough + '_' + metal;
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return matCache[k];
}
const softCircle = canvasTex(64, (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
});

// ============================================================
//  GEOMETRY HELPERS
// ============================================================
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  return me;
}
function cyl(r, len, m, x = 0, y = 0, z = 0, axis = 'z', open = false, seg = 12) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg, 1, open), m);
  if (axis === 'z') me.rotation.x = Math.PI / 2;
  else if (axis === 'x') me.rotation.z = Math.PI / 2;
  me.position.set(x, y, z);
  return me;
}
function limb(a, b, r, m) {
  const len = a.distanceTo(b);
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 8), m);
  me.position.copy(a).add(b).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return me;
}
function tiledBoxGeo(w, h, d, tw, th) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h, tw, th], [d, h, tw, th], [w, d, tw, tw], [w, d, tw, tw], [w, h, tw, th], [w, h, tw, th]];
  for (let f = 0; f < 6; f++) {
    const [a, b, ta, tb] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * a / ta, uv.getY(i) * b / tb);
    }
  }
  return g;
}

// ============================================================
//  WORLD
// ============================================================
const HALF = 114;
const colliders = [];
const mapRects = [];
const shafts = [];
let resupplyPos = null;
let tankPos = null;

function addCollider(minX, maxX, minZ, maxZ, bottom, top) {
  const c = { minX, maxX, minZ, maxZ, bottom, top };
  colliders.push(c);
  return c;
}
function solidBox(w, h, d, x, y, z, m, opt = {}) {
  const geo = opt.tile ? tiledBoxGeo(w, h, d, opt.tile[0], opt.tile[1]) : new THREE.BoxGeometry(w, h, d);
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y + h / 2, z);
  me.castShadow = opt.cast !== false;
  me.receiveShadow = true;
  scene.add(me);
  if (opt.collide !== false) addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h);
  if (opt.map) mapRects.push({ x: x - w / 2, z: z - d / 2, w, d, kind: opt.map });
  return me;
}

function building(cx, cz, w, d, floors, damaged) {
  const h = floors * 3;
  const wm = wallMats[damaged ? randInt(4, 5) : randInt(0, 3)];
  solidBox(w, h, d, cx, 0, cz, [wm, wm, roofMat, roofMat, wm, wm], { tile: [8, 6], map: 'b' });
  if (damaged) {
    const slab = box(w * rand(0.5, 0.8), 0.35, d * rand(0.5, 0.8), concreteMat, cx + rand(-1, 1), h + 0.4, cz + rand(-1, 1));
    slab.rotation.set(rand(-0.35, 0.35), rand(0, 3), rand(-0.35, 0.35));
    slab.castShadow = true;
    scene.add(slab);
    for (let i = 0; i < 6; i++) {
      const s = rand(0.3, 1.2);
      const r = box(s, s * 0.6, s, concreteMat, cx + rand(-w / 2, w / 2), h + s * 0.3, cz + rand(-d / 2, d / 2));
      r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      scene.add(r);
    }
  } else if (Math.random() < 0.65) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const t = cyl(0.55, 1.1, mat(0x1d1d1d, 0.6), cx + rand(-w / 3, w / 3), h + 0.55, cz + rand(-d / 3, d / 3), 'y');
      t.castShadow = true;
      scene.add(t);
    }
    const par = mat(0x8f8878, 1);
    solidBox(w, 0.8, 0.25, cx, h, cz - d / 2 + 0.125, par, { collide: false });
    solidBox(w, 0.8, 0.25, cx, h, cz + d / 2 - 0.125, par, { collide: false });
  }
}

function rubblePile(x, z, r) {
  for (let i = 0; i < 14; i++) {
    const s = rand(0.3, 1.4);
    const a = rand(0, Math.PI * 2), dd = rand(0, r);
    const m = box(s, s * rand(0.4, 0.8), s * rand(0.6, 1.2), Math.random() < 0.8 ? concreteMat : mat(0x6d6457), x + Math.cos(a) * dd, s * 0.25, z + Math.sin(a) * dd);
    m.rotation.set(rand(-0.6, 0.6), rand(0, 3), rand(-0.6, 0.6));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  const core = r * 0.9;
  solidBox(core, 0.95, core, x, 0, z, concreteMat, { map: 'c' });
  for (let i = 0; i < 4; i++) {
    const rb = cyl(0.02, rand(1, 2.2), mat(0x5a3a22, 0.7, 0.4), x + rand(-core / 2, core / 2), 1, z + rand(-core / 2, core / 2), 'y', false, 5);
    rb.rotation.set(rand(-0.8, 0.8), 0, rand(-0.8, 0.8));
    scene.add(rb);
  }
}

function tunnelShaft(x, z) {
  const ring = cyl(1.0, 0.45, concreteMat, x, 0.22, z, 'y', false, 16);
  ring.receiveShadow = true;
  scene.add(ring);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.46, z);
  scene.add(hole);
  const sand = box(0.8, 0.3, 0.6, mat(0xa89a74), x + 1.4, 0.15, z + 0.3);
  scene.add(sand);
  shafts.push(new THREE.Vector3(x, 0, z));
}

function jersey(x, z, rot) {
  const w = rot ? 0.6 : 2.4, d = rot ? 2.4 : 0.6;
  solidBox(w, 0.95, d, x, 0, z, concreteMat, { map: 'c' });
}
function sandbags(x, z, rot) {
  const w = rot ? 0.8 : 2.6, d = rot ? 2.6 : 0.8;
  solidBox(w, 1.05, d, x, 0, z, mat(0xa8956a, 1), { map: 'c' });
}
function burntCar(x, z, rot) {
  const w = rot ? 4.2 : 1.8, d = rot ? 1.8 : 4.2;
  solidBox(w, 0.85, d, x, 0.25, z, mat(0x3a2b22, 0.9, 0.3), { map: 'c' });
  addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, 0.25);
  const cw = rot ? 2.2 : 1.6, cd = rot ? 1.6 : 2.2;
  solidBox(cw, 0.6, cd, x, 1.1, z, mat(0x2a211b, 0.9, 0.3), { collide: false });
  for (const [ox, oz] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) {
    const wx = rot ? oz : ox, wz = rot ? ox : oz;
    const wh = cyl(0.33, 0.25, mat(0x151515), x + wx, 0.33, z + wz, rot ? 'z' : 'x');
    scene.add(wh);
  }
}
function palm(x, z) {
  const h = rand(5, 8);
  const trunk = cyl(0.18, h, mat(0x6b5436), x, h / 2, z, 'y', false, 7);
  trunk.castShadow = true;
  scene.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f6b2c, side: THREE.DoubleSide, roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2), leafMat);
    leaf.position.set(x, h, z);
    leaf.rotation.set(-1.0, (i / 8) * Math.PI * 2, 0, 'YXZ');
    leaf.translateY(1.4);
    leaf.castShadow = true;
    scene.add(leaf);
  }
}

function merkava(x, z) {
  const g = new THREE.Group();
  const hullM = mat(0x8a8466, 0.8, 0.2), dark = mat(0x2a2a26, 0.9), metal = mat(0x55544a, 0.6, 0.5);
  g.add(box(3.4, 1.1, 7.6, hullM, 0, 1.1, 0));
  const glacis = box(3.4, 0.5, 2.2, hullM, 0, 1.3, -4.3); glacis.rotation.x = -0.35; g.add(glacis);
  g.add(box(0.7, 1.0, 7.8, dark, -1.95, 0.55, 0));
  g.add(box(0.7, 1.0, 7.8, dark, 1.95, 0.55, 0));
  g.add(box(0.9, 0.6, 7.6, hullM, -1.95, 1.3, 0));
  g.add(box(0.9, 0.6, 7.6, hullM, 1.95, 1.3, 0));
  const tur = new THREE.Group(); tur.position.set(0, 1.95, 0.8);
  tur.add(box(2.6, 0.9, 3.8, hullM, 0, 0.45, 0));
  const nose = box(2.0, 0.7, 1.8, hullM, 0, 0.4, -2.4); nose.rotation.x = 0.2; tur.add(nose);
  tur.add(box(3.0, 0.5, 1.4, dark, 0, 0.35, 2.2));
  tur.add(cyl(0.13, 5.4, metal, 0, 0.5, -5.6));
  tur.add(cyl(0.2, 1.4, metal, 0, 0.5, -3.8));
  tur.add(cyl(0.05, 0.9, metal, 0.6, 1.2, -0.4));
  tur.add(box(0.5, 0.35, 0.5, dark, 0.6, 1.05, 0.2));
  g.add(tur);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x - 2.35, x + 2.35, z - 5.2, z + 3.9, 0, 2.85);
  mapRects.push({ x: x - 2.35, z: z - 5.2, w: 4.7, d: 9.1, kind: 't' });
  tankPos = new THREE.Vector3(x, 0, z);
}

function buildWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const CELL = 30, BLOCK = 21, N = 7;
  const streetMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 1 });
  for (let i = 0; i <= N; i++) {
    const c = (i - N / 2) * CELL;
    for (const vertical of [true, false]) {
      const t = asphaltTex.clone(); t.needsUpdate = true; t.repeat.set(vertical ? 1 : 30, vertical ? 30 : 1);
      const m = streetMat.clone(); m.map = t;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 8 : HALF * 2, vertical ? HALF * 2 : 8), m);
      s.rotation.x = -Math.PI / 2;
      s.position.set(vertical ? c : 0, 0.01 + (vertical ? 0.002 : 0), vertical ? 0 : c);
      s.receiveShadow = true;
      scene.add(s);
    }
  }

  const spawnZ = 106;
  const lots = [];
  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const cx = (bi - 3) * CELL, cz = (bj - 3) * CELL;
      const r = Math.random();
      if (bi === 3 && bj === 3) {
        tunnelShaft(cx, cz);
        rubblePile(cx + 6, cz - 5, 2.5);
        rubblePile(cx - 7, cz + 4, 2);
        sandbags(cx - 3, cz + 7, false);
        palm(cx + 8, cz + 8); palm(cx - 8, cz - 8);
        continue;
      }
      if (r < 0.2 || (bj === 0 && bi % 2 === 0)) {
        lots.push([cx, cz]);
        const n = randInt(2, 4);
        for (let k = 0; k < n; k++) rubblePile(cx + rand(-7, 7), cz + rand(-7, 7), rand(1.8, 3));
        solidBox(rand(4, 8), rand(1.5, 3.5), 0.4, cx + rand(-5, 5), 0, cz + rand(-8, 8), concreteMat, { map: 'c' });
        solidBox(0.4, rand(1.5, 3.5), rand(4, 8), cx + rand(-8, 8), 0, cz + rand(-5, 5), concreteMat, { map: 'c' });
        if (bj < 5) tunnelShaft(cx + rand(-4, 4), cz + rand(-4, 4));
        if (Math.random() < 0.5) palm(cx + rand(-8, 8), cz + rand(-8, 8));
        continue;
      }
      const split = Math.random();
      const dmg = () => Math.random() < 0.3;
      const fl = () => randInt(2, 6);
      if (split < 0.3) {
        building(cx, cz, rand(14, BLOCK), rand(14, BLOCK), fl(), dmg());
      } else if (split < 0.6) {
        const hw = (BLOCK - 1.5) / 2;
        if (Math.random() < 0.5) {
          building(cx - hw / 2 - 0.75, cz, hw, rand(14, BLOCK), fl(), dmg());
          building(cx + hw / 2 + 0.75, cz, hw, rand(14, BLOCK), fl(), dmg());
        } else {
          building(cx, cz - hw / 2 - 0.75, rand(14, BLOCK), hw, fl(), dmg());
          building(cx, cz + hw / 2 + 0.75, rand(14, BLOCK), hw, fl(), dmg());
        }
      } else {
        const q = (BLOCK - 2) / 2;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          if (Math.random() < 0.15) { rubblePile(cx + sx * (q / 2 + 1), cz + sz * (q / 2 + 1), 2.5); continue; }
          building(cx + sx * (q / 2 + 1), cz + sz * (q / 2 + 1), q * rand(0.8, 1), q * rand(0.8, 1), fl(), dmg());
        }
      }
    }
  }
  if (shafts.length < 6) {
    for (const [x, z] of [[-45, -60], [45, -60], [-75, -15], [75, -15], [-15, -90], [15, -45]]) {
      if (shafts.length >= 7) break;
      tunnelShaft(x, z);
    }
  }

  const spawn = new THREE.Vector3(0, 0, spawnZ);
  let placed = 0, guard = 0;
  while (placed < 85 && guard++ < 800) {
    const line = randInt(0, N);
    const c = (line - N / 2) * CELL;
    const along = rand(-HALF + 6, HALF - 6);
    const vertical = Math.random() < 0.5;
    const off = rand(-2.5, 2.5);
    const x = vertical ? c + off : along, z = vertical ? along : c + off;
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 16) continue;
    if (shafts.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    const t = Math.random();
    if (t < 0.35) jersey(x, z, vertical);
    else if (t < 0.6) sandbags(x, z, vertical);
    else if (t < 0.85) burntCar(x, z, vertical);
    else solidBox(1.3, 1.3, 1.3, x, 0, z, concreteMat, { map: 'c' });
    placed++;
  }
  for (let i = 0; i < 14; i++) {
    const line = randInt(0, N);
    const c = (line - N / 2) * CELL + (Math.random() < 0.5 ? -3.6 : 3.6);
    const along = rand(-HALF + 8, HALF - 8);
    if (Math.random() < 0.5) palm(c, along); else palm(along, c);
  }

  const wallM = mat(0x9e9684, 1);
  solidBox(HALF * 2 + 4, 6, 2, 0, 0, -HALF - 1, wallM, { map: 'c' });
  solidBox(HALF * 2 + 4, 6, 2, 0, 0, HALF + 1, wallM, { map: 'c' });
  solidBox(2, 6, HALF * 2 + 4, -HALF - 1, 0, 0, wallM, { map: 'c' });
  solidBox(2, 6, HALF * 2 + 4, HALF + 1, 0, 0, wallM, { map: 'c' });

  merkava(-9, 107);
  resupplyPos = new THREE.Vector3(-4.5, 0, 104);
  const crate = solidBox(1.4, 0.9, 1.0, resupplyPos.x, 0, resupplyPos.z, mat(0x4b5320, 0.9), { map: 'c' });
  crate.add(box(1.42, 0.12, 1.02, mat(0xd4b000, 0.7), 0, 0.2, 0));
  const crate2 = solidBox(1.0, 0.7, 0.8, resupplyPos.x + 0.2, 0.9, resupplyPos.z, mat(0x4b5320, 0.9), { collide: false });
  crate2.rotation.y = 0.3;
  sandbags(4, 100, false);
  sandbags(-1, 99, false);
}

// ============================================================
//  RAYCAST AGAINST AABBs
// ============================================================
let hitAxis = 0, hitSign = 0;
function rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
  let tmin = 0, tmax = maxT, ax = -1, sg = 0, t1, t2, s, k;
  if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) return -1; }
  else {
    t1 = (c.minX - ox) / dx; t2 = (c.maxX - ox) / dx; s = -1;
    if (t1 > t2) { k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 0; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < c.bottom || oy > c.top) return -1; }
  else {
    t1 = (c.bottom - oy) / dy; t2 = (c.top - oy) / dy; s = -1;
    if (t1 > t2) { k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 1; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) return -1; }
  else {
    t1 = (c.minZ - oz) / dz; t2 = (c.maxZ - oz) / dz; s = -1;
    if (t1 > t2) { k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 2; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (ax < 0) return -1;
  hitAxis = ax; hitSign = sg;
  return tmin;
}
function raycastWorld(o, d, maxT) {
  let best = maxT, nrm = null;
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t > 0 && t < best) { best = t; nrm = UP; }
  }
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, colliders[i], best);
    if (t >= 0 && t < best) {
      best = t;
      nrm = new THREE.Vector3(hitAxis === 0 ? hitSign : 0, hitAxis === 1 ? hitSign : 0, hitAxis === 2 ? hitSign : 0);
    }
  }
  return nrm ? { t: best, normal: nrm, point: o.clone().addScaledVector(d, best) } : null;
}
function hasLOS(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.01) return true;
  const ix = dx / len, iy = dy / len, iz = dz / len;
  for (let i = 0; i < colliders.length; i++) {
    if (rayBox(a.x, a.y, a.z, ix, iy, iz, colliders[i], len - 0.2) >= 0) return false;
  }
  return true;
}

// ============================================================
//  COLLISION
// ============================================================
const STEP = 0.5;
function resolveCollisions(pos, radius, feetY, height = 1.8) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top <= feetY + STEP || c.bottom >= feetY + height) continue;
    const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      const l = pos.x - c.minX, r = c.maxX - pos.x, b = pos.z - c.minZ, f = c.maxZ - pos.z;
      const m = Math.min(l, r, b, f);
      if (m === l) pos.x = c.minX - radius; else if (m === r) pos.x = c.maxX + radius;
      else if (m === b) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
    }
  }
}
function groundHeightAt(x, z, feetY, r = 0.3) {
  let h = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top > feetY + STEP) continue;
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r && c.top > h) h = c.top;
  }
  return h;
}

// ============================================================
//  NAV FLOW FIELD
// ============================================================
const GS = 2, GN = Math.ceil((HALF * 2) / GS);
const navBlocked = new Uint8Array(GN * GN);
const flow = new Int32Array(GN * GN);
const flowQueue = new Int32Array(GN * GN);
function cellI(x) { return clamp(Math.floor((x + HALF) / GS), 0, GN - 1); }
function buildNav() {
  navBlocked.fill(0);
  for (const c of colliders) {
    if (c.top < 0.55) continue;
    const i0 = cellI(c.minX - 0.45), i1 = cellI(c.maxX + 0.45), j0 = cellI(c.minZ - 0.45), j1 = cellI(c.maxZ + 0.45);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) navBlocked[j * GN + i] = 1;
  }
}
function updateFlow() {
  flow.fill(-1);
  const s = cellI(player.pos.z) * GN + cellI(player.pos.x);
  let qh = 0, qt = 0;
  flow[s] = 0; flowQueue[qt++] = s;
  while (qh < qt) {
    const c = flowQueue[qh++];
    const ci = c % GN, cj = (c / GN) | 0, nd = flow[c] + 1;
    if (ci > 0) { const n = c - 1; if (!navBlocked[n] && flow[n] < 0) { flow[n] = nd; flowQueue[qt++] = n; } }
    if (ci < GN - 1) { const n = c + 1; if (!navBlocked[n] && flow[n] < 0) { flow[n] = nd; flowQueue[qt++] = n; } }
    if (cj > 0) { const n = c - GN; if (!navBlocked[n] && flow[n] < 0) { flow[n] = nd; flowQueue[qt++] = n; } }
    if (cj < GN - 1) { const n = c + GN; if (!navBlocked[n] && flow[n] < 0) { flow[n] = nd; flowQueue[qt++] = n; } }
  }
}
function flowDir(x, z, out) {
  const i = cellI(x), j = cellI(z), c = j * GN + i;
  let best = flow[c];
  if (best === 0) return false;
  if (best < 0 && !navBlocked[c]) return false;
  let bi = -1, bj = -1;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
    const n = nj * GN + ni;
    if (navBlocked[n] || flow[n] < 0) continue;
    if (di && dj && (navBlocked[j * GN + ni] || navBlocked[nj * GN + i])) continue;
    const v = flow[n] + (di && dj ? 0.4 : 0);
    if (best < 0 || v < best) { best = v; bi = ni; bj = nj; }
  }
  if (bi < 0) return false;
  out.set((bi + 0.5) * GS - HALF - x, 0, (bj + 0.5) * GS - HALF - z);
  if (out.lengthSq() < 1e-6) return false;
  out.normalize();
  return true;
}

// ============================================================
//  AUDIO (synthesized)
// ============================================================
let actx = null, master = null, noiseBuf = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createDynamicsCompressor();
  const g = actx.createGain(); g.gain.value = 0.7;
  master.connect(g); g.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function noiseBurst(t, cut, dur, vol, type = 'lowpass') {
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.9, 1.1);
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = cut;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, rand(0, 1)); src.stop(t + dur + 0.05);
}
function tone(t, f0, f1, dur, vol, type = 'sine') {
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function playShot(p, dist = 0) {
  if (!actx) return;
  const t = actx.currentTime, att = 1 / (1 + dist / 14), vol = p.gain * att;
  if (vol < 0.01) return;
  const cut = p.cut * Math.max(0.25, 1 - dist / 160);
  noiseBurst(t, cut, p.dur * (1 + dist / 50), vol);
  tone(t, p.thump, 30, 0.14, vol * 0.9);
  if (dist > 25) noiseBurst(t + dist / 340, cut * 0.4, 0.5, vol * 0.25);
}
function playClick(delay = 0, f = 1800, vol = 0.25) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  tone(t, f, f * 0.6, 0.04, vol, 'square');
  noiseBurst(t, 4000, 0.05, vol * 0.6, 'highpass');
}
function playExplosion(dist) {
  if (!actx) return;
  const t = actx.currentTime + dist / 340, att = 1 / (1 + dist / 18);
  noiseBurst(t, 700, 1.4, 1.4 * att);
  noiseBurst(t, 2500, 0.25, 0.8 * att);
  tone(t, 80, 25, 0.8, 1.2 * att);
}
function playHit(kill) { if (actx) tone(actx.currentTime, kill ? 900 : 1500, kill ? 600 : 1300, 0.06, 0.25, 'triangle'); }
function playHurt() { if (actx) { noiseBurst(actx.currentTime, 350, 0.2, 0.6); tone(actx.currentTime, 90, 50, 0.2, 0.5); } }
function playWhiz() { if (actx) noiseBurst(actx.currentTime, 5000, 0.08, 0.35, 'bandpass'); }
function playRocketLaunch(dist) { if (actx) { const a = 1 / (1 + dist / 15); noiseBurst(actx.currentTime, 900, 0.9, 1.0 * a); tone(actx.currentTime, 200, 60, 0.5, 0.6 * a); } }

// ============================================================
//  EFFECTS: particles, tracers, decals
// ============================================================
const particles = [], tracers = [], decals = [];
const partGeo = new THREE.BoxGeometry(1, 1, 1);
function spawnParticle(pos, vel, color, size, life, opt = {}) {
  let me;
  if (opt.sprite) {
    me = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle, color, transparent: true, opacity: opt.opacity ?? 1, depthWrite: false, blending: opt.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    me.scale.set(size, size, 1);
  } else {
    me = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opt.opacity ?? 1 }));
    me.scale.setScalar(size);
  }
  me.position.copy(pos);
  scene.add(me);
  particles.push({ me, vel, life, max: life, grav: opt.grav ?? -9, grow: opt.grow || 0, base: opt.opacity ?? 1, drag: opt.drag || 0 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.me); p.me.material.dispose(); particles.splice(i, 1); continue; }
    p.vel.y += p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
    p.me.position.addScaledVector(p.vel, dt);
    if (p.me.position.y < 0.02) { p.me.position.y = 0.02; p.vel.set(0, 0, 0); }
    if (p.grow) { const s = 1 + p.grow * dt; p.me.scale.x *= s; p.me.scale.y *= s; p.me.scale.z *= s; }
    p.me.material.opacity = p.base * (p.life / p.max);
  }
}
function spawnTracer(a, b, color = 0xffd27a, life = 0.06) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l);
  tracers.push({ l, life, max: life });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) { scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); tracers.splice(i, 1); continue; }
    t.l.material.opacity = 0.9 * (t.life / t.max);
  }
}
const decalGeo = new THREE.PlaneGeometry(0.13, 0.13);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
const scorchMat = new THREE.MeshBasicMaterial({ map: softCircle, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
function addDecal(point, normal, scorch) {
  const m = new THREE.Mesh(decalGeo, scorch ? scorchMat : decalMat);
  if (scorch) m.scale.setScalar(35);
  m.position.copy(point).addScaledVector(normal, 0.015);
  m.lookAt(tmpV.copy(point).add(normal));
  scene.add(m);
  decals.push(m);
  if (decals.length > 150) scene.remove(decals.shift());
}
function impactFx(point, normal) {
  for (let i = 0; i < 5; i++) {
    const v = normal.clone().multiplyScalar(rand(1.5, 4)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(0, 2), rand(-1.5, 1.5)));
    spawnParticle(point, v, 0xb8a888, rand(0.03, 0.07), rand(0.3, 0.6));
  }
  spawnParticle(point.clone(), normal.clone().multiplyScalar(0.6), 0xb8a888, 0.5, 0.7, { sprite: true, opacity: 0.5, grav: 0.3, grow: 1.5 });
}
function bloodFx(point, dir) {
  for (let i = 0; i < 6; i++) {
    const v = dir.clone().multiplyScalar(rand(1, 3)).add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1)));
    spawnParticle(point, v, 0x7a0d0d, rand(0.03, 0.06), rand(0.3, 0.5));
  }
  spawnParticle(point.clone(), new THREE.Vector3(), 0x8a1010, 0.35, 0.3, { sprite: true, opacity: 0.6, grav: 0, grow: 2 });
}

// ============================================================
//  VIEWMODELS
// ============================================================
const VM = {
  black: mat(0x1b1b1b, 0.55, 0.2), polymer: mat(0x222222, 0.8, 0.05), metal: mat(0x2c2c2e, 0.4, 0.7),
  od: mat(0x4b5320, 0.85), grey: mat(0x3a3a3c, 0.5, 0.6), sleeve: mat(0x566044, 0.95), glove: mat(0x3b3226, 0.9),
  green: mat(0x3f4a2e, 0.8), lens: new THREE.MeshBasicMaterial({ color: 0x99bbff, transparent: true, opacity: 0.12, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  flash: new THREE.MeshBasicMaterial({ map: softCircle, color: 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};
function addArms(g, rHand, lHand, rElbow, lElbow) {
  const rShoulder = new THREE.Vector3(rHand.x + 0.14, rHand.y - 0.25, 0.55);
  const lShoulder = new THREE.Vector3(-0.26, lHand.y - 0.28, 0.45);
  g.add(box(0.06, 0.07, 0.1, VM.glove, rHand.x + 0.02, rHand.y, rHand.z));
  g.add(box(0.06, 0.07, 0.1, VM.glove, lHand.x, lHand.y - 0.02, lHand.z));
  g.add(limb(rHand, rElbow, 0.035, VM.sleeve), limb(rElbow, rShoulder, 0.045, VM.sleeve));
  g.add(limb(lHand, lElbow, 0.035, VM.sleeve), limb(lElbow, lShoulder, 0.045, VM.sleeve));
}
function addFlash(g, z, y) {
  const f = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), VM.flash);
  const p2 = p1.clone(); p2.rotation.y = Math.PI / 2;
  const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), VM.flash); p3.rotation.x = Math.PI / 2;
  f.add(p1, p2, p3);
  f.position.set(0, y, z);
  f.visible = false;
  g.add(f);
  return f;
}
function reflexSight(g, y, z) {
  g.add(box(0.045, 0.025, 0.07, VM.black, 0, y - 0.03, z + 0.01));
  g.add(box(0.05, 0.007, 0.02, VM.black, 0, y + 0.026, z));
  g.add(box(0.007, 0.055, 0.02, VM.black, -0.024, y, z));
  g.add(box(0.007, 0.055, 0.02, VM.black, 0.024, y, z));
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.046), VM.lens); lens.position.set(0, y, z); g.add(lens);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 6), VM.dot); dot.position.set(0, y, z - 0.002); g.add(dot);
}

function buildViewModel(id) {
  const g = new THREE.Group();
  let mag, flash, sightY, hip, ads, muzzleZ;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  if (id === 'tavor') {
    g.add(box(0.075, 0.13, 0.62, VM.black, 0, 0, 0.08));
    g.add(box(0.08, 0.15, 0.03, VM.polymer, 0, -0.01, 0.4));
    const grip = box(0.05, 0.13, 0.06, VM.polymer, 0, -0.12, -0.02); grip.rotation.x = 0.2; g.add(grip);
    g.add(box(0.06, 0.025, 0.16, VM.polymer, 0, -0.19, -0.06));
    g.add(box(0.07, 0.1, 0.16, VM.black, 0, -0.005, -0.3));
    g.add(cyl(0.012, 0.2, VM.metal, 0, 0.02, -0.46));
    g.add(cyl(0.017, 0.06, VM.metal, 0, 0.02, -0.58));
    g.add(box(0.03, 0.015, 0.36, VM.grey, 0, 0.073, -0.05));
    mag = box(0.06, 0.2, 0.085, VM.grey, 0, -0.15, 0.17); mag.rotation.x = -0.15; g.add(mag);
    sightY = 0.13; reflexSight(g, sightY, -0.08);
    muzzleZ = -0.62;
    addArms(g, v(0, -0.1, -0.01), v(0, -0.07, -0.3), v(0.08, -0.22, 0.22), v(-0.15, -0.2, -0.08));
    hip = v(0.2, -0.2, -0.42); ads = v(0, -sightY, -0.3);
  } else if (id === 'm4') {
    g.add(box(0.06, 0.08, 0.24, VM.black, 0, -0.01, 0));
    g.add(box(0.065, 0.07, 0.28, VM.black, 0, 0.06, -0.02));
    g.add(cyl(0.018, 0.2, VM.black, 0, 0.04, 0.2));
    g.add(box(0.06, 0.11, 0.15, VM.polymer, 0, 0.01, 0.32));
    g.add(box(0.072, 0.075, 0.3, VM.polymer, 0, 0.05, -0.3));
    g.add(box(0.02, 0.015, 0.62, VM.grey, 0, 0.1, -0.15));
    g.add(cyl(0.011, 0.22, VM.metal, 0, 0.05, -0.55));
    g.add(cyl(0.016, 0.05, VM.metal, 0, 0.05, -0.67));
    const grip = box(0.045, 0.12, 0.055, VM.polymer, 0, -0.1, 0.07); grip.rotation.x = 0.3; g.add(grip);
    g.add(box(0.03, 0.03, 0.12, VM.black, 0, -0.05, 0.0));
    mag = box(0.05, 0.2, 0.08, VM.grey, 0, -0.14, -0.07); mag.rotation.x = -0.18; g.add(mag);
    sightY = 0.14;
    g.add(cyl(0.022, 0.1, VM.black, 0, sightY, -0.04, 'z', true, 16));
    g.add(box(0.03, 0.03, 0.05, VM.black, 0, 0.115, -0.04));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 6), VM.dot); dot.position.set(0, sightY, -0.09); g.add(dot);
    muzzleZ = -0.7;
    addArms(g, v(0, -0.08, 0.06), v(0, 0.0, -0.33), v(0.08, -0.22, 0.28), v(-0.16, -0.14, -0.1));
    hip = v(0.2, -0.2, -0.42); ads = v(0, -sightY, -0.3);
  } else if (id === 'negev') {
    g.add(box(0.09, 0.12, 0.45, VM.black, 0, 0.03, -0.05));
    g.add(box(0.07, 0.12, 0.26, VM.polymer, 0, 0.0, 0.3));
    g.add(box(0.09, 0.08, 0.22, VM.polymer, 0, 0.01, -0.36));
    g.add(cyl(0.017, 0.5, VM.metal, 0, 0.04, -0.6));
    g.add(cyl(0.024, 0.07, VM.metal, 0, 0.04, -0.86));
    g.add(box(0.02, 0.05, 0.13, VM.black, 0, 0.12, -0.32));
    g.add(cyl(0.007, 0.35, VM.metal, 0.02, -0.02, -0.55)); g.add(cyl(0.007, 0.35, VM.metal, -0.02, -0.02, -0.55));
    const grip = box(0.05, 0.13, 0.06, VM.polymer, 0, -0.1, 0.1); grip.rotation.x = 0.25; g.add(grip);
    mag = box(0.13, 0.16, 0.15, VM.od, -0.09, -0.12, -0.06); g.add(mag);
    for (let i = 0; i < 5; i++) g.add(box(0.03, 0.012, 0.012, mat(0xb08a3a, 0.4, 0.8), -0.02 + i * 0.005, 0.02 - i * 0.02, -0.06));
    sightY = 0.16;
    g.add(cyl(0.022, 0.14, VM.black, 0, sightY, -0.04, 'z', true, 16));
    g.add(cyl(0.028, 0.03, VM.black, 0, sightY, -0.12, 'z', true, 16));
    g.add(box(0.035, 0.05, 0.06, VM.black, 0, 0.12, -0.04));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 6), VM.dot); dot.position.set(0, sightY, -0.11); g.add(dot);
    muzzleZ = -0.9;
    addArms(g, v(0, -0.08, 0.1), v(0, -0.03, -0.35), v(0.08, -0.22, 0.3), v(-0.17, -0.16, -0.12));
    hip = v(0.2, -0.22, -0.45); ads = v(0, -sightY, -0.34);
  } else if (id === 'm24') {
    g.add(box(0.06, 0.08, 0.95, VM.green, 0, 0, -0.05));
    g.add(box(0.055, 0.1, 0.3, VM.green, 0, -0.04, 0.3));
    g.add(cyl(0.021, 0.26, VM.metal, 0, 0.055, -0.02));
    g.add(cyl(0.014, 0.62, VM.metal, 0, 0.055, -0.62));
    g.add(box(0.012, 0.012, 0.06, VM.metal, 0.045, 0.055, 0.08));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), VM.metal);
    knob.position.set(0.075, 0.055, 0.08);
    g.add(knob);
    const grip = box(0.045, 0.1, 0.05, VM.green, 0, -0.07, 0.14); grip.rotation.x = 0.35; g.add(grip);
    mag = box(0.04, 0.03, 0.08, VM.metal, 0, -0.055, -0.02); g.add(mag);
    sightY = 0.13;
    g.add(cyl(0.02, 0.32, VM.black, 0, sightY, -0.03, 'z', true, 16));
    g.add(cyl(0.032, 0.08, VM.black, 0, sightY, -0.23, 'z', true, 16));
    g.add(cyl(0.026, 0.05, VM.black, 0, sightY, 0.14, 'z', true, 16));
    g.add(cyl(0.012, 0.03, VM.black, 0, sightY + 0.03, -0.03, 'y'));
    g.add(box(0.03, 0.06, 0.02, VM.black, 0, 0.09, -0.12)); g.add(box(0.03, 0.06, 0.02, VM.black, 0, 0.09, 0.06));
    muzzleZ = -0.94;
    addArms(g, v(0, -0.06, 0.13), v(0, -0.02, -0.3), v(0.08, -0.2, 0.33), v(-0.16, -0.15, -0.1));
    hip = v(0.2, -0.2, -0.42); ads = v(0, -sightY, -0.3);
  } else {
    const metal = id === 'jericho';
    const slideM = metal ? mat(0x3a3a3c, 0.35, 0.8) : VM.black;
    const len = metal ? 0.2 : 0.19;
    g.add(box(0.03, 0.036, len, slideM, 0, 0.03, -0.06));
    g.add(box(0.028, 0.026, 0.17, VM.polymer, 0, 0.004, -0.05));
    const grip = box(0.03, 0.115, 0.052, metal ? mat(0x2a2a2a, 0.7, 0.3) : VM.polymer, 0, -0.06, 0.012); grip.rotation.x = 0.25; g.add(grip);
    g.add(box(0.01, 0.02, 0.04, VM.polymer, 0, -0.02, -0.03));
    mag = box(0.026, 0.02, 0.05, VM.metal, 0, -0.12, 0.028); mag.rotation.x = 0.25; g.add(mag);
    g.add(box(0.005, 0.01, 0.005, VM.metal, 0, 0.053, -0.145));
    g.add(box(0.008, 0.01, 0.006, VM.metal, -0.009, 0.053, 0.025)); g.add(box(0.008, 0.01, 0.006, VM.metal, 0.009, 0.053, 0.025));
    sightY = 0.053;
    muzzleZ = -0.17;
    addArms(g, v(0, -0.055, 0.02), v(-0.02, -0.07, 0.0), v(0.08, -0.2, 0.26), v(-0.14, -0.2, 0.22));
    hip = v(0.16, -0.17, -0.36); ads = v(0, -sightY, -0.32);
  }
  flash = addFlash(g, muzzleZ, id === 'm4' || id === 'm24' ? 0.052 : id === 'negev' ? 0.04 : id === 'tavor' ? 0.02 : 0.03);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  mag.userData.base = mag.position.clone();
  g.visible = false;
  vmRoot.add(g);
  return { group: g, mag, flash, sightY, hip, ads };
}

// ============================================================
//  PLAYER / GAME STATE
// ============================================================
const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, onGround: true,
  yaw: 0, pitch: 0, recoilP: 0, hp: 100, armor: 100, armorMax: 100, ifaks: 3, frags: 2,
  crouch: false, eye: 1.65, sprinting: false, cls: null, weapons: [], cur: 0,
  kills: 0, headshots: 0, score: 0, shots: 0, hits: 0,
};
const S = {
  state: 'menu', wave: 0, toSpawn: 0, spawnT: 0, intermission: 0, alive: 0,
  reloading: false, reloadT: 0, reloadDur: 0, switchT: 0, ifakT: 0, fireCD: 0, boltT: 0,
  adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, bobT: 0, shake: 0, sprintT: 0,
  breath: 4, swayT: 0, flashT: 0, hurtT: 0, flowT: 0, time: 0, msgT: 0, triggerFresh: false,
};
const keys = {};
const mouse = { left: false, right: false };
const vmSway = new THREE.Vector3();
let mouseDX = 0, mouseDY = 0;

const enemies = [], grenades = [], rockets = [], pickups = [];
let enemyHitMeshes = [];

function curW() { return player.weapons[player.cur]; }
function makeWeapon(id) {
  const def = WEAPONS[id];
  return { id, def, mag: def.mag + (def.chamber ? 1 : 0), reserve: def.mag * def.reserveMags, mode: 0, model: buildViewModel(def.model) };
}

// ============================================================
//  ENEMIES
// ============================================================
function buildEnemyModel(t) {
  const g = new THREE.Group();
  const hit = [];
  const cloth = mat(t.clothes, 0.95), vest = mat(t.vest, 0.9), skin = mat(0x9a6b4a, 0.8), mask = mat(0x171717, 0.95);
  const band = mat(t.band, 0.8), boots = mat(0x2a241c, 0.9), gunM = mat(0x2b2b2b, 0.5, 0.5), wood = mat(0x6b3f1f, 0.7);
  const tag = (m, part) => { m.userData.part = part; m.castShadow = true; hit.push(m); return m; };

  const legs = [];
  for (const sx of [-0.12, 0.12]) {
    const lg = new THREE.Group(); lg.position.set(sx, 0.9, 0);
    lg.add(tag(box(0.18, 0.88, 0.2, cloth, 0, -0.44, 0), 'legs'));
    const b = box(0.2, 0.12, 0.3, boots, 0, -0.84, 0.04); b.castShadow = true; lg.add(b);
    g.add(lg); legs.push(lg);
  }
  g.add(tag(box(0.46, 0.62, 0.26, cloth, 0, 1.22, 0), 'body'));
  g.add(tag(box(0.5, 0.42, 0.32, vest, 0, 1.26, 0.01), 'body'));
  const pouch = box(0.38, 0.14, 0.08, vest, 0, 1.13, 0.19); pouch.castShadow = true; g.add(pouch);
  g.add(tag(box(0.24, 0.27, 0.25, mask, 0, 1.68, 0), 'head'));
  g.add(box(0.18, 0.045, 0.01, skin, 0, 1.7, 0.127));
  g.add(tag(box(0.265, 0.06, 0.265, band, 0, 1.775, 0), 'head'));
  if (t.band === 0x0a0a0a) g.add(box(0.1, 0.03, 0.01, mat(0xd4b000), 0, 1.775, 0.134));

  for (const [sx, rx, ry] of [[0.29, -1.15, -0.2], [-0.29, -1.35, 0.45]]) {
    const a = new THREE.Group(); a.position.set(sx, 1.46, 0); a.rotation.set(rx, ry, 0);
    a.add(tag(box(0.13, 0.55, 0.14, cloth, 0, -0.25, 0), 'body'));
    a.add(box(0.1, 0.1, 0.1, skin, 0, -0.55, 0));
    g.add(a);
  }
  const wg = new THREE.Group();
  let muzzle;
  if (t.gun === 'rpg') {
    wg.position.set(0.2, 1.6, 0.05);
    const olive = mat(0x3f4a2e, 0.8);
    wg.add(cyl(0.045, 1.0, olive, 0, 0, 0.05));
    wg.add(cyl(0.035, 0.12, wood, 0, -0.02, -0.1));
    const war = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 10), olive); war.rotation.x = Math.PI / 2; war.position.set(0, 0, 0.78); wg.add(war);
    wg.add(cyl(0.075, 0.14, olive, 0, 0, 0.6));
    wg.add(box(0.03, 0.1, 0.04, wood, 0, -0.07, 0.15));
    muzzle = new THREE.Vector3(0.2, 1.6, 0.9);
  } else if (t.gun === 'sniper') {
    wg.position.set(0.1, 1.33, 0.35);
    wg.add(box(0.06, 0.09, 1.1, mat(0x5a5040, 0.8), 0, 0, 0.1));
    wg.add(cyl(0.013, 0.5, gunM, 0, 0.03, 0.85));
    wg.add(cyl(0.03, 0.3, gunM, 0, 0.1, 0.15));
    muzzle = new THREE.Vector3(0.1, 1.36, 1.45);
  } else {
    wg.position.set(0.1, 1.33, 0.35);
    wg.add(box(0.07, 0.1, 0.5, gunM, 0, 0, 0.05));
    wg.add(box(0.06, 0.1, 0.26, wood, 0, -0.02, -0.3));
    wg.add(box(0.075, 0.07, 0.2, wood, 0, 0, 0.35));
    wg.add(cyl(0.015, 0.28, gunM, 0, 0.02, 0.56));
    const m = box(0.06, 0.2, 0.08, gunM, 0, -0.14, 0.14); m.rotation.x = 0.4; wg.add(m);
    muzzle = new THREE.Vector3(0.1, 1.35, 1.05);
  }
  wg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(wg);

  let glint = null;
  if (t.sniper) {
    glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    glint.position.set(0.1, 1.45, 0.4);
    glint.scale.set(0.8, 0.8, 1);
    glint.visible = false;
    g.add(glint);
  }
  return { g, hit, legs, muzzle, glint };
}

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
  let candidates = shafts.filter((s) => s.distanceTo(player.pos) > 45);
  if (!candidates.length) candidates = shafts.slice().sort((a, b) => b.distanceTo(player.pos) - a.distanceTo(player.pos)).slice(0, 2);
  const s = candidates[randInt(0, candidates.length - 1)];
  const model = buildEnemyModel(t);
  const e = {
    t, typeId, model, hp: t.hp * (1 + (S.wave - 1) * 0.03),
    pos: new THREE.Vector3(s.x + rand(-0.4, 0.4), 0, s.z + rand(-0.4, 0.4)),
    rot: rand(0, Math.PI * 2), emerge: 1.3, dead: false, deathT: 0, removeT: 10,
    losT: rand(0, 0.3), vis: false, seen: false, reactT: 0, fireT: 0, burstLeft: 0,
    aimT: 0, strafeDir: 0, strafeT: 0, walkT: 0, lastSeen: 0, flinch: 0, moving: false,
  };
  model.g.position.set(e.pos.x, -1.9, e.pos.z);
  model.g.rotation.y = e.rot;
  for (const m of model.hit) m.userData.enemy = e;
  scene.add(model.g);
  enemies.push(e);
  S.alive++;
  rebuildHitList();
}
function rebuildHitList() {
  enemyHitMeshes = [];
  for (const e of enemies) if (!e.dead) enemyHitMeshes.push(...e.model.hit);
}

const eEye = new THREE.Vector3(), pEye = new THREE.Vector3(), moveDir = new THREE.Vector3();
function updateEnemy(e, dt) {
  const g = e.model.g;
  if (e.dead) {
    e.deathT += dt;
    const p = Math.min(1, e.deathT / 0.55);
    g.rotation.x = -p * p * Math.PI / 2;
    g.position.y = -p * 0.1;
    e.removeT -= dt;
    if (e.removeT <= 0) { scene.remove(g); enemies.splice(enemies.indexOf(e), 1); }
    return;
  }
  if (e.emerge > 0) {
    e.emerge -= dt;
    g.position.set(e.pos.x, -1.9 * Math.max(0, e.emerge / 1.3), e.pos.z);
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
    const vis = dist < t.range && hasLOS(eEye, pEye);
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
        speedMul = 0.55;
      } else wantMove = false;
    } else speedMul = 0.55;
  }
  if (wantMove && moveDir.lengthSq() === 0) {
    if (!flowDir(e.pos.x, e.pos.z, moveDir)) moveDir.set(dx, 0, dz).normalize();
  }
  e.moving = wantMove && moveDir.lengthSq() > 0;
  if (e.flinch > 0) { e.flinch -= dt; speedMul *= 0.3; }
  if (e.moving) {
    const sp = t.speed * speedMul;
    e.pos.x += moveDir.x * sp * dt;
    e.pos.z += moveDir.z * sp * dt;
    resolveCollisions(e.pos, 0.38, 0);
    e.walkT += dt * sp * 2.4;
  }

  const targetRot = e.vis ? Math.atan2(dx, dz) : e.moving ? Math.atan2(moveDir.x, moveDir.z) : e.rot;
  let dr = targetRot - e.rot;
  while (dr > Math.PI) dr -= Math.PI * 2;
  while (dr < -Math.PI) dr += Math.PI * 2;
  e.rot += dr * Math.min(1, dt * 8);

  const sw = e.moving ? Math.sin(e.walkT) * 0.6 : 0;
  e.model.legs[0].rotation.x = sw;
  e.model.legs[1].rotation.x = -sw;
  g.position.set(e.pos.x, 0, e.pos.z);
  g.rotation.y = e.rot;

  if (e.vis && e.seen) {
    e.reactT -= dt;
    if (e.reactT <= 0) enemyAttack(e, dt, dist);
  } else if (e.model.glint) e.model.glint.visible = false;
}

function enemyAttack(e, dt, dist) {
  const t = e.t;
  if (t.sniper) {
    e.aimT += dt;
    e.model.glint.visible = e.aimT > 0;
    if (e.model.glint.visible) e.model.glint.material.opacity = 0.6 + Math.sin(S.time * 25) * 0.4;
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

function enemyMuzzleWorld(e) { return e.model.g.localToWorld(e.model.muzzle.clone()); }

function enemyShot(e, dist, hit, dmg) {
  const from = enemyMuzzleWorld(e);
  const target = new THREE.Vector3(player.pos.x, player.pos.y + player.eye - 0.3, player.pos.z);
  if (!hit) {
    target.x += rand(-1.2, 1.2); target.y += rand(-0.6, 1.0); target.z += rand(-1.2, 1.2);
    const dir = target.clone().sub(from).normalize();
    const wh = raycastWorld(from, dir, dist * 2 + 20);
    const end = wh ? wh.point : from.clone().addScaledVector(dir, dist * 2 + 20);
    if (wh) { impactFx(wh.point, wh.normal); if (wh.point.distanceTo(player.pos) < 6) addDecal(wh.point, wh.normal); }
    spawnTracer(from, end, 0xff9a50, 0.07);
    if (Math.random() < 0.5) playWhiz();
  } else {
    spawnTracer(from, target, 0xff9a50, 0.07);
    damagePlayer(dmg, e.pos);
  }
  playShot(e.t.sound, dist);
  spawnParticle(from, new THREE.Vector3(), 0xffb040, 0.5, 0.05, { sprite: true, additive: true, grav: 0 });
}

function launchRocket(e, dist) {
  const from = enemyMuzzleWorld(e);
  const lead = Math.min(dist / 32, 2) * 0.5;
  const target = new THREE.Vector3(player.pos.x + player.vel.x * lead + rand(-1.5, 1.5), player.pos.y + 1.0 + rand(-0.5, 0.5), player.pos.z + player.vel.z * lead + rand(-1.5, 1.5));
  const vel = target.sub(from).normalize().multiplyScalar(32);
  const m = new THREE.Group();
  const body = cyl(0.04, 0.5, mat(0x3f4a2e), 0, 0, 0); m.add(body);
  const war = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), mat(0x3f4a2e)); war.rotation.x = Math.PI / 2; war.position.z = 0.35; m.add(war);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle, color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.scale.set(0.8, 0.8, 1); glow.position.z = -0.3; m.add(glow);
  m.position.copy(from);
  m.lookAt(from.clone().add(vel));
  scene.add(m);
  rockets.push({ m, vel, life: 5 });
  playRocketLaunch(dist);
  for (let i = 0; i < 6; i++) spawnParticle(from, new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)), 0xcfc7b5, 1, 1.2, { sprite: true, opacity: 0.6, grav: 0.5, grow: 1 });
}

function damageEnemy(e, dmg, part, point, dir, headshot) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flinch = 0.25;
  if (!e.vis) { e.seen = true; e.vis = true; e.reactT = 0.35; }
  if (point) bloodFx(point, dir);
  if (e.hp <= 0) killEnemy(e, headshot);
}
function killEnemy(e, headshot, byNade) {
  e.dead = true;
  S.alive--;
  player.kills++;
  player.score += 100 + (headshot ? 50 : 0) + (byNade ? 25 : 0);
  if (headshot) player.headshots++;
  if (e.model.glint) e.model.glint.visible = false;
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
    if (Math.random() < 0.8) spawnParticle(prev, new THREE.Vector3(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3)), 0xd8d0c0, 0.5, 1.0, { sprite: true, opacity: 0.5, grav: 0.2, grow: 1.2 });
    const dir = r.vel.clone().normalize();
    const wh = raycastWorld(prev, dir, r.vel.length() * dt);
    const pp = new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z);
    const nearPlayer = r.m.position.distanceTo(pp) < 1.1;
    if (wh || nearPlayer || r.life <= 0) {
      const at = wh ? wh.point.addScaledVector(wh.normal, 0.2) : r.m.position.clone();
      explode(at, 6.5, 85, false, wh ? wh.normal : UP);
      scene.remove(r.m);
      rockets.splice(i, 1);
    }
  }
}

// ============================================================
//  GRENADES & EXPLOSIONS
// ============================================================
function throwGrenade() {
  if (player.frags <= 0 || S.nadeCD > 0 || S.reloading || S.ifakT > 0 || S.switchT > 0) return;
  player.frags--;
  S.nadeCD = 1.0;
  S.switchT = 0.45;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const pos = camera.position.clone().addScaledVector(dir, 0.6);
  const vel = dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(player.vel);
  const m = new THREE.Group();
  m.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0x3f4a2e)));
  m.add(box(0.02, 0.07, 0.02, mat(0x888888, 0.4, 0.8), 0.03, 0.05, 0));
  m.children.forEach((c) => (c.castShadow = true));
  m.position.copy(pos);
  scene.add(m);
  grenades.push({ m, pos, vel, fuse: 3.0 });
  playClick(0, 900, 0.2);
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const gr = grenades[i];
    gr.fuse -= dt;
    gr.vel.y -= 20 * dt;
    const prev = gr.pos.clone();
    const next = gr.pos.clone().addScaledVector(gr.vel, dt);
    if (next.y < 0.07) {
      next.y = 0.07;
      if (gr.vel.y < -1.5) playClick(0, 400, 0.15);
      gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6;
    }
    for (const c of colliders) {
      if (next.x > c.minX && next.x < c.maxX && next.z > c.minZ && next.z < c.maxZ && next.y < c.top && next.y > c.bottom) {
        if (prev.y >= c.top) { next.y = c.top + 0.07; gr.vel.y = -gr.vel.y * 0.35; gr.vel.x *= 0.6; gr.vel.z *= 0.6; }
        else if (prev.x <= c.minX || prev.x >= c.maxX) { next.x = prev.x; gr.vel.x = -gr.vel.x * 0.4; }
        else { next.z = prev.z; gr.vel.z = -gr.vel.z * 0.4; }
      }
    }
    gr.pos.copy(next);
    gr.m.position.copy(next);
    gr.m.rotation.x += gr.vel.length() * dt * 3;
    if (gr.fuse <= 0) {
      explode(gr.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 9, 210, true, UP);
      scene.remove(gr.m);
      grenades.splice(i, 1);
    }
  }
}
function explode(pos, radius, maxDmg, byPlayer, normal) {
  const dist = pos.distanceTo(camera.position);
  playExplosion(dist);
  S.shake = Math.max(S.shake, clamp(1.2 - dist / 30, 0, 1));
  flashLight.position.copy(pos); flashLight.intensity = 6; flashLight.distance = 25;
  S.flashT = 0.12;
  spawnParticle(pos.clone(), new THREE.Vector3(), 0xffc060, 3, 0.25, { sprite: true, additive: true, grav: 0, grow: 4 });
  for (let i = 0; i < 12; i++) spawnParticle(pos.clone(), new THREE.Vector3(rand(-3, 3), rand(1, 4), rand(-3, 3)), 0x4a443c, rand(1.5, 2.5), rand(1.5, 2.5), { sprite: true, opacity: 0.7, grav: 0.4, grow: 0.8, drag: 1.5 });
  for (let i = 0; i < 20; i++) spawnParticle(pos.clone(), new THREE.Vector3(rand(-8, 8), rand(2, 10), rand(-8, 8)), 0x3a342c, rand(0.05, 0.14), rand(0.8, 1.4));
  if (normal === UP && pos.y < 0.6) addDecal(new THREE.Vector3(pos.x, 0.02, pos.z), UP, true);

  for (const e of enemies) {
    if (e.dead) continue;
    const c = new THREE.Vector3(e.pos.x, 1.0, e.pos.z);
    const d = c.distanceTo(pos);
    if (d < radius && hasLOS(pos, c)) {
      const dmg = maxDmg * (1 - d / radius);
      if (byPlayer) { showHitmarker(e.hp - dmg <= 0); }
      e.hp -= dmg; e.flinch = 0.5;
      if (e.hp <= 0) killEnemy(e, false, byPlayer);
    }
  }
  const pc = new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z);
  const pd = pc.distanceTo(pos);
  if (pd < radius && hasLOS(pos, pc)) damagePlayer(maxDmg * (byPlayer ? 0.6 : 1) * (1 - pd / radius), pos, true);
}

// ============================================================
//  PICKUPS
// ============================================================
function spawnPickup(type, at) {
  const g = new THREE.Group();
  if (type === 'ammo') {
    g.add(box(0.5, 0.3, 0.3, mat(0x4b5320, 0.9)));
    g.add(box(0.52, 0.06, 0.32, mat(0xd4b000, 0.7), 0, 0.08, 0));
  } else if (type === 'ifak') {
    g.add(box(0.4, 0.25, 0.2, mat(0xe8e2d0, 0.8)));
    g.add(box(0.26, 0.07, 0.21, mat(0xc01818, 0.6)));
    g.add(box(0.07, 0.19, 0.21, mat(0xc01818, 0.6)));
  } else {
    g.add(box(0.3, 0.38, 0.05, mat(0x2d3440, 0.7)));
    g.add(box(0.31, 0.08, 0.06, mat(0x6ea8ff, 0.5), 0, 0.1, 0));
  }
  g.children.forEach((c) => (c.castShadow = true));
  g.position.set(at.x + rand(-0.4, 0.4), 0.35, at.z + rand(-0.4, 0.4));
  scene.add(g);
  pickups.push({ g, type, life: 45, t: rand(0, 6) });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.t += dt;
    p.g.rotation.y += dt * 1.5;
    p.g.position.y = 0.4 + Math.sin(p.t * 3) * 0.08;
    const d = Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z);
    let taken = false;
    if (d < 1.5 && Math.abs(player.pos.y - 0) < 2) {
      if (p.type === 'ammo') {
        for (const w of player.weapons) w.reserve = Math.min(w.reserve + w.def.mag * (w.def.type === 'lmg' ? 1 : 2), w.def.mag * w.def.reserveMags * 1.5);
        flashMsg('+ AMMO', 1);
        taken = true;
      } else if (p.type === 'ifak' && player.ifaks < 5) {
        player.ifaks++; flashMsg('+ IFAK', 1); taken = true;
      } else if (p.type === 'plate' && player.armor < player.armorMax) {
        player.armor = Math.min(player.armorMax, player.armor + 50); flashMsg('+ CERAMIC PLATE', 1); taken = true;
      }
      if (taken) playClick(0, 1200, 0.2);
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
function fireRay(def, spread) {
  const q = camera.quaternion;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  dir.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(q), Math.cos(a) * r);
  dir.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), Math.sin(a) * r);
  dir.normalize();
  const origin = camera.position.clone();
  const maxD = 500;
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
    damageEnemy(e, dmg, part, h.point, dir.clone().negate(), head);
    showHitmarker(willKill);
    end = h.point;
  } else if (wh) {
    impactFx(wh.point, wh.normal);
    addDecal(wh.point, wh.normal);
    end = wh.point;
  } else end = origin.clone().addScaledVector(dir, maxD);
  const muzzle = camera.position.clone()
    .addScaledVector(dir, 0.7)
    .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(q), 0.12 * (1 - S.adsT))
    .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -0.1 * (1 - S.adsT) - 0.04);
  if (def.type !== 'pistol' || Math.random() < 0.3) spawnTracer(muzzle, end, 0xffe0a0, 0.05);
}

function tryFire() {
  const w = curW(), d = w.def;
  if (S.switchT > 0 || S.reloading || S.ifakT > 0 || player.sprinting || S.fireCD > 0 || S.boltT > 0) return;
  const mode = d.modes[w.mode];
  if (mode !== 'AUTO' && !S.triggerFresh) return;
  if (w.mag <= 0) {
    if (S.triggerFresh) { playClick(0, 2200, 0.2); S.triggerFresh = false; startReload(); }
    return;
  }
  S.triggerFresh = false;
  w.mag--;
  player.shots++;
  S.fireCD = 60 / d.rpm;
  if (mode === 'BOLT') { S.boltT = 1.15; playClick(0.35, 700, 0.25); playClick(0.7, 900, 0.25); }
  fireRay(d, currentSpread());
  const rm = (S.adsT > 0.5 ? 0.7 : 1) * (player.crouch ? 0.8 : 1);
  player.recoilP += d.recoil * rm * rand(0.8, 1.2);
  player.pitch += d.recoil * 0.3 * rm;
  player.yaw += (Math.random() - 0.5) * d.recoil * 0.7 * rm;
  S.bloom = Math.min(S.bloom + d.bloomPerShot, 0.08);
  S.kick = 1;
  S.flashT = 0.05;
  w.model.flash.visible = true;
  w.model.flash.rotation.z = Math.random() * Math.PI;
  w.model.flash.scale.setScalar(rand(0.8, 1.3) * (d.type === 'pistol' ? 0.6 : 1));
  flashLight.position.copy(camera.position); flashLight.intensity = 2.5; flashLight.distance = 12;
  playShot(d.sound, 0);
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
  playClick(S.reloadDur * 0.2, 1400, 0.25);
  playClick(S.reloadDur * 0.62, 1100, 0.3);
  if (empty || !d.chamber) playClick(S.reloadDur * 0.85, 800, 0.3);
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
  playClick(0.1, 600, 0.2);
}
function useIfak() {
  if (player.ifaks <= 0 || player.hp >= 100 || S.ifakT > 0) return;
  S.reloading = false;
  S.ifakT = 2.5;
}
function resupply() {
  if (!resupplyPos || S.resupplyCD > 0) return;
  if (Math.hypot(player.pos.x - resupplyPos.x, player.pos.z - resupplyPos.z) > 3) return;
  for (const w of player.weapons) { w.reserve = w.def.mag * w.def.reserveMags; w.mag = w.def.mag + (w.def.chamber ? 1 : 0); }
  player.frags = player.cls.frags;
  player.armor = player.armorMax;
  player.ifaks = Math.max(player.ifaks, player.cls.ifaks);
  S.resupplyCD = 60;
  S.reloading = false;
  flashMsg('RESUPPLIED\n<small>Ammo, grenades, armor plates and IFAKs restocked</small>', 2);
  playClick(0, 1000, 0.3); playClick(0.15, 1300, 0.3);
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
  if (S.ifakT > 0 && amount > 15) S.ifakT = 0;
  playHurt();
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
  cross: $('crosshair'), scope: $('scope'), vign: $('damage-vignette'), heal: $('heal-vignette'),
  prompt: $('prompt'), msg: $('center-msg'), prog: $('progress'), progBar: $('progress-bar'), progLabel: $('progress-label'),
  hit: $('hitmarker'), kf: $('killfeed'), ind: $('dmg-indicators'), mm: $('minimap').getContext('2d'),
};
let hitT = 0;
function showHitmarker(kill) {
  hud.hit.style.opacity = 1;
  hud.hit.classList.toggle('kill', !!kill);
  hitT = kill ? 0.25 : 0.12;
  playHit(kill);
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

  S.hurtT = Math.max(0, S.hurtT - dt * 0.8);
  const low = player.hp < 35 ? (0.35 + Math.sin(S.time * 4) * 0.1) * (1 - player.hp / 35) : 0;
  hud.vign.style.opacity = Math.min(1, S.hurtT + low);

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

  const nearCrate = resupplyPos && Math.hypot(player.pos.x - resupplyPos.x, player.pos.z - resupplyPos.z) < 3;
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
  if (resupplyPos) { c.fillStyle = '#6ea8ff'; c.fillRect(resupplyPos.x - 1.2, resupplyPos.z - 1.2, 2.4, 2.4); }
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
const canvas = renderer.domElement;
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.state !== 'playing') return;
  switch (e.code) {
    case 'KeyR': startReload(); break;
    case 'Digit1': switchWeapon(0); break;
    case 'Digit2': switchWeapon(1); break;
    case 'KeyQ': switchWeapon(1 - player.cur); break;
    case 'KeyB': { const w = curW(); if (w.def.modes.length > 1) { w.mode = (w.mode + 1) % w.def.modes.length; playClick(0, 2000, 0.15); } break; }
    case 'KeyG': throwGrenade(); break;
    case 'KeyH': useIfak(); break;
    case 'KeyF': resupply(); break;
    case 'KeyC': player.crouch = !player.crouch; break;
    case 'Space': if (player.onGround && S.ifakT <= 0) { player.vy = 6.2; player.onGround = false; player.crouch = false; } break;
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
  for (const e of enemies) scene.remove(e.model.g);
  enemies.length = 0;
  for (const g of grenades) scene.remove(g.m);
  grenades.length = 0;
  for (const r of rockets) scene.remove(r.m);
  rockets.length = 0;
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  for (const d of decals) scene.remove(d);
  decals.length = 0;
  enemyHitMeshes = [];
  while (vmRoot.children.length) vmRoot.remove(vmRoot.children[0]);
}
function deploy(cls) {
  initAudio();
  clearEntities();
  player.cls = cls;
  player.weapons = [makeWeapon(cls.primary), makeWeapon(cls.secondary)];
  player.cur = 0;
  player.hp = 100;
  player.armorMax = cls.armor;
  player.armor = cls.armor;
  player.ifaks = cls.ifaks;
  player.frags = cls.frags;
  player.pos.set(4, 0, 106);
  player.vel.set(0, 0, 0);
  player.vy = 0; player.yaw = 0; player.pitch = 0; player.recoilP = 0; player.crouch = false; player.eye = 1.65;
  player.kills = player.headshots = player.score = player.shots = player.hits = 0;
  Object.assign(S, {
    wave: 0, toSpawn: 0, spawnT: 0, intermission: 6, alive: 0, reloading: false, switchT: 0.5, ifakT: 0,
    fireCD: 0, boltT: 0, adsT: 0, bloom: 0, kick: 0, nadeCD: 0, resupplyCD: 0, shake: 0, hurtT: 0, flowT: 0, time: 0,
  });
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
  setTimeout(() => $('gameover').classList.remove('hidden'), 900);
}
function toMenu() {
  S.state = 'menu';
  document.exitPointerLock();
  $('pause').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

// ============================================================
//  UPDATE
// ============================================================
function updatePlayer(dt) {
  const w = curW(), d = w.def;
  const fwd = tmpV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const fx = fwd.x, fz = fwd.z, rx = -fz, rz = fx;
  let mx = 0, mz = 0;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  mx = fx * f + rx * s; mz = fz * f + rz * s;
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
  if (player.pos.y <= gh) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  else if (wasGround && player.vy <= 0 && player.pos.y - gh < 0.35) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  else player.onGround = false;

  player.eye = approach(player.eye, player.crouch ? 1.05 : 1.65, dt * 5);
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
  const amp = scoped ? (holding ? 0.0006 : 0.004 * (player.crouch ? 0.6 : 1)) : 0;
  const swayP = Math.sin(S.swayT * 1.1) * amp, swayY = Math.sin(S.swayT * 0.7) * amp * 1.3;

  const targetFov = scoped ? d.adsFov : lerp(BASE_FOV, d.scope ? 55 : d.adsFov, S.adsT) + (player.sprinting ? 5 : 0);
  const fov = lerp(camera.fov, targetFov, Math.min(1, dt * 18));
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  S.shake *= Math.exp(-dt * 4);
  const sh = S.shake * 0.08;
  camera.position.set(player.pos.x + rand(-sh, sh), player.pos.y + player.eye + rand(-sh, sh), player.pos.z);
  camera.rotation.set(player.pitch + player.recoilP + swayP, player.yaw + swayY, 0);
  camera.updateMatrixWorld();

  if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) { flashLight.intensity = 0; for (const x of player.weapons) x.model.flash.visible = false; } }
}

function updateViewModel(dt) {
  const w = curW(), m = w.model, d = w.def;
  for (const x of player.weapons) x.model.group.visible = x === w;
  vmRoot.visible = !(d.scope && S.adsT > 0.9);
  const g = m.group;
  const pos = m.hip.clone().lerp(m.ads, S.adsT);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround) S.bobT += dt * sp * 1.7;
  const bob = (1 - S.adsT * 0.92) * Math.min(sp / 5, 1.6);
  pos.x += Math.sin(S.bobT) * 0.012 * bob;
  pos.y -= Math.abs(Math.cos(S.bobT)) * 0.014 * bob;
  vmSway.x = lerp(vmSway.x, clamp(-mouseDX * 0.0006, -0.04, 0.04), Math.min(1, dt * 10));
  vmSway.y = lerp(vmSway.y, clamp(mouseDY * 0.0006, -0.04, 0.04), Math.min(1, dt * 10));
  mouseDX = mouseDY = 0;
  pos.x += vmSway.x * (1 - S.adsT * 0.8);
  pos.y += vmSway.y * (1 - S.adsT * 0.8);
  let rx = 0, ry = 0, rz = 0;
  S.sprintT = approach(S.sprintT, player.sprinting ? 1 : 0, dt * 6);
  pos.x += S.sprintT * 0.04; pos.y -= S.sprintT * 0.05;
  ry += S.sprintT * 0.6; rx -= S.sprintT * 0.2;
  if (player.crouch) rz += 0.04 * (1 - S.adsT);
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
}

function updateEnemies(dt) {
  S.flowT -= dt;
  if (S.flowT <= 0) { S.flowT = 0.4; updateFlow(); }
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

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
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
    const a = S.time * 0.05;
    camera.position.set(Math.sin(a) * 70, 32, Math.cos(a) * 70);
    camera.lookAt(0, 4, 0);
    camera.fov = BASE_FOV; camera.updateProjectionMatrix();
  }
  if (S.state === 'playing' || S.state === 'dead') {
    updateParticles(dt);
    updateTracers(dt);
    if (S.state === 'dead') {
      player.eye = approach(player.eye, 0.3, dt * 2);
      camera.position.y = player.pos.y + player.eye;
      camera.rotation.z = approach(camera.rotation.z, 0.8, dt);
      vmRoot.visible = false;
      hud.vign.style.opacity = 0.9;
    }
  }
  renderer.clear();
  renderer.render(scene, camera);
  if (S.state === 'playing' && vmRoot.visible) {
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }
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
  $('deploy-btn').onclick = () => { if (selectedClass) deploy(selectedClass); };
  $('resume-btn').onclick = resumeGame;
  $('quit-btn').onclick = toMenu;
  $('redeploy-btn').onclick = toMenu;
}

buildWorld();
buildNav();
buildMenu();
loop();
