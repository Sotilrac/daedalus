import { describe, expect, it } from 'vitest';
import { pinAt, pinForSide, swapAt } from '../src/routing/pins.js';
import type { NodeLayout } from '../src/model/types.js';

const node: NodeLayout = {
  x: 100,
  y: 100,
  w: 96,
  h: 64,
  connections: { top: ['e1', 'e2'], right: [], bottom: [], left: [] },
};

describe('pinForSide', () => {
  it('evenly spaces multiple connections', () => {
    expect(pinForSide(node, 'top', 0, 2)).toEqual({ x: 132, y: 100 });
    expect(pinForSide(node, 'top', 1, 2)).toEqual({ x: 164, y: 100 });
  });

  it('places a single connection at the centre', () => {
    expect(pinForSide(node, 'right', 0, 1)).toEqual({ x: 196, y: 132 });
  });
});

// `pinAt` is the local-coord version. Tests below pass w=h scaled to round
// numbers so the projection arithmetic is easy to verify by hand.

describe('pinAt — hexagon', () => {
  // w=200, h=100 → q=50. Outline vertices at (50,0), (150,0), (200,50),
  // (150,100), (50,100), (0,50).

  it('right side, single conn, lands on the right vertex', () => {
    expect(pinAt(200, 100, 'right', 0, 1, 'hexagon')).toEqual({ x: 200, y: 50 });
  });

  it('right side, three conns, first and last extend to the slants', () => {
    // t = 0.25, 0.5, 0.75 → py = 25, 50, 75.
    // Upper slant from (150,0) to (200,50). At y=25 → x = 175.
    expect(pinAt(200, 100, 'right', 0, 3, 'hexagon')).toEqual({ x: 175, y: 25 });
    expect(pinAt(200, 100, 'right', 1, 3, 'hexagon')).toEqual({ x: 200, y: 50 });
    // Lower slant from (200,50) to (150,100). At y=75 → x = 175.
    expect(pinAt(200, 100, 'right', 2, 3, 'hexagon')).toEqual({ x: 175, y: 75 });
  });

  it('top side keeps a straight middle stretch', () => {
    // 2 conns: t = 1/3, 2/3 → px ≈ 66.7, 133.3, both within [50, 150].
    const a = pinAt(200, 100, 'top', 0, 2, 'hexagon');
    const b = pinAt(200, 100, 'top', 1, 2, 'hexagon');
    expect(a.y).toBe(0);
    expect(b.y).toBe(0);
    expect(a.x).toBeCloseTo(200 / 3);
    expect(b.x).toBeCloseTo(400 / 3);
  });

  it('top side, dense pack, outermost pins climb the corner slants', () => {
    // 5 conns: t = 1/6 .. 5/6 → px ≈ 33.3, 66.7, 100, 133.3, 166.7.
    // Leftmost px=33.3 is < q=50, so it slides up the left corner slant.
    const left = pinAt(200, 100, 'top', 0, 5, 'hexagon');
    expect(left.x).toBeCloseTo(200 / 6);
    // Slant goes from (0,50) to (50,0). At x=33.3, y = 50 - 50*(33.3/50) = 50 - 33.3 ≈ 16.67.
    expect(left.y).toBeCloseTo(50 - (50 * (200 / 6)) / 50);
  });
});

describe('pinAt — diamond', () => {
  // w=100, h=80 → cx=50, cy=40.

  it('any side with a single conn lands on the opposite vertex', () => {
    expect(pinAt(100, 80, 'top', 0, 1, 'diamond')).toEqual({ x: 50, y: 0 });
    expect(pinAt(100, 80, 'right', 0, 1, 'diamond')).toEqual({ x: 100, y: 40 });
    expect(pinAt(100, 80, 'bottom', 0, 1, 'diamond')).toEqual({ x: 50, y: 80 });
    expect(pinAt(100, 80, 'left', 0, 1, 'diamond')).toEqual({ x: 0, y: 40 });
  });

  it('right side with three conns fans across both upper and lower edges', () => {
    // py = 20, 40, 60. dx = cx * |py-cy|/cy = 50 * 20/40 = 25 (top, bot) or 0 (mid).
    expect(pinAt(100, 80, 'right', 0, 3, 'diamond')).toEqual({ x: 75, y: 20 });
    expect(pinAt(100, 80, 'right', 1, 3, 'diamond')).toEqual({ x: 100, y: 40 });
    expect(pinAt(100, 80, 'right', 2, 3, 'diamond')).toEqual({ x: 75, y: 60 });
  });
});

describe('pinAt — parallelogram', () => {
  // w=120, h=60 → skew = min(120/6, 16) = 16.

  it('left side pins ride the slant', () => {
    // py = 15, 30, 45. x = skew * (1 - py/h) = 16 * (1 - py/60).
    expect(pinAt(120, 60, 'left', 0, 3, 'parallelogram')).toEqual({ x: 12, y: 15 });
    expect(pinAt(120, 60, 'left', 1, 3, 'parallelogram')).toEqual({ x: 8, y: 30 });
    expect(pinAt(120, 60, 'left', 2, 3, 'parallelogram')).toEqual({ x: 4, y: 45 });
  });

  it('right side pins ride the opposite slant', () => {
    // x = w - skew * (py/h).
    expect(pinAt(120, 60, 'right', 0, 3, 'parallelogram')).toEqual({ x: 116, y: 15 });
    expect(pinAt(120, 60, 'right', 1, 3, 'parallelogram')).toEqual({ x: 112, y: 30 });
    expect(pinAt(120, 60, 'right', 2, 3, 'parallelogram')).toEqual({ x: 108, y: 45 });
  });

  it('top side pins stay within the actual horizontal range [skew, w]', () => {
    // 3 conns: t = 0.25, 0.5, 0.75 over [skew, w] = [16, 120].
    expect(pinAt(120, 60, 'top', 0, 3, 'parallelogram')).toEqual({ x: 42, y: 0 });
    expect(pinAt(120, 60, 'top', 1, 3, 'parallelogram')).toEqual({ x: 68, y: 0 });
    expect(pinAt(120, 60, 'top', 2, 3, 'parallelogram')).toEqual({ x: 94, y: 0 });
  });

  it('bottom side pins stay within [0, w - skew]', () => {
    expect(pinAt(120, 60, 'bottom', 0, 3, 'parallelogram')).toEqual({ x: 26, y: 60 });
    expect(pinAt(120, 60, 'bottom', 1, 3, 'parallelogram')).toEqual({ x: 52, y: 60 });
    expect(pinAt(120, 60, 'bottom', 2, 3, 'parallelogram')).toEqual({ x: 78, y: 60 });
  });
});

describe('swapAt', () => {
  it('swaps with a positive offset', () => {
    expect(swapAt(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('swaps with a negative offset', () => {
    expect(swapAt(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the list alone when out of bounds', () => {
    expect(swapAt(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
