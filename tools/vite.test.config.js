import { defineConfig } from 'vite';

// a test server without HMR: `npx vite --config tools/vite.test.config.js` → :5194, then the tools with
// --port=5194. Vite broadcasts a full reload to every open page when a src module changes, so
// an edit (yours or another process's) mid-run on :5190 reloads the page under test → a false FAIL; here
// nothing reloads, and each run still loads the files as they are (2026-09-30)
export default defineConfig({
  base: './',
  server: { port: 5194, host: '127.0.0.1', strictPort: true, hmr: false },
  cacheDir: 'node_modules/.vite-5194',
  build: { target: 'es2022' },
});
