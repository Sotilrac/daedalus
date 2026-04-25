import { readDir, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { DataSource, FolderChange } from '@daedalus/shared';
import { SIDECAR_FILENAME } from '@daedalus/shared/sidecar';

export async function pickFolderViaTauri(): Promise<string | null> {
  const result = await invoke<string | null>('pick_folder');
  return result ?? null;
}

export class TauriFolderSource implements DataSource {
  readonly kind = 'tauri-folder';

  constructor(public readonly rootPath: string) {}

  async listD2Files(): Promise<string[]> {
    return listD2Recursive(this.rootPath, '');
  }

  async readFile(path: string): Promise<string> {
    return readTextFile(joinPath(this.rootPath, path));
  }

  async readSidecar(): Promise<string | null> {
    const target = joinPath(this.rootPath, SIDECAR_FILENAME);
    if (!(await exists(target))) return null;
    return readTextFile(target);
  }

  async writeSidecar(text: string): Promise<void> {
    await writeTextFile(joinPath(this.rootPath, SIDECAR_FILENAME), text);
  }

  subscribe(listener: (changes: FolderChange[]) => void): () => void {
    let active = true;
    let unlisten: UnlistenFn | null = null;
    void invoke('watch_folder', { path: this.rootPath })
      .then(() => listen<FolderChange[]>('daedalus://folder-changed', (event) => {
        if (active) listener(event.payload);
      }))
      .then((u) => {
        if (active) unlisten = u;
        else u();
      });
    return () => {
      active = false;
      if (unlisten) unlisten();
      void invoke('unwatch_folder', { path: this.rootPath }).catch(() => undefined);
    };
  }
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');
}

async function listD2Recursive(root: string, rel: string): Promise<string[]> {
  const entries = await readDir(joinPath(root, rel));
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
