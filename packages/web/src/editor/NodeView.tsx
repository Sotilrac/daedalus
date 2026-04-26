import { useRef, useState } from 'react';
import type { NodeId, RenderNode } from '@daedalus/shared';
import { personBodyTop, wrapLabel } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';
import { AnchorControls } from './AnchorControls.js';

const LABEL_FONT_SIZE = 12;
const LABEL_LINE_HEIGHT_EM = 1.2;
const LABEL_HORIZONTAL_PADDING = 12; // total inset; 6px each side

const DRAG_THRESHOLD = 3; // px before treating a press as a drag

export function NodeView({
  node,
  showAnchors,
}: {
  node: RenderNode;
  showAnchors: boolean;
}): JSX.Element {
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
        store.setInteracting(true);
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
        if (drag) {
          if (!movedRef.current && drag.wasSelected && drag.prevSelLen > 1) {
            // True click on a node that was already part of a multi-selection:
            // collapse to single-select so the resize handle appears here.
            useGraphStore.getState().selectOnly(node.id);
          } else if (movedRef.current && Object.keys(drag.origins).length === 1) {
            // Single-node drag: clear selection on release so the user isn't
            // left with a transient selection from "just touch and move".
            // Multi-drags keep their selection so the user can keep adjusting.
            useGraphStore.getState().clearSelection();
          }
        }
        useGraphStore.getState().setInteracting(false);
        setDrag(null);
      }}
    >
      {renderShape(node)}
      {renderLabel(node)}
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
              useGraphStore.getState().setInteracting(true);
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
              useGraphStore.getState().setInteracting(false);
              setResize(null);
            }}
            onPointerCancel={() => {
              useGraphStore.getState().setInteracting(false);
              setResize(null);
            }}
          />
        </>
      )}
      {showAnchors && (
        <AnchorControls nodeId={node.id} width={node.w} height={node.h} shape={node.shape} />
      )}
    </g>
  );
}

