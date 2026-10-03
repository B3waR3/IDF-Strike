import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Mixamo (Soldier.glb clips) -> Reallusion CC skeleton used by the downloaded characters.
export const CC_MAP = {
  Hips: 'Hip', Spine: 'Waist', Spine1: 'Spine01', Spine2: 'Spine02', Neck: 'NeckTwist01', Head: 'Head',
  LeftShoulder: 'L_Clavicle', LeftArm: 'L_Upperarm', LeftForeArm: 'L_Forearm', LeftHand: 'L_Hand',
  RightShoulder: 'R_Clavicle', RightArm: 'R_Upperarm', RightForeArm: 'R_Forearm', RightHand: 'R_Hand',
  LeftUpLeg: 'L_Thigh', LeftLeg: 'L_Calf', LeftFoot: 'L_Foot', LeftToeBase: 'L_ToeBase',
  RightUpLeg: 'R_Thigh', RightLeg: 'R_Calf', RightFoot: 'R_Foot', RightToeBase: 'R_ToeBase',
};
const FINGERS = ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'];

const stripSuffix = (n) => n.replace(/_\d+$/, '');

// Generic bone table: { Hips, Spine1, ..., L_Index1, R_Thumb3, ... } keyed by Mixamo name or CC short name.
export function ccBones(root) {
  const byCC = {};
  root.traverse((o) => { if (o.isBone) byCC[stripSuffix(o.name).replace(/^CC_Base_/, '')] = o; });
  const out = { ...byCC };
  for (const [mx, cc] of Object.entries(CC_MAP)) if (byCC[cc]) out[mx] = byCC[cc];
  return out;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function sortedByDepth(bones) {
  const depth = (b) => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
  return bones.slice().sort((a, b) => depth(a) - depth(b));
}

// Bakes Mixamo clips onto a CC skeleton by transferring world-space rotation deltas from the rest pose.
export function retargetClips(srcScene, srcClips, tgtScene, fps = 30) {
  const srcWrap = new THREE.Group();
  const src = SkeletonUtils.clone(srcScene);
  srcWrap.add(src);
  src.updateMatrixWorld(true);
  const sFoot = src.getObjectByName('mixamorigLeftFoot').getWorldPosition(new THREE.Vector3());
  const sToe = src.getObjectByName('mixamorigLeftToeBase').getWorldPosition(new THREE.Vector3());
  if (sToe.z < sFoot.z) srcWrap.rotation.y = Math.PI;
  srcWrap.updateMatrixWorld(true);

  const tgt = SkeletonUtils.clone(tgtScene);
  tgt.updateMatrixWorld(true);
  const T = ccBones(tgt);
  const pairs = [];
  for (const mx of Object.keys(CC_MAP)) {
    const s = src.getObjectByName('mixamorig' + mx), t = T[mx];
    if (s && t) pairs.push({ mx, s, t });
  }
  const tOrder = sortedByDepth(pairs.map((p) => p.t));
  const byT = new Map(pairs.map((p) => [p.t, p]));
  for (const p of pairs) {
    p.sRest = p.s.getWorldQuaternion(new THREE.Quaternion());
    p.tRest = p.t.getWorldQuaternion(new THREE.Quaternion());
    p.tLocal = p.t.quaternion.clone();
  }
  const hipS = byT.get(T.Hips).s, hipT = T.Hips;
  const sHipRest = hipS.getWorldPosition(new THREE.Vector3());
  const tHipRest = hipT.getWorldPosition(new THREE.Vector3());
  const tHipLocal = hipT.position.clone();
  const sHead = src.getObjectByName('mixamorigHead').getWorldPosition(new THREE.Vector3());
  const tHead = T.Head.getWorldPosition(new THREE.Vector3());
  const hScale = (tHead.y - tgt.getWorldPosition(_v).y) / Math.max(0.01, sHead.y - srcWrap.getWorldPosition(_v2).y);

  const mixer = new THREE.AnimationMixer(src);
  const out = {};
  for (const clip of srcClips) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    const qv = new Map(pairs.map((p) => [p, new Float32Array(n * 4)]));
    const hv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * clip.duration;
      times[i] = t;
      mixer.setTime(t);
      srcWrap.updateMatrixWorld(true);
      for (const p of pairs) p.t.quaternion.copy(p.tLocal);
      hipT.position.copy(tHipLocal);
      tgt.updateMatrixWorld(true);
      // Hips translation, scaled to the target's height.
      const d = hipS.getWorldPosition(_v).sub(sHipRest).multiplyScalar(hScale);
      hipT.parent.worldToLocal(_v2.copy(tHipRest).add(d));
      hipT.position.copy(_v2);
      hv.set([_v2.x, _v2.y, _v2.z], i * 3);
      for (const tb of tOrder) {
        const p = byT.get(tb);
        p.s.getWorldQuaternion(_q).multiply(_q2.copy(p.sRest).invert()).multiply(p.tRest);
        tb.parent.getWorldQuaternion(_q2).invert();
        tb.quaternion.copy(_q2.multiply(_q));
        tb.updateMatrixWorld(true);
        qv.get(p).set([tb.quaternion.x, tb.quaternion.y, tb.quaternion.z, tb.quaternion.w], i * 4);
      }
    }
    const tracks = pairs.map((p) => new THREE.QuaternionKeyframeTrack(`${p.t.name}.quaternion`, times, qv.get(p)));
    tracks.push(new THREE.VectorKeyframeTrack(`${hipT.name}.position`, times, hv));
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    action.stop();
  }
  return out;
}

