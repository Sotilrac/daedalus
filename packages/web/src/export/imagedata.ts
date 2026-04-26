import { serializeSvg, type ExportOptions } from './svg.js';

// Rasterise the diagram's SVG to RGBA pixels. Mirrors `svgToPngBlob` but
// stops one step earlier — the Tauri clipboard plugin wants raw RGBA + the
// image's pixel dimensions, not a PNG byte stream.
export async function svgToImageData(
  svg: SVGSVGElement,
  opts: ExportOptions,
  scale = 2,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const text = serializeSvg(svg, opts);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG for image export'));
      img.src = url;
    });
    const w = opts.bbox.w + opts.margin * 2;
    const h = opts.bbox.h + opts.margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: new Uint8Array(data.data.buffer.slice(0)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
