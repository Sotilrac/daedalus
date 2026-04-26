# Daedalus

D2-driven diagram editor with snap-to-grid layout and orthogonal edge routing. Desktop app built on Tauri 2.

## Features

- **D2 as source of truth.** Point the app at a folder of `.d2` files (entry: `index.d2`); imports between files just work, and external edits stream in via a folder watcher.
- **Graphical editor.** Drag nodes on a dot grid; positions and sizes snap to the grid. Drag blank canvas to pan. Centre, undo, and redo are one click away (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z).
- **Per-side connection ordering.** Each node has top/right/bottom/left sides; drag an anchor onto any other slot on any side to move that endpoint there. Ghost anchors light up the valid drop targets and snap to the nearest one.
- **Orthogonal auto-routing.** Edges are routed by libavoid with configurable shape buffer, lead-out, and nudging. Hexagons, diamonds, and parallelograms register their actual polygons so routes hug the visible outline, not the bounding rect.
- **D2-driven styling.** Node and connection styles (fill, stroke, stroke-width, stroke-dash, font color, bold/italic, opacity) come straight from D2. Slate (dark CAD-grey, default) and Paper (light) themes provide the defaults the user can override.
- **Engine-layout compare.** Toggle between your edits and the engine's most recent ELK pass to spot drift; manual edits are stashed and restored when you toggle back.
- **Edge labels with reading pills.** Each label gets a theme-coloured backing pill at the polyline's arc-length midpoint, so the text stays legible even where edges crowd each other.
- **Watch mode reconciliation.** Renaming a label keeps your layout. Adding or removing nodes/edges shows a "needs relayout" banner; new nodes auto-place to the right of the existing bbox until you hit **Relayout**.
- **Export.** SVG and PNG. Output is cropped to the diagram's bounding box (nodes + edges + labels) plus a configurable margin, with a transparent background by default. Editor chrome (anchors, selection rings) is stripped. **Copy PNG to clipboard** for one-click paste into Slack/Notion/etc.
- **New project scaffolding.** Create a new project folder + sample D2 from the toolbar, all in one native dialog.
- **Project-scoped + user prefs.** Routing/export settings persist in `.daedalus.json` per folder; theme, grid visibility, anchor visibility, and auto-reload are user prefs that survive across projects.
- **Resumes where you left off.** The app reopens the last folder on launch, and the Save dialog remembers the last export directory.

## Using the app

1. Launch Daedalus. From the toolbar, **New project** scaffolds a fresh folder with a sample D2; **Open folder** picks an existing one. Either way the app remembers the choice for next launch. The folder must contain `index.d2` as the entry point.
2. The app compiles `index.d2` using ELK for the initial pass. Node positions and per-side connection assignments are populated from ELK's port output.
3. **Drag nodes** to rearrange them; everything snaps to the grid. **Drag blank canvas** to pan. The size handle on a single-selected node resizes around its centre.
4. **Drag a connection anchor** onto any ghost slot on any side of any node to move that endpoint. Release on a slot to commit; release elsewhere to cancel.
5. **Undo / Redo** (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, or the toolbar buttons) walk through every layout mutation. A single drag is one history entry, not one per pointer-move.
6. Edit your `.d2` file in any editor and save. The diagram refreshes: label-only changes keep your layout intact; structural changes go through a reconcile pass that auto-places new nodes and attaches new edges to the side closest to a straight line.
7. **Relayout** discards the current layout and runs a fresh ELK + libavoid pass over the current files. **Compare against engine layout** flips between your edits and the engine pass without losing your work.
8. **Centre view** scrolls and offsets the canvas so the diagram bbox sits in view.
9. **Copy PNG**, **Export SVG**, **Export PNG** sit in the toolbar. The save dialog defaults to `<folder-name>.<ext>` in the last export directory; the extension is appended if you leave it off.
10. **Settings** opens the side panel:
    - **Display**: theme (Slate / Paper), show grid, show anchors. _User-level._
    - **Source**: auto-reload on D2 change. _User-level._
    - **Routing** _(project-scoped)_: shape buffer, lead-out, nudging.
    - **Export** _(project-scoped)_: margin around the bbox, include grid in export.
    - **Developer**: allow right-click context menu on the canvas (for inspecting elements).