// ------------------------------------------------------------ analytic two-bone IK
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _pv = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _elbow = new THREE.Vector3(), _aSave = new THREE.Vector3();
function rotateBoneToward(bone, childPos, desired) {
  bone.getWorldPosition(_a);
  _from.copy(childPos).sub(_a).normalize();
  _to.copy(desired).sub(_a).normalize();
  _dq.setFromUnitVectors(_from, _to);
  bone.getWorldQuaternion(_q1);
  _q1.premultiply(_dq);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q1));
  bone.updateMatrixWorld(true);
}
// Elbow data for `solveIK`: the upper arm's bend axis, measured from the rest pose (which must be bent).
export function armHinge(upper, lower, end) {
  const s = upper.getWorldPosition(new THREE.Vector3()), e = lower.getWorldPosition(new THREE.Vector3());
  const w = end.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3().crossVectors(e.clone().sub(s), w.sub(e)).normalize();
  return { axisL: axis.applyQuaternion(upper.getWorldQuaternion(new THREE.Quaternion()).invert()), lowerRest: lower.quaternion.clone() };
}
const _u = new THREE.Vector3(), _n = new THREE.Vector3(), _h = new THREE.Vector3(), _wr = new THREE.Vector3(), _hx = new THREE.Vector3();
// With `hinge` the upper arm is also rolled so the elbow only bends about its own axis, which keeps the
// forearm's roll anatomical and makes the result independent of the previous frame.
export function solveIK(upper, lower, end, target, pole, hinge = null) {
  if (hinge) { lower.quaternion.copy(hinge.lowerRest); lower.updateMatrixWorld(true); }
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
  _aSave.copy(_a);
  _wr.copy(_a).addScaledVector(dir, d);
  rotateBoneToward(upper, _b, _elbow);
  if (hinge) {
    _u.copy(_elbow).sub(_aSave).normalize();
    _n.copy(_wr).sub(_elbow).cross(_u).negate().normalize();
    upper.getWorldQuaternion(_q1);
    _h.copy(hinge.axisL).applyQuaternion(_q1);
    _h.addScaledVector(_u, -_h.dot(_u)).normalize();
    const roll = Math.atan2(_hx.crossVectors(_h, _n).dot(_u), _h.dot(_n));
    _q1.premultiply(_dq.setFromAxisAngle(_u, roll));
    upper.parent.getWorldQuaternion(_q3).invert();
    upper.quaternion.copy(_q3.multiply(_q1));
    upper.updateMatrixWorld(true);
  }
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  rotateBoneToward(lower, _c, _wr);
}

