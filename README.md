# Daedalus

D2-driven diagram editor with snap-to-grid layout, orthogonal edge routing, and a classic blueprint theme. Desktop app built on Tauri 2.

## Features

- **D2 as source of truth.** Point the app at a folder of `.d2` files; imports between files just work, and external edits stream in via a folder watcher.
- **Graphical editor.** Drag nodes on a dot grid; positions and sizes snap to the grid. The visible canvas auto-fits to the larger of the window or the content bounding box.
- **Per-side connection ordering.** Each node has top/right/bottom/left sides; drag an anchor onto any other slot on any side to move that endpoint there. Ghost anchors light up the valid drop targets and snap to the nearest one.
- **Orthogonal auto-routing.** Edges are routed by libavoid with a configurable shape buffer, lead-out, and nudging distance. Hexagons, diamonds, and parallelograms register their actual polygons so routes hug the visible outline, not the bounding rect.
- **D2-driven styling.** Node and connection styles (fill, stroke, stroke-width, stroke-dash, font color, bold/italic, opacity) come straight from D2. The Blueprint theme provides defaults; switch to the Paper theme from the toolbar.
- **Edge labels with reading pills.** Each label gets a theme-coloured backing pill at the polyline's arc-length midpoint, so the text stays legible even where edges crowd each other.
- **Watch mode reconciliation.** Renaming a label keeps your layout. Adding or removing nodes/edges shows a "needs relayout" banner; new nodes land in the unplaced tray until you hit **Relayout**.
- **Export.** SVG and PNG. Output is cropped to the diagram's bounding box (nodes + edges + labels) plus a configurable margin, with a transparent background by default. Editor chrome (anchors, selection rings) is stripped.
- **Project-scoped settings panel.** Tune routing clearances and export options; everything persists per folder in `.daedalus.json`.
- **Resumes where you left off.** The app reopens the last folder on launch, and the Save dialog remembers the last export directory.

## Using the app

1. Launch Daedalus. Click **Open folder** and pick a folder containing one or more `.d2` files. The app remembers it for next time.
2. The app compiles `index.d2` (the entry file) using ELK for the initial pass. Node positions and per-side connection assignments are populated from ELK's port output.
3. **Drag nodes** to rearrange them; everything snaps to the grid. The grid grows as you drag past the existing bounds.
4. **Drag a connection anchor** onto any ghost slot on any side of the same node to move that endpoint. Release to commit; release in empty space to cancel.
5. Edit your `.d2` file in any editor and save. The diagram refreshes: label-only changes keep your layout intact; structural changes go through a reconcile pass.
6. **Relayout** runs a fresh ELK + libavoid pass over the current files (preserves nothing).
7. **Theme** toggles between Blueprint (default, dark blue) and Paper (light parchment).
8. **Settings** opens the project-scoped panel:
   - **Routing**: shape buffer (clearance kept around shapes), lead-out (distance edges leave a side perpendicular before bending), nudging (gap between parallel segments).
   - **Export**: margin around the diagram bbox (default 16 px) and an "Include grid" checkbox (default off). Background is always transparent.
9. **Export SVG / PNG** from the toolbar. The save dialog defaults to `<folder-name>.<ext>` in the last export directory; the extension is appended if you leave it off.

## Sidecar file

Layout, viewport, and project settings live in `.daedalus.json` next to your D2 files. Schema version: 1. Older sidecars without a `settings` block are migrated transparently.

## Minimal data-file example

`example/index.d2`:

```d2
api: API
db: Database {
  shape: cylinder
}
cache: Cache {
  shape: hexagon
}

api -> db: query
api -> cache: lookup
cache -> db: miss
```

D2 styles flow through to the rendered diagram:

```d2
db: Postgres {
  shape: cylinder
  style: {
    fill: "#7aa6cd"
    stroke: "#7aa6cd"
    bold: true
  }
}

cache -> db: cache miss {
  style: {
    stroke: "#f4f1de"
    stroke-dash: 4
  }
}
```

## Development

Prerequisites: Node 22+, pnpm 10+, Rust toolchain (for Tauri).

```sh
git clone <repo>
cd daedalus
make install
make install-hooks
make dev          # launches Vite + Tauri
```

| Target       | Command          |
| ------------ | ---------------- |
| Install deps | `make install`   |
| Dev (Tauri)  | `make dev`       |
| Build        | `make build`     |
| Test         | `make test`      |
| Typecheck    | `make typecheck` |
| Lint         | `make lint`      |
| Format       | `make format`    |

The `web` package's `dev` and `build` scripts run `scripts/sync-wasm.mjs` first; that copies `libavoid.wasm` from `node_modules` into `packages/web/public/` so the bundler serves it at the document root in both dev and production. The shared `routing` module reads the URL via `setLibavoidWasmUrl` at app boot.

## Repo layout

```
packages/
  shared/     # platform-agnostic TS: D2 wrapper, model, layout, routing,
              # sidecar, render. No DOM imports.
  web/        # React + Zustand UI; SVG editor, export pipeline, source impl.
  desktop/    # Tauri 2 shell: pick_folder, watch_folder, unwatch_folder,
              # plus dynamic fs-scope grants for the chosen folder.
example/      # A demo folder you can open from the empty state.
```

## Key dependencies

| Package            | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `@terrastruct/d2`  | D2 parsing + initial ELK layout (WASM)        |
| `libavoid-js`      | Orthogonal connector routing (WASM)           |
| `react`, `zustand` | UI + state                                    |
| `ajv`              | Sidecar JSON schema validation                |
| `@tauri-apps/api`  | Webview ↔ Rust bridge                         |
| `tauri-plugin-fs`  | Folder/file IO with capability-scoped access  |
| `notify` (Rust)    | Folder watcher; events bridged via Tauri emit |

## Debugging routing

Open DevTools (right-click → Inspect) and check the console:

- `[daedalus] libavoid loaded from <url>` confirms the WASM router is live.
- `[daedalus] routed N shapes / M edges; sample route ...` is logged on every routing pass.
- `window.__daedalus_routing` holds the last call's stats: shape/polygon counts, parameter ids, sample edge polyline.

If you see `libavoid routing failed, using manhattan fallback` warnings, paste the error — it usually means the WASM didn't load (in which case sync-wasm.mjs and the `setLibavoidWasmUrl` wiring need to be re-checked).

## License

MIT.
