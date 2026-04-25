import type { RenderEdge } from '@daedalus/shared';

export function EdgeView({ edge }: { edge: RenderEdge }): JSX.Element {
  if (!edge.path) return <g />;
  return (
    <g className="edge">
      <path
        d={edge.path}
        fill="none"
        stroke={edge.style.stroke}
        strokeWidth={edge.style.strokeWidth}
        opacity={edge.style.opacity}
        {...(edge.style.strokeDasharray ? { strokeDasharray: edge.style.strokeDasharray } : {})}
      />
      {edge.label && (
        <text
          x={edge.midpoint.x}
          y={edge.midpoint.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={edge.style.fontColor}
          fontSize={11}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}
