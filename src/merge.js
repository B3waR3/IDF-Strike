// Draw-call reduction for imported models. Sketchfab exports arrive as many small meshes (a rifle is ~70
// parts, a soldier ~23 skinned pieces) that share a handful of materials; each mesh costs a draw call in
// the colour, shadow and ambient-occlusion passes. These helpers collapse them to one mesh per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GET = ['getX', 'getY', 'getZ', 'getW'];
// Float32, non-interleaved copy (glTF quantised attributes can be neither transformed nor merged).
function floatGeometry(src, names) {
  const g = new THREE.BufferGeometry();
  for (const name of names) {
    const a = src.attributes[name], n = a.count, k = a.itemSize;
    const arr = name === 'skinIndex' ? new Uint16Array(n * k) : new Float32Array(n * k);
    for (let c = 0; c < k; c++) { const get = a[GET[c]]; for (let i = 0; i < n; i++) arr[i * k + c] = get.call(a, i); }
    g.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  const idx = src.index ? src.index.array : Array.from({ length: src.attributes.position.count }, (_, i) => i);
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
  return g;
}
function bake(g, m) {
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  return g;
}
// Attributes every part has. Tangents missing on some parts are dropped (the shader then derives them),
// and vertex colours only matter if the material uses them.
function layout(meshes, material) {
  const common = Object.keys(meshes[0].geometry.attributes).filter((n) => meshes.every((o) => o.geometry.attributes[n]));
  return common.filter((n) => n !== 'color' || material.vertexColors);
}
const REQUIRED = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
function byMaterial(meshes) {
  const out = new Map();
  for (const o of meshes) (out.get(o.material) || out.set(o.material, []).get(o.material)).push(o);
  return out;
}
// Meshes of one material that can share a vertex layout (a part missing uv/normals stays on its own).
function compatible(list) {
  const groups = [];
  for (const o of list) {
    const has = (n) => !!o.geometry.attributes[n];
    const sig = REQUIRED.map((n) => (has(n) ? 1 : 0)).join('') + (o.geometry.index ? 'i' : 'n');
    let grp = groups.find((x) => x.sig === sig);
    if (!grp) groups.push((grp = { sig, list: [] }));
    grp.list.push(o);
  }
  return groups.map((x) => x.list);
}

const visibleUnder = (o, stop) => { for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return false; return true; };

// Merges the visible static meshes below `owner` into one mesh per material, parented to `frame`.
export function mergeStatic(owner, frame = owner) {
  owner.updateMatrixWorld(true);
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const meshes = [];
  owner.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.morphTargetInfluences && visibleUnder(o, owner.parent)) meshes.push(o);
  });
  let removed = 0;
  for (const [material, all] of byMaterial(meshes)) {
    for (const list of compatible(all)) {
      if (list.length < 2) continue;
      const names = layout(list, material);
      const geo = mergeGeometries(list.map((o) => bake(floatGeometry(o.geometry, names), new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))));
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = list[0].name;
      mesh.castShadow = list.some((o) => o.castShadow);
      mesh.receiveShadow = list.some((o) => o.receiveShadow);
      frame.add(mesh);
      for (const o of list) o.removeFromParent();
      removed += list.length - 1;
    }
  }
  return removed;
}

const near = (a, b, eps = 1e-4) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < eps);
const sameBones = (a, b) => a.bones.length === b.bones.length && a.bones.every((x, i) => x === b.bones[i]);

// Merges a character's skinned meshes into one per material, all bound to a single skeleton. The parts
// of a glTF character share bones but each carries its own inverse bind matrices; when those differ from
// the reference by one common transform the part is re-expressed in the reference's bind space.
export function mergeSkinned(root) {
  root.updateMatrixWorld(true);
  const all = [];
  root.traverse((o) => { if (o.isSkinnedMesh && !Array.isArray(o.material) && !o.morphTargetInfluences) all.push(o); });
  if (all.length < 2) return 0;
  const ref = all[0], parent = ref.parent, A = ref.skeleton.boneInverses;
  const rebound = new Map(), T = new THREE.Matrix4(), Ti = new THREE.Matrix4();
  for (const o of all) {
    if (o.parent !== parent || !sameBones(o.skeleton, ref.skeleton) || !near(o.bindMatrix, ref.bindMatrix) || !near(o.matrix, ref.matrix)) continue;
    T.copy(A[0]).invert().multiply(o.skeleton.boneInverses[0]);
    if (!o.skeleton.boneInverses.every((B, i) => near(Ti.copy(A[i]).invert().multiply(B), T))) continue;
    // Move the part into the reference mesh's bind space. bindMatrixInverse is recomputed from the
    // node every frame, so it must not be baked into the vertices.
    rebound.set(o, new THREE.Matrix4().copy(ref.bindMatrix).invert().multiply(T).multiply(ref.bindMatrix));
  }
  let removed = 0;
  for (const [material, list0] of byMaterial([...rebound.keys()])) {
    for (const list of compatible(list0)) {
      const names = layout(list, material);
      const geos = list.map((o) => bake(floatGeometry(o.geometry, names), rebound.get(o)));
      const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      if (!geo) continue;
      const mesh = new THREE.SkinnedMesh(geo, material);
      mesh.name = list[0].name;
      mesh.castShadow = list.some((o) => o.castShadow);
      mesh.receiveShadow = list.some((o) => o.receiveShadow);
      mesh.position.copy(ref.position);
      mesh.quaternion.copy(ref.quaternion);
      mesh.scale.copy(ref.scale);
      parent.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(ref.skeleton, ref.bindMatrix);
      for (const o of list) o.removeFromParent();
      removed += list.length - 1;
    }
  }
  return removed;
}

// Blend shapes nothing drives (every weight zero, no morph tracks) still cost a morph-texture fetch per
// target per vertex and a weight upload per draw. The militant's face carries 234 of them.
export function dropIdleMorphs(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.morphTargetInfluences || o.morphTargetInfluences.some((w) => w !== 0)) return;
    o.geometry.morphAttributes = {};
    delete o.morphTargetInfluences;
    delete o.morphTargetDictionary;
  });
}

// three.js draws transparent double-sided materials twice (back faces, then front) and flags them for a
// shader-program lookup on each of those draws. For eyes, lashes, brows and lenses one pass looks the same.
export function singlePassTransparent(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) if (m.transparent && m.side === THREE.DoubleSide) m.forceSinglePass = true;
  });
}

// SkeletonUtils.clone gives every skinned mesh its own skeleton copy; parts driven by identical bones
// then share one, so the bone matrices are computed and uploaded once per character instead of per part.
export function shareSkeletons(root) {
  const kept = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const b = o.skeleton;
    const s = kept.find((a) => sameBones(a, b) && a.boneInverses.every((m, i) => near(m, b.boneInverses[i], 1e-6)));
    if (s) o.bind(s, o.bindMatrix);
    else kept.push(b);
  });
}

// Private material copies for objects drawn in the viewmodel scene. Sharing a material between scenes
// with different lights makes three.js re-derive its shader program every time it switches scene.
export function ownMaterials(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => map.get(m) || map.set(m, m.clone()).get(m);
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
}
