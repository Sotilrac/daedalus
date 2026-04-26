import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setRouterFactory, manhattanRoute, type EdgeRoutes } from '@daedalus/shared';
import type { Layout, Model, NodeId, EdgeId, Side } from '@daedalus/shared';
import { useGraphStore } from '../src/store/graphStore.js';

// Stub libavoid so the store's awaits resolve synchronously and we don't
// require the real WASM in tests. Each call routes a single elbow per edge
// using shared/manhattanRoute.
beforeAll(() => {
  setRouterFactory(async () => ({
    route(input) {
      const out: EdgeRoutes = {};
      for (const e of input.edges) {
        out[e.id] = manhattanRoute(e.from, e.fromSide, e.to, e.toSide);
      }
      return out;
    },
  }));
});

function nodeLayout(
  x: number,
  y: number,
  w: number,
  h: number,
  connections: Partial<Record<Side, EdgeId[]>> = {},
): Layout['nodes'][NodeId] {
  return {
    x,
    y,
    w,
    h,
    connections: {
      top: connections.top ?? [],
      right: connections.right ?? [],
      bottom: connections.bottom ?? [],
      left: connections.left ?? [],
    },
  };
}

function baseModel(): Model {
  return {
    nodes: {
      a: { label: 'A', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
      b: { label: 'B', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 },
    },
    edges: { 'a->b#0': { from: 'a', to: 'b', style: {} } },
  };
}

function baseLayout(): Layout {
  return {
    version: 1,
    grid: { size: 16, cols: 80, rows: 50 },
    viewport: { zoom: 1, panX: 0, panY: 0, theme: 'slate' },
    settings: {
      routing: { shapeBuffer: 16, leadOut: 16, nudging: 16 },
      export: { margin: 16, showGrid: false },
    },
    nodes: {
      a: nodeLayout(0, 0, 96, 64, { right: ['a->b#0'] }),
      b: nodeLayout(256, 0, 96, 64, { left: ['a->b#0'] }),
    },
    edges: { 'a->b#0': { fromSide: 'right', toSide: 'left' } },
    unplaced: [],
  };
}

function seed(model: Model, layout: Layout): void {
  useGraphStore.setState({
    model,
    layout,
    routes: {},
    plan: null,
    selection: [],
    needsRelayout: false,
    viewOffset: { x: 0, y: 0 },
    interacting: false,
    past: [],
    future: [],
    gestureSnapshotTaken: false,
    autoLayout: null,
    manualStash: null,
    showingAuto: false,
  });
}

beforeEach(() => {
  seed(baseModel(), baseLayout());
});

describe('moveNode', () => {
  it('snaps to grid and routes edges', async () => {
    await useGraphStore.getState().moveNode('a', 17, 9);
    expect(useGraphStore.getState().layout?.nodes.a?.x).toBe(16);
    expect(useGraphStore.getState().layout?.nodes.a?.y).toBe(16);
    // Routing ran (manhattan stub fills the routes map).
    expect(Object.keys(useGraphStore.getState().routes)).toContain('a->b#0');
  });

  it('snapshots once for history', async () => {
    await useGraphStore.getState().moveNode('a', 32, 32);
    expect(useGraphStore.getState().past.length).toBe(1);
    await useGraphStore.getState().moveNode('a', 64, 32);
    expect(useGraphStore.getState().past.length).toBe(2);
  });

  it('clears the redo stack on a new mutation', async () => {
    await useGraphStore.getState().moveNode('a', 32, 0);
    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().future.length).toBe(1);
    await useGraphStore.getState().moveNode('a', 64, 0);
    expect(useGraphStore.getState().future.length).toBe(0);
  });

  it('refuses to mutate while showing engine layout', async () => {
    useGraphStore.setState({ showingAuto: true });
    await useGraphStore.getState().moveNode('a', 32, 32);
    expect(useGraphStore.getState().layout?.nodes.a?.x).toBe(0);
  });
});

