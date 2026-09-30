import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { TEX } from './effects.js';
import { models, makeGun } from './models.js';
import { ccBones, solveIK, armHinge, analyzeHand, forearmTwist, orientHand, curlFingers } from './rig.js';
import { shareSkeletons, ownMaterials } from './merge.js';
import { makeGrenadeMesh } from './grenade.js';
import { MED_TIMING, BAND_R, makeBandage, newFrame, forearmFrame, wrapPhase, aroundArm, placeBandage, hideBandage } from './bandage.js';

const GUN_FOR = { tavor: 'tavor', m4: 'm4', negev: 'm240', m24: 'm24', glock: 'glock', jericho: 'jericho', karambit: 'karambit' };
// Camera-space placement. `eye` is how far behind the rear sight the eye sits; `hip` is the offset from ADS.
// Hand poses are in the gun frame (metres, -Z = muzzle, +X = right): target point, finger direction, palm normal.
// `charge` is where the support hand works the action on an empty reload, `pull` how far it travels.
export const LAYOUT = {
  tavor: {
    eye: 0.3, hip: [0.13, -0.042, -0.12],
    L: { along: [0.55, 0.15, -0.8], palm: [0, 1, 0] },
    charge: { p: [-0.035, 0.05, -0.08], pull: [0, 0, 0.08], along: [0, 0.2, -1], palm: [1, 0, 0] },
  },
  m4: {
    eye: 0.24, hip: [0.13, -0.045, -0.1],
    L: { along: [0, -0.3, -1], palm: [1, 0, 0] },
    charge: { p: [-0.01, 0.075, 0.2], pull: [0, 0, 0.06], along: [1, -0.4, 0], palm: [0, -0.3, -1] },
  },
  negev: { eye: 0.26, hip: [0.14, -0.05, -0.08], L: { along: [0.55, 0.15, -0.8], palm: [0, 1, 0] } },
  m24: {
    eye: 0.06, hip: [0.13, -0.045, -0.06], L: { along: [0.55, 0.15, -0.8], palm: [0, 1, 0] },
    bolt: { p: [0.05, 0.015, 0.16], lift: [0.01, 0.035, 0], pull: [0, 0, 0.085] },
  },
  glock: { eye: 0.56, hip: [0.1, -0.04, 0.02], pistol: true, reach: 0.12 },
  jericho: { eye: 0.56, hip: [0.1, -0.04, 0.02], pistol: true, reach: 0.12 },
  // `hold` gives camera-space directions for the finger ring and the claw's hook. Palm down, ring by
  // the thumb, blade out past the little finger curving forward: the usual karambit carry.
  karambit: {
    eye: 0.4, hip: [0.15, -0.17, -0.07], pistol: true, knife: true, reach: 0.04, scale: 1.25,
    hold: { ring: [-1, -0.35, 0.05], claw: [0.15, 0.75, -0.8] },
  },
};
// Upper-arm/forearm stretch so the support hand reaches the handguard — the usual viewmodel cheat.
const ARM_STRETCH = 1.3;

let flashMat = null;
function flashGroup(g, p, scale = 1) {
  if (!flashMat) flashMat = new THREE.MeshBasicMaterial({ map: TEX.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const f = new THREE.Group();
  const s = 0.2 * scale;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(s, s), flashMat);
  const side1 = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.9, s * 1.8), flashMat);
  side1.rotation.set(Math.PI / 2, 0, 0);
  side1.position.z = -s * 0.6;
  const side2 = side1.clone();
  side2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  f.add(front, side1, side2);
  f.position.copy(p).add(new THREE.Vector3(0, 0, -0.02));
  f.visible = false;
  g.add(f);
  return f;
}

// Open-hood reflex sight for models whose baked optic glass is opaque.
let RM = null;
function reflexSight(g, { y, z, rail }) {
  if (!RM) RM = {
    body: new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
    lens: new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.2 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
  };
  const s = new THREE.Group();
  const r = 0.024, len = 0.06;
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24, 1, true).rotateX(Math.PI / 2), RM.body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.044, y - r - rail + 0.008, 0.07), RM.body);
  base.position.set(0, (rail + y - r) / 2 - y + 0.004, 0.004);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12).rotateZ(Math.PI / 2), RM.body);
  knob.position.set(0.029, -0.01, 0.01);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), RM.lens);
  lens.position.z = -len * 0.3;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 8, 8), RM.dot);
  dot.position.z = -len * 0.3 - 0.001;
  s.add(hood, base, knob, lens, dot);
  s.position.set(0, y, z);
  g.add(s);
  return s;
}

