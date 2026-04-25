import type { GridConfig } from '../model/types.js';

export function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapUp(value: number, gridSize: number): number {
  return Math.ceil(value / gridSize) * gridSize;
}

export function clampToGrid(x: number, y: number, w: number, h: number, grid: GridConfig): { x: number; y: number } {
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
