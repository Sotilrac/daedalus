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
        { id: 'a->b#0', from: 'a', to: 'b', route: [{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 304, y: 30 }] },
      ],
    };

    const { nodes, edgeSides } = snapAndAssignSides(raw, { grid: { size: 16, cols: 80, rows: 50 } });

    expect(nodes.a?.x).toBe(0);
    expect(nodes.a?.w).toBe(112);
    expect(nodes.b?.x).toBe(304);
    expect(edgeSides['a->b#0']).toEqual({ fromSide: 'right', toSide: 'left' });
    expect(nodes.a?.connections.right).toEqual(['a->b#0']);
    expect(nodes.b?.connections.left).toEqual(['a->b#0']);
  });
});
