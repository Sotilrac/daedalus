import type { EdgeRoutes, Layout, Model, Point, ShapeKind } from '../model/types.js';
import { gridPattern } from './grid.js';
import { resolveEdgeStyle, resolveNodeStyle, themes, type ThemeName, type ThemePalette } from './theme.js';

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
  style: ReturnType<typeof resolveNodeStyle>;
}

export interface RenderEdge {
  id: string;
  path: string; // SVG path "d" attribute
  label?: string;
  midpoint: Point;
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
      style: resolveNodeStyle(palette, n.style),
    };
  });

  const edges: RenderEdge[] = Object.entries(model.edges).map(([id, e]) => {
    const route = routes[id] ?? [];
    const path = polylineToPath(route);
    const midpoint = route[Math.floor(route.length / 2)] ?? { x: 0, y: 0 };
    const style = resolveEdgeStyle(palette, e.style);
    const out: RenderEdge = { id, path, midpoint, style };
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

export function polylineToPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}
