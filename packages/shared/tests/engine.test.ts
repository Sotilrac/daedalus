import { describe, expect, it } from 'vitest';
import { snapAndAssignSides, type RawLayout } from '../src/layout/engine.js';

describe('snapAndAssignSides', () => {
  it('snaps positions and sizes, and orders connections per side', () => {
    const raw: RawLayout = {
      shapes: [
        { id: 'a', x: 7, y: 9, w: 100, h: 50 },
        { id: 'b', x: 300, y: 5, w: 100, h: 50 },
      ],
      edges: [
        {
          id: 'a->b#0',
          from: 'a',
          to: 'b',
          // First waypoint sits squarely on a's right edge after snapping
          // (a is now 128 wide × 64 tall at y=16); last sits on b's left edge.
          route: [
            { x: 128, y: 48 },
            { x: 200, y: 48 },
            { x: 304, y: 32 },
          ],
        },
      ],
    };

    const { nodes, edgeSides } = snapAndAssignSides(raw, {
      grid: { size: 16, cols: 80, rows: 50 },
    });

    expect(nodes.a?.x).toBe(0);
    // Initial node sizes round up to the next power of two so the resize step
    // (grid * 2 = 32) lands cleanly on subsequent grow/shrink ticks.
    expect(nodes.a?.w).toBe(128);
    expect(nodes.b?.x).toBe(304);
    expect(edgeSides['a->b#0']).toEqual({ fromSide: 'right', toSide: 'left' });
    expect(nodes.a?.connections.right).toEqual(['a->b#0']);
    expect(nodes.b?.connections.left).toEqual(['a->b#0']);
  });
});
