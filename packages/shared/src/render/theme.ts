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

export const blueprintPalette: ThemePalette = {
  paper: '#0d3b66',
  paperSunk: '#0a2f54',
  ink: '#f4f1de',
  inkMuted: '#7aa6cd',
  accent: '#fec601',
  mark: '#fec601',
  positive: '#a3d9b1',
  negative: '#ef8b6f',
  gridDot: '#7aa6cd',
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

export function resolveNodeStyle(palette: ThemePalette, style: NodeStyle): ResolvedNodeStyle {
  const out: ResolvedNodeStyle = {
    fill: style.fill ?? palette.paperSunk,
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

export const themes = { blueprint: blueprintPalette, paper: paperPalette };
export type ThemeName = keyof typeof themes;