// First-person arms: the IDF operator model with everything but sleeves and gloves hidden.
function buildArms(reach = 0) {
  const model = SkeletonUtils.clone(models.operator.scene);
  shareSkeletons(model);
  ownMaterials(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.visible = /Gloves|Kitel/i.test(o.material.name);
    o.frustumCulled = false;
    o.castShadow = o.receiveShadow = false;
  });
  const wrap = new THREE.Group();
  wrap.rotation.y = Math.PI;
  wrap.add(model);
  const B = ccBones(model);
  for (const b of [B.LeftForeArm, B.RightForeArm, B.LeftHand, B.RightHand]) b.position.multiplyScalar(ARM_STRETCH);
  wrap.updateMatrixWorld(true);
  const HR = analyzeHand(B, 'R'), HL = analyzeHand(B, 'L');
  HR.hinge = armHinge(B.RightArm, B.RightForeArm, B.RightHand);
  HL.hinge = armHinge(B.LeftArm, B.LeftForeArm, B.LeftHand);
  forearmTwist(HR, B, 'R');
  forearmTwist(HL, B, 'L');
  const head = B.Head.getWorldPosition(new THREE.Vector3());
  // Shoulders sit slightly ahead of the eye: another standard viewmodel cheat for reach.
  // `reach` pushes them further for fully extended pistol stances.
  wrap.position.set(-head.x, -head.y - 0.1, -head.z - 0.1 - reach);
  return { wrap, B, HR, HL };
}

const V = (a) => new THREE.Vector3(...a);
const smooth = (t) => t * t * (3 - 2 * t);
// A hand pose. `cam` poses are in camera space instead of the gun frame (used for the chest pouches).
const pose = (p, along, palm, o = {}) => ({
  p: V(p), along: V(along).normalize(), palm: V(palm).normalize(),
  back: o.back ?? 0.05, lift: o.lift ?? 0.03, curl: o.curl ?? 0.95, thumb: o.thumb ?? 0.6, cam: !!o.cam,
});
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const arr = (v) => v.toArray();
const clamp01 = (t) => Math.min(1, Math.max(0, t));
// Knife orientation from camera-space directions of its finger ring and its claw (the knife frame has
// the ring at +Y, the hook toward -Z and the palm against its -X face).
const KNIFE_FRAME = new THREE.Matrix4().makeBasis(V([0, 1, 0]), V([0, 0, -1]), V([-1, 0, 0])).transpose();
function holdQ(ring, claw) {
  const r = V(ring).normalize(), c = V(claw);
  c.addScaledVector(r, -c.dot(r)).normalize();
  const m = new THREE.Matrix4().makeBasis(r, c, new THREE.Vector3().crossVectors(r, c));
  return new THREE.Quaternion().setFromRotationMatrix(m.multiply(KNIFE_FRAME));
}
// Keyframes [t, value...] sampled with smoothstep between neighbours.
function keyIndex(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  return [keys[i], keys[i + 1], smooth(clamp01((t - keys[i][0]) / Math.max(1e-4, keys[i + 1][0] - keys[i][0])))];
}

