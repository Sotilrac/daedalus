import { describe, expect, it } from 'vitest';
import { labelObstacle, labelSide, shapeOutline } from '../src/routing/libavoid.js';
import type { ModelNode, NodeLayout } from '../src/model/types.js';

describe('shapeOutline', () => {
  const box = { x: 0, y: 0, w: 100, h: 60 };

  it('returns an empty list for shapes that should be routed as their bbox', () => {
    expect(shapeOutline('rectangle', box)).toEqual([]);
    expect(shapeOutline('square', box)).toEqual([]);
    expect(shapeOutline('circle', box)).toEqual([]);
    expect(shapeOutline('oval', box)).toEqual([]);
    expect(shapeOutline('cylinder', box)).toEqual([]);
    expect(shapeOutline('document', box)).toEqual([]);
    expect(shapeOutline('cloud', box)).toEqual([]);
    expect(shapeOutline('class', box)).toEqual([]);
  });

  it('returns six clockwise vertices for a hexagon', () => {
    const out = shapeOutline('hexagon', box);
    // q = w/4 = 25.
    expect(out).toEqual([
      { x: 25, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 30 },
      { x: 75, y: 60 },
      { x: 25, y: 60 },
      { x: 0, y: 30 },
    ]);
  });

  it('returns four vertices for a diamond', () => {
    expect(shapeOutline('diamond', box)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 30 },
      { x: 50, y: 60 },
      { x: 0, y: 30 },
    ]);
  });

  it('returns four vertices with a top-skew for a parallelogram (capped at 16)', () => {
    // skew = min(w/6, 16); for w=100 that's 16 (cap).
    expect(shapeOutline('parallelogram', box)).toEqual([
      { x: 16, y: 0 },
      { x: 100, y: 0 },
      { x: 84, y: 60 },
      { x: 0, y: 60 },
    ]);
  });

  it('parallelogram skew floors at w/6 for narrow boxes', () => {
    // w=60 ⇒ w/6 = 10 < 16, so skew = 10.
    const narrow = { x: 0, y: 0, w: 60, h: 30 };
    expect(shapeOutline('parallelogram', narrow)).toEqual([
      { x: 10, y: 0 },
      { x: 60, y: 0 },
      { x: 50, y: 30 },
      { x: 0, y: 30 },
    ]);
  });

  it('translates with the box origin', () => {
    const offset = { x: 50, y: 100, w: 100, h: 60 };
    expect(shapeOutline('diamond', offset)).toEqual([
      { x: 100, y: 100 },
      { x: 150, y: 130 },
      { x: 100, y: 160 },
      { x: 50, y: 130 },
    ]);
  });
});

describe('labelSide', () => {
  it('returns null for INSIDE / BORDER / unset positions', () => {
    expect(labelSide(undefined)).toBeNull();
    expect(labelSide('UNSET_LABEL_POSITION')).toBeNull();
    expect(labelSide('INSIDE_TOP_CENTER')).toBeNull();
    expect(labelSide('BORDER_BOTTOM_LEFT')).toBeNull();
  });

  it('maps OUTSIDE_TOP_* / OUTSIDE_BOTTOM_* to top / bottom', () => {
    expect(labelSide('OUTSIDE_TOP_LEFT')).toBe('top');
    expect(labelSide('OUTSIDE_TOP_CENTER')).toBe('top');
    expect(labelSide('OUTSIDE_TOP_RIGHT')).toBe('top');
    expect(labelSide('OUTSIDE_BOTTOM_CENTER')).toBe('bottom');
  });

  it('maps OUTSIDE_MIDDLE_LEFT / RIGHT to left / right', () => {
    expect(labelSide('OUTSIDE_MIDDLE_LEFT')).toBe('left');
    expect(labelSide('OUTSIDE_MIDDLE_RIGHT')).toBe('right');
  });

  it('returns null for OUTSIDE_MIDDLE_CENTER (degenerate)', () => {
    expect(labelSide('OUTSIDE_MIDDLE_CENTER')).toBeNull();
  });
});

