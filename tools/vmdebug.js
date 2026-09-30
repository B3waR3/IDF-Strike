// Dev helper: import('/tools/vmdebug.js') in the browser console, then `await vm({ cls, idx, view, reload })`.
// Views are [camera offset, look-at offset] relative to the gun group, so close-ups track the weapon.
const VIEWS = {
  fp: null,
  side: [[0.45, 0, 0], [0, 0, 0]],
  left: [[-0.45, 0.02, 0], [0, 0, 0]],
  top: [[0, 0.45, 0.02], [0, 0, 0]],
  low: [[0.2, -0.35, 0.1], [0, 0, 0]],
  back: [[0.05, 0.08, 0.32], [0, 0, -0.1]],
  front: [[0.05, 0.02, -0.5], [0, 0, 0]],
};

// Steps the game directly rather than waiting on requestAnimationFrame, which stops in hidden tabs.
const frames = async (g, n, each) => {
  for (let k = 0; k < n; k++) { g.player.hp = 100; each?.(); g.frame(1 / 60); }
  g.player.hp = 100;
  each?.();
};

export async function waitReady() {
  while (!(window.__game && window.__game.world.tankPos)) await new Promise((r) => setTimeout(r, 300));
  return window.__game;
}

// reload: phase 0..1 to freeze a reload at; empty: empty-reload variant; bolt: bolt-cycle phase 0..1.
export async function vm({ cls = null, idx = 0, view = 'fp', ads = 0, reload = null, empty = false, bolt = null, tp = null, orbit = null, crouch = null } = {}) {
  const g = await waitReady();
  if (cls != null) { g.deploy(g.CLASSES[cls]); g.S.intermission = 999; }
  g.S.state = 'playing';
  if (tp != null) g.S.thirdPerson = !!tp;
  if (crouch != null) g.player.crouch = !!crouch;
  g.player.cur = idx;
  g.S.switchT = 0;
  g.mouse.right = !!ads;
  const w = g.player.weapons[idx];
  const hold = () => {
    if (reload != null) {
      g.S.reloading = true; g.S.reloadEmpty = empty;
      g.S.reloadDur = empty ? w.def.reloadEmpty : w.def.reload;
      g.S.reloadT = reload * g.S.reloadDur;
    }
    if (bolt != null) g.S.boltT = (1 - bolt) * 1.15;
  };
  await frames(g, cls != null ? 30 : 6, hold);
  g.S.state = 'paused';
  document.getElementById('pause').classList.add('hidden');
  const c = g.vmCamera, v = VIEWS[view];
  if (v) {
    const p = w.model.group.position;
    c.position.set(p.x + v[0][0], p.y + v[0][1], p.z + v[0][2]);
    c.lookAt(p.x + v[1][0], p.y + v[1][1], p.z + v[1][2]);
  } else { c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); }
  c.updateMatrixWorld();
  // orbit: [yaw around the player (0 = behind), distance, height] for inspecting the third-person body.
  if (orbit) {
    const P = g.player.pos, a = g.player.yaw + orbit[0];
    g.camera.position.set(P.x + Math.sin(a) * orbit[1], P.y + orbit[2], P.z + Math.cos(a) * orbit[1]);
    g.camera.lookAt(P.x, P.y + (orbit[3] ?? 1.2), P.z);
    g.camera.updateMatrixWorld();
  }
  if (reload != null) g.S.reloading = false;
  return w.id;
}
window.vm = vm;

// Close-up of an enemy character: `yaw` orbits the camera around the head, `dist`/`h` frame it.
let shown = null;
// `dead` freezes a death `dead` seconds in (dir +1 forward / -1 backward, blast, headshot).
export async function char({ kind = 'hamas', gun = 'ak', yaw = 0, dist = 0.8, h = 0, look = 1.55, dead = null, dir = 1, blast = false, headshot = false } = {}) {
  const g = await waitReady();
  const { createCharacter } = await import('/src/characters.js');
  const key = kind + gun;
  if (!shown || shown.key !== key || dead != null) {
    if (shown) { g.scene.remove(shown.ch.root); shown.ch.dispose(); }
    shown = { key, ch: createCharacter(kind, gun) };
    g.scene.add(shown.ch.root);
    window.__shown = shown.ch;
  }
  const at = { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z - 3 };
  const ch = shown.ch;
  ch.root.position.set(at.x, at.y, at.z);
  ch.root.rotation.y = 0;
  ch.update(0.016, 0, 0, false);
  if (dead != null) {
    ch.die({ dir, blast, headshot, roll: 0.2 });
    for (let t = 0; t < dead; t += 1 / 60) ch.update(1 / 60, 0, 0, false);
  }
  g.S.state = 'paused';
  document.getElementById('pause').classList.add('hidden');
  g.camera.position.set(at.x + Math.sin(yaw) * dist, at.y + look + h, at.z + Math.cos(yaw) * dist);
  g.camera.lookAt(at.x, at.y + look, at.z);
  g.camera.updateMatrixWorld();
  for (const w of g.player.weapons) w.model.group.visible = w.model.arms.visible = false;
  return kind;
}
window.char = char;

// Renders several frozen poses into one overlay image so a single screenshot shows a whole sequence.
export async function sheet(list, cols = 3, crop = [0, 0, 1, 1]) {
  const g = await waitReady();
  document.getElementById('__sheet')?.remove();
  const src = g.renderer.domElement;
  const sx = crop[0] * src.width, sy = crop[1] * src.height, sw = (crop[2] - crop[0]) * src.width, sh = (crop[3] - crop[1]) * src.height;
  const w = src.width / cols, h = (w * sh) / sw;
  const c = document.createElement('canvas');
  c.width = w * cols; c.height = h * Math.ceil(list.length / cols);
  const ctx = c.getContext('2d');
  ctx.font = `${Math.round(h / 14)}px monospace`; ctx.fillStyle = '#ff0';
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    await (it.char ? char(it) : vm(it));
    g.pipe.composer.render(0);
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
    ctx.fillText(list[i].label ?? JSON.stringify(list[i]), x + 6, y + h / 12);
  }
  c.id = '__sheet';
  Object.assign(c.style, { position: 'fixed', inset: 0, width: '100vw', height: 'auto', zIndex: 99999 });
  c.onclick = () => c.remove();
  document.body.appendChild(c);
  return 'ok';
}
window.sheet = sheet;
