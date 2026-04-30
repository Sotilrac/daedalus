import { describe, expect, it } from 'vitest';
import {
  resolveEdgeStyle,
  resolveNodeStyle,
  slatePalette,
  paperPalette,
  themes,
} from '../src/render/theme.js';

describe('resolveNodeStyle', () => {
  it('falls back to palette defaults for unset fields', () => {
    const r = resolveNodeStyle(slatePalette, {});
    expect(r.fill).toBe(slatePalette.paperSunk);
    expect(r.stroke).toBe(slatePalette.ink);
    expect(r.fontColor).toBe(slatePalette.ink);
    expect(r.strokeWidth).toBe(1);
    expect(r.opacity).toBe(1);
    expect(r.fontWeight).toBe(400);
    expect(r.fontStyle).toBe('normal');
  });

  it('preserves explicit fill when set', () => {
    expect(resolveNodeStyle(slatePalette, { fill: '#fff' }).fill).toBe('#fff');
  });

  it('rewrites `transparent` to `none` so canvas rasteriser keeps it empty', () => {
    expect(resolveNodeStyle(slatePalette, { fill: 'transparent' }).fill).toBe('none');
    expect(resolveNodeStyle(slatePalette, { fill: 'TRANSPARENT' }).fill).toBe('none');
  });

  it('emits matched dasharray for strokeDash', () => {
    expect(resolveNodeStyle(slatePalette, { strokeDash: 4 }).strokeDasharray).toBe('4 4');
  });

  it('does not emit dasharray when strokeDash is missing or zero', () => {
    expect(resolveNodeStyle(slatePalette, {}).strokeDasharray).toBeUndefined();
    expect(resolveNodeStyle(slatePalette, { strokeDash: 0 }).strokeDasharray).toBeUndefined();
  });

  it('flips bold/italic into fontWeight/fontStyle', () => {
    const r = resolveNodeStyle(slatePalette, { bold: true, italic: true });
    expect(r.fontWeight).toBe(600);
    expect(r.fontStyle).toBe('italic');
  });

  it('keeps an explicit fontColor regardless of theme', () => {
    expect(resolveNodeStyle(slatePalette, { fontColor: '#1e40af' }).fontColor).toBe('#1e40af');
    expect(resolveNodeStyle(paperPalette, { fontColor: '#1e40af' }).fontColor).toBe('#1e40af');
  });

  it('derives a dark ink for custom light fills (theme-independent)', () => {
    const slate = resolveNodeStyle(slatePalette, { fill: '#dbeafe' }).fontColor;
    const paper = resolveNodeStyle(paperPalette, { fill: '#dbeafe' }).fontColor;
    expect(slate).toBe(paper);
    expect(slate).not.toBe(slatePalette.ink);
  });

  it('derives a light ink for custom dark fills', () => {
    const slate = resolveNodeStyle(slatePalette, { fill: '#1f1f1f' }).fontColor;
    const paper = resolveNodeStyle(paperPalette, { fill: '#1f1f1f' }).fontColor;
    expect(slate).toBe(paper);
    expect(slate).not.toBe(paperPalette.ink);
  });

  it('still falls back to palette ink when no custom fill is set', () => {
    expect(resolveNodeStyle(slatePalette, {}).fontColor).toBe(slatePalette.ink);
    expect(resolveNodeStyle(paperPalette, {}).fontColor).toBe(paperPalette.ink);
  });

  it('accepts 3-digit hex fills for luminance-based ink', () => {
    // #fff is light → dark ink; #000 is dark → light ink.
    expect(resolveNodeStyle(slatePalette, { fill: '#fff' }).fontColor).toBe(
      resolveNodeStyle(paperPalette, { fill: '#fff' }).fontColor,
    );
    expect(resolveNodeStyle(slatePalette, { fill: '#fff' }).fontColor).not.toBe(slatePalette.ink);
    expect(resolveNodeStyle(slatePalette, { fill: '#000' }).fontColor).not.toBe(paperPalette.ink);
  });

  it('falls back to palette ink for non-hex fills (named colors, rgb(), etc.)', () => {
    // We only contrast-pick when the fill is a hex literal we can parse.
    // Anything else (e.g. an rgb() or a named color) keeps the prior
    // palette-ink behavior so we don't accidentally choose the wrong colour.
    expect(resolveNodeStyle(slatePalette, { fill: 'rgb(0,0,0)' }).fontColor).toBe(slatePalette.ink);
    expect(resolveNodeStyle(slatePalette, { fill: 'cornflowerblue' }).fontColor).toBe(
      slatePalette.ink,
    );
    expect(resolveNodeStyle(slatePalette, { fill: '#zzz' }).fontColor).toBe(slatePalette.ink);
    // `none` also fails the hex check.
    expect(resolveNodeStyle(slatePalette, { fill: 'none' }).fontColor).toBe(slatePalette.ink);
  });
});

describe('resolveEdgeStyle with custom fields', () => {
  it('preserves an explicit edge fontColor', () => {
    expect(resolveEdgeStyle(slatePalette, { fontColor: '#ff00aa' }).fontColor).toBe('#ff00aa');
    expect(resolveEdgeStyle(paperPalette, { fontColor: '#ff00aa' }).fontColor).toBe('#ff00aa');
  });

  it('preserves an explicit edge stroke', () => {
    expect(resolveEdgeStyle(slatePalette, { stroke: '#123456' }).stroke).toBe('#123456');
  });

  it('uses the supplied opacity when present', () => {
    expect(resolveEdgeStyle(slatePalette, { opacity: 0.5 }).opacity).toBe(0.5);
  });

  it('does not emit dasharray for missing or zero strokeDash', () => {
    expect(resolveEdgeStyle(slatePalette, {}).strokeDasharray).toBeUndefined();
    expect(resolveEdgeStyle(slatePalette, { strokeDash: 0 }).strokeDasharray).toBeUndefined();
  });
});

describe('resolveEdgeStyle', () => {
  it('falls back to palette ink for stroke and fontColor', () => {
    const r = resolveEdgeStyle(paperPalette, {});
    expect(r.stroke).toBe(paperPalette.ink);
    expect(r.fontColor).toBe(paperPalette.ink);
  });

  it('emits matched dasharray for strokeDash', () => {
    expect(resolveEdgeStyle(paperPalette, { strokeDash: 6 }).strokeDasharray).toBe('6 6');
  });
});

describe('themes registry', () => {
  it('has slate and paper entries', () => {
    expect(themes.slate).toBe(slatePalette);
    expect(themes.paper).toBe(paperPalette);
  });
});
