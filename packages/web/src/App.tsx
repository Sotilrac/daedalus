import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore.js';
import { useSourceStore } from './store/sourceStore.js';
import { TauriFolderSource, pickFolderViaTauri } from './sources/tauriFolderSource.js';
import { readAllD2 } from './sources/loadFolder.js';
import { Canvas } from './editor/Canvas.js';
import { ErrorOverlay } from './editor/ErrorOverlay.js';
import { SettingsPanel } from './editor/SettingsPanel.js';
import { normalizeD2Error } from '@daedalus/shared/d2';
import {
  emptySidecar,
  parseSidecar,
  serializeSidecar,
  setEntry,
  getEntry,
} from '@daedalus/shared/sidecar';
import { svgToBlob } from './export/svg.js';
import { svgToPngBlob } from './export/png.js';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

export function App(): JSX.Element {
  const source = useSourceStore((s) => s.source);
  const rootPath = useSourceStore((s) => s.rootPath);
  const entryPath = useSourceStore((s) => s.entryPath);
  const errors = useSourceStore((s) => s.errors);
  const setSource = useSourceStore((s) => s.setSource);
  const setFiles = useSourceStore((s) => s.setFiles);
  const setErrors = useSourceStore((s) => s.setErrors);
  const setLoading = useSourceStore((s) => s.setLoading);

  const layout = useGraphStore((s) => s.layout);
  const needsRelayout = useGraphStore((s) => s.needsRelayout);
  const setTheme = useGraphStore((s) => s.setTheme);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  // The most recent layout we wrote; used to skip the next persist if state
  // came back unchanged (e.g. just after a sidecar read).
  const lastPersistedRef = useRef<unknown>(null);

  // Load D2 files + sidecar, recompile, reconcile. Reads the latest model from
  // the store at call time so we don't keep regenerating the callback. The
  // first load for a given source auto-centres so the user immediately sees
  // the diagram in view; later loads (folder watcher events) leave the user's
  // pan untouched.
  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;

    const load = async (recenter: boolean) => {
      setLoading(true);
      try {
        const files = await readAllD2(source);
        if (cancelled) return;
        setFiles(files);
        const sidecarText = await source.readSidecar();
        if (cancelled) return;
        const sidecar = sidecarText ? parseSidecar(sidecarText) : emptySidecar();
        const prevLayout = getEntry(sidecar, entryPath) ?? null;
        const prevModel = useGraphStore.getState().model;
        await useGraphStore.getState().loadFromCompile({
          files,
          inputPath: entryPath,
          prevModel,
          prevLayout,
        });
        if (cancelled) return;
        setErrors([]);
        lastPersistedRef.current = useGraphStore.getState().layout;
        if (recenter) {
          requestAnimationFrame(() => {
            if (!cancelled) onCenterRef.current();
          });
        }
      } catch (err) {
        if (!cancelled) setErrors(normalizeD2Error(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);
    const off = source.subscribe((changes) => {
      if (changes.length === 0) return;
      void load(false);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [source, entryPath, setFiles, setErrors, setLoading]);

  // Debounced sidecar persist whenever the user changes layout in the editor.
  useEffect(() => {
    if (!source || !layout) return undefined;
    if (lastPersistedRef.current === layout) return undefined;
    const id = setTimeout(() => {
      void (async () => {
        try {
          const existing = await source.readSidecar();
          const sidecar = existing ? parseSidecar(existing) : emptySidecar();
          const next = setEntry(sidecar, entryPath, layout);
          await source.writeSidecar(serializeSidecar(next));
          lastPersistedRef.current = layout;
        } catch (err) {
          setErrors(normalizeD2Error(err));
        }
      })();
    }, 200);
    return () => clearTimeout(id);
  }, [layout, source, entryPath, setErrors]);

  const onPickFolder = useCallback(async () => {
    const folder = await pickFolderViaTauri();
    if (!folder) return;
    rememberFolder(folder);
    setSource(new TauriFolderSource(folder));
  }, [setSource]);

  // On first mount, restore the last opened folder if we have one. Errors
  // (deleted, renamed, no longer accessible) surface as a normal load error.
  useEffect(() => {
    const last = recallFolder();
    if (last) setSource(new TauriFolderSource(last));
    // Only run once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onExportSvg = useCallback(async () => {
    if (!svgRef.current || !layout) return;
    const defaultPath = exportDefaultPath(rootPath, 'svg');
    const dialogOpts: Parameters<typeof saveDialog>[0] = {
      filters: [{ name: 'SVG', extensions: ['svg'] }],
      defaultPath,
    };
    const path = await saveDialog(dialogOpts);
    if (!path) return;
    const finalPath = ensureExtension(path, 'svg');
    const blob = svgToBlob(svgRef.current, exportOpts(svgRef.current, layout));
    await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
    rememberExportDir(finalPath);
  }, [rootPath, layout]);

  const onCenter = useCallback(() => {
    const host = hostRef.current;
    const state = useGraphStore.getState();
    const currentLayout = state.layout;
    const routes = state.routes;
    if (!host || !currentLayout) return;

    // Compute the natural-coords bbox the same way Canvas does.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of Object.values(currentLayout.nodes)) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.w > maxX) maxX = n.x + n.w;
      if (n.y + n.h > maxY) maxY = n.y + n.h;
    }
    for (const route of Object.values(routes)) {
      for (const p of route) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX)) return;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const hw = host.clientWidth;
    const hh = host.clientHeight;

    // Per-axis: centre on a dimension if it fits, otherwise pad-align
    // top-left on that axis only.
    const pad = currentLayout.settings.export.margin;
    const nx = bw <= hw ? (hw - bw) / 2 - minX : pad - minX;
    const ny = bh <= hh ? (hh - bh) / 2 - minY : pad - minY;
    state.setViewOffset({ x: nx, y: ny });
    host.scrollTo({ left: 0, top: 0 });
  }, []);

  // Stable handle to the latest onCenter so the load effect can call it
  // without listing it as a dep (which would be stable anyway, but this keeps
  // intent explicit).
  const onCenterRef = useRef(onCenter);
  onCenterRef.current = onCenter;

  const onExportPng = useCallback(async () => {
    if (!svgRef.current || !layout) return;
    const defaultPath = exportDefaultPath(rootPath, 'png');
    const dialogOpts: Parameters<typeof saveDialog>[0] = {
      filters: [{ name: 'PNG', extensions: ['png'] }],
      defaultPath,
    };
    const path = await saveDialog(dialogOpts);
    if (!path) return;
    const finalPath = ensureExtension(path, 'png');
    const blob = await svgToPngBlob(svgRef.current, exportOpts(svgRef.current, layout), 2);
    await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
    rememberExportDir(finalPath);
  }, [rootPath, layout]);

  return (
    <div className="app" data-theme={layout?.viewport.theme ?? 'blueprint'}>
      <header className="toolbar">
        <span className="title">
          Daedalus <span className="version">v{__APP_VERSION__}</span>
        </span>
        <span className="path">{rootPath ?? 'no folder open'}</span>
        <span className="spacer" />
        {needsRelayout && <span style={{ color: 'var(--accent)' }}>Layout out of sync</span>}
        <button onClick={() => void onPickFolder()}>Open folder</button>
        <button
          onClick={() => {
            if (!source) return;
            void (async () => {
              setLoading(true);
              try {
                const files = await readAllD2(source);
                setFiles(files);
                // prev=null forces a fresh ELK pass; reconcile is skipped.
                await useGraphStore.getState().loadFromCompile({
                  files,
                  inputPath: entryPath,
                  prevModel: null,
                  prevLayout: null,
                });
                lastPersistedRef.current = null;
                setErrors([]);
              } catch (err) {
                setErrors(normalizeD2Error(err));
              } finally {
                setLoading(false);
              }
            })();
          }}
          disabled={!source}
        >
          Relayout
        </button>
        <button onClick={onCenter} disabled={!layout}>
          Center
        </button>
        <button
          onClick={() => setTheme(layout?.viewport.theme === 'paper' ? 'blueprint' : 'paper')}
          disabled={!layout}
        >
          Theme
        </button>
        <button onClick={() => void onExportSvg()} disabled={!layout}>
          Export SVG
        </button>
        <button onClick={() => void onExportPng()} disabled={!layout}>
          Export PNG
        </button>
        <span className="toolbar-wrap">
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            disabled={!layout}
            aria-pressed={settingsOpen}
          >
            Settings
          </button>
          {settingsOpen && <SettingsPanel />}
        </span>
      </header>
      <main className="canvas-host" ref={hostRef}>
        {!source && (
          <div className="empty-state">
            <h1>Daedalus</h1>
            <p>Open a folder of .d2 files to begin. Layout is saved alongside as .daedalus.json.</p>
            <button onClick={() => void onPickFolder()}>Open folder</button>
          </div>
        )}
        <ErrorOverlay errors={errors} />
        <Canvas
          ref={svgRef}
          hostRef={hostRef as unknown as React.RefObject<HTMLDivElement | null>}
        />
      </main>
    </div>
  );
}

import type { Layout } from '@daedalus/shared';
import type { ExportOptions } from './export/svg.js';

// Compute the export bbox from the live SVG so we capture edge routes (which
// can extend beyond node boxes when libavoid detours around obstacles) and
// label pills (whose width depends on the rendered text). `getBBox()` on the
// `.nodes`/`.edges` groups returns the axis-aligned union of their children.
function exportOpts(svg: SVGSVGElement, layout: Layout): ExportOptions {
  const margin = layout.settings.export.margin;
  const showGrid = layout.settings.export.showGrid;

  const groups = ['.containers', '.nodes', '.edges']
    .map((sel) => svg.querySelector<SVGGElement>(sel))
    .filter((g): g is SVGGElement => g !== null);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of groups) {
    const b = g.getBBox();
    if (b.width === 0 && b.height === 0) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  if (!Number.isFinite(minX)) {
    return {
      margin,
      showGrid,
      bbox: {
        x: 0,
        y: 0,
        w: layout.grid.cols * layout.grid.size,
        h: layout.grid.rows * layout.grid.size,
      },
    };
  }

  return { margin, showGrid, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

function folderBasename(path: string | null): string {
  if (!path) return 'diagram';
  const m = path.match(/[^/\\]+$/);
  return m?.[0] ?? 'diagram';
}

function ensureExtension(path: string, ext: string): string {
  return path.toLowerCase().endsWith(`.${ext}`) ? path : `${path}.${ext}`;
}

function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(0, idx) : path;
}

const EXPORT_DIR_KEY = 'daedalus.lastExportDir';
const LAST_FOLDER_KEY = 'daedalus.lastFolder';

function rememberFolder(path: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_FOLDER_KEY, path);
}

function recallFolder(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_FOLDER_KEY);
}

function exportDefaultPath(rootPath: string | null, ext: 'svg' | 'png'): string {
  const dir =
    (typeof localStorage !== 'undefined' && localStorage.getItem(EXPORT_DIR_KEY)) || rootPath || '';
  const name = `${folderBasename(rootPath)}.${ext}`;
  if (!dir) return name;
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir}${sep}${name}`;
}

function rememberExportDir(savedPath: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(EXPORT_DIR_KEY, dirOf(savedPath));
}
