import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { dropIdleMorphs, singlePassTransparent, mergeSkinned, mergeStatic } from './merge.js';

// Downloaded models (see assets/models/credits.json). Every gun is normalised to one frame:
// metres, muzzle toward -Z, +Y up, origin at the bounding-box centre. Points below are in that frame.
export const GUNS = {
  tavor: {
    file: 'tavor', rotY: 0, len: 0.83, hide: ['poly56_low_lambert1_0', 'poly8_low_lambert2_0'], reflex: { y: 0.128, z: 0.06, rail: 0.094 },
    grip: [0, -0.06, 0.055], fore: [0, -0.02, -0.15], muzzle: [0, 0.035, -0.412], sightY: 0.128, sightZ: 0.03, eject: 0.2,
    mag: { names: ['poly6_low_lambert2_0', 'poly13_low_lambert2_0'] },
  },
  m4: {
    file: 'm4', rotY: Math.PI, len: 0.84,
    grip: [0, -0.05, 0.15], fore: [0, -0.05, -0.135], muzzle: [0, 0.053, -0.417], sightY: 0.122, sightZ: 0.09, eject: 0.05,
    mag: { box: [[-0.05, -0.2, -0.045], [0.05, -0.03, 0.065]] },
  },
  akm: {
    file: 'akm', rotY: 0, len: 0.88, hide: ['Bend_AK_mat_0'],
    grip: [0, -0.03, 0.165], fore: [0, 0.055, -0.17], muzzle: [0, 0.08, -0.436], sightY: 0.1, sightZ: 0.1, eject: 0.03,
    mag: { names: ['mag_AK_mat_0'] },
  },
  m240: {
    file: 'm240', rotY: -Math.PI / 2, len: 1.24,
    grip: [0, -0.03, 0.29], fore: [0, 0.057, -0.165], muzzle: [0, 0.114, -0.61], sightY: 0.172, sightZ: 0.1, eject: 0.1,
    mag: { names: ['bullet001_bullet_0'] },
  },
  m24: {
    file: 'm24', rotY: Math.PI, len: 1.09, hideBox: [
      [[-0.1, 0.083, -0.05], [0.1, 0.2, 0.05]], [[-0.1, 0.083, 0.23], [0.1, 0.2, 0.33]],
      [[-0.1, 0.045, -0.06], [-0.027, 0.2, 0.03]], [[0.027, 0.045, -0.06], [0.1, 0.2, 0.03]],
    ],
    grip: [0, -0.03, 0.21], fore: [0, -0.02, -0.15], muzzle: [0, 0.018, -0.545], sightY: 0.075, sightZ: 0.27, eject: 0.12,
    mag: { box: [[-0.04, -0.1, 0.12], [0.04, -0.035, 0.19]] },
  },
  sniper: {
    file: 'sniper', rotY: Math.PI, len: 1.22,
    grip: [0, -0.045, 0.24], fore: [0, -0.02, -0.22], muzzle: [0, 0.04, -0.6], sightY: 0.1, sightZ: 0.18, eject: 0.14,
    mag: { names: ['mag', 'mag_sniper_0'] },
  },
  g28: {
    file: 'g28', rotY: Math.PI / 2, len: 1.08,
    grip: [0, -0.04, 0.2], fore: [0, -0.015, -0.18], muzzle: [0, 0.045, -0.52], sightY: 0.11, sightZ: 0.16, eject: 0.1,
    mag: { names: ['Mag_1', 'Object_6'] },
  },
  rpg: {
    file: 'rpg', rotY: Math.PI / 2, len: 1.2,
    grip: [0, -0.06, -0.16], fore: [0, -0.04, -0.28], muzzle: [0, 0, -0.6], sightY: 0.07, eject: 0,
    mag: { names: ['defaultMaterial'] },
  },
  glock: {
    file: 'glock', rotY: -Math.PI / 2, len: 0.186,
    grip: [0, -0.03, 0.06], fore: [0, -0.03, 0.06], muzzle: [0, 0.05, -0.093], sightY: 0.062, sightZ: 0.085, eject: 0,
    slideBox: [[-0.02, 0.03, -0.1], [0.02, 0.08, 0.1]],
    mag: { box: [[-0.02, -0.2, 0.02], [0.02, -0.05, 0.12]] },
  },
  // Already in metres and standing up (see tools/obj2glb.mjs): ring on top, claw curving to -Z.
  karambit: {
    file: 'karambit', rotY: 0, scale: 1,
    grip: [0, 0.041, 0.035], fore: [0, 0.041, 0.035], muzzle: [0, -0.1, -0.048], sightY: 0, eject: 0,
  },
  jericho: {
    file: 'jericho', rotY: Math.PI / 2, len: 0.207,
    grip: [0, -0.03, 0.065], fore: [0, -0.03, 0.065], muzzle: [0, 0.055, -0.102], sightY: 0.066, sightZ: 0.09, eject: 0,
    slide: ['jericho_0'],
    mag: { box: [[-0.02, -0.2, 0.02], [0.02, -0.045, 0.12]] },
  },
};

