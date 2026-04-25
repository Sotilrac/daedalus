import type { Layout, Model, NodeLayout, EdgeId, NodeId, GridConfig, Side } from '../model/types.js';
import { emptyConnections, SIDES } from '../model/types.js';
import { snap, snapUp, clampToGrid } from './snap.js';
import { classifySide, sideSortKey, type BoundingBox } from './sides.js';
import type { D2Diagram } from '../d2/types.js';

export interface PositionedShape {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RawLayout {
  shapes: PositionedShape[];
  edges: { id: EdgeId; from: NodeId; to: NodeId; route: { x: number; y: number }[] }[];
}

// Translate a D2 ELK-laid-out diagram into our raw layout, given the edge-id
// resolution (since D2 indexes connections positionally, not by our hash).
export function diagramToRawLayout(
  d: D2Diagram,
  edgeIdFor: (src: NodeId, dst: NodeId, occurrence: number) => EdgeId,
): RawLayout {
  const shapes: PositionedShape[] = (d.shapes ?? []).map((s) => ({
    id: s.id,
    x: s.pos?.x ?? 0,
    y: s.pos?.y ?? 0,
    w: s.width ?? 144,
    h: s.height ?? 64,
  }));
  const counts = new Map<string, number>();
  const edges: RawLayout['edges'] = (d.connections ?? []).map((c) => {
    const key = `${c.src}->${c.dst}`;
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return {
      id: edgeIdFor(c.src, c.dst, occurrence),
      from: c.src,
      to: c.dst,
      route: c.route ?? [],
    };
  });
  return { shapes, edges };
}

export interface SnapLayoutOptions {
  grid: GridConfig;
}

export interface SnappedLayout {
  nodes: Record<NodeId, NodeLayout>;
  edgeSides: Record<EdgeId, { fromSide: Side; toSide: Side }>;
}

export function snapAndAssignSides(raw: RawLayout, opts: SnapLayoutOptions): SnappedLayout {
  const { grid } = opts;
  const boxes: Record<NodeId, BoundingBox> = {};

  const nodes: Record<NodeId, NodeLayout> = {};
  for (const s of raw.shapes) {
    const w = snapUp(Math.max(s.w, grid.size), grid.size);
    const h = snapUp(Math.max(s.h, grid.size), grid.size);
    const sx = snap(s.x, grid.size);
    const sy = snap(s.y, grid.size);
    const { x, y } = clampToGrid(sx, sy, w, h, grid);
    nodes[s.id] = { x, y, w, h, connections: emptyConnections() };
    boxes[s.id] = { x, y, w, h };
  }

  // Per-side intermediate sort buffer: each entry holds the edge id and the
  // perpendicular coordinate to sort by.
  type Slot = { edgeId: EdgeId; key: number };
  const buckets: Record<NodeId, Record<Side, Slot[]>> = {};
  for (const id of Object.keys(nodes)) {
    buckets[id] = { top: [], right: [], bottom: [], left: [] };
  }

  const edgeSides: Record<EdgeId, { fromSide: Side; toSide: Side }> = {};

  for (const e of raw.edges) {
    const srcBox = boxes[e.from];
    const dstBox = boxes[e.to];
    if (!srcBox || !dstBox) continue;

    const first = e.route[0] ?? { x: srcBox.x + srcBox.w / 2, y: srcBox.y + srcBox.h / 2 };
    const last = e.route[e.route.length - 1] ?? { x: dstBox.x + dstBox.w / 2, y: dstBox.y + dstBox.h / 2 };

    const fromSide = classifySide(srcBox, first);
    const toSide = classifySide(dstBox, last);
    edgeSides[e.id] = { fromSide, toSide };

    const fromBucket = buckets[e.from];
    const toBucket = buckets[e.to];
    if (fromBucket) fromBucket[fromSide].push({ edgeId: e.id, key: sideSortKey(fromSide, first) });
    if (toBucket) toBucket[toSide].push({ edgeId: e.id, key: sideSortKey(toSide, last) });
  }

  for (const [id, sides] of Object.entries(buckets)) {
    const node = nodes[id];
    if (!node) continue;
    for (const side of SIDES) {
      sides[side].sort((a, b) => a.key - b.key);
      node.connections[side] = sides[side].map((s) => s.edgeId);
    }
  }

  return { nodes, edgeSides };
}

export interface BuildLayoutInput extends SnapLayoutOptions {
  raw: RawLayout;
  prev?: Layout | undefined;
}

export function buildLayoutFromRaw({ raw, grid, prev }: BuildLayoutInput): Layout {
  const { nodes, edgeSides } = snapAndAssignSides(raw, { grid });
  return {
    version: 1,
    grid,
    viewport: prev?.viewport ?? { zoom: 1, panX: 0, panY: 0, theme: 'blueprint' },
    nodes,
    edges: edgeSides,
    unplaced: [],
  };
}

export function presentNodeIds(model: Model): Set<NodeId> {
  return new Set(Object.keys(model.nodes));
}
