import { describe, expect, it } from 'vitest';
import type { Layout, Model } from '../src/model/types.js';
import { reconcileLayout } from '../src/layout/reconcile.js';

function baseModel(): Model {
  return {
    nodes: {
      a: { label: 'A', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
      b: { label: 'B', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
    },
    edges: { 'a->b#0': { from: 'a', to: 'b', style: {} } },
  };
}

function baseLayout(): Layout {
  return {
    version: 1,
    grid: { size: 16, cols: 80, rows: 50 },
    viewport: { zoom: 1, panX: 0, panY: 0, theme: 'blueprint' },
    settings: {
      routing: { shapeBuffer: 16, leadOut: 16, nudging: 16 },
      export: { margin: 16, showGrid: false },
    },
    nodes: {
      a: {
        x: 0,
        y: 0,
        w: 96,
        h: 64,
        connections: { top: [], right: ['a->b#0'], bottom: [], left: [] },
      },
      b: {
        x: 256,
        y: 0,
        w: 96,
        h: 64,
        connections: { top: [], right: [], bottom: [], left: ['a->b#0'] },
      },
    },
    edges: { 'a->b#0': { fromSide: 'right', toSide: 'left' } },
    unplaced: [],
  };
}

describe('reconcileLayout', () => {
  it('passes through when nothing changed', () => {
    const m = baseModel();
    const l = baseLayout();
    const r = reconcileLayout(l, m, m);
    expect(r.layout).toBe(l);
    expect(r.needsRelayout).toBe(false);
  });

  it('keeps positions for kept nodes when a new node is added', () => {
    const prev = baseModel();
    const next = baseModel();
    next.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    const r = reconcileLayout(baseLayout(), prev, next);
    expect(r.layout.nodes.a?.x).toBe(0);
    expect(r.layout.nodes.b?.x).toBe(256);
    expect(r.layout.unplaced).toEqual(['c']);
    expect(r.needsRelayout).toBe(true);
  });

  it('drops removed edge from per-side connections', () => {
    const prev = baseModel();
    const next = baseModel();
    delete next.edges['a->b#0'];
    const r = reconcileLayout(baseLayout(), prev, next);
    expect(r.layout.nodes.a?.connections.right).toEqual([]);
    expect(r.layout.nodes.b?.connections.left).toEqual([]);
    expect(r.layout.edges['a->b#0']).toBeUndefined();
  });
});