// First-person frag grenade: arms plus an M67 in the right hand. Poses are in camera space.
// update(n) takes { phase: 'pull' | 'hold' | 'throw', t: seconds into the phase, cocked, released }.
export const NADE_TIMING = { pull: 0.45, pinOut: 0.3, cock: 0.25, throw: 0.5, release: 0.22 };
export function buildGrenadeViewModel(root) {
  const arms = buildArms(0);
  const group = new THREE.Group();
  group.add(arms.wrap);
  const nade = makeGrenadeMesh();
  ownMaterials(nade.root);
  nade.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  group.add(nade.root);
  group.visible = false;
  root.add(group);

  const C = (p, along, palm, o) => pose(p, along, palm, { cam: true, ...o });
  const R_LOW = C([0.26, -0.5, -0.32], [0, 1, -0.3], [-1, 0, 0], { curl: 1.1 });
  const R_CHEST = C([0.09, -0.16, -0.46], [-0.2, 0.6, -1], [-1, 0, 0], { curl: 1.15, thumb: 0.9, lift: 0.035 });
  const R_COCK = C([0.27, 0.03, -0.3], [0, 1, 0.1], [-0.3, 0, -1], { curl: 1.15, thumb: 0.9, lift: 0.035 });
  const R_FWD = C([0.08, 0.0, -0.68], [0, 0.3, -1], [0, -1, -0.3], { curl: 0.35, thumb: 0.3 });
  const R_FOLLOW = C([0.0, -0.4, -0.52], [-0.2, -0.4, -1], [-1, 0, 0], { curl: 0.5, thumb: 0.4 });
  const ringAt = arr(R_CHEST.p.clone().add(nade.ringHome).add(V([-0.012, 0, 0])));
  const L_LOW = C([-0.26, -0.55, -0.32], [0, 1, -0.3], [1, 0, 0], { curl: 1 });
  const L_PIN = C(ringAt, [0.4, 0.3, -1], [0.2, -1, 0], { curl: 0.85, thumb: 0.85, back: 0.07, lift: 0.02 });
  const L_PULLED = C([-0.25, -0.18, -0.5], [0.2, 0.3, -1], [0.2, -1, 0], { curl: 0.85, thumb: 0.85, back: 0.07, lift: 0.02 });
  const L_POINT = C([-0.18, -0.06, -0.64], [0.1, 0.2, -1], [0.3, -1, 0], { curl: 0.4, thumb: 0.3 });
  const L_THROW = C([-0.22, -0.45, -0.36], [0.2, 0.6, -1], [1, 0, 0], { curl: 0.8 });

  const mk = () => ({ p: new THREE.Vector3(), along: new THREE.Vector3(), palm: new THREE.Vector3(), back: 0, lift: 0, curl: 0, thumb: 0 });
  const outR = mk(), outL = mk();
  const sample = (keys, t, out) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    const s = smooth(Math.min(1, Math.max(0, (t - t0) / Math.max(1e-4, t1 - t0))));
    out.p.lerpVectors(a.p, b.p, s);
    out.along.lerpVectors(a.along, b.along, s).normalize();
    out.palm.lerpVectors(a.palm, b.palm, s).normalize();
    for (const k of ['back', 'lift', 'curl', 'thumb']) out[k] = a[k] + (b[k] - a[k]) * s;
    return out;
  };
  const w = new THREE.Vector3(), handP = new THREE.Vector3(), ringP = new THREE.Vector3();
  const poleR = new THREE.Vector3(0.9, -0.9, 0.4), poleL = new THREE.Vector3(-0.9, -1.0, -0.1);
  const place = (H, upper, lower, P, pole) => {
    w.copy(P.p).addScaledVector(P.along, -P.back).addScaledVector(P.palm, -P.lift);
    solveIK(upper, lower, H.hand, w, pole, H.hinge);
    orientHand(H, P.along, P.palm);
    curlFingers(H, P.curl, P.thumb);
  };
  const N = NADE_TIMING;

  return {
    group,
    update(n, time = 0) {
      group.visible = !!n;
      if (!n) return;
      group.updateMatrixWorld(true);
      const { B, HR, HL } = arms;
      let ringInHand = false, inHand = true;
      if (n.phase === 'pull') {
        sample([[0, R_LOW], [0.18, R_CHEST], [N.pull, R_CHEST]], n.t, outR);
        sample([[0, L_LOW], [0.18, L_PIN], [0.26, L_PIN], [0.42, L_PULLED], [N.pull, L_PULLED]], n.t, outL);
        ringInHand = n.t > 0.26;
      } else if (n.phase === 'hold') {
        sample([[0, R_CHEST], [N.cock, R_COCK]], n.t, outR);
        // Slight tremble of a cooked grenade held ready.
        outR.p.y += Math.sin(time * 9) * 0.002;
        sample([[0, L_PULLED], [0.3, L_POINT]], n.t, outL);
      } else {
        sample([[0, n.cocked ? R_COCK : R_CHEST], [0.12, R_COCK], [0.26, R_FWD], [N.throw, R_FOLLOW]], n.t, outR);
        inHand = n.t < N.release;
        sample([[0, n.cocked ? L_POINT : L_PULLED], [0.18, L_POINT], [N.throw, L_THROW]], n.t, outL);
      }
      handP.copy(outR.p);
      place(HR, B.RightArm, B.RightForeArm, outR, poleR);
      place(HL, B.LeftArm, B.LeftForeArm, outL, poleL);
      const leftP = outL;

      nade.root.visible = inHand;
      nade.root.position.copy(handP);
      nade.root.rotation.set(-0.2, 0.4, 0.15);
      nade.root.updateMatrixWorld(true);
      // The ring stays on the grenade until pinched, then rides in the left hand until the pull ends.
      nade.ring.visible = n.phase === 'pull';
      if (ringInHand) {
        nade.root.worldToLocal(ringP.copy(leftP.p));
        nade.ring.position.copy(ringP);
      } else nade.ring.position.copy(nade.ringHome);
    },
  };
}

// Karambit stab timing in seconds, shared with the third-person body.
export const STAB_TIMING = { dur: 0.48, cock: 0.12, hit: 0.2 };

