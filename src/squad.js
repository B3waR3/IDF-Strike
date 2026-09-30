import * as THREE from 'three';
import { createPlayerBody } from './characters.js';
import { hasLOS, raycastWorld, resolveCollisions, groundHeightAt, flowDir, HALF } from './world.js';
import { spawnTracer, impactFx, spawnParticle, TEX } from './effects.js';
import * as SFX from './audio.js';

// AI teammates. They hold formation slots around the player (x = right, z = behind, metres),
// engage the nearest militant they can see, and are revived when a wave is cleared.
const ROSTER = [
  { name: 'Sgt. Cohen', tag: 'TAR-21', weapon: 'tavor', slot: [-2.2, 2.4] },
  { name: 'Cpl. Levi', tag: 'MAG 58', weapon: 'negev', slot: [2.3, 2.1] },
  { name: 'Cpl. Mizrahi', tag: 'M4A1', weapon: 'm4', slot: [0.3, 4.0] },
];
export const MAX_BOTS = ROSTER.length;

// Deliberately weaker than the player: short engagement range, slow reactions, poor accuracy and
// reduced damage, so bots support the fight rather than clearing waves on their own.
const SKILL = {
  range: 35, react: [0.9, 1.6], hitMax: 0.3, hitMin: 0.04, falloff: 90,
  dmgMult: 0.45, headChance: 0.03, burstPause: [0.8, 1.6],
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function createSquad({ scene, player, enemies, WEAPONS, damageEnemy, onDown }) {
  const bots = [];
  const eye = V(), tgt = V(), dir = V(), from = V(), slot = V(), move = V();

  function place(b, i) {
    const y = player.yaw, [sx, sz] = b.slot;
    b.pos.set(
      player.pos.x + Math.cos(y) * sx + Math.sin(y) * sz,
      player.pos.y,
      player.pos.z - Math.sin(y) * sx + Math.cos(y) * sz,
    );
    resolveCollisions(b.pos, 0.38, b.pos.y);
    b.pos.y = groundHeightAt(b.pos.x, b.pos.z, b.pos.y + 0.5);
    b.yaw = player.yaw;
    b.vel.set(0, 0, 0);
    b.hp = 100;
    b.alive = true;
    b.mag = b.def.mag;
    b.reloadT = -1;
    b.target = null;
    b.body.revive();
    b.body.setWeapon(b.weapon);
  }

  function spawn(n) {
    clear();
    for (let i = 0; i < Math.min(n, MAX_BOTS); i++) {
      const r = ROSTER[i];
      const body = createPlayerBody();
      scene.add(body.root);
      const b = {
        ...r, def: WEAPONS[r.weapon], body, pos: V(), vel: V(), yaw: 0, pitch: 0, eye: 1.6, crouch: false,
        hp: 100, alive: true, mag: 0, reloadT: -1, fireCD: 0, burst: 0, target: null, scanT: rand(0, 0.3),
        react: 0, kick: 0, shotN: 0, bot: true,
      };
      place(b, i);
      bots.push(b);
    }
  }

  function clear() {
    for (const b of bots) b.body.root.removeFromParent();
    bots.length = 0;
  }

  function reviveAll() {
    bots.forEach((b, i) => { if (!b.alive) place(b, i); else b.hp = 100; });
  }

  function damage(b, amount, fromPos, explosive) {
    if (!b.alive) return;
    b.hp -= amount * (explosive ? 0.6 : 0.5);
    if (b.hp > 0) return;
    b.hp = 0;
    b.alive = false;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const front = !fromPos || (fromPos.x - b.pos.x) * fx + (fromPos.z - b.pos.z) * fz > 0;
    b.body.die({ dir: front ? -1 : 1, blast: explosive });
    onDown?.(b);
  }

  function blast(pos, radius, maxDmg) {
    for (const b of bots) {
      if (!b.alive) continue;
      const c = V(b.pos.x, b.pos.y + 1, b.pos.z), d = c.distanceTo(pos);
      if (d < radius && hasLOS(pos, c)) damage(b, maxDmg * (1 - d / radius), pos, true);
    }
  }

  function pickTarget(b) {
    eye.set(b.pos.x, b.pos.y + b.eye, b.pos.z);
    let best = null, bd = SKILL.range;
    for (const e of enemies) {
      if (e.dead || e.emerge > 0) continue;
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
      if (d >= bd) continue;
      if (hasLOS(eye, tgt.set(e.pos.x, e.pos.y + 1.3, e.pos.z))) { best = e; bd = d; }
    }
    if (best && best !== b.target) b.react = rand(...SKILL.react);
    b.target = best;
  }

  function shoot(b, e, dist) {
    const d = b.def;
    b.mag--;
    b.shotN++;
    b.kick = 1;
    b.fireCD = 60 / d.rpm;
    const moving = Math.hypot(e.speed || 0) > 0.5;
    const hit = Math.random() < clamp(SKILL.hitMax - dist / SKILL.falloff, SKILL.hitMin, SKILL.hitMax) * (moving ? 0.7 : 1);
    const head = hit && Math.random() < SKILL.headChance;
    b.body.muzzleWorld(from);
    tgt.set(e.pos.x, e.pos.y + (head ? 1.62 : 1.25), e.pos.z);
    if (!hit) tgt.add(V(rand(-0.9, 0.9), rand(-0.6, 0.8), rand(-0.9, 0.9)));
    dir.copy(tgt).sub(from).normalize();
    let end = tgt;
    if (hit) {
      damageEnemy(e, d.damage * (head ? d.headMult : 1) * SKILL.dmgMult, tgt.clone(), dir.clone(), head, b);
    } else {
      const wh = raycastWorld(from, dir, dist * 1.6 + 20);
      if (wh) { impactFx(wh.point, wh.normal, wh.surf); end = wh.point; }
      else end = from.clone().addScaledVector(dir, dist * 1.6 + 20);
    }
    if (b.shotN % 2 === 0) spawnTracer(from.clone(), end.clone(), 0xffc880, 0.016, 700);
    spawnParticle(from.clone(), V(rand(-0.2, 0.2), 0.3, rand(-0.2, 0.2)), { tex: TEX.smoke, color: 0xc8c0b0, size: 0.25, life: 0.8, opacity: 0.2, grav: 0.3, grow: 1.8, drag: 2 });
    b.body.fire();
    SFX.playShot(d.sound, from.clone());
  }

  function update(dt, active) {
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      b.body.root.position.copy(b.pos);
      if (!b.alive) { b.body.update(dt, null); continue; }

      b.scanT -= dt;
      if (b.scanT <= 0) { b.scanT = rand(0.25, 0.35); pickTarget(b); }
      const e = active && b.target && !b.target.dead ? b.target : null;

      // Formation slot in the player's frame; flow-field pathing when the slot isn't in sight.
      const y = player.yaw, [sx, sz] = b.slot;
      slot.set(player.pos.x + Math.cos(y) * sx + Math.sin(y) * sz, player.pos.y, player.pos.z - Math.sin(y) * sx + Math.cos(y) * sz);
      move.set(slot.x - b.pos.x, 0, slot.z - b.pos.z);
      const far = move.length();
      let speed = 0;
      if (far > 1.0) {
        speed = far > 9 ? 6.5 : far > 3.5 ? 4.6 : 2.6;
        if (e) speed = Math.min(speed, 2.2);
        eye.set(b.pos.x, b.pos.y + 1, b.pos.z);
        if (!hasLOS(eye, tgt.set(slot.x, slot.y + 1, slot.z)) && flowDir(b.pos.x, b.pos.z, dir)) move.copy(dir);
        move.normalize();
      }
      const k = Math.min(1, dt * 8);
      b.vel.x += (move.x * speed - b.vel.x) * k;
      b.vel.z += (move.z * speed - b.vel.z) * k;
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      const px = b.pos.x - player.pos.x, pz = b.pos.z - player.pos.z, pd = Math.hypot(px, pz);
      if (pd < 0.85 && pd > 1e-4) { b.pos.x += (px / pd) * (0.85 - pd); b.pos.z += (pz / pd) * (0.85 - pd); }
      for (let j = 0; j < i; j++) {
        const o = bots[j];
        const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z, dd = Math.hypot(dx, dz);
        if (o.alive && dd < 0.8 && dd > 1e-4) { b.pos.x += (dx / dd) * (0.8 - dd); b.pos.z += (dz / dd) * (0.8 - dd); }
      }
      resolveCollisions(b.pos, 0.38, b.pos.y);
      b.pos.x = clamp(b.pos.x, -HALF + 0.5, HALF - 0.5);
      b.pos.z = clamp(b.pos.z, -HALF + 0.5, HALF - 0.5);
      const gh = groundHeightAt(b.pos.x, b.pos.z, b.pos.y, 0.15);
      b.pos.y += (gh - b.pos.y) * Math.min(1, dt * 10);
      const sp = Math.hypot(b.vel.x, b.vel.z);

      // Facing: the target when engaged, otherwise the direction of travel, otherwise where the player looks.
      let yawT = sp > 0.6 ? Math.atan2(-b.vel.x, -b.vel.z) : player.yaw, pitchT = 0, dist = 0;
      if (e) {
        const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z;
        dist = Math.hypot(dx, dz);
        yawT = Math.atan2(-dx, -dz);
        pitchT = Math.atan2(e.pos.y + 1.25 - (b.pos.y + b.eye), Math.max(dist, 0.5));
      }
      const err = wrap(yawT - b.yaw);
      b.yaw = wrap(b.yaw + err * Math.min(1, dt * 7));
      b.pitch += (pitchT - b.pitch) * Math.min(1, dt * 6);

      b.kick *= Math.exp(-dt * 14);
      b.fireCD -= dt;
      if (b.reloadT >= 0) {
        b.reloadT += dt;
        if (b.reloadT >= b.def.reload) { b.reloadT = -1; b.mag = b.def.mag; }
      } else if (e) {
        b.react -= dt;
        if (b.react <= 0 && Math.abs(err) < 0.25 && b.fireCD <= 0) {
          if (b.burst <= 0) { b.burst = b.def.type === 'lmg' ? Math.ceil(rand(4, 7)) : b.def.type === 'sniper' ? 1 : Math.ceil(rand(2, 4)); b.fireCD = rand(...SKILL.burstPause); }
          else { b.burst--; shoot(b, e, dist); if (b.def.type === 'sniper') b.fireCD = 1.4; }
        }
        if (b.mag <= 0) b.reloadT = 0;
      } else if (b.mag < b.def.mag * 0.5) b.reloadT = 0;

      const fwd = b.vel.x * -Math.sin(b.yaw) + b.vel.z * -Math.cos(b.yaw);
      b.body.root.position.copy(b.pos);
      b.body.root.rotation.y = b.yaw + Math.PI;
      b.body.update(dt, {
        speed: sp, back: fwd < -0.3, pitch: b.pitch, crouch: false, sprint: speed > 5 && !e, ads: e ? 1 : 0,
        reloadP: b.reloadT >= 0 ? Math.min(1, b.reloadT / b.def.reload) : -1, empty: b.mag === 0, kick: b.kick, switchK: 0,
      });
    }
  }

  return {
    bots, spawn, clear, reviveAll, damage, blast, update,
    alive() { return bots.filter((b) => b.alive); },
  };
}
