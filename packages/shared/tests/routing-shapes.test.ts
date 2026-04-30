import { describe, expect, it } from 'vitest';
import { shapeOutline } from '../src/routing/libavoid.js';

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
