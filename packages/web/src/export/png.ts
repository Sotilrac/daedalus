import { rasterizeSvg } from './rasterize.js';
import type { ExportOptions } from './svg.js';

export async function svgToPngBlob(
  svg: SVGSVGElement,
  opts: ExportOptions,
  scale = 2,
): Promise<Blob> {
  const canvas = await rasterizeSvg(svg, opts, scale);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/png',
    );
  });
}
