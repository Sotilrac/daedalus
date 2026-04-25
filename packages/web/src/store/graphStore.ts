import { create } from 'zustand';
import {
  DEFAULT_GRID,
  DEFAULT_VIEWPORT,
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
  loadFromCompile(opts: {
    files: Record<string, string>;
    inputPath: string;
    prevModel?: Model | null;
    prevLayout?: Layout | null;
  }): Promise<void>;
  relayout(): Promise<void>;
  moveNode(id: NodeId, x: number, y: number): Promise<void>;
  selectNode(id: NodeId | null): void;
  swapAnchor(node: NodeId, side: Side, edgeId: EdgeId, offset: number): Promise<void>;
  setTheme(theme: 'blueprint' | 'paper'): void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  model: null,
  layout: null,
  routes: {},
  plan: null,
  selection: null,
  needsRelayout: false,

  async loadFromCompile({ files, inputPath, prevModel, prevLayout }) {
    const outcome = await compileD2({ files, inputPath, layout: 'elk' });
    if (!outcome.ok) throw new Error(outcome.errors.map((e) => e.raw).join('\n'));

    const model = diagramToModel(outcome.result.diagram);
    const raw = diagramToRawLayout(outcome.result.diagram, edgeId);
    const grid = prevLayout?.grid ?? DEFAULT_GRID;
    const fresh = buildLayoutFromRaw({ raw, grid, prev: prevLayout ?? undefined });

    let layout: Layout = fresh;
    let needsRelayout = false;
    if (prevModel && prevLayout) {
      const reconciled = reconcileLayout(prevLayout, prevModel, model);
      layout = reconciled.layout;
      needsRelayout = reconciled.needsRelayout;
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

    const sx = snap(x, layout.grid.size);
    const sy = snap(y, layout.grid.size);
    const clamped = clampToGrid(sx, sy, node.w, node.h, layout.grid);

    const nextLayout: Layout = {
      ...layout,
      nodes: { ...layout.nodes, [id]: { ...node, x: clamped.x, y: clamped.y } },
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

  setTheme(theme) {
    const { model, layout, routes } = get();
    if (!layout) return;
    const nextLayout: Layout = { ...layout, viewport: { ...layout.viewport, theme } };
    const plan = model ? buildRenderPlan({ model, layout: nextLayout, routes }) : null;
    set({ layout: nextLayout, plan });
  },
}));

export function emptyDefaults(): { grid: typeof DEFAULT_GRID; viewport: typeof DEFAULT_VIEWPORT } {
  return { grid: DEFAULT_GRID, viewport: DEFAULT_VIEWPORT };
}
