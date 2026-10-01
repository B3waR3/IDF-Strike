// Co-op for up to three friends, with no accounts. The host's game is the mission: it runs the enemies,
// waves and damage. Everyone else sends where they are and what they fired, and draws the host's world.
// Pressing HOST attaches to a console server if one is listening on this PC (npm run server). Otherwise
// the game listens itself. Friends on the same network use the address it prints. From another house,
// forward port 27500, or use Tailscale / ZeroTier and the address that gives the host.
import * as THREE from 'three';
import { createPlayerBody, createCharacter } from './characters.js';
import { explosionFx } from './effects.js';

export const NET_PORT = 27500;
const POSE_DT = 1 / 20;
const SNAP_DT = 1 / 15;
const WEAPONS_OK = new Set(['tavor', 'm4', 'negev', 'm24', 'sniper', 'g28', 'glock', 'jericho', 'karambit']);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerpA = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 36px sans-serif';
  x.textAlign = 'center';
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillText(text, 130, 46);
  x.fillStyle = '#f2efe4';
  x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.1, 0.28, 1);
  s.position.y = 2.15;
  s.renderOrder = 2;
  return s;
}

function slotSpawn(id, base) {
  const a = id * 1.7;
  return { x: base.x + Math.sin(a) * 2.4, y: base.y, z: base.z + Math.cos(a) * 2.4 };
}

