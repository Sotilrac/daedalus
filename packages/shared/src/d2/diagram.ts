import type {
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
}

function nodeStyle(s: D2FlatNode): NodeStyle {
  const out: NodeStyle = {};
  if (s.fill !== undefined) out.fill = s.fill;
  if (s.stroke !== undefined) out.stroke = s.stroke;
  if (typeof s.strokeWidth === 'number') out.strokeWidth = s.strokeWidth;
  if (typeof s.strokeDash === 'number' && s.strokeDash > 0) out.strokeDash = s.strokeDash;
  if (s.fontColor !== undefined) out.fontColor = s.fontColor;
  if (s.color !== undefined && out.fontColor === undefined) out.fontColor = s.color;
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.shadow) out.shadow = true;
  if (typeof s.opacity === 'number' && s.opacity !== 1) out.opacity = s.opacity;
  return out;
}

function edgeStyle(c: D2FlatConnection): EdgeStyle {
  const out: EdgeStyle = {};
  if (c.stroke !== undefined) out.stroke = c.stroke;
  if (typeof c.strokeWidth === 'number') out.strokeWidth = c.strokeWidth;
  if (typeof c.strokeDash === 'number' && c.strokeDash > 0) out.strokeDash = c.strokeDash;
  if (c.fontColor !== undefined) out.fontColor = c.fontColor;
  if (c.color !== undefined && out.fontColor === undefined) out.fontColor = c.color;
  if (typeof c.opacity === 'number' && c.opacity !== 1) out.opacity = c.opacity;
  return out;
}

function shapeToNode(s: D2FlatNode): ModelNode {
  return {
    label: s.label ?? s.id,
    shape: asShapeKind(s.type),
    style: nodeStyle(s),
    rawWidth: s.width ?? 144,
    rawHeight: s.height ?? 64,
  };
}

function connectionToEdge(c: D2FlatConnection): ModelEdge {
  const edge: ModelEdge = {
    from: c.src,
    to: c.dst,
    style: edgeStyle(c),
  };
  if (c.label) edge.label = c.label;
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
