import type { GridConfig } from '../model/types.js';

export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapUp(value: number, gridSize: number): number {
  return Math.ceil(value / gridSize) * gridSize;
}

// Round a node dimension up to the next power of two, lower-bounded by the
// grid size. Newly-created nodes use this so initial sizes hit clean,
// resize-friendly values (32, 64, 128, 256, ...) instead of arbitrary ELK
// outputs like 173 or 144 that don't compose well with the resize step.
export function snapUpPow2(value: number, gridSize: number): number {
  const v = Math.max(value, gridSize);
  if (v <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(v));
}

export function clampToGrid(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: GridConfig,
): { x: number; y: number } {
  const maxX = grid.cols * grid.size - w;
  const maxY = grid.rows * grid.size - h;
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(0, Math.min(maxY, y)),
  };
}

export function gridBounds(grid: GridConfig): { width: number; height: number } {
  return { width: grid.cols * grid.size, height: grid.rows * grid.size };
}
