import { serializeSvg, type ExportOptions } from './svg.js';

// Serialise the diagram's SVG and rasterise it onto a canvas at the given
// scale. Both PNG export and clipboard image export start from this canvas;
// they differ only in how they read pixels back out.
export async function rasterizeSvg(
  svg: SVGSVGElement,
  opts: ExportOptions,
  scale: number,
): Promise<HTMLCanvasElement> {
  const text = serializeSvg(svg, opts);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG for rasterisation'));
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
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
