// Imported first by every tool that opens a browser: drop this process to below-normal
// priority, which Windows hands down to the Edge it launches (and Edge to its GPU and
// renderer processes). A check running in the background then never starves the desktop
// of whoever is working on the machine (2026-09-30: two test runs at once plus another
// project's bot froze it — one browser tool at a time). On an idle machine it measures the same.
import os from 'node:os';

try {
  os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch { /* not allowed here: run at normal priority */ }
