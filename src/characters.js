import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assets } from './assets.js';
import { models, makeGun } from './models.js';
import { LAYER_HITBOX } from './gfx.js';
import { ccBones, retargetClips, solveIK, analyzeHand, orientHand, curlFingers } from './rig.js';

// Per-faction tints multiplied over the militant model's camo textures (material name -> colour).
const LOOKS = {
  hamas: { balaclava: 0x3a3a38, jacket: 0xffffff, pants: 0xffffff, vest: 0xffffff },
  pij: { balaclava: 0x262626, jacket: 0x303030, pants: 0x303030, vest: 0x3c3c3c, gloves: 0x505050 },
  rpg: { balaclava: 0x4a4a42, jacket: 0xb8b090, pants: 0xb8b090, vest: 0x9a9480 },
  sniper: { balaclava: 0xd8c8a8, jacket: 0xf0dcb0, pants: 0xe6d2a8, vest: 0xd8c49c },
};
const GUN_FOR = { ak: 'akm', rpg: 'rpg', sniper: 'm24' };
// Where the pistol grip sits relative to the character root (character faces +Z, its right hand is -X).
const HOLD = {
  ak: { pos: [-0.14, 1.3, 0.2], rot: 0.1 },
  rpg: { pos: [-0.12, 1.47, 0.12], rot: 0.03 },
  sniper: { pos: [-0.14, 1.3, 0.24], rot: 0.08 },
};

let clips = null;
const lookMats = {};
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function prepare() {
  clips = retargetClips(assets.soldier.scene, assets.soldier.animations.filter((c) => /Idle|Walk|Run/.test(c.name)), models.militant.scene);
}

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

export function createCharacter(kind, gunKind) {
  if (!clips) prepare();
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(models.militant.scene);
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
  const addHit = (bone, geo, worldOffset, part) => {
    const m = new THREE.Mesh(geo, hitMat);
    const p = bone.getWorldPosition(new THREE.Vector3()).add(worldOffset);
    bone.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const ws = bone.getWorldScale(new THREE.Vector3());
    m.position.copy(p).applyMatrix4(inv);
    m.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    m.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    m.userData.part = part;
    m.layers.set(LAYER_HITBOX);
    bone.add(m);
    hit.push(m);
  };
  const W = (x, y, z) => new THREE.Vector3(x, y, z);
  const limb = (a, b, thick, part) => {
    const pa = a.getWorldPosition(W()), pb = b.getWorldPosition(W());
    const len = pa.distanceTo(pb);
    const d = pb.clone().sub(pa).normalize();
    const g = new THREE.BoxGeometry(thick, len, thick);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(W(0, 1, 0), d));
    addHit(a, g, pb.sub(pa).multiplyScalar(0.5), part);
  };
  addHit(B.Head, new THREE.SphereGeometry(0.12, 8, 6), W(0, 0.08, 0.02), 'head');
  addHit(B.Spine1, new THREE.BoxGeometry(0.44, 0.5, 0.3), W(0, 0.15, 0), 'body');
  addHit(B.Hips, new THREE.BoxGeometry(0.38, 0.25, 0.28), W(0, 0, 0), 'body');
  limb(B.LeftUpLeg, B.LeftLeg, 0.17, 'legs');
  limb(B.RightUpLeg, B.RightLeg, 0.17, 'legs');
  limb(B.LeftLeg, B.LeftFoot, 0.14, 'legs');
  limb(B.RightLeg, B.RightFoot, 0.14, 'legs');
  limb(B.LeftArm, B.LeftForeArm, 0.11, 'body');
  limb(B.RightArm, B.RightForeArm, 0.11, 'body');
  limb(B.LeftForeArm, B.LeftHand, 0.09, 'body');
  limb(B.RightForeArm, B.RightHand, 0.09, 'body');

  const HR = analyzeHand(B, 'R'), HL = analyzeHand(B, 'L');
  curlFingers(HR, 1.1, 0.6);
  curlFingers(HL, 1.0, 0.5);

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

  const mixer = new THREE.AnimationMixer(model);
  const actions = { idle: mixer.clipAction(clips.Idle), walk: mixer.clipAction(clips.Walk), run: mixer.clipAction(clips.Run) };
  const weights = { idle: 1, walk: 0, run: 0 };
  for (const [k, a] of Object.entries(actions)) { a.play(); a.setEffectiveWeight(weights[k]); }
  mixer.update(Math.random() * 2);

  const gripW = new THREE.Vector3(), foreW = new THREE.Vector3(), poleR = new THREE.Vector3(), poleL = new THREE.Vector3();
  const fwdW = new THREE.Vector3(), upW = new THREE.Vector3(), rightW = new THREE.Vector3(), tmp = new THREE.Vector3();
  const gq = new THREE.Quaternion();
  let alive = true, aim = 0;

  return {
    root, hit, muzzle, gunPivot,
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
