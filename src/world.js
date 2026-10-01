import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assets } from './assets.js';
import { addSmokePlume, TEX } from './effects.js';
import { makeProp } from './models.js';

export const HALF = 114;
export const colliders = [];
export const mapRects = [];
export const shafts = [];
export const world = { resupplyPos: null, shekemPos: null, tankPos: null, spawn: new THREE.Vector3(4, 0, 106) };

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ============================================================
//  MATERIALS ג€” PBR with world-space box projection, macro variation and base grime
// ============================================================
const NOISE_GLSL = /* glsl */`
  float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
  }`;

export function worldMat(id, tile, o = {}) {
  const t = assets.tex[id];
  const m = new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.arm, aoMap: t.arm,
    metalnessMap: o.noMetal ? null : t.arm, metalness: o.noMetal ? 0 : 1,
    color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, aoMapIntensity: 1,
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    transparent: !!o.transparent, alphaMap: o.alphaMap || null, depthWrite: !o.transparent,
  });
  if (o.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; }
  const grime = o.grime ?? 0, macro = o.macro ?? 0.22;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: tile };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTile;\nvarying vec3 vWP;')
      .replace('#include <uv_vertex>', /* glsl */`#include <uv_vertex>
        mat4 wmx = modelMatrix;
        #ifdef USE_INSTANCING
          wmx = modelMatrix * instanceMatrix;
        #endif
        vec3 wpos = (wmx * vec4(position, 1.0)).xyz;
        vWP = wpos;
        vec3 wn = abs(normalize(mat3(wmx) * normal));
        vec2 tuv = (wn.x > wn.y && wn.x > wn.z) ? wpos.zy : ((wn.y > wn.z) ? wpos.xz : wpos.xy);
        tuv /= uTile;
        #ifdef USE_MAP
          vMapUv = tuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = tuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = tuv;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = tuv;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv = tuv;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        float mv = wNoise(vWP.xz * 0.035) * 0.6 + wNoise(vWP.xz * 0.19 + vWP.y * 0.13) * 0.4;
        diffuseColor.rgb *= mix(1.0 - ${macro.toFixed(3)}, 1.0 + ${(macro * 0.4).toFixed(3)}, mv);
        ${grime > 0 ? /* glsl */`
        diffuseColor.rgb *= mix(1.0 - ${grime.toFixed(3)}, 1.0, smoothstep(0.1, 1.8, vWP.y));
        float streak = smoothstep(0.55, 0.95, wNoise(vec2((vWP.x + vWP.z) * 1.7, vWP.y * 0.05)));
        diffuseColor.rgb *= 1.0 - streak * ${(grime * 0.45).toFixed(3)};` : ''}`);
  };
  m.customProgramCacheKey = () => `wm_${grime}_${macro}_${!!o.alphaMap}`;
  return m;
}

let M = null;
function makeMaterials() {
  const soot = new THREE.MeshStandardMaterial({ map: TEX.scorch, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.85 });
  const blast = new THREE.MeshStandardMaterial({ map: blastTexture(), transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3 });
  M = {
    walls: [
      worldMat('plastered_wall_04', 3, { color: 0xf2ece0, grime: 0.35 }),
      worldMat('beige_wall_001', 2.5, { color: 0xe8dcc4, grime: 0.35 }),
      worldMat('painted_plaster_wall', 2.5, { color: 0xe6dcc8, grime: 0.3 }),
      worldMat('concrete_wall_006', 3, { color: 0xd0cbc2, grime: 0.3 }),
      worldMat('plastered_wall_04', 3, { color: 0xdcc8a4, grime: 0.35 }),
      worldMat('beige_wall_001', 2.5, { color: 0xc8c4bc, grime: 0.3 }),
    ],
    damaged: [
      worldMat('damaged_plaster', 2.5, { color: 0xb8b0a2, grime: 0.5 }),
      worldMat('damaged_plaster', 2.5, { color: 0x9c948a, grime: 0.55 }),
    ],
    roof: worldMat('concrete_floor_worn_001', 4, { color: 0xc8c2b6 }),
    ground: worldMat('dry_ground_01', 4.5, { color: 0xe6d6b4, macro: 0.35 }),
    asphalt: worldMat('asphalt_02', 5, { color: 0xb8b4ac, macro: 0.3 }),
    pavement: worldMat('concrete_floor_worn_001', 2.5, { color: 0xd8d0c0, macro: 0.3 }),
    concrete: worldMat('concrete_wall_008', 2, { color: 0xd8d2c8, grime: 0.2 }),
    trim: worldMat('concrete_wall_006', 2, {}),
    rubble: worldMat('rubble', 2.5, { color: 0xa89e90, macro: 0.25 }),
    chunk: worldMat('concrete_wall_008', 1, {}),
    rust: worldMat('rusty_metal_02', 1.5, { color: 0x8a7a70 }),
    burnt: worldMat('rusty_metal_02', 1.2, { color: 0x3e3530 }),
    hessian: worldMat('hessian_230', 0.7, { color: 0xd8c49a, noMetal: true }),
    shutter: worldMat('painted_metal_shutter', 2.2, { color: 0xc0c4be }),
    tank: new THREE.MeshStandardMaterial({ color: 0x8c876a, roughness: 0.72, metalness: 0.35, normalMap: assets.tex.concrete_wall_006.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), aoMap: null }),
    sandDrift: worldMat('dry_ground_01', 4.5, { color: 0xe6d6b4, macro: 0.35, transparent: true, alphaMap: driftTexture() }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.28, metalness: 0, envMapIntensity: 0.45 }),
    void: new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1, metalness: 0 }),
    ac: new THREE.MeshStandardMaterial({ color: 0xa8a69e, roughness: 0.6, metalness: 0.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85, metalness: 0.1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.4, metalness: 0.9 }),
    rebar: new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.7, metalness: 0.6 }),
    plasticTank: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.45, metalness: 0 }),
    whiteTank: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4, metalness: 0.3 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x18253a, roughness: 0.1, metalness: 0.7 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6e5c46, roughness: 0.95, metalness: 0, normalMap: assets.tex.hessian_230.normalMap }),
    frond: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9, metalness: 0 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x4d5534, roughness: 0.8, metalness: 0.1 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x030303 }),
    shaftInner: new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1, metalness: 0, side: THREE.BackSide }),
    soot, blast,
  };
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function frondTexture() {
  return canvasTex(128, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#6b6a3a'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, 0); x.stroke();
    for (let y = 20; y < h - 10; y += 7) {
      const t = 1 - y / h;
      const len = (w / 2 - 4) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      for (const s of [-1, 1]) {
        const g = 70 + Math.random() * 40;
        x.strokeStyle = `rgb(${g * 0.75 | 0},${g + 20 | 0},${g * 0.4 | 0})`;
        x.lineWidth = 3;
        x.beginPath(); x.moveTo(w / 2, y); x.quadraticCurveTo(w / 2 + s * len * 0.6, y - 14, w / 2 + s * len, y - 26 - Math.random() * 6); x.stroke();
      }
    }
  });
}
function blastTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    x.translate(w / 2, h / 2);
    const g = x.createRadialGradient(0, 0, 10, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(15,12,10,0.9)'); g.addColorStop(0.55, 'rgba(25,22,18,0.55)'); g.addColorStop(1, 'rgba(25,22,18,0)');
    x.fillStyle = g; x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = '#060505';
    x.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = w * rand(0.16, 0.3);
      if (i === 0) x.moveTo(Math.cos(a) * r, Math.sin(a) * r); else x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.fill();
    x.fillStyle = 'rgba(120,112,100,0.5)';
    for (let i = 0; i < 40; i++) { const a = rand(0, 7), r = w * rand(0.25, 0.42); x.fillRect(Math.cos(a) * r, Math.sin(a) * r, rand(2, 6), rand(2, 6)); }
  });
}
function driftTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#aaa'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`; x.beginPath(); x.arc(rand(0, w), rand(0, h), rand(2, 10), 0, 7); x.fill(); }
  }, false);
}

