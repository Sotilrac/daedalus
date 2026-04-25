import type { EdgeId, EdgeRoutes, Layout, Model, Point, ShapeKind, Side } from '../model/types.js';
import { SIDES } from '../model/types.js';
import { pinForEdge } from './pins.js';

// We isolate the libavoid-js bridge so the shared package stays portable.
// The router is loaded lazily; tests substitute a fallback factory.

interface RouterFactoryResult {
  route(input: AvoidInput): EdgeRoutes;
}

interface AvoidInput {
  shapes: {
    id: string;
    kind: ShapeKind;
    box: { x: number; y: number; w: number; h: number };
  }[];
  edges: PinnedEdge[];
}

// Polygon outline (clockwise, absolute coords) for shapes whose visible
// outline differs from the bounding rectangle. Returning an empty array
// signals "use the bounding rect".
export function shapeOutline(
  kind: ShapeKind,
  b: { x: number; y: number; w: number; h: number },
): Point[] {
  const { x, y, w, h } = b;
  switch (kind) {
    case 'hexagon': {
      const q = w / 4;
      return [
        { x: x + q, y },
        { x: x + w - q, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - q, y: y + h },
        { x: x + q, y: y + h },
        { x, y: y + h / 2 },
      ];
    }
    case 'diamond':
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      ];
    case 'parallelogram': {
      const skew = Math.min(w / 6, 16);
      return [
        { x: x + skew, y },
        { x: x + w, y },
        { x: x + w - skew, y: y + h },
        { x, y: y + h },
      ];
    }
    default:
      return [];
  }
}

export type RouterFactory = () => Promise<RouterFactoryResult>;

let factory: RouterFactory = defaultFactory;
let routerPromise: Promise<RouterFactoryResult> | null = null;
let wasmUrl: string | undefined;

export function setRouterFactory(f: RouterFactory): void {
  factory = f;
  routerPromise = null;
}

// Bundlers (Vite, webpack) don't auto-copy libavoid's `.wasm` next to the
// bundled JS, so the loader's relative fetch returns HTML and fails to parse.
// The web package imports the wasm with `?url` and calls this with the result.
export function setLibavoidWasmUrl(url: string): void {
  wasmUrl = url;
  routerPromise = null;
}

// How far to project the endpoint perpendicular to the shape side before
// handing it to libavoid. Without this lead-out, the endpoint sits exactly on
// the shape boundary, so libavoid's orthogonal router treats it as an
// interior point and is willing to route through the host shape.
const LEAD_OUT = 16;

// libavoid only knows axis-aligned bounding rectangles for shapes. Rendered
// hexagons / cylinders / parallelograms only fill PART of that rectangle, so a
// route that hugs the rect corner visually cuts into the polygon. We shrink
// the visible shape by this much (per side) when registering with libavoid so
// the buffer keeps routes outside the *visible* outline too.
const SHAPE_BUFFER = 16;

function leadOut(p: Point, side: Side, d: number): Point {
  switch (side) {
    case 'top':
      return { x: p.x, y: p.y - d };
    case 'bottom':
      return { x: p.x, y: p.y + d };
    case 'left':
      return { x: p.x - d, y: p.y };
    case 'right':
      return { x: p.x + d, y: p.y };
  }
}

