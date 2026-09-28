import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assets } from './assets.js';
import { TEX } from './effects.js';

let VM = null;
function materials() {
  const metalN = assets.tex.metal_plate.normalMap;
  const fab = assets.tex.denim_fabric.normalMap;
  const leather = assets.tex.hessian_230.normalMap;
  VM = {
    black: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.42, metalness: 0.75, normalMap: metalN, normalScale: new THREE.Vector2(0.12, 0.12) }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x2c2c2b, roughness: 0.6, metalness: 0.05 }),
    polymerDark: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7, metalness: 0.05 }),
    pmag: new THREE.MeshStandardMaterial({ color: 0x222120, roughness: 0.75, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3c3d40, roughness: 0.28, metalness: 1 }),
    parkerized: new THREE.MeshStandardMaterial({ color: 0x262728, roughness: 0.5, metalness: 0.9 }),
    stockGreen: new THREE.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.55, metalness: 0.05 }),
    pouch: new THREE.MeshStandardMaterial({ color: 0x4a5034, roughness: 0.95, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(1.5, 1.5) }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x565d40, roughness: 0.95, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(1.2, 1.2) }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x4c5238, roughness: 0.95, metalness: 0, normalMap: fab }),
    glove: new THREE.MeshStandardMaterial({ color: 0x5b4c3a, roughness: 0.8, metalness: 0, normalMap: leather, normalScale: new THREE.Vector2(0.6, 0.6) }),
    knuckle: new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.05 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 0.15 }),
    coated: new THREE.MeshStandardMaterial({ color: 0x223355, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }),
    flash: new THREE.MeshBasicMaterial({ map: TEX.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rb(g, w, h, d, r, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const me = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005)), m);
  me.position.set(x, y, z);
  me.rotation.set(rx, ry, rz);
  g.add(me);
  return me;
}
function cyl(g, r, len, m, x, y, z, axis = 'z', open = false, seg = 16, r2 = r) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg, 1, open), m);
  if (axis === 'z') me.rotation.x = Math.PI / 2;
  else if (axis === 'x') me.rotation.z = Math.PI / 2;
  me.position.set(x, y, z);
  g.add(me);
  return me;
}
function rail(g, len, x, y, z) {
  rb(g, 0.022, 0.008, len, 0.002, VM.black, x, y, z);
  const n = Math.floor(len / 0.01);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.024, 0.006, 0.005), VM.black, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation(x, y + 0.006, z - len / 2 + (i + 0.5) * (len / n)); im.setMatrixAt(i, m); }
  g.add(im);
}
function stanag(g, m, x, y, z, rx = -0.12) {
  const s = new THREE.Shape();
  s.moveTo(-0.034, 0); s.lineTo(0.034, 0);
  s.quadraticCurveTo(0.036, -0.1, 0.048, -0.2);
  s.lineTo(-0.024, -0.205);
  s.quadraticCurveTo(-0.034, -0.1, -0.034, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 })
    .translate(0, 0, -0.012).rotateY(Math.PI / 2);
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.rotation.x = rx;
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.014, 0.08, 2, 0.004), m);
  base.position.set(0, -0.205, 0.015);
  me.add(base);
  g.add(me);
  return me;
}

