import { forwardRef, useEffect, useRef, useState, type RefObject } from 'react';
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

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [bbox, setBbox] = useState<BBox | null>(null);

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

  // Measure the diagram bounding box from the live `.nodes` and `.edges`
  // groups. We back out the current viewOffset so the bbox is in the
  // diagram's natural coords and can be re-translated on the next render.
  useEffect(() => {
    if (!svgRef.current) return undefined;
    const id = requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (!svg) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sel of ['.nodes', '.edges']) {
        const g = svg.querySelector<SVGGElement>(sel);
        if (!g) continue;
        const b = g.getBBox();
        if (b.width === 0 && b.height === 0) continue;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.width > maxX) maxX = b.x + b.width;
        if (b.y + b.height > maxY) maxY = b.y + b.height;
      }
      if (Number.isFinite(minX)) {
        setBbox({
          x: minX - viewOffset.x,
          y: minY - viewOffset.y,
          w: maxX - minX,
          h: maxY - minY,
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [plan, viewOffset.x, viewOffset.y]);

  if (!plan || !layout) return null;

  const margin = layout.settings.export.margin;
  const exportW = bbox ? Math.round(bbox.w + 2 * margin) : 0;
  const exportH = bbox ? Math.round(bbox.h + 2 * margin) : 0;

  // Allow space for the size label below the outline (~24px).
  const contentRight = bbox ? viewOffset.x + bbox.x + bbox.w + margin + 96 : 0;
  const contentBottom = bbox ? viewOffset.y + bbox.y + bbox.h + margin + 32 : 0;
  const w = Math.max(host.w, contentRight);
  const h = Math.max(host.h, contentBottom);

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
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Diagram"
        data-theme={layout.viewport.theme}
        style={{ background: plan.palette.paper }}
      >
        <defs>
          <GridDefs grid={plan.grid} />
        </defs>
        <rect className="grid-bg" width={w} height={h} fill={`url(#${plan.grid.id})`} />
        <g transform={`translate(${viewOffset.x} ${viewOffset.y})`}>
          <g className="edges">
            {plan.edges.map((e) => (
              <EdgeView key={e.id} edge={e} />
            ))}
          </g>
          <g className="nodes">
            {plan.nodes.map((n) => (
              <NodeView key={n.id} node={n} />
            ))}
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
        </g>
      </svg>
    </div>
  );
});
