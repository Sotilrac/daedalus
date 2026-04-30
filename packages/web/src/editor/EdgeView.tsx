import { useRef } from 'react';
import type { Arrowhead, Point, RenderEdge } from '@daedalus/shared';
import { projectOntoRoute } from '@daedalus/shared';
import { useGraphStore } from '../store/graphStore.js';

const LABEL_FONT_SIZE = 11;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 3;
// Rough mono-ish character advance for our UI font at 11px. Good enough for a
// background pill; we trade a few pixels of slack for not having to measure
// the rendered text after mount.
const LABEL_CHAR_W = 6.2;

// Arrow geometry. Sized in user units (px); scale roughly with stroke width
// so a thicker line carries a proportionally larger marker.
const ARROW_LEN = 9;
const ARROW_HALF = 4;
// Distance from the path's terminal point at which the marker sits. The line
// itself is shortened so it doesn't poke through the marker when the arrow
// is filled (a visible seam at the tip otherwise).
const TIP_INSET = 1;

export function EdgeView({ edge }: { edge: RenderEdge }): JSX.Element {
  if (!edge.path || edge.route.length < 2) return <g />;

  const stroke = edge.style.stroke;
  const strokeWidth = edge.style.strokeWidth;
  const opacity = edge.style.opacity;

  // Trim the path's geometric ends inward when a filled marker is present so
  // the underlying stroke doesn't bleed through the tip.
  const srcArrow = edge.srcArrow;
  const dstArrow = edge.dstArrow;
  const trimmed = trimRoute(edge.route, srcArrow, dstArrow);
  const path = polylineToPath(trimmed);

  let labelRect: { x: number; y: number; w: number; h: number } | null = null;
  if (edge.label) {
    const w = edge.label.length * LABEL_CHAR_W + LABEL_PAD_X * 2;
    const h = LABEL_FONT_SIZE + LABEL_PAD_Y * 2;
    labelRect = { x: edge.midpoint.x - w / 2, y: edge.midpoint.y - h / 2, w, h };
  }

  // Edge ids contain `->` and `#`, neither valid in `url(#…)` references.
  // Squash them to underscores so the mask URL resolves.
  const maskId = labelRect ? `edge-label-mask-${edge.id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : null;

  return (
    <g className="edge">
      {labelRect && maskId && (
        // Punch the label-shaped hole out of the path so the line appears to
        // pass *behind* the text instead of through a pill-shaped backdrop.
        // White = visible, black = hidden. The mask's own `x/y/width/height`
        // default to roughly the masked element's bbox; for long edges that
        // crops the path so anything outside the bbox-aligned region gets
        // masked out (the bug that "killed" some edges). Setting an explicit
        // region in user space ensures the mask covers the whole path.
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-1e6} y={-1e6} width={2e6} height={2e6}>
          <rect x={-1e6} y={-1e6} width={2e6} height={2e6} fill="white" />
          <rect
            x={labelRect.x}
            y={labelRect.y}
            width={labelRect.w}
            height={labelRect.h}
            rx={2}
            fill="black"
          />
        </mask>
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        {...(edge.style.strokeDasharray ? { strokeDasharray: edge.style.strokeDasharray } : {})}
        {...(maskId ? { mask: `url(#${maskId})` } : {})}
      />
      {srcArrow &&
        srcArrow !== 'none' &&
        renderArrow(edge.route, 'src', srcArrow, stroke, strokeWidth, opacity)}
      {dstArrow &&
        dstArrow !== 'none' &&
        renderArrow(edge.route, 'dst', dstArrow, stroke, strokeWidth, opacity)}
      {edge.label && labelRect && (
        <EdgeLabel
          edgeId={edge.id}
          route={edge.route}
          rect={labelRect}
          midpoint={edge.midpoint}
          color={edge.style.fontColor}
        >
          {edge.label}
        </EdgeLabel>
      )}
    </g>
  );
}

const DRAG_THRESHOLD = 3; // px before treating a press as a drag

