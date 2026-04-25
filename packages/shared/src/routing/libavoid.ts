import type { EdgeId, EdgeRoutes, Layout, Model, Point, Side } from '../model/types.js';
import { SIDES } from '../model/types.js';
import { pinForEdge } from './pins.js';

// We isolate the libavoid-js bridge so the shared package stays portable.
// The router is loaded lazily; tests substitute a fallback factory.

interface RouterFactoryResult {
  route(input: AvoidInput): EdgeRoutes;
}

interface AvoidInput {
  shapes: { id: string; box: { x: number; y: number; w: number; h: number } }[];
  edges: PinnedEdge[];
}

export type RouterFactory = () => Promise<RouterFactoryResult>;

let factory: RouterFactory = defaultFactory;
let routerPromise: Promise<RouterFactoryResult> | null = null;

export function setRouterFactory(f: RouterFactory): void {
  factory = f;
  routerPromise = null;
}

async function defaultFactory(): Promise<RouterFactoryResult> {
  const lib = await import('libavoid-js');
  await lib.AvoidLib.load();
  const Avoid = lib.AvoidLib.getInstance();
  return {
    route(input): EdgeRoutes {
      const router = new Avoid.Router(Avoid.OrthogonalRouting);
      for (const s of input.shapes) {
        const tl = new Avoid.Point(s.box.x, s.box.y);
        const br = new Avoid.Point(s.box.x + s.box.w, s.box.y + s.box.h);
        const rect = new Avoid.Rectangle(tl, br);
        new Avoid.ShapeRef(router, rect);
      }
      const conns = input.edges.map((e) => {
        const src = new Avoid.ConnEnd(new Avoid.Point(e.from.x, e.from.y));
        const dst = new Avoid.ConnEnd(new Avoid.Point(e.to.x, e.to.y));
        return { id: e.id, conn: new Avoid.ConnRef(router, src, dst) };
      });
      router.processTransaction();
      const out: EdgeRoutes = {};
      for (const { id, conn } of conns) {
        const poly = conn.displayRoute();
        const points: Point[] = [];
        for (let i = 0; i < poly.size(); i += 1) {
          const p = poly.get_ps(i);
          points.push({ x: p.x, y: p.y });
        }
        out[id] = points;
      }
      return out;
    },
  };
}

async function getRouter(): Promise<RouterFactoryResult> {
  if (!routerPromise) routerPromise = factory();
  return routerPromise;
}

// Manhattan-style fallback used during tests and when libavoid is unavailable.
// Routes a single elbow per edge from one pin to the other.
export function manhattanRoute(from: Point, fromSide: Side, to: Point, _toSide: Side): Point[] {
  if (fromSide === 'left' || fromSide === 'right') {
    const midX = (from.x + to.x) / 2;
    return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
  }
  const midY = (from.y + to.y) / 2;
  return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to];
}

export interface RouteOptions {
  useFallback?: boolean;
}

export async function routeEdges(model: Model, layout: Layout, opts: RouteOptions = {}): Promise<EdgeRoutes> {
  const edgePins = collectEdgePins(model, layout);
  if (opts.useFallback) {
    return fallbackRoutes(edgePins);
  }
  try {
    const router = await getRouter();
    return router.route({
      shapes: Object.entries(layout.nodes).map(([id, n]) => ({ id, box: { x: n.x, y: n.y, w: n.w, h: n.h } })),
      edges: edgePins,
    });
  } catch {
    return fallbackRoutes(edgePins);
  }
}

function fallbackRoutes(edges: PinnedEdge[]): EdgeRoutes {
  const out: EdgeRoutes = {};
  for (const e of edges) out[e.id] = manhattanRoute(e.from, e.fromSide, e.to, e.toSide);
  return out;
}

interface PinnedEdge {
  id: EdgeId;
  from: Point;
  to: Point;
  fromSide: Side;
  toSide: Side;
}

export function collectEdgePins(model: Model, layout: Layout): PinnedEdge[] {
  const result: PinnedEdge[] = [];
  for (const [edgeId, edge] of Object.entries(model.edges)) {
    const sides = layout.edges[edgeId];
    const fromNode = layout.nodes[edge.from];
    const toNode = layout.nodes[edge.to];
    if (!sides || !fromNode || !toNode) continue;

    const fromSide = ensureContainsEdge(fromNode.connections, sides.fromSide, edgeId);
    const toSide = ensureContainsEdge(toNode.connections, sides.toSide, edgeId);
    const from = pinForEdge(fromNode, fromSide, edgeId);
    const to = pinForEdge(toNode, toSide, edgeId);
    if (!from || !to) continue;

    result.push({ id: edgeId, from, to, fromSide, toSide });
  }
  return result;
}

function ensureContainsEdge(connections: Record<Side, EdgeId[]>, preferred: Side, edgeId: EdgeId): Side {
  if (connections[preferred].includes(edgeId)) return preferred;
  for (const side of SIDES) {
    if (connections[side].includes(edgeId)) return side;
  }
  return preferred;
}
