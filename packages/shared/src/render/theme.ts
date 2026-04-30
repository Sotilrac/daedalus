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
  fontSize?: number; // px; only set when D2 specified one (else renderer default)
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

// Inks used when a node has a *custom* fill but no explicit `font-color`.
// Picking by fill luminance gives readable text whether the user's palette
// runs light (e.g. D2's default pastel classes) or dark — and crucially the
// choice doesn't shift when the user toggles between slate and paper.
const DARK_INK = '#1a2238';
const LIGHT_INK = '#f4f4f4';

// Relative luminance for a CSS hex (#rgb or #rrggbb). Returns 0..1, or null
// if the value isn't a hex we can parse — at which point we let the theme's
// ink apply as a safe default.
function luminanceOfHex(value: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m || !m[1]) return null;
  const hex = m[1];
  const expand =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function resolveNodeStyle(palette: ThemePalette, style: NodeStyle): ResolvedNodeStyle {
  const fill = normalizeFill(style.fill ?? palette.paperSunk);
  // When the user set their own fill, derive ink from its luminance so the
  // label stays readable against the custom backdrop and doesn't change when
  // the editor's theme flips. With no custom fill, fall back to the theme's
  // ink so default nodes blend into the surrounding paper as before.
  let resolvedFontColor: string;
  if (style.fontColor !== undefined) {
    resolvedFontColor = style.fontColor;
  } else if (style.fill !== undefined) {
    const lum = luminanceOfHex(fill);
    resolvedFontColor = lum === null ? palette.ink : lum > 0.5 ? DARK_INK : LIGHT_INK;
  } else {
    resolvedFontColor = palette.ink;
  }
  const out: ResolvedNodeStyle = {
    fill,
    stroke: style.stroke ?? palette.ink,
    strokeWidth: style.strokeWidth ?? 1,
    fontColor: resolvedFontColor,
    fontWeight: style.bold ? 600 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    opacity: style.opacity ?? 1,
  };
  if (style.strokeDash) out.strokeDasharray = `${style.strokeDash} ${style.strokeDash}`;
  if (typeof style.fontSize === 'number' && style.fontSize > 0) out.fontSize = style.fontSize;
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
