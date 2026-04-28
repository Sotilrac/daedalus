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
  // The editor relies on `app.css` to set the default text size (12px on
  // `.node text`). That stylesheet doesn't travel with the export, so SVG/PNG
  // renderers fall back to 16px and labels look oversized. Bake the rules the
  // export depends on into a `<style>` block.
  const fontSans = computed.getPropertyValue('--font-sans').trim() || 'sans-serif';
  const fontMono = computed.getPropertyValue('--font-mono').trim() || 'monospace';
  const styleEl = target.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
  // Use `:where(...)` for the per-node text rule so it carries zero specificity
  // — inline `font-size` attributes (e.g. D2's `style.font-size: 60`) on the
  // <text> elements still win, while SVG/PNG renderers without our app.css
  // get a sane fallback for unsized text.
  styleEl.textContent = [
    tokens ? `svg { ${tokens} }` : '',
    `text { font-family: ${fontSans}; font-size: 12px; }`,
    `:where(.node) text { font-family: ${fontSans}; }`,
    `.size-label, .version, .toolbar { font-family: ${fontMono}; }`,
  ]
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

// Edge labels in the editor sit on a theme-coloured pill so they read against
// the paper backdrop. Exports always have a white background, so paint the
// pills white to match.
function whitenLabelBackgrounds(svg: SVGSVGElement): void {
  for (const el of svg.querySelectorAll<SVGRectElement>('.label-bg')) {
    el.setAttribute('fill', '#ffffff');
  }
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
  // can drop into any document or theme. Label pills still get whitened so
  // text stays legible if the consumer puts it on a coloured backdrop.
  whitenLabelBackgrounds(clone);
  inlineThemeTokens(svg, clone);
  stripEditorChrome(clone);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToBlob(svg: SVGSVGElement, opts: ExportOptions): Blob {
  const text = serializeSvg(svg, opts);
  return new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
}
