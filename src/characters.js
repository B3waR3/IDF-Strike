import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assets } from './assets.js';
import { models, makeGun } from './models.js';
import { shareSkeletons } from './merge.js';
import { LAYER_HITBOX } from './gfx.js';
import { TEX } from './effects.js';
import { ccBones, retargetClips, solveIK, analyzeHand, orientHand, curlFingers } from './rig.js';
import { makeGrenadeMesh } from './grenade.js';
import { NADE_TIMING, STAB_TIMING } from './viewmodels.js';
import { MED_TIMING, BAND_R, makeBandage, newFrame, forearmFrame, wrapPhase, aroundArm, placeBandage, hideBandage } from './bandage.js';

// Per-faction tints multiplied over the militant model's camo textures (material name -> colour).
const LOOKS = {
  hamas: { balaclava: 0x3a3a38, jacket: 0xffffff, pants: 0xffffff, vest: 0xffffff },
  pij: { balaclava: 0x262626, jacket: 0x303030, pants: 0x303030, vest: 0x3c3c3c, gloves: 0x505050 },
  rpg: { balaclava: 0x4a4a42, jacket: 0xb8b090, pants: 0xb8b090, vest: 0x9a9480 },
  sniper: { balaclava: 0xd8c8a8, jacket: 0xf0dcb0, pants: 0xe6d2a8, vest: 0xd8c49c },
};
const GUN_FOR = { ak: 'akm', rpg: 'rpg', sniper: 'm24' };

// Faction headbands. Qassam Brigades: green with the white Shahada and a yellow unit name;
// al-Quds Brigades (PIJ): black with the unit name in yellow.
const SHAHADA = 'لا إله إلا الله محمد رسول الله';
const BANDS = {
  qassam: { base: '#1d6b34', edge: '#124a22', main: SHAHADA, mainColor: '#f4f1e6', side: 'كتائب القسام', sideColor: '#f2c230' },
  quds: { base: '#141414', edge: '#050505', main: 'سرايا القدس', mainColor: '#f2c21b', side: SHAHADA, sideColor: '#e8e2cf' },
};
const BAND_FOR = { hamas: 'qassam', rpg: 'qassam', sniper: 'qassam', pij: 'quds' };
const ARABIC_FONT = "'Traditional Arabic', 'Arabic Typesetting', 'Simplified Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";
const bandMats = {};

// Texture wraps once around the head; u = 0.5 is the forehead.
function bandMaterial(id) {
  if (bandMats[id]) return bandMats[id];
  const B = BANDS[id];
  const W = 2048, H = 144;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = B.base;
  x.fillRect(0, 0, W, H);
  // Woven cotton: faint horizontal threads and blotchy wear.
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
    x.fillRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 90, 1 + Math.random() * 2);
  }
  x.fillStyle = B.edge;
  x.fillRect(0, 0, W, 9); x.fillRect(0, H - 9, W, 9);
  x.strokeStyle = 'rgba(255,255,255,0.12)';
  x.setLineDash([10, 8]);
  x.lineWidth = 2;
  for (const y of [14, H - 14]) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  x.setLineDash([]);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
  const text = (s, cx, maxW, px, color) => {
    x.font = `bold ${px}px ${ARABIC_FONT}`;
    const k = Math.min(1, maxW / x.measureText(s).width);
    x.save();
    x.translate(cx, H / 2 + 4);
    x.scale(k, 1);
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 3;
    x.fillStyle = color;
    x.fillText(s, 0, 0);
    x.restore();
  };
  text(B.main, W * 0.5, W * 0.36, 104, B.mainColor);
  text(B.side, W * 0.2, W * 0.16, 76, B.sideColor);
  text(B.side, W * 0.8, W * 0.16, 76, B.sideColor);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const band = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const tail = new THREE.MeshStandardMaterial({ color: B.base, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  return (bandMats[id] = { band, tail });
}

// Tapered elliptical ring hugging the forehead, knotted at the back with two loose tails.
function makeHeadband(id) {
  const M = bandMaterial(id);
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 1, 0.042, 64, 1, true, -Math.PI, Math.PI * 2), M.band);
  ring.scale.set(0.089, 1, 0.109);
  g.add(ring);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), M.tail);
  knot.scale.set(1.3, 1, 0.7);
  knot.position.set(0, -0.004, -0.112);
  g.add(knot);
  const tails = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.008, -0.006, -0.116);
    const geo = new THREE.PlaneGeometry(0.034, 0.17, 1, 6).translate(0, -0.085, 0);
    // Taper the free end slightly.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - 0.35 * (-p.getY(i) / 0.17)));
    const t = new THREE.Mesh(geo, M.tail);
    t.rotation.y = s * 0.35;
    pivot.rotation.set(0.25, 0, s * 0.22);
    pivot.add(t);
    g.add(pivot);
    tails.push({ pivot, s, base: pivot.rotation.clone() });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return { group: g, tails };
}

// Where the pistol grip sits relative to the character root (character faces +Z, its right hand is -X).
const HOLD = {
  ak: { pos: [-0.14, 1.3, 0.2], rot: 0.1 },
  rpg: { pos: [-0.12, 1.47, 0.12], rot: 0.03 },
  sniper: { pos: [-0.14, 1.3, 0.24], rot: 0.08 },
};

const clipCache = {};
const clipsFor = (name) => (clipCache[name] ||= retargetClips(
  assets.soldier.scene, assets.soldier.animations.filter((c) => /Idle|Walk|Run/.test(c.name)), models[name].scene,
));
const lookMats = {};
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function materialsFor(kind) {
  if (lookMats[kind]) return lookMats[kind];
  const L = LOOKS[kind], cache = new Map();
  lookMats[kind] = (m) => {
    if (cache.has(m)) return cache.get(m);
    const key = Object.keys(L).find((k) => m.name.toLowerCase().startsWith(k));
    let out = m;
    if (key) {
      out = m.clone();
      out.color.multiply(new THREE.Color(L[key]));
    }
    if (out.isMeshStandardMaterial && !/eye|cornea|brow|lash|occlusion/i.test(m.name)) out.envMapIntensity = 0.7;
    cache.set(m, out);
    return out;
  };
  return lookMats[kind];
}

