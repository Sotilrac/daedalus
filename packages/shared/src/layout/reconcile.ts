import type {
  EdgeId,
  EdgeLayout,
  Layout,
  Model,
  NodeId,
  NodeLayout,
  Side,
} from '../model/types.js';
import { SIDES, emptyConnections } from '../model/types.js';
import { parentId } from '../model/ids.js';
import { snap, snapUp, snapUpPow2 } from './snap.js';
import { diffModels, type ModelDiff } from './diff.js';

export interface ReconcileResult {
  layout: Layout;
  diff: ModelDiff;
  needsRelayout: boolean;
}

export interface ApplyResult {
  layout: Layout;
  needsRelayout: boolean;
}

// Apply a saved Layout to a fresh Model when no prior model snapshot is
// available (i.e. a cold folder open). Reuses positions for kept ids, drops
// removed ids, places brand-new nodes outside the saved bbox, and assigns
// sides to brand-new edges.
export function applySavedLayout(saved: Layout, model: Model): ApplyResult {
  const base = stripDropped(saved, model);
  const placed = placeMissingNodes(base, model);
  const layout = attachMissingEdges(placed, model);
  return { layout, needsRelayout: false };
}

// Reconcile a saved Layout against a new Model. Reuses positions for kept
// ids, drops layout entries for removed ids, and auto-handles new nodes and
// new edges so the user almost never needs to relayout from scratch.
export function reconcileLayout(
  prevLayout: Layout,
  prevModel: Model,
  nextModel: Model,
): ReconcileResult {
  const diff = diffModels(prevModel, nextModel);
  if (
    diff.kind === 'minor' &&
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.addedEdges.length === 0 &&
    diff.removedEdges.length === 0
  ) {
    return { layout: prevLayout, diff, needsRelayout: false };
  }

  const base = stripDropped(prevLayout, nextModel);
  const placed = placeMissingNodes(base, nextModel);
  const layout = attachMissingEdges(placed, nextModel);
  return { layout, diff, needsRelayout: false };
}

// Drop layout entries for ids that no longer exist in the model and prune
// per-side connection lists down to the remaining edge ids. Additions are
// handled separately by placeMissingNodes / attachMissingEdges.
function stripDropped(prev: Layout, model: Model): Layout {
  const keptNodeIds = new Set(Object.keys(model.nodes));
  const keptEdgeIds = new Set(Object.keys(model.edges));

  const nodes: Record<NodeId, NodeLayout> = {};
  for (const id of keptNodeIds) {
    const p = prev.nodes[id];
    if (!p) continue;
    const pruned: Record<Side, EdgeId[]> = emptyConnections();
    for (const side of SIDES) {
      pruned[side] = p.connections[side].filter((eid) => keptEdgeIds.has(eid));
    }
    nodes[id] = { ...p, connections: pruned };
  }

  const edges: Record<EdgeId, EdgeLayout> = {};
  for (const id of keptEdgeIds) {
    const p = prev.edges[id];
    if (p) edges[id] = p;
  }

  return { ...prev, nodes, edges, unplaced: [] };
}

