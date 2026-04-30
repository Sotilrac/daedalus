import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore.js';
import { useSourceStore } from './store/sourceStore.js';
import { TauriFolderSource, pickFolderViaTauri } from './sources/tauriFolderSource.js';
import { readAllD2 } from './sources/loadFolder.js';
import { Canvas } from './editor/Canvas.js';
import { ErrorOverlay } from './editor/ErrorOverlay.js';
import { PngExportDialog } from './editor/PngExportDialog.js';
import { SettingsPanel } from './editor/SettingsPanel.js';
import { WelcomeCard } from './editor/WelcomeCard.js';
import {
  AlignHorizontalIcon,
  AlignVerticalIcon,
  CenterIcon,
  CompareIcon,
  CopyIcon,
  ExportPngIcon,
  ExportSvgIcon,
  FitContainerIcon,
  FolderOpenIcon,
  MatchSizeIcon,
  NewProjectIcon,
  RedoIcon,
  ReloadIcon,
  RelayoutIcon,
  SettingsIcon,
  UndoIcon,
} from './editor/icons.js';
import { isContainer, naturalBBox } from '@daedalus/shared';
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
import { svgToImageData } from './export/imagedata.js';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeImage as clipboardWriteImage } from '@tauri-apps/plugin-clipboard-manager';
import {
  ALLOW_CTX_KEY,
  AUTO_RELOAD_KEY,
  forgetFolder,
  recallFolder,
  rememberFolder,
  SHOW_ANCHORS_KEY,
  SHOW_GRID_KEY,
  THEME_KEY,
  useStoredEnum,
  useStoredFlag,
} from './prefs.js';
import { DISPLAY_NAME, VERSION_LABEL } from './branding.js';
import { SAMPLE_D2 } from './sample.js';
import { onExternalLink } from './util/openExternal.js';
import { ensureExtension, exportDefaultPath, rememberExportDir } from './util/paths.js';
import { UpdateIndicator } from './util/UpdateIndicator.js';
import { useUpdaterStore } from './util/updater.js';

const RELEASES_URL = 'https://github.com/Sotilrac/daedalus/releases';

// Detect macOS at module load. Tauri's webview reports a real user-agent so
// this matches the underlying OS (Mac → ⌘ shortcuts, Windows/Linux → Ctrl).
// Both physical keys still trigger the matcher (`metaKey || ctrlKey`); only
// the label shown in tooltips is platform-specific.
const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
const MOD = IS_MAC ? 'Cmd' : 'Ctrl';

