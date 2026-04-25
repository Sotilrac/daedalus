import type { EdgeId, NodeLayout, Point, Side } from '../model/types.js';

// Compute the pin coordinates on a given side of a node for evenly-spaced
// connections. With N connections on a side of length L, pins sit at
// L * (i + 1) / (N + 1).
export function pinForSide(node: NodeLayout, side: Side, index: number, count: number): Point {
  const t = (index + 1) / (count + 1);
  switch (side) {
    case 'top':
      return { x: node.x + node.w * t, y: node.y };
    case 'bottom':
      return { x: node.x + node.w * t, y: node.y + node.h };
    case 'left':
      return { x: node.x, y: node.y + node.h * t };
    case 'right':
      return { x: node.x + node.w, y: node.y + node.h * t };
  }
}

export function pinForEdge(node: NodeLayout, side: Side, edgeId: EdgeId): Point | null {
  const list = node.connections[side];
  const idx = list.indexOf(edgeId);
  if (idx < 0) return null;
  return pinForSide(node, side, idx, list.length);
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
