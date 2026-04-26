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
