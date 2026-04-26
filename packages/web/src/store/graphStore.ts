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
  setTheme(theme: 'blueprint' | 'paper'): void;
  updateSettings(patch: SettingsPatch): Promise<void>;
}

export interface SettingsPatch {
  routing?: Partial<{ shapeBuffer: number; leadOut: number; nudging: number }>;
  export?: Partial<{ margin: number; showGrid: boolean }>;
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
  setInteracting(b) {
    if (get().interacting === b) return;
    set({ interacting: b });
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
    set({ model, layout, routes, plan, needsRelayout });
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
    const { model, layout } = get();
    if (!model || !layout) return;
    const node = layout.nodes[id];
    if (!node) return;

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
    const { model, layout } = get();
    if (!model || !layout) return;
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
    const { model, layout } = get();
    if (!model || !layout) return;
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
    const { model, layout } = get();
    if (!model || !layout) return;
    const n = layout.nodes[node];
    if (!n) return;

    const list = n.connections[side];
    const idx = list.indexOf(edgeId);
    if (idx < 0) return;

    const swapped = swapAt(list, idx, offset);
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
    const { model, layout } = get();
    if (!model || !layout) return;
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
    const { model, layout } = get();
    if (!layout) return;
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
}));

export function emptyDefaults(): { grid: typeof DEFAULT_GRID; viewport: typeof DEFAULT_VIEWPORT } {
  return { grid: DEFAULT_GRID, viewport: DEFAULT_VIEWPORT };
}