const W3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// How far the shoe mesh hangs below the foot bone, so planting the bone still puts the sole on the ground.
function measureSole(model, foot) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const drop = foot.getWorldPosition(W3()).y - box.min.y;
  return Math.max(0.02, drop);
}
// Drops `model` until the lowest sample (bone, plus how far its surface extends below it) meets `groundY`.
const _plant = W3(), _skinP = W3(), _skinA = W3(), _skinT = W3();
const _skinM = new THREE.Matrix4(), _box = new THREE.Box3();
// Lowest rendered point of a posed character. Bone centers sit inside the mesh, so a bone-radius
// solve leaves the body hanging; this samples the skinned surface.
function meshMinY(root) {
  root.updateMatrixWorld(true);
  let min = Infinity;
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    if (mesh.isSkinnedMesh && mesh.skeleton && mesh.geometry.attributes.skinIndex && mesh.geometry.attributes.skinWeight) {
      const pos = mesh.geometry.attributes.position;
      const si = mesh.geometry.attributes.skinIndex;
      const sw = mesh.geometry.attributes.skinWeight;
      mesh.skeleton.update();
      const bones = mesh.skeleton.boneMatrices;
      const step = Math.max(1, Math.floor(pos.count / 240));
      for (let i = 0; i < pos.count; i += step) {
        _skinP.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
        _skinA.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(k);
          if (!w) continue;
          _skinM.fromArray(bones, si.getComponent(k) * 16);
          _skinA.addScaledVector(_skinT.copy(_skinP).applyMatrix4(_skinM), w);
        }
        _skinA.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
        if (_skinA.y < min) min = _skinA.y;
      }
    } else if (!mesh.isSkinnedMesh) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      if (_box.min.y < min) min = _box.min.y;
    }
  });
  return min;
}
// Callers update the character's world matrices first.
function plant(model, samples, groundY) {
  let low = Infinity;
  for (const [b, drop] of samples) {
    if (!b) continue;
    low = Math.min(low, _plant.setFromMatrixPosition(b.matrixWorld).y - drop);
  }
  if (Number.isFinite(low)) model.position.y += groundY - low;
  return model.position.y;
}

// Rotates a bone about a world-space axis on top of its current (animated) pose.
const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _tq3 = new THREE.Quaternion();
function turn(bone, axisW, a) {
  if (!bone || !a) return;
  bone.getWorldQuaternion(_tq);
  _tq.premultiply(_tq2.setFromAxisAngle(axisW, a));
  bone.parent.getWorldQuaternion(_tq3).invert();
  bone.quaternion.copy(_tq3.multiply(_tq));
  bone.updateMatrixWorld(true);
}

// AnimationMixer only writes a bone when its sampled value changes, so procedural offsets would
// accumulate across frames. Restore the last pure animated pose before the mixer runs each frame.
function poseCache(model) {
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  const q = new Float32Array(bones.length * 4), p = new Float32Array(bones.length * 3);
  return {
    save() { bones.forEach((b, i) => { b.quaternion.toArray(q, i * 4); b.position.toArray(p, i * 3); }); },
    restore() { bones.forEach((b, i) => { b.quaternion.fromArray(q, i * 4); b.position.fromArray(p, i * 3); }); },
  };
}

// Idle/walk/run blend driven by ground speed. `dir` < 0 plays the gait backwards.
function locomotion(model, clips) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = { idle: mixer.clipAction(clips.Idle), walk: mixer.clipAction(clips.Walk), run: mixer.clipAction(clips.Run) };
  const weights = { idle: 1, walk: 0, run: 0 };
  for (const [k, a] of Object.entries(actions)) { a.play(); a.setEffectiveWeight(weights[k]); }
  mixer.update(Math.random() * 2);
  return {
    mixer,
    update(dt, speed, dir = 1) {
      const tw = speed < 0.3 ? { idle: 1, walk: 0, run: 0 } : speed < 2.6 ? { idle: 0, walk: 1, run: 0 } : { idle: 0, walk: 0, run: 1 };
      for (const k of Object.keys(actions)) {
        weights[k] += (tw[k] - weights[k]) * Math.min(1, dt * 6);
        actions[k].setEffectiveWeight(weights[k]);
      }
      actions.walk.timeScale = Math.max(0.6, speed / 1.5) * dir;
      actions.run.timeScale = Math.max(0.7, speed / 4.2) * dir;
      mixer.update(dt);
    },
  };
}

