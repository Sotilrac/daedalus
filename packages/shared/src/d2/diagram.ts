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
  'image',
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
  // For `shape: image`, D2 emits the icon as Go's `*url.URL` struct,
  // serialized verbatim — *not* the string form the bundled typings claim.
  // Older d2 versions may emit the string; we accept either.
  icon?: string | D2URL;
}

// JSON-serialized `*url.URL`. Fields match Go's `net/url.URL` struct.
interface D2URL {
  Scheme?: string;
  Host?: string;
  Path?: string;
  RawPath?: string;
  RawQuery?: string;
  Fragment?: string;
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
  animated?: boolean;
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
  if (c.bold) out.bold = true;
  if (c.italic) out.italic = true;
  if (c.animated) out.animated = true;
  return out;
}

// Reconstruct a usable URL/path string from D2's icon value. D2 may emit it
// as a plain string or — more commonly under recent versions — as the
// JSON-serialised form of a Go `*url.URL` struct. For relative icons (no
// scheme, no host), we return the Path verbatim so the web layer can join
// it against the project root. For absolute URLs we reconstruct the
// scheme://host/path form.
function iconString(icon: string | D2URL | null | undefined): string | undefined {
  // Guard `null` explicitly: D2 emits `"icon": null` for shapes that have
  // no icon set, and `typeof null === 'object'` would slip past the
  // string check below and crash on `icon.Path`.
  if (icon === null || icon === undefined) return undefined;
  if (typeof icon === 'string') return icon.length > 0 ? icon : undefined;
  const path = icon.Path ?? '';
  if (icon.Scheme && icon.Scheme.length > 0) {
    const host = icon.Host ?? '';
    return `${icon.Scheme}://${host}${path}`;
  }
  return path.length > 0 ? path : undefined;
}

function shapeToNode(s: D2FlatNode): ModelNode {
  // For image shapes, D2 falls the label back to the node id when the user
  // didn't write one (`rat: {shape: image; icon: rat.svg}` ⇒ label="rat").
  // That's a useful default for regular shapes — the box would otherwise
  // be blank — but for images the picture *is* the content, so an
  // auto-derived label would just stamp the id over the icon. Suppress
  // the label when D2 didn't emit one distinct from the id.
  const isImage = s.type === 'image';
  const labelMatchesId = s.label === undefined || s.label === s.id;
  const label = isImage && labelMatchesId ? '' : (s.label ?? s.id);
  const out: ModelNode = {
    label,
    shape: asShapeKind(s.type),
    style: nodeStyle(s),
    rawWidth: s.width ?? 144,
    rawHeight: s.height ?? 64,
  };
  if (s.labelPosition && s.labelPosition !== 'UNSET_LABEL_POSITION') {
    out.labelPosition = s.labelPosition;
  }
  const icon = iconString(s.icon);
  if (icon) out.imageSrc = icon;
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
