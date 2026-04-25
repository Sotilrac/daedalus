import { D2 } from '@terrastruct/d2';
import { readFileSync } from 'node:fs';

const d2 = new D2();
const indexD2 = readFileSync('../../example/index.d2', 'utf8');
const nodesD2 = readFileSync('../../example/nodes.d2', 'utf8');

const result = await d2.compile({
  fs: { 'index.d2': indexD2, 'nodes.d2': nodesD2 },
  inputPath: 'index.d2',
  options: { layout: 'elk' },
});

console.log('=== shapes ===');
for (const s of result.diagram.shapes) {
  console.log(s.id, 'type=', s.type, 'pos=', s.pos, 'w/h=', s.width, s.height);
}
console.log('\n=== first connection ===');
const c = result.diagram.connections[0];
if (c) {
  console.log('src=', c.src, 'dst=', c.dst, 'route len=', c.route?.length);
  console.log('first route point:', c.route?.[0]);
  console.log('last route point:', c.route?.[c.route.length - 1]);
}
process.exit(0);
