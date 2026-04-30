import { describe, expect, it } from 'vitest';
import { serializeSvg } from '../src/export/svg.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Build a representative editor-shaped SVG: viewport rect + grid bg + a
// node group with editor chrome + an edge with the label-mask pattern. The
// serializer is the unit under test; we don't render this anywhere.
function buildFixture(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('width', '800');
  svg.setAttribute('height', '600');
  svg.style.background = '#2b2b2b';

  const grid = document.createElementNS(SVG_NS, 'rect');
  grid.setAttribute('class', 'grid-bg');
  grid.setAttribute('x', '0');
  grid.setAttribute('y', '0');
  grid.setAttribute('width', '800');
  grid.setAttribute('height', '600');
  svg.appendChild(grid);

  // Node with editor-only siblings the export should drop.
  const nodeGroup = document.createElementNS(SVG_NS, 'g');
  nodeGroup.setAttribute('class', 'nodes');
  const node = document.createElementNS(SVG_NS, 'g');
  node.setAttribute('class', 'node');
  const halo = document.createElementNS(SVG_NS, 'rect');
  halo.setAttribute('class', 'hit-halo');
  node.appendChild(halo);
  const ring = document.createElementNS(SVG_NS, 'rect');
  ring.setAttribute('class', 'hover-ring');
  node.appendChild(ring);
  const handle = document.createElementNS(SVG_NS, 'rect');
  handle.setAttribute('class', 'resize-handle');
  node.appendChild(handle);
  const sel = document.createElementNS(SVG_NS, 'rect');
  sel.setAttribute('class', 'selection-box');
  node.appendChild(sel);
  const sizeHint = document.createElementNS(SVG_NS, 'text');
  sizeHint.setAttribute('class', 'size-hint');
  sizeHint.textContent = '128 x 64';
  node.appendChild(sizeHint);
  // Real label inside the node: must survive the strip pass.
  const nodeLabel = document.createElementNS(SVG_NS, 'text');
  nodeLabel.setAttribute('font-size', '12');
  nodeLabel.textContent = 'API';
  node.appendChild(nodeLabel);
  nodeGroup.appendChild(node);
  svg.appendChild(nodeGroup);

  // Anchors group (editor chrome) — entirely removed by the export.
  const anchors = document.createElementNS(SVG_NS, 'g');
  const anchor = document.createElementNS(SVG_NS, 'circle');
  anchor.setAttribute('class', 'anchor');
  anchors.appendChild(anchor);
  svg.appendChild(anchors);

  // Edge group with mask + label (mirrors EdgeView's output).
  const edgeGroup = document.createElementNS(SVG_NS, 'g');
  edgeGroup.setAttribute('class', 'edge');
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', 'edge-label-mask-a__b_0');
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '-1000000');
  mask.setAttribute('y', '-1000000');
  mask.setAttribute('width', '2000000');
  mask.setAttribute('height', '2000000');
  edgeGroup.appendChild(mask);
  const edgePath = document.createElementNS(SVG_NS, 'path');
  edgePath.setAttribute('d', 'M 0 0 L 200 0');
  edgePath.setAttribute('mask', 'url(#edge-label-mask-a__b_0)');
  edgeGroup.appendChild(edgePath);
  const edgeLabel = document.createElementNS(SVG_NS, 'text');
  edgeLabel.setAttribute('font-size', '11');
  edgeLabel.textContent = 'query';
  edgeGroup.appendChild(edgeLabel);
  svg.appendChild(edgeGroup);

  document.body.appendChild(svg);
  return svg;
}

describe('serializeSvg', () => {
  const opts = {
    margin: 16,
    showGrid: false,
    bbox: { x: 100, y: 50, w: 400, h: 300 },
  };

  it('crops to bbox + margin and sets matching width/height', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    // bbox(100,50,400,300) + margin 16 ⇒ viewBox "84 34 432 332".
    expect(out).toContain('viewBox="84 34 432 332"');
    expect(out).toContain('width="432"');
    expect(out).toContain('height="332"');
    svg.remove();
  });

  it('strips editor chrome but keeps node labels and edge paths', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    expect(out).not.toContain('class="hit-halo"');
    expect(out).not.toContain('class="hover-ring"');
    expect(out).not.toContain('class="resize-handle"');
    expect(out).not.toContain('class="selection-box"');
    expect(out).not.toContain('class="size-hint"');
    expect(out).not.toContain('class="anchor"');
    // Real content remains.
    expect(out).toContain('>API<');
    expect(out).toContain('>query<');
    expect(out).toContain('M 0 0 L 200 0');
    svg.remove();
  });

  it('drops the grid backdrop when showGrid is false', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, { ...opts, showGrid: false });
    expect(out).not.toContain('class="grid-bg"');
    svg.remove();
  });

  it('keeps and crops the grid backdrop when showGrid is true', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, { ...opts, showGrid: true });
    expect(out).toContain('class="grid-bg"');
    // Grid rect is resized to match the cropped viewBox (84,34,432,332).
    expect(out).toMatch(/class="grid-bg"[^>]*x="84"/);
    expect(out).toMatch(/class="grid-bg"[^>]*y="34"/);
    expect(out).toMatch(/class="grid-bg"[^>]*width="432"/);
    expect(out).toMatch(/class="grid-bg"[^>]*height="332"/);
    svg.remove();
  });

  it('strips inline background from the root <svg>', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    // The fixture sets `style="background: #2b2b2b"`. Either the style attr
    // is gone or background is no longer in it.
    expect(out).not.toMatch(/style="[^"]*background:[^"]*#2b2b2b/);
    svg.remove();
  });

  it('does NOT inject a global `text { font-size }` rule', () => {
    // Regression: a previous version embedded `text { font-size: 12px }`,
    // which silently overrode inline `font-size="11"` on edge labels and
    // inflated them in the exported file. The serializer must only inline
    // font-family + theme tokens.
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    expect(out).not.toMatch(/text\s*\{[^}]*font-size/);
  });

  it('preserves inline font-size attributes on text elements', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    expect(out).toMatch(/font-size="12"[^>]*>API/);
    expect(out).toMatch(/font-size="11"[^>]*>query/);
    svg.remove();
  });

  it('keeps the edge-label mask intact with an explicit user-space region', () => {
    // Regression: a previous version omitted the mask's own x/y/width/height,
    // which defaulted to roughly the masked path's bbox and clipped long
    // edges. The exported SVG must carry the explicit huge region.
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    expect(out).toContain('id="edge-label-mask-a__b_0"');
    expect(out).toContain('maskUnits="userSpaceOnUse"');
    expect(out).toMatch(/<mask[^>]+x="-1000000"/);
    expect(out).toMatch(/<mask[^>]+width="2000000"/);
    expect(out).toContain('mask="url(#edge-label-mask-a__b_0)"');
    svg.remove();
  });

  it('inlines the xmlns so the file stands alone', () => {
    const svg = buildFixture();
    const out = serializeSvg(svg, opts);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    svg.remove();
  });
});
