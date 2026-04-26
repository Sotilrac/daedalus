import type { EdgeId, NodeLayout, Point, ShapeKind, Side } from '../model/types.js';
import { personBodyTop } from '../render/svg.js';

// Length and offset of a node's pinable region along the side's primary axis.
// For most shapes this is the full width/height; the `person` glyph is the
// exception — its left/right runs are limited to the body rectangle so an
// edge doesn't land on the head.
function sideRange(
  w: number,
  h: number,
  side: Side,
  shape?: ShapeKind,
): { offset: number; length: number } {
  if (shape === 'person' && (side === 'left' || side === 'right')) {
    const top = personBodyTop(w, h);
    return { offset: top, length: h - top };
  }
  if (side === 'top' || side === 'bottom') return { offset: 0, length: w };
  return { offset: 0, length: h };
}

// Compute the pin coordinates on a given side of a node for evenly-spaced
// connections. With N connections on a side of length L, pins sit at
// L * (i + 1) / (N + 1).
export function pinForSide(
  node: NodeLayout,
  side: Side,
  index: number,
  count: number,
  shape?: ShapeKind,
): Point {
  const t = (index + 1) / (count + 1);
  const { offset, length } = sideRange(node.w, node.h, side, shape);
  switch (side) {
    case 'top':
      return { x: node.x + offset + length * t, y: node.y };
    case 'bottom':
      return { x: node.x + offset + length * t, y: node.y + node.h };
    case 'left':
      return { x: node.x, y: node.y + offset + length * t };
    case 'right':
      return { x: node.x + node.w, y: node.y + offset + length * t };
  }
}

export function pinForEdge(
  node: NodeLayout,
  side: Side,
  edgeId: EdgeId,
  shape?: ShapeKind,
): Point | null {
  const list = node.connections[side];
  const idx = list.indexOf(edgeId);
  if (idx < 0) return null;
  return pinForSide(node, side, idx, list.length, shape);
}

// Cyclically swap an edge with the neighbour at offset. offset > 0 moves
// later in the order; offset < 0 moves earlier. Returns a new array.
export function swapAt(list: readonly EdgeId[], index: number, offset: number): EdgeId[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return next;
  next[index] = b;
  next[target] = a;
  return next;
}
