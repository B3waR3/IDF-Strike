import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { TEX } from './effects.js';
import { models, makeGun } from './models.js';
import { ccBones, solveIK, analyzeHand, orientHand, curlFingers } from './rig.js';

const GUN_FOR = { tavor: 'tavor', m4: 'm4', negev: 'm240', m24: 'm24', glock: 'glock', jericho: 'jericho' };
// Camera-space placement. `eye` is how far behind the rear sight the eye sits; `hip` is the offset from ADS.
const LAYOUT = {
  tavor: { eye: 0.3, hip: [0.13, -0.042, -0.12], lAlong: [0.55, 0.15, -0.8] },
  m4: { eye: 0.24, hip: [0.13, -0.045, -0.1], lAlong: [0, -0.3, -1], lPalm: [1, 0, 0] },
  negev: { eye: 0.26, hip: [0.14, -0.05, -0.08], lAlong: [0.55, 0.15, -0.8] },
  m24: { eye: 0.06, hip: [0.13, -0.045, -0.06], lAlong: [0.55, 0.15, -0.8] },
  glock: { eye: 0.38, hip: [0.12, -0.06, -0.02], pistol: true },
  jericho: { eye: 0.38, hip: [0.12, -0.06, -0.02], pistol: true },
};

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
function buildArms() {
  const model = SkeletonUtils.clone(models.operator.scene);
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
  wrap.updateMatrixWorld(true);
  const HR = analyzeHand(B, 'R'), HL = analyzeHand(B, 'L');
  const head = B.Head.getWorldPosition(new THREE.Vector3());
  // Shoulders sit slightly ahead of the eye and the arms are a touch long: standard viewmodel cheats for reach.
  wrap.scale.setScalar(1.08);
  wrap.position.set(-head.x * 1.08, -head.y * 1.08 - 0.1, -head.z * 1.08 - 0.1);
  return { wrap, B, HR, HL };
}

const V = (a) => new THREE.Vector3(...a);

export function buildViewModel(id, root) {
  const L = LAYOUT[id];
  const gun = makeGun(GUN_FOR[id]);
  const g = new THREE.Group();
  g.add(gun.root);
  if (gun.cfg.reflex) reflexSight(g, gun.cfg.reflex);
  const mag = gun.mag;
  mag.userData.base = mag.position.clone();
  const muzzle = gun.muzzle.clone();
  const flash = flashGroup(g, muzzle, L.pistol ? 0.6 : id === 'negev' || id === 'm24' ? 1.3 : 1);
  gun.root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });

  // ADS: sight line on the camera axis, rear of the optic `eye` metres in front of the eye.
  const ads = new THREE.Vector3(0, -gun.sightY, -L.eye - (gun.cfg.sightZ ?? 0));
  const hip = ads.clone().add(V(L.hip));

  const arms = buildArms();
  const armsGroup = new THREE.Group();
  armsGroup.add(arms.wrap);
  g.visible = false;
  armsGroup.visible = false;
  root.add(g, armsGroup);

  curlFingers(arms.HR, 1.25, 0.9);
  curlFingers(arms.HL, L.pistol ? 1.2 : 0.95, 0.6);

  const w = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
  const along = new THREE.Vector3(), palm = new THREE.Vector3(), poleR = new THREE.Vector3(), poleL = new THREE.Vector3();
  const q = new THREE.Quaternion(), magBox = new THREE.Box3();
  const lAlong = V(L.lAlong || [0.3, 0.2, -1]).normalize(), lPalm = V(L.lPalm || [0, 1, 0]);
  const slideBase = gun.slide.position.clone();

  function place(H, B, upper, lower, target, alongW, palmW, pole, back = 0.055, lift = 0.03) {
    w.copy(target).addScaledVector(alongW, -back).addScaledVector(palmW, -lift);
    solveIK(upper, lower, H.hand, w, pole);
    orientHand(H, alongW, palmW);
  }

  return {
    group: g, arms: armsGroup, mag, flash, sightY: gun.sightY, hip, ads, muzzle, eject: gun.eject, slide: gun.slide,
    // Called each frame after the gun group has been posed. `reloadP` is 0..1 while reloading, else -1.
    update(reloadP, kick) {
      armsGroup.visible = g.visible;
      if (!g.visible) return;
      if (gun.slide.children.length) gun.slide.position.set(slideBase.x, slideBase.y, slideBase.z + kick * 0.035);
      g.updateMatrixWorld(true);
      armsGroup.updateMatrixWorld(true);
      g.getWorldQuaternion(q);
      fwd.set(0, 0, -1).applyQuaternion(q);
      up.set(0, 1, 0).applyQuaternion(q);
      right.set(1, 0, 0).applyQuaternion(q);
      const { B, HR, HL } = arms;
      poleR.set(0.9, -0.9, 0.4);
      poleL.set(L.pistol ? -0.6 : -0.9, -1.0, L.pistol ? 0.2 : -0.1);

      g.localToWorld(tmp.copy(gun.grip));
      along.copy(fwd).addScaledVector(up, 0.25).normalize();
      palm.copy(right).negate();
      place(HR, B, B.RightArm, B.RightForeArm, tmp, along, palm, poleR, 0.06, 0.028);

      if (L.pistol) {
        g.localToWorld(tmp.copy(gun.grip).add(V([-0.022, -0.012, 0.005])));
        along.copy(fwd).addScaledVector(right, 0.35).addScaledVector(up, 0.1).normalize();
        palm.copy(right).addScaledVector(up, 0.5).normalize();
        place(HL, B, B.LeftArm, B.LeftForeArm, tmp, along, palm, poleL, 0.05, 0.03);
      } else {
        const onMag = reloadP > 0.08 && reloadP < 0.8;
        if (onMag) {
          magBox.setFromObject(gun.mag).getCenter(tmp).addScaledVector(up, -0.03);
          along.copy(fwd).addScaledVector(up, 0.4).normalize();
          palm.copy(right);
        } else {
          g.localToWorld(tmp.copy(gun.fore));
          along.copy(lAlong).applyQuaternion(q);
          palm.copy(lPalm).applyQuaternion(q);
        }
        place(HL, B, B.LeftArm, B.LeftForeArm, tmp, along, palm, poleL, 0.05, onMag ? 0.035 : 0.03);
      }
    },
  };
}