// Procedural death: a hit reaction, knees buckling, a gravity-accelerated fall with limp arms, and a
// small bounce on impact. A contact solve keeps the lowest body part on the ground throughout.
function createDeath(model, B) {
  const X = W3(), Y = W3(), Z = W3(), q = new THREE.Quaternion();
  let t = -1, o = null;
  return {
    get active() { return t >= 0; },
    start(opts) {
      t = 0;
      // dir: +1 falls forward (shot from behind), -1 backwards.
      o = { dir: 1, roll: 0, yaw: 0, speed: 1, blast: 0, ...opts };
    },
    stop() { t = -1; model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); },
    // Call after the mixer has written the frozen pose for this frame.
    apply(dt, groundY) {
      t += dt;
      const T = t * o.speed, d = o.dir, back = d < 0;
      const f = clamp01((T - (o.blast ? 0.02 : 0.12)) / (o.blast ? 0.4 : 0.55));
      const land = o.blast ? 0.4 : 0.7;
      const bounce = T > land ? Math.exp(-(T - land) * 8) * Math.sin((T - land) * 20) * 0.04 : 0;
      model.rotation.order = 'YXZ';
      // Tip onto the ground. The mesh plant below keeps the lowest point on the floor the whole way down.
      model.rotation.set(d * (Math.PI / 2) * smooth(f) - bounce, o.yaw * smooth(f), o.roll * f * f);
      model.position.set(0, 0, d * (0.22 + o.blast * 1.2) * smooth(f));
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(q);
      X.set(1, 0, 0).applyQuaternion(q); Y.set(0, 1, 0).applyQuaternion(q); Z.set(0, 0, 1).applyQuaternion(q);

      // Legs: buckle at the knees, then go slack and lie flat once the body is down.
      const kneel = smooth(T / 0.4), rest = smooth((T - land + 0.1) / 0.45);
      for (const [s, k] of [['Left', 1], ['Right', 0.8]]) {
        const thigh = back ? -0.55 : -1.05, calf = back ? 0.9 : 1.75;
        const thighR = back ? -0.3 * k : 0.1, calfR = back ? 0.45 * k : 0.55 * k;
        turn(B[s + 'UpLeg'], X, thigh * kneel + (thighR - thigh) * rest);
        turn(B[s + 'Leg'], X, calf * kneel + (calfR - calf) * rest);
      }
      // Torso: jolt from the impact, then settle with a slight twist.
      const jolt = smooth(T / 0.1) * (1 - 0.6 * smooth((T - 0.2) / 0.5));
      turn(B.Spine1, X, d * 0.35 * jolt);
      turn(B.Spine2, Z, o.roll * 0.8 * smooth((T - land + 0.2) / 0.5));
      // Arms: flung out by inertia, then fall limp beside the body.
      const fling = smooth((T - 0.05) / 0.4), lay = smooth((T - land) / 0.4);
      turn(B.LeftArm, Z, 0.5 + 0.7 * fling - 0.4 * lay);
      turn(B.RightArm, Z, -0.5 - 0.7 * fling + 0.4 * lay);
      turn(B.LeftArm, X, (back ? 0.6 : -0.9) * fling * (1 - lay));
      turn(B.RightArm, X, (back ? 0.4 : -0.7) * fling * (1 - lay));
      turn(B.LeftForeArm, Y, 0.5 * fling);
      turn(B.RightForeArm, Y, -0.5 * fling);
      // Head snaps with the hit and rolls to one side when lying.
      turn(B.Head, X, d * 0.45 * smooth(T / 0.15) * (1 - 0.5 * lay));
      turn(B.Head, Y, (o.roll >= 0 ? 1 : -1) * 0.9 * lay);

      const low = meshMinY(model);
      if (Number.isFinite(low)) {
        const dy = groundY + 0.01 - low;
        if (Math.abs(dy) < 3) model.position.y += dy;
      }
    },
  };
}

// The weapon slips from the hands on death and tumbles to the ground, coming to rest on its side.
function dropper(gunPivot) {
  const vel = W3(), spin = W3();
  let on = false, side = 1, groundY = 0;
  return {
    start(root, forward, gY) {
      root.parent.attach(gunPivot);
      on = true;
      groundY = gY;
      side = Math.random() < 0.5 ? -1 : 1;
      vel.copy(forward).multiplyScalar(0.8 + Math.random()).setY(0.6);
      spin.set(-2 - Math.random() * 3, (Math.random() - 0.5) * 3, side * (2 + Math.random() * 2));
    },
    update(dt) {
      if (!on) return;
      vel.y -= 9.8 * dt;
      gunPivot.position.addScaledVector(vel, dt);
      const floor = groundY + 0.04;
      if (gunPivot.position.y <= floor) {
        gunPivot.position.y = floor;
        vel.multiplyScalar(0.35); vel.y = Math.abs(vel.y) * 0.2;
        spin.multiplyScalar(0.3);
        const k = Math.min(1, dt * 10);
        gunPivot.rotation.x += (0 - gunPivot.rotation.x) * k;
        gunPivot.rotation.z += (side * Math.PI / 2 - gunPivot.rotation.z) * k;
      } else {
        gunPivot.rotation.x += spin.x * dt; gunPivot.rotation.y += spin.y * dt; gunPivot.rotation.z += spin.z * dt;
      }
    },
    reset(root) { if (on) { root.add(gunPivot); on = false; } },
    dispose() { if (on) gunPivot.removeFromParent(); },
  };
}

