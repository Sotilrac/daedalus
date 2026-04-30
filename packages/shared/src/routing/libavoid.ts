import type {
  EdgeId,
  EdgeRoutes,
  Layout,
  Model,
  ModelNode,
  NodeLayout,
  Point,
  ShapeKind,
  Side,
} from '../model/types.js';
import { SIDES } from '../model/types.js';
import { isContainer, parentId } from '../model/ids.js';
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
  shapeBuffer: number;
  leadOut: number;
  nudging: number;
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
    destroy: (obj: unknown) => void;
  };
  const num = (k: string): number => Number(raw[k] ?? 0);

  return {
    route(input): EdgeRoutes {
      // Guard against the inputs that historically tip libavoid over and
      // call `abort()` from C++ (which surfaces as `libc++abi: terminating`
      // / `native code called abort()` and kills the wasm for the session).
      // Each filter is paired with a comment naming the failure mode it
      // protects against; if you see aborts that aren't covered here,
      // grab `__daedalus_routing.lastInput` from devtools — it now snapshots
      // what we handed libavoid right before the call.
      const safeShapes = input.shapes.filter((s) => {
        // (a) zero / negative dimensions trip Polygon::isValid asserts.
        if (!(s.box.w > 0 && s.box.h > 0)) return false;
        // (b) NaN/Infinity slip through arithmetic and crash routing.
        if (!Number.isFinite(s.box.x) || !Number.isFinite(s.box.y)) return false;
        if (!Number.isFinite(s.box.w) || !Number.isFinite(s.box.h)) return false;
        return true;
      });
      const safeEdges = input.edges.filter((e) => {
        // (c) zero-length connectors (src == dst) make libavoid's path
        // search recurse on a degenerate ConnEnd pair.
        const sameX = Math.abs(e.from.x - e.to.x) < 1e-6;
        const sameY = Math.abs(e.from.y - e.to.y) < 1e-6;
        if (sameX && sameY) return false;
        if (!Number.isFinite(e.from.x) || !Number.isFinite(e.from.y)) return false;
        if (!Number.isFinite(e.to.x) || !Number.isFinite(e.to.y)) return false;
        return true;
      });
      const stats = {
        shapes: safeShapes.length,
        polygons: 0,
        rectangles: 0,
        edges: safeEdges.length,
        droppedShapes: input.shapes.length - safeShapes.length,
        droppedEdges: input.edges.length - safeEdges.length,
        params: {} as Record<string, number>,
      };

      // Memory ownership in libavoid:
      //   * Router owns its ShapeRefs / ConnRefs and destroys them when
      //     the router itself is destroyed. We must NOT destroy these
      //     manually — doing so caused a double-free that surfaced as
      //     `libc++abi: terminating` followed by `Aborted(native code
      //     called abort())`, with the wasm dead for the rest of the
      //     session.
      //   * Standalone value objects we hand to constructors (Point,
      //     Polygon, Rectangle, ConnEnd) are *copied* by the C++ side
      //     and remain owned by us. We track those and free them after
      //     the route() call so the wasm heap doesn't grow without
      //     bound under heavy use (drag at 60 fps used to exhaust the
      //     2GB heap in a few seconds).
      const standalone: unknown[] = [];
      const own = <T>(obj: T): T => {
        standalone.push(obj);
        return obj;
      };

      const router = new Avoid.Router(Avoid.OrthogonalRouting);
      try {
        const setParam = (k: string, v: number): void => {
          const id = num(k);
          stats.params[k] = id;
          router.setRoutingParameter(id, v);
        };
        setParam('shapeBufferDistance', input.shapeBuffer);
        setParam('idealNudgingDistance', input.nudging);
        setParam('segmentPenalty', 50);
        // Two flavours of edge-on-edge overlap, both expensive now:
        //   crossingPenalty = cost when one route crosses another at a
        //     point. Raised from 200 to 800 so libavoid prefers a longer
        //     detour over a clean geometric crossing.
        //   fixedSharedPathPenalty = cost when one route runs along the
        //     same segment as another (parallel coincident lines). Default
        //     is 0 — i.e. unrestricted — which is why pairs of edges
        //     occasionally stack on top of each other. 600 pushes them
        //     apart by `idealNudgingDistance` instead.
        setParam('crossingPenalty', 800);
        setParam('fixedSharedPathPenalty', 600);
        setParam('portDirectionPenalty', 100);
        // Discourages U-turns: a route segment that doubles back on itself
        // costs 20 over a forward-going alternative, so libavoid prefers
        // straighter detours where the geometry allows.
        setParam('reverseDirectionPenalty', 20);
        router.setRoutingOption(num('nudgeOrthogonalSegmentsConnectedToShapes'), true);

        for (const s of safeShapes) {
          const outline = shapeOutline(s.kind, s.box);
          let geometry: unknown;
          if (outline.length > 0) {
            const poly = own(new Avoid.Polygon(outline.length));
            for (let i = 0; i < outline.length; i += 1) {
              const p = outline[i];
              if (p) poly.setPoint(i, own(new Avoid.Point(p.x, p.y)));
            }
            geometry = poly;
            stats.polygons += 1;
          } else {
            const tl = own(new Avoid.Point(s.box.x, s.box.y));
            const br = own(new Avoid.Point(s.box.x + s.box.w, s.box.y + s.box.h));
            geometry = own(new Avoid.Rectangle(tl, br));
            stats.rectangles += 1;
          }
          // ShapeRef belongs to the router; do NOT add to `standalone`.
          new Avoid.ShapeRef(router, geometry);
        }

        const conns = safeEdges.map((e) => {
          const srcLead = leadOut(e.from, e.fromSide, input.leadOut);
          const dstLead = leadOut(e.to, e.toSide, input.leadOut);
          const srcPt = own(new Avoid.Point(srcLead.x, srcLead.y));
          const dstPt = own(new Avoid.Point(dstLead.x, dstLead.y));
          const src = own(new Avoid.ConnEnd(srcPt));
          const dst = own(new Avoid.ConnEnd(dstPt));
          // ConnRef belongs to the router; do NOT add to `standalone`.
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
        // Edges we filtered out (degenerate, NaN, etc.) get a single-segment
        // straight-line route so the renderer doesn't lose them entirely.
        for (const e of input.edges) {
          if (out[e.id]) continue;
          out[e.id] = [e.from, e.to];
        }

        // Stash everything on a global so it's easy to inspect from devtools:
        //   __daedalus_routing.last
        const g = globalThis as { __daedalus_routing?: unknown };
        g.__daedalus_routing = {
          ...stats,
          // Snapshot the actual input we handed to libavoid. If the next
          // call aborts, this is the last-known-good payload — diff it
          // against `lastFailedInput` (set in the catch path inside
          // routeEdges) to find what triggered the abort.
          lastInput: {
            shapes: safeShapes,
            edges: safeEdges.map((e) => ({
              id: e.id,
              from: e.from,
              to: e.to,
              fromSide: e.fromSide,
              toSide: e.toSide,
            })),
          },
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
          'edges; dropped',
          stats.droppedShapes,
          'shapes /',
          stats.droppedEdges,
          'edges; sample route',
          out[input.edges[0]?.id ?? ''],
        );
        return out;
      } finally {
        // Standalone value objects (Point/Polygon/Rectangle/ConnEnd) we
        // own get freed first; then the router, which cascades into its
        // ShapeRefs and ConnRefs.
        for (let i = standalone.length - 1; i >= 0; i -= 1) {
          try {
            Avoid.destroy(standalone[i]);
          } catch {
            /* best-effort: a parent may have already taken ownership */
          }
        }
        try {
          Avoid.destroy(router);
        } catch {
          /* router was never fully constructed */
        }
      }
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

// Force the libavoid wasm module to be re-instantiated on the next route
// call. Once libavoid hits an internal `abort()` (e.g. the wasm reports
// "Aborted(native code called abort())"), every subsequent call into that
// instance throws "program has already aborted" — the only way to recover
// without reloading the page is to drop the cached emscripten module and
// let `factory()` build a brand-new one. The emscripten factory is a
// regular function that can be called multiple times; each call returns a
// fresh module with its own heap, so resetting both `routerPromise` and
// the AvoidLib singleton's `avoidLib` field is sufficient.
async function resetRouter(): Promise<void> {
  routerPromise = null;
  try {
    const lib = await import('libavoid-js');
    (lib.AvoidLib as unknown as { avoidLib?: unknown }).avoidLib = undefined;
  } catch {
    // Best-effort: if even the import fails, the next route() will retry.
  }
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

// Maps a D2 `labelPosition` onto the node side the label sits on, for
// OUTSIDE_* placements only. Returns null for INSIDE/BORDER (already inside
// the node's own obstacle), for OUTSIDE_MIDDLE_CENTER (degenerate / unused),
// and for any unrecognised string.
export function labelSide(position: string | undefined): Side | null {
  if (!position || position === 'UNSET_LABEL_POSITION') return null;
  const parts = position.split('_');
  if (parts.length !== 3) return null;
  const [zone, vert, horiz] = parts;
  if (zone !== 'OUTSIDE') return null;
  if (vert === 'TOP') return 'top';
  if (vert === 'BOTTOM') return 'bottom';
  if (vert === 'MIDDLE') {
    if (horiz === 'LEFT') return 'left';
    if (horiz === 'RIGHT') return 'right';
  }
  return null;
}

// Compute a user-space bounding box for a node's rendered label, for any
// labelPosition string. INSIDE / BORDER / OUTSIDE are all handled — the
// caller adds the bbox as a libavoid obstacle so routes never cross the
// rendered text. For containers (which we strip from the obstacle list)
// this is the only thing protecting their label from being intersected.
// Width is estimated from char count × font size × the 0.55 glyph ratio
// used by the wrap-label fallback in render/svg.
const LABEL_OBSTACLE_INSET = 6; // matches LABEL_INSET in resolveLabelPlacement
const LABEL_GLYPH_RATIO = 0.55;
const LABEL_LINE_HEIGHT_EM = 1.2;

export function labelObstacle(
  node: ModelNode,
  layout: NodeLayout,
): { x: number; y: number; w: number; h: number } | null {
  const pos = node.labelPosition;
  if (!pos || pos === 'UNSET_LABEL_POSITION') return null;
  const text = node.label?.trim();
  if (!text) return null;
  const parts = pos.split('_');
  if (parts.length !== 3) return null;
  const [zone, vert, horiz] = parts;

  const fontSize = node.style.fontSize ?? 12;
  const w = Math.max(8, text.length * fontSize * LABEL_GLYPH_RATIO);
  const h = fontSize * LABEL_LINE_HEIGHT_EM;
  const inset = LABEL_OBSTACLE_INSET;
  const nw = layout.w;
  const nh = layout.h;

  // Compute the bbox in the node's local coordinate system (origin at the
  // node's top-left), then translate to user space at the end.
  let bx: number;
  let by: number;

  if (zone === 'OUTSIDE') {
    if (vert === 'TOP') by = -inset - h;
    else if (vert === 'BOTTOM') by = nh + inset;
    else by = nh / 2 - h / 2;
    if (vert === 'MIDDLE') {
      if (horiz === 'LEFT') bx = -inset - w;
      else if (horiz === 'RIGHT') bx = nw + inset;
      else return null; // OUTSIDE_MIDDLE_CENTER never renders distinctly
    } else {
      if (horiz === 'LEFT') bx = 0;
      else if (horiz === 'RIGHT') bx = nw - w;
      else bx = nw / 2 - w / 2;
    }
  } else if (zone === 'BORDER') {
    // Sits straddling the edge line.
    if (vert === 'TOP') by = -h / 2;
    else if (vert === 'BOTTOM') by = nh - h / 2;
    else by = nh / 2 - h / 2;
    if (horiz === 'LEFT') bx = 0;
    else if (horiz === 'RIGHT') bx = nw - w;
    else bx = nw / 2 - w / 2;
  } else {
    // INSIDE (default for any unrecognised zone too).
    if (vert === 'TOP') by = inset;
    else if (vert === 'BOTTOM') by = nh - inset - h;
    else by = nh / 2 - h / 2;
    if (horiz === 'LEFT') bx = inset;
    else if (horiz === 'RIGHT') bx = nw - inset - w;
    else bx = nw / 2 - w / 2;
  }

  return { x: layout.x + bx, y: layout.y + by, w, h };
}

// Walk up the parent chain (via dotted-path ids) and collect every container
// id along the way. `containerIds` is the precomputed set of nodes that have
// at least one nested descendant, so the chain only includes real containers.
function ancestorContainers(id: string, containerIds: Set<string>): string[] {
  const out: string[] = [];
  let p = parentId(id);
  while (p) {
    if (containerIds.has(p)) out.push(p);
    p = parentId(p);
  }
  return out;
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

    const allNodeIds = Object.keys(model.nodes);
    const containerIds = new Set(allNodeIds.filter((id) => isContainer(allNodeIds, id)));

    // Per-edge container handling: an edge that needs to leave or enter a
    // container can't have that container in its obstacle list — its
    // lead-out point would land inside the obstacle and libavoid would
    // either give up or detour wildly. So for each edge we compute the
    // set of container ancestors of its endpoints, and group edges by
    // that set. Each group runs through libavoid with *only* that set of
    // containers stripped; unrelated containers stay as obstacles, which
    // keeps the route from cutting through siblings the user expects to
    // be respected.
    type Shape = {
      id: string;
      kind: ShapeKind;
      box: { x: number; y: number; w: number; h: number };
    };
    type Group = { exclude: Set<string>; edges: PinnedEdge[] };
    const groups = new Map<string, Group>();
    for (const e of edgePins) {
      const m = model.edges[e.id];
      if (!m) continue;
      const exc = new Set<string>([
        ...ancestorContainers(m.from, containerIds),
        ...ancestorContainers(m.to, containerIds),
      ]);
      const key = [...exc].sort().join('|');
      let g = groups.get(key);
      if (!g) {
        g = { exclude: exc, edges: [] };
        groups.set(key, g);
      }
      g.edges.push(e);
    }

    // For each node, decide whether it should be present in this group's
    // obstacle list. Skip excluded containers entirely. Skip leaves whose
    // closest non-excluded ancestor is a container (the container's box
    // covers them) — this is what keeps libavoid from getting *both* a
    // container box and its child boxes overlapping in the same input,
    // which is what was crashing the wasm into "program has already
    // aborted!" and forcing the manhattan fallback (which has no
    // obstacle avoidance, so edges visibly cut through containers).
    const shouldInclude = (id: string, exclude: Set<string>): boolean => {
      if (exclude.has(id)) return false;
      let p = parentId(id);
      while (p) {
        if (containerIds.has(p) && !exclude.has(p)) return false;
        p = parentId(p);
      }
      return true;
    };

    const allRoutes: EdgeRoutes = {};
    let aborted = false;
    for (const g of groups.values()) {
      if (aborted) {
        // Wasm is dead until we reset; finish the pass with manhattan
        // routes for the remaining groups so the diagram still renders.
        for (const e of g.edges) {
          allRoutes[e.id] = manhattanRoute(e.from, e.fromSide, e.to, e.toSide);
        }
        continue;
      }
      const groupShapes: Shape[] = [];
      const includedIds = new Set<string>();
      for (const [id, n] of Object.entries(layout.nodes)) {
        if (!shouldInclude(id, g.exclude)) continue;
        includedIds.add(id);
        groupShapes.push({
          id,
          kind: (model.nodes[id]?.shape ?? 'rectangle') as ShapeKind,
          box: { x: n.x, y: n.y, w: n.w, h: n.h },
        });
      }
      // Label obstacles. OUTSIDE labels always go in (they extend beyond
      // the node's box). INSIDE / BORDER labels are added only when the
      // node itself is NOT in the obstacle list for this group, otherwise
      // the label rect overlaps the parent box — same wasm-abort risk.
      for (const [id, m] of Object.entries(model.nodes)) {
        const lay = layout.nodes[id];
        if (!lay) continue;
        const bbox = labelObstacle(m, lay);
        if (!bbox) continue;
        const pos = m.labelPosition ?? '';
        const outside = pos.startsWith('OUTSIDE_');
        if (!outside && includedIds.has(id)) continue;
        groupShapes.push({ id: `${id}__label`, kind: 'rectangle', box: bbox });
      }

      try {
        const result = router.route({
          shapes: groupShapes,
          edges: g.edges,
          shapeBuffer: layout.settings.routing.shapeBuffer,
          leadOut: layout.settings.routing.leadOut,
          nudging: layout.settings.routing.nudging,
        });
        Object.assign(allRoutes, result);
      } catch (err) {
        // Per-group fallback so one libavoid hiccup doesn't take out every
        // route. The wasm tends to stay aborted after one of these — flag
        // it so subsequent groups in this pass also short-circuit, and
        // schedule a `resetRouter()` after the loop so the *next* layout
        // change gets a brand-new wasm module. Stash the offending input
        // on `globalThis.__daedalus_routing.lastFailedInput` so we can
        // examine what tripped libavoid from devtools.
        const con = globalThis as {
          console?: { warn?: (...a: unknown[]) => void };
          __daedalus_routing?: Record<string, unknown>;
        };
        con.console?.warn?.('[daedalus] route group failed, manhattan fallback', err);
        const slot = con.__daedalus_routing ?? {};
        slot.lastFailedInput = {
          shapes: groupShapes,
          edges: g.edges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            fromSide: e.fromSide,
            toSide: e.toSide,
          })),
          excluded: [...g.exclude],
          error: String(err),
        };
        con.__daedalus_routing = slot;
        aborted = true;
        for (const e of g.edges) {
          allRoutes[e.id] = manhattanRoute(e.from, e.fromSide, e.to, e.toSide);
        }
      }
    }
    if (aborted) await resetRouter();
    return allRoutes;
  } catch (err) {
    const g = globalThis as { console?: { warn?: (...a: unknown[]) => void } };
    g.console?.warn?.('[daedalus] libavoid routing failed, using manhattan fallback', err);
    // Outer catch fires for setup failures (e.g. failing to build the
    // groups). Drop the cached wasm so the next call retries from scratch.
    await resetRouter();
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
    const fromShape = model.nodes[edge.from]?.shape;
    const toShape = model.nodes[edge.to]?.shape;
    const from = pinForEdge(fromNode, fromSide, edgeId, fromShape);
    const to = pinForEdge(toNode, toSide, edgeId, toShape);
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