describe('moveNode with parent containment', () => {
  it('clamps a child inside its parent box', async () => {
    const m: Model = {
      nodes: {
        box: { label: 'box', shape: 'rectangle', style: {}, rawWidth: 200, rawHeight: 200 },
        'box.child': {
          label: 'child',
          shape: 'rectangle',
          style: {},
          rawWidth: 64,
          rawHeight: 64,
        },
      },
      edges: {},
    };
    const l: Layout = {
      ...baseLayout(),
      nodes: {
        box: nodeLayout(0, 0, 200, 200),
        'box.child': nodeLayout(16, 16, 64, 64),
      },
      edges: {},
    };
    seed(m, l);
    await useGraphStore.getState().moveNode('box.child', 1000, 1000);
    const c = useGraphStore.getState().layout?.nodes['box.child'];
    expect(c?.x).toBe(200 - 64);
    expect(c?.y).toBe(200 - 64);
  });

  it('shifts descendants along with the parent', async () => {
    const m: Model = {
      nodes: {
        box: { label: 'box', shape: 'rectangle', style: {}, rawWidth: 200, rawHeight: 200 },
        'box.child': {
          label: 'child',
          shape: 'rectangle',
          style: {},
          rawWidth: 64,
          rawHeight: 64,
        },
      },
      edges: {},
    };
    const l: Layout = {
      ...baseLayout(),
      nodes: {
        box: nodeLayout(0, 0, 200, 200),
        'box.child': nodeLayout(16, 16, 64, 64),
      },
      edges: {},
    };
    seed(m, l);
    await useGraphStore.getState().moveNode('box', 32, 0);
    const child = useGraphStore.getState().layout?.nodes['box.child'];
    expect(child?.x).toBe(48); // 16 + 32 delta
    expect(child?.y).toBe(16);
  });
});

describe('moveNodes', () => {
  it('skips parent-clamp when the parent is also in the update set', async () => {
    const m: Model = {
      nodes: {
        box: { label: 'box', shape: 'rectangle', style: {}, rawWidth: 200, rawHeight: 200 },
        'box.child': {
          label: 'child',
          shape: 'rectangle',
          style: {},
          rawWidth: 64,
          rawHeight: 64,
        },
      },
      edges: {},
    };
    const l: Layout = {
      ...baseLayout(),
      nodes: {
        box: nodeLayout(0, 0, 200, 200),
        'box.child': nodeLayout(16, 16, 64, 64),
      },
      edges: {},
    };
    seed(m, l);
    // Move both: a child whose intended position would lie outside the
    // parent's *old* bbox should land where requested, not clamped.
    await useGraphStore.getState().moveNodes([
      { id: 'box', x: 320, y: 0 },
      { id: 'box.child', x: 336, y: 16 },
    ]);
    const child = useGraphStore.getState().layout?.nodes['box.child'];
    expect(child?.x).toBe(336);
  });
});

describe('resizeNode', () => {
  it('snaps width and height to a 2× grid step', async () => {
    await useGraphStore.getState().resizeNode('a', 100, 70);
    const n = useGraphStore.getState().layout?.nodes.a;
    // 2× grid = 32, so 100 rounds to 96; 70 rounds to 64.
    expect(n?.w).toBe(96);
    expect(n?.h).toBe(64);
  });

  it('refuses to shrink below the descendant envelope', async () => {
    const m: Model = {
      nodes: {
        box: { label: 'box', shape: 'rectangle', style: {}, rawWidth: 256, rawHeight: 192 },
        'box.child': {
          label: 'child',
          shape: 'rectangle',
          style: {},
          rawWidth: 96,
          rawHeight: 96,
        },
      },
      edges: {},
    };
    const l: Layout = {
      ...baseLayout(),
      nodes: {
        box: nodeLayout(0, 0, 256, 192),
        'box.child': nodeLayout(64, 32, 96, 96),
      },
      edges: {},
    };
    seed(m, l);
    await useGraphStore.getState().resizeNode('box', 32, 32, { x: 128, y: 96 });
    const box = useGraphStore.getState().layout?.nodes.box;
    // Child centred at (112, 80) with size 96; min half-extent is 48 from cx=128
    // so width must be at least 2 * max(128-64, 160-128) = 128. Snapped up to a
    // 32px step that's still 128.
    expect(box && box.w).toBeGreaterThanOrEqual(128);
  });
});

describe('selection', () => {
  it('addToSelection deduplicates', () => {
    useGraphStore.getState().setSelection(['a']);
    useGraphStore.getState().addToSelection('a');
    expect(useGraphStore.getState().selection).toEqual(['a']);
  });

  it('selectOnly replaces the selection', () => {
    useGraphStore.getState().setSelection(['a', 'b']);
    useGraphStore.getState().selectOnly('b');
    expect(useGraphStore.getState().selection).toEqual(['b']);
  });

  it('clearSelection no-ops when already empty', () => {
    useGraphStore.getState().clearSelection();
    expect(useGraphStore.getState().selection).toEqual([]);
  });
});

