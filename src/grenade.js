import * as THREE from 'three';

// M67 fragmentation grenade: olive body, fuse assembly, spoon down one side and a pull ring.
// Returned parts let the animations hand the ring to the other hand and flip the spoon off.
let M = null;
export function makeGrenadeMesh() {
  if (!M) M = {
    body: new THREE.MeshStandardMaterial({ color: 0x3e4630, roughness: 0.55, metalness: 0.25 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.35, metalness: 1 }),
    band: new THREE.MeshStandardMaterial({ color: 0xc8b04a, roughness: 0.6, metalness: 0.1 }),
  };
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), M.body);
  body.scale.y = 1.12;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0322, 0.0322, 0.006, 20, 1, true), M.band);
  band.position.y = 0.012;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.026, 12), M.metal);
  fuse.position.y = 0.042;
  root.add(body, band, fuse);

  // Spoon: a thin curved strip from the fuse head down the side of the body.
  const spoon = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.006, 0); shape.lineTo(0.006, 0); shape.lineTo(0.005, -0.07); shape.lineTo(-0.005, -0.07);
  const strip = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.0015, bevelEnabled: false }), M.metal);
  strip.rotation.x = -0.22;
  spoon.add(strip);
  spoon.position.set(0, 0.052, 0.022);
  root.add(spoon);

  const ring = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 6, 20), M.metal);
  torus.rotation.y = Math.PI / 2;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.022, 6).rotateZ(Math.PI / 2), M.metal);
  pin.position.x = 0.011;
  ring.add(torus, pin);
  ring.position.set(-0.024, 0.046, 0);
  root.add(ring);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return { root, spoon, ring, ringHome: ring.position.clone(), spoonHome: spoon.position.clone() };
}
