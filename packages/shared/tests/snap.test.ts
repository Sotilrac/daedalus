import { describe, expect, it } from 'vitest';
import { snap, snapUp, clampToGrid, gridBounds } from '../src/layout/snap.js';

describe('snap', () => {
  it('rounds to nearest grid increment', () => {
    expect(snap(17, 16)).toBe(16);
    expect(snap(24, 16)).toBe(32);
    expect(snap(0, 16)).toBe(0);
  });

  it('snapUp rounds toward +infinity', () => {
    expect(snapUp(17, 16)).toBe(32);
    expect(snapUp(16, 16)).toBe(16);
    expect(snapUp(1, 16)).toBe(16);
  });

  it('clamps a node to grid bounds', () => {
    const grid = { size: 16, cols: 10, rows: 10 };
    expect(clampToGrid(-5, -5, 32, 32, grid)).toEqual({ x: 0, y: 0 });
    expect(clampToGrid(200, 200, 32, 32, grid)).toEqual({ x: 128, y: 128 });
  });

  it('grid bounds in pixels', () => {
    expect(gridBounds({ size: 16, cols: 80, rows: 50 })).toEqual({ width: 1280, height: 800 });
  });
});
