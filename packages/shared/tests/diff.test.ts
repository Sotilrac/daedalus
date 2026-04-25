import { describe, expect, it } from 'vitest';
import type { Model } from '../src/model/types.js';
import { diffModels } from '../src/layout/diff.js';

function model(): Model {
  return {
    nodes: {
      a: { label: 'A', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
      b: { label: 'B', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
    },
    edges: {
      'a->b#0': { from: 'a', to: 'b', style: {} },
    },
  };
}

describe('diffModels', () => {
  it('label-only change is minor', () => {
    const prev = model();
    const next = model();
    next.nodes.a!.label = 'A renamed';
    expect(diffModels(prev, next).kind).toBe('minor');
  });

  it('shape change is structural', () => {
    const prev = model();
    const next = model();
    next.nodes.a!.shape = 'circle';
    expect(diffModels(prev, next).kind).toBe('structural');
  });

  it('added node is structural', () => {
    const prev = model();
    const next = model();
    next.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    const d = diffModels(prev, next);
    expect(d.kind).toBe('structural');
    expect(d.addedNodes).toEqual(['c']);
  });

  it('removed edge is structural', () => {
    const prev = model();
    const next = model();
    delete next.edges['a->b#0'];
    const d = diffModels(prev, next);
    expect(d.kind).toBe('structural');
    expect(d.removedEdges).toEqual(['a->b#0']);
  });
});
