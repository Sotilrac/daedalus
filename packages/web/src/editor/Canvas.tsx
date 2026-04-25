import { useGraphStore } from '../store/graphStore.js';
import { NodeView } from './NodeView.js';
import { EdgeView } from './EdgeView.js';
import { GridDefs } from './GridDefs.js';

export function Canvas(): JSX.Element | null {
  const plan = useGraphStore((s) => s.plan);
  const layout = useGraphStore((s) => s.layout);
  if (!plan || !layout) return null;

  return (
    <svg
      width={plan.width}
      height={plan.height}
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      role="img"
      aria-label="Diagram"
      data-theme={layout.viewport.theme}
      style={{ background: plan.palette.paper }}
    >
      <defs>
        <GridDefs grid={plan.grid} />
      </defs>
      <rect width={plan.width} height={plan.height} fill={`url(#${plan.grid.id})`} />
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
  );
}
