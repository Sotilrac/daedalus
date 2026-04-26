import type { EdgeId, NodeLayout, Point, ShapeKind, Side } from '../model/types.js';
import { personBodyTop } from '../render/svg.js';

// Compute a connection pin in node-local coordinates (0..w, 0..h) for a given
// side, slot, and shape. Connections still live in the four-side abstraction;
// for shapes whose visible outline differs from the bounding rectangle we
// project the bbox-distributed pin onto the actual outline so the rendered
// edge looks like it leaves the visible boundary instead of hovering in the
// empty corner of a hex / diamond / parallelogram.
//
//   - rectangle, square, oval, etc.: pin sits on the bbox edge.
//   - hexagon: middle stretch of top/bottom is straight; the corners and the
//     left/right "sides" are slants meeting at a single vertex.
//   - diamond: every side is a slant meeting at a single vertex.
//   - parallelogram: top/bottom are straight (but shorter than the bbox); the
//     left and right sides are slanted.
//   - person: left/right runs are limited to the body rectangle (the head
//     stays off-limits for connections).
export function pinAt(
  w: number,
  h: number,
  side: Side,
  index: number,
  count: number,
  shape?: ShapeKind,
): Point {
  const t = (index + 1) / (count + 1);
  switch (shape) {
    case 'hexagon':
      return hexPin(w, h, side, t);
    case 'diamond':
      return diamondPin(w, h, side, t);
    case 'parallelogram':
      return parallelogramPin(w, h, side, t);
    case 'person':
      if (side === 'left' || side === 'right') {
        const offset = personBodyTop(w, h);
        const py = offset + (h - offset) * t;
        return side === 'left' ? { x: 0, y: py } : { x: w, y: py };
      }
      return rectPin(w, h, side, t);
    default:
      return rectPin(w, h, side, t);
  }
}

function rectPin(w: number, h: number, side: Side, t: number): Point {
  switch (side) {
    case 'top':
      return { x: w * t, y: 0 };
    case 'bottom':
      return { x: w * t, y: h };
    case 'left':
      return { x: 0, y: h * t };
    case 'right':
      return { x: w, y: h * t };
  }
}

// Hexagon outline (matches `shapeOutline` in routing/libavoid.ts):
//   (q,0)─(w-q,0)
//   /             \
//  (0,h/2)       (w,h/2)
//   \             /
//   (q,h)─(w-q,h)
// with q = w/4. The "right side" abstraction collapses to a single vertex at
// (w, h/2); pins above/below the centre slide along the upper-right and
// lower-right slants. Top and bottom keep a straight middle stretch from q to
// w-q; pins outside that range slide up the corner slants.
function hexPin(w: number, h: number, side: Side, t: number): Point {
  const q = w / 4;
  if (side === 'top' || side === 'bottom') {
    const px = w * t;
    const baseY = side === 'top' ? 0 : h;
    const dir = side === 'top' ? 1 : -1; // slant rises toward h/2 going inward
    if (px <= q) {
      // Corner slant on the left: from (0, h/2) to (q, baseY).
      const u = px / q; // 0 at left vertex, 1 at the start of the straight top
      return { x: px, y: baseY + dir * (h / 2) * (1 - u) };
    }
    if (px >= w - q) {
      // Corner slant on the right.
      const u = (px - (w - q)) / q;
      return { x: px, y: baseY + dir * (h / 2) * u };
    }
    return { x: px, y: baseY };
  }
  // Left / right side: collapse to a single vertex with two slants.
  const py = h * t;
  const baseX = side === 'left' ? 0 : w;
  const dir = side === 'left' ? 1 : -1; // inward direction
  if (py <= h / 2) {
    // Upper slant: from (q or w-q, 0) to (baseX, h/2).
    const u = py / (h / 2);
    return { x: baseX + dir * q * (1 - u), y: py };
  }
  // Lower slant.
  const u = (py - h / 2) / (h / 2);
  return { x: baseX + dir * q * u, y: py };
}

// Diamond outline: top (w/2, 0), right (w, h/2), bottom (w/2, h), left
// (0, h/2). Every side is a slant. A single connection on any side lands on
// the corresponding vertex; multiple connections fan out along the two
// adjacent edges.
function diamondPin(w: number, h: number, side: Side, t: number): Point {
  const cx = w / 2;
  const cy = h / 2;
  if (side === 'top' || side === 'bottom') {
    const px = w * t;
    const dy = cy * (Math.abs(px - cx) / cx);
    return { x: px, y: side === 'top' ? dy : h - dy };
  }
  const py = h * t;
  const dx = cx * (Math.abs(py - cy) / cy);
  return { x: side === 'left' ? dx : w - dx, y: py };
}

// Parallelogram outline: (skew, 0), (w, 0), (w-skew, h), (0, h). The top edge
// is straight but starts at x=skew; the bottom starts at x=0 and ends at
// x=w-skew. Left and right are fully slanted. We distribute pins along the
// _actual_ horizontal range for top/bottom (so pins never fall off into the
// triangular corners), and along the bbox height for left/right with a
// projection onto the slant.
function parallelogramPin(w: number, h: number, side: Side, t: number): Point {
  const skew = Math.min(w / 6, 16);
  if (side === 'top') {
    return { x: skew + (w - skew) * t, y: 0 };
  }
  if (side === 'bottom') {
    return { x: (w - skew) * t, y: h };
  }
  const py = h * t;
  if (side === 'left') {
    // Left slant from (skew, 0) at the top to (0, h) at the bottom.
    return { x: skew * (1 - py / h), y: py };
  }
  // Right slant from (w, 0) to (w-skew, h).
  return { x: w - skew * (py / h), y: py };
}

// Compute the pin coordinates on a given side of a node for evenly-spaced
// connections. With N connections on a side of length L, pins sit at
// L * (i + 1) / (N + 1) along the bbox; for non-rectangular shapes the pin
// is then projected onto the actual outline (see pinAt).
export function pinForSide(
  node: NodeLayout,
  side: Side,
  index: number,
  count: number,
  shape?: ShapeKind,
): Point {
  const local = pinAt(node.w, node.h, side, index, count, shape);
  return { x: node.x + local.x, y: node.y + local.y };
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