describe('labelObstacle', () => {
  const node = (over: Partial<ModelNode>): ModelNode => ({
    label: 'Group',
    shape: 'rectangle',
    style: {},
    rawWidth: 200,
    rawHeight: 100,
    ...over,
  });
  const layout: NodeLayout = {
    x: 100,
    y: 100,
    w: 200,
    h: 100,
    connections: { top: [], right: [], bottom: [], left: [] },
  };

  it('returns a bbox inside the node for INSIDE_TOP_CENTER', () => {
    const b = labelObstacle(node({ labelPosition: 'INSIDE_TOP_CENTER' }), layout);
    expect(b).not.toBeNull();
    // Sits inside the node, near the top.
    expect(b!.y).toBeGreaterThanOrEqual(layout.y);
    expect(b!.y + b!.h).toBeLessThanOrEqual(layout.y + layout.h);
    expect(b!.x + b!.w / 2).toBeCloseTo(layout.x + layout.w / 2, 0);
  });

  it('returns a bbox inside the node for INSIDE_BOTTOM_LEFT', () => {
    const b = labelObstacle(node({ labelPosition: 'INSIDE_BOTTOM_LEFT' }), layout);
    expect(b).not.toBeNull();
    // Anchored to the bottom-left corner area inside the node.
    expect(b!.x).toBeGreaterThanOrEqual(layout.x);
    expect(b!.y + b!.h).toBeLessThanOrEqual(layout.y + layout.h);
  });

  it('returns a bbox straddling the top edge for BORDER_TOP_CENTER', () => {
    const b = labelObstacle(node({ labelPosition: 'BORDER_TOP_CENTER' }), layout);
    expect(b).not.toBeNull();
    // Centred on the top edge — half above, half below.
    expect(b!.y).toBeLessThan(layout.y);
    expect(b!.y + b!.h).toBeGreaterThan(layout.y);
  });

  it('returns null for an unset labelPosition', () => {
    expect(labelObstacle(node({}), layout)).toBeNull();
  });

  it('returns null for an empty label', () => {
    expect(
      labelObstacle(node({ label: '', labelPosition: 'OUTSIDE_TOP_LEFT' }), layout),
    ).toBeNull();
  });

  it('places an OUTSIDE_TOP label above the node', () => {
    const b = labelObstacle(node({ labelPosition: 'OUTSIDE_TOP_LEFT' }), layout);
    expect(b).not.toBeNull();
    // bbox sits ABOVE layout.y (=100) by at least the inset (=6).
    expect(b!.y + b!.h).toBeLessThanOrEqual(100 - 6 + 0.5);
    expect(b!.x).toBe(100); // aligned to left edge of node
  });

  it('places an OUTSIDE_BOTTOM_RIGHT label below and right-aligned', () => {
    const b = labelObstacle(node({ labelPosition: 'OUTSIDE_BOTTOM_RIGHT' }), layout);
    expect(b!.y).toBeGreaterThanOrEqual(200 + 6 - 0.5);
    expect(b!.x + b!.w).toBeCloseTo(300, 1); // aligned to right edge (layout.x + layout.w)
  });

  it('places an OUTSIDE_MIDDLE_LEFT label to the left of the node', () => {
    const b = labelObstacle(node({ labelPosition: 'OUTSIDE_MIDDLE_LEFT' }), layout);
    expect(b!.x + b!.w).toBeLessThanOrEqual(100 - 6 + 0.5);
    // Vertically centred on the node.
    expect(b!.y + b!.h / 2).toBeCloseTo(150, 0);
  });

  it('returns null for OUTSIDE_MIDDLE_CENTER (no clear obstacle position)', () => {
    expect(labelObstacle(node({ labelPosition: 'OUTSIDE_MIDDLE_CENTER' }), layout)).toBeNull();
  });
});
