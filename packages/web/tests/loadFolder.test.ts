import { describe, expect, it } from 'vitest';
import { readAllD2 } from '../src/sources/loadFolder.js';
import type { DataSource } from '@daedalus/shared';

class StubSource implements DataSource {
  readonly kind = 'stub';
  readonly rootPath = '/test';
  constructor(private readonly files: Record<string, string>) {}
  async listD2Files(): Promise<string[]> {
    return Object.keys(this.files);
  }
  async readFile(path: string): Promise<string> {
    const v = this.files[path];
    if (v === undefined) throw new Error(`unknown ${path}`);
    return v;
  }
  async readSidecar(): Promise<string | null> {
    return null;
  }
  async writeSidecar(): Promise<void> {}
  subscribe(): () => void {
    return () => undefined;
  }
}

describe('readAllD2', () => {
  it('returns a path→contents map for every file the source lists', async () => {
    const source = new StubSource({ 'index.d2': 'a -> b', 'extras/x.d2': 'c -> d' });
    expect(await readAllD2(source)).toEqual({
      'index.d2': 'a -> b',
      'extras/x.d2': 'c -> d',
    });
  });

  it('returns an empty map for an empty source', async () => {
    expect(await readAllD2(new StubSource({}))).toEqual({});
  });
});
