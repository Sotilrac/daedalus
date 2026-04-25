import { useCallback, useEffect, useRef } from 'react';
import { useGraphStore } from './store/graphStore.js';
import { useSourceStore } from './store/sourceStore.js';
import { TauriFolderSource, pickFolderViaTauri } from './sources/tauriFolderSource.js';
import { readAllD2 } from './sources/loadFolder.js';
import { Canvas } from './editor/Canvas.js';
import { ErrorOverlay } from './editor/ErrorOverlay.js';
import { normalizeD2Error } from '@daedalus/shared/d2';
import { emptySidecar, parseSidecar, serializeSidecar, setEntry, getEntry } from '@daedalus/shared/sidecar';
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
  const model = useGraphStore((s) => s.model);
  const needsRelayout = useGraphStore((s) => s.needsRelayout);
  const setTheme = useGraphStore((s) => s.setTheme);
  const loadFromCompile = useGraphStore((s) => s.loadFromCompile);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const reload = useCallback(async () => {
    if (!source) return;
    setLoading(true);
    try {
      const files = await readAllD2(source);
      setFiles(files);
      const sidecarText = await source.readSidecar();
      const sidecar = sidecarText ? parseSidecar(sidecarText) : emptySidecar();
      const prevLayout = getEntry(sidecar, entryPath) ?? null;
      await loadFromCompile({
        files,
        inputPath: entryPath,
        prevModel: model,
        prevLayout,
      });
      setErrors([]);
      const next = useGraphStore.getState().layout;
      if (next) {
        const updated = setEntry(sidecar, entryPath, next);
        await source.writeSidecar(serializeSidecar(updated));
      }
    } catch (err) {
      setErrors(normalizeD2Error(err));
    } finally {
      setLoading(false);
    }
  }, [source, entryPath, setFiles, setErrors, setLoading, loadFromCompile, model]);

  useEffect(() => {
    if (!source) return;
    void reload();
    const off = source.subscribe(() => {
      void reload();
    });
    return off;
  }, [source, reload]);

  const onPickFolder = useCallback(async () => {
    const folder = await pickFolderViaTauri();
    if (!folder) return;
    setSource(new TauriFolderSource(folder));
  }, [setSource]);

  const onExportSvg = useCallback(async () => {
    if (!svgRef.current) return;
    const path = await saveDialog({ filters: [{ name: 'SVG', extensions: ['svg'] }] });
    if (!path) return;
    const blob = svgToBlob(svgRef.current);
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  }, []);

  const onExportPng = useCallback(async () => {
    if (!svgRef.current) return;
    const path = await saveDialog({ filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return;
    const blob = await svgToPngBlob(svgRef.current, 2);
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  }, []);

  return (
    <div className="app" data-theme={layout?.viewport.theme ?? 'blueprint'}>
      <header className="toolbar">
        <span className="title">Daedalus</span>
        <span className="path">{rootPath ?? 'no folder open'}</span>
        <span className="spacer" />
        {needsRelayout && <span style={{ color: 'var(--accent)' }}>Layout out of sync</span>}
        <button onClick={() => void onPickFolder()}>Open folder</button>
        <button onClick={() => void reload()} disabled={!source}>
          Relayout
        </button>
        <button onClick={() => setTheme(layout?.viewport.theme === 'paper' ? 'blueprint' : 'paper')} disabled={!layout}>
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

function CanvasWithRef({ setRef }: { setRef: (el: SVGSVGElement | null) => void }): JSX.Element | null {
  const plan = useGraphStore((s) => s.plan);
  if (!plan) return null;
  return (
    <div ref={(div) => setRef(div?.querySelector('svg') ?? null)}>
      <Canvas />
    </div>
  );
}
