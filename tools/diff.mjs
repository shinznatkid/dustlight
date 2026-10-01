// Pixel diff of two screenshots, for catching visual regressions.
// Usage: node tools/diff.mjs a.png b.png [out.png] [--thr=12]
//   prints mean |Δ| (0..255), % of pixels whose max channel Δ > thr, and the worst Δ;
//   out.png (optional) = heat map: grey copy of a, changed pixels in red by strength
import fs from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const thr = +(args.find((a) => a.startsWith('--thr='))?.slice(6) ?? 12);
const [a, b] = files.slice(0, 2).map((f) => PNG.sync.read(fs.readFileSync(f)));
if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch');

const out = new PNG({ width: a.width, height: a.height });
let sum = 0;
let over = 0;
let worst = 0;
const n = a.width * a.height;
for (let i = 0; i < n * 4; i += 4) {
  const d = Math.max(
    Math.abs(a.data[i] - b.data[i]),
    Math.abs(a.data[i + 1] - b.data[i + 1]),
    Math.abs(a.data[i + 2] - b.data[i + 2]),
  );
  sum += d;
  if (d > thr) over++;
  if (d > worst) worst = d;
  const g = (a.data[i] * 0.3 + a.data[i + 1] * 0.59 + a.data[i + 2] * 0.11) * 0.35;
  const k = Math.min(1, d / 48);
  out.data[i] = g + (255 - g) * k;
  out.data[i + 1] = g * (1 - k);
  out.data[i + 2] = g * (1 - k);
  out.data[i + 3] = 255;
}
console.log(`mean ${(sum / n).toFixed(2)} · >${thr}: ${(over / n * 100).toFixed(2)}% · worst ${worst}`);
if (files[2]) fs.writeFileSync(files[2], PNG.sync.write(out));