// Renders the edge label and lets the user drag it along the route. The
// label sits at `midpoint` (computed from `EdgeLayout.labelT`); during
// drag we project the cursor onto the route polyline, convert to an arc-
// length fraction, and dispatch `moveEdgeLabel` so the new t persists.
function EdgeLabel({
  edgeId,
  route,
  rect,
  midpoint,
  color,
  children,
}: {
  edgeId: string;
  route: Point[];
  rect: { x: number; y: number; w: number; h: number };
  midpoint: Point;
  color: string;
  children: React.ReactNode;
}): JSX.Element {
  const moveEdgeLabel = useGraphStore((s) => s.moveEdgeLabel);
  const dragRef = useRef<{ pointerId: number; moved: boolean; startX: number; startY: number }>(
    null,
  );

  const onPointerDown = (e: React.PointerEvent<SVGGElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
    };
    useGraphStore.getState().setInteracting(true);
  };

  const onPointerMove = (e: React.PointerEvent<SVGGElement>): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moved = true;
    }
    // Convert client coords → SVG user space using the canvas's CTM.
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const t = projectOntoRoute(route, { x: local.x, y: local.y });
    moveEdgeLabel(edgeId, t);
  };

  const onPointerUp = (e: React.PointerEvent<SVGGElement>): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    useGraphStore.getState().setInteracting(false);
  };

  // Double-click resets the label to the route's midpoint (t = 0.5).
  const onDoubleClick = (e: React.MouseEvent<SVGGElement>): void => {
    e.stopPropagation();
    moveEdgeLabel(edgeId, 0.5);
  };

  return (
    <g
      className="edge-label"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      style={{ cursor: 'grab' }}
    >
      {/* Invisible hit area sized to the label rect so a click anywhere
          on/near the text grabs it for dragging. Without this, only the
          glyph strokes are clickable. */}
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
      <text
        x={midpoint.x}
        y={midpoint.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={LABEL_FONT_SIZE}
        pointerEvents="none"
      >
        {children}
      </text>
    </g>
  );
}

// ─── Geometry helpers ─────────────────────────────────────────────────────

interface Anchor {
  // Tip of the arrow (last point on the route at the marker end).
  tip: Point;
  // Unit vector pointing INTO the tip along the last segment.
  ux: number;
  uy: number;
  // Perpendicular unit vector (90° CCW from u).
  px: number;
  py: number;
}

function endpointAnchor(route: Point[], end: 'src' | 'dst'): Anchor | null {
  const tip = end === 'src' ? route[0] : route[route.length - 1];
  const prev = end === 'src' ? route[1] : route[route.length - 2];
  if (!tip || !prev) return null;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { tip, ux, uy, px: -uy, py: ux };
}

// Pull each end of the route inward when a filled marker sits there, so the
// stroke doesn't peek out beyond the tip when the arrow is drawn on top.
function trimRoute(
  route: Point[],
  src: Arrowhead | undefined,
  dst: Arrowhead | undefined,
): Point[] {
  if (route.length < 2) return route;
  const out = route.map((p) => ({ ...p }));
  trimEnd(out, 'src', src);
  trimEnd(out, 'dst', dst);
  return out;
}

function trimEnd(route: Point[], end: 'src' | 'dst', arrow: Arrowhead | undefined): void {
  if (!arrow || arrow === 'none') return;
  // Crow's-foot variants don't fill the tip, so no trim is needed and a trim
  // would leave a visible gap.
  if (arrow.startsWith('cf-') || arrow === 'line' || arrow === 'arrow') return;
  const anchor = endpointAnchor(route, end);
  if (!anchor) return;
  const idx = end === 'src' ? 0 : route.length - 1;
  const inset = ARROW_LEN - TIP_INSET;
  // Move the endpoint backwards along u (away from the tip).
  route[idx] = {
    x: anchor.tip.x - anchor.ux * inset,
    y: anchor.tip.y - anchor.uy * inset,
  };
}

function polylineToPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}

