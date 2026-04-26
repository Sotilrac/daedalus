import { describe, expect, it } from 'vitest';
import { descendantIds, edgeId, isContainer, parentId, parseEdgeId } from '../src/model/ids.js';

describe('parentId', () => {
  it('returns null for top-level ids', () => {
    expect(parentId('cdn')).toBeNull();
  });

  it('returns the dotted prefix for deep refs', () => {
    expect(parentId('edge.lb.region1')).toBe('edge.lb');
    expect(parentId('edge.cdn')).toBe('edge');
  });
});

describe('isContainer', () => {
  it('reports true when other ids are children', () => {
    const ids = ['edge', 'edge.cdn', 'edge.lb'];
    expect(isContainer(ids, 'edge')).toBe(true);
  });

  it('reports false for leaves', () => {
    const ids = ['edge', 'edge.cdn', 'edge.lb'];
    expect(isContainer(ids, 'edge.cdn')).toBe(false);
  });

  it('does not match prefix-only collisions', () => {
    expect(isContainer(['edgex', 'edgex.y'], 'edge')).toBe(false);
  });
});

describe('descendantIds', () => {
  it('returns all deep descendants under a parent', () => {
    const ids = ['edge', 'edge.cdn', 'edge.lb', 'edge.lb.r1', 'other'];
    expect(descendantIds(ids, 'edge').sort()).toEqual(['edge.cdn', 'edge.lb', 'edge.lb.r1']);
  });

  it('returns nothing for leaves', () => {
    expect(descendantIds(['a', 'b'], 'a')).toEqual([]);
  });
});

describe('edgeId / parseEdgeId', () => {
  it('round-trips a simple edge', () => {
    const id = edgeId('a', 'b', 0);
    expect(id).toBe('a->b#0');
    expect(parseEdgeId(id)).toEqual({ from: 'a', to: 'b', index: 0 });
  });

  it('round-trips with dotted ids', () => {
    const id = edgeId('edge.cdn', 'edge.lb.r1', 2);
    expect(parseEdgeId(id)).toEqual({ from: 'edge.cdn', to: 'edge.lb.r1', index: 2 });
  });

  it('returns null for malformed strings', () => {
    expect(parseEdgeId('not an id')).toBeNull();
    expect(parseEdgeId('a->b')).toBeNull();
  });
});
