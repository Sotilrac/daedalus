import type { GridConfig } from '../model/types.js';
import type { ThemePalette } from './theme.js';

export interface GridPattern {
  id: string;
  size: number;
  dotRadius: number;
  color: string;
  opacity: number;
}

export function gridPattern(grid: GridConfig, palette: ThemePalette): GridPattern {
  return {
    id: 'daedalus-grid',
    size: grid.size,
    dotRadius: 1,
    color: palette.gridDot,
    opacity: 0.5,
  };
}
