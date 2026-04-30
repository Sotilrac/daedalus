import type {
  Arrowhead,
  EdgeRoutes,
  LabelPosition,
  Layout,
  Model,
  Point,
  ShapeKind,
} from '../model/types.js';
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
  // For shape: image — the raw path string from D2's `icon` keyword. The
  // web renderer resolves it against the project folder.
  imageSrc?: string;
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
  // Polyline points: keep the raw geometry so the renderer can derive
  // arrow tip/direction without re-parsing the path string.
  route: Point[];
  label?: string;
  midpoint: Point;
  style: ReturnType<typeof resolveEdgeStyle>;
  srcArrow?: Arrowhead;
  dstArrow?: Arrowhead;
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
    const out: RenderNode = {
      id,
      shape: n.shape,
      x,
      y,
      w,
      h,
      label: n.label,
      labelPlacement: resolveLabelPlacement(n.labelPosition, w, h, n.shape),
      style: resolveNodeStyle(palette, n.style),
      isContainer: isContainer(nodeIds, id),
    };
    if (n.imageSrc) out.imageSrc = n.imageSrc;
    return out;
  });

  const edges: RenderEdge[] = Object.entries(model.edges).map(([id, e]) => {
    const route = routes[id] ?? [];
    const path = polylineToPath(route);
    const t = layout.edges[id]?.labelT ?? 0.5;
    const midpoint = pointAlongRoute(route, t);
    const style = resolveEdgeStyle(palette, e.style);
    const out: RenderEdge = {
      id,
      path,
      route: [...route],
      midpoint,
      style,
    };
    if (e.label) out.label = e.label;
    if (e.srcArrow) out.srcArrow = e.srcArrow;
    if (e.dstArrow) out.dstArrow = e.dstArrow;
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

// Place a point at the given fraction (0..1) of the polyline's arc length.
// 0 = source endpoint, 1 = destination endpoint, 0.5 = midpoint. The label
// rendering uses this both for the default midpoint and for user-dragged
// positions stored on EdgeLayout.labelT.
export function pointAlongRoute(route: readonly Point[], t: number): Point {
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

  const clamped = Math.max(0, Math.min(1, t));
  const target = total * clamped;
  let acc = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= target) {
      const f = len === 0 ? 0 : (target - acc) / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    acc += len;
  }
  return route[route.length - 1] ?? { x: 0, y: 0 };
}

// Backward-compatible alias for the midpoint case used by tests.
export function labelPoint(route: readonly Point[]): Point {
  return pointAlongRoute(route, 0.5);
}

// Project a query point onto the polyline; return the t (0..1) of the
// nearest point along arc length. Used by the edge-label drag handler to
// turn a cursor position into a `labelT` to store on EdgeLayout.
export function projectOntoRoute(route: readonly Point[], p: Point): number {
  if (route.length < 2) return 0.5;
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if (!a || !b) {
      lens.push(0);
      continue;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  if (total === 0) return 0.5;

  let bestT = 0.5;
  let bestDist = Infinity;
  let acc = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const len = lens[i] ?? 0;
    if (!a || !b || len === 0) {
      acc += len;
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
    const cl = Math.max(0, Math.min(1, u));
    const projX = a.x + dx * cl;
    const projY = a.y + dy * cl;
    const dist = Math.hypot(p.x - projX, p.y - projY);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = (acc + len * cl) / total;
    }
    acc += len;
  }
  return bestT;
}

// Map D2's `labelPosition` enum (e.g. "INSIDE_TOP_CENTER", "OUTSIDE_BOTTOM_LEFT")
// onto local-coord SVG attributes. Falls back to centered-inside when the
// position is missing, unset, or unrecognised. Coords are local to the
// node's group origin, so a negative `y` puts the label above the box.
const LABEL_INSET = 6;

// Y where the body of a `person` shape begins, given total node height.
// Shared between the renderer and the label-placement resolver so the label
// stays centered in the body even when the user resizes the node.
export function personBodyTop(w: number, h: number): number {
  const headR = Math.min(w * 0.22, h * 0.28, 22);
  return headR * 2 + 2;
}

export function resolveLabelPlacement(
  position: LabelPosition | undefined,
  w: number,
  h: number,
  shape?: ShapeKind,
): LabelPlacement {
  // For `person`, D2 emits `OUTSIDE_BOTTOM_CENTER` as the *default* label
  // position. We can't distinguish that default from a deliberate user
  // override, but the in-body placement is what users almost always want
  // visually, so we override both the unset case and the default. An
  // explicit position other than the default still wins.
  if (
    shape === 'person' &&
    (!position || position === 'UNSET_LABEL_POSITION' || position === 'OUTSIDE_BOTTOM_CENTER')
  ) {
    const bodyTop = personBodyTop(w, h);
    return {
      x: w / 2,
      y: (bodyTop + h) / 2,
      textAnchor: 'middle',
      dominantBaseline: 'central',
    };
  }
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

// Greedy word-wrap based on an estimated average glyph width. We can't run
// real text metrics here (shared is DOM-free), but for the sans-serif fonts
// used in the canvas a 0.55× ratio is a reasonable approximation that
// errs slightly on the side of wrapping early.
const AVG_GLYPH_RATIO = 0.55;

export function wrapLabel(label: string, maxWidth: number, fontSize: number): string[] {
  if (!label) return [''];
  if (maxWidth <= 0 || !Number.isFinite(maxWidth)) return [label];

  const charWidth = fontSize * AVG_GLYPH_RATIO;
  const fits = (s: string): boolean => s.length * charWidth <= maxWidth;

  const out: string[] = [];
  for (const segment of label.split(/\r?\n/)) {
    if (segment === '') {
      out.push('');
      continue;
    }
    const words = segment.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) {
        out.push(line);
        line = '';
      }
      // Word still wider than the available width: hard-break by characters.
      if (!fits(word)) {
        let chunk = '';
        for (const ch of word) {
          if (!fits(chunk + ch) && chunk) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

export function polylineToPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Axis-aligned union of every node box and every route waypoint, in the
// layout's natural coordinate space (no viewOffset applied). Returns null
// when there's nothing to bound. Used by the editor to fit the export
// outline to its content and by `onCenter` to place that content in view.
export function naturalBBox(layout: Layout, routes: EdgeRoutes): BBox | null {
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
}
