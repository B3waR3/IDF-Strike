// Desktop shell: serves the game from the app bundle over app://game/ (a standard, secure scheme, so ES
// modules, fetch and localStorage behave exactly as on http) and opens it full screen.
//   npm start                  run from source
//   npm start -- --windowed    start in a window instead of full screen
//   npm run dist               build the Windows installer into dist/
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const { WebSocketServer, WebSocket } = require('ws');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// Laptops with integrated + dedicated graphics otherwise hand the game to the integrated GPU.
app.commandLine.appendSwitch('force_high_performance_gpu');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// A second copy (for a co-op test on one PC) passes --instance and is allowed to run.
const extraInstance = process.argv.some((a) => a.startsWith('--instance'));
if (!extraInstance && !app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: !process.argv.includes('--windowed'),
    backgroundColor: '#000000',
    title: 'IDF Strike: Gaza',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });
  // The game never navigates; keep it that way.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL('app://game/index.html');
}

const NET_PORT = 27500;
const MAX_JOINERS = 3;
let wss = null;
let clientSock = null;
const sockets = new Map();
let nextPeer = 1;

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}
function toGame(msg) {
  if (win && !win.isDestroyed()) win.webContents.send('net-msg', msg);
}
function stopNet() {
  for (const sock of sockets.keys()) sock.close();
  sockets.clear();
  if (wss) { wss.close(); wss = null; }
  if (clientSock) { clientSock.close(); clientSock = null; }
  nextPeer = 1;
}

ipcMain.handle('net-host', () => new Promise((resolve, reject) => {
  if (wss) { resolve({ port: NET_PORT, ips: lanIps() }); return; }
  stopNet();
  const server = new WebSocketServer({ host: '0.0.0.0', port: NET_PORT });
  server.once('error', reject);
  server.once('listening', () => {
    wss = server;
    resolve({ port: NET_PORT, ips: lanIps() });
  });
  server.on('connection', (sock) => {
    if (sockets.size >= MAX_JOINERS) {
      sock.send(JSON.stringify({ t: 'full' }));
      sock.close();
      return;
    }
    const id = nextPeer++;
    sockets.set(sock, id);
    sock.on('message', (buf) => {
      if (buf.length > 200000) return;
      let data;
      try { data = JSON.parse(buf.toString()); } catch { return; }
      toGame({ from: id, data });
    });
    const gone = () => {
      if (!sockets.has(sock)) return;
      sockets.delete(sock);
      toGame({ from: id, data: { t: 'leave' } });
    };
    sock.on('close', gone);
    sock.on('error', gone);
  });
}));

ipcMain.handle('net-connect', (_event, url) => new Promise((resolve, reject) => {
  stopNet();
  const sock = new WebSocket(url);
  const timer = setTimeout(() => { sock.close(); reject(new Error('timed out')); }, 5000);
  sock.on('open', () => { clearTimeout(timer); clientSock = sock; resolve(true); });
  sock.on('error', (err) => { clearTimeout(timer); reject(new Error(err.message || 'connect failed')); });
  sock.on('message', (buf) => {
    if (buf.length > 500000) return;
    let data;
    try { data = JSON.parse(buf.toString()); } catch { return; }
    toGame({ from: 0, data });
  });
  sock.on('close', () => {
    if (clientSock === sock) clientSock = null;
    toGame({ from: 0, data: { t: 'closed' } });
  });
}));

ipcMain.on('net-send', (_event, payload) => {
  const raw = JSON.stringify(payload.data);
  if (wss) {
    for (const [sock, id] of sockets) {
      if (sock.readyState !== WebSocket.OPEN) continue;
      if (payload.to === 'all' || payload.to === id) sock.send(raw);
    }
  } else if (clientSock && clientSock.readyState === WebSocket.OPEN) clientSock.send(raw);
});

ipcMain.handle('net-stop', () => { stopNet(); return true; });

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
