import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useGraphStore } from '../store/graphStore.js';
import { NodeView } from './NodeView.js';
import { EdgeView } from './EdgeView.js';
import { GridDefs } from './GridDefs.js';

interface CanvasProps {
  hostRef: RefObject<HTMLDivElement | null>;
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const Canvas = forwardRef<SVGSVGElement, CanvasProps>(function Canvas(
  { hostRef },
  ref,
): JSX.Element | null {
  const plan = useGraphStore((s) => s.plan);
  const layout = useGraphStore((s) => s.layout);
  const viewOffset = useGraphStore((s) => s.viewOffset);
  const clearSelection = useGraphStore((s) => s.clearSelection);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const routes = useGraphStore((s) => s.routes);
  const [host, setHost] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    setHost({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setHost({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hostRef]);

  // Natural-coords bbox of the diagram (before applying viewOffset). Computed
  // directly from layout + routes — no DOM measurement — so the outline tracks
  // the content in lock-step instead of via a measure-then-render round trip.
  const naturalBBox = useMemo<BBox | null>(() => {
    if (!layout) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of Object.values(layout.nodes)) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.w > maxX) maxX = n.x + n.w;
      if (n.y + n.h > maxY) maxY = n.y + n.h;
    }
    for (const route of Object.values(routes)) {
      for (const p of route) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [layout, routes]);

  // Compute everything that depends only on naturalBBox + viewOffset BEFORE
  // any conditional return, so the hooks below run unconditionally.
  const margin = layout?.settings.export.margin ?? 0;
  const bbox: BBox | null = naturalBBox
    ? {
        x: naturalBBox.x + viewOffset.x,
        y: naturalBBox.y + viewOffset.y,
        w: naturalBBox.w,
        h: naturalBBox.h,
      }
    : null;

  const outlineLeft = bbox ? bbox.x - margin : 0;
  const outlineTop = bbox ? bbox.y - margin : 0;
  const outlineRight = bbox ? bbox.x + bbox.w + margin : 0;
  const outlineBottom = bbox ? bbox.y + bbox.h + margin : 0;

  // The canvas grows in *both* directions so users can drag nodes into
  // negative space (essentially infinite canvas) without hitting a wall.
  const svgMinX = Math.min(0, outlineLeft - 24);
  const svgMinY = Math.min(0, outlineTop - 24);
  const svgMaxX = Math.max(host.w, outlineRight + 96);
  const svgMaxY = Math.max(host.h, outlineBottom + 32);
  const w = svgMaxX - svgMinX;
  const h = svgMaxY - svgMinY;

  // Keep the user's scroll position stable when the viewBox origin shifts —
  // otherwise expanding the canvas leftward/upward makes existing content
  // appear to jump. Hook must come before any early return.
  const prevOriginRef = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const prev = prevOriginRef.current;
    if (prev) {
      const dx = svgMinX - prev.x;
      const dy = svgMinY - prev.y;
      if (dx !== 0) el.scrollLeft -= dx;
      if (dy !== 0) el.scrollTop -= dy;
    }
    prevOriginRef.current = { x: svgMinX, y: svgMinY };
  }, [svgMinX, svgMinY, hostRef]);

  if (!plan || !layout) return null;

  const exportW = bbox ? Math.round(bbox.w + 2 * margin) : 0;
  const exportH = bbox ? Math.round(bbox.h + 2 * margin) : 0;

  return (
    <div className="canvas-fill">
      <svg
        ref={(node) => {
          svgRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        width={w}
        height={h}
        viewBox={`${svgMinX} ${svgMinY} ${w} ${h}`}
        role="img"
        aria-label="Diagram"
        data-theme={layout.viewport.theme}
        style={{ background: plan.palette.paper }}
        onPointerDown={(e) => {
          // Click on empty canvas (background or any non-interactive child
          // that didn't stopPropagation) clears the selection.
          if (e.target === e.currentTarget || (e.target as Element).classList.contains('grid-bg')) {
            clearSelection();
          }
        }}
      >
        <defs>
          <GridDefs grid={plan.grid} />
        </defs>
        <rect
          className="grid-bg"
          x={svgMinX}
          y={svgMinY}
          width={w}
          height={h}
          fill={`url(#${plan.grid.id})`}
        />
        <g transform={`translate(${viewOffset.x} ${viewOffset.y})`}>
          {/* Containers render first so edges and inner nodes paint on top of
              them. Edges sit above containers but below leaf nodes, so a
              connection that targets a container is still readable. */}
          <g className="containers">
            {plan.nodes
              .filter((n) => n.isContainer)
              .map((n) => (
                <NodeView key={n.id} node={n} />
              ))}
          </g>
          <g className="edges">
            {plan.edges.map((e) => (
              <EdgeView key={e.id} edge={e} />
            ))}
          </g>
          <g className="nodes">
            {plan.nodes
              .filter((n) => !n.isContainer)
              .map((n) => (
                <NodeView key={n.id} node={n} />
              ))}
          </g>
        </g>
        {bbox && (
          <g className="export-outline">
            <rect
              x={bbox.x - margin}
              y={bbox.y - margin}
              width={exportW}
              height={exportH}
              fill="none"
              stroke="var(--ink-muted)"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.5}
            />
            <text
              className="size-label"
              x={bbox.x + bbox.w + margin}
              y={bbox.y + bbox.h + margin + 14}
              textAnchor="end"
              fill="var(--ink-muted)"
              fontFamily="var(--font-mono)"
              fontSize={10}
            >
              {exportW} × {exportH} px
            </text>
          </g>
        )}
      </svg>
    </div>
  );
});
