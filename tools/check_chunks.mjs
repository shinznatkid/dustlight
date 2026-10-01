// Fails a build whose chunks import the page's entry chunk. main.js awaits its level and
// room modules at the top level, so a lazy chunk importing the entry waits for the entry to
// finish, which waits for that chunk: the page hangs on the loading screen with no error and
// no request in flight (2026-09-30: 5 of the 6 levels, only in the build — dev doesn't
// bundle). vite.config.js's manualChunks keeps the entry chunk to main.js alone; this makes
// sure it stays that way. Any path of static imports back into the entry ends in a chunk
// importing it directly, so checking the direct imports of every chunk covers cycles too.
// Usage: node tools/check_chunks.mjs [dist]   (also run by the build: vite.config.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// static imports / re-exports of a built chunk ("./x.js"), not import("./x.js")
const STATIC = /\b(?:import|export)\s*(?!\()(?:[^"'();]*?\bfrom\s*)?["'](\.\.?\/[^"']+\.js)["']/g;

export function checkChunks(dist) {
  const html = fs.readdirSync(dist).filter((f) => f.endsWith('.html'));
  const entries = new Set();
  for (const h of html) {
    for (const m of fs.readFileSync(path.join(dist, h), 'utf8').matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
      entries.add(path.resolve(dist, m[1]));
    }
  }
  if (!entries.size) throw new Error(`check_chunks: no module <script> in ${dist}/*.html`);
  const js = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) js.push(p);
    }
  })(path.join(dist, 'assets'));
  const bad = [];
  for (const f of js) {
    if (entries.has(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(STATIC)) {
      const dep = path.resolve(path.dirname(f), m[1]);
      if (entries.has(dep)) bad.push(`${path.relative(dist, f)} imports the entry ${path.relative(dist, dep)}`);
    }
  }
  if (bad.length) {
    throw new Error(`check_chunks: ${bad.length} chunk(s) import the page's entry chunk — a lazily loaded level/room `
      + `would wait for main.js's top-level await forever (see vite.config.js manualChunks):\n  ${bad.join('\n  ')}`);
  }
  return { entries: entries.size, chunks: js.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  try {
    const r = checkChunks(dist);
    console.log(`check_chunks: ok (${r.chunks} chunks, none imports the entry)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