11. The bottom-right pill shows the active project path; click the **×** to close it. The bottom-left brand reveals "by Carlos Asmat" on hover and links the version label to the GitHub releases page.

## Sidecar file

Layout, viewport, and project routing/export settings live in `.daedalus.json` next to your D2 files. Schema version: 1. Older sidecars without a `settings` block, or that still reference the old `blueprint` theme name, are migrated transparently on read.

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

D2 styles and `classes` flow through to the rendered diagram (the app's built-in "New project" template uses this pattern):

```d2
classes: {
  service: { style.fill: "#dbeafe"; style.stroke: "#1e40af" }
  store:   { shape: cylinder; style.fill: "#fef3c7"; style.stroke: "#b45309" }
  async:   { style.stroke: "#cbd5e1"; style.stroke-dash: 4 }
}

api: API {class: service}
db:  Postgres {class: store}
api -> db: read/write {class: async}
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

| Target       | Command                            |
| ------------ | ---------------------------------- |
| Install deps | `make install`                     |
| Dev (Tauri)  | `make dev`                         |
| Build        | `make build`                       |
| Test         | `make test`                        |
| Typecheck    | `make typecheck`                   |
| Lint         | `make lint`                        |
| Format       | `make format`                      |
| Icons        | `make icons` (regen from icon.svg) |
| Bump version | `make bump V=1.2.3` (or `V=patch`) |
| Clean        | `make clean`                       |

`make bump` rewrites the version in the root `package.json`, `packages/desktop/src-tauri/Cargo.toml`, `tauri.conf.json`, and `Cargo.lock` (the daedalus crate entry) in lockstep, then re-runs prettier on the JSON files.

The `web` package's `dev` and `build` scripts run `scripts/sync-wasm.mjs` first; that copies `libavoid.wasm` from `node_modules` into `packages/web/public/` so the bundler serves it at the document root in both dev and production. The shared `routing` module reads the URL via `setLibavoidWasmUrl` at app boot.

## Repo layout

```
packages/
  shared/     # platform-agnostic TS: D2 wrapper, model, layout, routing,
              # sidecar, render. No DOM imports.
  web/        # React + Zustand UI; SVG editor, export pipeline, source impl.
  desktop/    # Tauri 2 shell: pick_folder, create_project, watch_folder,
              # unwatch_folder, plus dynamic fs-scope grants for the
              # chosen folder.
example/      # A demo folder you can open from the empty state.
scripts/      # bump-version.mjs and other repo maintenance scripts.
```

## Key dependencies

| Package                          | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `@terrastruct/d2`                | D2 parsing + initial ELK layout (WASM)        |
| `libavoid-js`                    | Orthogonal connector routing (WASM)           |
| `react`, `zustand`               | UI + state                                    |
| `ajv`                            | Sidecar JSON schema validation                |
| `@tauri-apps/api`                | Webview ↔ Rust bridge                         |
| `tauri-plugin-fs`                | Folder/file IO with capability-scoped access  |
| `tauri-plugin-dialog`            | Native open/save dialogs                      |
| `tauri-plugin-clipboard-manager` | Image clipboard for Copy PNG                  |
| `notify` (Rust)                  | Folder watcher; events bridged via Tauri emit |

## Debugging routing

Open DevTools (right-click → Inspect) and check the console:

- `[daedalus] libavoid loaded from <url>` confirms the WASM router is live.
- `[daedalus] routed N shapes / M edges; sample route ...` is logged on every routing pass.
- `window.__daedalus_routing` holds the last call's stats: shape/polygon counts, parameter ids, sample edge polyline.

If you see `libavoid routing failed, using manhattan fallback` warnings, paste the error — it usually means the WASM didn't load (in which case sync-wasm.mjs and the `setLibavoidWasmUrl` wiring need to be re-checked).

## License

MIT.
