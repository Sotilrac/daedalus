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
