import { useState } from 'react';
import type { RenderNode } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';
import { AnchorControls } from './AnchorControls.js';

export function NodeView({ node }: { node: RenderNode }): JSX.Element {
  const moveNode = useGraphStore((s) => s.moveNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const selection = useGraphStore((s) => s.selection);
  const [drag, setDrag] = useState<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  const isSelected = selection === node.id;

  return (
    <g
      className={`node ${drag ? 'dragging' : ''}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(e) => {
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        selectNode(node.id);
        setDrag({ originX: node.x, originY: node.y, pointerX: e.clientX, pointerY: e.clientY });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const dx = e.clientX - drag.pointerX;
        const dy = e.clientY - drag.pointerY;
        void moveNode(node.id, drag.originX + dx, drag.originY + dy);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDrag(null);
      }}
    >
      {renderShape(node)}
      <text
        x={node.w / 2}
        y={node.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={node.style.fontColor}
        fontWeight={node.style.fontWeight}
        fontStyle={node.style.fontStyle}
      >
        {node.label}
      </text>
      {isSelected && (
        <rect
          className="selection-box"
          x={-2}
          y={-2}
          width={node.w + 4}
          height={node.h + 4}
          rx={2}
        />
      )}
      <AnchorControls nodeId={node.id} width={node.w} height={node.h} />
    </g>
  );
}

function renderShape(node: RenderNode): JSX.Element {
  const common = {
    fill: node.style.fill,
    stroke: node.style.stroke,
    strokeWidth: node.style.strokeWidth,
    opacity: node.style.opacity,
    ...(node.style.strokeDasharray ? { strokeDasharray: node.style.strokeDasharray } : {}),
  };
  switch (node.shape) {
    case 'circle':
    case 'oval':
      return (
        <ellipse cx={node.w / 2} cy={node.h / 2} rx={node.w / 2} ry={node.h / 2} {...common} />
      );
    case 'diamond':
      return (
        <polygon
          points={`${node.w / 2},0 ${node.w},${node.h / 2} ${node.w / 2},${node.h} 0,${node.h / 2}`}
          {...common}
        />
      );
    case 'hexagon': {
      const q = node.w / 4;
      return (
        <polygon
          points={`${q},0 ${node.w - q},0 ${node.w},${node.h / 2} ${node.w - q},${node.h} ${q},${node.h} 0,${node.h / 2}`}
          {...common}
        />
      );
    }
    default:
      return <rect width={node.w} height={node.h} rx={2} {...common} />;
  }
}
