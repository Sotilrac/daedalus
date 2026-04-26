// Path helpers for the export flow. Tauri returns OS-native paths (mixed
// separators on Windows), so these stay string-only and handle both `/` and
// `\` rather than reaching for a Node `path` polyfill.

const EXPORT_DIR_KEY = 'daedalus.lastExportDir';

export function folderBasename(path: string | null): string {
  if (!path) return 'diagram';
  const m = path.match(/[^/\\]+$/);
  return m?.[0] ?? 'diagram';
}

export function ensureExtension(path: string, ext: string): string {
  return path.toLowerCase().endsWith(`.${ext}`) ? path : `${path}.${ext}`;
}

export function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(0, idx) : path;
}

export function exportDefaultPath(rootPath: string | null, ext: 'svg' | 'png'): string {
  const dir =
    (typeof localStorage !== 'undefined' && localStorage.getItem(EXPORT_DIR_KEY)) || rootPath || '';
  const name = `${folderBasename(rootPath)}.${ext}`;
  if (!dir) return name;
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir}${sep}${name}`;
}

export function rememberExportDir(savedPath: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(EXPORT_DIR_KEY, dirOf(savedPath));
}
