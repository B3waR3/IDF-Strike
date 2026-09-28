import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const LAYER_FX = 1;
export const LAYER_HITBOX = 2;

export const QUALITY = {
  ultra: { label: 'ULTRA', pixelRatio: 2, shadow: 4096, shadowRange: 70, ao: true, bloom: true, msaa: 4 },
  high: { label: 'HIGH', pixelRatio: 1.25, shadow: 4096, shadowRange: 65, ao: true, bloom: true, msaa: 4 },
  medium: { label: 'MEDIUM', pixelRatio: 1, shadow: 2048, shadowRange: 60, ao: false, bloom: true, msaa: 4 },
  low: { label: 'LOW', pixelRatio: 0.85, shadow: 1024, shadowRange: 50, ao: false, bloom: false, msaa: 0 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uLow: { value: 0 },
    uSupp: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uHurt, uLow, uSupp, uFlash;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uRes.x / uRes.y, 1.0));
      float ca = 0.0012 + r * r * 0.003 + uSupp * 0.003;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca).b;

      if (uSupp > 0.01) {
        vec3 b = vec3(0.0);
        float rad = 0.006 * uSupp;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          b += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rad).rgb;
        }
        col = mix(col, b / 8.0, smoothstep(0.15, 0.6, r) * uSupp);
      }

      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Battlefield-style grade: cool shadows, warm dusty highlights, slight desaturation.
      col *= mix(vec3(0.93, 0.98, 1.06), vec3(1.05, 1.0, 0.92), smoothstep(0.05, 0.75, l));
      float sat = 0.92 - uLow * 0.7 - uSupp * 0.25;
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * 1.07 + 0.5;
      col = max(col, 0.0);

      col *= 1.0 - 0.42 * smoothstep(0.3, 0.95, r);
      col = mix(col, vec3(0.38, 0.0, 0.0), clamp(uHurt, 0.0, 1.0) * smoothstep(0.2, 0.85, r));
      col = mix(col, vec3(1.0), uFlash);

      float n = hash(vUv * uRes + fract(uTime) * 100.0);
      col += (n - 0.5) * 0.035;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Draws the first-person weapon over the world with its own camera/depth so it never clips into walls.
class ViewmodelPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.enabled = true;
  }
  render(renderer, _writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);
  return renderer;
}

export function createPipeline(renderer, scene, camera, vmScene, vmCamera, q) {
  const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(pr);
  const w = window.innerWidth, h = window.innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);

  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (q.ao) {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    const orig = gtao.render.bind(gtao);
    gtao.render = (...args) => {
      camera.layers.disable(LAYER_FX);
      orig(...args);
      camera.layers.enable(LAYER_FX);
    };
    composer.addPass(gtao);
  }

  composer.addPass(new ViewmodelPass(vmScene, vmCamera));

  let bloom = null;
  if (q.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.28, 0.55, 1.1);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.set(w, h);
  composer.addPass(grade);

  return {
    composer, grade, gtao, bloom,
    resize() {
      const W = window.innerWidth, H = window.innerHeight;
      composer.setSize(W, H);
      grade.uniforms.uRes.value.set(W, H);
    },
    dispose() {
      composer.passes.forEach((p) => p.dispose && p.dispose());
      rt.dispose();
    },
  };
}
