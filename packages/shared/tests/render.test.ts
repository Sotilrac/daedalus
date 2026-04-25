import { describe, expect, it } from 'vitest';
import { buildRenderPlan, polylineToPath } from '../src/render/svg.js';
import type { Layout, Model } from '../src/model/types.js';

const model: Model = {
  nodes: {
    a: { label: 'A', shape: 'rectangle', style: { fill: '#fff' }, rawWidth: 96, rawHeight: 64 },
    b: { label: 'B', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
  },
  edges: { 'a->b#0': { from: 'a', to: 'b', style: {} } },
};

const layout: Layout = {
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

describe('render plan', () => {
  it('translates polylines into SVG path data', () => {
    expect(
      polylineToPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M 0 0 L 10 0 L 10 10');
    expect(polylineToPath([])).toBe('');
  });

  it('builds a plan that respects D2 fill overrides on top of theme defaults', () => {
    const plan = buildRenderPlan({
      model,
      layout,
      routes: {
        'a->b#0': [
          { x: 96, y: 32 },
          { x: 256, y: 32 },
        ],
      },
    });
    expect(plan.width).toBe(80 * 16);
    expect(plan.nodes[0]?.style.fill).toBe('#fff');
    expect(plan.nodes[1]?.style.fill).toBe(plan.palette.paperSunk);
    expect(plan.edges[0]?.path).toBe('M 96 32 L 256 32');
  });
});
