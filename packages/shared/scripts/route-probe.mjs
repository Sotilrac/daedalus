import { AvoidLib } from 'libavoid-js';

await AvoidLib.load();
const Avoid = AvoidLib.getInstance();

console.log('OrthogonalRouting =', Avoid.OrthogonalRouting);
console.log('shapeBufferDistance =', Avoid.shapeBufferDistance);
console.log('idealNudgingDistance =', Avoid.idealNudgingDistance);
console.log('segmentPenalty =', Avoid.segmentPenalty);
console.log('crossingPenalty =', Avoid.crossingPenalty);
console.log('portDirectionPenalty =', Avoid.portDirectionPenalty);
console.log(
  'nudgeOrthogonalSegmentsConnectedToShapes =',
  Avoid.nudgeOrthogonalSegmentsConnectedToShapes,
);
console.log('improveOrthogonalTopology =', Avoid.improveOrthogonalTopology);

// Tiny scene: shape A and shape B with a shape C between them; route should bend.
const router = new Avoid.Router(Avoid.OrthogonalRouting);
router.setRoutingParameter(Avoid.shapeBufferDistance, 12);
router.setRoutingParameter(Avoid.idealNudgingDistance, 16);
router.setRoutingOption(Avoid.improveOrthogonalTopology, true);

const mkRect = (x, y, w, h) =>
  new Avoid.Rectangle(new Avoid.Point(x, y), new Avoid.Point(x + w, y + h));
new Avoid.ShapeRef(router, mkRect(0, 0, 100, 50)); // A
new Avoid.ShapeRef(router, mkRect(300, 0, 100, 50)); // B
new Avoid.ShapeRef(router, mkRect(150, -25, 100, 100)); // C between

const src = new Avoid.ConnEnd(new Avoid.Point(112, 25)); // 12px outside A right
const dst = new Avoid.ConnEnd(new Avoid.Point(288, 25)); // 12px outside B left
const conn = new Avoid.ConnRef(router, src, dst);
router.processTransaction();

const poly = conn.displayRoute();
console.log('route len =', poly.size());
for (let i = 0; i < poly.size(); i++) {
  const p = poly.get_ps(i);
  console.log('  ', p.x, p.y);
}
process.exit(0);
