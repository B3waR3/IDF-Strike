import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assets } from './assets.js';
import { LAYER_HITBOX } from './gfx.js';

const LOOKS = {
  hamas: { torso: 0x676b4a, legs: 0x55573f, head: 0x151515, band: 0x1f7a34, hands: 0x7a5a42, feet: 0x2a241c, vest: 0x4a4a36 },
  pij: { torso: 0x2c2c2c, legs: 0x262626, head: 0x0f0f0f, band: 0xb09010, hands: 0x7a5a42, feet: 0x1c1a18, vest: 0x222222 },
  rpg: { torso: 0x7a7458, legs: 0x55573f, head: 0x151515, band: 0x1f7a34, hands: 0x7a5a42, feet: 0x2a241c, vest: 0x4a4a36 },
  sniper: { torso: 0x8a7c5c, legs: 0x7a6c50, head: 0x4a4032, band: 0x1f7a34, hands: 0x7a5a42, feet: 0x3a3024, vest: 0x6a604a },
};
const kindGeo = {};
let regions = null;

// Classifies each vertex of the soldier mesh by its dominant bone so clothing can be recoloured per faction.
function computeRegions(mesh, headY) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
  const bones = mesh.skeleton.bones;
  const out = new Uint8Array(pos.count);
  const v = new THREE.Vector3(), wv = new THREE.Vector4(), iv = new THREE.Vector4();
  for (let i = 0; i < pos.count; i++) {
    wv.fromBufferAttribute(sw, i); iv.fromBufferAttribute(si, i);
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = wv.getComponent(k); if (w > bw) { bw = w; best = iv.getComponent(k); } }
    const n = bones[best].name.replace('mixamorig', '');
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    let r;
    if (/Head|Neck/.test(n)) r = v.y > headY + 0.075 && v.y < headY + 0.115 ? 4 : 0;
    else if (/Hand/.test(n)) r = 3;
    else if (/Foot|Toe/.test(n)) r = 5;
    else if (/Leg|Hips/.test(n)) r = 2;
    else r = 1;
    out[i] = r;
  }
  return out;
}
function geoFor(kind, mesh) {
  if (kindGeo[kind]) return kindGeo[kind];
  const L = LOOKS[kind];
  const pal = [L.head, L.torso, L.legs, L.hands, L.band, L.feet].map((c) => new THREE.Color(c));
  const g = mesh.geometry.clone();
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < regions.length; i++) {
    const c = pal[regions[i]];
    const n = 0.9 + Math.random() * 0.2;
    col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  kindGeo[kind] = g;
  return g;
}
function clothMaterial(src) {
  const m = src.clone();
  m.vertexColors = true;
  m.color.set(0xffffff);
  m.roughness = 0.93;
  m.metalness = 0;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * 1.7;`);
  };
  m.customProgramCacheKey = () => 'cloth';
  return m;
}

let facingFix = 0;
let clips = null;
let M = null;
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function prepare() {
  clips = {};
  for (const c of assets.soldier.animations) clips[c.name] = c;
  const sc = assets.soldier.scene;
  sc.updateMatrixWorld(true);
  const foot = new THREE.Vector3(), toe = new THREE.Vector3();
  sc.getObjectByName('mixamorigLeftFoot').getWorldPosition(foot);
  sc.getObjectByName('mixamorigLeftToeBase').getWorldPosition(toe);
  facingFix = toe.z < foot.z ? Math.PI : 0;
  const head = new THREE.Vector3();
  sc.getObjectByName('mixamorigHead').getWorldPosition(head);
  regions = computeRegions(sc.getObjectByName('vanguard_Mesh'), head.y);
  const fab = assets.tex.denim_fabric.normalMap;
  M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.45, metalness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6e3d1c, roughness: 0.55, metalness: 0 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, metalness: 0.05 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.75, metalness: 0.1 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x5c5444, roughness: 0.7, metalness: 0.1 }),
    fabric: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, normalMap: fab }),
  };
}

const rb = (w, h, d, r, m, x, y, z) => {
  const me = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  return me;
};
const cyl = (r, len, m, x, y, z, seg = 10) => {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  return me;
};
function bananaMag(m, depth = 0.028, curve = 1) {
  const s = new THREE.Shape();
  s.moveTo(0.0, 0); s.lineTo(0.075, 0);
  s.quadraticCurveTo(0.085, -0.13, 0.075 + 0.07 * curve, -0.24);
  s.lineTo(-0.005 + 0.06 * curve, -0.255);
  s.quadraticCurveTo(0.0, -0.13, 0.0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 })
    .translate(0, 0, -depth / 2).rotateY(-Math.PI / 2);
  const me = new THREE.Mesh(g, m);
  me.castShadow = true;
  return me;
}

// Kalashnikov (AKM / AK-47 / Type 56). Origin at the pistol grip, barrel along +Z.
function buildAK() {
  const g = new THREE.Group();
  g.add(rb(0.05, 0.085, 0.33, 0.01, M.steel, 0, 0.03, 0.08));
  g.add(rb(0.048, 0.03, 0.3, 0.014, M.steel, 0, 0.075, 0.06));
  const stock = rb(0.042, 0.11, 0.3, 0.012, M.wood, 0, 0.0, -0.22); stock.rotation.x = 0.12; g.add(stock);
  const grip = rb(0.032, 0.1, 0.045, 0.01, M.wood, 0, -0.06, -0.02); grip.rotation.x = 0.35; g.add(grip);
  const mag = bananaMag(M.steel); mag.position.set(0, -0.01, 0.1); g.add(mag);
  g.add(rb(0.056, 0.065, 0.2, 0.012, M.wood, 0, 0.025, 0.35));
  g.add(cyl(0.013, 0.2, M.steel, 0, 0.078, 0.36));
  g.add(cyl(0.011, 0.34, M.steel, 0, 0.035, 0.56));
  g.add(rb(0.012, 0.05, 0.015, 0.003, M.steel, 0, 0.07, 0.64));
  g.add(cyl(0.015, 0.05, M.steel, 0, 0.035, 0.74));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, 0.78); g.add(muzzle);
  return { g, muzzle, grip: new THREE.Vector3(0, -0.03, 0), fore: new THREE.Vector3(0, 0.0, 0.3), pos: new THREE.Vector3(-0.13, 1.3, 0.14), rot: 0.12 };
}
function buildRPG() {
  const g = new THREE.Group();
  g.add(cyl(0.042, 0.95, M.olive, 0, 0, 0.05, 14));
  g.add(cyl(0.05, 0.25, M.wood, 0, 0, 0.1, 12));
  g.add(cyl(0.06, 0.12, M.olive, 0, 0, -0.45, 12));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 12).rotateX(Math.PI / 2), M.olive); cone.position.z = 0.82; cone.castShadow = true; g.add(cone);
  g.add(cyl(0.075, 0.16, M.olive, 0, 0, 0.6, 12));
  g.add(rb(0.03, 0.1, 0.04, 0.008, M.wood, 0, -0.08, 0.08));
  g.add(rb(0.03, 0.09, 0.04, 0.008, M.wood, 0, -0.07, 0.32));
  g.add(rb(0.03, 0.05, 0.12, 0.01, M.steel, -0.05, 0.05, 0.12));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.95); g.add(muzzle);
  return { g, muzzle, grip: new THREE.Vector3(0, -0.1, 0.08), fore: new THREE.Vector3(0, -0.1, 0.32), pos: new THREE.Vector3(-0.14, 1.5, 0.02), rot: 0.05 };
}
function buildSniper() {
  const g = new THREE.Group();
  g.add(rb(0.05, 0.09, 0.4, 0.01, M.tan, 0, 0.02, 0.12));
  const stock = rb(0.045, 0.12, 0.32, 0.012, M.tan, 0, -0.01, -0.22); stock.rotation.x = 0.08; g.add(stock);
  const grip = rb(0.032, 0.1, 0.045, 0.01, M.polymer, 0, -0.06, -0.02); grip.rotation.x = 0.35; g.add(grip);
  g.add(cyl(0.013, 0.62, M.steel, 0, 0.04, 0.62));
  g.add(cyl(0.02, 0.32, M.polymer, 0, 0.12, 0.1));
  g.add(cyl(0.03, 0.08, M.polymer, 0, 0.12, 0.28));
  g.add(rb(0.03, 0.14, 0.05, 0.008, M.steel, 0, -0.08, 0.1));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.04, 0.95); g.add(muzzle);
  return { g, muzzle, grip: new THREE.Vector3(0, -0.03, 0), fore: new THREE.Vector3(0, 0.0, 0.3), pos: new THREE.Vector3(-0.13, 1.32, 0.12), rot: 0.1 };
}

// ------------------------------------------------------------ analytic two-bone IK
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _pv = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _elbow = new THREE.Vector3();
function rotateBoneToward(bone, childPos, desired) {
  bone.getWorldPosition(_a);
  _from.copy(childPos).sub(_a).normalize();
  _to.copy(desired).sub(_a).normalize();
  _dq.setFromUnitVectors(_from, _to);
  bone.getWorldQuaternion(_q1);
  _q1.premultiply(_dq);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}
function solveIK(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  _t.copy(target).sub(_a);
  const d = Math.min(Math.max(_t.length(), 0.05), (la + lb) * 0.999);
  const dir = _t.normalize();
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
  const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
  _pv.copy(pole).sub(_a);
  _pv.addScaledVector(dir, -_pv.dot(dir)).normalize();
  _elbow.copy(_a).addScaledVector(dir, Math.cos(ang) * la).addScaledVector(_pv, Math.sin(ang) * la);
  const aSave = _a.clone();
  rotateBoneToward(upper, _b, _elbow);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const tgt = aSave.addScaledVector(dir, d);
  rotateBoneToward(lower, _c, tgt);
}

// ------------------------------------------------------------ character factory
export function createCharacter(kind, gunKind) {
  if (!clips) prepare();
  const look = LOOKS[kind];
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.y = facingFix;
  root.add(pivot);
  const model = SkeletonUtils.clone(assets.soldier.scene);
  pivot.add(model);

  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
    if (o.isMesh) {
      if (o.name.toLowerCase().includes('visor')) { o.visible = false; return; }
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.isSkinnedMesh && o.name === 'vanguard_Mesh') o.geometry = geoFor(kind, o);
      o.material = clothMaterial(o.material);
    }
  });
  model.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  bones.Head.getWorldScale(ws);
  const inv = 1 / ws.x;

  const attach = (bone, obj, x, y, z) => {
    obj.scale.multiplyScalar(inv);
    obj.position.set(x * inv, y * inv, z * inv);
    bone.add(obj);
    return obj;
  };
  const rig = new THREE.Group();
  const vm = M.fabric(look.vest);
  rig.add(rb(0.36, 0.28, 0.08, 0.02, vm, 0, 0, 0));
  for (let i = -1; i <= 1; i++) rig.add(rb(0.085, 0.13, 0.055, 0.012, vm, i * 0.1, -0.04, 0.06));
  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  attach(bones.Spine2, rig, 0, 0.02, 0.12);

  const hit = [];
  const box = (bone, child, thick, part) => {
    const len = child.position.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick * inv, len, thick * inv), hitMat);
    m.position.copy(child.position).multiplyScalar(0.5);
    m.userData.part = part;
    m.layers.set(LAYER_HITBOX);
    bone.add(m);
    hit.push(m);
  };
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * inv, 8, 6), hitMat);
  head.position.set(0, 0.1 * inv, 0);
  head.userData.part = 'head';
  head.layers.set(LAYER_HITBOX);
  bones.Head.add(head);
  hit.push(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44 * inv, 0.55 * inv, 0.3 * inv), hitMat);
  torso.position.set(0, 0.18 * inv, 0);
  torso.userData.part = 'body';
  torso.layers.set(LAYER_HITBOX);
  bones.Spine1.add(torso);
  hit.push(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38 * inv, 0.25 * inv, 0.28 * inv), hitMat);
  hips.userData.part = 'body';
  hips.layers.set(LAYER_HITBOX);
  bones.Hips.add(hips);
  hit.push(hips);
  box(bones.LeftUpLeg, bones.LeftLeg, 0.17, 'legs');
  box(bones.RightUpLeg, bones.RightLeg, 0.17, 'legs');
  box(bones.LeftLeg, bones.LeftFoot, 0.14, 'legs');
  box(bones.RightLeg, bones.RightFoot, 0.14, 'legs');
  box(bones.LeftArm, bones.LeftForeArm, 0.11, 'body');
  box(bones.RightArm, bones.RightForeArm, 0.11, 'body');
  box(bones.LeftForeArm, bones.LeftHand, 0.09, 'body');
  box(bones.RightForeArm, bones.RightHand, 0.09, 'body');

  const gun = gunKind === 'rpg' ? buildRPG() : gunKind === 'sniper' ? buildSniper() : buildAK();
  const gunPivot = new THREE.Group();
  gunPivot.position.copy(gun.pos);
  gunPivot.rotation.order = 'YXZ';
  gunPivot.add(gun.g);
  root.add(gunPivot);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {
    idle: mixer.clipAction(clips.Idle),
    walk: mixer.clipAction(clips.Walk),
    run: mixer.clipAction(clips.Run),
  };
  const weights = { idle: 1, walk: 0, run: 0 };
  for (const [k, a] of Object.entries(actions)) { a.play(); a.setEffectiveWeight(weights[k]); }
  mixer.update(Math.random() * 2);

  const gripW = new THREE.Vector3(), foreW = new THREE.Vector3(), poleR = new THREE.Vector3(), poleL = new THREE.Vector3();
  let alive = true, aim = 0;

  return {
    root, hit, muzzle: gun.muzzle, gunPivot,
    update(dt, speed, aimPitch, engaged) {
      if (!alive) { mixer.update(0); return; }
      const tw = speed < 0.3 ? { idle: 1, walk: 0, run: 0 } : speed < 2.6 ? { idle: 0, walk: 1, run: 0 } : { idle: 0, walk: 0, run: 1 };
      for (const k of Object.keys(actions)) {
        weights[k] += (tw[k] - weights[k]) * Math.min(1, dt * 6);
        actions[k].setEffectiveWeight(weights[k]);
      }
      actions.walk.timeScale = Math.max(0.6, speed / 1.5);
      actions.run.timeScale = Math.max(0.7, speed / 4.2);
      mixer.update(dt);

      aim += ((engaged ? aimPitch : -0.45) - aim) * Math.min(1, dt * 7);
      gunPivot.rotation.set(-aim, gun.rot, 0);
      root.updateMatrixWorld(true);
      gun.g.localToWorld(gripW.copy(gun.grip));
      gun.g.localToWorld(foreW.copy(gun.fore));
      root.localToWorld(poleR.set(-0.7, 0.8, -0.2));
      root.localToWorld(poleL.set(0.6, 0.8, 0.1));
      solveIK(bones.RightArm, bones.RightForeArm, bones.RightHand, gripW, poleR);
      solveIK(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, foreW, poleL);
    },
    die() {
      alive = false;
      mixer.timeScale = 0;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}
