import { useState } from 'react';
import type { Side, EdgeId, NodeId } from '@daedalus/shared';
import { SIDES } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';

interface Props {
  nodeId: NodeId;
  width: number;
  height: number;
}

interface Active {
  side: Side;
  edgeId: EdgeId;
  index: number;
  count: number;
}

export function AnchorControls({ nodeId, width, height }: Props): JSX.Element {
  const layout = useGraphStore((s) => s.layout);
  const swapAnchor = useGraphStore((s) => s.swapAnchor);
  const [active, setActive] = useState<Active | null>(null);

  if (!layout) return <g />;
  const node = layout.nodes[nodeId];
  if (!node) return <g />;

  return (
    <g
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setActive(null);
      }}
    >
      {SIDES.map((side) => {
        const list = node.connections[side];
        return list.map((edgeId, index) => {
          const { x, y } = localPin({ side, index, count: list.length, w: width, h: height });
          const selected = active?.side === side && active.edgeId === edgeId;
          return (
            <circle
              key={`${side}-${index}-${edgeId}`}
              className="anchor"
              cx={x}
              cy={y}
              r={4}
              fill={selected ? 'var(--accent)' : 'var(--ink)'}
              stroke={selected ? 'var(--accent)' : 'var(--ink-muted)'}
              strokeWidth={1}
              onPointerDown={(e) => {
                e.stopPropagation();
                setActive({ side, edgeId, index, count: list.length });
              }}
            />
          );
        });
      })}
      {active &&
        renderGhosts(active, width, height, async (offset) => {
          await swapAnchor(nodeId, active.side, active.edgeId, offset);
          setActive(null);
        })}
    </g>
  );
}

function renderGhosts(
  active: Active,
  width: number,
  height: number,
  commit: (offset: number) => void | Promise<void>,
): JSX.Element[] {
  const ghosts: JSX.Element[] = [];
  for (let i = 0; i < active.count; i += 1) {
    if (i === active.index) continue;
    const { x, y } = localPin({
      side: active.side,
      index: i,
      count: active.count,
      w: width,
      h: height,
    });
    const offset = i - active.index;
    ghosts.push(
      <circle
        key={`ghost-${i}`}
        className="anchor ghost"
        cx={x}
        cy={y}
        r={5}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1}
        strokeDasharray="2 2"
        onPointerDown={(e) => {
          e.stopPropagation();
          void commit(offset);
        }}
      />,
    );
  }
  return ghosts;
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
