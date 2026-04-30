// Dev wrapper: runs sync-wasm then spawns Vite, but forwards SIGTERM/SIGINT
// gracefully so Tauri's "kill the beforeDevCommand on quit" doesn't surface
// as a pnpm error. Without this, closing the app prints
//   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL ... Command failed with signal "SIGTERM"
// every time. Vite itself exits cleanly; the noise is just the wrapping
// shell propagating the signal as a non-zero exit.
//
// We treat SIGTERM/SIGINT as a graceful shutdown (exit 0); any other failure
// from Vite still bubbles up.

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// The package root (packages/web). Tauri's beforeDevCommand runs us from
// packages/desktop/src-tauri/, but Vite needs to find vite.config.ts in the
// web package, so we resolve and pass an explicit cwd to the child process.
const packageRoot = resolve(here, '..');

// Run sync-wasm synchronously first so Vite starts with the wasm in place.
execSync(`node ${JSON.stringify(here + '/sync-wasm.mjs')}`, {
  stdio: 'inherit',
  cwd: packageRoot,
});

// Resolve Vite's CLI entry from this package's node_modules. Spawning `vite`
// by name relies on PATH which only includes node_modules/.bin under pnpm —
// when Tauri invokes us directly that bin dir isn't there, so we use the
// absolute path instead. Vite 6's `exports` map omits `./bin/vite.js`, so
// we resolve the package.json (which IS exported) and join the `bin.vite`
// path manually. Same pattern `resolve-bin` and other tools use.
const require = createRequire(import.meta.url);
const vitePkgPath = require.resolve('vite/package.json');
const vitePkg = require(vitePkgPath);
const binRel = typeof vitePkg.bin === 'string' ? vitePkg.bin : vitePkg.bin.vite;
const viteBin = resolve(dirname(vitePkgPath), binRel);

const vite = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: packageRoot,
});

let shuttingDown = false;
const forward = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  // Forward the signal so Vite gets a chance to clean up. If it's already
  // gone, this throws — ignore.
  try {
    vite.kill(signal);
  } catch {
    /* already exited */
  }
};

process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));

vite.on('exit', (code, signal) => {
  // Tauri's `beforeDevCommand` shutdown sends SIGTERM; treat that (and
  // Ctrl-C / SIGINT) as a graceful exit so pnpm doesn't report a failure.
  if (signal === 'SIGTERM' || signal === 'SIGINT' || shuttingDown) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
