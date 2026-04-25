// Copy libavoid's wasm into packages/web/public/ so Vite (dev) and the build
// output both serve it at the document root. Vite's plugin-emitFile path
// only works in build mode (`import.meta.ROLLUP_FILE_URL_*` isn't replaced
// in dev), so we sidestep that by using the public folder.

import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const entry = require.resolve('libavoid-js');
const src = resolve(dirname(entry), 'libavoid.wasm');
const dst = resolve(here, '..', 'public', 'libavoid.wasm');

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
const size = statSync(dst).size;
console.log(`[sync-wasm] copied ${src} -> ${dst} (${size} bytes)`);
