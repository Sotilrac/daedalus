import type { GridPattern } from '@daedalus/shared';

export function GridDefs({ grid }: { grid: GridPattern }): JSX.Element {
  return (
    <pattern id={grid.id} width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
      <circle
        cx={grid.size / 2}
        cy={grid.size / 2}
        r={grid.dotRadius}
        fill={grid.color}
        opacity={grid.opacity}
      />
    </pattern>
  );
}
