import { useState } from 'react';
import type { EdgeId, NodeId, Side, NodeLayout } from '@daedalus/shared';
import { SIDES } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';

interface Props {
  nodeId: NodeId;
  width: number;
  height: number;
}

interface Editing {
  edgeId: EdgeId;
  fromSide: Side;
  fromIndex: number;
  pointerStartX: number;
  pointerStartY: number;
  anchorStartX: number;
  anchorStartY: number;
  cursorX: number;
  cursorY: number;
  moved: boolean;
}

interface Candidate {
  side: Side;
  index: number;
  x: number;
  y: number;
}

const SNAP_RADIUS = 28;

export function AnchorControls({ nodeId, width, height }: Props): JSX.Element {
  const layout = useGraphStore((s) => s.layout);
  const moveEdgeAnchor = useGraphStore((s) => s.moveEdgeAnchor);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const setInteracting = useGraphStore((s) => s.setInteracting);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!layout) return <g />;
  const node = layout.nodes[nodeId];
  if (!node) return <g />;

  const candidates = computeCandidates(node, editing, width, height);
  const nearest =
    editing && editing.moved
      ? nearestCandidate(candidates, editing.cursorX, editing.cursorY)
      : null;
  const isSnapped =
    nearest !== null &&
    editing !== null &&
    distance(nearest.x, nearest.y, editing.cursorX, editing.cursorY) <= SNAP_RADIUS;

  return (
    <g>
      {SIDES.flatMap((side) =>
        node.connections[side].map((edgeId, index) => {
          const isActive = editing?.edgeId === edgeId;
          const home = localPin({
            side,
            index,
            count: node.connections[side].length,
            w: width,
            h: height,
          });
          const cx = isActive && editing ? editing.cursorX : home.x;
          const cy = isActive && editing ? editing.cursorY : home.y;

          return (
            <circle
              key={`${side}-${index}-${edgeId}`}
              className="anchor"
              cx={cx}
              cy={cy}
              r={isActive ? 6 : 4}
              fill={isActive ? 'var(--accent)' : 'var(--ink)'}
              stroke={isActive ? 'var(--accent)' : 'var(--ink-muted)'}
              strokeWidth={1}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                // Editing a connection is a different gesture from selecting
                // boxes; drop the current node selection so the resize handle
                // and selection-box chrome don't fight the anchor drag UI.
                clearSelection();
                setInteracting(true);
                setEditing({
                  edgeId,
                  fromSide: side,
                  fromIndex: index,
                  pointerStartX: e.clientX,
                  pointerStartY: e.clientY,
                  anchorStartX: home.x,
                  anchorStartY: home.y,
                  cursorX: home.x,
                  cursorY: home.y,
                  moved: false,
                });
              }}
              onPointerMove={(e) => {
                if (!editing || editing.edgeId !== edgeId) return;
                const dx = e.clientX - editing.pointerStartX;
                const dy = e.clientY - editing.pointerStartY;
                setEditing({
                  ...editing,
                  cursorX: editing.anchorStartX + dx,
                  cursorY: editing.anchorStartY + dy,
                  moved: editing.moved || Math.hypot(dx, dy) > 2,
                });
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                if (editing && editing.edgeId === edgeId && editing.moved) {
                  if (
                    nearest &&
                    distance(nearest.x, nearest.y, editing.cursorX, editing.cursorY) <= SNAP_RADIUS
                  ) {
                    void moveEdgeAnchor(nodeId, edgeId, nearest.side, nearest.index);
                  }
                }
                setInteracting(false);
                setEditing(null);
              }}
              onPointerCancel={() => {
                setInteracting(false);
                setEditing(null);
              }}
            />
          );
        }),
      )}
      {editing &&
        candidates.map((c) => {
          const isTarget = isSnapped && nearest === c;
          return (
            <circle
              key={`ghost-${c.side}-${c.index}`}
              className="anchor ghost"
              cx={c.x}
              cy={c.y}
              r={isTarget ? 8 : 5}
              fill={isTarget ? 'var(--accent)' : 'transparent'}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray={isTarget ? undefined : '2 2'}
              pointerEvents="none"
            />
          );
        })}
    </g>
  );
}

function computeCandidates(
  node: NodeLayout,
  editing: Editing | null,
  w: number,
  h: number,
): Candidate[] {
  if (!editing) return [];
  const out: Candidate[] = [];
  for (const side of SIDES) {
    const list = node.connections[side];
    const isSameSide = side === editing.fromSide;
    // Final-count of this side after committing the move.
    //   same side: list.length (we remove + reinsert)
    //   different side: list.length + 1 (one new entry)
    const finalCount = isSameSide ? list.length : list.length + 1;
    for (let i = 0; i < finalCount; i += 1) {
      if (isSameSide && i === editing.fromIndex) continue;
      const { x, y } = localPin({ side, index: i, count: finalCount, w, h });
      out.push({ side, index: i, x, y });
    }
  }
  return out;
}

function nearestCandidate(cs: Candidate[], x: number, y: number): Candidate | null {
  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of cs) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function localPin(opts: { side: Side; index: number; count: number; w: number; h: number }): {
  x: number;
  y: number;
} {
  const t = (opts.index + 1) / (opts.count + 1);
  switch (opts.side) {
    case 'top':
      return { x: opts.w * t, y: 0 };
    case 'bottom':
      return { x: opts.w * t, y: opts.h };
    case 'left':
      return { x: 0, y: opts.h * t };
    case 'right':
      return { x: opts.w, y: opts.h * t };
  }
}
