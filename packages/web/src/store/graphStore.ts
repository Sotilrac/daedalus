import { create } from 'zustand';
import {
  DEFAULT_GRID,
  DEFAULT_VIEWPORT,
  applySavedLayout,
  buildLayoutFromRaw,
  buildRenderPlan,
  diagramToModel,
  diagramToRawLayout,
  edgeId,
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
import { snap, clampToGrid } from '@daedalus/shared/layout';
import { swapAt } from '@daedalus/shared/routing';

export interface GraphState {
  model: Model | null;
  layout: Layout | null;
  routes: EdgeRoutes;
  plan: RenderPlan | null;
  selection: NodeId | null;
  needsRelayout: boolean;
  viewOffset: { x: number; y: number };
  setViewOffset(o: { x: number; y: number }): void;
  loadFromCompile(opts: {
    files: Record<string, string>;
    inputPath: string;
    prevModel?: Model | null;
    prevLayout?: Layout | null;
  }): Promise<void>;
  relayout(): Promise<void>;
  moveNode(id: NodeId, x: number, y: number): Promise<void>;
  resizeNode(id: NodeId, w: number, h: number): Promise<void>;
  selectNode(id: NodeId | null): void;
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
  selection: null,
  needsRelayout: false,
  viewOffset: { x: 0, y: 0 },
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

    const sx = Math.max(0, snap(x, layout.grid.size));
    const sy = Math.max(0, snap(y, layout.grid.size));

    // Grow the grid if the user drags past current bounds; clamp keeps a
    // strict upper bound only when the new position fits.
    const margin = layout.grid.size * 4;
    const minCols = Math.ceil((sx + node.w + margin) / layout.grid.size);
    const minRows = Math.ceil((sy + node.h + margin) / layout.grid.size);
    const grid = {
      size: layout.grid.size,
      cols: Math.max(layout.grid.cols, minCols),
      rows: Math.max(layout.grid.rows, minRows),
    };
    const clamped = clampToGrid(sx, sy, node.w, node.h, grid);

    const nextLayout: Layout = {
      ...layout,
      grid,
      nodes: { ...layout.nodes, [id]: { ...node, x: clamped.x, y: clamped.y } },
    };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  async resizeNode(id, w, h) {
    const { model, layout } = get();
    if (!model || !layout) return;
    const node = layout.nodes[id];
    if (!node) return;
    const grid = layout.grid.size;
    // Snap to grid; minimum one cell. Resize is centre-anchored so the node
    // grows or shrinks symmetrically and stays where the user expects.
    const sw = Math.max(grid, Math.round(w / grid) * grid);
    const sh = Math.max(grid, Math.round(h / grid) * grid);
    if (sw === node.w && sh === node.h) return;
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const nx = Math.max(0, Math.round((cx - sw / 2) / grid) * grid);
    const ny = Math.max(0, Math.round((cy - sh / 2) / grid) * grid);

    const nextLayout: Layout = {
      ...layout,
      nodes: { ...layout.nodes, [id]: { ...node, x: nx, y: ny, w: sw, h: sh } },
    };
    const routes = await routeEdges(model, nextLayout);
    const plan = buildRenderPlan({ model, layout: nextLayout, routes });
    set({ layout: nextLayout, routes, plan });
  },

  selectNode(id) {
    set({ selection: id });
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
