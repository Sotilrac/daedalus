import { useRef, useState } from 'react';
import type { NodeId, RenderNode } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';
import { AnchorControls } from './AnchorControls.js';

const DRAG_THRESHOLD = 3; // px before treating a press as a drag

export function NodeView({ node }: { node: RenderNode }): JSX.Element {
  const moveNodes = useGraphStore((s) => s.moveNodes);
  const resizeNode = useGraphStore((s) => s.resizeNode);
  const selection = useGraphStore((s) => s.selection);
  const [drag, setDrag] = useState<{
    origins: Record<NodeId, { x: number; y: number }>;
    pointerX: number;
    pointerY: number;
    wasSelected: boolean;
    prevSelLen: number;
  } | null>(null);
  // Tracked outside React state so a moving pointer doesn't churn renders.
  const movedRef = useRef(false);
  const [resize, setResize] = useState<{
    origW: number;
    origH: number;
    origCx: number;
    origCy: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  const isSelected = selection.includes(node.id);
  const isOnlySelected = selection.length === 1 && selection[0] === node.id;

  return (
    <g
      className={`node ${drag ? 'dragging' : ''}`}
      transform={`translate(${node.x} ${node.y})`}
      onPointerDown={(e) => {
        e.stopPropagation();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);

        // Selection on press: only *grow* the selection here. Demoting a
        // multi-selection to a single click target is deferred to pointer-up
        // so dragging an already-selected node moves the whole selection
        // instead of collapsing it.
        const store = useGraphStore.getState();
        const sel = store.selection;
        const wasSelected = sel.includes(node.id);
        const dragSel = wasSelected ? sel : [...sel, node.id];
        if (!wasSelected) store.setSelection(dragSel);

        const layout = store.layout;
        const origins: Record<NodeId, { x: number; y: number }> = {};
        for (const id of dragSel) {
          const n = layout?.nodes[id];
          if (n) origins[id] = { x: n.x, y: n.y };
        }
        movedRef.current = false;
        setDrag({
          origins,
          pointerX: e.clientX,
          pointerY: e.clientY,
          wasSelected,
          prevSelLen: sel.length,
        });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const dx = e.clientX - drag.pointerX;
        const dy = e.clientY - drag.pointerY;
        if (!movedRef.current) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          movedRef.current = true;
        }
        const updates = Object.entries(drag.origins).map(([id, o]) => ({
          id,
          x: o.x + dx,
          y: o.y + dy,
        }));
        void moveNodes(updates);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (drag && !movedRef.current && drag.wasSelected && drag.prevSelLen > 1) {
          // True click on a node that was already part of a multi-selection:
          // collapse to single-select so the resize handle appears here.
          useGraphStore.getState().selectOnly(node.id);
        }
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
      {isOnlySelected && (
        <>
          <text
            className="size-hint"
            x={node.w}
            y={-6}
            textAnchor="end"
            fill="var(--accent)"
            fontFamily="var(--font-mono)"
            fontSize={10}
            pointerEvents="none"
          >
            {node.w} × {node.h}
          </text>
          <rect
            className="resize-handle"
            x={node.w - 6}
            y={node.h - 6}
            width={12}
            height={12}
            fill="var(--accent)"
            stroke="var(--paper)"
            strokeWidth={1}
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setResize({
                origW: node.w,
                origH: node.h,
                origCx: node.x + node.w / 2,
                origCy: node.y + node.h / 2,
                pointerX: e.clientX,
                pointerY: e.clientY,
              });
            }}
            onPointerMove={(e) => {
              if (!resize) return;
              const dx = e.clientX - resize.pointerX;
              const dy = e.clientY - resize.pointerY;
              // Centre-anchored resize: both sides expand symmetrically, so
              // dragging the corner by N pixels widens the node by 2N. We
              // pass the *original* centre as the anchor so consecutive ticks
              // can't drift via grid rounding.
              const w = resize.origW + 2 * dx;
              const h = resize.origH + 2 * dy;
              void resizeNode(node.id, w, h, { x: resize.origCx, y: resize.origCy });
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setResize(null);
            }}
            onPointerCancel={() => setResize(null)}
          />
        </>
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
  const w = node.w;
  const h = node.h;
  switch (node.shape) {
    case 'circle':
    case 'oval':
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case 'diamond':
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} />;
    case 'hexagon': {
      const q = w / 4;
      return (
        <polygon
          points={`${q},0 ${w - q},0 ${w},${h / 2} ${w - q},${h} ${q},${h} 0,${h / 2}`}
          {...common}
        />
      );
    }
    case 'parallelogram': {
      const skew = Math.min(w / 6, 16);
      return <polygon points={`${skew},0 ${w},0 ${w - skew},${h} 0,${h}`} {...common} />;
    }
    case 'cylinder': {
      const ry = Math.max(4, Math.min(h * 0.12, 14));
      const body = `M 0 ${ry} L 0 ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} L ${w} ${ry}`;
      return (
        <g>
          <path d={body} {...common} />
          <ellipse cx={w / 2} cy={ry} rx={w / 2} ry={ry} {...common} />
        </g>
      );
    }
    case 'stored_data': {
      const rx = Math.max(8, Math.min(w * 0.1, 18));
      // D-shape from each side: left side curves in, right side curves out.
      const d = `M ${rx} 0 L ${w} 0 A ${rx} ${h / 2} 0 0 1 ${w} ${h} L ${rx} ${h} A ${rx} ${h / 2} 0 0 0 ${rx} 0 Z`;
      return <path d={d} {...common} />;
    }
    case 'document': {
      const wave = Math.max(6, h * 0.12);
      const d = `M 0 0 L ${w} 0 L ${w} ${h - wave} Q ${(3 * w) / 4} ${h} ${w / 2} ${h - wave / 2} Q ${w / 4} ${h - wave} 0 ${h} Z`;
      return <path d={d} {...common} />;
    }
    case 'package': {
      const tab = Math.max(8, h * 0.2);
      const tabW = Math.min(w * 0.4, 64);
      return (
        <g>
          <rect x={0} y={tab} width={w} height={h - tab} {...common} />
          <rect x={0} y={0} width={tabW} height={tab} {...common} />
        </g>
      );
    }
    default:
      return <rect width={w} height={h} rx={2} {...common} />;
  }
}
