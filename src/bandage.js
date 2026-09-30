import * as THREE from 'three';

// Israeli emergency bandage: vacuum pack, elastic roll, the wrap that builds up on the forearm, the
// loose end running back to the roll, and the plastic pressure bar that clips it down.
// Shared by the first-person arms and the third-person body so both play the same sequence.
export const MED_TIMING = { dur: 2.6, tear: 0.3, rip: 0.4, present: 0.72, wrapEnd: 1.95, turns: 3, fasten: 2.12 };

let M = null;
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function materials() {
  if (M) return M;
  const pack = canvasTex(256, 320, (x, w, h) => {
    x.fillStyle = '#5b6143';
    x.fillRect(0, 0, w, h);
    // Creases in the vacuum-sealed wrapper.
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
      x.lineWidth = 1 + Math.random() * 3;
      const a = Math.random() * w, b = Math.random() * h;
      x.beginPath(); x.moveTo(a, b); x.lineTo(a + (Math.random() - 0.5) * 140, b + (Math.random() - 0.5) * 140); x.stroke();
    }
    x.fillStyle = '#ece6cf';
    x.fillRect(18, 34, w - 36, 92);
    x.fillStyle = '#1b1c14';
    x.textAlign = 'center';
    x.font = 'bold 34px Arial';
    x.fillText('EMERGENCY', w / 2, 74);
    x.fillText('BANDAGE', w / 2, 112);
    x.fillStyle = '#ece6cf';
    x.font = 'bold 36px Arial';
    x.fillText('תחבושת אישית', w / 2, 192);
    x.font = '22px Arial';
    x.fillText('6" · STERILE', w / 2, 238);
    x.strokeStyle = '#ece6cf';
    x.lineWidth = 3;
    x.strokeRect(10, 10, w - 20, h - 20);
  });
  const weave = canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#e8e2d1';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i += 4) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(0, i, w, 1); }
    for (let i = 0; i < w; i += 6) { x.fillStyle = 'rgba(120,110,90,0.08)'; x.fillRect(i, 0, 1, h); }
    x.fillStyle = 'rgba(150,140,110,0.35)';
    x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3);
  }, [3, 2]);
  M = {
    pack: new THREE.MeshStandardMaterial({ map: pack, roughness: 0.32 }),
    elastic: new THREE.MeshStandardMaterial({ map: weave, roughness: 0.95 }),
    strip: new THREE.MeshStandardMaterial({ map: weave, roughness: 0.95, side: THREE.DoubleSide }),
    bar: new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.55 }),
  };
  return M;
}

export function makeBandage() {
  const m = materials();
  const packet = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.016), m.pack);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 20), m.elastic);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), m.elastic);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.strip);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.05), m.bar);
  const all = [packet, roll, band, strip, bar];
  for (const o of all) { o.visible = false; o.frustumCulled = false; }
  return { packet, roll, band, strip, bar, all };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const UP = new THREE.Vector3(0, 1, 0);

// Frame around a forearm running from elbow E to wrist W (world space). `e1` is its top side and
// `e2` the side facing `toward` (the viewer), so the wrap is seen passing in front of the arm.
export function forearmFrame(E, W, toward, f) {
  f.A.subVectors(W, E);
  f.len = f.A.length();
  f.A.divideScalar(f.len);
  f.e1.copy(UP).addScaledVector(f.A, -UP.dot(f.A)).normalize();
  f.e2.crossVectors(f.A, f.e1);
  if (toward && f.e2.dot(toward) < 0) f.e2.negate();
  f.c.copy(E).addScaledVector(f.A, f.len * 0.62);
  return f;
}
export const newFrame = () => ({ A: new THREE.Vector3(), e1: new THREE.Vector3(), e2: new THREE.Vector3(), c: new THREE.Vector3(), len: 1 });

// Progress of the wrap: `u` 0..1 over the wrapping window and the roll's angle around the arm.
export function wrapPhase(t) {
  const T = MED_TIMING;
  const u = clamp01((t - T.present) / (T.wrapEnd - T.present));
  return { u, theta: u * T.turns * Math.PI * 2 };
}
// Point `r` out from the band centre at angle `theta` (0 = top, then toward the viewer).
export function aroundArm(f, theta, r, out) {
  return out.copy(f.c).addScaledVector(f.e1, Math.cos(theta) * r).addScaledVector(f.e2, Math.sin(theta) * r);
}

// Outside the operator's sleeve, which is bulky around the forearm.
export const BAND_R = 0.066;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
function setWorld(o, parent, pos, quat) {
  parent.getWorldQuaternion(_pq).invert();
  o.quaternion.copy(_pq).multiply(quat);
  o.position.copy(parent.worldToLocal(_p.copy(pos)));
}

// Places the kit for `t` seconds into the IFAK. `hand` is the roll position (world), `packQ` the
// packet's world orientation while it is being torn open.
export function placeBandage(kit, parent, t, f, hand, packQ) {
  const T = MED_TIMING;
  const { u, theta } = wrapPhase(t);
  parent.updateMatrixWorld(true);
  kit.packet.visible = t < (T.tear + T.rip) / 2;
  if (kit.packet.visible) setWorld(kit.packet, parent, hand, packQ);

  kit.roll.visible = !kit.packet.visible && t < T.fasten - 0.08;
  if (kit.roll.visible) setWorld(kit.roll, parent, hand, _q.setFromUnitVectors(UP, f.A));

  const wrapped = t >= T.present;
  kit.band.visible = wrapped;
  if (wrapped) {
    const len = f.len * (0.08 + 0.34 * smooth(u * 1.05));
    setWorld(kit.band, parent, f.c, _q.setFromUnitVectors(UP, f.A));
    kit.band.scale.set(BAND_R, len, BAND_R);
  }

  kit.strip.visible = wrapped && t < T.wrapEnd + 0.1;
  if (kit.strip.visible) {
    // The loose end leaves the wrap a little behind the roll's angle and runs to the roll.
    const from = aroundArm(f, theta - 0.9, BAND_R, _z);
    _x.subVectors(hand, from);
    const d = Math.max(0.005, _x.length());
    _x.divideScalar(d);
    _y.copy(f.A).addScaledVector(_x, -f.A.dot(_x)).normalize();
    _m.makeBasis(_x, _y, _p.crossVectors(_x, _y));
    _q.setFromRotationMatrix(_m);
    setWorld(kit.strip, parent, _p.addVectors(from, hand).multiplyScalar(0.5), _q);
    kit.strip.scale.set(d, 0.045, 1);
  }

  kit.bar.visible = t >= T.fasten - 0.06;
  if (kit.bar.visible) {
    _y.copy(f.e1);
    _x.crossVectors(_y, f.A);
    _m.makeBasis(_x, _y, f.A);
    _q.setFromRotationMatrix(_m);
    setWorld(kit.bar, parent, _p.copy(f.c).addScaledVector(f.e1, BAND_R + 0.004), _q);
  }
}

export function hideBandage(kit) {
  for (const o of kit.all) o.visible = false;
}
