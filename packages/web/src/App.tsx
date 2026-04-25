import { useCallback, useEffect, useRef } from 'react';
import { useGraphStore } from './store/graphStore.js';
import { useSourceStore } from './store/sourceStore.js';
import { TauriFolderSource, pickFolderViaTauri } from './sources/tauriFolderSource.js';
import { readAllD2 } from './sources/loadFolder.js';
import { Canvas } from './editor/Canvas.js';
import { ErrorOverlay } from './editor/ErrorOverlay.js';
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

  const svgRef = useRef<SVGSVGElement | null>(null);
  // The most recent layout we wrote; used to skip the next persist if state
  // came back unchanged (e.g. just after a sidecar read).
  const lastPersistedRef = useRef<unknown>(null);

  // Load D2 files + sidecar, recompile, reconcile. Reads the latest model from
  // the store at call time so we don't keep regenerating the callback.
  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;

    const load = async () => {
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
        // Mark whatever the store now holds as already persisted; don't write
        // it back unless the user touches it.
        lastPersistedRef.current = useGraphStore.getState().layout;
      } catch (err) {
        if (!cancelled) setErrors(normalizeD2Error(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const off = source.subscribe((changes) => {
      if (changes.length === 0) return;
      void load();
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
    setSource(new TauriFolderSource(folder));
  }, [setSource]);

  const onExportSvg = useCallback(async () => {
    if (!svgRef.current) return;
    const defaultPath = exportDefaultPath(rootPath, 'svg');
    const dialogOpts: Parameters<typeof saveDialog>[0] = {
      filters: [{ name: 'SVG', extensions: ['svg'] }],
      defaultPath,
    };
    const path = await saveDialog(dialogOpts);
    if (!path) return;
    const finalPath = ensureExtension(path, 'svg');
    const blob = svgToBlob(svgRef.current);
    await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
    rememberExportDir(finalPath);
  }, [rootPath]);

  const onExportPng = useCallback(async () => {
    if (!svgRef.current) return;
    const defaultPath = exportDefaultPath(rootPath, 'png');
    const dialogOpts: Parameters<typeof saveDialog>[0] = {
      filters: [{ name: 'PNG', extensions: ['png'] }],
      defaultPath,
    };
    const path = await saveDialog(dialogOpts);
    if (!path) return;
    const finalPath = ensureExtension(path, 'png');
    const blob = await svgToPngBlob(svgRef.current, 2);
    await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
    rememberExportDir(finalPath);
  }, [rootPath]);

  return (
    <div className="app" data-theme={layout?.viewport.theme ?? 'blueprint'}>
      <header className="toolbar">
        <span className="title">Daedalus</span>
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
      </header>
      <main className="canvas-host">
        {!source && (
          <div className="empty-state">
            <h1>Daedalus</h1>
            <p>Open a folder of .d2 files to begin. Layout is saved alongside as .daedalus.json.</p>
            <button onClick={() => void onPickFolder()}>Open folder</button>
          </div>
        )}
        <ErrorOverlay errors={errors} />
        <CanvasWithRef setRef={(el) => (svgRef.current = el)} />
      </main>
    </div>
  );
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

function CanvasWithRef({
  setRef,
}: {
  setRef: (el: SVGSVGElement | null) => void;
}): JSX.Element | null {
  const plan = useGraphStore((s) => s.plan);
  if (!plan) return null;
  return (
    <div ref={(div) => setRef(div?.querySelector('svg') ?? null)}>
      <Canvas />
    </div>
  );
}
