import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '../store/graphStore.js';
import { NodeView } from './NodeView.js';
import { EdgeView } from './EdgeView.js';
import { GridDefs } from './GridDefs.js';

export function Canvas(): JSX.Element | null {
  const plan = useGraphStore((s) => s.plan);
  const layout = useGraphStore((s) => s.layout);
  const hostRef = useRef<HTMLDivElement | null>(null);
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
  }, []);

  if (!plan || !layout) return null;

  // SVG canvas grows to fill the host, and grows further if the diagram
  // exceeds it (so panning still works for diagrams larger than the window).
  const w = Math.max(host.w, plan.width);
  const h = Math.max(host.h, plan.height);

  return (
    <div ref={hostRef} className="canvas-fill">
      <svg
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
        <rect width={w} height={h} fill={`url(#${plan.grid.id})`} />
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
      </svg>
    </div>
  );
}
