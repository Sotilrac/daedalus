import { serializeSvg } from './svg.js';

export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const text = serializeSvg(svg);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
      img.src = url;
    });
    const w = svg.viewBox.baseVal.width || svg.clientWidth;
    const h = svg.viewBox.baseVal.height || svg.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
