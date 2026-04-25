import type { Model, ModelEdge, ModelNode, NodeStyle, EdgeStyle, ShapeKind } from '../model/types.js';
import { edgeId } from '../model/ids.js';
import type { D2Diagram, D2Shape, D2Connection, D2Style } from './types.js';

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

function num(v: number | string | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function nodeStyle(s: D2Style | undefined): NodeStyle {
  if (!s) return {};
  const out: NodeStyle = {};
  if (s.fill !== undefined) out.fill = s.fill;
  if (s.stroke !== undefined) out.stroke = s.stroke;
  const sw = num(s['stroke-width']);
  if (sw !== undefined) out.strokeWidth = sw;
  const sd = num(s['stroke-dash']);
  if (sd !== undefined) out.strokeDash = sd;
  if (s['font-color'] !== undefined) out.fontColor = s['font-color'];
  if (s.bold !== undefined) out.bold = s.bold;
  if (s.italic !== undefined) out.italic = s.italic;
  if (s.shadow !== undefined) out.shadow = s.shadow;
  const op = num(s.opacity);
  if (op !== undefined) out.opacity = op;
  return out;
}

function edgeStyle(s: D2Style | undefined): EdgeStyle {
  if (!s) return {};
  const out: EdgeStyle = {};
  if (s.stroke !== undefined) out.stroke = s.stroke;
  const sw = num(s['stroke-width']);
  if (sw !== undefined) out.strokeWidth = sw;
  const sd = num(s['stroke-dash']);
  if (sd !== undefined) out.strokeDash = sd;
  if (s['font-color'] !== undefined) out.fontColor = s['font-color'];
  const op = num(s.opacity);
  if (op !== undefined) out.opacity = op;
  return out;
}

function shapeToNode(s: D2Shape): ModelNode {
  return {
    label: s.label ?? s.id,
    shape: asShapeKind(s.type),
    style: nodeStyle(s.style),
    rawWidth: s.width ?? 144,
    rawHeight: s.height ?? 64,
  };
}

function connectionToEdge(c: D2Connection): ModelEdge {
  const edge: ModelEdge = {
    from: c.src,
    to: c.dst,
    style: edgeStyle(c.style),
  };
  if (c.label) edge.label = c.label;
  return edge;
}

export function diagramToModel(d: D2Diagram): Model {
  const nodes: Record<string, ModelNode> = {};
  for (const s of d.shapes ?? []) {
    nodes[s.id] = shapeToNode(s);
  }
  const counts = new Map<string, number>();
  const edges: Record<string, ModelEdge> = {};
  for (const c of d.connections ?? []) {
    const key = `${c.src}->${c.dst}`;
    const idx = counts.get(key) ?? 0;
    counts.set(key, idx + 1);
    edges[edgeId(c.src, c.dst, idx)] = connectionToEdge(c);
  }
  return { nodes, edges };
}