// First-person IFAK: tear the bandage pack open, hold the left forearm out, wrap it three times,
// clip the pressure bar and drop the arms again. update(t) takes seconds into the IFAK, or < 0.
export function buildMedViewModel(root) {
  const arms = buildArms(0);
  const group = new THREE.Group();
  group.add(arms.wrap);
  const kit = makeBandage();
  kit.all.forEach((o) => group.add(o));
  group.visible = false;
  root.add(group);

  const C = (p, along, palm, o) => pose(p, along, palm, { cam: true, ...o });
  const R_LOW = C([0.26, -0.56, -0.3], [0, 1, -0.3], [-1, 0, 0], { curl: 1 });
  const L_LOW = C([-0.26, -0.58, -0.3], [0, 1, -0.3], [1, 0, 0], { curl: 0.9 });
  const R_TEAR = C([0.06, -0.2, -0.46], [-0.3, 0.5, -1], [-0.9, 0, 0.3], { curl: 1.1, thumb: 0.95, lift: 0.028 });
  const L_TEAR = C([-0.02, -0.1, -0.47], [0.35, 0.6, -1], [0.9, 0, 0.3], { curl: 1.05, thumb: 0.95, back: 0.07, lift: 0.02 });
  const R_RIP = { ...R_TEAR, p: R_TEAR.p.clone().add(V([0.07, -0.06, 0.02])) };
  const L_RIP = { ...L_TEAR, p: L_TEAR.p.clone().add(V([-0.05, 0.04, 0])) };
  const L_HOLD = C([0.1, -0.12, -0.45], [1, 0.05, -0.15], [0, -1, 0.1], { curl: 0.35, thumb: 0.25, back: 0.075, lift: 0.02 });
  const T = MED_TIMING;
  const mk = () => ({ p: new THREE.Vector3(), along: new THREE.Vector3(), palm: new THREE.Vector3(), back: 0.05, lift: 0.03, curl: 1, thumb: 0.8 });
  const outR = mk(), outL = mk(), orbit = mk(), press = mk();
  const mix = (out, a, b, s) => {
    out.p.lerpVectors(a.p, b.p, s);
    out.along.lerpVectors(a.along, b.along, s).normalize();
    out.palm.lerpVectors(a.palm, b.palm, s).normalize();
    for (const k of ['back', 'lift', 'curl', 'thumb']) out[k] = a[k] + (b[k] - a[k]) * s;
    return out;
  };
  const sample = (keys, t, out) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    return mix(out, a, b, smooth(Math.min(1, Math.max(0, (t - t0) / Math.max(1e-4, t1 - t0)))));
  };
  const w = new THREE.Vector3(), E = new THREE.Vector3(), Wr = new THREE.Vector3(), toCam = new THREE.Vector3();
  const radial = new THREE.Vector3(), packQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, -0.35, 0.2));
  const poleR = new THREE.Vector3(1, -0.8, 0.3), poleL = new THREE.Vector3(-1.2, -0.3, -0.3);
  const f = newFrame();
  const place = (H, upper, lower, P, pole) => {
    w.copy(P.p).addScaledVector(P.along, -P.back).addScaledVector(P.palm, -P.lift);
    solveIK(upper, lower, H.hand, w, pole, H.hinge);
    orientHand(H, P.along, P.palm);
    curlFingers(H, P.curl, P.thumb);
  };
  // Right hand carrying the roll around the arm: palm toward the forearm, fingers along the motion.
  const orbitAt = (theta, out) => {
    aroundArm(f, theta, BAND_R + 0.03, out.p);
    radial.subVectors(out.p, f.c).normalize();
    out.palm.copy(radial).negate();
    out.along.copy(f.e1).multiplyScalar(-Math.sin(theta)).addScaledVector(f.e2, Math.cos(theta)).normalize();
    Object.assign(out, { back: 0.05, lift: 0.035, curl: 1.1, thumb: 0.85 });
    return out;
  };

  return {
    group,
    // Live pose handles for tuning from the console (window.__game.medVM.tune).
    tune: { L_HOLD, poleL },
    update(t) {
      group.visible = t >= 0;
      if (t < 0) { hideBandage(kit); return; }
      group.updateMatrixWorld(true);
      const { B, HR, HL } = arms;
      sample([[0, L_LOW], [T.tear, L_TEAR], [T.rip, L_RIP], [T.present, L_HOLD], [T.fasten + 0.05, L_HOLD], [T.dur, L_LOW]], t, outL);
      place(HL, B.LeftArm, B.LeftForeArm, outL, poleL);
      B.LeftForeArm.getWorldPosition(E);
      B.LeftHand.getWorldPosition(Wr);
      forearmFrame(E, Wr, toCam.copy(E).lerp(Wr, 0.55).negate(), f);

      const { theta } = wrapPhase(t);
      press.p.copy(f.c).addScaledVector(f.e1, BAND_R + 0.03);
      press.along.copy(f.A);
      press.palm.copy(f.e1).negate();
      Object.assign(press, { back: 0.06, lift: 0.03, curl: 0.35, thumb: 0.3 });
      if (t < T.rip) sample([[0, R_LOW], [T.tear, R_TEAR], [T.rip, R_RIP]], t, outR);
      else if (t < T.present) mix(outR, R_RIP, orbitAt(0, orbit), smooth((t - T.rip) / (T.present - T.rip)));
      else if (t < T.wrapEnd) orbitAt(theta, outR);
      else if (t < T.fasten) mix(outR, orbitAt(theta, orbit), press, smooth((t - T.wrapEnd) / (T.fasten - T.wrapEnd)));
      else mix(outR, press, R_LOW, smooth((t - T.fasten) / (T.dur - T.fasten)));
      place(HR, B.RightArm, B.RightForeArm, outR, poleR);

      // The pack is held between both hands until it is ripped open.
      const hand = t < T.rip ? orbit.p.lerpVectors(outR.p, outL.p, 0.5) : outR.p;
      placeBandage(kit, group, t, f, hand, packQ);
    },
  };
}

