import type { EdgeRoutes, LabelPosition, Layout, Model, Point, ShapeKind } from '../model/types.js';
import { isContainer } from '../model/ids.js';
import { gridPattern } from './grid.js';
import {
  resolveEdgeStyle,
  resolveNodeStyle,
  themes,
  type ThemeName,
  type ThemePalette,
} from './theme.js';

// Pure-data render plan that the web layer turns into JSX. Keeping it pure lets
// us reuse the exact same plan for SVG export, snapshot tests, and the
// editor canvas without introducing a DOM dependency in `shared`.

export interface RenderPlan {
  width: number;
  height: number;
  palette: ThemePalette;
  grid: ReturnType<typeof gridPattern>;
  nodes: RenderNode[];
  edges: RenderEdge[];
}

export interface RenderNode {
  id: string;
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  // Resolved local-coord placement for the label text element, derived from
  // D2's `labelPosition` hint. The values are SVG-attribute-ready.
  labelPlacement: LabelPlacement;
  style: ReturnType<typeof resolveNodeStyle>;
  // True when at least one other node id is a deep-ref child of this one.
  // Container nodes render behind edges so the connections that target them
  // (or pass over them) stay visible.
  isContainer: boolean;
}

export interface LabelPlacement {
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  dominantBaseline: 'hanging' | 'central' | 'auto';
}

export interface RenderEdge {
  id: string;
  path: string; // SVG path "d" attribute
  label?: string;
  midpoint: Point;
  labelBackground: string; // resolved theme hex for label pill
  style: ReturnType<typeof resolveEdgeStyle>;
}

export interface BuildPlanInput {
  model: Model;
  layout: Layout;
  routes: EdgeRoutes;
  theme?: ThemeName;
}

export function buildRenderPlan({ model, layout, routes, theme }: BuildPlanInput): RenderPlan {
  const themeName: ThemeName = theme ?? layout.viewport.theme;
  const palette = themes[themeName];

  const nodeIds = Object.keys(model.nodes);
  const nodes: RenderNode[] = Object.entries(model.nodes).map(([id, n]) => {
    const l = layout.nodes[id];
    const x = l?.x ?? 0;
    const y = l?.y ?? 0;
    const w = l?.w ?? n.rawWidth;
    const h = l?.h ?? n.rawHeight;
    return {
      id,
      shape: n.shape,
      x,
      y,
      w,
      h,
      label: n.label,
      labelPlacement: resolveLabelPlacement(n.labelPosition, w, h),
      style: resolveNodeStyle(palette, n.style),
      isContainer: isContainer(nodeIds, id),
    };
  });

  const edges: RenderEdge[] = Object.entries(model.edges).map(([id, e]) => {
    const route = routes[id] ?? [];
    const path = polylineToPath(route);
    const midpoint = labelPoint(route);
    const style = resolveEdgeStyle(palette, e.style);
    const out: RenderEdge = { id, path, midpoint, labelBackground: palette.paper, style };
    if (e.label) out.label = e.label;
    return out;
  });

  return {
    width: layout.grid.cols * layout.grid.size,
    height: layout.grid.rows * layout.grid.size,
    palette,
    grid: gridPattern(layout.grid, palette),
    nodes,
    edges,
  };
}

// Place the label at the polyline's arc-length midpoint. For straight routes
// libavoid often emits multiple collinear segments — picking the longest
// segment lands the label near one end of the run, so we walk the route and
// stop when we've covered half the total length.
export function labelPoint(route: readonly Point[]): Point {
  if (route.length === 0) return { x: 0, y: 0 };
  if (route.length === 1) return route[0] ?? { x: 0, y: 0 };

  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (total === 0) return route[0] ?? { x: 0, y: 0 };

  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= half) {
      const t = len === 0 ? 0 : (half - acc) / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += len;
  }
  return route[route.length - 1] ?? { x: 0, y: 0 };
}

// Map D2's `labelPosition` enum (e.g. "INSIDE_TOP_CENTER", "OUTSIDE_BOTTOM_LEFT")
// onto local-coord SVG attributes. Falls back to centered-inside when the
// position is missing, unset, or unrecognised. Coords are local to the
// node's group origin, so a negative `y` puts the label above the box.
const LABEL_INSET = 6;

export function resolveLabelPlacement(
  position: LabelPosition | undefined,
  w: number,
  h: number,
): LabelPlacement {
  const fallback: LabelPlacement = {
    x: w / 2,
    y: h / 2,
    textAnchor: 'middle',
    dominantBaseline: 'central',
  };
  if (!position || position === 'UNSET_LABEL_POSITION') return fallback;
  const parts = position.split('_');
  if (parts.length !== 3) return fallback;
  const [zone, vert, horiz] = parts;

  let { x, y, textAnchor, dominantBaseline } = fallback;

  if (zone === 'OUTSIDE') {
    if (vert === 'TOP') {
      y = -LABEL_INSET;
      dominantBaseline = 'auto';
    } else if (vert === 'BOTTOM') {
      y = h + LABEL_INSET;
      dominantBaseline = 'hanging';
    } else {
      y = h / 2;
      dominantBaseline = 'central';
    }
    if (vert === 'MIDDLE') {
      // Labels to the left/right of the shape.
      if (horiz === 'LEFT') {
        x = -LABEL_INSET;
        textAnchor = 'end';
      } else if (horiz === 'RIGHT') {
        x = w + LABEL_INSET;
        textAnchor = 'start';
      } else {
        x = w / 2;
        textAnchor = 'middle';
      }
    } else {
      // Above or below: anchor horizontally inside the column.
      if (horiz === 'LEFT') {
        x = 0;
        textAnchor = 'start';
      } else if (horiz === 'RIGHT') {
        x = w;
        textAnchor = 'end';
      } else {
        x = w / 2;
        textAnchor = 'middle';
      }
    }
  } else if (zone === 'BORDER') {
    // Sit centered on the edge line.
    if (vert === 'TOP') y = 0;
    else if (vert === 'BOTTOM') y = h;
    else y = h / 2;
    dominantBaseline = 'central';
    if (horiz === 'LEFT') {
      x = LABEL_INSET;
      textAnchor = 'start';
    } else if (horiz === 'RIGHT') {
      x = w - LABEL_INSET;
      textAnchor = 'end';
    } else {
      x = w / 2;
      textAnchor = 'middle';
    }
  } else {
    // Default to INSIDE for unknown zones.
    if (vert === 'TOP') {
      y = LABEL_INSET;
      dominantBaseline = 'hanging';
    } else if (vert === 'BOTTOM') {
      y = h - LABEL_INSET;
      dominantBaseline = 'auto';
    } else {
      y = h / 2;
      dominantBaseline = 'central';
    }
    if (horiz === 'LEFT') {
      x = LABEL_INSET;
      textAnchor = 'start';
    } else if (horiz === 'RIGHT') {
      x = w - LABEL_INSET;
      textAnchor = 'end';
    } else {
      x = w / 2;
      textAnchor = 'middle';
    }
  }

  return { x, y, textAnchor, dominantBaseline };
}

export function polylineToPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}