export function createCharacter(kind, gunKind) {
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(models.militant.scene);
  shareSkeletons(model);
  root.add(model);
  const remap = materialsFor(kind);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = remap(o.material);
    const small = /Eye|Cornea|Teeth|Tongue|Brow|Lash|Occlusion/i.test(o.material.name);
    o.castShadow = !small;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });
  const B = ccBones(model);
  model.updateMatrixWorld(true);

  // Hitboxes are parented to bones but aligned with the character's rest (T-pose) frame.
  const hit = [];
  const alignToRest = (bone, obj, worldPos) => {
    bone.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const ws = bone.getWorldScale(W3());
    obj.position.copy(worldPos).applyMatrix4(inv);
    obj.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    obj.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    bone.add(obj);
  };
  const addHit = (bone, geo, worldOffset, part) => {
    const m = new THREE.Mesh(geo, hitMat);
    alignToRest(bone, m, bone.getWorldPosition(W3()).add(worldOffset));
    m.userData.part = part;
    m.layers.set(LAYER_HITBOX);
    hit.push(m);
  };
  const limb = (a, b, thick, part) => {
    const pa = a.getWorldPosition(W3()), pb = b.getWorldPosition(W3());
    const len = pa.distanceTo(pb);
    const d = pb.clone().sub(pa).normalize();
    const g = new THREE.BoxGeometry(thick, len, thick);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(W3(0, 1, 0), d));
    addHit(a, g, pb.sub(pa).multiplyScalar(0.5), part);
  };
  addHit(B.Head, new THREE.SphereGeometry(0.12, 8, 6), W3(0, 0.08, 0.02), 'head');
  addHit(B.Spine1, new THREE.BoxGeometry(0.44, 0.5, 0.3), W3(0, 0.15, 0), 'body');
  addHit(B.Hips, new THREE.BoxGeometry(0.38, 0.25, 0.28), W3(0, 0, 0), 'body');
  limb(B.LeftUpLeg, B.LeftLeg, 0.17, 'legs');
  limb(B.RightUpLeg, B.RightLeg, 0.17, 'legs');
  limb(B.LeftLeg, B.LeftFoot, 0.14, 'legs');
  limb(B.RightLeg, B.RightFoot, 0.14, 'legs');
  limb(B.LeftArm, B.LeftForeArm, 0.11, 'body');
  limb(B.RightArm, B.RightForeArm, 0.11, 'body');
  limb(B.LeftForeArm, B.LeftHand, 0.09, 'body');
  limb(B.RightForeArm, B.RightHand, 0.09, 'body');

  const band = makeHeadband(BAND_FOR[kind] || 'qassam');
  {
    const g = band.group;
    alignToRest(B.Head, g, B.Head.getWorldPosition(W3()).add(W3(0, 0.105, 0.006)));
    g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(W3(1, 0, 0), -0.22));
  }
  let flutter = Math.random() * 10;

  const HR = analyzeHand(B, 'R'), HL = analyzeHand(B, 'L');
  curlFingers(HR, 1.1, 0.6);
  curlFingers(HL, 1.0, 0.5);
  const sole = measureSole(model, B.LeftFoot);
  const death = createDeath(model, B);

  const gun = makeGun(GUN_FOR[gunKind] || 'akm');
  const hold = HOLD[gunKind] || HOLD.ak;
  const gunPivot = new THREE.Group();
  gunPivot.position.set(...hold.pos);
  gunPivot.rotation.order = 'YXZ';
  const gunFrame = new THREE.Group();
  gunFrame.rotation.y = Math.PI;
  gunFrame.add(gun.root);
  gun.root.position.copy(gun.grip).negate();
  gunPivot.add(gunFrame);
  root.add(gunPivot);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(gun.muzzle);
  gun.root.add(muzzle);
  const drop = dropper(gunPivot);

  const loco = locomotion(model, clipsFor('militant'));
  const pose = poseCache(model);
  pose.save();

  const gripW = W3(), foreW = W3(), poleR = W3(), poleL = W3();
  const fwdW = W3(), upW = W3(), rightW = W3(), tmp = W3();
  const gq = new THREE.Quaternion();
  let aim = 0;

  return {
    root, hit, muzzle, gunPivot,
    update(dt, speed, aimPitch, engaged) {
      pose.restore();
      if (death.active) {
        death.apply(dt, root.position.y);
        drop.update(dt);
        return;
      }
      loco.update(dt, speed);
      pose.save();
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      // The retargeted clips leave the soles a little high; drop the rig so a foot stays on the ground.
      plant(model, [[B.LeftFoot, sole], [B.RightFoot, sole]], root.position.y);
      gunPivot.position.y = hold.pos[1] + model.position.y;
      flutter += dt * (3 + speed * 1.5);
      for (const t of band.tails) {
        t.pivot.rotation.x = t.base.x + Math.min(1, speed / 4) * 0.7 + Math.sin(flutter + t.s) * (0.05 + speed * 0.04);
        t.pivot.rotation.z = t.base.z + Math.sin(flutter * 1.3 + t.s * 2) * 0.06;
      }

      aim += ((engaged ? aimPitch : -0.45) - aim) * Math.min(1, dt * 7);
      gunPivot.rotation.set(-aim, hold.rot, 0);
      root.updateMatrixWorld(true);
      gun.root.localToWorld(gripW.copy(gun.grip));
      gun.root.localToWorld(foreW.copy(gun.fore));
      root.localToWorld(poleR.set(-0.7, 0.8, -0.2));
      root.localToWorld(poleL.set(0.6, 0.8, 0.1));
      solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
      solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, foreW, poleL);
      gun.root.getWorldQuaternion(gq);
      fwdW.set(0, 0, -1).applyQuaternion(gq);
      upW.set(0, 1, 0).applyQuaternion(gq);
      rightW.set(1, 0, 0).applyQuaternion(gq);
      orientHand(HR, tmp.copy(fwdW).addScaledVector(upW, -0.35), rightW.clone().negate());
      orientHand(HL, tmp.copy(fwdW).addScaledVector(rightW, 0.7), upW);
    },
    // opts: { dir: +1 forward / -1 backward, roll, headshot, blast }
    die(opts = {}) {
      const headshot = !!opts.headshot, blast = opts.blast ? 1 : 0;
      death.start({
        dir: opts.dir ?? 1, roll: opts.roll ?? 0, yaw: (Math.random() - 0.5) * 0.8,
        speed: headshot ? 1.35 : blast ? 1.1 : 0.9 + Math.random() * 0.2, blast,
      });
      root.updateMatrixWorld(true);
      drop.start(root, W3(0, 0, 1).applyQuaternion(root.quaternion).multiplyScalar(opts.dir ?? 1), root.position.y);
    },
    dispose() {
      drop.dispose();
    },
  };
}

// ============================================================ player body (third person)
// Normalised gun used for each player weapon id, and the viewmodel's pistol flag.
const PLAYER_GUN = { tavor: 'tavor', m4: 'm4', negev: 'm240', m24: 'm24', sniper: 'sniper', g28: 'g28', glock: 'glock', jericho: 'jericho', karambit: 'karambit' };
const PISTOLS = new Set(['glock', 'jericho']);
const KNIVES = new Set(['karambit']);