export function buildViewModel(id, root) {
  const L = LAYOUT[id];
  const gun = makeGun(GUN_FOR[id]);
  ownMaterials(gun.root);
  // Viewmodel-only enlargement (small weapons read better slightly oversized, as in most shooters).
  if (L.scale) {
    gun.root.scale.setScalar(L.scale);
    for (const v of [gun.grip, gun.fore, gun.muzzle]) v.multiplyScalar(L.scale);
  }
  const g = new THREE.Group();
  g.add(gun.root);
  if (gun.cfg.reflex) reflexSight(g, gun.cfg.reflex);
  const mag = gun.mag;
  const magBase = mag.position.clone();
  const mb = mag.children.length
    ? new THREE.Box3().setFromObject(mag)
    : new THREE.Box3(new THREE.Vector3(-0.01, -0.02, -0.01), new THREE.Vector3(0.01, 0.02, 0.01));
  const magC = mb.getCenter(new THREE.Vector3()), magH = mb.max.y - mb.min.y;
  const muzzle = gun.muzzle.clone();
  const flash = flashGroup(g, muzzle, L.knife ? 0 : L.pistol ? 0.6 : id === 'negev' || id === 'm24' ? 1.3 : 1);
  if (L.knife) flash.visible = false;
  gun.root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });

  // ADS: sight line on the camera axis, rear of the optic `eye` metres in front of the eye.
  const ads = new THREE.Vector3(0, -gun.sightY, -L.eye - (gun.cfg.sightZ ?? 0));
  const hip = ads.clone().add(V(L.hip));

  const arms = buildArms(L.reach);
  const armsGroup = new THREE.Group();
  armsGroup.add(arms.wrap);
  g.visible = false;
  armsGroup.visible = false;
  root.add(g, armsGroup);

  // ---------------------------------------------------------------- poses
  const grip = arr(gun.grip), fore = arr(gun.fore);
  // Pistols use a thumbs-forward grip: right thumb straight along the frame, support fingers under the trigger guard.
  // The karambit handle stands upright across the finger roots of a closed fist, the ring on the index finger.
  const R_GRIP = L.knife
    ? pose(grip, [0, 0.05, -1], [-1, 0, 0.05], { back: 0.062, lift: 0.022, curl: 1.55, thumb: 0.95 })
    : L.pistol
    ? pose(grip, [0, 0.2, -1], [-1, 0, 0], { back: 0.06, lift: 0.026, curl: 1.25, thumb: 0.25 })
    : pose(grip, [0, 0.25, -1], [-1, 0, 0], { back: 0.06, lift: 0.028, curl: 1.25, thumb: 0.9 });
  const POUCH = pose([-0.2, -0.55, -0.2], [0.3, 1, -0.3], [1, 0, 0], { cam: true, curl: 1, back: 0.02, lift: 0.02 });
  let SUPPORT, ON_MAG, MAG_OPEN, MAG_OUT, MAG_ALIGN, SLAP, OFF, grab;
  if (L.pistol) {
    SUPPORT = pose(add(grip, [-0.024, -0.018, -0.006]), [0.35, -0.55, -0.75], [1, 0.15, 0.25], { back: 0.05, lift: 0.028, curl: 1.15, thumb: 0.15 });
    grab = [magC.x, mb.min.y + 0.015, magC.z];
    ON_MAG = pose(grab, [0.25, 0.6, -1], [1, 0.4, 0], { back: 0.04, lift: 0.03, curl: 1.05, thumb: 0.4 });
    MAG_ALIGN = { ...ON_MAG, p: V(add(grab, [-0.01, -0.1, 0.02])) };
    SLAP = pose([magC.x, mb.min.y - 0.035, magC.z], [0, 0.2, -1], [0, 1, 0], { back: 0.03, lift: 0.02, curl: 0.25, thumb: 0.1 });
    OFF = pose(add(grip, [-0.09, -0.09, 0.07]), [0.3, 0.2, -1], [1, 0.4, 0], { curl: 0.5 });
    // Relaxed guard fist, palm down with the knuckles forward, wrist in line with the forearm.
    if (L.knife) SUPPORT = pose([-0.14, -0.2, -0.46], [0.25, 0.15, -1], [0.3, -1, 0.1], { cam: true, curl: 1.15, thumb: 0.7 });
  } else {
    SUPPORT = pose(fore, L.L.along, L.L.palm);
    grab = [magC.x, magC.y - magH * 0.15, magC.z];
    ON_MAG = pose(grab, [0, 0.4, -1], [1, 0, 0], { lift: 0.035, curl: 1.0, thumb: 0.7 });
    MAG_OPEN = { ...ON_MAG, p: V(add(grab, [-0.02, -0.04, 0.01])), curl: 0.45, thumb: 0.3 };
    MAG_OUT = { ...ON_MAG, p: V(add(grab, [-0.02, -0.2, 0.04])) };
    MAG_ALIGN = { ...ON_MAG, p: V(add(grab, [-0.01, -0.1, 0.02])) };
    SLAP = pose([magC.x, mb.min.y - 0.03, magC.z], [0, 0.3, -1], [0, 1, 0], { back: 0.04, lift: 0.02, curl: 0.3, thumb: 0.2 });
    OFF = pose(add(fore, [-0.03, -0.07, 0.05]), L.L.along, L.L.palm, { curl: 0.45 });
  }
  // Empty reload: rack the slide / pull the charging handle / hit the bolt catch.
  let CHARGE, CHARGED, chargePull = null;
  if (L.pistol) {
    const rz = gun.size.z / 2 - 0.02;
    CHARGE = pose([0, gun.sightY + 0.004, rz], [1, -0.15, 0.2], [0, -1, 0], { back: 0.03, lift: 0.02, curl: 1.15, thumb: 1.0 });
    chargePull = [0, 0, 0.035];
  } else if (L.charge) {
    CHARGE = pose(L.charge.p, L.charge.along, L.charge.palm, { back: 0.04, lift: 0.025, curl: 1.1, thumb: 0.8 });
    chargePull = L.charge.pull;
  } else {
    CHARGE = pose([magC.x - 0.035, mb.max.y + 0.01, magC.z], [0, 0.3, -1], [1, 0, 0], { back: 0.03, lift: 0.02, curl: 0.4, thumb: 0.1 });
    chargePull = [0.012, 0, 0];
  }
  CHARGED = { ...CHARGE, p: CHARGE.p.clone().add(V(chargePull)) };
  const grabV = V(grab), pivot = new THREE.Vector3();

  // Support-hand timelines: [t, pose, flag]; a flag applies to the segment starting at its key.
  // `att` = the magazine rides in the hand, `pull` = the slide follows the hand back.
  const T = {
    rifle: [
      [0, SUPPORT], [0.14, MAG_OPEN], [0.2, ON_MAG, 'att'], [0.34, MAG_OUT, 'att'], [0.46, POUCH, 'att'], [0.54, POUCH, 'att'],
      [0.66, MAG_ALIGN, 'att'], [0.74, ON_MAG], [0.78, SLAP], [0.95, SUPPORT], [1, SUPPORT],
    ],
    rifleEmpty: [
      [0, SUPPORT], [0.1, OFF], [0.3, POUCH], [0.38, POUCH, 'att'], [0.52, MAG_ALIGN, 'att'], [0.62, ON_MAG], [0.66, SLAP],
      [0.76, CHARGE, 'pull'], [0.82, CHARGED], [0.86, CHARGE], [0.96, SUPPORT], [1, SUPPORT],
    ],
    pistol: [
      [0, SUPPORT], [0.1, OFF], [0.3, POUCH], [0.38, POUCH, 'att'], [0.54, MAG_ALIGN, 'att'], [0.64, ON_MAG], [0.68, SLAP],
      [0.8, SUPPORT], [1, SUPPORT],
    ],
    pistolEmpty: [
      [0, SUPPORT], [0.1, OFF], [0.3, POUCH], [0.38, POUCH, 'att'], [0.54, MAG_ALIGN, 'att'], [0.64, ON_MAG], [0.68, SLAP],
      [0.78, CHARGE, 'pull'], [0.85, CHARGED], [0.86, CHARGE], [0.97, SUPPORT], [1, SUPPORT],
    ],
  };
  // When the magazine leaves the gun on its own (dropped on an empty reload / always for pistols).
  const DROP = { rifleEmpty: 0.1, pistol: 0.08, pistolEmpty: 0.08 };
  const SEAT = { rifle: 0.74, rifleEmpty: 0.62, pistol: 0.64, pistolEmpty: 0.64 };

  // Right-hand bolt cycle for bolt-action rifles (0..1).
  let boltKeys = null;
  if (L.bolt) {
    const b = L.bolt;
    const B0 = pose(b.p, [0.2, 0.3, -1], [-1, 0.2, 0], { back: 0.04, lift: 0.02, curl: 1.15, thumb: 0.9 });
    const B1 = { ...B0, p: V(add(b.p, b.lift)) };
    const B2 = { ...B0, p: V(add(add(b.p, b.lift), b.pull)) };
    boltKeys = [[0, R_GRIP], [0.18, B0], [0.3, B1], [0.5, B2], [0.66, B1], [0.76, B0], [1, R_GRIP]];
  }

  // ---------------------------------------------------------------- evaluation
  const q = new THREE.Quaternion();
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), dA = new THREE.Vector3(), dB = new THREE.Vector3();
  const out = { p: new THREE.Vector3(), along: new THREE.Vector3(), palm: new THREE.Vector3(), back: 0, lift: 0, curl: 0, thumb: 0 };
  const worldOf = (P, v, target) => (P.cam ? target.copy(v) : g.localToWorld(target.copy(v)));
  const dirOf = (P, v, target) => (P.cam ? target.copy(v) : target.copy(v).applyQuaternion(q));
  function blend(a, b, s) {
    out.p.lerpVectors(worldOf(a, a.p, tA), worldOf(b, b.p, tB), s);
    out.along.lerpVectors(dirOf(a, a.along, dA), dirOf(b, b.along, dB), s).normalize();
    out.palm.lerpVectors(dirOf(a, a.palm, dA), dirOf(b, b.palm, dB), s).normalize();
    for (const k of ['back', 'lift', 'curl', 'thumb']) out[k] = a[k] + (b[k] - a[k]) * s;
    return out;
  }
  function sample(keys, t) {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, a, flag] = keys[i], [t1, b] = keys[i + 1];
    const s = smooth(Math.min(1, Math.max(0, (t - t0) / Math.max(1e-4, t1 - t0))));
    return { pose: blend(a, b, s), flag };
  }

  const w = new THREE.Vector3(), local = new THREE.Vector3();
  const poleR = new THREE.Vector3(), poleL = new THREE.Vector3();
  function place(H, upper, lower, P, pole, open = 0) {
    w.copy(P.p).addScaledVector(P.along, -P.back).addScaledVector(P.palm, -P.lift);
    solveIK(upper, lower, H.hand, w, pole, H.hinge);
    orientHand(H, P.along, P.palm);
    curlFingers(H, P.curl, P.thumb, 1, open);
  }
  const slideBase = gun.slide.position.clone();

  const restQ = L.hold ? holdQ(L.hold.ring, L.hold.claw) : null;

  // Karambit inspect, CS style: bring it up with the flat of the blade to the camera, roll the wrist to
  // look along the edge, then let it spin twice round the index finger through the ring and catch it.
  // Keys hold the fist position (camera space) and the knife orientation; the roll is supination about
  // the forearm, which at the display pose runs roughly along the claw direction.
  let knifeKeys = null, ringC = null;
  const spin = { angle: 0, open: 0 };
  const kp = new THREE.Vector3(), kq = new THREE.Quaternion(), kOff = new THREE.Vector3();
  if (L.knife) {
    g.updateMatrixWorld(true);
    const rb = new THREE.Box3();
    gun.root.traverse((o) => { if (o.isMesh && o.material.name === 'ring') rb.expandByObject(o); });
    ringC = g.worldToLocal(rb.getCenter(new THREE.Vector3()));
    const key = (p, ring, claw) => ({ p: V(p), q: holdQ(ring, claw) });
    const FOREARM = V([-0.45, 0.8, -0.4]).normalize();
    const rolled = (k, a, dp) => ({ p: k.p.clone().add(V(dp)), q: new THREE.Quaternion().setFromAxisAngle(FOREARM, a).multiply(k.q) });
    const IDLE = { p: hip.clone().add(V(grip).applyQuaternion(restQ)), q: restQ };
    const SHOW = key([0.06, -0.11, -0.39], [-0.89, -0.3, 0.31], [-0.35, 0.93, -0.1]);
    // Rolled over (supinated) the other flat and the fingers round the handle face the camera.
    const OVER = rolled(SHOW, 2.2, [0.06, 0.04, -0.01]);
    knifeKeys = [
      [0, IDLE], [0.12, SHOW], [0.2, rolled(SHOW, 0.12, [0.004, 0.006, 0])], [0.27, rolled(SHOW, 1.2, [-0.004, 0.01, 0.006])],
      [0.34, OVER], [0.42, rolled(OVER, 0.08, [0.004, -0.004, 0])], [0.52, SHOW], [0.76, rolled(SHOW, -0.08, [0, -0.008, 0])],
      [0.84, SHOW], [1, IDLE],
    ];
  }
  const SPIN = { from: 0.52, to: 0.72, turns: 2 };
  const X_AXIS = V([1, 0, 0]), sq = new THREE.Quaternion(), sv = new THREE.Vector3(), gripV = V(grip);

  // Pistol inspect: roll the gun about its barrel (forearm pronation/supination) with only a little yaw,
  // so the wrist stays straight. [t, x, y, z, rx, ry, rz] offsets; the support hand drops out of view.
  const PISTOL_KEYS = [
    [0, 0, 0, 0, 0, 0, 0], [0.16, -0.06, 0.035, 0.11, 0.1, 0.25, 0.25], [0.42, -0.07, 0.04, 0.12, 0.15, 0.35, 1.2],
    [0.52, -0.065, 0.035, 0.115, 0.1, 0.25, 0.35], [0.76, -0.06, 0.035, 0.11, 0.22, 0.15, -0.45], [1, 0, 0, 0, 0, 0, 0],
  ];
  const L_AWAY = pose([-0.24, -0.46, -0.3], [0.2, 0.6, -1], [1, 0.1, 0.1], { cam: true, curl: 0.9, thumb: 0.5 });
  let offHand = 0;

  return {
    group: g, arms: armsGroup, rig: arms, gun, mag, flash, sightY: gun.sightY, hip, ads, muzzle, eject: gun.eject, slide: gun.slide,
    pistol: !!L.pistol, restQ, inspectDur: L.knife ? 3.2 : L.pistol ? 2.6 : 2.4,
    // Turn the weapon over in front of the camera. `p` runs 0..1.
    inspectPose(p) {
      const raise = smooth(Math.min(1, p / 0.16)) * smooth(Math.min(1, (1 - p) / 0.18));
      if (knifeKeys) {
        const [[, a], [, b], s] = keyIndex(knifeKeys, p);
        kp.lerpVectors(a.p, b.p, s);
        kq.slerpQuaternions(a.q, b.q, s);
        const u = clamp01((p - SPIN.from) / (SPIN.to - SPIN.from));
        spin.angle = -smooth(u) * SPIN.turns * 2 * Math.PI;
        spin.open = smooth(clamp01((p - SPIN.from + 0.04) / 0.04)) * smooth(clamp01((SPIN.to + 0.05 - p) / 0.05));
        // A small flick of the wrist throws the knife into the spin.
        kp.y += 0.012 * Math.sin(u * Math.PI) - 0.006 * Math.sin(u * 2 * Math.PI);
        kOff.copy(kp).sub(hip).sub(sv.copy(gripV).applyQuaternion(kq));
        return { x: kOff.x, y: kOff.y, z: kOff.z, rx: 0, ry: 0, rz: 0, q: kq, pivot: null };
      }
      pivot.copy(gun.grip).multiplyScalar(raise);
      if (L.pistol) {
        const [a, b, s] = keyIndex(PISTOL_KEYS, p);
        const k = (i) => a[i] + (b[i] - a[i]) * s;
        offHand = smooth(clamp01(p / 0.12)) * smooth(clamp01((1 - p) / 0.14));
        return { x: k(1), y: k(2), z: k(3), rx: k(4), ry: k(5), rz: k(6), pivot };
      }
      const turn = Math.sin(Math.min(1, p) * Math.PI);
      if (id === 'm24') return { x: -0.04 * raise, y: 0.06 * raise, z: 0.02 * raise, rx: 0.3 * raise, ry: 0.85 * turn, rz: -0.4 * raise, pivot };
      if (id === 'negev') return { x: -0.03 * raise, y: 0.04 * raise, z: 0.02 * raise, rx: 0.28 * raise, ry: 0.65 * turn, rz: -0.3 * raise, pivot };
      return { x: -0.05 * raise, y: 0.07 * raise, z: 0.03 * raise, rx: 0.5 * raise, ry: 1.2 * turn, rz: -0.65 * raise, pivot };
    },
    // Gun motion during a reload (camera-space offsets added by the caller).
    reloadPose(p, empty) {
      const e = smooth(Math.min(1, p / 0.12)) * smooth(Math.min(1, (1 - p) / 0.14));
      const seat = SEAT[(L.pistol ? 'pistol' : 'rifle') + (empty ? 'Empty' : '')];
      const slapT = seat + 0.04, jolt = p > slapT ? Math.exp(-(p - slapT) * 60) * (p - slapT < 0.1 ? 1 : 0) : 0;
      // Rotations pivot about the magazine well so long stocks stay clear of the camera.
      pivot.copy(grabV).multiplyScalar(e);
      if (L.pistol) return { x: -0.06 * e, y: 0.02 * e + jolt * 0.01, z: 0.06 * e, rx: 0.3 * e - jolt * 0.05, ry: -0.1 * e, rz: -0.4 * e, pivot };
      const charging = empty && p > 0.7 ? smooth(Math.min(1, (p - 0.7) / 0.06)) * smooth(Math.min(1, (0.95 - p) / 0.06)) : 0;
      return {
        x: -0.07 * e, y: 0.07 * e + jolt * 0.012, z: -0.03 * e,
        rx: 0.38 * e - jolt * 0.04 - charging * 0.2, ry: charging * 0.15, rz: -0.6 * e + charging * 0.3, pivot,
      };
    },
    // Called each frame after the gun group has been posed. `reloadP` is 0..1 while reloading, else -1; `boltP` likewise.
    update(reloadP, kick, empty = false, dur = 2, boltP = -1) {
      const { B, HR, HL } = arms;
      poleR.set(0.9, -0.9, 0.4);
      poleL.set(L.pistol ? -0.6 : -0.9, -1.0, L.pistol ? 0.2 : -0.1);
      armsGroup.visible = g.visible;
      if (!g.visible) return;
      g.updateMatrixWorld(true);
      armsGroup.updateMatrixWorld(true);
      g.getWorldQuaternion(q);
      let rightP = R_GRIP;
      if (boltKeys) {
        const bp = boltP >= 0 ? boltP : reloadP > 0.78 ? (reloadP - 0.78) / 0.22 : -1;
        if (bp >= 0) rightP = sample(boltKeys, bp).pose;
      }
      place(HR, B.RightArm, B.RightForeArm, rightP === R_GRIP ? blend(R_GRIP, R_GRIP, 0) : rightP, poleR, spin.open);
      // The karambit turns on the index finger through its ring while the hand stays put.
      if (ringC) {
        sq.setFromAxisAngle(X_AXIS, spin.angle);
        gun.root.quaternion.copy(sq);
        gun.root.position.copy(ringC).sub(sv.copy(ringC).applyQuaternion(sq));
        spin.angle = spin.open = 0;
      }

      let slideZ = kick * 0.035;
      mag.position.copy(magBase);
      mag.rotation.set(0, 0, 0);
      mag.visible = true;
      let leftP;
      if (reloadP >= 0) {
        const kind = (L.pistol ? 'pistol' : 'rifle') + (empty ? 'Empty' : '');
        const r = sample(T[kind], reloadP);
        leftP = r.pose;
        const drop = DROP[kind];
        if (reloadP < SEAT[kind]) {
          if (r.flag === 'att') {
            g.worldToLocal(local.copy(leftP.p));
            mag.position.add(local.sub(grabV));
          } else if (drop != null && reloadP >= drop) {
            // The old magazine falls free; the gun frame is close enough to world space for half a second.
            const tau = (reloadP - drop) * dur;
            mag.position.y -= 4.9 * tau * tau;
            mag.position.z += tau * 0.15;
            mag.rotation.x = tau * 2.5;
            mag.visible = tau < 0.5;
          }
        }
        if (r.flag === 'pull' && L.pistol) {
          g.worldToLocal(local.copy(leftP.p));
          slideZ = Math.min(0.04, Math.max(0, local.z - CHARGE.p.z));
        }
      } else leftP = offHand > 0 ? blend(SUPPORT, L_AWAY, offHand) : blend(SUPPORT, SUPPORT, 0);
      offHand = 0;
      place(HL, B.LeftArm, B.LeftForeArm, leftP, poleL);
      if (gun.slide.children.length) gun.slide.position.set(slideBase.x, slideBase.y, slideBase.z + slideZ);
    },
  };
}
