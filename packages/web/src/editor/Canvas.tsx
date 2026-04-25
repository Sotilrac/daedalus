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

  // Bounding box of the laid-out diagram (plus a margin so nodes don't sit
  // flush with the canvas edge). The visible canvas is then max(window, box).
  const margin = layout.grid.size * 4;
  let maxRight = 0;
  let maxBottom = 0;
  for (const node of plan.nodes) {
    maxRight = Math.max(maxRight, node.x + node.w);
    maxBottom = Math.max(maxBottom, node.y + node.h);
  }
  const contentW = maxRight + margin;
  const contentH = maxBottom + margin;
  const w = Math.max(host.w, contentW);
  const h = Math.max(host.h, contentH);

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
        <rect className="grid-bg" width={w} height={h} fill={`url(#${plan.grid.id})`} />
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
