// Copies three.js out of node_modules into vendor/three so the game runs offline (browser and desktop
// app): the core build plus every `three/addons/...` module the game imports and whatever those import.
// Run after changing the three version: `npm run vendor`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'node_modules', 'three');
const out = path.join(root, 'vendor', 'three');
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const specs = new Set();
for (const f of fs.readdirSync(path.join(root, 'src'))) {
  if (!f.endsWith('.js')) continue;
  for (const m of fs.readFileSync(path.join(root, 'src', f), 'utf8').matchAll(IMPORT)) {
    const s = m[1] || m[2];
    if (s.startsWith('three/addons/')) specs.add(path.join(pkg, 'examples', 'jsm', s.slice('three/addons/'.length)));
  }
}

const files = new Set([path.join(pkg, 'build', 'three.module.js')]);
const queue = [...specs];
while (queue.length) {
  const file = queue.pop();
  if (files.has(file)) continue;
  files.add(file);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
    const s = m[1] || m[2];
    if (s.startsWith('.')) queue.push(path.resolve(path.dirname(file), s));
  }
}

fs.rmSync(out, { recursive: true, force: true });
for (const file of files) {
  const dest = path.join(out, path.relative(pkg, file));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
}
fs.copyFileSync(path.join(pkg, 'LICENSE'), path.join(out, 'LICENSE'));
const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
console.log(`three ${version}: ${files.size} files -> ${path.relative(root, out)}`);
