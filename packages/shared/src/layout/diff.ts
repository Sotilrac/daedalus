import type { EdgeId, Model, ModelEdge, ModelNode, NodeId } from '../model/types.js';

export type DiffKind = 'minor' | 'structural';

export interface ModelDiff {
  kind: DiffKind;
  addedNodes: NodeId[];
  removedNodes: NodeId[];
  addedEdges: EdgeId[];
  removedEdges: EdgeId[];
}

function nodeShapeOrSizeChanged(a: ModelNode, b: ModelNode): boolean {
  return a.shape !== b.shape || a.rawWidth !== b.rawWidth || a.rawHeight !== b.rawHeight;
}

function edgeStructureChanged(a: ModelEdge, b: ModelEdge): boolean {
  return a.from !== b.from || a.to !== b.to;
}

export function diffModels(prev: Model, next: Model): ModelDiff {
  const prevNodes = new Set(Object.keys(prev.nodes));
  const nextNodes = new Set(Object.keys(next.nodes));
  const addedNodes = [...nextNodes].filter((id) => !prevNodes.has(id));
  const removedNodes = [...prevNodes].filter((id) => !nextNodes.has(id));

  const prevEdges = new Set(Object.keys(prev.edges));
  const nextEdges = new Set(Object.keys(next.edges));
  const addedEdges = [...nextEdges].filter((id) => !prevEdges.has(id));
  const removedEdges = [...prevEdges].filter((id) => !nextEdges.has(id));

  let structural =
    addedNodes.length + removedNodes.length + addedEdges.length + removedEdges.length > 0;

  if (!structural) {
    for (const id of nextNodes) {
      const a = prev.nodes[id];
      const b = next.nodes[id];
      if (a && b && nodeShapeOrSizeChanged(a, b)) {
        structural = true;
        break;
      }
    }
  }

  if (!structural) {
    for (const id of nextEdges) {
      const a = prev.edges[id];
      const b = next.edges[id];
      if (a && b && edgeStructureChanged(a, b)) {
        structural = true;
        break;
      }
    }
  }

  return {
    kind: structural ? 'structural' : 'minor',
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
  };
}