export const PROPS = {
  merkava: { file: 'merkava', rotY: 0, len: 9.04, ground: true },
  shekem: { file: 'shekem', rotY: Math.PI, longest: 2.7, ground: true },
  pickup: { file: 'pickup', rotY: Math.PI, len: 5.3, ground: true },
  m67: { file: 'm67', rotY: 0, scale: 1, keep: /^m67_(base|spoon|striker|ring|safety_pin)_m/ },
};

export const CHARACTERS = ['militant', 'operator'];

export const models = {};

export function loadModels(manager, base = '', only = null) {
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const files = new Set([...Object.values(GUNS).map((g) => g.file), ...Object.values(PROPS).map((p) => p.file), ...CHARACTERS]);
  for (const f of files) {
    if (only && !only.includes(f)) continue;
    loader.load(`${base}assets/models/${f}.glb`, (g) => {
      if (CHARACTERS.includes(f)) {
        dropIdleMorphs(g.scene);
        singlePassTransparent(g.scene);
        mergeSkinned(g.scene);
      }
      models[f] = g;
    });
  }
}

// Moves triangles whose centroid lies inside `box` (normalised-frame coords) into separate meshes.
function splitByBox(root, box, frameInv) {
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry.index ? m.geometry : m.geometry.clone().setIndex([...Array(m.geometry.attributes.position.count).keys()]);
    const idx = g.index.array, pos = g.attributes.position;
    const toFrame = new THREE.Matrix4().multiplyMatrices(frameInv, m.matrixWorld);
    const keep = [], take = [];
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
      a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(toFrame);
      (box.containsPoint(a) ? take : keep).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    if (!take.length) continue;
    const g1 = g.clone(); g1.setIndex(keep);
    const g2 = g.clone(); g2.setIndex(take);
    m.geometry = g1;
    const part = new THREE.Mesh(g2, m.material);
    part.name = m.name + '_split';
    m.add(part);
    out.push(part);
  }
  return out;
}

const templates = {};

function prepGun(id) {
  const cfg = GUNS[id];
  const src = models[cfg.file].scene.clone(true);
  const inner = new THREE.Group();
  inner.add(src);
  inner.rotation.y = cfg.rotY;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  const s = cfg.scale ?? cfg.len / size.z;
  inner.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  inner.position.set(-center.x, -center.y, -center.z);
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  const hideSet = new Set(cfg.hide || []);
  src.traverse((o) => {
    if (hideSet.has(o.name)) o.visible = false;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  const frameInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toBox = (b) => new THREE.Box3(new THREE.Vector3(...b[0]), new THREE.Vector3(...b[1]));
  for (const b of cfg.hideBox || []) splitByBox(src, toBox(b), frameInv).forEach((o) => o.removeFromParent());
  let mag = [];
  if (cfg.mag?.names) src.traverse((o) => { if (cfg.mag.names.includes(o.name)) mag.push(o); });
  if (cfg.mag?.box) mag = splitByBox(src, toBox(cfg.mag.box), frameInv);
  let slide = [];
  if (cfg.slide) src.traverse((o) => { if (cfg.slide.includes(o.name)) slide.push(o); });
  if (cfg.slideBox) slide = splitByBox(src, toBox(cfg.slideBox), frameInv);
  // Re-parent mag/slide parts under pivot groups living in the gun frame so they can be animated simply.
  const pivot = (parts) => {
    const p = new THREE.Group();
    p.name = 'pivot';
    root.add(p);
    for (const o of parts) p.attach(o);
    return p;
  };
  const magG = pivot(mag), slideG = pivot(slide);
  // One mesh per material for the body and for each moving part (the models come as dozens of pieces).
  mergeStatic(inner, root);
  mergeStatic(magG);
  mergeStatic(slideG);
  templates[id] = { root, size: size.multiplyScalar(s), magIdx: root.children.indexOf(magG), slideIdx: root.children.indexOf(slideG) };
}

// Returns a new instance of a normalised gun.
export function makeGun(id) {
  if (!templates[id]) prepGun(id);
  const t = templates[id], cfg = GUNS[id];
  const root = t.root.clone(true);
  const V = (a) => new THREE.Vector3(...a);
  return {
    root, cfg, size: t.size.clone(),
    mag: root.children[t.magIdx], slide: root.children[t.slideIdx],
    grip: V(cfg.grip), fore: V(cfg.fore), muzzle: V(cfg.muzzle), sightY: cfg.sightY, eject: cfg.eject,
  };
}

const propTemplates = {};
export function makeProp(id) {
  if (!propTemplates[id]) {
    const cfg = PROPS[id];
    const src = models[cfg.file].scene.clone(true);
    if (cfg.keep) {
      const drop = [];
      src.traverse((o) => { if (o.isMesh && !cfg.keep.test(o.name)) drop.push(o); });
      drop.forEach((o) => o.removeFromParent());
    }
    const inner = new THREE.Group();
    inner.add(src);
    inner.rotation.y = cfg.rotY;
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner, true);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const s = cfg.scale ?? (cfg.longest ? cfg.longest / longest : cfg.len / size.z);
    inner.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    inner.position.set(-c.x, cfg.ground ? -box.min.y * s : -c.y, -c.z);
    src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const root = new THREE.Group();
    root.add(inner);
    propTemplates[id] = { root, size: size.multiplyScalar(s) };
  }
  const t = propTemplates[id];
  return { root: t.root.clone(true), size: t.size.clone() };
}
