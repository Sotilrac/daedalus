import { describe, expect, it } from 'vitest';
import type { Layout, Model } from '../src/model/types.js';
import { applySavedLayout, reconcileLayout } from '../src/layout/reconcile.js';

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
    viewport: { zoom: 1, panX: 0, panY: 0, theme: 'slate' },
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

  it('keeps positions for kept nodes and auto-places a new node outside the bbox', () => {
    const prev = baseModel();
    const next = baseModel();
    next.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    const r = reconcileLayout(baseLayout(), prev, next);
    expect(r.layout.nodes.a?.x).toBe(0);
    expect(r.layout.nodes.b?.x).toBe(256);
    const c = r.layout.nodes.c;
    expect(c).toBeDefined();
    // Lands to the right of b (256 + 96 = 352, plus 2-cell gap = 384).
    expect(c?.x).toBe(384);
    expect(c?.y).toBe(0);
    expect(r.layout.unplaced).toEqual([]);
    expect(r.needsRelayout).toBe(false);
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

  it('attaches a brand-new edge to existing nodes without relayout', () => {
    const prev = baseModel();
    const next = baseModel();
    next.edges['b->a#0'] = { from: 'b', to: 'a', style: {} };
    const r = reconcileLayout(baseLayout(), prev, next);
    // a is to the left of b; new edge goes b -> a, so b's left to a's right.
    expect(r.layout.edges['b->a#0']).toEqual({ fromSide: 'left', toSide: 'right' });
    expect(r.layout.nodes.b?.connections.left).toContain('b->a#0');
    expect(r.layout.nodes.a?.connections.right).toContain('b->a#0');
    // Pre-existing edge ordering is preserved.
    expect(r.layout.nodes.a?.connections.right).toEqual(['a->b#0', 'b->a#0']);
    expect(r.needsRelayout).toBe(false);
  });

  it('connects a freshly-placed new node to an existing node', () => {
    const prev = baseModel();
    const next = baseModel();
    next.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    next.edges['a->c#0'] = { from: 'a', to: 'c', style: {} };
    const r = reconcileLayout(baseLayout(), prev, next);
    expect(r.layout.nodes.c).toBeDefined();
    expect(r.layout.edges['a->c#0']).toBeDefined();
    // a is at x=0, c is placed to the right at x=384, so the edge picks
    // a's right and c's left.
    expect(r.layout.edges['a->c#0']).toEqual({ fromSide: 'right', toSide: 'left' });
    expect(r.needsRelayout).toBe(false);
  });
});

describe('applySavedLayout', () => {
  it('places a node missing from the saved layout', () => {
    const m = baseModel();
    m.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    m.edges['b->c#0'] = { from: 'b', to: 'c', style: {} };
    const r = applySavedLayout(baseLayout(), m);
    expect(r.layout.nodes.c).toBeDefined();
    expect(r.layout.edges['b->c#0']).toBeDefined();
    expect(r.layout.unplaced).toEqual([]);
    expect(r.needsRelayout).toBe(false);
  });
});