// ============================================================
//  INSTANCE BATCHES
// ============================================================
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
// Batches draw with their own copies of the shared materials. three.js keeps one shader state per
// material, so alternating instanced/plain (or coloured/uncoloured) users forces a program lookup per draw.
const instMats = new Map();
function instanceMaterial(m, colored) {
  if (Array.isArray(m)) return m.map((x) => instanceMaterial(x, colored));
  const key = m.uuid + (colored ? ':c' : '');
  let copy = instMats.get(key);
  if (!copy) {
    copy = m.clone();
    // clone() drops the world-space tiling shader, which stretches a texture across a whole street.
    copy.onBeforeCompile = m.onBeforeCompile;
    copy.customProgramCacheKey = m.customProgramCacheKey;
    instMats.set(key, copy);
  }
  return copy;
}
class Batch {
  constructor(geo, mat, cast = true) { this.geo = geo; this.mat = mat; this.cast = cast; this.m = []; this.c = []; }
  add(x, y, z, sx, sy, sz, ry = 0, color = null, rx = 0, rz = 0, order = 'XYZ') {
    _e.set(rx, ry, rz, order);
    _q.setFromEuler(_e);
    this.m.push(new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
    this.c.push(color);
  }
  addMatrix(mx, color = null) { this.m.push(mx); this.c.push(color); }
  build(scene) {
    if (!this.m.length) return null;
    const colored = this.c.some((c) => c !== null);
    const im = new THREE.InstancedMesh(this.geo, instanceMaterial(this.mat, colored), this.m.length);
    this.m.forEach((m, i) => im.setMatrixAt(i, m));
    if (colored) this.c.forEach((c, i) => im.setColorAt(i, _c.set(c ?? 0xffffff)));
    im.castShadow = this.cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    return im;
  }
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitBoxC = new THREE.BoxGeometry(1, 1, 1);
// Building block with its four walls and its top/bottom as two contiguous groups ([wall, roof] materials),
// so a building batch costs two draw calls instead of one per face.
const wallBox = (() => {
  const g = unitBox.clone(), src = g.index.array, out = new src.constructor(src.length);
  [0, 1, 4, 5, 2, 3].forEach((face, i) => out.set(src.subarray(face * 6, face * 6 + 6), i * 6));
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.clearGroups();
  g.addGroup(0, 24, 0);
  g.addGroup(24, 12, 1);
  return g;
})();
const unitPlane = new THREE.PlaneGeometry(1, 1);

function jitter(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 5.1 + z * 3.7 + seed) * 0.5 + Math.sin(x * 11.3 + y * 7.1 + seed * 2) * 0.3 + Math.sin(z * 9.3 - y * 5.7 + seed * 3) * 0.2;
    const k = 1 + n * amt;
    p.setXYZ(i, x * k, y * (1 + n * amt * 0.6), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

let B = null;
function makeBatches() {
  const moundGeo = jitter(jitter(new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0.3, 1.7), 0.12, 9.3);
  const rockGeo = jitter(new THREE.DodecahedronGeometry(1, 1), 0.3, 4.2);
  const sandbagGeo = new RoundedBoxGeometry(0.58, 0.15, 0.32, 2, 0.065);
  const jerseyShape = new THREE.Shape([
    new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.3, 0.08), new THREE.Vector2(0.1, 0.33),
    new THREE.Vector2(0.075, 0.81), new THREE.Vector2(-0.075, 0.81), new THREE.Vector2(-0.1, 0.33), new THREE.Vector2(-0.3, 0.08),
  ]);
  const jerseyGeo = new THREE.ExtrudeGeometry(jerseyShape, { depth: 3, bevelEnabled: false }).translate(0, 0, -1.5);
  const twallShape = new THREE.Shape([
    new THREE.Vector2(-0.6, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0.6, 0.35), new THREE.Vector2(0.15, 0.45),
    new THREE.Vector2(0.12, 3.6), new THREE.Vector2(-0.12, 3.6), new THREE.Vector2(-0.15, 0.45), new THREE.Vector2(-0.6, 0.35),
  ]);
  const twallGeo = new THREE.ExtrudeGeometry(twallShape, { depth: 1.45, bevelEnabled: false }).translate(0, 0, -0.725);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
  const cylLow = new THREE.CylinderGeometry(1, 1, 1, 7).translate(0, 0.5, 0);
  const pole = new THREE.CylinderGeometry(0.1, 0.17, 1, 8).translate(0, 0.5, 0);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14).rotateZ(Math.PI / 2);
  const tire = new THREE.TorusGeometry(0.3, 0.11, 8, 16).rotateX(Math.PI / 2);
  const frond = new THREE.PlaneGeometry(1.1, 3.6, 2, 10).translate(0, 1.8, 0);
  const fp = frond.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i), t = y / 3.6;
    fp.setZ(i, -t * t * 1.9 + Math.abs(x) * 0.35);
  }
  frond.computeVertexNormals();

  B = {
    walls: M.walls.map((wm) => new Batch(wallBox, [wm, M.roof])),
    damaged: M.damaged.map((wm) => new Batch(wallBox, [wm, M.roof])),
    pads: new Batch(unitBox, M.pavement),
    streets: new Batch(unitBox, M.asphalt, false),
    trim: new Batch(unitBoxC, M.trim),
    glass: new Batch(unitBoxC, M.glass, false),
    void: new Batch(unitBoxC, M.void, false),
    shutter: new Batch(unitBoxC, M.shutter, false),
    ac: new Batch(unitBoxC, M.ac),
    soot: new Batch(unitPlane, M.soot, false),
    blast: new Batch(unitPlane, M.blast, false),
    mound: new Batch(moundGeo, M.rubble),
    rock: new Batch(rockGeo, M.chunk),
    slab: new Batch(unitBoxC, M.concrete),
    rebar: new Batch(cylLow, M.rebar),
    sandbag: new Batch(sandbagGeo, M.hessian),
    jersey: new Batch(jerseyGeo, M.concrete),
    twall: new Batch(twallGeo, M.concrete),
    block: new Batch(unitBox, M.concrete),
    waterTank: new Batch(cyl, M.plasticTank),
    whiteTank: new Batch(cyl, M.whiteTank),
    solar: new Batch(unitBoxC, M.solar),
    pole: new Batch(pole, M.concrete),
    crossarm: new Batch(unitBoxC, M.steel),
    wheel: new Batch(wheel, M.burnt),
    tire: new Batch(tire, M.rubber),
    frond: new Batch(frond, M.frond),
    drift: new Batch(unitPlane, M.sandDrift, false),
    far: M.walls.map((wm) => new Batch(wallBox, [wm, M.roof], false)),
  };
}