async function defaultFactory(): Promise<RouterFactoryResult> {
  const lib = await import('libavoid-js');
  await lib.AvoidLib.load(wasmUrl);
  log('libavoid loaded', wasmUrl ? `from ${wasmUrl}` : '(default path)');
  // The bridge is dynamically typed; cast through unknown to keep our local
  // calls explicit while not duplicating the entire emscripten signature.
  const raw = lib.AvoidLib.getInstance() as unknown as Record<string, unknown>;
  const Avoid = raw as unknown as {
    Router: new (kind: number) => RouterHandle;
    Rectangle: new (a: PointHandle, b: PointHandle) => unknown;
    Polygon: new (n: number) => PolygonHandle;
    ShapeRef: new (router: RouterHandle, poly: unknown) => unknown;
    Point: new (x: number, y: number) => PointHandle;
    ConnEnd: new (point: PointHandle) => unknown;
    ConnRef: new (router: RouterHandle, src: unknown, dst: unknown) => ConnRefHandle;
    OrthogonalRouting: number;
  };
  const num = (k: string): number => Number(raw[k] ?? 0);

  return {
    route(input): EdgeRoutes {
      const stats = {
        shapes: input.shapes.length,
        polygons: 0,
        rectangles: 0,
        edges: input.edges.length,
        params: {} as Record<string, number>,
      };
      const router = new Avoid.Router(Avoid.OrthogonalRouting);
      const setParam = (k: string, v: number): void => {
        const id = num(k);
        stats.params[k] = id;
        router.setRoutingParameter(id, v);
      };
      setParam('shapeBufferDistance', SHAPE_BUFFER);
      setParam('idealNudgingDistance', 16);
      setParam('segmentPenalty', 50);
      setParam('crossingPenalty', 200);
      setParam('portDirectionPenalty', 100);
      router.setRoutingOption(num('nudgeOrthogonalSegmentsConnectedToShapes'), true);

      for (const s of input.shapes) {
        const outline = shapeOutline(s.kind, s.box);
        let geometry: unknown;
        if (outline.length > 0) {
          const poly = new Avoid.Polygon(outline.length);
          for (let i = 0; i < outline.length; i += 1) {
            const p = outline[i];
            if (p) poly.setPoint(i, new Avoid.Point(p.x, p.y));
          }
          geometry = poly;
          stats.polygons += 1;
        } else {
          const tl = new Avoid.Point(s.box.x, s.box.y);
          const br = new Avoid.Point(s.box.x + s.box.w, s.box.y + s.box.h);
          geometry = new Avoid.Rectangle(tl, br);
          stats.rectangles += 1;
        }
        new Avoid.ShapeRef(router, geometry);
      }

      const conns = input.edges.map((e) => {
        const srcLead = leadOut(e.from, e.fromSide, LEAD_OUT);
        const dstLead = leadOut(e.to, e.toSide, LEAD_OUT);
        const src = new Avoid.ConnEnd(new Avoid.Point(srcLead.x, srcLead.y));
        const dst = new Avoid.ConnEnd(new Avoid.Point(dstLead.x, dstLead.y));
        return {
          id: e.id,
          conn: new Avoid.ConnRef(router, src, dst),
          pinSrc: e.from,
          pinDst: e.to,
        };
      });
      router.processTransaction();

      const out: EdgeRoutes = {};
      const segmentCounts: number[] = [];
      for (const { id, conn, pinSrc, pinDst } of conns) {
        const poly = conn.displayRoute();
        const points: Point[] = [pinSrc];
        for (let i = 0; i < poly.size(); i += 1) {
          const p = poly.get_ps(i);
          points.push({ x: p.x, y: p.y });
        }
        points.push(pinDst);
        out[id] = points;
        segmentCounts.push(poly.size());
      }

      // Stash everything on a global so it's easy to inspect from devtools:
      //   __daedalus_routing.last
      const g = globalThis as { __daedalus_routing?: unknown };
      g.__daedalus_routing = {
        ...stats,
        sampleEdge: input.edges[0]
          ? {
              id: input.edges[0].id,
              from: input.edges[0].from,
              to: input.edges[0].to,
              fromSide: input.edges[0].fromSide,
              toSide: input.edges[0].toSide,
              route: out[input.edges[0].id],
            }
          : null,
        avgSegments: segmentCounts.length
          ? segmentCounts.reduce((a, b) => a + b, 0) / segmentCounts.length
          : 0,
        minSegments: Math.min(...(segmentCounts.length ? segmentCounts : [0])),
        maxSegments: Math.max(...(segmentCounts.length ? segmentCounts : [0])),
      };
      log(
        'routed',
        stats.shapes,
        'shapes /',
        stats.edges,
        'edges; sample route',
        out[input.edges[0]?.id ?? ''],
      );
      return out;
    },
  };
}

function log(...args: unknown[]): void {
  const g = globalThis as { console?: { info?: (...a: unknown[]) => void } };
  g.console?.info?.('[daedalus]', ...args);
}

type PointHandle = object;
interface RouterHandle {
  processTransaction(): void;
  setRoutingParameter(parameter: number, value: number): void;
  setRoutingOption(option: number, value: boolean): void;
}
interface ConnRefHandle {
  displayRoute(): { size(): number; get_ps(i: number): { x: number; y: number } };
}
interface PolygonHandle {
  setPoint(i: number, p: PointHandle): void;
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

export async function routeEdges(
  model: Model,
  layout: Layout,
  opts: RouteOptions = {},
): Promise<EdgeRoutes> {
  const edgePins = collectEdgePins(model, layout);
  if (opts.useFallback) {
    return fallbackRoutes(edgePins);
  }
  try {
    const router = await getRouter();
    return router.route({
      shapes: Object.entries(layout.nodes).map(([id, n]) => ({
        id,
        kind: model.nodes[id]?.shape ?? 'rectangle',
        box: { x: n.x, y: n.y, w: n.w, h: n.h },
      })),
      edges: edgePins,
    });
  } catch (err) {
    const g = globalThis as { console?: { warn?: (...a: unknown[]) => void } };
    g.console?.warn?.('[daedalus] libavoid routing failed, using manhattan fallback', err);
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

function ensureContainsEdge(
  connections: Record<Side, EdgeId[]>,
  preferred: Side,
  edgeId: EdgeId,
): Side {
  if (connections[preferred].includes(edgeId)) return preferred;
  for (const side of SIDES) {
    if (connections[side].includes(edgeId)) return side;
  }
  return preferred;
}
