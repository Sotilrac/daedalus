import { readDir, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { DataSource, FolderChange } from '@daedalus/shared';
import { SIDECAR_FILENAME } from '@daedalus/shared/sidecar';

const FOLDER_CHANGED_EVENT = 'daedalus-folder-changed';

export async function pickFolderViaTauri(): Promise<string | null> {
  const result = await invoke<string | null>('pick_folder');
  return result ?? null;
}

export class TauriFolderSource implements DataSource {
  readonly kind = 'tauri-folder';
  // The Rust `watch_folder` command also grants fs-scope access to the
  // folder. We kick it off in the constructor and await it before any read,
  // so this source works whether the user picked the folder fresh (already
  // scoped) or we auto-restored from a saved path on startup.
  private readonly ready: Promise<unknown>;

  constructor(public readonly rootPath: string) {
    this.ready = invoke('watch_folder', { path: rootPath })
      .then(() => {
        console.info('[daedalus] watcher armed for', rootPath);
      })
      .catch((err) => {
        console.error('[daedalus] watch_folder failed', err);
      });
  }

  async listD2Files(): Promise<string[]> {
    await this.ready;
    return listD2Recursive(this.rootPath, '');
  }

  async readFile(path: string): Promise<string> {
    await this.ready;
    return readTextFile(joinPath(this.rootPath, path));
  }

  async readSidecar(): Promise<string | null> {
    await this.ready;
    const target = joinPath(this.rootPath, SIDECAR_FILENAME);
    if (!(await exists(target))) return null;
    return readTextFile(target);
  }

  async writeSidecar(text: string): Promise<void> {
    await this.ready;
    await writeTextFile(joinPath(this.rootPath, SIDECAR_FILENAME), text);
  }

  // Subscriptions are listener-scoped: unsubscribing only removes this
  // frontend listener, not the underlying watcher. Otherwise React StrictMode's
  // double-mount tears the watcher down between effect runs and the second
  // mount silently listens to a watcher that no longer exists. The Rust
  // watcher lives until `dispose()` is called.
  subscribe(listener: (changes: FolderChange[]) => void): () => void {
    let active = true;
    let unlisten: UnlistenFn | null = null;
    void this.ready
      .then(() =>
        listen<FolderChange[]>(FOLDER_CHANGED_EVENT, (event) => {
          console.info('[daedalus] folder-changed received', event.payload);
          if (active) listener(event.payload);
        }),
      )
      .then((u) => {
        console.info('[daedalus] folder-changed listener attached');
        if (active) unlisten = u;
        else u();
      })
      .catch((err) => {
        console.error('[daedalus] failed to attach folder-changed listener', err);
      });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }

  async dispose(): Promise<void> {
    await invoke('unwatch_folder', { path: this.rootPath }).catch(() => undefined);
  }
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

async function listD2Recursive(root: string, rel: string): Promise<string[]> {
  let entries;
  try {
    entries = await readDir(joinPath(root, rel));
  } catch (err) {
    // Folders the Tauri scope rejects (e.g. .git, .claude, anything outside
    // the granted directory) throw "forbidden path". Skip them silently so a
    // single restricted subdirectory doesn't break the whole listing.
    console.info('[daedalus] skipping unreadable directory', joinPath(root, rel), err);
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const sub = joinPath(rel, e.name);
    if (e.isDirectory) {
      out.push(...(await listD2Recursive(root, sub)));
    } else if (e.name.endsWith('.d2')) {
      out.push(sub);
    }
  }
  return out;
}
