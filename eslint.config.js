import js from '@eslint/js';
import globals from 'globals';

// `npm run check` = this + a build. The rules that matter here are the recommended ones —
// no-undef above all: a module that uses a name it forgot to import only fails when the
// page that loads it runs (2026-09-30: the bookshop level didn't load after a move).
const rules = {
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'shots/**', '.tmp/**', 'mock-*.html'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
    rules,
  },
  {
    files: ['tools/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules,
  },
];
