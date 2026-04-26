import { describe, expect, it } from 'vitest';
import {
  buildRenderPlan,
  polylineToPath,
  resolveLabelPlacement,
  wrapLabel,
} from '../src/render/svg.js';
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

describe('resolveLabelPlacement', () => {
  it('centers when no position is given', () => {
    expect(resolveLabelPlacement(undefined, 100, 60)).toEqual({
      x: 50,
      y: 30,
      textAnchor: 'middle',
      dominantBaseline: 'central',
    });
  });

  it('places INSIDE_TOP_CENTER near the top edge with hanging baseline', () => {
    const p = resolveLabelPlacement('INSIDE_TOP_CENTER', 100, 60);
    expect(p.x).toBe(50);
    expect(p.textAnchor).toBe('middle');
    expect(p.dominantBaseline).toBe('hanging');
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(20);
  });

  it('places OUTSIDE_BOTTOM_LEFT below the box, anchored to the left column', () => {
    const p = resolveLabelPlacement('OUTSIDE_BOTTOM_LEFT', 100, 60);
    expect(p.x).toBe(0);
    expect(p.textAnchor).toBe('start');
    expect(p.dominantBaseline).toBe('hanging');
    expect(p.y).toBeGreaterThan(60);
  });

  it('places OUTSIDE_MIDDLE_RIGHT to the right of the shape', () => {
    const p = resolveLabelPlacement('OUTSIDE_MIDDLE_RIGHT', 100, 60);
    expect(p.x).toBeGreaterThan(100);
    expect(p.y).toBe(30);
    expect(p.textAnchor).toBe('start');
    expect(p.dominantBaseline).toBe('central');
  });

  it('falls back to centered for UNSET_LABEL_POSITION', () => {
    expect(resolveLabelPlacement('UNSET_LABEL_POSITION', 80, 40)).toEqual({
      x: 40,
      y: 20,
      textAnchor: 'middle',
      dominantBaseline: 'central',
    });
  });
});

describe('wrapLabel', () => {
  it('returns the original text on a single line when it fits', () => {
    expect(wrapLabel('hello world', 200, 12)).toEqual(['hello world']);
  });

  it('wraps to multiple lines when the available width is too narrow', () => {
    const lines = wrapLabel('the quick brown fox', 60, 12);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });

  it('breaks oversized words rather than overflowing', () => {
    const lines = wrapLabel('supercalifragilisticexpialidocious', 40, 12);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('preserves explicit newlines', () => {
    expect(wrapLabel('first\nsecond', 200, 12)).toEqual(['first', 'second']);
  });
});
