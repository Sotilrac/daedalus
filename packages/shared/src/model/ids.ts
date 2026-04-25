import type { EdgeId, NodeId } from './types.js';

export function nodeIdFromD2Path(path: string): NodeId {
  return path;
}

export function edgeId(from: NodeId, to: NodeId, index = 0): EdgeId {
  return `${from}->${to}#${index}`;
}

export function parseEdgeId(id: EdgeId): { from: NodeId; to: NodeId; index: number } | null {
  const m = /^(.+)->(.+)#(\d+)$/.exec(id);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  return { from: m[1], to: m[2], index: Number(m[3]) };
}

// D2 deep references encode hierarchy as dotted paths (`edge.cdn`,
// `edge.lb.region1`). We treat the longest prefix before the last `.` as the
// parent.
export function parentId(id: NodeId): NodeId | null {
  const i = id.lastIndexOf('.');
  return i > 0 ? id.slice(0, i) : null;
}

export function isContainer(nodeIds: Iterable<NodeId>, id: NodeId): boolean {
  const prefix = id + '.';
  for (const other of nodeIds) {
    if (other.startsWith(prefix)) return true;
  }
  return false;
}

export function descendantIds(nodeIds: Iterable<NodeId>, id: NodeId): NodeId[] {
  const prefix = id + '.';
  const out: NodeId[] = [];
  for (const other of nodeIds) {
    if (other.startsWith(prefix)) out.push(other);
  }
  return out;
}