function renderArrow(
  route: Point[],
  end: 'src' | 'dst',
  shape: Arrowhead,
  stroke: string,
  strokeWidth: number,
  opacity: number,
): JSX.Element | null {
  const a = endpointAnchor(route, end);
  if (!a) return null;
  const sw = Math.max(0.5, strokeWidth);
  // Build a local frame: tip at origin, u pointing forward, p perpendicular.
  // Then translate-and-rotate the whole shape into place.
  const angle = (Math.atan2(a.uy, a.ux) * 180) / Math.PI;
  const transform = `translate(${a.tip.x} ${a.tip.y}) rotate(${angle})`;

  switch (shape) {
    case 'triangle':
    case 'filled-box':
    case 'filled-diamond':
    case 'filled-circle':
    case 'box':
    case 'diamond':
    case 'circle':
    case 'unfilled-triangle':
    case 'arrow':
    case 'line':
      break;
    default:
      // Crow's foot variants fall through to their own renderer below.
      break;
  }

  if (shape === 'arrow') {
    // Open V shape: two strokes meeting at the tip.
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity} fill="none">
        <polyline points={`${-ARROW_LEN},${-ARROW_HALF} 0,0 ${-ARROW_LEN},${ARROW_HALF}`} />
      </g>
    );
  }
  if (shape === 'line') {
    // Single perpendicular tick at the tip.
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity}>
        <line x1={0} y1={-ARROW_HALF} x2={0} y2={ARROW_HALF} />
      </g>
    );
  }
  if (shape === 'triangle' || shape === 'unfilled-triangle') {
    const filled = shape === 'triangle';
    return (
      <g
        transform={transform}
        stroke={stroke}
        strokeWidth={sw}
        opacity={opacity}
        fill={filled ? stroke : 'none'}
        strokeLinejoin="miter"
      >
        <polygon points={`0,0 ${-ARROW_LEN},${-ARROW_HALF} ${-ARROW_LEN},${ARROW_HALF}`} />
      </g>
    );
  }
  if (shape === 'diamond' || shape === 'filled-diamond') {
    const filled = shape === 'filled-diamond';
    const half = ARROW_HALF;
    const len = ARROW_LEN;
    return (
      <g
        transform={transform}
        stroke={stroke}
        strokeWidth={sw}
        opacity={opacity}
        fill={filled ? stroke : 'none'}
      >
        <polygon points={`0,0 ${-len / 2},${-half} ${-len},0 ${-len / 2},${half}`} />
      </g>
    );
  }
  if (shape === 'circle' || shape === 'filled-circle') {
    const filled = shape === 'filled-circle';
    const r = ARROW_HALF;
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity}>
        <circle cx={-r} cy={0} r={r} fill={filled ? stroke : 'none'} />
      </g>
    );
  }
  if (shape === 'box' || shape === 'filled-box') {
    const filled = shape === 'filled-box';
    const side = ARROW_HALF * 2;
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity}>
        <rect
          x={-side}
          y={-ARROW_HALF}
          width={side}
          height={side}
          fill={filled ? stroke : 'none'}
        />
      </g>
    );
  }
  if (shape === 'cf-one') {
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity} fill="none">
        <line x1={-ARROW_LEN} y1={-ARROW_HALF} x2={-ARROW_LEN} y2={ARROW_HALF} />
      </g>
    );
  }
  if (shape === 'cf-many') {
    // Crow's foot: three lines fanning from a point near the tip out to the
    // endpoint, indicating "many".
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity} fill="none">
        <line x1={-ARROW_LEN} y1={0} x2={0} y2={-ARROW_HALF} />
        <line x1={-ARROW_LEN} y1={0} x2={0} y2={0} />
        <line x1={-ARROW_LEN} y1={0} x2={0} y2={ARROW_HALF} />
      </g>
    );
  }
  if (shape === 'cf-one-required') {
    // Two perpendicular lines (||): "one and only one".
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity} fill="none">
        <line x1={-ARROW_LEN} y1={-ARROW_HALF} x2={-ARROW_LEN} y2={ARROW_HALF} />
        <line x1={-ARROW_LEN + 3} y1={-ARROW_HALF} x2={-ARROW_LEN + 3} y2={ARROW_HALF} />
      </g>
    );
  }
  if (shape === 'cf-many-required') {
    // Crow's foot plus a perpendicular line: "one or many, required".
    return (
      <g transform={transform} stroke={stroke} strokeWidth={sw} opacity={opacity} fill="none">
        <line x1={-ARROW_LEN} y1={-ARROW_HALF} x2={-ARROW_LEN} y2={ARROW_HALF} />
        <line x1={-ARROW_LEN + 3} y1={0} x2={0} y2={-ARROW_HALF} />
        <line x1={-ARROW_LEN + 3} y1={0} x2={0} y2={0} />
        <line x1={-ARROW_LEN + 3} y1={0} x2={0} y2={ARROW_HALF} />
      </g>
    );
  }
  return null;
}
