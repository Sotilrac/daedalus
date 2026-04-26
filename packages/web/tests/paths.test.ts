import { describe, expect, it } from 'vitest';
import { dirOf, ensureExtension, folderBasename } from '../src/util/paths.js';

describe('folderBasename', () => {
  it('returns the last segment of a posix path', () => {
    expect(folderBasename('/home/carlos/projects/web')).toBe('web');
  });

  it('handles windows paths', () => {
    expect(folderBasename('C:\\projects\\web')).toBe('web');
  });

  it('falls back when no path is given', () => {
    expect(folderBasename(null)).toBe('diagram');
    expect(folderBasename('')).toBe('diagram');
  });
});

describe('ensureExtension', () => {
  it('adds the extension when missing', () => {
    expect(ensureExtension('out', 'svg')).toBe('out.svg');
    expect(ensureExtension('out.png', 'svg')).toBe('out.png.svg');
  });

  it('leaves the path alone when already present (case-insensitive)', () => {
    expect(ensureExtension('out.SVG', 'svg')).toBe('out.SVG');
  });
});

describe('dirOf', () => {
  it('returns the parent dir for posix paths', () => {
    expect(dirOf('/a/b/c.txt')).toBe('/a/b');
  });

  it('returns the parent dir for windows paths', () => {
    expect(dirOf('C:\\a\\b\\c.txt')).toBe('C:\\a\\b');
  });
});
