import { describe, expect, it } from 'vitest';
import { classifySide, sideSortKey } from '../src/layout/sides.js';

describe('classifySide', () => {
  const box = { x: 100, y: 100, w: 100, h: 50 };

  it('classifies points near each side', () => {
    expect(classifySide(box, { x: 150, y: 100 })).toBe('top');
    expect(classifySide(box, { x: 150, y: 150 })).toBe('bottom');
    expect(classifySide(box, { x: 100, y: 125 })).toBe('left');
    expect(classifySide(box, { x: 200, y: 125 })).toBe('right');
  });
});

describe('sideSortKey', () => {
  it('uses x for top/bottom and y for left/right', () => {
    expect(sideSortKey('top', { x: 50, y: 99 })).toBe(50);
    expect(sideSortKey('left', { x: 1, y: 200 })).toBe(200);
  });
});