// Single source of truth for keyboard shortcut labels, used in the toolbar
// tooltips. The keydown matcher below uses raw key codes so the actual
// modifier is platform-correct on each OS.
const KB = {
  newProject: `${MOD}+N`,
  openFolder: `${MOD}+O`,
  reload: `${MOD}+R`,
  undo: `${MOD}+Z`,
  redo: `${MOD}+Shift+Z`,
  center: `${MOD}+0`,
  toggleEngine: `${MOD}+E`,
  relayout: `${MOD}+Shift+L`,
  alignX: `${MOD}+Shift+X`,
  alignY: `${MOD}+Shift+Y`,
  matchSize: `${MOD}+Shift+M`,
  fitContainer: `${MOD}+Shift+F`,
  copyPng: `${MOD}+Shift+C`,
  exportSvg: `${MOD}+Shift+S`,
  exportPng: `${MOD}+Shift+P`,
} as const;

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
  const setStoreTheme = useGraphStore((s) => s.setTheme);
  const showingAuto = useGraphStore((s) => s.showingAuto);
  const autoLayout = useGraphStore((s) => s.autoLayout);
  const toggleAutoLayout = useGraphStore((s) => s.toggleAutoLayout);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const selectionCount = useGraphStore((s) => s.selection.length);
  const firstSelected = useGraphStore((s) => s.selection[0]);
  // Subscribe to the model object reference (stable across non-reload renders)
  // and derive the id list with useMemo. Returning a fresh `Object.keys(...)`
  // straight from a Zustand selector trips React's "snapshot should be cached"
  // check and loops the tree.
  const model = useGraphStore((s) => s.model);
  const modelNodeIds = useMemo(() => (model ? Object.keys(model.nodes) : null), [model]);
  const alignCenters = useGraphStore((s) => s.alignCenters);
  const matchSize = useGraphStore((s) => s.matchSize);
  const fitContainer = useGraphStore((s) => s.fitContainer);
  const canAlign = selectionCount >= 2 && !showingAuto;
  const selectedIsContainer =
    selectionCount === 1 &&
    !!firstSelected &&
    !!modelNodeIds &&
    isContainer(modelNodeIds, firstSelected);
  const canFitContainer = selectedIsContainer && !showingAuto;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pngDialogOpen, setPngDialogOpen] = useState(false);
  // Re-opens the welcome card on top of an open project (the home page renders
  // it unconditionally). Toggled by clicking the bottom-left brand; dismissed
  // by clicking outside the card or pressing Escape.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [autoReload, setAutoReload] = useStoredFlag(AUTO_RELOAD_KEY, true);
  const [allowContextMenu, setAllowContextMenu] = useStoredFlag(ALLOW_CTX_KEY, false);
  const [showGrid, setShowGrid] = useStoredFlag(SHOW_GRID_KEY, true);
  const [showAnchors, setShowAnchors] = useStoredFlag(SHOW_ANCHORS_KEY, true);
  // Theme is a user-level preference (persisted via localStorage), not a
  // per-project property — that way it can be changed on the empty/home
  // page where there's no layout to mutate. When a project is loaded we
  // sync the user's pref into `layout.viewport.theme` so the sidecar stays
  // consistent for backwards compatibility.
  const [theme, setThemeState] = useStoredEnum<'slate' | 'paper'>(THEME_KEY, 'slate', [
    'slate',
    'paper',
  ]);
  const setTheme = useCallback(
    (t: 'slate' | 'paper') => {
      setThemeState(t);
      setStoreTheme(t);
    },
    [setStoreTheme, setThemeState],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  // Wraps the Settings button + popout panel so an outside click can close
  // the panel without dismissing it when the user interacts inside it.
  const settingsWrapRef = useRef<HTMLSpanElement | null>(null);
  // Same wrap pattern for the PNG export popout: the dialog must close on
  // outside-click without dismissing when the user is interacting with it.
  const pngWrapRef = useRef<HTMLSpanElement | null>(null);
  // Outside-click detection for the welcome overlay: clicks on the brand
  // (which toggles it) or inside the card itself shouldn't dismiss.
  const welcomeCardRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  // The most recent layout we wrote; used to skip the next persist if state
  // came back unchanged (e.g. just after a sidecar read).
  const lastPersistedRef = useRef<unknown>(null);
  // Read by the watcher callback so toggling auto-reload doesn't rip the
  // subscription down and back up.
  const autoReloadRef = useRef(autoReload);
  autoReloadRef.current = autoReload;
  // Generation counter for in-flight loads; an older load that completes
  // after a newer one started is dropped on the floor.
  const loadGenRef = useRef(0);
  // Forward ref to onCenter; used by reload before onCenter is defined.
  const onCenterRef = useRef<() => void>(() => undefined);

  // Dismiss the settings popout on outside-click or Escape. Only attached
  // while the panel is open so the listener doesn't sit on document for
  // the lifetime of the app.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onPointer = (e: MouseEvent): void => {
      const wrap = settingsWrapRef.current;
      if (!wrap) return;
      if (e.target instanceof Node && wrap.contains(e.target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  // Dismiss the PNG export popout on outside-click or Escape.
  useEffect(() => {
    if (!pngDialogOpen) return undefined;
    const onPointer = (e: MouseEvent): void => {
      const wrap = pngWrapRef.current;
      if (!wrap) return;
      if (e.target instanceof Node && wrap.contains(e.target)) return;
      setPngDialogOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPngDialogOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pngDialogOpen]);

  // Same dismiss-on-outside pattern for the welcome overlay (project-open
  // case). The home-page welcome card has no source loaded and is always
  // visible, so the listener only attaches when the overlay is in use.
  useEffect(() => {
    if (!source || !welcomeOpen) return undefined;
    const onPointer = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (welcomeCardRef.current?.contains(target)) return;
      if (brandRef.current?.contains(target)) return;
      setWelcomeOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setWelcomeOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [source, welcomeOpen]);

  // Closing a project also dismisses any open welcome overlay so the home
  // page renders a single welcome card instead of stacking two.
  useEffect(() => {
    if (!source && welcomeOpen) setWelcomeOpen(false);
  }, [source, welcomeOpen]);

  // Kick off a single update check on mount. The store guards against
  // overlapping checks, so re-renders here are harmless. We do not block UI
  // on the result; the indicator appears asynchronously when one's found.
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  // Whenever a project loads (layout transitions from null → some), force
  // the sidecar's theme to match the user's current preference. The user
  // pref is the source of truth; this just keeps the persisted layout in
  // sync so we don't write back stale values on the next save.
  useEffect(() => {
    if (!layout) return;
    if (layout.viewport.theme === theme) return;
    setStoreTheme(theme);
  }, [layout, theme, setStoreTheme]);

  // Load D2 files + sidecar, recompile, reconcile. Reads the latest model
  // from the store at call time. Returned promise resolves once the load
  // settles; callers interested in cancellation use the generation counter.
  const reload = useCallback(
    async (opts: { recenter: boolean }) => {
      if (!source) return;
      const gen = ++loadGenRef.current;
      const live = (): boolean => gen === loadGenRef.current;
      setLoading(true);
      try {
        const files = await readAllD2(source);
        if (!live()) return;
        setFiles(files);
        const sidecarText = await source.readSidecar();
        if (!live()) return;
        const sidecar = sidecarText ? parseSidecar(sidecarText) : emptySidecar();
        const prevLayout = getEntry(sidecar, entryPath) ?? null;
        const prevModel = useGraphStore.getState().model;
        await useGraphStore.getState().loadFromCompile({
          files,
          inputPath: entryPath,
          prevModel,
          prevLayout,
        });
        if (!live()) return;
        setErrors([]);
        lastPersistedRef.current = useGraphStore.getState().layout;
        if (opts.recenter) {
          requestAnimationFrame(() => {
            if (live()) onCenterRef.current();
          });
        }
      } catch (err) {
        if (live()) setErrors(normalizeD2Error(err));
      } finally {
        if (live()) setLoading(false);
      }
    },
    [source, entryPath, setFiles, setErrors, setLoading],
  );

  // Initial load + watcher subscription. The first load for a given source
  // auto-centres; watcher-triggered reloads leave the user's pan untouched.
  useEffect(() => {
    if (!source) return undefined;
    void reload({ recenter: true });
    const off = source.subscribe((changes) => {
      if (!autoReloadRef.current) return;
      if (changes.length === 0) return;
      void reload({ recenter: false });
    });
    return () => {
      // Cancel any in-flight load so it can't race a subsequent source.
      loadGenRef.current += 1;
      off();
    };
  }, [source, reload]);

  const interacting = useGraphStore((s) => s.interacting);

  // Debounced sidecar persist whenever the user changes layout in the editor.
  // Skips writes mid-gesture (drag, resize, edge-anchor move) so we don't
  // pound the disk on every pointer-move; the effect re-runs when
  // `interacting` flips back to false and writes the final state.
  useEffect(() => {
    if (!source || !layout) return undefined;
    if (interacting) return undefined;
    // Don't persist the engine's auto layout — that's a transient comparison
    // view; the user's edits live in `manualStash` and will reappear on toggle.
    if (showingAuto) return undefined;
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
  }, [layout, interacting, showingAuto, source, entryPath, setErrors]);

  const onPickFolder = useCallback(async () => {
    const folder = await pickFolderViaTauri();
    if (!folder) return;
    rememberFolder(folder);
    setSource(new TauriFolderSource(folder));
  }, [setSource]);

  const onCreateProject = useCallback(async () => {
    // The native save dialog doubles as our "name + place" picker: the user
    // navigates to a parent directory and types the desired folder name. The
    // returned path is treated as the new project folder.
    const path = await saveDialog({
      title: 'Create new project',
      defaultPath: 'untitled-project',
    });
    if (!path) return;
    try {
      // Rust handles the mkdir + write + scope grant atomically; the JS fs
      // plugin's static scopes don't cover arbitrary save-dialog paths.
      await invoke('create_project', { path, sample: SAMPLE_D2 });
      rememberFolder(path);
      setSource(new TauriFolderSource(path));
    } catch (err) {
      setErrors(normalizeD2Error(err));
    }
  }, [setSource, setErrors]);

  // Hard relayout: re-runs the engine over the current files with no prior
  // model or layout, so positions and per-side ordering are recomputed from
  // scratch. The pre-relayout layout is pushed onto the undo stack, so the
  // user can revert with Cmd/Ctrl+Z if the engine pass isn't what they wanted.
  const onRelayout = useCallback(() => {
    if (!source) return;
    void (async () => {
      setLoading(true);
      try {
        const files = await readAllD2(source);
        setFiles(files);
        await useGraphStore.getState().loadFromCompile({
          files,
          inputPath: entryPath,
          prevModel: null,
          prevLayout: null,
          preserveHistory: true,
        });
        lastPersistedRef.current = null;
        setErrors([]);
      } catch (err) {
        setErrors(normalizeD2Error(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [source, entryPath, setFiles, setErrors, setLoading]);

  // On first mount, restore the last opened folder if we have one. Errors
  // (deleted, renamed, no longer accessible) surface as a normal load error.
  useEffect(() => {
    const last = recallFolder();
    if (last) setSource(new TauriFolderSource(last));
    // Only run once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stash every action the keydown handler can dispatch into a ref so the
  // effect itself only attaches once. The handler reads `.current` at fire
  // time, picking up the latest closures without re-binding the listener on
  // every render. Refs are populated below this useEffect so they're always
  // in sync with the latest props/state.
  const actionsRef = useRef({
    onCreateProject: (): void => undefined,
    onPickFolder: (): void => undefined,
    reload: (): void => undefined,
    onCenter: (): void => undefined,
    onToggleEngine: (): void => undefined,
    onRelayout: (): void => undefined,
    onAlignX: (): void => undefined,
    onAlignY: (): void => undefined,
    onMatchSize: (): void => undefined,
    onFitContainer: (): void => undefined,
    onCopyPng: (): void => undefined,
    onExportSvg: (): void => undefined,
    onExportPng: (): void => undefined,
    canUseReload: false,
    canUseEngine: false,
    canUseRelayout: false,
    canAlign: false,
    canFitContainer: false,
    canExport: false,
  });

  // Global keyboard shortcuts. Bound at the window level so they fire
  // regardless of which canvas element has focus. Suppressed inside text
  // inputs so future inline editing doesn't fight the editor history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const a = actionsRef.current;
      const k = e.key.toLowerCase();
      const shift = e.shiftKey;
      if (!shift) {
        switch (k) {
          case 'z':
            e.preventDefault();
            void useGraphStore.getState().undo();
            return;
          case 'y':
            e.preventDefault();
            void useGraphStore.getState().redo();
            return;
          case 'n':
            e.preventDefault();
            a.onCreateProject();
            return;
          case 'o':
            e.preventDefault();
            a.onPickFolder();
            return;
          case 'r':
            if (!a.canUseReload) return;
            e.preventDefault();
            a.reload();
            return;
          case '0':
            e.preventDefault();
            a.onCenter();
            return;
          case 'e':
            if (!a.canUseEngine) return;
            e.preventDefault();
            a.onToggleEngine();
            return;
          default:
            return;
        }
      }
      // shift + meta combinations
      switch (k) {
        case 'z':
          e.preventDefault();
          void useGraphStore.getState().redo();
          return;
        case 'l':
          if (!a.canUseRelayout) return;
          e.preventDefault();
          a.onRelayout();
          return;
        case 'x':
          if (!a.canAlign) return;
          e.preventDefault();
          a.onAlignX();
          return;
        case 'y':
          if (!a.canAlign) return;
          e.preventDefault();
          a.onAlignY();
          return;
        case 'm':
          if (!a.canAlign) return;
          e.preventDefault();
          a.onMatchSize();
          return;
        case 'f':
          if (!a.canFitContainer) return;
          e.preventDefault();
          a.onFitContainer();
          return;
        case 'c':
          if (!a.canExport) return;
          e.preventDefault();
          a.onCopyPng();
          return;
        case 's':
          if (!a.canExport) return;
          e.preventDefault();
          a.onExportSvg();
          return;
        case 'p':
          if (!a.canExport) return;
          e.preventDefault();
          a.onExportPng();
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    const routes = useGraphStore.getState().routes;
    const blob = svgToBlob(svgRef.current, exportOpts(layout, routes));
    await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
    rememberExportDir(finalPath);
  }, [rootPath, layout]);

  const onCenter = useCallback(() => {
    const host = hostRef.current;
    const state = useGraphStore.getState();
    const currentLayout = state.layout;
    if (!host || !currentLayout) return;
    const bbox = naturalBBox(currentLayout, state.routes);
    if (!bbox) return;
    const hw = host.clientWidth;
    const hh = host.clientHeight;
    // Per-axis: centre on a dimension if it fits, otherwise pad-align
    // top-left on that axis only.
    const pad = currentLayout.settings.export.margin;
    const nx = bbox.w <= hw ? (hw - bbox.w) / 2 - bbox.x : pad - bbox.x;
    const ny = bbox.h <= hh ? (hh - bbox.h) / 2 - bbox.y : pad - bbox.y;
    state.setViewOffset({ x: nx, y: ny });
    host.scrollTo({ left: 0, top: 0 });
  }, []);

  // Keep the forward ref pointing at the latest onCenter so reload() (which
  // closes over the ref, declared earlier) always invokes the live closure.
  onCenterRef.current = onCenter;

  // PNG export at a user-chosen pixel width. Scale = targetWidth/sourceWidth
  // is forwarded to the rasteriser; the rasteriser multiplies the canvas
  // dimensions by `scale`, so width=sourceWidth produces a 1× file and
  // width=2*sourceWidth produces a 2× file.
  const onExportPngAtSize = useCallback(
    async (targetWidth: number, _targetHeight: number) => {
      if (!svgRef.current || !layout) return;
      const defaultPath = exportDefaultPath(rootPath, 'png');
      const dialogOpts: Parameters<typeof saveDialog>[0] = {
        filters: [{ name: 'PNG', extensions: ['png'] }],
        defaultPath,
      };
      const path = await saveDialog(dialogOpts);
      if (!path) return;
      const finalPath = ensureExtension(path, 'png');
      const routes = useGraphStore.getState().routes;
      const opts = exportOpts(layout, routes);
      const sourceWidth = opts.bbox.w + opts.margin * 2;
      const scale = sourceWidth > 0 ? targetWidth / sourceWidth : 1;
      const blob = await svgToPngBlob(svgRef.current, opts, scale);
      await writeFile(finalPath, new Uint8Array(await blob.arrayBuffer()));
      rememberExportDir(finalPath);
      setPngDialogOpen(false);
    },
    [rootPath, layout],
  );

  const onToggleEngine = useCallback(() => {
    if (!autoLayout || !layout) return;
    void (async () => {
      await toggleAutoLayout();
      onCenter();
    })();
  }, [autoLayout, layout, toggleAutoLayout, onCenter]);

  const onToggleSettings = useCallback(() => {
    setSettingsOpen((o) => !o);
  }, []);

  const onCloseProject = useCallback(() => {
    forgetFolder();
    setSource(null);
    setFiles({});
    setErrors([]);
    useGraphStore.getState().closeProject();
    lastPersistedRef.current = null;
  }, [setSource, setFiles, setErrors]);

  const onCopyPng = useCallback(async () => {
    if (!svgRef.current || !layout) return;
    try {
      // Tauri's clipboard plugin expects raw RGBA + dimensions (not PNG-encoded
      // bytes). We rasterise the SVG straight to a canvas and forward the
      // pixels via the Image helper.
      const routes = useGraphStore.getState().routes;
      const { width, height, rgba } = await svgToImageData(
        svgRef.current,
        exportOpts(layout, routes),
        1,
      );
      const image = await TauriImage.new(rgba, width, height);
      await clipboardWriteImage(image);
    } catch (err) {
      setErrors(normalizeD2Error(err));
    }
  }, [layout, setErrors]);

  // Keep `actionsRef` in sync with the latest closures so the global keydown
  // handler (which reads `.current` at fire time) doesn't capture stale state.
  // Done in render rather than useEffect so a shortcut fires against whatever
  // was rendered, not the previous frame.
  actionsRef.current = {
    onCreateProject: () => {
      void onCreateProject();
    },
    onPickFolder: () => {
      void onPickFolder();
    },
    reload: () => {
      void reload({ recenter: false });
    },
    onCenter,
    onToggleEngine,
    onRelayout,
    onAlignX: () => {
      void alignCenters('x');
    },
    onAlignY: () => {
      void alignCenters('y');
    },
    onMatchSize: () => {
      void matchSize();
    },
    onFitContainer: () => {
      if (firstSelected) void fitContainer(firstSelected);
    },
    onCopyPng: () => {
      void onCopyPng();
    },
    onExportSvg: () => {
      void onExportSvg();
    },
    onExportPng: () => {
      // The PNG path goes through the size-picker popout, not the save
      // dialog directly: toggling here mirrors what clicking the toolbar
      // button does. The Export button inside the popout commits.
      setPngDialogOpen((o) => !o);
    },
    canUseReload: !!source && !autoReload,
    canUseEngine: !!autoLayout && !!layout,
    canUseRelayout: !!source,
    canAlign,
    canFitContainer,
    canExport: !!layout,
  };

  // Source dimensions for the PNG dialog: bbox + margin in user-space px.
  // Computed lazily from the live layout/routes when the dialog is open.
  const pngSourceSize = ((): { w: number; h: number } | null => {
    if (!pngDialogOpen || !layout) return null;
    const opts = exportOpts(layout, useGraphStore.getState().routes);
    return {
      w: Math.round(opts.bbox.w + opts.margin * 2),
      h: Math.round(opts.bbox.h + opts.margin * 2),
    };
  })();

  return (
    <div className="app" data-theme={theme}>
      <nav className="toolbar" aria-label="Toolbar">
        <button
          className="icon-btn"
          onClick={() => void onCreateProject()}
          title={`New project (${KB.newProject})`}
          aria-label="New project"
        >
          <NewProjectIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => void onPickFolder()}
          title={`Open folder (${KB.openFolder})`}
          aria-label="Open folder"
        >
          <FolderOpenIcon />
        </button>
        {!autoReload && (
          <button
            className="icon-btn"
            onClick={() => void reload({ recenter: false })}
            disabled={!source}
            title={`Reload D2 (${KB.reload})`}
            aria-label="Reload D2"
          >
            <ReloadIcon />
          </button>
        )}
        <span className="toolbar-divider" aria-hidden />
        <button
          className="icon-btn"
          onClick={() => void undo()}
          disabled={!canUndo || showingAuto}
          title={`Undo (${KB.undo})`}
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => void redo()}
          disabled={!canRedo || showingAuto}
          title={`Redo (${KB.redo})`}
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
        <span className="toolbar-divider" aria-hidden />
        <button
          className="icon-btn"
          onClick={onCenter}
          disabled={!layout}
          title={`Center view (${KB.center})`}
          aria-label="Center view"
        >
          <CenterIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleEngine}
          disabled={!autoLayout || !layout}
          aria-pressed={showingAuto}
          title={
            showingAuto
              ? `Showing engine layout — click to return to edits (${KB.toggleEngine})`
              : `Compare against engine layout (${KB.toggleEngine})`
          }
          aria-label="Toggle engine layout"
        >
          <CompareIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onRelayout}
          disabled={!source}
          title={
            needsRelayout ? `Relayout — out of sync (${KB.relayout})` : `Relayout (${KB.relayout})`
          }
          aria-label="Relayout"
          data-attention={needsRelayout || undefined}
        >
          <RelayoutIcon />
        </button>
        <span className="toolbar-divider" aria-hidden />
        <button
          className="icon-btn"
          onClick={() => void alignCenters('x')}
          disabled={!canAlign}
          title={`Align horizontal centres — first selected is the reference (${KB.alignX})`}
          aria-label="Align horizontal centres"
        >
          <AlignVerticalIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => void alignCenters('y')}
          disabled={!canAlign}
          title={`Align vertical centres — first selected is the reference (${KB.alignY})`}
          aria-label="Align vertical centres"
        >
          <AlignHorizontalIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => void matchSize()}
          disabled={!canAlign}
          title={`Match size to first selected (${KB.matchSize})`}
          aria-label="Match size"
        >
          <MatchSizeIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            if (firstSelected) void fitContainer(firstSelected);
          }}
          disabled={!canFitContainer}
          title={`Fit container to its contents (${KB.fitContainer})`}
          aria-label="Fit container to contents"
        >
          <FitContainerIcon />
        </button>
        <span className="toolbar-divider" aria-hidden />
        <button
          className="icon-btn"
          onClick={() => void onCopyPng()}
          disabled={!layout}
          title={`Copy PNG to clipboard (${KB.copyPng})`}
          aria-label="Copy PNG to clipboard"
        >
          <CopyIcon />
        </button>
        <button
          className="icon-btn"
          onClick={() => void onExportSvg()}
          disabled={!layout}
          title={`Export SVG (${KB.exportSvg})`}
          aria-label="Export SVG"
        >
          <ExportSvgIcon />
        </button>
        <span className="toolbar-wrap" ref={pngWrapRef}>
          <button
            className="icon-btn"
            onClick={() => setPngDialogOpen((o) => !o)}
            disabled={!layout}
            aria-pressed={pngDialogOpen}
            title={`Export PNG (${KB.exportPng})`}
            aria-label="Export PNG"
          >
            <ExportPngIcon />
          </button>
          {pngDialogOpen && pngSourceSize && (
            <PngExportDialog
              defaultWidth={pngSourceSize.w}
              defaultHeight={pngSourceSize.h}
              onExport={(w, h) => void onExportPngAtSize(w, h)}
            />
          )}
        </span>
        <span className="toolbar-divider" aria-hidden />
        <span className="toolbar-wrap" ref={settingsWrapRef}>
          <button
            className="icon-btn"
            onClick={onToggleSettings}
            aria-pressed={settingsOpen}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
          {settingsOpen && (
            <SettingsPanel
              autoReload={autoReload}
              onAutoReloadChange={setAutoReload}
              allowContextMenu={allowContextMenu}
              onAllowContextMenuChange={setAllowContextMenu}
              showGrid={showGrid}
              onShowGridChange={setShowGrid}
              showAnchors={showAnchors}
              onShowAnchorsChange={setShowAnchors}
              theme={theme}
              onThemeChange={setTheme}
            />
          )}
        </span>
      </nav>
      <main
        className="canvas-host"
        ref={hostRef}
        onContextMenu={(e) => {
          // The canvas is a non-text surface; suppress the OS context menu
          // unless the user has explicitly opted into it for dev work.
          if (!allowContextMenu) e.preventDefault();
        }}
      >
        {!source && (
          <div className="empty-state">
            <WelcomeCard />
          </div>
        )}
        <ErrorOverlay errors={errors} onDismiss={() => setErrors([])} />
        <Canvas
          ref={svgRef}
          hostRef={hostRef as unknown as React.RefObject<HTMLDivElement | null>}
          showGrid={showGrid}
          showAnchors={showAnchors}
        />
      </main>
      {/* Welcome overlay sits at the .app level (not inside .canvas-host) so
          it covers the visible viewport rather than the canvas's scrollable
          extent, which can be much larger when the user has panned. */}
      {source && welcomeOpen && (
        <div className="welcome-overlay" role="dialog" aria-label="About Daedalus">
          <div ref={welcomeCardRef} className="welcome-overlay-inner">
            <WelcomeCard />
          </div>
        </div>
      )}
      {source && (
        <div className="brand-floating" ref={brandRef}>
          <button
            type="button"
            className="display-name"
            title="About Daedalus"
            aria-label="About Daedalus"
            aria-pressed={welcomeOpen}
            onClick={() => setWelcomeOpen((o) => !o)}
          >
            {DISPLAY_NAME}
          </button>
          <span className="author" aria-hidden>
            by Carlos Asmat
          </span>
          <a
            className="version"
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="View releases on GitHub"
            onClick={onExternalLink(RELEASES_URL)}
          >
            {VERSION_LABEL}
          </a>
          <UpdateIndicator />
        </div>
      )}
      {rootPath && (
        <div className="path-floating">
          <span className="path-prefix">Project:&nbsp;</span>
          {/* RTL on the wrapper puts the ellipsis on the visual *left* so the
              project folder name (the most informative part of the path)
              stays visible; bdo forces the path characters back to LTR so the
              path reads in its normal order. */}
          <span className="path-text" dir="rtl">
            <bdo dir="ltr">{rootPath}</bdo>
          </span>
          <button
            type="button"
            className="path-close"
            aria-label="Close project"
            title="Close project"
            onClick={onCloseProject}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

import type { EdgeRoutes, Layout } from '@daedalus/shared';
import type { ExportOptions } from './export/svg.js';

// Compute the export bbox from the layout/routes data, matching the
// in-canvas export-outline. Using the same `naturalBBox` keeps the displayed
// "{w} × {h} px" hint and the actual exported file dimensions in lockstep.
// (We deliberately do *not* read getBBox off the live SVG: that includes
// label text that overflows node boxes, which made the displayed outline
// and the exported viewBox disagree.)
function exportOpts(layout: Layout, routes: EdgeRoutes): ExportOptions {
  const margin = layout.settings.export.margin;
  const showGrid = layout.settings.export.showGrid;
  const viewOffset = useGraphStore.getState().viewOffset;
  const natural = naturalBBox(layout, routes);

  if (!natural) {
    return {
      margin,
      showGrid,
      bbox: {
        x: viewOffset.x,
        y: viewOffset.y,
        w: layout.grid.cols * layout.grid.size,
        h: layout.grid.rows * layout.grid.size,
      },
    };
  }

  return {
    margin,
    showGrid,
    bbox: {
      x: natural.x + viewOffset.x,
      y: natural.y + viewOffset.y,
      w: natural.w,
      h: natural.h,
    },
  };
}