// ============================================================
//  COLLIDERS
// ============================================================
export function addCollider(minX, maxX, minZ, maxZ, bottom, top, surf = 'concrete') {
  const c = { minX, maxX, minZ, maxZ, bottom, top, surf };
  colliders.push(c);
  return c;
}
function colliderBox(x, z, w, d, bottom, top, surf, map) {
  addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, bottom, top, surf);
  if (map) mapRects.push({ x: x - w / 2, z: z - d / 2, w, d, kind: map });
}

// ============================================================
//  BUILDINGS
// ============================================================
const TRIM_TINTS = [0xf0ece4, 0xe0d8c8, 0xd4ccbc, 0xc8c4bc, 0xe8dcc4];

function facade(cx, cz, w, d, f0, nf, damaged, tint) {
  const sides = [
    { nx: 0, nz: 1, L: w, ox: cx, oz: cz + d / 2, ry: 0 },
    { nx: 0, nz: -1, L: w, ox: cx, oz: cz - d / 2, ry: Math.PI },
    { nx: 1, nz: 0, L: d, ox: cx + w / 2, oz: cz, ry: Math.PI / 2 },
    { nx: -1, nz: 0, L: d, ox: cx - w / 2, oz: cz, ry: -Math.PI / 2 },
  ];
  for (const s of sides) {
    const ax = Math.cos(s.ry), az = -Math.sin(s.ry);
    const place = (b, u, y, out, sx, sy, sz, col = null) => b.add(s.ox + ax * u + s.nx * out, y, s.oz + az * u + s.nz * out, sx, sy, sz, s.ry, col);
    const cols = Math.max(1, Math.floor((s.L - 1) / 3.3));
    const sp = s.L / cols;
    for (let f = f0; f < f0 + nf; f++) {
      const y0 = f * 3;
      if (f > 0) place(B.trim, 0, y0 + 0.05, 0.04, s.L + 0.1, 0.18, 0.08, tint);
      for (let i = 0; i < cols; i++) {
        const u = -s.L / 2 + sp * (i + 0.5);
        if (f === 0) {
          const r = Math.random(), sw = Math.min(2.6, sp - 0.6);
          if (r < 0.55) {
            place(B.shutter, u, 1.35, 0.03, sw, 2.5, 0.06);
            place(B.trim, u, 2.7, 0.1, sw + 0.3, 0.22, 0.2, tint);
          } else if (r < 0.8) {
            place(B.void, u, 1.2, 0.02, 1.1, 2.3, 0.04);
            place(B.trim, u - 0.62, 1.2, 0.07, 0.14, 2.4, 0.14, tint);
            place(B.trim, u + 0.62, 1.2, 0.07, 0.14, 2.4, 0.14, tint);
            place(B.trim, u, 2.42, 0.08, 1.4, 0.14, 0.16, tint);
          }
          continue;
        }
        const pw = 1.25, ph = 1.45, wy = y0 + 1.6;
        const r = Math.random();
        if ((damaged && r < 0.5) || r < 0.12) place(B.void, u, wy, 0.015, pw, ph, 0.03);
        else if (r < 0.32) place(B.shutter, u, wy, 0.03, pw, ph, 0.05);
        else place(B.glass, u, wy, 0.015, pw, ph, 0.03, Math.random() < 0.5 ? 0xffffff : 0xb8c0c8);
        place(B.trim, u - pw / 2 - 0.06, wy, 0.07, 0.12, ph + 0.24, 0.14, tint);
        place(B.trim, u + pw / 2 + 0.06, wy, 0.07, 0.12, ph + 0.24, 0.14, tint);
        place(B.trim, u, wy + ph / 2 + 0.06, 0.08, pw + 0.24, 0.12, 0.16, tint);
        place(B.trim, u, wy - ph / 2 - 0.05, 0.12, pw + 0.4, 0.08, 0.24, tint);
        if (!damaged && Math.random() < 0.15 && sp > 2.6) {
          const bw = sp * 0.8;
          place(B.trim, u, y0 + 0.08, 0.6, bw, 0.16, 1.2, tint);
          place(B.trim, u, y0 + 0.66, 1.15, bw, 1.0, 0.1, tint);
          place(B.trim, u - bw / 2 + 0.05, y0 + 0.66, 0.6, 0.1, 1.0, 1.1, tint);
          place(B.trim, u + bw / 2 - 0.05, y0 + 0.66, 0.6, 0.1, 1.0, 1.1, tint);
        }
        if (Math.random() < 0.1 && sp > 2.8) place(B.ac, u + pw / 2 + 0.62, wy - 0.3, 0.18, 0.75, 0.5, 0.3);
        if ((damaged && Math.random() < 0.35) || Math.random() < 0.04) place(B.soot, u, wy + 1.1, 0.02, rand(1.6, 2.2), rand(2.2, 3), 1);
      }
    }
    if (damaged) {
      const n = randInt(1, 3);
      for (let k = 0; k < n; k++) {
        const sz = rand(2, 3.6);
        if (s.L < sz + 1) continue;
        place(B.blast, rand(-s.L / 2 + sz / 2, s.L / 2 - sz / 2), rand(f0 * 3 + 2, Math.max(f0 * 3 + 2.1, (f0 + nf) * 3 - 1.5)), 0.03, sz, sz * rand(0.7, 1), 1);
      }
    }
  }
}

