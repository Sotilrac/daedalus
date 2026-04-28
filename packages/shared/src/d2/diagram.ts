import type {
  Arrowhead,
  Model,
  ModelEdge,
  ModelNode,
  NodeStyle,
  EdgeStyle,
  ShapeKind,
} from '../model/types.js';
import { edgeId } from '../model/ids.js';
import type { D2Diagram } from './types.js';

const SHAPE_KINDS = new Set<ShapeKind>([
  'rectangle',
  'square',
  'circle',
  'oval',
  'diamond',
  'hexagon',
  'parallelogram',
  'cylinder',
  'document',
  'stored_data',
  'package',
  'page',
  'queue',
  'step',
  'callout',
  'person',
  'cloud',
  'text',
  'code',
  'class',
  'sql_table',
]);

function asShapeKind(t: string | undefined): ShapeKind {
  if (t && (SHAPE_KINDS as Set<string>).has(t)) return t as ShapeKind;
  return 'rectangle';
}

// D2's compile output exposes shape and connection styles as flat fields on
// the object (fill, stroke, strokeWidth, strokeDash, ...). Earlier versions of
// this adapter expected a nested `style` object; that's the d2graph view, not
// d2target. We read flat fields here.
interface D2FlatNode {
  id: string;
  type?: string;
  pos?: { x: number; y: number };
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: number;
  opacity?: number;
  shadow?: boolean;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  label?: string;
  // Text mixin in d2target.Shape:
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  // d2target.Shape.labelPosition — string enum like "INSIDE_TOP_CENTER",
  // "OUTSIDE_BOTTOM_LEFT", etc. May be missing on older d2 versions or when
  // the user didn't set `near`.
  labelPosition?: string;
}

interface D2FlatConnection {
  src: string;
  dst: string;
  label?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDash?: number;
  opacity?: number;
  fontColor?: string;
  color?: string;
  italic?: boolean;
  bold?: boolean;
  srcArrow?: string;
  dstArrow?: string;
}

const ARROWHEADS = new Set<Arrowhead>([
  'none',
  'arrow',
  'triangle',
  'unfilled-triangle',
  'diamond',
  'filled-diamond',
  'circle',
  'filled-circle',
  'box',
  'filled-box',
  'line',
  'cf-one',
  'cf-many',
  'cf-one-required',
  'cf-many-required',
]);

function asArrowhead(v: string | undefined): Arrowhead | undefined {
  if (!v) return undefined;
  return (ARROWHEADS as Set<string>).has(v) ? (v as Arrowhead) : undefined;
}

// D2 emits its internal theme palette tokens (e.g. "B1", "N7", "AA2") on the
// flat fill/stroke fields whenever the user hasn't set an explicit color.
// These are placeholders that D2's own renderer resolves to hex per the
// chosen theme; they reach us as literal strings and become invalid CSS,
// which browsers render as black. Strip them so the daedalus palette's
// fallbacks apply instead.
const D2_THEME_TOKEN = /^[A-Z]{1,3}\d+$/;
function isThemeToken(value: string | undefined): boolean {
  return typeof value === 'string' && D2_THEME_TOKEN.test(value);
}

function nodeStyle(s: D2FlatNode): NodeStyle {
  const out: NodeStyle = {};
  if (s.fill !== undefined && !isThemeToken(s.fill)) out.fill = s.fill;
  if (s.stroke !== undefined && !isThemeToken(s.stroke)) out.stroke = s.stroke;
  if (typeof s.strokeWidth === 'number') out.strokeWidth = s.strokeWidth;
  if (typeof s.strokeDash === 'number' && s.strokeDash > 0) out.strokeDash = s.strokeDash;
  if (s.fontColor !== undefined && !isThemeToken(s.fontColor)) out.fontColor = s.fontColor;
  if (s.color !== undefined && !isThemeToken(s.color) && out.fontColor === undefined)
    out.fontColor = s.color;
  if (typeof s.fontSize === 'number' && s.fontSize > 0) out.fontSize = s.fontSize;
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.shadow) out.shadow = true;
  if (typeof s.opacity === 'number' && s.opacity !== 1) out.opacity = s.opacity;
  return out;
}

function edgeStyle(c: D2FlatConnection): EdgeStyle {
  const out: EdgeStyle = {};
  if (c.stroke !== undefined && !isThemeToken(c.stroke)) out.stroke = c.stroke;
  if (typeof c.strokeWidth === 'number') out.strokeWidth = c.strokeWidth;
  if (typeof c.strokeDash === 'number' && c.strokeDash > 0) out.strokeDash = c.strokeDash;
  // Only pick up an explicit `fontColor`. D2's flat `color` field is filled
  // in with the engine's default (typically near-black) regardless of theme,
  // so reusing it would make connection labels unreadable on dark themes.
  // Falling through to the resolver lets the theme's ink apply instead.
  if (c.fontColor !== undefined && !isThemeToken(c.fontColor)) out.fontColor = c.fontColor;
  if (typeof c.opacity === 'number' && c.opacity !== 1) out.opacity = c.opacity;
  return out;
}

function shapeToNode(s: D2FlatNode): ModelNode {
  const out: ModelNode = {
    label: s.label ?? s.id,
    shape: asShapeKind(s.type),
    style: nodeStyle(s),
    rawWidth: s.width ?? 144,
    rawHeight: s.height ?? 64,
  };
  if (s.labelPosition && s.labelPosition !== 'UNSET_LABEL_POSITION') {
    out.labelPosition = s.labelPosition;
  }
  return out;
}

function connectionToEdge(c: D2FlatConnection): ModelEdge {
  const edge: ModelEdge = {
    from: c.src,
    to: c.dst,
    style: edgeStyle(c),
  };
  if (c.label) edge.label = c.label;
  const srcArrow = asArrowhead(c.srcArrow);
  const dstArrow = asArrowhead(c.dstArrow);
  if (srcArrow) edge.srcArrow = srcArrow;
  if (dstArrow) edge.dstArrow = dstArrow;
  return edge;
}

export function diagramToModel(d: D2Diagram): Model {
  const nodes: Record<string, ModelNode> = {};
  for (const s of (d.shapes ?? []) as unknown as D2FlatNode[]) {
    nodes[s.id] = shapeToNode(s);
  }
  const counts = new Map<string, number>();
  const edges: Record<string, ModelEdge> = {};
  for (const c of (d.connections ?? []) as unknown as D2FlatConnection[]) {
    const key = `${c.src}->${c.dst}`;
    const idx = counts.get(key) ?? 0;
    counts.set(key, idx + 1);
    edges[edgeId(c.src, c.dst, idx)] = connectionToEdge(c);
  }
  return { nodes, edges };
}
