// Decodes an image data URL returned by a CDP Runtime.evaluate dump: node tools/cdpimg.mjs <dump.json> <out.jpg>
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
const text = readFileSync(src, 'utf8');
const m = text.match(/data:image\/\w+;base64,([A-Za-z0-9+/=]+)/);
if (!m) throw new Error('no data URL in ' + src);
writeFileSync(out, Buffer.from(m[1], 'base64'));
console.log('wrote', out);
console.log(text.replace(/data:image\/\w+;base64,[A-Za-z0-9+/=]+/, '<image>').slice(0, 1500));
