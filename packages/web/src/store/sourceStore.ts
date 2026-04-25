import { create } from 'zustand';
import type { DataSource } from '@daedalus/shared';
import type { D2ParseError } from '@daedalus/shared/d2';

export interface SourceState {
  source: DataSource | null;
  rootPath: string | null;
  entryPath: string;
  cachedFiles: Record<string, string>;
  errors: D2ParseError[];
  isLoading: boolean;
  setSource(source: DataSource | null): void;
  setEntry(path: string): void;
  setFiles(files: Record<string, string>): void;
  setErrors(errors: D2ParseError[]): void;
  setLoading(loading: boolean): void;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  source: null,
  rootPath: null,
  entryPath: 'index.d2',
  cachedFiles: {},
  errors: [],
  isLoading: false,
  setSource: (source) => {
    const prev = get().source;
    if (prev === source) return;
    // Two source instances pointing at the same path share the same Rust
    // watcher. Disposing the old one would tear down the watcher the new
    // instance is relying on. This matters under React StrictMode, where the
    // auto-restore effect double-mounts and produces two sources for the
    // saved path within the same render cycle.
    if (prev && prev.rootPath !== source?.rootPath) {
      void prev.dispose?.();
    }
    set({ source, rootPath: source?.rootPath ?? null });
  },
  setEntry: (entryPath) => set({ entryPath }),
  setFiles: (cachedFiles) => set({ cachedFiles }),
  setErrors: (errors) => set({ errors }),
  setLoading: (isLoading) => set({ isLoading }),
}));
