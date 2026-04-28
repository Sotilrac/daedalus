import { create } from 'zustand';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// Global hold for the in-flight or completed `check()` result. The plugin
// itself is fine to call repeatedly, but holding the `Update` lets the user
// trigger `downloadAndInstall` from the same handle the version-check used.

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; notes?: string }
  | { kind: 'downloading'; version: string; downloaded: number; total: number | null }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string };

interface UpdaterStore {
  status: UpdateStatus;
  // The handle returned by `check()`. We keep it around so the user can
  // download/install after seeing the indicator without re-checking.
  update: Update | null;
  checkForUpdate(): Promise<void>;
  downloadAndInstall(): Promise<void>;
}

// Tauri's updater is desktop-only. The web bundle is also served standalone
// in dev (Vite without the native shell) and during component tests, so guard
// behind the runtime marker rather than build-time defines.
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: { kind: 'idle' },
  update: null,
  async checkForUpdate() {
    if (!isTauri()) return;
    const current = get().status.kind;
    if (current === 'checking' || current === 'downloading' || current === 'installing') return;
    set({ status: { kind: 'checking' } });
    try {
      const update = await check();
      if (!update) {
        set({ status: { kind: 'up-to-date' }, update: null });
        return;
      }
      const next: UpdateStatus =
        update.body !== undefined
          ? { kind: 'available', version: update.version, notes: update.body }
          : { kind: 'available', version: update.version };
      set({ status: next, update });
    } catch (err) {
      console.error('[daedalus] update check failed', err);
      set({ status: { kind: 'error', message: String(err) }, update: null });
    }
  },
  async downloadAndInstall() {
    const { update, status } = get();
    if (!update || status.kind !== 'available') return;
    const version = status.version;
    set({ status: { kind: 'downloading', version, downloaded: 0, total: null } });
    try {
      let total: number | null = null;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          set({ status: { kind: 'downloading', version, downloaded: 0, total } });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          set({ status: { kind: 'downloading', version, downloaded, total } });
        } else if (event.event === 'Finished') {
          set({ status: { kind: 'installing', version } });
        }
      });
      // On macOS/Linux the new binary swap requires a relaunch we drive; on
      // Windows the installer exits and restarts the app itself. `relaunch`
      // is idempotent on Windows because the installer has already replaced
      // the running process.
      await relaunch();
    } catch (err) {
      console.error('[daedalus] update install failed', err);
      set({ status: { kind: 'error', message: String(err) } });
    }
  },
}));
