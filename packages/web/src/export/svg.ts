// Tokens we use via `var(--*)` inside the SVG. Resolving these against the
// live document and inlining them as a `<style>` block makes the exported SVG
// stand alone without the host page's stylesheet.
const INLINE_TOKENS = [
  '--paper',
  '--paper-sunk',
  '--ink',
  '--ink-muted',
  '--accent',
  '--mark',
  '--positive',
  '--negative',
  '--grid-dot',
];

// Editor chrome that has no place in a static export.
const EDITOR_CHROME = [
  '.anchor',
  '.anchor-hit',
  '.selection-box',
  '.hit-halo',
  '.hover-ring',
  '.export-outline',
  '.resize-handle',
  '.size-hint',
];

export interface ExportOptions {
  // Margin in user-space units around the diagram bounding box.
  margin: number;
  // Whether the dot grid backdrop should remain in the exported file.
  showGrid: boolean;
  // Bounding box of the diagram content (typically all rendered nodes).
  bbox: { x: number; y: number; w: number; h: number };
}

function inlineThemeTokens(source: SVGSVGElement, target: SVGSVGElement): void {
  const computed = getComputedStyle(source);
  const tokens = INLINE_TOKENS.map((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value ? `${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join(' ');
  // Inline the font-family rule that lets `<text>` elements pick up the
  // sans-serif stack without needing app.css. Each text element already
  // carries its own inline `font-size` presentation attribute (12px node
  // labels, 11px edge labels, etc.), so we deliberately do *not* set a
  // global `text { font-size }` rule here — author CSS in the embedded
  // <style> block beats presentation attributes, and a global rule would
  // silently inflate edge labels to 12px in the exported file.
  const fontSans = computed.getPropertyValue('--font-sans').trim() || 'sans-serif';
  const styleEl = target.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = [tokens ? `svg { ${tokens} }` : '', `text { font-family: ${fontSans}; }`]
    .filter(Boolean)
    .join('\n');
  target.insertBefore(styleEl, target.firstChild);
}

function stripEditorChrome(svg: SVGSVGElement): void {
  for (const sel of EDITOR_CHROME) {
    for (const el of svg.querySelectorAll(sel)) el.remove();
  }
}

function stripGrid(svg: SVGSVGElement): void {
  for (const el of svg.querySelectorAll('.grid-bg')) el.remove();
}

function applyCrop(svg: SVGSVGElement, opts: ExportOptions): void {
  const { bbox, margin } = opts;
  const x = bbox.x - margin;
  const y = bbox.y - margin;
  const w = bbox.w + margin * 2;
  const h = bbox.h + margin * 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  // The grid background rect (if kept) was sized to the live canvas; resize
  // it to the cropped viewBox so it tiles properly.
  const grid = svg.querySelector<SVGRectElement>('.grid-bg');
  if (grid) {
    grid.setAttribute('x', String(x));
    grid.setAttribute('y', String(y));
    grid.setAttribute('width', String(w));
    grid.setAttribute('height', String(h));
  }
}

export function serializeSvg(svg: SVGSVGElement, opts: ExportOptions): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // The editor SVG has `style="background: <paper-color>"` for the paper tint
  // behind the dot grid. That carries through cloning and re-renders as a
  // solid backdrop in standalone exports. Strip it.
  clone.style.removeProperty('background');
  clone.style.removeProperty('background-color');
  if (!opts.showGrid) stripGrid(clone);
  applyCrop(clone, opts);
  // No canvas background: SVG and PNG both export transparent so the diagram
  // can drop into any document or theme. Edge labels punch a hole in the
  // line via an SVG mask, so there's no pill backdrop to whiten anymore.
  inlineThemeTokens(svg, clone);
  stripEditorChrome(clone);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToBlob(svg: SVGSVGElement, opts: ExportOptions): Blob {
  const text = serializeSvg(svg, opts);
  return new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
}
