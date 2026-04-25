import { describe, expect, it } from 'vitest';
import { pinForSide, swapAt } from '../src/routing/pins.js';
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
