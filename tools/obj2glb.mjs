// Karambit OBJ (+ PNG) -> GLB in metres, for `node tools/obj2glb.mjs in.obj in.png out.glb`.
// Handle, finger ring and blade become separate primitives, and the knife is stood up for a forward
// grip: ring on top (+Y), claw curving toward -Z. Prints the grip point for models.js.
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';

const [objPath, texPath, outPath] = process.argv.slice(2);
const LENGTH = 0.2;

const text = fs.readFileSync(objPath, 'utf8');
const v = [], vt = [], vn = [], tris = [];
let mat = '';
for (const line of text.split(/\r?\n/)) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
  else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
  else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
  else if (p[0] === 'usemtl') mat = p[1];
  else if (p[0] === 'f') {
    const c = p.slice(1).map((s) => s.split('/').map((n) => (n ? +n - 1 : -1)));
    for (let i = 1; i < c.length - 1; i++) tris.push({ mat, c: [c[0], c[i], c[i + 1]] });
  }
}

// OBJ texture v runs bottom-up; the image has the handle in its top half and the ring at its left end.
const partOf = (t) => {
  if (t.mat === 'blade') return 'blade';
  let u = 0, w = 0;
  for (const [, ti] of t.c) { u += vt[ti][0] / 3; w += (1 - vt[ti][1]) / 3; }
  return u < 0.31 && w > 0.15 && w < 0.47 ? 'ring' : 'handle';
};
const parts = { handle: [], ring: [], blade: [] };
for (const t of tris) parts[partOf(t)].push(t);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const centroid = (list) => {
  const seen = new Set(), s = [0, 0, 0];
  for (const t of list) for (const [vi] of t.c) if (!seen.has(vi)) { seen.add(vi); s[0] += v[vi][0]; s[1] += v[vi][1]; s[2] += v[vi][2]; }
  return s.map((x) => x / seen.size);
};

const ringC = centroid(parts.ring), handleC = centroid(parts.handle);
const H = norm(sub(ringC, handleC));
let tip = null, best = -1;
for (const t of parts.blade) for (const [vi] of t.c) {
  const d = Math.hypot(...sub(v[vi], ringC));
  if (d > best) { best = d; tip = v[vi]; }
}
const D = sub(tip, handleC);
const C = norm(sub(D, H.map((x) => x * dot(D, H))));
const N = cross(H, C);
// H -> +Y, C -> -Z, N -> -X (a proper rotation: both triples are right-handed).
const rot = (a) => [-dot(a, N), dot(a, H), -dot(a, C)];

const rv = v.map(rot);
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const p of rv) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
const s = LENGTH / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
const center = lo.map((x, k) => ((x + hi[k]) / 2) * s);
const P = rv.map((p) => [p[0] * s - center[0], p[1] * s - center[1], p[2] * s - center[2]]);

// The fist wraps the handle just below the ring (the index finger goes through it).
const ringR = rot(ringC).map((x, k) => x * s - center[k]);
const gy = ringR[1] - 0.042;
let gx = 0, gz = 0, gn = 0;
for (const t of parts.handle) for (const [vi] of t.c) {
  if (Math.abs(P[vi][1] - gy) < 0.012) { gx += P[vi][0]; gz += P[vi][2]; gn++; }
}
const grip = [gx / gn, gy, gz / gn];
const tipP = P[v.indexOf(tip)];

const doc = new Document();
const buffer = doc.createBuffer();
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const texture = doc.createTexture('karambit').setImage(fs.readFileSync(texPath)).setMimeType('image/png');
const materials = {
  handle: doc.createMaterial('handle').setBaseColorTexture(texture).setMetallicFactor(0.05).setRoughnessFactor(0.8),
  ring: doc.createMaterial('ring').setBaseColorFactor([0.11, 0.115, 0.12, 1]).setMetallicFactor(0.85).setRoughnessFactor(0.38),
  blade: doc.createMaterial('blade').setBaseColorFactor([0.62, 0.64, 0.66, 1]).setMetallicFactor(1).setRoughnessFactor(0.28).setDoubleSided(true),
};
const mesh = doc.createMesh('karambit');
for (const [name, list] of Object.entries(parts)) {
  const pos = [], nrm = [], uv = [], idx = [], map = new Map();
  for (const t of list) {
    const fn = norm(cross(sub(P[t.c[1][0]], P[t.c[0][0]]), sub(P[t.c[2][0]], P[t.c[0][0]])));
    for (const [vi, ti, ni] of t.c) {
      const key = `${vi}/${ti}/${ni}`;
      let id = map.get(key);
      if (id == null) {
        id = pos.length / 3;
        map.set(key, id);
        pos.push(...P[vi]);
        nrm.push(...(ni >= 0 ? rot(vn[ni]) : fn));
        const w = ti >= 0 ? vt[ti] : [0, 0];
        uv.push(w[0], 1 - w[1]);
      }
      idx.push(id);
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setIndices(acc('SCALAR', new Uint32Array(idx)))
    .setMaterial(materials[name]);
  mesh.addPrimitive(prim);
  console.log(name, 'tris', list.length);
}
doc.createScene().addChild(doc.createNode('karambit').setMesh(mesh));
await new NodeIO().write(outPath, doc);
const f = (a) => a.map((x) => +x.toFixed(3));
console.log('size', f(hi.map((x, k) => (x - lo[k]) * s)), 'grip', f(grip), 'ring', f(ringR), 'tip', f(tipP));
