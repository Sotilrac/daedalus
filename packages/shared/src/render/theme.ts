import type { EdgeStyle, NodeStyle } from '../model/types.js';

export interface ThemePalette {
  paper: string;
  paperSunk: string;
  ink: string;
  inkMuted: string;
  accent: string;
  mark: string;
  positive: string;
  negative: string;
  gridDot: string;
}

// Default "slate" theme: a CAD / Blender-ish dark gray with a warm orange
// accent. Older sidecars used 'blueprint' as the id; sidecar/io migrates them
// to 'slate' on read.
export const slatePalette: ThemePalette = {
  paper: '#2b2b2b',
  paperSunk: '#1f1f1f',
  ink: '#dcdcdc',
  inkMuted: '#888888',
  accent: '#ffaa44',
  mark: '#ffaa44',
  positive: '#88c46c',
  negative: '#e07a6c',
  gridDot: '#555555',
};

export const paperPalette: ThemePalette = {
  paper: '#faf7f2',
  paperSunk: '#efeae0',
  ink: '#1a2238',
  inkMuted: '#5a6378',
  accent: '#c2410c',
  mark: '#c2410c',
  positive: '#3f6d4e',
  negative: '#8c3a2e',
  gridDot: '#a8b0bf',
};

export interface ResolvedNodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fontColor: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  opacity: number;
}

export interface ResolvedEdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fontColor: string;
  opacity: number;
}

// `fill: transparent` from D2 is interpreted by some renderers (notably the
// canvas-based PNG rasterizer) as "use the default fill", which is black.
// `fill: none` is unambiguous everywhere.
function normalizeFill(value: string): string {
  return value.trim().toLowerCase() === 'transparent' ? 'none' : value;
}

export function resolveNodeStyle(palette: ThemePalette, style: NodeStyle): ResolvedNodeStyle {
  const out: ResolvedNodeStyle = {
    fill: normalizeFill(style.fill ?? palette.paperSunk),
    stroke: style.stroke ?? palette.ink,
    strokeWidth: style.strokeWidth ?? 1,
    fontColor: style.fontColor ?? palette.ink,
    fontWeight: style.bold ? 600 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    opacity: style.opacity ?? 1,
  };
  if (style.strokeDash) out.strokeDasharray = `${style.strokeDash} ${style.strokeDash}`;
  return out;
}

export function resolveEdgeStyle(palette: ThemePalette, style: EdgeStyle): ResolvedEdgeStyle {
  const out: ResolvedEdgeStyle = {
    stroke: style.stroke ?? palette.ink,
    strokeWidth: style.strokeWidth ?? 1,
    fontColor: style.fontColor ?? palette.ink,
    opacity: style.opacity ?? 1,
  };
  if (style.strokeDash) out.strokeDasharray = `${style.strokeDash} ${style.strokeDash}`;
  return out;
}

export const themes = { slate: slatePalette, paper: paperPalette };
export type ThemeName = keyof typeof themes;