// ------------------------------------------------------------ hands
// Measures a hand's local axes (wrist->fingers, palm normal) and each finger joint's curl axis from the rest pose.
export function analyzeHand(B, side) {
  const hand = B[`${side}_Hand`];
  const pos = (b) => b.getWorldPosition(new THREE.Vector3());
  const hp = pos(hand);
  const along = pos(B[`${side}_Mid1`]).sub(hp).normalize();
  const across = pos(B[`${side}_Pinky1`]).sub(pos(B[`${side}_Index1`])).normalize();
  const palm = new THREE.Vector3().crossVectors(along, across).multiplyScalar(side === 'R' ? 1 : -1).normalize();
  across.crossVectors(palm, along).normalize();
  const hq = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const H = {
    hand, alongL: along.clone().applyQuaternion(hq), palmL: palm.clone().applyQuaternion(hq),
    joints: [],
  };
  for (const f of FINGERS) {
    for (let i = 1; i <= 3; i++) {
      const b = B[`${side}_${f}${i}`];
      if (!b) continue;
      const bq = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      let axisW;
      if (f === 'Thumb') {
        const tip = B[`${side}_${f}${Math.min(3, i + 1)}`] || b;
        const dir = pos(tip).sub(pos(b));
        if (dir.lengthSq() < 1e-8) dir.copy(along);
        axisW = new THREE.Vector3().crossVectors(dir.normalize(), palm).normalize();
      } else axisW = across.clone();
      // Pick the rotation sign that swings the finger toward the palm.
      const child = b.children.find((c) => c.isBone);
      const origin = pos(b);
      // A fingertip has no child bone; it carries on in the direction of the joint before it.
      const off = child ? pos(child).sub(origin) : origin.clone().sub(pos(b.parent));
      const moved = off.clone().applyAxisAngle(axisW, 0.3);
      const sign = moved.sub(off).dot(palm) >= 0 ? 1 : -1;
      // How far this joint is already bent in the bind pose, so a curl of 0 can mean a straight finger.
      let restCurl = 0;
      if (b.parent) {
        const parentDir = origin.clone().sub(b.parent.getWorldPosition(new THREE.Vector3()));
        if (parentDir.lengthSq() > 1e-8 && off.lengthSq() > 1e-8) {
          parentDir.normalize();
          const childDir = off.clone().normalize();
          const flex = axisW.clone().multiplyScalar(sign);
          restCurl = Math.atan2(new THREE.Vector3().crossVectors(parentDir, childDir).dot(flex), Math.min(1, Math.max(-1, parentDir.dot(childDir))));
        }
      }
      H.joints.push({ b, rest: b.quaternion.clone(), restCurl, axis: axisW.applyQuaternion(bq).multiplyScalar(sign), thumb: f === 'Thumb', index: f === 'Index', i });
    }
  }
  return H;
}
// Lets `orientHand` pass the hand's roll about the forearm on to the CC forearm twist bones, so the
// sleeve and glove cuff turn gradually from elbow to wrist (pronation/supination) instead of wringing
// at the wrist. `k` is each bone's share; they are chained, so the second one ends up at 0.7 of the roll.
export function forearmTwist(H, B, side) {
  const hand = H.hand;
  const axisW = hand.getWorldPosition(new THREE.Vector3()).sub(hand.parent.getWorldPosition(new THREE.Vector3())).normalize();
  const bones = [[`${side}_ForearmTwist01`, 0.25], [`${side}_ForearmTwist02`, 0.45]].filter(([n]) => B[n]).map(([n, k]) => ({
    b: B[n], k, rest: B[n].quaternion.clone(),
    axis: axisW.clone().applyQuaternion(B[n].parent.getWorldQuaternion(new THREE.Quaternion()).invert()),
  }));
  H.twist = { bones, handRest: hand.quaternion.clone(), axis: hand.position.clone().normalize() };
}
const _tw = new THREE.Quaternion();
function spreadTwist(T, handQ) {
  // Hand rotation away from rest in the forearm's frame; its component about the forearm axis is the roll.
  _tw.copy(T.handRest).invert().premultiply(handQ);
  const a = T.axis;
  let roll = 2 * Math.atan2(_tw.x * a.x + _tw.y * a.y + _tw.z * a.z, _tw.w);
  if (roll > Math.PI) roll -= 2 * Math.PI;
  else if (roll < -Math.PI) roll += 2 * Math.PI;
  for (const t of T.bones) t.b.quaternion.setFromAxisAngle(t.axis, roll * t.k).multiply(t.rest);
  return roll;
}
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
// Orients the hand so its fingers point along `alongW` with the palm facing `palmW` (world space).
export function orientHand(H, alongW, palmW) {
  _z.crossVectors(H.alongL, H.palmL).normalize();
  _y.crossVectors(_z, H.alongL);
  _m1.makeBasis(H.alongL, _y, _z);
  _x.copy(alongW).normalize();
  _z.crossVectors(_x, palmW).normalize();
  _y.crossVectors(_z, _x);
  _m2.makeBasis(_x, _y, _z);
  _m2.multiply(_m1.transpose());
  _q.setFromRotationMatrix(_m2);
  H.hand.parent.getWorldQuaternion(_q2).invert();
  H.hand.quaternion.copy(_q2.multiply(_q));
  if (H.twist) H.roll = spreadTwist(H.twist, H.hand.quaternion);
  H.hand.parent.updateMatrixWorld(true);
}
// `open` (0..1) relaxes every finger except the index, e.g. to let a karambit spin on the index finger.
// `fromStraight` measures curl from an open hand. The bind pose is already half-closed, so without it a small curl stays a fist.
export function curlFingers(H, curl, thumbCurl = curl * 0.5, spread = 1, open = 0, fromStraight = false, indexCurl = null) {
  for (const j of H.joints) {
    const c = j.index ? (indexCurl == null ? curl : indexCurl) : curl + (0.12 - curl) * open, tc = thumbCurl + (0.1 - thumbCurl) * open;
    let a = j.thumb ? tc * (j.i === 1 ? 0.3 : 0.8) : c * (j.i === 1 ? 1 : j.i === 2 ? 1.25 : 0.9) * spread;
    if (fromStraight) a -= j.restCurl || 0;
    j.b.quaternion.copy(j.rest).multiply(_q.setFromAxisAngle(j.axis, a));
  }
  H.hand.updateMatrixWorld(true);
}
// CC bind fingers are already a fist; local identity is the T-pose open. `amount` 0 = fist (bind), 1 = flat open
// (identity plus a little reverse curl — the skinned glove still reads as a claw at pure identity).
const _openQ = new THREE.Quaternion();
export function openFingers(H, amount = 1, indexAmount = null, thumbAmount = null) {
  const a = Math.min(1, Math.max(0, amount));
  const idx = indexAmount == null ? a : Math.min(1, Math.max(0, indexAmount));
  const th = thumbAmount == null ? a : Math.min(1, Math.max(0, thumbAmount));
  for (const j of H.joints) {
    const t = j.index ? idx : j.thumb ? th : a;
    j.b.quaternion.slerpQuaternions(j.rest, _openQ.identity(), t);
    // Flatten past T-pose once mostly open; skip thumbs (they look wrong hyperextended).
    if (!j.thumb && t > 0.85) {
      const flat = (t - 0.85) / 0.15; // 0..1 over the last stretch
      const deg = j.i === 1 ? -0.55 : j.i === 2 ? -0.7 : -0.45;
      j.b.quaternion.multiply(_q.setFromAxisAngle(j.axis, deg * flat));
    }
  }
  H.hand.updateMatrixWorld(true);
}
