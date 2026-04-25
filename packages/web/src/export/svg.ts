export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

export function svgToBlob(svg: SVGSVGElement): Blob {
  const text = serializeSvg(svg);
  return new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
}
