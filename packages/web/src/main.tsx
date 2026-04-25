import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { setLibavoidWasmUrl } from '@daedalus/shared/routing';
import './styles/tokens.css';
import './styles/app.css';

// libavoid.wasm lives in packages/web/public/ (synced by scripts/sync-wasm.mjs
// before dev/build). Vite serves files in public/ at the base URL in both
// modes, so a relative path resolves correctly under tauri:// at runtime.
setLibavoidWasmUrl(`${import.meta.env.BASE_URL}libavoid.wasm`);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
