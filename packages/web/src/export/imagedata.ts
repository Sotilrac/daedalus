import { rasterizeSvg } from './rasterize.js';
import type { ExportOptions } from './svg.js';

// Rasterise the diagram's SVG to RGBA pixels. Mirrors `svgToPngBlob` but
// stops one step earlier — the Tauri clipboard plugin wants raw RGBA + the
// image's pixel dimensions, not a PNG byte stream.
export async function svgToImageData(
  svg: SVGSVGElement,
  opts: ExportOptions,
  scale = 2,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const canvas = await rasterizeSvg(svg, opts, scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    rgba: new Uint8Array(data.data.buffer.slice(0)),
  };
}