function renderLabel(node: RenderNode): JSX.Element {
  const { x, y, textAnchor, dominantBaseline } = node.labelPlacement;
  const maxWidth = Math.max(LABEL_FONT_SIZE, node.w - LABEL_HORIZONTAL_PADDING);
  const lines = wrapLabel(node.label, maxWidth, LABEL_FONT_SIZE);
  const textProps = {
    fill: node.style.fontColor,
    fontWeight: node.style.fontWeight,
    fontStyle: node.style.fontStyle,
  };
  if (lines.length === 1) {
    return (
      <text x={x} y={y} textAnchor={textAnchor} dominantBaseline={dominantBaseline} {...textProps}>
        {lines[0]}
      </text>
    );
  }
  // Multi-line: render each line as its own <text> element so
  // `dominantBaseline` applies unambiguously per line. Browsers don't
  // consistently re-center each tspan when the parent text uses
  // `central` and the children carry explicit `y`/`dy`, which left
  // multi-line blocks visibly offset from the requested anchor point.
  const lineHeight = LABEL_FONT_SIZE * LABEL_LINE_HEIGHT_EM;
  let firstY = y;
  if (dominantBaseline === 'central') {
    firstY = y - ((lines.length - 1) / 2) * lineHeight;
  } else if (dominantBaseline === 'auto') {
    firstY = y - (lines.length - 1) * lineHeight;
  }
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={firstY + i * lineHeight}
          textAnchor={textAnchor}
          dominantBaseline={dominantBaseline}
          {...textProps}
        >
          {line}
        </text>
      ))}
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
    case 'page': {
      const fold = Math.max(10, Math.min(w * 0.12, h * 0.18, 24));
      const body = `M 0 0 L ${w - fold} 0 L ${w} ${fold} L ${w} ${h} L 0 ${h} Z`;
      const corner = `M ${w - fold} 0 L ${w - fold} ${fold} L ${w} ${fold}`;
      return (
        <g>
          <path d={body} {...common} />
          <path d={corner} {...common} fill="none" />
        </g>
      );
    }
    case 'queue': {
      // Cylinder rotated 90°: open caps on the left and right.
      const rx = Math.max(4, Math.min(w * 0.06, 14));
      const body = `M ${rx} 0 L ${w - rx} 0 A ${rx} ${h / 2} 0 0 1 ${w - rx} ${h} L ${rx} ${h} A ${rx} ${h / 2} 0 0 1 ${rx} 0`;
      return (
        <g>
          <path d={body} {...common} />
          <ellipse cx={w - rx} cy={h / 2} rx={rx} ry={h / 2} {...common} />
        </g>
      );
    }
    case 'step': {
      // Chevron arrow: rectangular body with a triangular tip on the right
      // and a matching notch on the left.
      const tip = Math.max(10, Math.min(w * 0.12, h * 0.5, 28));
      const points = `0,0 ${w - tip},0 ${w},${h / 2} ${w - tip},${h} 0,${h} ${tip},${h / 2}`;
      return <polygon points={points} {...common} />;
    }
    case 'callout': {
      // Speech bubble: rectangle with a pointer hanging off the bottom-left.
      const tail = Math.max(8, Math.min(h * 0.18, 16));
      const tailX1 = Math.min(w * 0.18, 32);
      const tailX2 = tailX1 + Math.min(w * 0.12, 18);
      const body = `M 0 0 L ${w} 0 L ${w} ${h - tail} L ${tailX2} ${h - tail} L ${tailX1 + (tailX2 - tailX1) / 2} ${h} L ${tailX1} ${h - tail} L 0 ${h - tail} Z`;
      return <path d={body} {...common} />;
    }
    case 'person': {
      // Stick-figure-ish: a head circle on top, a rounded body below. The
      // body's top y is shared with the label placement resolver so the
      // label always lands in the middle of the body rect.
      const headR = Math.min(w * 0.22, h * 0.28, 22);
      const bodyTop = personBodyTop(w, h);
      const bodyH = Math.max(0, h - bodyTop);
      const bodyR = Math.min(bodyH * 0.4, 18);
      return (
        <g>
          <circle cx={w / 2} cy={headR} r={headR} {...common} />
          <rect x={0} y={bodyTop} width={w} height={bodyH} rx={bodyR} {...common} />
        </g>
      );
    }
    case 'cloud': {
      // Cloud outline traced as a series of arcs along the top with a flat-ish
      // bottom. Approximation; close enough at typical sizes.
      const r = Math.min(w, h) * 0.28;
      const d =
        `M ${r} ${h} ` +
        `A ${r} ${r} 0 0 1 0 ${h - r * 1.1} ` +
        `A ${r * 1.1} ${r * 1.3} 0 0 1 ${r * 0.8} ${h * 0.35} ` +
        `A ${r * 1.3} ${r * 1.5} 0 0 1 ${w * 0.45} ${h * 0.05} ` +
        `A ${r * 1.1} ${r * 1.2} 0 0 1 ${w * 0.75} ${h * 0.2} ` +
        `A ${r * 1.2} ${r * 1.4} 0 0 1 ${w} ${h * 0.55} ` +
        `A ${r} ${r} 0 0 1 ${w - r * 0.8} ${h} Z`;
      return <path d={d} {...common} />;
    }
    case 'text':
    case 'code':
      // Pure-label shapes: no border, no fill. The label text rendered by the
      // caller is the entire visible content. We still emit an invisible rect
      // so getBBox / hit-testing for the group has something to hold.
      return <rect width={w} height={h} fill="transparent" stroke="none" pointerEvents="all" />;
    case 'class':
    case 'sql_table': {
      // Class diagrams and SQL tables in D2 carry sub-fields we don't model
      // yet; render as a labeled box with a header band so the shape is at
      // least visually distinct from a plain rectangle.
      const headerH = Math.min(h * 0.35, 24);
      return (
        <g>
          <rect width={w} height={h} rx={2} {...common} />
          <line
            x1={0}
            y1={headerH}
            x2={w}
            y2={headerH}
            stroke={common.stroke}
            strokeWidth={common.strokeWidth}
            opacity={common.opacity}
          />
        </g>
      );
    }
    default:
      return <rect width={w} height={h} rx={2} {...common} />;
  }
}