function roof(cx, cz, w, d, h, damaged, tint) {
  B.trim.add(cx, h + 0.45, cz - d / 2 + 0.1, w, 0.9, 0.2, 0, tint);
  B.trim.add(cx, h + 0.45, cz + d / 2 - 0.1, w, 0.9, 0.2, 0, tint);
  B.trim.add(cx - w / 2 + 0.1, h + 0.45, cz, 0.2, 0.9, d - 0.4, 0, tint);
  B.trim.add(cx + w / 2 - 0.1, h + 0.45, cz, 0.2, 0.9, d - 0.4, 0, tint);
  if (damaged) return;
  const n = randInt(0, 4);
  const tx = cx + rand(-w / 3, w / 3), tz = cz + rand(-d / 3, d / 3);
  for (let i = 0; i < n; i++) B.waterTank.add(tx + (i % 2) * 1.3, h, tz + Math.floor(i / 2) * 1.3, 0.55, 1.15, 0.55);
  if (Math.random() < 0.45) {
    const sx = cx + rand(-w / 4, w / 4), sz = cz + rand(-d / 4, d / 4);
    B.solar.add(sx, h + 0.7, sz, 1.0, 0.05, 1.9, 0, null, -0.7);
    B.whiteTank.add(sx, h + 1.25, sz - 0.7, 0.3, 1.1, 0.3, 0, null, 0, Math.PI / 2);
  }
  if (Math.random() < 0.5) {
    const hx = cx + rand(-w / 4, w / 4), hz = cz + rand(-d / 4, d / 4);
    B.trim.add(hx, h + 1.2, hz, 2.6, 2.4, 2.8, 0, tint);
  }
  if (Math.random() < 0.4) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sx * (w / 2 - 0.4), pz = cz + sz * (d / 2 - 0.4);
      for (let k = 0; k < 4; k++) B.rebar.add(px + (k % 2) * 0.15, h, pz + (k >> 1) * 0.15, 0.012, rand(1, 1.6), 0.012, 0, null, rand(-0.1, 0.1), rand(-0.1, 0.1));
    }
  }
}

function building(cx, cz, w, d, floors, damaged) {
  const tint = pick(TRIM_TINTS);
  const batch = damaged ? pick(B.damaged) : pick(B.walls);
  const surf = 'concrete';
  if (!damaged || floors < 3) {
    batch.add(cx, 0, cz, w, floors * 3, d);
    colliderBox(cx, cz, w, d, 0, floors * 3, surf, 'b');
    facade(cx, cz, w, d, 0, floors, damaged, tint);
    roof(cx, cz, w, d, floors * 3, damaged, tint);
    if (damaged) rubblePile(cx + rand(-w / 4, w / 4), cz + rand(-d / 4, d / 4), rand(2, 3.5), floors * 3, false);
    return;
  }
  const keep = randInt(1, floors - 2);
  batch.add(cx, 0, cz, w, keep * 3, d);
  colliderBox(cx, cz, w, d, 0, keep * 3, surf, 'b');
  facade(cx, cz, w, d, 0, keep, true, tint);
  roof(cx, cz, w, d, keep * 3, true, tint);

  const alongX = Math.random() < 0.5, side = Math.random() < 0.5 ? -1 : 1;
  let ux = cx, uz = cz, uw = w, ud = d;
  if (alongX) { uw = w * rand(0.4, 0.6); ux = cx + side * (w - uw) / 2; } else { ud = d * rand(0.4, 0.6); uz = cz + side * (d - ud) / 2; }
  const upF = floors - keep;
  batch.add(ux, keep * 3, uz, uw, upF * 3, ud);
  colliderBox(ux, uz, uw, ud, keep * 3, floors * 3, surf, null);
  facade(ux, uz, uw, ud, keep, upF, true, tint);
  roof(ux, uz, uw, ud, floors * 3, true, tint);

  const bx = alongX ? ux - side * uw / 2 : ux, bz = alongX ? uz : uz - side * ud / 2;
  const colX = alongX ? (bx + (cx - side * w / 2)) / 2 : cx, colZ = alongX ? cz : (bz + (cz - side * d / 2)) / 2;
  rubblePile(colX, colZ, Math.min(alongX ? (w - uw) : (d - ud), alongX ? d : w) * 0.45, keep * 3, false);
  for (let k = 1; k <= upF; k++) {
    const y = keep * 3 + k * 3 - 0.1;
    const ext = rand(1.2, 2.6), tilt = rand(0.25, 0.6);
    if (alongX) B.slab.add(bx - side * ext / 2, y - ext * 0.3, bz, ext, 0.22, ud * rand(0.5, 0.85), 0, null, 0, side * tilt);
    else B.slab.add(bx, y - ext * 0.3, bz - side * ext / 2, uw * rand(0.5, 0.85), 0.22, ext, 0, null, -side * tilt, 0);
    for (let r = 0; r < 6; r++) {
      const off = rand(-0.45, 0.45) * (alongX ? ud : uw);
      const rx = alongX ? bx : bx + off, rz = alongX ? bz + off : bz;
      B.rebar.add(rx, y, rz, 0.012, rand(0.6, 1.4), 0.012, 0, null, alongX ? 0 : -side * rand(1, 1.5), alongX ? side * rand(1, 1.5) : 0);
    }
  }
  const spillX = alongX ? cx - side * (w / 2 + 1.2) : cx + rand(-w / 4, w / 4);
  const spillZ = alongX ? cz + rand(-d / 4, d / 4) : cz - side * (d / 2 + 1.2);
  rubblePile(spillX, spillZ, rand(2, 3), 0, true);
}

export function rubblePile(x, z, r, y0 = 0, collide = true) {
  B.mound.add(x, y0, z, r, r * rand(0.3, 0.42), r * rand(0.8, 1.2), rand(0, 6));
  const n = Math.round(8 + r * 4);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), dd = rand(0, r * 1.15), s = rand(0.12, 0.45);
    const hh = Math.max(0, (1 - (dd / r) ** 2)) * r * 0.35;
    B.rock.add(x + Math.cos(a) * dd, y0 + hh * 0.9, z + Math.sin(a) * dd, s, s * rand(0.5, 1), s * rand(0.7, 1.2), rand(0, 6), pick([0xffffff, 0xd8d0c4, 0xbab2a6, 0xe8dcc8]), rand(0, 6), rand(0, 6));
  }
  for (let i = 0; i < 3 + r; i++) {
    const a = rand(0, Math.PI * 2), dd = rand(0, r * 0.9);
    const hh = Math.max(0, (1 - (dd / r) ** 2)) * r * 0.35;
    B.slab.add(x + Math.cos(a) * dd, y0 + hh, z + Math.sin(a) * dd, rand(0.6, 1.8), 0.15, rand(0.5, 1.3), rand(0, 6), null, rand(-0.6, 0.6), rand(-0.6, 0.6));
  }
  for (let i = 0; i < randInt(3, 7); i++) {
    const a = rand(0, Math.PI * 2), dd = rand(0, r * 0.7);
    B.rebar.add(x + Math.cos(a) * dd, y0 + r * 0.15, z + Math.sin(a) * dd, 0.012, rand(0.8, 1.8), 0.012, 0, null, rand(-1, 1), rand(-1, 1));
  }
  if (collide) colliderBox(x, z, r * 1.2, r * 1.2, 0, y0 + r * 0.32, 'concrete', 'c');
}

