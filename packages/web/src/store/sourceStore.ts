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

export const useSourceStore = create<SourceState>((set) => ({
  source: null,
  rootPath: null,
  entryPath: 'index.d2',
  cachedFiles: {},
  errors: [],
  isLoading: false,
  setSource: (source) => set({ source, rootPath: source?.rootPath ?? null }),
  setEntry: (entryPath) => set({ entryPath }),
  setFiles: (cachedFiles) => set({ cachedFiles }),
  setErrors: (errors) => set({ errors }),
  setLoading: (isLoading) => set({ isLoading }),
}));