function addHands(g, rHand, lHand, rElbow, lElbow, pistol = false) {
  const limb = (a, b, r1, r2, m) => {
    const len = a.distanceTo(b);
    const me = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 12), m);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.add(me);
    return me;
  };
  const rShoulder = V(rHand.x + 0.16, rHand.y - 0.26, 0.6);
  const lShoulder = V(-0.28, lHand.y - 0.3, 0.5);
  const rWrist = rHand.clone().add(V(0.012, -0.03, 0.06));
  const lWrist = lHand.clone().add(V(-0.03, -0.035, 0.05));
  limb(rWrist, rElbow, 0.034, 0.042, VM.sleeve);
  limb(rElbow, rShoulder, 0.046, 0.055, VM.sleeve);
  limb(lWrist, lElbow, 0.034, 0.042, VM.sleeve);
  limb(lElbow, lShoulder, 0.046, 0.055, VM.sleeve);
  limb(rWrist.clone().add(V(0, -0.006, 0.01)), rWrist.clone().add(V(0.004, -0.012, 0.05)), 0.04, 0.04, VM.cuff);
  limb(lWrist.clone().add(V(0, -0.006, 0.01)), lWrist.clone().add(V(-0.004, -0.012, 0.05)), 0.04, 0.04, VM.cuff);

  rb(g, 0.05, 0.075, 0.085, 0.02, VM.glove, rHand.x + 0.02, rHand.y, rHand.z + 0.02, 0.2, 0, 0);
  for (let i = 0; i < 4; i++) rb(g, 0.056, 0.019, 0.026, 0.008, VM.glove, rHand.x - 0.004, rHand.y + 0.022 - i * 0.021, rHand.z - 0.03, 0.2, 0, 0);
  rb(g, 0.02, 0.02, 0.055, 0.008, VM.glove, rHand.x + 0.03, rHand.y + 0.035, rHand.z - 0.005, 0.3, -0.4, 0);
  rb(g, 0.012, 0.03, 0.06, 0.004, VM.knuckle, rHand.x + 0.029, rHand.y, rHand.z + 0.015, 0.2, 0, 0);

  if (pistol) {
    rb(g, 0.05, 0.07, 0.08, 0.02, VM.glove, lHand.x - 0.02, lHand.y, lHand.z + 0.01, 0.25, 0, 0);
    for (let i = 0; i < 4; i++) rb(g, 0.05, 0.018, 0.024, 0.008, VM.glove, lHand.x + 0.004, lHand.y + 0.018 - i * 0.02, lHand.z - 0.035, 0.25, 0, 0);
  } else {
    rb(g, 0.075, 0.035, 0.09, 0.015, VM.glove, lHand.x - 0.004, lHand.y - 0.03, lHand.z, 0, 0, 0.15);
    for (let i = 0; i < 4; i++) rb(g, 0.02, 0.05, 0.02, 0.008, VM.glove, lHand.x + 0.03, lHand.y - 0.005, lHand.z - 0.03 + i * 0.022, 0, 0, -0.25);
    rb(g, 0.02, 0.04, 0.05, 0.008, VM.glove, lHand.x - 0.035, lHand.y + 0.005, lHand.z - 0.02, 0, 0.2, 0.3);
  }
}

function flashGroup(g, z, y, scale = 1) {
  const f = new THREE.Group();
  const s = 0.2 * scale;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(s, s), VM.flash);
  const side1 = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.9, s * 1.8), VM.flash);
  side1.rotation.set(Math.PI / 2, 0, 0);
  side1.position.z = -s * 0.6;
  const side2 = side1.clone();
  side2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  f.add(front, side1, side2);
  f.position.set(0, y, z);
  f.visible = false;
  g.add(f);
  return f;
}

function reflexM21(g, y, z) {
  rb(g, 0.045, 0.03, 0.085, 0.006, VM.black, 0, y - 0.034, z + 0.005);
  const hood = cyl(g, 0.027, 0.055, VM.black, 0, y, z, 'z', true, 20);
  hood.geometry = new THREE.CylinderGeometry(0.027, 0.027, 0.055, 20, 1, true, -Math.PI / 2, Math.PI);
  hood.material = VM.black.clone(); hood.material.side = THREE.DoubleSide;
  rb(g, 0.012, 0.022, 0.02, 0.003, VM.black, 0.028, y - 0.012, z + 0.015);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), VM.lens); lens.position.set(0, y, z - 0.02); g.add(lens);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 8), VM.dot); dot.position.set(0, y, z - 0.021); g.add(dot);
}
function tubeSight(g, r, len, y, z, mount = true) {
  const t = cyl(g, r, len, VM.black, 0, y, z, 'z', true, 24);
  t.material = VM.black.clone(); t.material.side = THREE.DoubleSide;
  if (mount) {
    const h = y - r - 0.094;
    rb(g, 0.028, h, 0.05, 0.004, VM.black, 0, 0.094 + h / 2, z);
  }
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 20), VM.lens); lens.position.set(0, y, z - len / 2 + 0.002); g.add(lens);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 8), VM.dot); dot.position.set(0, y, z - len / 2); g.add(dot);
}

