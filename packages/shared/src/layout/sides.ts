import type { Point, Side } from '../model/types.js';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function classifySide(box: BoundingBox, p: Point): Side {
  const dx = Math.min(Math.abs(p.x - box.x), Math.abs(p.x - (box.x + box.w)));
  const dy = Math.min(Math.abs(p.y - box.y), Math.abs(p.y - (box.y + box.h)));
  if (dy <= dx) {
    return Math.abs(p.y - box.y) <= Math.abs(p.y - (box.y + box.h)) ? 'top' : 'bottom';
  }
  return Math.abs(p.x - box.x) <= Math.abs(p.x - (box.x + box.w)) ? 'left' : 'right';
}

// Sort key for ordering anchors along a side. We want a deterministic order
// based on the perpendicular coordinate so visual ordering matches storage.
export function sideSortKey(side: Side, p: Point): number {
  switch (side) {
    case 'top':
    case 'bottom':
      return p.x;
    case 'left':
    case 'right':
      return p.y;
  }
}