// ============================================================
//  PROPS
// ============================================================
function jersey(x, z, rotated) {
  B.jersey.add(x, 0, z, 1, 1, 1, rotated ? 0 : Math.PI / 2 + rand(-0.03, 0.03));
  colliderBox(x, z, rotated ? 0.6 : 3, rotated ? 3 : 0.6, 0, 0.81, 'concrete', 'c');
}
function sandbagWall(x, z, rotated, len = 2.6, rows = 7) {
  const n = Math.round(len / 0.56);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - (r % 2); i++) {
      const u = -len / 2 + 0.28 + i * 0.56 + (r % 2) * 0.28 + rand(-0.03, 0.03);
      const y = 0.075 + r * 0.14;
      const col = pick([0xffffff, 0xece0c8, 0xd8ccb0, 0xc8bca0]);
      if (rotated) B.sandbag.add(x + rand(-0.03, 0.03), y, z + u, 1, 1, 1, Math.PI / 2 + rand(-0.08, 0.08), col, rand(-0.05, 0.05));
      else B.sandbag.add(x + u, y, z + rand(-0.03, 0.03), 1, 1, 1, rand(-0.08, 0.08), col, rand(-0.05, 0.05));
    }
  }
  colliderBox(x, z, rotated ? 0.4 : len, rotated ? len : 0.4, 0, rows * 0.14 + 0.02, 'sand', 'c');
}
function concreteBlock(x, z) {
  const s = rand(1.1, 1.4);
  B.block.add(x, 0, z, s, s, s, rand(-0.1, 0.1));
  colliderBox(x, z, s, s, 0, s, 'concrete', 'c');
}

const carBodyShape = new THREE.Shape([
  new THREE.Vector2(-2.15, 0.32), new THREE.Vector2(2.1, 0.32), new THREE.Vector2(2.2, 0.62), new THREE.Vector2(2.05, 0.82),
  new THREE.Vector2(1.0, 0.9), new THREE.Vector2(-1.4, 0.92), new THREE.Vector2(-2.15, 0.85), new THREE.Vector2(-2.2, 0.55),
]);
const carCabinShape = new THREE.Shape([
  new THREE.Vector2(-1.35, 0.9), new THREE.Vector2(0.95, 0.9), new THREE.Vector2(0.35, 1.38), new THREE.Vector2(-1.0, 1.4),
]);
let carBodyGeo, carCabinGeo, carGlassGeo;
function carGeos() {
  const ext = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }).translate(0, 0, -depth / 2).rotateY(Math.PI / 2);
  carBodyGeo = ext(carBodyShape, 1.7);
  carCabinGeo = ext(carCabinShape, 1.46);
  const glass = new THREE.Shape([
    new THREE.Vector2(-1.25, 0.95), new THREE.Vector2(0.85, 0.95), new THREE.Vector2(0.33, 1.32), new THREE.Vector2(-0.95, 1.34),
  ]);
  carGlassGeo = new THREE.ExtrudeGeometry(glass, { depth: 1.52, bevelEnabled: false }).translate(0, 0, -0.76).rotateY(Math.PI / 2);
}
function burntCar(scene, x, z, rotated) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(carBodyGeo, M.burnt); body.castShadow = body.receiveShadow = true;
  const cab = new THREE.Mesh(carCabinGeo, M.burnt); cab.castShadow = cab.receiveShadow = true;
  const gl = new THREE.Mesh(carGlassGeo, M.void);
  g.add(body, cab, gl);
  const ry = (rotated ? Math.PI / 2 : 0) + rand(-0.12, 0.12) + (Math.random() < 0.5 ? Math.PI : 0);
  g.position.set(x, -0.12, z);
  g.rotation.set(rand(-0.03, 0.03), ry, rand(-0.05, 0.05));
  scene.add(g);
  for (const [wx, wz] of [[-0.78, -1.35], [0.78, -1.35], [-0.78, 1.35], [0.78, 1.35]]) {
    const c = Math.cos(ry), s = Math.sin(ry);
    B.wheel.add(x + wx * c + wz * s, 0.2, z - wx * s + wz * c, 1, 0.8, 0.8, ry);
  }
  const w = rotated ? 4.4 : 1.8, d = rotated ? 1.8 : 4.4;
  colliderBox(x, z, w, d, 0, 1.3, 'metal', 'c');
  if (Math.random() < 0.25) addSmokePlume(new THREE.Vector3(x, 0.6, z), 0.3, true);
}

function technical(scene, x, z, rotated) {
  const { root, size } = makeProp('pickup');
  root.rotation.y = (rotated ? Math.PI / 2 : 0) + rand(-0.1, 0.1) + (Math.random() < 0.5 ? Math.PI : 0);
  root.position.set(x, 0, z);
  scene.add(root);
  const w = rotated ? size.z : size.x, d = rotated ? size.x : size.z;
  colliderBox(x, z, w, d, 0, Math.min(size.y, 1.9), 'metal', 'c');
}

function palm(x, z) {
  const h = rand(6, 9), lean = rand(-0.6, 0.6), la = rand(0, Math.PI * 2);
  const top = new THREE.Vector3(x + Math.cos(la) * lean, h, z + Math.sin(la) * lean);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + Math.cos(la) * lean * 0.2, h * 0.5, z + Math.sin(la) * lean * 0.2), top]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.19, 8), M.bark);
  trunk.castShadow = trunk.receiveShadow = true;
  scene.add(trunk);
  const n = randInt(11, 15);
  const qy = new THREE.Quaternion(), qx = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i / n) * Math.PI * 2 + rand(-0.2, 0.2));
    qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rand(0.5, 1.3));
    const q = qy.clone().multiply(qx);
    const s = rand(0.8, 1.15);
    B.frond.addMatrix(new THREE.Matrix4().compose(top, q, new THREE.Vector3(s, s, s)), pick([0xffffff, 0xe8f0d0, 0xd8d0a0]));
  }
  colliderBox(x, z, 0.4, 0.4, 0, h, 'concrete', null);
}