describe('swapAnchor', () => {
  it('swaps adjacent edges on the same side', async () => {
    const layout = baseLayout();
    layout.nodes.a!.connections.right = ['a->b#0', 'a->c#0'];
    layout.edges['a->c#0'] = { fromSide: 'right', toSide: 'left' };
    const model = baseModel();
    model.nodes.c = { label: 'C', shape: 'rectangle', style: {}, rawWidth: 96, rawHeight: 64 };
    model.edges['a->c#0'] = { from: 'a', to: 'c', style: {} };
    layout.nodes.c = nodeLayout(256, 96, 96, 64, { left: ['a->c#0'] });
    seed(model, layout);

    await useGraphStore.getState().swapAnchor('a', 'right', 'a->b#0', 1);
    expect(useGraphStore.getState().layout?.nodes.a?.connections.right).toEqual([
      'a->c#0',
      'a->b#0',
    ]);
  });
});

describe('moveEdgeAnchor', () => {
  it('moves an edge endpoint to a different side', async () => {
    await useGraphStore.getState().moveEdgeAnchor('a', 'a->b#0', 'top', 0);
    const a = useGraphStore.getState().layout?.nodes.a;
    expect(a?.connections.right).toEqual([]);
    expect(a?.connections.top).toEqual(['a->b#0']);
    expect(useGraphStore.getState().layout?.edges['a->b#0']?.fromSide).toBe('top');
  });
});

describe('undo / redo', () => {
  it('round-trips a single mutation', async () => {
    const before = useGraphStore.getState().layout!;
    await useGraphStore.getState().moveNode('a', 32, 32);
    const after = useGraphStore.getState().layout!;
    expect(after).not.toBe(before);

    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().layout).toBe(before);
    expect(useGraphStore.getState().future.length).toBe(1);

    await useGraphStore.getState().redo();
    expect(useGraphStore.getState().layout).toBe(after);
  });

  it('no-ops when there is nothing to undo', async () => {
    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().past.length).toBe(0);
  });
});

describe('setTheme', () => {
  it('updates the layout viewport theme', () => {
    useGraphStore.getState().setTheme('paper');
    expect(useGraphStore.getState().layout?.viewport.theme).toBe('paper');
  });

  it('no-ops when there is no layout', () => {
    seed(baseModel(), baseLayout());
    useGraphStore.setState({ layout: null });
    useGraphStore.getState().setTheme('paper');
    expect(useGraphStore.getState().layout).toBeNull();
  });
});

describe('updateSettings', () => {
  it('reroutes only when routing knobs change', async () => {
    const before = useGraphStore.getState().routes;
    await useGraphStore.getState().updateSettings({ export: { margin: 32 } });
    expect(useGraphStore.getState().routes).toBe(before);
    expect(useGraphStore.getState().layout?.settings.export.margin).toBe(32);

    await useGraphStore.getState().updateSettings({ routing: { shapeBuffer: 32 } });
    expect(useGraphStore.getState().routes).not.toBe(before);
    expect(useGraphStore.getState().layout?.settings.routing.shapeBuffer).toBe(32);
  });
});

describe('closeProject', () => {
  it('clears every diagram-related field', () => {
    useGraphStore.setState({ selection: ['a'], past: [baseLayout()] });
    useGraphStore.getState().closeProject();
    const s = useGraphStore.getState();
    expect(s.model).toBeNull();
    expect(s.layout).toBeNull();
    expect(s.selection).toEqual([]);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.showingAuto).toBe(false);
  });
});

describe('toggleAutoLayout', () => {
  it('round-trips between manual and engine layouts', async () => {
    const auto = baseLayout();
    auto.nodes.a = nodeLayout(128, 128, 96, 64, { right: ['a->b#0'] });
    useGraphStore.setState({ autoLayout: auto });
    const manual = useGraphStore.getState().layout!;

    await useGraphStore.getState().toggleAutoLayout();
    expect(useGraphStore.getState().showingAuto).toBe(true);
    expect(useGraphStore.getState().layout?.nodes.a?.x).toBe(128);

    await useGraphStore.getState().toggleAutoLayout();
    expect(useGraphStore.getState().showingAuto).toBe(false);
    expect(useGraphStore.getState().layout).toBe(manual);
  });
});
