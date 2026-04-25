import type { EdgeId, Layout, Model, NodeId, Side } from '../model/types.js';
import { SIDES, emptyConnections } from '../model/types.js';
import { diffModels, type ModelDiff } from './diff.js';

export interface ReconcileResult {
  layout: Layout;
  diff: ModelDiff;
  needsRelayout: boolean;
}

// Reconcile a saved Layout against a new Model. Reuses positions for kept ids;
// drops layout entries for removed ids; lists new ids in `unplaced`. Edge ids
// that vanish are stripped from per-side ordering.
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

  const keptNodeIds = new Set(Object.keys(nextModel.nodes));
  const keptEdgeIds = new Set(Object.keys(nextModel.edges));

  const nodes: Record<NodeId, Layout['nodes'][string]> = {};
  for (const id of keptNodeIds) {
    const prev = prevLayout.nodes[id];
    if (prev) {
      const pruned: Record<Side, EdgeId[]> = emptyConnections();
      for (const side of SIDES) {
        pruned[side] = prev.connections[side].filter((eid) => keptEdgeIds.has(eid));
      }
      nodes[id] = { ...prev, connections: pruned };
    }
  }

  const edges: Record<EdgeId, Layout['edges'][string]> = {};
  for (const id of keptEdgeIds) {
    const prev = prevLayout.edges[id];
    if (prev) edges[id] = prev;
  }

  const unplaced = [...keptNodeIds].filter((id) => !(id in nodes));

  const layout: Layout = {
    ...prevLayout,
    nodes,
    edges,
    unplaced,
  };

  // Edges that exist in the new model but lack a side mapping: skipped from
  // `edges`. They still have no entry in any node's connections; they'll be
  // routed only after the user relayouts (or attaches them via the editor).

  return { layout, diff, needsRelayout: unplaced.length > 0 };
}
