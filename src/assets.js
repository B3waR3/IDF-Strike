import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadModels } from './models.js';

// Poly Haven (CC0) PBR sets: *_diff (albedo), *_nor (OpenGL normal), *_arm (AO / roughness / metalness packed)
export const TEX_IDS = [
  'plastered_wall_04', 'beige_wall_001', 'painted_plaster_wall', 'concrete_wall_006', 'damaged_plaster',
  'concrete_floor_worn_001', 'dry_ground_01', 'asphalt_02', 'concrete_wall_008', 'rubble',
  'rusty_metal_02', 'hessian_230', 'metal_plate', 'painted_metal_shutter', 'denim_fabric',
];

export const assets = {
  tex: {},
  hdr: null,
  soldier: null,
  sunDir: new THREE.Vector3(0.5, 0.75, 0.3).normalize(),
  horizon: new THREE.Color(0.75, 0.72, 0.66),
};

export function loadAssets(onProgress) {
  return new Promise((resolve) => {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
    manager.onLoad = () => resolve(assets);
    manager.onError = (url) => console.warn('Failed to load', url);

    const tl = new THREE.TextureLoader(manager);
    for (const id of TEX_IDS) {
      const set = {};
      for (const [key, suffix, srgb] of [['map', 'diff', true], ['normalMap', 'nor', false], ['arm', 'arm', false]]) {
        const t = tl.load(`assets/tex/${id}_${suffix}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        set[key] = t;
      }
      assets.tex[id] = set;
    }

    new RGBELoader(manager).setDataType(THREE.FloatType).load('assets/sky_2k.hdr', (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      assets.hdr = t;
      analyzeSky(t);
    });
    new GLTFLoader(manager).load('assets/Soldier.glb', (g) => (assets.soldier = g));
    loadModels(manager);
  });
}

// Finds the sun (brightest texel) so the shadow-casting light matches the HDRI, and samples the horizon colour for fog.
function analyzeSky(t) {
  const { data, width: w, height: h } = t.image;
  const ch = data.length / (w * h);
  let best = -1, bi = 0;
  for (let y = 0; y < h * 0.5; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (l > best) { best = l; bi = y * w + x; }
    }
  }
  const x = bi % w, y = Math.floor(bi / w);
  const u = (x + 0.5) / w, v = 1 - (y + 0.5) / h;
  const lat = (v - 0.5) * Math.PI, phi = (u - 0.5) * Math.PI * 2;
  assets.sunDir.set(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)).normalize();
  if (assets.sunDir.y < 0.25) { assets.sunDir.y = 0.25; assets.sunDir.normalize(); }

  const row = Math.floor(h * 0.485);
  let r = 0, g = 0, b = 0;
  for (let xx = 0; xx < w; xx++) {
    const i = (row * w + xx) * ch;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  assets.horizon.setRGB(r / w, g / w, b / w);
}
