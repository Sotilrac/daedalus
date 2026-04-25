export interface FolderChange {
  path: string;
  kind: 'created' | 'modified' | 'removed';
}

export interface DataSource {
  readonly kind: string;
  readonly rootPath: string;
  listD2Files(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  readSidecar(): Promise<string | null>;
  writeSidecar(text: string): Promise<void>;
  subscribe(listener: (changes: FolderChange[]) => void): () => void;
}