function tunnelShaft(x, z, y0) {
  const ringShape = [new THREE.Vector2(0.72, 0), new THREE.Vector2(1.0, 0), new THREE.Vector2(1.0, 0.45), new THREE.Vector2(0.72, 0.45)];
  const ring = new THREE.Mesh(new THREE.LatheGeometry(ringShape, 24), M.concrete);
  ring.position.set(x, y0, z);
  ring.castShadow = ring.receiveShadow = true;
  scene.add(ring);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), M.hole);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, y0 + 0.02, z);
  scene.add(hole);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.43, 24, 1, true), M.shaftInner);
  inner.position.set(x, y0 + 0.235, z);
  scene.add(inner);
  sandbagWall(x + 1.9, z + rand(-0.5, 0.5), true, 1.8, 4);
  B.slab.add(x - 1.6, y0 + 0.05, z + 0.6, 2.4, 0.06, 0.3, rand(0, 3));
  shafts.push(new THREE.Vector3(x, y0, z));
}

function electricLine(scene, x0, z0, x1, z1) {
  const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 24);
  const pts = [];
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  const perpX = -dz / Math.hypot(dx, dz), perpZ = dx / Math.hypot(dx, dz);
  const tops = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + dx * i, z = z0 + dz * i;
    if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
    const tilt = Math.random() < 0.15 ? rand(0.1, 0.3) : 0;
    B.pole.add(x, 0, z, 1, 8.5, 1, 0, null, tilt * perpZ, -tilt * perpX);
    B.crossarm.add(x, 8.1, z, Math.abs(perpX) * 1.6 + 0.08, 0.08, Math.abs(perpZ) * 1.6 + 0.08);
    colliderBox(x, z, 0.35, 0.35, 0, 8.5, 'concrete', null);
    tops.push(new THREE.Vector3(x, 8.15, z));
  }
  for (let i = 0; i < tops.length - 1; i++) {
    if (Math.random() < 0.12) continue;
    for (const off of [-0.7, 0, 0.7]) {
      const a = tops[i].clone().add(new THREE.Vector3(perpX * off, 0, perpZ * off));
      const b = tops[i + 1].clone().add(new THREE.Vector3(perpX * off, 0, perpZ * off));
      const sag = rand(0.6, 1.2);
      for (let k = 0; k < 10; k++) {
        const t0 = k / 10, t1 = (k + 1) / 10;
        pts.push(a.clone().lerp(b, t0).add(new THREE.Vector3(0, -sag * 4 * t0 * (1 - t0), 0)));
        pts.push(a.clone().lerp(b, t1).add(new THREE.Vector3(0, -sag * 4 * t1 * (1 - t1), 0)));
      }
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x151515 })));
}

function shekemSign() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2416';
  g.fillRect(0, 0, 512, 180);
  g.strokeStyle = '#d4b45a';
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 164);
  g.fillStyle = '#f3ead2';
  g.textAlign = 'center';
  g.direction = 'rtl';
  g.font = 'bold 78px sans-serif';
  g.fillText('שק״ם', 256, 92);
  g.direction = 'ltr';
  g.fillStyle = '#d4b45a';
  g.font = 'bold 32px sans-serif';
  g.fillText('SHEKEM', 256, 142);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), new THREE.MeshBasicMaterial({ map }));
  sign.position.set(0, 2.35, 0.36);
  return sign;
}
function shekem(scene, x, z) {
  const wood = M.wood;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3d4f32, roughness: 0.9 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: 0x2c3a24, roughness: 0.92 });
  const metal = M.steel;
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5534, roughness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xd5ddd4, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  const juice = new THREE.MeshStandardMaterial({ color: 0xc4552a, roughness: 0.4 });
  const soda = new THREE.MeshStandardMaterial({ color: 0x1a4a34, roughness: 0.35, metalness: 0.1 });
  const tin = new THREE.MeshStandardMaterial({ color: 0xc5c8bc, roughness: 0.35, metalness: 0.55 });
  const g = new THREE.Group();
  const box = (w, h, d, mat, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const pole = (px, pz) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.15, 8), metal);
    m.position.set(px, 1.08, pz);
    m.castShadow = true;
    return m;
  };
  // Counter: legs, planked top, olive front, lower shelf.
  g.add(pole(-1.15, 0.28), pole(1.15, 0.28), pole(-1.15, -0.28), pole(1.15, -0.28));
  g.add(box(2.45, 0.06, 0.78, wood, 0, 1.02, 0));
  g.add(box(2.35, 0.04, 0.7, metal, 0, 0.98, 0));
  g.add(box(2.3, 0.72, 0.06, olive, 0, 0.58, 0.32));
  g.add(box(2.2, 0.05, 0.62, wood, 0, 0.28, -0.02));
  g.add(box(0.42, 0.22, 0.32, M.crate, -0.75, 0.42, -0.02));
  g.add(box(0.36, 0.18, 0.28, M.crate, 0.55, 0.4, 0));
  // Sagging canvas roof on a tube frame.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.02, 0.28), i % 2 ? cloth : cloth2);
    panel.position.set(0, 2.18 - Math.sin(t * Math.PI) * 0.07, -0.2 + t * 1.15);
    panel.rotation.x = (0.5 - t) * 0.22;
    panel.castShadow = true;
    g.add(panel);
  }
  g.add(box(2.6, 0.04, 0.08, metal, 0, 2.2, -0.22));
  g.add(box(2.6, 0.04, 0.08, metal, 0, 2.12, 0.95));
  const hem = box(2.55, 0.12, 0.04, new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.8 }), 0, 2.02, 1.02);
  g.add(hem);
  // Glass sneeze guard and goods on the counter.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.015), glass);
  guard.position.set(0, 1.2, 0.28);
  g.add(guard);
  const bottle = (mat, px, pz) => {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.2, 8), mat);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.055, 8), mat);
    neck.position.y = 0.12;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), metal);
    cap.position.y = 0.155;
    b.add(body, neck, cap);
    b.position.set(px, 1.16, pz);
    b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return b;
  };
  const can = (px, pz, h = 0.12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, h, 10), tin);
    m.position.set(px, 1.05 + h / 2, pz);
    m.castShadow = true;
    return m;
  };
  g.add(bottle(juice, -0.85, 0.05), bottle(soda, -0.72, -0.08), bottle(juice, -0.6, 0.08));
  g.add(can(-0.2, 0.02), can(-0.1, -0.06, 0.1), can(0.0, 0.05), can(0.1, -0.02, 0.11));
  g.add(box(0.38, 0.16, 0.24, M.crate, 0.55, 1.13, -0.05));
  g.add(box(0.28, 0.2, 0.2, olive, 0.92, 1.15, 0.02));
  const sign = shekemSign();
  sign.position.set(0, 1.85, 1.05);
  g.add(sign);
  g.position.set(x, 0, z);
  // The Merkava and the spawn are up the street (+Z). The counter faces that way.
  g.rotation.y = 0;
  scene.add(g);
  colliderBox(x, z, 2.5, 0.85, 0, 1.08, 'wood', 'c');
  world.shekemPos = new THREE.Vector3(x, 0, z + 1.7);
  world.resupplyPos = world.shekemPos;
  // Seller stands on the far side of the counter, facing the customers.
  world.sellerPos = new THREE.Vector3(x, 0, z - 0.95);
  world.sellerFace = 0;
}
function merkava(scene, x, z) {
  const { root } = makeProp('merkava');
  root.rotation.y = Math.PI + 0.05;
  root.position.set(x, 0, z);
  scene.add(root);
  colliderBox(x, z, 4.4, 8.4, 0, 2.9, 'metal', 't');
  world.tankPos = new THREE.Vector3(x, 0, z);
}

