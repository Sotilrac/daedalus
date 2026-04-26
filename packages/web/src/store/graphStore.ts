import { create } from 'zustand';
import {
  DEFAULT_GRID,
  DEFAULT_VIEWPORT,
  applySavedLayout,
  buildLayoutFromRaw,
  buildRenderPlan,
  descendantIds,
  diagramToModel,
  diagramToRawLayout,
  edgeId,
  parentId,
  reconcileLayout,
  routeEdges,
  type EdgeId,
  type EdgeRoutes,
  type Layout,
  type Model,
  type NodeId,
  type Side,
  type RenderPlan,
} from '@daedalus/shared';
import { compileD2 } from '@daedalus/shared/d2';
import { snap } from '@daedalus/shared/layout';
import { swapAt } from '@daedalus/shared/routing';

// Cap on how many layouts we keep in the in-memory undo ring. Each layout
// is small (a few KB of JSON-serialisable state), so 128 is generous and
// well within typical session memory.
const MAX_HISTORY = 128;

export interface GraphState {
  model: Model | null;
  layout: Layout | null;
  routes: EdgeRoutes;
  plan: RenderPlan | null;
  selection: NodeId[];
  needsRelayout: boolean;
  viewOffset: { x: number; y: number };
  // True while the user is mid-gesture (dragging, resizing, moving an edge
  // anchor). Lets the persist layer hold off writes until the gesture ends.
  interacting: boolean;
  // Undo/redo: snapshots of `layout`. `past` is oldest→newest; the most
  // recent entry is the layout we'd revert to on undo. `future` is filled
  // by undo and consumed by redo. A new mutation outside an undo path
  // clears `future`.
  past: Layout[];
  future: Layout[];
  // True once the current gesture has captured its pre-state into `past`.
  // Lets a continuous drag emit a single history entry instead of one per
  // pointer-move frame.
  gestureSnapshotTaken: boolean;
  // Auto-layout comparison. `autoLayout` is the most recent ELK pass, kept
  // around so the user can flip between "as engine routed" and "as I edited".
  // When `showingAuto` is true, `layout` holds the auto pass and `manualStash`
  // holds the user-edited layout we'll restore on toggle-off.
  autoLayout: Layout | null;
  manualStash: Layout | null;
  showingAuto: boolean;
  toggleAutoLayout(): Promise<void>;
  setInteracting(b: boolean): void;
  setViewOffset(o: { x: number; y: number }): void;
  loadFromCompile(opts: {
    files: Record<string, string>;
    inputPath: string;
    prevModel?: Model | null;
    prevLayout?: Layout | null;
  }): Promise<void>;
  relayout(): Promise<void>;
  moveNode(id: NodeId, x: number, y: number): Promise<void>;
  // Batched move: each entry's `(x, y)` is the desired top-left for that
  // node id. Snap, clamp, and descendant-shift run per entry, then routing
  // and the render plan are computed once.
  moveNodes(updates: { id: NodeId; x: number; y: number }[]): Promise<void>;
  resizeNode(id: NodeId, w: number, h: number, anchor?: { x: number; y: number }): Promise<void>;
  setSelection(ids: NodeId[]): void;
  selectOnly(id: NodeId): void;
  addToSelection(id: NodeId): void;
  clearSelection(): void;
  swapAnchor(node: NodeId, side: Side, edgeId: EdgeId, offset: number): Promise<void>;
  moveEdgeAnchor(node: NodeId, edgeId: EdgeId, toSide: Side, toIndex: number): Promise<void>;
  setTheme(theme: 'slate' | 'paper'): void;
  updateSettings(patch: SettingsPatch): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  closeProject(): void;
}

export interface SettingsPatch {
  routing?: Partial<{ shapeBuffer: number; leadOut: number; nudging: number }>;
  export?: Partial<{ margin: number; showGrid: boolean }>;
}

// Capture the current layout into the undo stack and clear the redo stack.
// During an active gesture (`interacting`), only the very first call within
// that gesture pushes — the pre-drag layout — so a multi-frame drag stays
// a single undo step.
function snapshotForHistory(set: (p: Partial<GraphState>) => void, get: () => GraphState): void {
  const s = get();
  if (!s.layout) return;
  if (s.interacting && s.gestureSnapshotTaken) return;
  const past =
    s.past.length >= MAX_HISTORY ? s.past.slice(s.past.length - MAX_HISTORY + 1) : s.past;
  set({
    past: [...past, s.layout],
    future: [],
    gestureSnapshotTaken: s.interacting ? true : false,
  });
}