export function buildViewModel(id, root) {
  if (!VM) materials();
  const g = new THREE.Group();
  let mag, flash, sightY, hip, ads, muzzleZ, eject;
  if (id === 'tavor') {
    rb(g, 0.068, 0.115, 0.56, 0.016, VM.polymer, 0, -0.005, 0.1);
    rb(g, 0.058, 0.05, 0.44, 0.012, VM.polymer, 0, 0.07, 0.03);
    rb(g, 0.072, 0.155, 0.03, 0.01, VM.polymerDark, 0, -0.005, 0.39);
    rb(g, 0.062, 0.04, 0.2, 0.012, VM.polymerDark, 0, 0.078, 0.25);
    rb(g, 0.034, 0.12, 0.055, 0.012, VM.polymer, 0, -0.11, -0.04, 0.18);
    rb(g, 0.03, 0.018, 0.17, 0.006, VM.polymer, 0, -0.178, -0.075);
    rb(g, 0.03, 0.12, 0.02, 0.006, VM.polymer, 0, -0.12, -0.155);
    rb(g, 0.064, 0.085, 0.2, 0.013, VM.polymer, 0, 0.0, -0.27);
    rb(g, 0.01, 0.02, 0.06, 0.003, VM.black, -0.037, 0.045, -0.15);
    rb(g, 0.004, 0.022, 0.07, 0.002, VM.polymerDark, 0.035, 0.02, 0.21);
    cyl(g, 0.011, 0.22, VM.parkerized, 0, 0.02, -0.46);
    cyl(g, 0.015, 0.06, VM.parkerized, 0, 0.02, -0.59, 'z', false, 12);
    rail(g, 0.34, 0, 0.098, -0.04);
    mag = stanag(g, VM.pmag, 0, -0.06, 0.16, -0.1);
    sightY = 0.145;
    reflexM21(g, sightY, -0.07);
    muzzleZ = -0.63;
    eject = 0.1;
    addHands(g, V(0, -0.1, -0.03), V(0, -0.05, -0.28), V(0.09, -0.24, 0.2), V(-0.17, -0.2, -0.1));
    hip = V(0.2, -0.205, -0.43); ads = V(0, -sightY, -0.3);
  } else if (id === 'm4') {
    rb(g, 0.05, 0.07, 0.2, 0.008, VM.black, 0, -0.005, 0.02);
    rb(g, 0.054, 0.065, 0.08, 0.008, VM.black, 0, -0.05, -0.07);
    rb(g, 0.055, 0.06, 0.25, 0.008, VM.black, 0, 0.055, 0.0);
    cyl(g, 0.008, 0.02, VM.black, 0.034, 0.055, 0.06, 'x');
    rb(g, 0.004, 0.022, 0.06, 0.002, VM.polymerDark, 0.029, 0.05, 0.02);
    cyl(g, 0.016, 0.2, VM.black, 0, 0.045, 0.21);
    rb(g, 0.048, 0.1, 0.16, 0.014, VM.polymer, 0, 0.022, 0.3);
    rb(g, 0.05, 0.12, 0.025, 0.008, VM.polymerDark, 0, 0.01, 0.385);
    rb(g, 0.06, 0.065, 0.3, 0.01, VM.black, 0, 0.05, -0.28);
    for (const s of [-1, 1]) rb(g, 0.006, 0.02, 0.28, 0.002, VM.black, s * 0.032, 0.05, -0.28);
    cyl(g, 0.01, 0.2, VM.parkerized, 0, 0.05, -0.53);
    cyl(g, 0.013, 0.055, VM.parkerized, 0, 0.05, -0.655, 'z', false, 12);
    rb(g, 0.034, 0.11, 0.05, 0.012, VM.polymer, 0, -0.078, 0.07, 0.35);
    rb(g, 0.012, 0.03, 0.05, 0.003, VM.black, 0, -0.035, 0.005);
    rb(g, 0.04, 0.012, 0.03, 0.003, VM.black, 0, 0.09, 0.12);
    rail(g, 0.58, 0, 0.088, -0.14);
    mag = stanag(g, VM.pmag, 0, -0.07, -0.07, -0.15);
    sightY = 0.13;
    tubeSight(g, 0.019, 0.075, sightY, -0.03);
    muzzleZ = -0.69;
    eject = 0.02;
    addHands(g, V(0, -0.075, 0.065), V(0, 0.01, -0.34), V(0.09, -0.22, 0.28), V(-0.17, -0.14, -0.12));
    hip = V(0.2, -0.2, -0.43); ads = V(0, -sightY, -0.3);
  } else if (id === 'negev') {
    rb(g, 0.08, 0.115, 0.42, 0.012, VM.black, 0, 0.03, -0.04);
    rb(g, 0.086, 0.04, 0.22, 0.01, VM.black, 0, 0.1, 0.05);
    rb(g, 0.045, 0.11, 0.26, 0.012, VM.polymer, 0, 0.0, 0.3);
    rb(g, 0.05, 0.13, 0.025, 0.008, VM.polymerDark, 0, -0.005, 0.43);
    rb(g, 0.078, 0.07, 0.2, 0.012, VM.polymer, 0, 0.02, -0.33);
    cyl(g, 0.018, 0.5, VM.parkerized, 0, 0.04, -0.55);
    for (let i = 0; i < 6; i++) cyl(g, 0.02, 0.012, VM.black, 0, 0.04, -0.46 - i * 0.06, 'z', false, 14);
    cyl(g, 0.022, 0.08, VM.parkerized, 0, 0.04, -0.84, 'z', false, 12);
    rb(g, 0.018, 0.05, 0.14, 0.006, VM.black, 0, 0.13, -0.3);
    cyl(g, 0.007, 0.36, VM.parkerized, 0.018, -0.01, -0.56); cyl(g, 0.007, 0.36, VM.parkerized, -0.018, -0.01, -0.56);
    rb(g, 0.04, 0.12, 0.055, 0.012, VM.polymer, 0, -0.1, 0.1, 0.25);
    mag = rb(g, 0.1, 0.12, 0.13, 0.03, VM.pouch, -0.085, -0.12, -0.06);
    for (let i = 0; i < 5; i++) {
      const b = cyl(g, 0.0055, 0.07, VM.brass, -0.035 - i * 0.01, 0.015 - i * 0.012, -0.06, 'x', false, 8);
      b.rotation.set(0, 0, Math.PI / 2 + 0.3);
    }
    rail(g, 0.2, 0, 0.125, -0.01);
    sightY = 0.165;
    tubeSight(g, 0.022, 0.14, sightY, -0.02, false);
    rb(g, 0.03, 0.014, 0.08, 0.004, VM.black, 0, 0.135, -0.02);
    cyl(g, 0.028, 0.035, VM.black, 0, sightY, -0.1, 'z', true, 20).material = Object.assign(VM.black.clone(), { side: THREE.DoubleSide });
    muzzleZ = -0.89;
    eject = 0.0;
    addHands(g, V(0, -0.08, 0.1), V(0, -0.02, -0.35), V(0.09, -0.22, 0.32), V(-0.17, -0.16, -0.14));
    hip = V(0.21, -0.225, -0.46); ads = V(0, -sightY, -0.34);
  } else if (id === 'm24') {
    const s = new THREE.Shape();
    s.moveTo(0.46, -0.11); s.lineTo(0.46, 0.05); s.lineTo(0.2, 0.045); s.lineTo(0.12, 0.02);
    s.quadraticCurveTo(0.09, -0.03, 0.05, 0.02); s.lineTo(-0.52, 0.02); s.lineTo(-0.52, -0.035);
    s.lineTo(0.0, -0.045); s.lineTo(0.08, -0.12); s.lineTo(0.13, -0.12); s.quadraticCurveTo(0.16, -0.05, 0.22, -0.05); s.lineTo(0.46, -0.11);
    const stock = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 }).translate(0, 0, -0.025).rotateY(-Math.PI / 2), VM.stockGreen);
    g.add(stock);
    rb(g, 0.056, 0.1, 0.022, 0.008, VM.polymerDark, 0, -0.03, 0.47);
    cyl(g, 0.02, 0.24, VM.parkerized, 0, 0.055, -0.02);
    cyl(g, 0.006, 0.05, VM.steel, 0.03, 0.055, 0.07, 'x');
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), VM.steel); knob.position.set(0.058, 0.055, 0.07); g.add(knob);
    cyl(g, 0.014, 0.62, VM.parkerized, 0, 0.055, -0.55, 'z', false, 16, 0.011);
    mag = rb(g, 0.035, 0.012, 0.08, 0.003, VM.steel, 0, -0.05, -0.02);
    sightY = 0.125;
    const tube = cyl(g, 0.017, 0.3, VM.black, 0, sightY, -0.03, 'z', true, 24); tube.material = Object.assign(VM.black.clone(), { side: THREE.DoubleSide });
    const obj = cyl(g, 0.028, 0.08, VM.black, 0, sightY, -0.22, 'z', true, 24, 0.018); obj.material = tube.material;
    const oc = cyl(g, 0.02, 0.07, VM.black, 0, sightY, 0.15, 'z', true, 24, 0.017); oc.material = tube.material;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), VM.coated); lens.position.set(0, sightY, -0.259); lens.rotation.y = Math.PI; g.add(lens);
    cyl(g, 0.011, 0.028, VM.black, 0, sightY + 0.03, -0.03, 'y');
    cyl(g, 0.011, 0.028, VM.black, 0.03, sightY, -0.03, 'x');
    for (const z of [-0.1, 0.05]) rb(g, 0.04, 0.05, 0.02, 0.005, VM.black, 0, 0.095, z);
    muzzleZ = -0.86;
    eject = 0.05;
    addHands(g, V(0, -0.06, 0.13), V(0, -0.025, -0.3), V(0.09, -0.21, 0.35), V(-0.17, -0.15, -0.1));
    hip = V(0.2, -0.2, -0.43); ads = V(0, -sightY, -0.3);
  } else {
    const jer = id === 'jericho';
    const slideM = jer ? VM.steel : VM.black;
    const L = jer ? 0.2 : 0.186;
    rb(g, 0.028, 0.034, L, 0.004, slideM, 0, 0.032, -0.06);
    for (let i = 0; i < 7; i++) rb(g, 0.029, 0.026, 0.0025, 0.0008, VM.polymerDark, 0, 0.034, 0.01 + i * 0.004);
    rb(g, 0.027, 0.024, 0.16, 0.005, jer ? VM.parkerized : VM.polymer, 0, 0.006, -0.05);
    rb(g, 0.029, 0.11, 0.05, 0.009, jer ? VM.polymerDark : VM.polymer, 0, -0.06, 0.012, 0.28);
    rb(g, 0.012, 0.02, 0.05, 0.004, jer ? VM.parkerized : VM.polymer, 0, -0.018, -0.035);
    mag = rb(g, 0.027, 0.015, 0.048, 0.004, VM.polymerDark, 0, -0.12, 0.028, 0.28);
    rb(g, 0.004, 0.009, 0.005, 0.001, VM.steel, 0, 0.053, -0.145);
    rb(g, 0.008, 0.009, 0.006, 0.001, VM.steel, -0.008, 0.053, 0.025);
    rb(g, 0.008, 0.009, 0.006, 0.001, VM.steel, 0.008, 0.053, 0.025);
    cyl(g, 0.006, 0.01, VM.polymerDark, 0, 0.03, -0.153);
    sightY = 0.054;
    muzzleZ = -0.16;
    eject = 0.0;
    addHands(g, V(0, -0.055, 0.02), V(-0.02, -0.07, 0.005), V(0.09, -0.2, 0.26), V(-0.15, -0.2, 0.22), true);
    hip = V(0.16, -0.17, -0.36); ads = V(0, -sightY, -0.32);
  }
  const flashY = id === 'm4' ? 0.05 : id === 'negev' ? 0.04 : id === 'm24' ? 0.055 : id === 'tavor' ? 0.02 : 0.03;
  flash = flashGroup(g, muzzleZ - 0.02, flashY, id === 'glock' || id === 'jericho' ? 0.6 : id === 'negev' || id === 'm24' ? 1.3 : 1);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  mag.userData.base = mag.position.clone();
  g.visible = false;
  root.add(g);
  return { group: g, mag, flash, sightY, hip, ads, muzzle: new THREE.Vector3(0, flashY, muzzleZ), eject };
}
