import type { RenderEdge } from '@daedalus/shared';

const LABEL_FONT_SIZE = 11;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 3;
// Rough mono-ish character advance for our UI font at 11px. Good enough for a
// background pill; we trade a few pixels of slack for not having to measure
// the rendered text after mount.
const LABEL_CHAR_W = 6.2;

export function EdgeView({ edge }: { edge: RenderEdge }): JSX.Element {
  if (!edge.path) return <g />;

  let labelEls: JSX.Element | null = null;
  if (edge.label) {
    const w = edge.label.length * LABEL_CHAR_W + LABEL_PAD_X * 2;
    const h = LABEL_FONT_SIZE + LABEL_PAD_Y * 2;
    labelEls = (
      <g>
        <rect
          className="label-bg"
          x={edge.midpoint.x - w / 2}
          y={edge.midpoint.y - h / 2}
          width={w}
          height={h}
          rx={2}
          fill={edge.labelBackground}
          stroke="none"
        />
        <text
          x={edge.midpoint.x}
          y={edge.midpoint.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={edge.style.fontColor}
          fontSize={LABEL_FONT_SIZE}
        >
          {edge.label}
        </text>
      </g>
    );
  }

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
      {labelEls}
    </g>
  );
}