export const useGraphStore = create<GraphState>((set, get) => ({
  model: null,
  layout: null,
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
  setInteracting(b) {
    if (get().interacting === b) return;
    // Reset the per-gesture snapshot flag whenever interacting transitions.
    // On false→true we'll lazily snapshot on the first real mutation; on
    // true→false we clear the flag so the next gesture starts fresh.
    set({ interacting: b, gestureSnapshotTaken: false });
  },
  setViewOffset(o) {
    set({ viewOffset: o });
  },

  async loadFromCompile({ files, inputPath, prevModel, prevLayout }) {
    const outcome = await compileD2({ files, inputPath, layout: 'elk' });
    if (!outcome.ok) throw new Error(outcome.errors.map((e) => e.raw).join('\n'));

    const model = diagramToModel(outcome.result.diagram);
    const raw = diagramToRawLayout(outcome.result.diagram, edgeId);
    const grid = prevLayout?.grid ?? DEFAULT_GRID;
    const fresh = buildLayoutFromRaw({ raw, grid, prev: prevLayout ?? undefined });

    let layout: Layout = fresh;
    let needsRelayout = false;
    if (prevLayout && prevModel) {
      // Mid-session reload: full diff, label-only changes are minor.
      const reconciled = reconcileLayout(prevLayout, prevModel, model);
      layout = reconciled.layout;
      needsRelayout = reconciled.needsRelayout;
    } else if (prevLayout) {
      // Cold start: we don't have the previous model, but the sidecar is the
      // user's source of truth — apply it and only relayout new ids.
      const applied = applySavedLayout(prevLayout, model);
      layout = applied.layout;
      needsRelayout = applied.needsRelayout;
    }

    const routes = await routeEdges(model, layout);
    const plan = buildRenderPlan({ model, layout, routes });
    // External D2 changes invalidate prior history: undoing past a reload
    // would reapply layout to a model that may not contain those nodes/edges.
    set({
      model,
      layout,
      routes,
      plan,
      needsRelayout,
      past: [],
      future: [],
      gestureSnapshotTaken: false,
      // Stash the engine's untouched output so the user can flip between
      // it and the edited layout. A fresh compile invalidates any in-flight
      // comparison, so we drop out of auto-view here.
      autoLayout: fresh,
      manualStash: null,
      showingAuto: false,
    });
  },

  async relayout() {
    const { model, layout } = get();
    if (!model || !layout) return;
    // Re-compile with ELK using cached files is a job for the source layer; the
    // store only re-snaps positions from existing routes when called directly.
    // The actual relayout entry point is `loadFromCompile` with prev=null.
    set({ needsRelayout: false });
  },

  async moveNode(id, x, y) {
    const { model, layout, showingAuto } = get();
    if (!model || !layout || showingAuto) return;
    const node = layout.nodes[id];
    if (!node) return;

    snapshotForHistory(set, get);

    let sx = snap(x, layout.grid.size);
    let sy = snap(y, layout.grid.size);

    // If this node lives inside a container, the move is bounded to the
    // parent's rectangle: the child can't escape its enclosing block.
    const par = parentId(id);
    const parentNode = par ? layout.nodes[par] : null;
    if (parentNode) {
      sx = Math.max(parentNode.x, Math.min(parentNode.x + parentNode.w - node.w, sx));
      sy = Math.max(parentNode.y, Math.min(parentNode.y + parentNode.h - node.h, sy));
    }

    // No global clamping — the canvas is essentially infinite. Negative
    // coordinates are allowed; the editor renders a viewBox that grows in
    // both directions and the host scroll compensates so existing content
    // doesn't appear to jump.
    const dx = sx - node.x;
    const dy = sy - node.y;
    const nextNodes = { ...layout.nodes, [id]: { ...node, x: sx, y: sy } };
    if (dx !== 0 || dy !== 0) {
      for (const childId of descendantIds(Object.keys(layout.nodes), id)) {
        const child = layout.nodes[childId];
        if (!child) continue;
        nextNodes[childId] = { ...child, x: child.x + dx, y: child.y + dy };
      }
    }

    const nextLayout: Layout = { ...layout, nodes: nextNodes };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  async moveNodes(updates) {
    const { model, layout, showingAuto } = get();
    if (!model || !layout || showingAuto) return;
    snapshotForHistory(set, get);
    const grid = layout.grid.size;
    const allIds = Object.keys(layout.nodes);
    const updateSet = new Set(updates.map((u) => u.id));
    const nextNodes: Record<NodeId, Layout['nodes'][string]> = { ...layout.nodes };

    for (const u of updates) {
      const node = nextNodes[u.id];
      if (!node) continue;
      let sx = snap(u.x, grid);
      let sy = snap(u.y, grid);
      // Skip parent-clamp when the parent is also moving — otherwise the
      // child would be pinned to the parent's *old* box and lag behind.
      const par = parentId(u.id);
      const parentNode = par && !updateSet.has(par) ? nextNodes[par] : null;
      if (parentNode) {
        sx = Math.max(parentNode.x, Math.min(parentNode.x + parentNode.w - node.w, sx));
        sy = Math.max(parentNode.y, Math.min(parentNode.y + parentNode.h - node.h, sy));
      }
      const dx = sx - node.x;
      const dy = sy - node.y;
      nextNodes[u.id] = { ...node, x: sx, y: sy };
      if (dx !== 0 || dy !== 0) {
        for (const childId of descendantIds(allIds, u.id)) {
          // Children explicitly in the update set get their own (x, y) set;
          // we don't want the parent's delta to compose with theirs.
          if (updateSet.has(childId)) continue;
          const child = nextNodes[childId];
          if (!child) continue;
          nextNodes[childId] = { ...child, x: child.x + dx, y: child.y + dy };
        }
      }
    }

    const nextLayout: Layout = { ...layout, nodes: nextNodes };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  async resizeNode(id, w, h, anchor) {
    const { model, layout, showingAuto } = get();
    if (!model || !layout || showingAuto) return;
    const node = layout.nodes[id];
    if (!node) return;

    const grid = layout.grid.size;
    // Even (2× grid) increments mean half-size is always a whole cell, so the
    // anchor stays exactly on a grid line whether growing or shrinking.
    const step = grid * 2;
    const cx = anchor?.x ?? node.x + node.w / 2;
    const cy = anchor?.y ?? node.y + node.h / 2;

    // Lower bound for containers: must enclose every descendant relative to
    // the resize anchor.
    const ids = Object.keys(layout.nodes);
    const children = descendantIds(ids, id);
    let minW = step;
    let minH = step;
    for (const childId of children) {
      const c = layout.nodes[childId];
      if (!c) continue;
      const reqW = 2 * Math.max(cx - c.x, c.x + c.w - cx);
      const reqH = 2 * Math.max(cy - c.y, c.y + c.h - cy);
      if (reqW > minW) minW = reqW;
      if (reqH > minH) minH = reqH;
    }
    minW = Math.ceil(minW / step) * step;
    minH = Math.ceil(minH / step) * step;

    // Upper bound: a node inside a container can't exceed the parent's box.
    const par = parentId(id);
    const parentNode = par ? layout.nodes[par] : null;
    let maxW = Infinity;
    let maxH = Infinity;
    if (parentNode) {
      maxW = parentNode.w;
      maxH = parentNode.h;
    }

    const sw = Math.max(minW, Math.min(maxW, Math.round(w / step) * step));
    const sh = Math.max(minH, Math.min(maxH, Math.round(h / step) * step));
    let nx = Math.round((cx - sw / 2) / grid) * grid;
    let ny = Math.round((cy - sh / 2) / grid) * grid;
    if (parentNode) {
      nx = Math.max(parentNode.x, Math.min(parentNode.x + parentNode.w - sw, nx));
      ny = Math.max(parentNode.y, Math.min(parentNode.y + parentNode.h - sh, ny));
    }
    if (sw === node.w && sh === node.h && nx === node.x && ny === node.y) return;

    snapshotForHistory(set, get);

    const nextLayout: Layout = {
      ...layout,
      nodes: { ...layout.nodes, [id]: { ...node, x: nx, y: ny, w: sw, h: sh } },
    };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  setSelection(ids) {
    // Drop duplicates while preserving order.
    const seen = new Set<NodeId>();
    const dedup: NodeId[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        dedup.push(id);
      }
    }
    set({ selection: dedup });
  },
  selectOnly(id) {
    set({ selection: [id] });
  },
  addToSelection(id) {
    const current = get().selection;
    if (current.includes(id)) return;
    set({ selection: [...current, id] });
  },
  clearSelection() {
    if (get().selection.length === 0) return;
    set({ selection: [] });
  },

  async swapAnchor(node, side, edgeId, offset) {
    const { model, layout, showingAuto } = get();
    if (!model || !layout || showingAuto) return;
    const n = layout.nodes[node];
    if (!n) return;

    const list = n.connections[side];
    const idx = list.indexOf(edgeId);
    if (idx < 0) return;

    const swapped = swapAt(list, idx, offset);
    snapshotForHistory(set, get);
    const nextLayout: Layout = {
      ...layout,
      nodes: {
        ...layout.nodes,
        [node]: { ...n, connections: { ...n.connections, [side]: swapped } },
      },
    };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  async moveEdgeAnchor(nodeId, edgeId, toSide, toIndex) {
    const { model, layout, showingAuto } = get();
    if (!model || !layout || showingAuto) return;
    const node = layout.nodes[nodeId];
    const edge = model.edges[edgeId];
    const sides = layout.edges[edgeId];
    if (!node || !edge || !sides) return;

    // Identify which endpoint is being moved (a self-loop matches both;
    // we use the from-endpoint by convention for simplicity).
    const isFrom = edge.from === nodeId;
    const isTo = edge.to === nodeId;
    if (!isFrom && !isTo) return;
    const fromSide = isFrom ? sides.fromSide : sides.toSide;

    const fromList = node.connections[fromSide];
    const fromIdx = fromList.indexOf(edgeId);
    if (fromIdx < 0) return;

    // Rebuild this node's connection map: drop the edge from the old side,
    // then splice it into the new side at toIndex.
    const nextConnections = { ...node.connections };
    nextConnections[fromSide] = fromList.filter((id) => id !== edgeId);
    const target = [...nextConnections[toSide]];
    const safeIndex = Math.max(0, Math.min(toIndex, target.length));
    target.splice(safeIndex, 0, edgeId);
    nextConnections[toSide] = target;

    const nextSides = isFrom ? { ...sides, fromSide: toSide } : { ...sides, toSide: toSide };

    snapshotForHistory(set, get);

    const nextLayout: Layout = {
      ...layout,
      nodes: { ...layout.nodes, [nodeId]: { ...node, connections: nextConnections } },
      edges: { ...layout.edges, [edgeId]: nextSides },
    };

    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  setTheme(theme) {
    const { model, layout, routes } = get();
    if (!layout) return;
    const nextLayout: Layout = { ...layout, viewport: { ...layout.viewport, theme } };
    const plan = model ? buildRenderPlan({ model, layout: nextLayout, routes }) : null;
    set({ layout: nextLayout, plan });
  },

  async updateSettings(patch) {
    const { model, layout, showingAuto } = get();
    if (!layout || showingAuto) return;
    snapshotForHistory(set, get);
    const nextLayout: Layout = {
      ...layout,
      settings: {
        routing: { ...layout.settings.routing, ...(patch.routing ?? {}) },
        export: { ...layout.settings.export, ...(patch.export ?? {}) },
      },
    };
    if (!model) {
      set({ layout: nextLayout });
      return;
    }
    // Re-route only when routing knobs actually moved; export-only tweaks
    // don't need a re-route.
    const routingChanged =
      patch.routing &&
      (patch.routing.shapeBuffer !== undefined ||
        patch.routing.leadOut !== undefined ||
        patch.routing.nudging !== undefined);
    if (routingChanged) {
      const routes = await routeEdges(model, nextLayout);
      const plan = buildRenderPlan({ model, layout: nextLayout, routes });
      set({ layout: nextLayout, routes, plan });
    } else {
      const plan = buildRenderPlan({ model, layout: nextLayout, routes: get().routes });
      set({ layout: nextLayout, plan });
    }
  },

  async undo() {
    const { model, layout, past, future, showingAuto } = get();
    if (!layout || past.length === 0 || showingAuto) return;
    const prev = past[past.length - 1];
    if (!prev) return;
    const nextPast = past.slice(0, -1);
    const nextFuture = [layout, ...future];
    if (!model) {
      set({ past: nextPast, future: nextFuture, layout: prev });
      return;
    }
    const routes = await routeEdges(model, prev);
    const plan = buildRenderPlan({ model, layout: prev, routes });
    set({ past: nextPast, future: nextFuture, layout: prev, routes, plan });
  },

  async redo() {
    const { model, layout, past, future, showingAuto } = get();
    if (!layout || future.length === 0 || showingAuto) return;
    const next = future[0];
    if (!next) return;
    const nextPast = [...past, layout];
    const nextFuture = future.slice(1);
    if (!model) {
      set({ past: nextPast, future: nextFuture, layout: next });
      return;
    }
    const routes = await routeEdges(model, next);
    const plan = buildRenderPlan({ model, layout: next, routes });
    set({ past: nextPast, future: nextFuture, layout: next, routes, plan });
  },

  closeProject() {
    set({
      model: null,
      layout: null,
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
  },

  async toggleAutoLayout() {
    const { model, layout, autoLayout, manualStash, showingAuto } = get();
    if (!model || !layout || !autoLayout) return;
    if (showingAuto) {
      // Restore the user's edits. `manualStash` is the layout we replaced when
      // entering auto-view; it captures whatever the user was looking at.
      const restore = manualStash ?? layout;
      const routes = await routeEdges(model, restore);
      const plan = buildRenderPlan({ model, layout: restore, routes });
      set({ layout: restore, manualStash: null, showingAuto: false, routes, plan });
    } else {
      const routes = await routeEdges(model, autoLayout);
      const plan = buildRenderPlan({ model, layout: autoLayout, routes });
      set({ layout: autoLayout, manualStash: layout, showingAuto: true, routes, plan });
    }
  },
}));

export function emptyDefaults(): { grid: typeof DEFAULT_GRID; viewport: typeof DEFAULT_VIEWPORT } {
  return { grid: DEFAULT_GRID, viewport: DEFAULT_VIEWPORT };
}
