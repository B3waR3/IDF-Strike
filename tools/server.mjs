// Console host. Start it when you want a match: npm run server
// The game window still runs the mission. Press HOST and it attaches here.
// Friends connect to the address printed below. From another house, forward this port.
import { WebSocketServer } from 'ws';
import os from 'node:os';
import readline from 'node:readline';

const PORT = Number(process.env.PORT) || 27500;
const MAX_PLAYERS = 3;

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}

const HELP = [
  'help                         show these commands',
  'status                       wave, points, health',
  'players                      who has joined',
  'Add a player name, or all, at the end to affect someone else.',
  'god [on|off] [name|all]      damage immunity',
  'noclip [on|off] [name|all]   walk through walls. Space up, Ctrl down',
  'wallhack [on|off] [name|all] see hostiles through walls',
  'points <n> [name|all]        set points. points +<n> adds',
  'hp <n> [name|all]            set health',
  'armor <n> [name|all]         set armor',
  'give <weapon> [name|all]     tavor, m4, negev, m24, sniper, g28, glock, jericho, karambit',
  'freeze                       stop waves and hostiles',
  'unfreeze                     continue the fight',
  'wave <n>                     start that wave',
  'spawn <type> [count]         hamas, pij, rpg, or sniper, in front of you',
  'clear                        remove every hostile',
  'kick <name>                  drop a player',
  'say <text>                   message everyone',
].join('\n');

let mission = null;
const players = new Map();
let nextId = 1;
let rl = null;

function out(text) {
  if (!text) return;
  if (rl) process.stdout.write('\r\x1b[K');
  process.stdout.write(String(text).replace(/\n$/, '') + '\n');
  if (rl) rl.prompt(true);
}

function sendMission(packet) {
  if (mission && mission.readyState === 1) mission.send(JSON.stringify(packet));
}

function dropPlayer(sock) {
  const id = players.get(sock);
  if (id == null) return;
  players.delete(sock);
  out(`Player #${id} left.`);
  sendMission({ from: id, data: { t: 'leave' } });
}

function onMissionMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.to === 'server') {
    out(msg.data && msg.data.text);
    return;
  }
  const body = JSON.stringify(msg.data ?? {});
  for (const [sock, id] of players) {
    if (sock.readyState !== 1) continue;
    if (msg.to === 'all' || msg.to === id) sock.send(body);
  }
}

function ask(line) {
  const text = String(line || '').trim();
  if (!text) return;
  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (cmd === 'help' || cmd === '?') { out(HELP); return; }
  if (cmd === 'quit' || cmd === 'exit') { shutdown(); return; }
  if (!mission || mission.readyState !== 1) {
    out('Open the game and press HOST first.');
    return;
  }
  sendMission({ from: 0, data: { t: 'cmd', line: text } });
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const closed = JSON.stringify({ t: 'closed' });
  for (const sock of players.keys()) {
    if (sock.readyState === 1) sock.send(closed);
    sock.close();
  }
  players.clear();
  if (mission) { mission.close(); mission = null; }
  if (rl) rl.close();
  server.close();
  process.exit(0);
}

const server = new WebSocketServer({ host: '0.0.0.0', port: PORT });
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Close the other host and try again.`);
  else console.error(err.message || err);
  process.exit(1);
});
server.on('connection', (sock) => {
  let kind = null;
  sock.on('message', (buf) => {
    if (buf.length > 500000) return;
    let data;
    try { data = JSON.parse(buf.toString()); } catch { return; }
    if (!kind) {
      if (data && data.t === 'mission') {
        if (mission && mission.readyState === 1) {
          sock.send(JSON.stringify({ t: 'full' }));
          sock.close();
          return;
        }
        kind = 'mission';
        mission = sock;
        sock.send(JSON.stringify({ t: 'mission-ok', ips: lanIps(), port: PORT }));
        out('Game attached. The mission runs in that window.');
        return;
      }
      if (players.size >= MAX_PLAYERS) {
        sock.send(JSON.stringify({ t: 'full' }));
        sock.close();
        return;
      }
      kind = 'player';
      const id = nextId++;
      players.set(sock, id);
      if (!mission || mission.readyState !== 1) {
        sock.send(JSON.stringify({ t: 'closed' }));
        players.delete(sock);
        sock.close();
        out('Someone tried to join before the game pressed HOST.');
        return;
      }
    }
    if (kind === 'mission') { onMissionMessage(buf); return; }
    const id = players.get(sock);
    if (id == null) return;
    if (data && data.t === 'hello' && data.name) out(`${String(data.name).slice(0, 16)} joined (#${id}).`);
    sendMission({ from: id, data });
  });
  const gone = () => {
    if (sock === mission) {
      mission = null;
      out('The game disconnected. Press HOST again to attach.');
      const closed = JSON.stringify({ t: 'closed' });
      const peers = [...players.keys()];
      players.clear();
      for (const peer of peers) {
        if (peer.readyState === 1) peer.send(closed);
        peer.close();
      }
      return;
    }
    dropPlayer(sock);
  };
  sock.on('close', gone);
  sock.on('error', gone);
});

server.on('listening', () => {
  const ips = lanIps();
  console.log('');
  console.log('IDF Strike server');
  console.log(`Listening on port ${PORT}`);
  console.log('');
  console.log('Friends on your network join:');
  if (ips.length) for (const ip of ips) console.log(`  ${ip}:${PORT}`);
  else console.log('  (no LAN address found)');
  console.log('');
  console.log('From another house, forward port ' + PORT + ' on your router to this PC');
  console.log('and give them your public address. Tailscale is not required.');
  console.log('');
  console.log('Open the game and press HOST. Type help for test commands.');
  console.log('');
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', ask);
  rl.on('close', shutdown);
});

process.on('SIGINT', shutdown);