export function createNet(hooks) {
  const bridge = typeof window !== 'undefined' ? window.idfNet : null;
  const peers = new Map();
  const bodies = new Map();
  const foes = new Map();
  const props = new Map();
  const poses = new Map();
  const inbox = [];
  const targetRecs = new Map();
  let role = null;
  let myId = 0;
  let myName = 'Soldier';
  let live = false;
  let cls = null;
  let spawn = null;
  let poseT = 0;
  let snapT = 0;
  let off = null;

  const nadeGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x556044, roughness: 0.55 });
  const rocketGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const rocketMat = new THREE.MeshStandardMaterial({ color: 0xc4b49a, roughness: 0.45 });

  const send = (data, to = 'all') => bridge && bridge.send({ to, data });
  const status = (text) => { const el = document.getElementById('net-status'); if (el) el.textContent = text; };

  function blank(id) {
    return {
      id, name: 'Soldier', ready: false, cls: 'rifleman',
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0,
      crouch: false, prone: false, sprint: false, ads: 0, eye: 1.65, weapon: 'tavor',
      hp: 100, armor: 100, armorMax: 100, alive: false, seenAt: 0,
    };
  }

  function dropBody(id) {
    const b = bodies.get(id);
    if (!b) return;
    b.tag.removeFromParent();
    b.body.root.removeFromParent();
    if (b.body.dispose) b.body.dispose();
    bodies.delete(id);
  }

  function ensureBody(id, name) {
    let b = bodies.get(id);
    if (b) return b;
    const body = createPlayerBody();
    body.setWeapon('tavor');
    const tag = nameSprite(name || 'Soldier');
    body.root.add(tag);
    hooks.scene.add(body.root);
    b = { body, tag, dead: false, weapon: 'tavor', x: 0, y: 0, z: 0, yaw: 0 };
    bodies.set(id, b);
    return b;
  }

  function clearWorld() {
    for (const id of [...bodies.keys()]) dropBody(id);
    for (const f of foes.values()) { f.ch.root.removeFromParent(); f.ch.dispose(); }
    foes.clear();
    for (const p of props.values()) p.mesh.removeFromParent();
    props.clear();
  }

  function targets() {
    // Same object every frame for each friend. A fresh object each call made enemies
    // restart their reaction forever and only ever finish a burst at the host.
    const live = new Set();
    const out = [];
    for (const p of peers.values()) {
      if (!p.alive) continue;
      live.add(p.id);
      let rec = targetRecs.get(p.id);
      if (!rec) {
        rec = {
          net: true, netId: p.id, pos: V(), vel: V(),
          eye: p.eye || 1.65, alive: true, crouch: false, prone: false, sprinting: false,
        };
        targetRecs.set(p.id, rec);
      }
      rec.pos.set(p.x, p.y, p.z);
      rec.vel.set(p.vx, 0, p.vz);
      rec.eye = p.eye || 1.65;
      rec.alive = true;
      rec.crouch = !!p.crouch;
      rec.prone = !!p.prone;
      rec.sprinting = !!p.sprint;
      out.push(rec);
    }
    for (const id of [...targetRecs.keys()]) {
      if (live.has(id)) continue;
      targetRecs.get(id).alive = false;
      targetRecs.delete(id);
    }
    return out;
  }

  function roster() {
    const rows = [];
    for (const p of peers.values()) {
      if (!p.ready && role === 'host') continue;
      rows.push({ name: p.name, tag: p.alive ? 'ALLY' : 'DOWN', hp: Math.max(0, p.hp), down: !p.alive });
    }
    return rows;
  }

  function enemyMarks() {
    const out = [];
    for (const f of foes.values()) out.push({ pos: f.pos, dead: f.dead, emerge: f.emerge, sniper: f.sniper, vis: false });
    return out;
  }

  function applyPose(p, m) {
    if (![m.x, m.y, m.z, m.yaw, m.pitch].every(fin)) return;
    const now = performance.now() / 1000;
    const dt = p.seenAt ? Math.max(0.03, now - p.seenAt) : 0;
    if (dt) {
      const dx = m.x - p.x, dz = m.z - p.z, dist = Math.hypot(dx, dz), cap = 14 * dt;
      if (dist > cap && dist > 0) { p.x += dx / dist * cap; p.z += dz / dist * cap; }
      else { p.x = m.x; p.z = m.z; }
    } else { p.x = m.x; p.z = m.z; }
    p.y = m.y;
    p.yaw = m.yaw; p.pitch = m.pitch;
    p.vx = fin(m.vx) ? m.vx : 0; p.vz = fin(m.vz) ? m.vz : 0;
    p.crouch = !!m.crouch; p.prone = !!m.prone; p.sprint = !!m.sprint;
    p.ads = fin(m.ads) ? m.ads : 0;
    p.eye = fin(m.eye) ? m.eye : 1.65;
    if (typeof m.weapon === 'string') p.weapon = m.weapon;
    p.seenAt = now;
  }

  function onClientMessage(id, m) {
    let p = peers.get(id);
    if (!p) {
      if (m.t !== 'hello' && m.t !== 'ready') return;
      p = blank(id);
      peers.set(id, p);
    }
    if (m.t === 'hello') {
      p.name = String(m.name || 'Soldier').slice(0, 16);
      send({ t: 'welcome', id, live }, id);
      if (live && p.ready) send(beginMsg(id), id);
      refreshStatus();
    } else if (m.t === 'ready') {
      p.ready = true;
      p.cls = m.cls || p.cls;
      p.armorMax = fin(m.armor) ? m.armor : 100;
      p.armor = p.armorMax;
      p.hp = 100;
      p.alive = live;
      p.name = String(m.name || p.name).slice(0, 16);
      if (live) { p.alive = true; send(beginMsg(id), id); }
      refreshStatus();
    } else if (m.t === 'pose') applyPose(p, m);
    else if (m.t === 'shot') hooks.applyShot(p, m);
    else if (m.t === 'stab') hooks.applyStab(p, m);
    else if (m.t === 'nade') hooks.spawnGrenade(p, m);
    else if (m.t === 'boom') hooks.explodeAt(p, m);
    else if (m.t === 'ifak') {
      if (p.alive && p.hp < 100 && performance.now() - (p.healed || 0) > 2400) {
        p.hp = Math.min(100, p.hp + 50);
        p.healed = performance.now();
      }
    } else if (m.t === 'armor') {
      const max = p.armorMax || 100;
      if (p.alive && fin(m.v)) p.armor = Math.max(0, Math.min(max, m.v));
    }
  }

  function beginMsg(id) {
    const base = hooks.spawnPoint();
    return { t: 'begin', ...slotSpawn(id, base) };
  }

  function forgetPeer(id) {
    const p = peers.get(id);
    if (!p) return;
    const name = p.name || 'A player';
    peers.delete(id);
    dropBody(id);
    const text = `${name} has left the match`;
    if (hooks.notice) hooks.notice(text);
    send({ t: 'notice', text });
  }

  function runCommand(line) {
    const bits = String(line || '').trim().split(/\s+/);
    const cmd = (bits[0] || '').toLowerCase();
    const arg = bits.slice(1).join(' ');
    if (cmd === 'players') {
      const rows = [...peers.values()].map((p) => `#${p.id}  ${p.name}  ${p.alive ? 'up' : 'down'}`);
      return rows.length ? rows.join('\n') : 'No one else has joined.';
    }
    if (cmd === 'kick') {
      const name = arg.toLowerCase();
      if (!name) return 'Usage: kick <name>';
      for (const p of peers.values()) {
        if (p.name.toLowerCase() === name) { forgetPeer(p.id); refreshStatus(); return `Kicked ${p.name}.`; }
      }
      return `No player named ${arg}.`;
    }
    if (cmd === 'say') {
      if (!arg) return 'Usage: say <text>';
      if (hooks.notice) hooks.notice(arg);
      send({ t: 'notice', text: arg });
      return 'Sent.';
    }
    const answer = hooks.command ? hooks.command(line) : null;
    return answer || 'Unknown command. Type help.';
  }

  function refreshStatus() {
    if (role !== 'host') return;
    const n = [...peers.values()].filter((p) => p.name).length;
    const where = (window.__netWhere || []).map((ip) => `${ip}:${NET_PORT}`).join('   ');
    status(`Hosting · ${n}/3 joined${where ? `\nFriends join: ${where}` : ''}`);
  }

  function takeSnap(m) {
    if (!m || m.t !== 'snap') return;
    const you = (m.players || []).find((p) => p.id === myId);
    if (you) hooks.applyVitals(you);
    for (const s of m.players || []) {
      if (s.id === myId) continue;
      const b = ensureBody(s.id, s.name);
      if (!b.placed) { b.x = s.x; b.y = s.y; b.z = s.z; b.yaw = s.yaw; b.placed = true; }
      b.goal = s;
      if (WEAPONS_OK.has(s.weapon) && s.weapon !== b.weapon) { b.body.setWeapon(s.weapon); b.weapon = s.weapon; }
      if (s.alive && b.dead) { b.body.revive(); b.dead = false; }
      if (!s.alive && !b.dead) { b.body.die({ dir: 1 }); b.dead = true; }
    }
    const seenP = new Set((m.players || []).map((p) => p.id));
    for (const id of [...bodies.keys()]) if (!seenP.has(id)) dropBody(id);

    const seenE = new Set();
    for (const s of m.enemies || []) {
      seenE.add(s.id);
      let f = foes.get(s.id);
      if (!f) {
        const ch = createCharacter(s.type, s.gun);
        hooks.scene.add(ch.root);
        f = { ch, pos: V(s.x, s.y, s.z), rot: s.rot, dead: false, emerge: s.emerge || 0, sniper: !!s.sniper, speed: 0 };
        foes.set(s.id, f);
      }
      const prev = f.pos.clone();
      f.pos.set(s.x, s.y, s.z);
      f.rot = s.rot;
      f.emerge = s.emerge || 0;
      f.speed = prev.distanceTo(f.pos) / Math.max(SNAP_DT, 0.016);
      f.pitch = s.pitch || 0;
      if (s.dead && !f.dead) { f.ch.die({ dir: s.fall || 1, headshot: !!s.head }); f.dead = true; }
    }
    for (const [id, f] of foes) if (!seenE.has(id)) { f.ch.root.removeFromParent(); f.ch.dispose(); foes.delete(id); }

    syncProps('nades', m.nades || [], nadeGeo, nadeMat, 1);
    syncProps('rockets', m.rockets || [], rocketGeo, rocketMat, 1);
    if (m.wave != null) hooks.applyWave(m);
  }

  function syncProps(kind, list, geo, mat) {
    const ids = new Set();
    for (const s of list) {
      const key = kind + s.id;
      ids.add(key);
      let p = props.get(key);
      if (!p) {
        const mesh = new THREE.Mesh(geo, mat);
        hooks.scene.add(mesh);
        p = { mesh, x: s.x, y: s.y, z: s.z };
        props.set(key, p);
      }
      p.mesh.position.set(s.x, s.y, s.z);
      p.x = s.x; p.y = s.y; p.z = s.z;
    }
    for (const [key, p] of props) {
      if (!key.startsWith(kind) || ids.has(key)) continue;
      explosionFx(V(p.x, p.y, p.z), kind === 'rockets' ? 0.7 : 1);
      p.mesh.removeFromParent();
      props.delete(key);
    }
  }

  function mirrorPeers() {
    const seen = new Set();
    for (const p of peers.values()) {
      if (!p.ready || !p.seenAt) continue;
      seen.add(p.id);
      const b = ensureBody(p.id, p.name);
      b.x = p.x; b.y = p.y; b.z = p.z; b.yaw = p.yaw;
      b.goal = p;
      if (WEAPONS_OK.has(p.weapon) && p.weapon !== b.weapon) { b.body.setWeapon(p.weapon); b.weapon = p.weapon; }
      if (p.alive && b.dead) { b.body.revive(); b.dead = false; }
      if (!p.alive && !b.dead) { b.body.die({ dir: 1 }); b.dead = true; }
    }
    for (const id of [...bodies.keys()]) if (!seen.has(id)) dropBody(id);
  }

  function updateBodies(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (const b of bodies.values()) {
      const s = b.goal;
      if (!s) continue;
      if (b.placed && role === 'client') {
        b.x += (s.x - b.x) * k;
        b.y += (s.y - b.y) * k;
        b.z += (s.z - b.z) * k;
        b.yaw = lerpA(b.yaw, s.yaw, k);
      }
      b.body.root.position.set(b.x, b.y, b.z);
      b.body.root.rotation.y = b.yaw + Math.PI;
      if (b.dead) { b.body.update(dt, null); continue; }
      const fwd = (s.vx || 0) * -Math.sin(s.yaw) + (s.vz || 0) * -Math.cos(s.yaw);
      b.body.update(dt, {
        speed: Math.hypot(s.vx || 0, s.vz || 0), back: fwd < -0.3,
        pitch: s.pitch || 0, crouch: !!s.crouch, sprint: !!s.sprint, ads: s.ads || 0,
        reloadP: -1, empty: false, kick: 0, switchK: 0, nade: null,
        knife: s.weapon === 'karambit', stab: -1, prone: !!s.prone, inspect: -1, ifak: -1,
      });
    }
    for (const f of foes.values()) {
      f.ch.root.position.set(f.pos.x, f.pos.y - (f.emerge > 0 ? 1.9 * Math.min(1, f.emerge / 1.4) : 0), f.pos.z);
      f.ch.root.rotation.y = f.rot;
      f.ch.update(dt, f.dead || f.emerge > 0 ? 0 : f.speed, f.pitch || 0, !f.dead && f.emerge <= 0);
    }
  }

  function myPose() {
    const p = hooks.getPlayer();
    const S = hooks.getState();
    const w = p.weapons && p.weapons[p.cur];
    return {
      t: 'pose',
      x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch + (p.recoilP || 0),
      vx: p.vel.x, vz: p.vel.z, crouch: !!p.crouch, prone: !!p.prone, sprint: !!p.sprinting,
      ads: S.adsT || 0, eye: p.eye, weapon: w ? w.id : 'tavor',
    };
  }

  function buildSnap() {
    const p = hooks.getPlayer();
    const S = hooks.getState();
    const w = p.weapons && p.weapons[p.cur];
    const players = [{
      id: 0, name: myName, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch,
      vx: p.vel.x, vz: p.vel.z, crouch: !!p.crouch, prone: !!p.prone, sprint: !!p.sprinting,
      ads: S.adsT || 0, weapon: w ? w.id : 'tavor', hp: p.hp, alive: S.state === 'playing' || S.state === 'paused',
    }];
    for (const q of peers.values()) {
      players.push({
        id: q.id, name: q.name, x: q.x, y: q.y, z: q.z, yaw: q.yaw, pitch: q.pitch,
        vx: q.vx, vz: q.vz, crouch: q.crouch, prone: q.prone, sprint: q.sprint,
        ads: q.ads, weapon: q.weapon, hp: q.hp, armor: q.armor, alive: q.alive && q.ready,
      });
    }
    const enemies = hooks.enemies().map((e) => ({
      id: e.nid, type: e.typeId, gun: e.t.gun, sniper: !!e.t.sniper,
      x: e.pos.x, y: e.pos.y, z: e.pos.z, rot: e.rot, emerge: Math.max(0, e.emerge || 0),
      dead: !!e.dead, fall: e.fallDir || 1, head: !!e.headDead, pitch: 0,
    }));
    return {
      t: 'snap', players, enemies,
      nades: hooks.grenades().map((g) => ({ id: g.gid, x: g.pos.x, y: g.pos.y, z: g.pos.z })),
      rockets: hooks.rockets().map((r) => ({ id: r.rid, x: r.m.position.x, y: r.m.position.y, z: r.m.position.z })),
      wave: S.wave, intermission: S.intermission, alive: S.alive, toSpawn: S.toSpawn,
    };
  }

  function onMessage(packet) {
    const m = packet.data;
    if (!m || typeof m !== 'object') return;
    if (role === 'host') {
      if (m.t === 'leave') { forgetPeer(packet.from); refreshStatus(); return; }
      if (m.t === 'server-down') { status('The console server stopped.'); return; }
      if (m.t === 'cmd') {
        send({ t: 'cmd-reply', text: runCommand(m.line) }, 'server');
        return;
      }
      onClientMessage(packet.from, m);
      return;
    }
    if (m.t === 'welcome') { myId = m.id; live = !!m.live; status(`Joined. ${live ? 'The mission is underway.' : 'Waiting for the host to deploy.'}`); if (live && cls) enter(); }
    else if (m.t === 'begin') {
      live = true; spawn = m;
      try {
        if (cls) enter();
        else status('The host is deploying. Choose a class and deploy.');
      } catch (err) { window.__netErr = String(err && err.stack || err); }
    }
    else if (m.t === 'snap') takeSnap(m);
    else if (m.t === 'marker') {
      hooks.hitmarker(!!m.kill, !!m.head);
      if (hooks.noteHit) hooks.noteHit();
      if (m.tally) hooks.creditKill(!!m.head, !!m.nade, m.pts | 0);
    }
    else if (m.t === 'feed') hooks.killLine(m.id === myId ? 'You' : (m.name || 'Ally'), m.weapon || 'Weapon', m.enemy || 'Militant', !!m.head);
    else if (m.t === 'notice' && m.text) hooks.notice(m.text);
    else if (m.t === 'full') { status('That mission is full (4 players).'); stop(); }
    else if (m.t === 'closed') { if (role === 'client') { status('Lost the host.'); hooks.disconnected(); role = null; } }
    else if (m.t === 'menu') { live = false; cls = null; clearWorld(); hooks.backToMenu(); }
  }

  function enter() {
    if (!cls || !spawn) return;
    hooks.enter(cls, spawn);
    status(`In the mission with ${myName}.`);
  }

  if (bridge) off = bridge.onMessage(onMessage);

  const api = {
    get online() { return role === 'host' || role === 'client'; },
    get isHost() { return role === 'host'; },
    get isClient() { return role === 'client'; },
    get available() { return !!bridge; },
    targets,
    roster,
    enemyMarks,
    debug() {
      return { role, id: myId, peers: peers.size, bodies: bodies.size, foes: foes.size, live };
    },
    livingAllies() {
      const out = [];
      if (role === 'host') {
        for (const p of peers.values()) if (p.alive && p.seenAt) out.push({ name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, eye: p.eye || 1.6 });
      } else {
        for (const b of bodies.values()) if (b.goal && b.goal.alive !== false) out.push({ name: b.goal.name || 'Ally', x: b.x, y: b.y, z: b.z, yaw: b.yaw, eye: 1.6 });
      }
      return out;
    },
    selfName() { return myName; },
    peerMarks() {
      const out = [];
      for (const b of bodies.values()) if (b.goal && b.goal.alive !== false) out.push(b.body.root.position);
      return out;
    },
    async host(name) {
      if (!bridge) return;
      myName = String(name || 'Soldier').slice(0, 16) || 'Soldier';
      if (bridge.mission) {
        const attached = await bridge.mission('ws://127.0.0.1:' + NET_PORT);
        if (attached) {
          role = 'host';
          myId = 0;
          window.__netWhere = attached.ips || [];
          refreshStatus();
          return;
        }
      }
      const info = await bridge.host();
      role = 'host';
      myId = 0;
      window.__netWhere = info.ips;
      refreshStatus();
    },
    async join(name, address) {
      if (!bridge) return;
      myName = String(name || 'Soldier').slice(0, 16) || 'Soldier';
      let addr = String(address || '').trim();
      if (!addr) throw new Error('empty');
      if (!addr.includes('://')) addr = 'ws://' + addr;
      if (!/:\d+$/.test(addr.replace(/^wss?:\/\//, '').replace(/\/.*$/, '')) && !addr.includes(':' + NET_PORT)) {
        addr = addr.replace(/\/$/, '') + ':' + NET_PORT;
      }
      status('Connecting…');
      await bridge.connect(addr);
      role = 'client';
      send({ t: 'hello', name: myName });
    },
    stop() {
      if (bridge) bridge.stop();
      role = null; live = false; peers.clear(); clearWorld();
      status('');
    },
    hostBegan() {
      live = true;
      for (const p of peers.values()) if (p.ready) { p.alive = true; p.hp = 100; p.armor = p.armorMax; send(beginMsg(p.id), p.id); }
    },
    missionEnded() {
      live = false;
      if (role === 'host') send({ t: 'menu' });
    },
    ready(next) { cls = next; send({ t: 'ready', cls: next.id, armor: next.armor, name: myName }); },
    sendPoseBurst() { if (role === 'client' && hooks.getState().state === 'playing') send(myPose()); },
    send(data, to) { send(data, to); },
    hurt(id, amount, _from, explosive) {
      const p = peers.get(id);
      if (!p || !p.alive) return;
      let a = amount;
      if (p.armor > 0) {
        const taken = Math.min(p.armor, a * (explosive ? 0.45 : 0.65));
        p.armor -= taken;
        a -= taken;
      }
      p.hp -= a;
      if (p.hp <= 0) { p.hp = 0; p.alive = false; }
    },
    reviveHumans() {
      for (const p of peers.values()) if (p.ready && !p.alive) { p.hp = 100; p.armor = p.armorMax; p.alive = true; }
    },
    depart() { if (role === 'client') send({ t: 'leave' }); },
    resetWorld() { clearWorld(); },
    centroid(out) {
      let n = 0;
      out.set(0, 0, 0);
      const p = hooks.getPlayer();
      const st = hooks.getState().state;
      if (st === 'playing' || st === 'paused') { out.add(p.pos); n++; }
      for (const q of peers.values()) if (q.alive) { out.x += q.x; out.z += q.z; n++; }
      if (!n) return false;
      out.multiplyScalar(1 / n);
      return true;
    },
    tick(dt) {
      if (role === 'host') {
        for (const [id, m] of poses) { const p = peers.get(id); if (p) applyPose(p, m); }
        poses.clear();
        while (inbox.length) { const item = inbox.shift(); onClientMessage(item.id, item.m); }
        const sim = hooks.getState().state;
        if (sim === 'playing' || sim === 'dead' || sim === 'paused') {
          snapT += dt;
          if (snapT >= SNAP_DT) { snapT = 0; send(buildSnap()); }
          mirrorPeers();
          updateBodies(dt);
        }
      } else if (role === 'client') {
        updateBodies(dt);
        const st = hooks.getState().state;
        if (st === 'playing') {
          poseT += dt;
          if (poseT >= POSE_DT) { poseT = 0; send(myPose()); }
        }
      }
    },
  };

  // Poses are collapsed to the newest one so a lagging frame cannot replay old movement.
  const raw = onMessage;
  if (bridge) {
    off && off();
    off = bridge.onMessage((packet) => {
      const m = packet.data;
      if (role === 'host' && m && m.t === 'pose') { poses.set(packet.from, m); return; }
      if (role === 'host' && m && (m.t === 'cmd' || m.t === 'server-down')) { raw(packet); return; }
      if (role === 'host' && m && m.t !== 'hello' && m.t !== 'ready' && m.t !== 'leave') { inbox.push({ id: packet.from, m }); return; }
      raw(packet);
    });
  }
  return api;
}