// ============================================================
//  BUILD
// ============================================================
let scene = null;
export function buildWorld(sc) {
  scene = sc;
  makeMaterials();
  makeBatches();
  carGeos();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const CELL = 30, BLOCK = 21, N = 7;
  const PAD = 0.15;
  for (let i = 0; i <= N; i++) {
    const c = (i - N / 2) * CELL;
    B.streets.add(c, 0, 0, 8.2, 0.012, HALF * 2);
    B.streets.add(0, 0.002, c, HALF * 2, 0.012, 8.2);
  }
  for (let i = 0; i < 90; i++) {
    const line = randInt(0, N), c = (line - N / 2) * CELL + rand(-3.5, 3.5), along = rand(-HALF, HALF), s = rand(2, 6);
    if (Math.random() < 0.5) B.drift.add(c, 0.02, along, s, s * rand(1, 2.5), 1, rand(0, 6), null, -Math.PI / 2, 0, 'YXZ');
    else B.drift.add(along, 0.02, c, s * rand(1, 2.5), s, 1, rand(0, 6), null, -Math.PI / 2, 0, 'YXZ');
  }

  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const cx = (bi - 3) * CELL, cz = (bj - 3) * CELL;
      B.pads.add(cx, 0, cz, BLOCK, PAD, BLOCK);
      addCollider(cx - BLOCK / 2, cx + BLOCK / 2, cz - BLOCK / 2, cz + BLOCK / 2, 0, PAD, 'concrete');
      const r = Math.random();
      if (bi === 3 && bj === 3) {
        tunnelShaft(cx, cz, PAD);
        rubblePile(cx + 6, cz - 5, 2.5, PAD);
        rubblePile(cx - 7, cz + 4, 2, PAD);
        sandbagWall(cx - 3, cz + 7, false);
        palm(cx + 8, cz + 8); palm(cx - 8, cz - 8);
        continue;
      }
      if (r < 0.2 || (bj === 0 && bi % 2 === 0)) {
        const n = randInt(2, 4);
        for (let k = 0; k < n; k++) rubblePile(cx + rand(-6.5, 6.5), cz + rand(-6.5, 6.5), rand(1.8, 3), PAD);
        const ww = rand(4, 8), wh = rand(1.5, 3.5), wx = cx + rand(-5, 5), wz = cz + rand(-8, 8);
        B.slab.add(wx, PAD + wh / 2, wz, ww, wh, 0.35);
        colliderBox(wx, wz, ww, 0.35, 0, PAD + wh, 'concrete', 'c');
        const ww2 = rand(4, 8), wh2 = rand(1.5, 3.5), wx2 = cx + rand(-8, 8), wz2 = cz + rand(-5, 5);
        B.slab.add(wx2, PAD + wh2 / 2, wz2, 0.35, wh2, ww2);
        colliderBox(wx2, wz2, 0.35, ww2, 0, PAD + wh2, 'concrete', 'c');
        if (bj < 5) tunnelShaft(cx + rand(-3, 3), cz + rand(-3, 3), PAD);
        if (Math.random() < 0.5) palm(cx + rand(-8, 8), cz + rand(-8, 8));
        continue;
      }
      const split = Math.random();
      const dmg = () => Math.random() < 0.32;
      const fl = () => randInt(2, 6);
      if (split < 0.3) {
        building(cx, cz, rand(14, BLOCK - 1), rand(14, BLOCK - 1), fl(), dmg());
      } else if (split < 0.6) {
        const hw = (BLOCK - 2) / 2;
        if (Math.random() < 0.5) {
          building(cx - hw / 2 - 0.75, cz, hw - 0.5, rand(14, BLOCK - 1), fl(), dmg());
          building(cx + hw / 2 + 0.75, cz, hw - 0.5, rand(14, BLOCK - 1), fl(), dmg());
        } else {
          building(cx, cz - hw / 2 - 0.75, rand(14, BLOCK - 1), hw - 0.5, fl(), dmg());
          building(cx, cz + hw / 2 + 0.75, rand(14, BLOCK - 1), hw - 0.5, fl(), dmg());
        }
      } else {
        const q = (BLOCK - 2.5) / 2;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const px = cx + sx * (q / 2 + 0.9), pz = cz + sz * (q / 2 + 0.9);
          if (Math.random() < 0.15) { rubblePile(px, pz, 2.5, PAD); continue; }
          building(px, pz, q * rand(0.8, 0.95), q * rand(0.8, 0.95), fl(), dmg());
        }
      }
    }
  }
  if (shafts.length < 6) {
    for (const [x, z] of [[-45, -60], [45, -60], [-75, -15], [75, -15], [-15, -90], [15, -45]]) {
      if (shafts.length >= 7) break;
      tunnelShaft(x, z, 0);
    }
  }

  const spawn = world.spawn;
  let placed = 0, guard = 0;
  while (placed < 90 && guard++ < 1000) {
    const line = randInt(0, N);
    const c = (line - N / 2) * CELL;
    const along = rand(-HALF + 6, HALF - 6);
    const vertical = Math.random() < 0.5;
    const off = rand(-2.3, 2.3);
    const x = vertical ? c + off : along, z = vertical ? along : c + off;
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 16) continue;
    if (shafts.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    if (colliders.some((cc) => cc.top > 0.5 && x > cc.minX - 2 && x < cc.maxX + 2 && z > cc.minZ - 2 && z < cc.maxZ + 2)) continue;
    const t = Math.random();
    if (t < 0.3) jersey(x, z, vertical);
    else if (t < 0.55) sandbagWall(x, z, vertical);
    else if (t < 0.7) burntCar(scene, x, z, vertical);
    else if (t < 0.8) technical(scene, x, z, vertical);
    else if (t < 0.9) concreteBlock(x, z);
    else {
      rubblePile(x, z, rand(1.5, 2.2), 0);
    }
    placed++;
  }
  for (let i = 0; i < 40; i++) {
    const x = rand(-HALF, HALF), z = rand(-HALF, HALF);
    if (colliders.some((cc) => cc.top > 0.3 && x > cc.minX - 0.5 && x < cc.maxX + 0.5 && z > cc.minZ - 0.5 && z < cc.maxZ + 0.5)) continue;
    if (Math.random() < 0.5) for (let k = 0; k < randInt(1, 4); k++) B.tire.add(x, 0.11 + k * 0.2, z, 1, 1, 1, rand(0, 3));
    else for (let k = 0; k < randInt(3, 8); k++) { const s = rand(0.1, 0.35); B.rock.add(x + rand(-1, 1), s * 0.3, z + rand(-1, 1), s, s * 0.6, s, rand(0, 6), 0xd0c8b8, rand(0, 6)); }
  }
  for (let i = 0; i < 16; i++) {
    const line = randInt(0, N);
    const c = (line - N / 2) * CELL + (Math.random() < 0.5 ? -3.7 : 3.7);
    const along = rand(-HALF + 8, HALF - 8);
    const px = Math.random() < 0.5 ? c : along, pz = px === c ? along : c;
    if (Math.hypot(px - spawn.x, pz - spawn.z) < 10) continue;
    palm(px, pz);
  }
  for (let i = 0; i < 4; i++) {
    const line = randInt(1, N - 1), c = (line - N / 2) * CELL + 3.9;
    if (Math.random() < 0.5) electricLine(scene, c, -HALF + 4, c, HALF - 4);
    else electricLine(scene, -HALF + 4, c, HALF - 4, c);
  }

  for (let u = -HALF; u < HALF; u += 1.5) {
    for (const [x, z, ry] of [[u, -HALF - 0.6, 0], [u, HALF + 0.6, 0], [-HALF - 0.6, u, Math.PI / 2], [HALF + 0.6, u, Math.PI / 2]]) {
      B.twall.add(x, 0, z, 1, 1, 1, (ry ? 0 : Math.PI / 2) + rand(-0.02, 0.02));
    }
  }
  addCollider(-HALF - 3, HALF + 3, -HALF - 3, -HALF, 0, 6, 'concrete');
  addCollider(-HALF - 3, HALF + 3, HALF, HALF + 3, 0, 6, 'concrete');
  addCollider(-HALF - 3, -HALF, -HALF - 3, HALF + 3, 0, 6, 'concrete');
  addCollider(HALF, HALF + 3, -HALF - 3, HALF + 3, 0, 6, 'concrete');

  for (let i = 0; i < 170; i++) {
    const a = rand(0, Math.PI * 2), dist = rand(135, 260);
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    const w = rand(10, 22), d = rand(10, 22), fl = randInt(2, 8);
    pick(B.far).add(x, 0, z, w, fl * 3, d, Math.round(rand(0, 3)) * Math.PI / 2);
  }

  merkava(scene, -9, 107);
  shekem(scene, -3.4, 101.2);
  sandbagWall(4, 99.5, false, 3.2);
  sandbagWall(-1, 98.8, false, 2.6);

  addSmokePlume(new THREE.Vector3(-170, 0, -40), 2.2);
  addSmokePlume(new THREE.Vector3(150, 0, -150), 2.8);
  addSmokePlume(new THREE.Vector3(40, 0, -230), 3.2);
  addSmokePlume(new THREE.Vector3(-120, 0, -200), 2.0);
  let fires = 0;
  for (const c of colliders) {
    if (fires >= 2) break;
    if (c.top > 8 && Math.random() < 0.08 && Math.hypot((c.minX + c.maxX) / 2 - spawn.x, (c.minZ + c.maxZ) / 2 - spawn.z) > 40) {
      addSmokePlume(new THREE.Vector3((c.minX + c.maxX) / 2, c.top, (c.minZ + c.maxZ) / 2), 0.9, true);
      fires++;
    }
  }

  for (const k of Object.keys(B)) {
    const v = B[k];
    if (Array.isArray(v)) v.forEach((b) => b.build(scene)); else v.build(scene);
  }
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
const UP = new THREE.Vector3(0, 1, 0);
export function raycastWorld(o, d, maxT) {
  let best = maxT, nrm = null, surf = 'sand';
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t > 0 && t < best) { best = t; nrm = UP; }
  }
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c, best);
    if (t >= 0 && t < best) {
      best = t;
      nrm = new THREE.Vector3(hitAxis === 0 ? hitSign : 0, hitAxis === 1 ? hitSign : 0, hitAxis === 2 ? hitSign : 0);
      surf = c.surf;
    }
  }
  return nrm ? { t: best, normal: nrm, point: o.clone().addScaledVector(d, best), surf: nrm === UP ? 'sand' : surf } : null;
}
export function hasLOS(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.01) return true;
  const ix = dx / len, iy = dy / len, iz = dz / len;
  for (let i = 0; i < colliders.length; i++) {
    if (rayBox(a.x, a.y, a.z, ix, iy, iz, colliders[i], len - 0.2) >= 0) return false;
  }
  return true;
}
export function inSunlight(p, sunDir) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top < p.y) continue;
    if (rayBox(p.x, p.y, p.z, sunDir.x, sunDir.y, sunDir.z, c, 200) >= 0) return false;
  }
  return true;
}

// ============================================================
//  COLLISION
// ============================================================
export const STEP = 0.5;
export function resolveCollisions(pos, radius, feetY, height = 1.8) {
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
export function groundHeightAt(x, z, feetY, r = 0.3) {
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
const cellI = (x) => clamp(Math.floor((x + HALF) / GS), 0, GN - 1);
export function buildNav() {
  navBlocked.fill(0);
  for (const c of colliders) {
    if (c.top < 0.55 || c.bottom > 1.5) continue;
    const i0 = cellI(c.minX - 0.45), i1 = cellI(c.maxX + 0.45), j0 = cellI(c.minZ - 0.45), j1 = cellI(c.maxZ + 0.45);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) navBlocked[j * GN + i] = 1;
  }
}
export function updateFlow(px, pz) {
  flow.fill(-1);
  const s = cellI(pz) * GN + cellI(px);
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
export function flowDir(x, z, out) {
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