// Place model nodes that lack a layout entry. Nodes whose D2 parent is
// already placed land inside the parent's box (stacked vertically against
// existing children) so structural changes that nest a new node show up
// inside the container, not floating off to the right of the diagram. The
// parent is grown if its current size can't fit them. Top-level orphans
// land just to the right of the existing bbox, stacked top-to-bottom.
function placeMissingNodes(layout: Layout, model: Model): Layout {
  const missing = Object.keys(model.nodes).filter((id) => !layout.nodes[id]);
  if (missing.length === 0) return layout;

  const grid = layout.grid;
  const gap = grid.size * 2;
  const nodes = { ...layout.nodes };

  // Bucket missing ids by parent (or null for top-level) so children of the
  // same container stack inside that container in source order.
  const groups = new Map<string | null, string[]>();
  for (const id of missing) {
    const par = parentId(id);
    const key = par && nodes[par] ? par : null;
    const list = groups.get(key) ?? [];
    list.push(id);
    groups.set(key, list);
  }

  // Children of an existing container: stack inside, growing the container
  // height if the existing size can't accommodate them.
  for (const [par, ids] of groups) {
    if (!par) continue;
    const parent = nodes[par];
    if (!parent) continue;
    const innerPad = grid.size;
    // Find the current bottom-most occupied y inside the parent across its
    // already-placed children, so we don't overlap them.
    let cursorY = parent.y + innerPad;
    for (const childId of Object.keys(nodes)) {
      if (childId === par) continue;
      if (parentId(childId) !== par) continue;
      const c = nodes[childId];
      if (!c) continue;
      const bottom = c.y + c.h + gap;
      if (bottom > cursorY) cursorY = bottom;
    }
    // Place each missing child snapped to power-of-2 dims, growing the parent
    // box if it would overflow.
    let parentBottom = parent.y + parent.h - innerPad;
    for (const id of ids) {
      const m = model.nodes[id];
      if (!m) continue;
      const w = snapUpPow2(m.rawWidth, grid.size);
      const h = snapUpPow2(m.rawHeight, grid.size);
      const x = parent.x + innerPad;
      nodes[id] = { x, y: cursorY, w, h, connections: emptyConnections() };
      cursorY += h + gap;
      const nodeBottom = nodes[id].y + h;
      if (nodeBottom > parentBottom) parentBottom = nodeBottom;
    }
    // Grow parent height if needed to enclose the new bottom. Use plain
    // grid snap (not pow2) — the parent is already an ELK-positioned
    // shape and inflating it to the next power of two would push it
    // into its siblings' space.
    const requiredH = parentBottom - parent.y + innerPad;
    if (requiredH > parent.h) {
      nodes[par] = { ...parent, h: snapUp(requiredH, grid.size) };
    }
  }

  // Top-level orphans (no parent in layout): stack to the right of the bbox.
  const topLevel = groups.get(null) ?? [];
  if (topLevel.length > 0) {
    let minY = Infinity;
    let maxX = -Infinity;
    for (const n of Object.values(nodes)) {
      if (n.y < minY) minY = n.y;
      if (n.x + n.w > maxX) maxX = n.x + n.w;
    }
    const empty = !Number.isFinite(minY) || !Number.isFinite(maxX);
    const startX = empty ? 0 : snap(maxX + gap, grid.size);
    const startY = empty ? 0 : snap(minY, grid.size);
    let cursorY = startY;
    for (const id of topLevel) {
      const m = model.nodes[id];
      if (!m) continue;
      const w = snapUpPow2(m.rawWidth, grid.size);
      const h = snapUpPow2(m.rawHeight, grid.size);
      nodes[id] = { x: startX, y: cursorY, w, h, connections: emptyConnections() };
      cursorY += h + gap;
    }
  }

  return { ...layout, nodes, unplaced: [] };
}

// Assign side and slot for every model edge that doesn't have a layout
// entry. Picks the side closest to a straight line between the two
// endpoints; appends to existing per-side lists so prior user-decided
// ordering is preserved.
function attachMissingEdges(layout: Layout, model: Model): Layout {
  const missing = Object.keys(model.edges).filter((id) => !layout.edges[id]);
  if (missing.length === 0) return layout;

  const nodes: Record<NodeId, NodeLayout> = { ...layout.nodes };
  const edges: Record<EdgeId, EdgeLayout> = { ...layout.edges };
  const cloned = new Set<NodeId>();
  const ensureClone = (id: NodeId): NodeLayout | null => {
    const n = nodes[id];
    if (!n) return null;
    if (cloned.has(id)) return n;
    const next: NodeLayout = {
      ...n,
      connections: {
        top: [...n.connections.top],
        right: [...n.connections.right],
        bottom: [...n.connections.bottom],
        left: [...n.connections.left],
      },
    };
    nodes[id] = next;
    cloned.add(id);
    return next;
  };

  for (const id of missing) {
    const e = model.edges[id];
    if (!e) continue;
    const fromNode = nodes[e.from];
    const toNode = nodes[e.to];
    if (!fromNode || !toNode) continue;
    const sides = pickEdgeSides(fromNode, toNode);
    const f = ensureClone(e.from);
    const t = ensureClone(e.to);
    if (!f || !t) continue;
    if (!f.connections[sides.fromSide].includes(id)) f.connections[sides.fromSide].push(id);
    if (!t.connections[sides.toSide].includes(id)) t.connections[sides.toSide].push(id);
    edges[id] = sides;
  }
  return { ...layout, nodes, edges };
}

function pickEdgeSides(
  fromBox: { x: number; y: number; w: number; h: number },
  toBox: { x: number; y: number; w: number; h: number },
): { fromSide: Side; toSide: Side } {
  const fcx = fromBox.x + fromBox.w / 2;
  const fcy = fromBox.y + fromBox.h / 2;
  const tcx = toBox.x + toBox.w / 2;
  const tcy = toBox.y + toBox.h / 2;
  const dx = tcx - fcx;
  const dy = tcy - fcy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
}
