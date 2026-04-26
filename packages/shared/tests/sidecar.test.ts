import { describe, expect, it } from 'vitest';
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setEntry,
  getEntry,
} from '../src/sidecar/io.js';
import type { Layout } from '../src/model/types.js';

const layout: Layout = {
  version: 1,
  grid: { size: 16, cols: 80, rows: 50 },
  viewport: { zoom: 1, panX: 0, panY: 0, theme: 'slate' },
  settings: {
    routing: { shapeBuffer: 16, leadOut: 16, nudging: 16 },
    export: { margin: 16, showGrid: false },
  },
  nodes: {
    a: { x: 0, y: 0, w: 96, h: 64, connections: { top: [], right: [], bottom: [], left: [] } },
  },
  edges: {},
  unplaced: [],
};

describe('sidecar IO', () => {
  it('round-trips a layout', () => {
    const file = setEntry(emptySidecar(), 'index.d2', layout);
    const text = serializeSidecar(file);
    const parsed = parseSidecar(text);
    expect(getEntry(parsed, 'index.d2')).toEqual(layout);
  });

  it('rejects malformed payloads', () => {
    expect(() => parseSidecar('{"entries":{"x":{"version":2}}}')).toThrow();
  });

  it('treats empty input as empty sidecar', () => {
    const parsed = parseSidecar('{}');
    expect(parsed.entries).toEqual({});
  });
});