let flashMat = null;
function bodyFlash() {
  if (!flashMat) flashMat = new THREE.SpriteMaterial({ map: TEX.flash, color: 0xffd8a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(flashMat);
  s.scale.set(0.35, 0.35, 1);
  s.visible = false;
  return s;
}

// The IDF operator as seen in third person: same locomotion and death as the enemies, plus aiming,
// crouching, reloading and weapon swaps driven by the player state each frame.
export function createPlayerBody() {
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(models.operator.scene);
  shareSkeletons(model);
  root.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !/Eye|Glus/i.test(o.material.name);
    o.receiveShadow = true;
    o.frustumCulled = false;
  });
  const B = ccBones(model);
  model.updateMatrixWorld(true);
  const legRest = {};
  for (const n of ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) {
    if (B[n]) legRest[n] = B[n].quaternion.clone();
  }
  const HR = analyzeHand(B, 'R'), HL = analyzeHand(B, 'L');
  const death = createDeath(model, B);
  const loco = locomotion(model, clipsFor('operator'));
  const pose = poseCache(model);
  pose.save();
  const shoulderR = B.RightArm.getWorldPosition(W3());
  const footR = B.LeftFoot.getWorldPosition(W3()).y;
  const sole = measureSole(model, B.LeftFoot);
  // Stock sits outside the right shoulder, not in the chest. +X would pull the gun through the ribs.
  const POCKET = W3(Math.min(shoulderR.x, -0.16) - 0.08, shoulderR.y - 0.2, Math.max(shoulderR.z, 0.05) + 0.16);
  const PISTOL_AT = W3(-0.05, shoulderR.y + 0.0, 0.44);
  const POUCH = W3(0.1, footR + 0.9, 0.16);

  const gunPivot = new THREE.Group();
  gunPivot.rotation.order = 'YXZ';
  const gunFrame = new THREE.Group();
  gunFrame.rotation.y = Math.PI;
  gunPivot.add(gunFrame);
  root.add(gunPivot);
  const drop = dropper(gunPivot);
  const flash = bodyFlash();

  const cache = {};
  let cur = null;
  function setWeapon(id) {
    if (!id) {
      if (cur?.gun) gunFrame.remove(cur.gun.root);
      cur = { id: '', unarmed: true, pistol: false, knife: false };
      gunFrame.visible = false;
      return;
    }
    if (cur && cur.id === id) return;
    if (cur?.gun) gunFrame.remove(cur.gun.root);
    if (!cache[id]) {
      const gun = makeGun(PLAYER_GUN[id]);
      gun.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const pistol = PISTOLS.has(id);
      const knife = KNIVES.has(id);
      const anchor = pistol || knife ? gun.grip.clone() : W3(0, 0, gun.size.z / 2 - 0.02);
      gun.root.position.copy(anchor).negate();
      gun.root.updateMatrixWorld(true);
      const magC = W3(), magBase = gun.mag.position.clone();
      if (gun.mag.children.length) {
        const mb = new THREE.Box3().setFromObject(gun.mag);
        const inv = new THREE.Matrix4().copy(gun.root.matrixWorld).invert();
        mb.applyMatrix4(inv);
        magC.copy(mb.getCenter(W3()));
      }
      cache[id] = { id, gun, pistol, knife, magC, magBase };
    }
    cur = cache[id];
    gunFrame.add(cur.gun.root);
    cur.gun.root.add(flash);
    flash.position.copy(cur.gun.muzzle);
  }

  const gripW = W3(), foreW = W3(), poleR = W3(), poleL = W3(), handW = W3(), a = W3(), b = W3();
  const fwdW = W3(), upW = W3(), rightW = W3(), tmp = W3(), X = W3(), Y = W3(), local = W3();
  const q = new THREE.Quaternion();
  let aim = 0, lower = 0, crouchK = 0, proneK = 0, crawlT = 0, flashT = 0;

  // Grenade throw in root space (faces +Z, right hand is -X): pin pull at the chest, cock back over
  // the shoulder, overhand release, follow-through. Timing matches the first-person animation.
  const nade = makeGrenadeMesh();
  nade.root.visible = false;
  root.add(nade.root);
  const K = (x, y, z) => W3(x, y, z);
  const R_LOW = K(-0.2, 1.0, 0.15), R_CHEST = K(-0.06, 1.28, 0.3), R_COCK = K(-0.32, 1.62, -0.12);
  const R_FWD = K(-0.14, 1.58, 0.55), R_FOLLOW = K(0.06, 1.02, 0.4);
  const L_LOW = K(0.2, 1.0, 0.15), L_PIN = K(-0.02, 1.33, 0.33), L_PULLED = K(0.22, 1.25, 0.35);
  const L_POINT = K(0.24, 1.45, 0.52), L_THROW = K(0.2, 1.05, 0.25);
  const path = (keys, t, outV) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const s = smooth((t - keys[i][0]) / Math.max(1e-4, keys[i + 1][0] - keys[i][0]));
    return outV.lerpVectors(keys[i][1], keys[i + 1][1], s);
  };
  function throwPose(n, dy) {
    const T = NADE_TIMING;
    let rk, lk, inHand = true;
    if (n.phase === 'pull') {
      rk = [[0, R_LOW], [0.18, R_CHEST], [T.pull, R_CHEST]];
      lk = [[0, L_LOW], [0.18, L_PIN], [0.26, L_PIN], [0.42, L_PULLED], [T.pull, L_PULLED]];
    } else if (n.phase === 'hold') {
      rk = [[0, R_CHEST], [T.cock, R_COCK]];
      lk = [[0, L_PULLED], [0.3, L_POINT]];
    } else {
      rk = [[0, n.cocked ? R_COCK : R_CHEST], [0.12, R_COCK], [0.26, R_FWD], [T.throw, R_FOLLOW]];
      lk = [[0, n.cocked ? L_POINT : L_PULLED], [0.18, L_POINT], [T.throw, L_THROW]];
      inHand = n.t < T.release;
    }
    path(rk, n.t, a).y += dy;
    path(lk, n.t, b).y += dy;
    root.updateMatrixWorld(true);
    root.localToWorld(gripW.copy(a));
    root.localToWorld(handW.copy(b));
    root.localToWorld(poleR.set(-0.8, 0.9 + dy, -0.3));
    root.localToWorld(poleL.set(0.8, 0.8 + dy, -0.1));
    solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
    solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, handW, poleL);
    curlFingers(HR, 1.2, 0.8);
    curlFingers(HL, n.phase === 'pull' ? 0.9 : 0.4, 0.6);
    nade.root.visible = inHand;
    nade.root.position.copy(a);
    nade.ring.visible = n.phase === 'pull' && n.t < 0.3;
    gunFrame.visible = false;
  }

  // IFAK: the same sequence as the first-person arms (bandage.js). `t` is seconds into it.
  const kit = makeBandage();
  kit.all.forEach((o) => { o.castShadow = true; root.add(o); });
  const arm = newFrame();
  const elbowW = W3(), wristW = W3(), toward = W3(), orbitW = W3(), rollW = W3(), fromW = W3();
  const packQ = new THREE.Quaternion(), packTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, 0));
  const M_L = [K(0.2, 1.0, 0.15), K(0.03, 1.3, 0.36), K(0.08, 1.33, 0.35), K(-0.06, 1.2, 0.42)];
  const M_R = [K(-0.2, 1.0, 0.15), K(-0.04, 1.26, 0.35), K(-0.11, 1.21, 0.33)];
  function medPose(t, dy) {
    const T = MED_TIMING;
    gunFrame.visible = false;
    path([[0, M_L[0]], [T.tear, M_L[1]], [T.rip, M_L[2]], [T.present, M_L[3]], [T.fasten + 0.05, M_L[3]], [T.dur, M_L[0]]], t, b).y += dy;
    root.updateMatrixWorld(true);
    root.localToWorld(handW.copy(b));
    root.localToWorld(poleL.set(0.9, 0.9 + dy, 0.1));
    solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, handW, poleL);
    curlFingers(HL, t < T.rip ? 1.0 : 0.35, 0.4);
    B.LeftForeArm.getWorldPosition(elbowW);
    B.LeftHand.getWorldPosition(wristW);
    root.localToWorld(toward.set(0, 1.35 + dy, 0)).sub(elbowW);
    forearmFrame(elbowW, wristW, toward, arm);

    // Right wrist target and the roll it carries, phase by phase.
    const { theta } = wrapPhase(t);
    const pathR = (i) => root.localToWorld(fromW.copy(M_R[i]).setY(M_R[i].y + dy));
    const around = (ang, r, out) => aroundArm(arm, ang, BAND_R + r, out);
    if (t < T.rip) {
      path([[0, M_R[0]], [T.tear, M_R[1]], [T.rip, M_R[2]]], t, a).y += dy;
      root.localToWorld(gripW.copy(a));
      rollW.lerpVectors(gripW, handW, 0.5);
    } else if (t < T.present) {
      const s = smooth((t - T.rip) / (T.present - T.rip));
      gripW.lerpVectors(pathR(2), around(0, 0.075, orbitW), s);
      rollW.lerpVectors(fromW, around(0, 0.024, orbitW), s);
    } else if (t < T.wrapEnd) {
      around(theta, 0.075, gripW);
      around(theta, 0.024, rollW);
    } else if (t < T.fasten) {
      const s = smooth((t - T.wrapEnd) / (T.fasten - T.wrapEnd));
      gripW.lerpVectors(around(theta, 0.075, orbitW), around(0, 0.075, fromW), s);
      rollW.lerpVectors(around(theta, 0.024, orbitW), around(0, 0.024, fromW), s);
    } else {
      gripW.lerpVectors(around(0, 0.075, orbitW), pathR(0), smooth((t - T.fasten) / (T.dur - T.fasten)));
      rollW.copy(gripW);
    }
    root.localToWorld(poleR.set(-0.8, 0.8 + dy, -0.2));
    solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
    if (t >= T.rip && t < T.fasten) {
      tmp.subVectors(gripW, arm.c).normalize();
      orientHand(HR, fwdW.crossVectors(arm.A, tmp), local.copy(tmp).negate());
    }
    curlFingers(HR, t >= T.fasten ? 0.5 : 1.1, 0.85);
    root.getWorldQuaternion(packQ).multiply(packTilt);
    placeBandage(kit, root, t, arm, rollW, packQ);
  }

  // Karambit in the right fist, claw forward. Left hand is a relaxed guard beside the chest.
  const K_READY = K(-0.28, 1.18, 0.32), K_COCK = K(-0.42, 1.46, -0.06), K_THRUST = K(-0.12, 1.16, 0.58);
  const K_OFF = K(0.3, 1.14, 0.18);
  function knifePose(st, dy) {
    const T = STAB_TIMING;
    const t = st.stab;
    if (t >= 0) path([[0, K_READY], [T.cock, K_COCK], [T.hit, K_THRUST], [0.32, K_THRUST], [T.dur, K_READY]], t, a);
    else a.copy(K_READY);
    a.y += dy;
    b.copy(K_OFF).y += dy;
    if (proneK > 0.01) { a.lerp(K(-0.2, 0.28, 0.52), proneK); b.lerp(K(0.18, 0.24, 0.36), proneK); }
    gunFrame.visible = true;
    gunPivot.position.copy(a);
    // The mesh's blade is local -Y. Pitch it forward so the claw leads, instead of hanging at the ground.
    gunPivot.rotation.set(0.85, 0.25, -0.35);
    if (st.inspect >= 0) {
      const s = Math.sin(Math.min(1, st.inspect) * Math.PI);
      gunPivot.rotation.y += 1.1 * s;
      gunPivot.rotation.x -= 0.4 * s;
      gunPivot.position.y += 0.12 * s;
    }
    root.updateMatrixWorld(true);
    const { gun } = cur;
    gun.root.getWorldQuaternion(q);
    fwdW.set(0, 0, -1).applyQuaternion(q);
    upW.set(0, 1, 0).applyQuaternion(q);
    rightW.set(1, 0, 0).applyQuaternion(q);
    gun.root.localToWorld(gripW.copy(gun.grip));
    root.localToWorld(handW.copy(b));
    // Elbows out to the sides and slightly forward, not folded into the back.
    root.localToWorld(poleR.set(-0.62, 1.12 + dy, 0.12));
    root.localToWorld(poleL.set(0.5, 1.08 + dy, 0.1));
    solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
    solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, handW, poleL);
    orientHand(HR, fwdW, tmp.copy(rightW).negate());
    root.getWorldQuaternion(q);
    a.set(0.05, -0.55, 0.8).applyQuaternion(q);
    b.set(-0.9, 0.15, 0.1).applyQuaternion(q);
    orientHand(HL, a, b);
    curlFingers(HR, 1.4, 0.9);
    curlFingers(HL, 0.62, 0.4);
  }

  function leftTarget(p, empty, out) {
    // Reload: hand to the magazine, old mag to the pouch, fresh mag in, slap, back to the handguard.
    const { gun, magC } = cur;
    const magW = gun.root.localToWorld(a.copy(magC).add(local.set(0, -0.06, 0)));
    const pouchW = root.localToWorld(b.copy(POUCH).setY(POUCH.y - crouchK * 0.35));
    const rest = cur.pistol ? gun.root.localToWorld(tmp.copy(gun.grip).add(local.set(-0.03, -0.01, 0))) : foreW;
    const keys = [[0, rest], [0.15, magW], [0.32, pouchW], [0.45, pouchW], [0.62, magW], [0.68, magW], [empty ? 0.86 : 0.8, rest], [1, rest]];
    let i = 0;
    while (i < keys.length - 2 && p >= keys[i + 1][0]) i++;
    const s = smooth((p - keys[i][0]) / Math.max(1e-4, keys[i + 1][0] - keys[i][0]));
    out.lerpVectors(keys[i][1], keys[i + 1][1], s);
    return p > 0.15 && p < 0.66;
  }

  return {
    root, setWeapon,
    get pistol() { return !!cur?.pistol; },
    muzzleWorld(out) { return cur.gun.root.localToWorld(out.copy(cur.gun.muzzle)); },
    ejectWorld(out) { return cur.gun.root.localToWorld(out.set(0.03, 0.04, cur.gun.eject)); },
    rightWorld(out) { return out.set(1, 0, 0).applyQuaternion(cur.gun.root.getWorldQuaternion(q)); },
    fire() { flashT = 0.05; flash.visible = true; flash.material.rotation = Math.random() * Math.PI; },
    die(opts = {}) {
      death.start({ dir: opts.dir ?? -1, roll: (Math.random() - 0.5) * 0.6, yaw: (Math.random() - 0.5) * 0.6, speed: 0.9, blast: opts.blast ? 1 : 0 });
      flash.visible = false;
      hideBandage(kit);
      root.updateMatrixWorld(true);
      drop.start(root, W3(0, 0, 1).applyQuaternion(root.quaternion), root.position.y);
    },
    revive() {
      death.stop();
      drop.reset(root);
      gunPivot.rotation.set(0, 0, 0);
    },
    // st: { speed, back, pitch, crouch, sprint, ads, reloadP, empty, kick, switchK }
    update(dt, st) {
      pose.restore();
      if (death.active) {
        death.apply(dt, root.position.y);
        drop.update(dt);
        return;
      }
      if (!cur) return;
      flashT -= dt;
      if (flashT <= 0) flash.visible = false;
      loco.update(dt, st.prone ? 0 : st.speed, st.back ? -1 : 1);
      pose.save();
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(q);
      X.set(1, 0, 0).applyQuaternion(q); Y.set(0, 1, 0).applyQuaternion(q);

      // Crouch folds the legs. Prone lays the rig on its stomach and crawls the knees.
      crouchK += ((st.crouch ? 1 : 0) - crouchK) * Math.min(1, dt * 8);
      proneK += ((st.prone ? 1 : 0) - proneK) * Math.min(1, dt * 5);
      if (crouchK > 0.01) {
        const k = crouchK * (1 - proneK);
        for (const s of ['Left', 'Right']) {
          turn(B[s + 'UpLeg'], X, -1.25 * k);
          turn(B[s + 'Leg'], X, 2.0 * k);
          turn(B[s + 'Foot'], X, -0.7 * k);
        }
        turn(B.Spine1, X, 0.25 * k);
      }
      if (proneK > 0.01) {
        crawlT += dt * (1.2 + st.speed * 2.2);
        const crawl = Math.sin(crawlT) * Math.min(1, st.speed / 1.2);
        // Drop the idle stance so both legs start straight, then lay the rig on its stomach.
        for (const n of Object.keys(legRest)) B[n].quaternion.slerp(legRest[n], proneK);
        model.rotation.x = 1.5 * proneK;
        model.rotation.z = crawl * 0.06 * proneK;
        model.position.z = -0.25 * proneK;
        model.updateMatrixWorld(true);
        model.getWorldQuaternion(q);
        X.set(1, 0, 0).applyQuaternion(q);
        for (const [s, sgn] of [['Left', 1], ['Right', -1]]) {
          turn(B[s + 'Leg'], X, (0.5 + sgn * crawl * 0.4) * proneK);
          turn(B[s + 'Foot'], X, -0.25 * proneK);
        }
        turn(B.Head, X, -1.25 * proneK);
        turn(B.Spine1, X, -0.45 * proneK);
      }
      root.updateMatrixWorld(true);
      const feet = [[B.LeftFoot, sole], [B.RightFoot, sole]];
      plant(model, proneK > 0.35 ? [...feet, [B.Hips, 0.1], [B.Spine2, 0.11], [B.Head, 0.13]] : feet, root.position.y);
      if (proneK > 0.8) model.position.y += 0.03;
      const drop_ = model.position.y;
      if (cur.unarmed) {
        gunFrame.visible = false;
        nade.root.visible = false;
        hideBandage(kit);
        // The idle clip hides the arms in the vest. Hang them at the sides so they read as arms.
        root.updateMatrixWorld(true);
        root.localToWorld(gripW.set(-0.32, 0.92 + drop_, 0.16));
        root.localToWorld(handW.set(0.32, 0.92 + drop_, 0.16));
        root.localToWorld(poleR.set(-0.62, 1.15 + drop_, 0.02));
        root.localToWorld(poleL.set(0.62, 1.15 + drop_, 0.02));
        solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
        solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, handW, poleL);
        root.getWorldQuaternion(q);
        orientHand(HR, tmp.set(0, -0.8, 0.35).applyQuaternion(q), a.set(-0.4, 0.2, 0.6).applyQuaternion(q));
        orientHand(HL, tmp.set(0, -0.8, 0.35).applyQuaternion(q), a.set(0.4, 0.2, 0.6).applyQuaternion(q));
        curlFingers(HR, 0.45, 0.3);
        curlFingers(HL, 0.45, 0.3);
        return;
      }

      // Upper body follows the aim; sprinting and weapon swaps lower the gun.
      lower += ((st.sprint || st.switchK > 0 ? 1 : 0) - lower) * Math.min(1, dt * 8);
      aim += (st.pitch - aim) * Math.min(1, dt * 20);
      const p = aim * (1 - lower) * (1 - proneK);
      turn(B.Spine1, X, -p * 0.25);
      turn(B.Spine2, X, -p * 0.25);
      turn(B.Spine2, Y, (cur.pistol ? -0.1 : -0.35 * (1 - lower)) * (1 - proneK));
      turn(B.Head, Y, cur.pistol ? 0.1 : 0.3 * (1 - lower));
      turn(B.Head, X, -p * 0.35 + (cur.pistol ? 0 : 0.18 * st.ads));

      const bandaging = st.ifak >= 0 && proneK < 0.5;
      gunFrame.visible = !st.nade && !st.knife && !bandaging;
      nade.root.visible = false;
      hideBandage(kit);
      if (st.nade) { throwPose(st.nade, drop_); return; }
      if (bandaging) { medPose(st.ifak, drop_); return; }
      if (st.knife) { knifePose(st, drop_); return; }

      // Gun pose: shouldered (rifles) or extended (pistols), tilted during reloads.
      const reloading = st.reloadP >= 0;
      const e = reloading ? smooth(st.reloadP / 0.12) * smooth((1 - st.reloadP) / 0.14) : 0;
      gunPivot.position.copy(cur.pistol ? PISTOL_AT : POCKET);
      gunPivot.position.y += drop_;
      if (proneK > 0.01) gunPivot.position.lerp(local.set(-0.16, 0.22, 0.62), proneK);
      gunPivot.position.z -= st.kick * 0.04;
      if (cur.pistol) gunPivot.position.z -= e * 0.12;
      gunPivot.rotation.set(-p + lower * 0.7 + e * 0.35, lower * 0.6 + e * (cur.pistol ? -0.2 : 0.25), e * (cur.pistol ? -0.4 : 0.55));
      root.updateMatrixWorld(true);

      const { gun } = cur;
      gun.root.localToWorld(gripW.copy(gun.grip));
      gun.root.localToWorld(foreW.copy(gun.fore));
      root.localToWorld(poleR.set(-0.58, 1.2 + drop_, 0.08));
      root.localToWorld(poleL.set(0.48, 1.05 + drop_, 0.2));
      let attached = false;
      if (reloading) attached = leftTarget(st.reloadP, st.empty, handW);
      else if (cur.pistol) gun.root.localToWorld(handW.copy(gun.grip).add(local.set(-0.03, -0.012, 0)));
      else handW.copy(foreW);
      solveIK(B.RightArm, B.RightForeArm, B.RightHand, gripW, poleR);
      solveIK(B.LeftArm, B.LeftForeArm, B.LeftHand, handW, poleL);
      gun.root.getWorldQuaternion(q);
      fwdW.set(0, 0, -1).applyQuaternion(q);
      upW.set(0, 1, 0).applyQuaternion(q);
      rightW.set(1, 0, 0).applyQuaternion(q);
      orientHand(HR, tmp.copy(fwdW).addScaledVector(upW, -0.35), a.copy(rightW).negate());
      if (cur.pistol && !reloading) orientHand(HL, tmp.copy(fwdW).multiplyScalar(0.7).addScaledVector(upW, -0.6).addScaledVector(rightW, 0.4), rightW);
      else orientHand(HL, fwdW, tmp.copy(upW).addScaledVector(rightW, -0.35));
      curlFingers(HR, 1.15, 0.5);
      curlFingers(HL, reloading ? 0.9 : 1.0, 0.5);

      gun.mag.position.copy(cur.magBase);
      if (attached) {
        gun.root.worldToLocal(local.copy(handW));
        gun.mag.position.add(local.sub(cur.magC));
      }
    },
  };
}
