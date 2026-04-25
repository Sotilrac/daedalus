import { D2 } from '@terrastruct/d2';
import { AvoidLib } from 'libavoid-js';
import { readFileSync } from 'node:fs';

const d2 = new D2();
const result = await d2.compile({
  fs: {
    'index.d2': readFileSync('../../example/index.d2', 'utf8'),
    'nodes.d2': readFileSync('../../example/nodes.d2', 'utf8'),
  },
  inputPath: 'index.d2',
  options: { layout: 'elk' },
});

const GRID = 16;
const snap = (v) => Math.round(v / GRID) * GRID;
const snapUp = (v) => Math.ceil(v / GRID) * GRID;

// Build the snapped boxes the same way the app does.
const boxes = {};
for (const s of result.diagram.shapes) {
  const w = snapUp(Math.max(s.width ?? 144, GRID));
  const h = snapUp(Math.max(s.height ?? 64, GRID));
  const x = Math.max(0, snap(s.pos?.x ?? 0));
  const y = Math.max(0, snap(s.pos?.y ?? 0));
  boxes[s.id] = { x, y, w, h };
}

// Pick a side for each edge endpoint by classifying its waypoint.
function classify(box, p) {
  const top = Math.abs(p.y - box.y);
  const bot = Math.abs(p.y - (box.y + box.h));
  const left = Math.abs(p.x - box.x);
  const right = Math.abs(p.x - (box.x + box.w));
  const m = Math.min(top, bot, left, right);
  if (m === top) return 'top';
  if (m === bot) return 'bottom';
  if (m === left) return 'left';
  return 'right';
}
function pin(box, side) {
  switch (side) {
    case 'top':
      return { x: box.x + box.w / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case 'left':
      return { x: box.x, y: box.y + box.h / 2 };
    case 'right':
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}
function lead(p, side, d) {
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

await AvoidLib.load();
const A = AvoidLib.getInstance();
const router = new A.Router(A.OrthogonalRouting);
router.setRoutingParameter(A.shapeBufferDistance, 12);
router.setRoutingParameter(A.idealNudgingDistance, 16);
router.setRoutingParameter(A.crossingPenalty, 200);
router.setRoutingParameter(A.portDirectionPenalty, 100);

for (const id in boxes) {
  const b = boxes[id];
  const r = new A.Rectangle(new A.Point(b.x, b.y), new A.Point(b.x + b.w, b.y + b.h));
  new A.ShapeRef(router, r);
}

const conns = [];
for (const c of result.diagram.connections) {
  const sb = boxes[c.src];
  const db = boxes[c.dst];
  if (!sb || !db) continue;
  const r = c.route ?? [];
  const fSide = r.length ? classify(sb, r[0]) : 'right';
  const tSide = r.length ? classify(db, r[r.length - 1]) : 'left';
  const fPin = pin(sb, fSide);
  const tPin = pin(db, tSide);
  const fLead = lead(fPin, fSide, 12);
  const tLead = lead(tPin, tSide, 12);
  const src = new A.ConnEnd(new A.Point(fLead.x, fLead.y));
  const dst = new A.ConnEnd(new A.Point(tLead.x, tLead.y));
  const conn = new A.ConnRef(router, src, dst);
  conns.push({ id: `${c.src}->${c.dst}`, conn, fPin, tPin, src: c.src, dst: c.dst });
}
router.processTransaction();

function segHitsBox(p1, p2, b) {
  // axis-aligned segments only
  if (p1.x === p2.x) {
    const x = p1.x;
    const y1 = Math.min(p1.y, p2.y),
      y2 = Math.max(p1.y, p2.y);
    return x > b.x && x < b.x + b.w && y2 > b.y && y1 < b.y + b.h;
  }
  if (p1.y === p2.y) {
    const y = p1.y;
    const x1 = Math.min(p1.x, p2.x),
      x2 = Math.max(p1.x, p2.x);
    return y > b.y && y < b.y + b.h && x2 > b.x && x1 < b.x + b.w;
  }
  return false;
}

let crossings = 0;
for (const { id, conn, fPin, tPin, src, dst } of conns) {
  const poly = conn.displayRoute();
  const pts = [fPin];
  for (let i = 0; i < poly.size(); i++) {
    const p = poly.get_ps(i);
    pts.push({ x: p.x, y: p.y });
  }
  pts.push(tPin);
  console.log('\nedge', id);
  for (const p of pts) console.log('  ', p.x.toFixed(1), p.y.toFixed(1));
  for (let i = 0; i < pts.length - 1; i++) {
    for (const [bid, b] of Object.entries(boxes)) {
      if (bid === src || bid === dst) continue;
      if (segHitsBox(pts[i], pts[i + 1], b)) {
        console.log('  !! segment', i, 'crosses', bid);
        crossings++;
      }
    }
  }
}
console.log('\ntotal crossings:', crossings);
process.exit(0);
