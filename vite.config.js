import path from 'node:path';
import { defineConfig } from 'vite';

// Release chunks. main.js awaits its level and room modules at the top level, so a lazily
// loaded chunk must never import from the entry chunk: that import waits for the entry to
// finish evaluating, which is waiting for the lazy chunk — a deadlock with no error and no
// pending request (5 of the 6 levels hung in the build, never in dev). So the entry chunk
// holds main.js alone: the rest of what it imports statically goes to `app`, and the
// libraries to `vendor` (three / postprocessing / n8ao: unchanged between releases, so a
// returning visitor keeps them cached). Modules only a room or a level needs stay lazy.
function manualChunks() {
  let eager = null; // the entry's static import graph
  let page = null; // index.html and the script it loads (main.js)
  return (id, { getModuleIds, getModuleInfo }) => {
    if (!eager) {
      const entries = [...getModuleIds()].filter((m) => getModuleInfo(m)?.isEntry);
      page = new Set(entries.flatMap((m) => [m, ...getModuleInfo(m).importedIds.filter((d) => !/node_modules|^\0/.test(d))]));
      eager = new Set();
      const todo = [...entries];
      while (todo.length) {
        const m = todo.pop();
        if (eager.has(m)) continue;
        eager.add(m);
        todo.push(...(getModuleInfo(m)?.importedIds ?? []));
      }
    }
    if (!eager.has(id)) return undefined;
    // (named too: left to itself, Rollup folds the page's script into app)
    if (page.has(id)) return 'main';
    return /[\\/]node_modules[\\/]/.test(id) ? 'vendor' : 'app';
  };
}

export default defineConfig({
  base: './',
  server: { port: 5190, host: '127.0.0.1', strictPort: true },
  build: {
    // main.js awaits a room module at the top level (?view=<sample>)
    target: 'es2022',
    rollupOptions: { output: { manualChunks: manualChunks() } },
    // vendor is three + postprocessing + n8ao: one big file on purpose
    chunkSizeWarningLimit: 1200,
  },
  plugins: [releaseAssets()],
});

// after bundling: fail the build if a chunk imports the entry (tools/check_chunks.mjs),
// then the shipped assets (the copy of public/assets in outDir; public/ is never touched):
// only what the game loads, glTFs compressed (tools/optimize_assets.mjs).
// RAW_ASSETS=1 skips the assets (a build with them exactly as in dev, for comparisons), and
// so does `--mode check` (npm run check: only whether it builds and its chunks are safe).
function releaseAssets() {
  let outDir;
  let mode;
  return {
    name: 'release-assets',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
      mode = c.mode;
    },
    async closeBundle() {
      // (a URL, not a literal: Vite would bundle the tools into the config, away from their files)
      const tool = (f) => import(new URL(`./tools/${f}`, import.meta.url).href);
      (await tool('check_chunks.mjs')).checkChunks(outDir);
      if (process.env.RAW_ASSETS || mode === 'check') return;
      await (await tool('optimize_assets.mjs')).optimizeAssets(outDir);
    },
  };
}
