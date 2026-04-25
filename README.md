# Daedalus

D2-driven diagram editor with snap-to-grid layout, orthogonal edge routing, and a classic blueprint theme. Desktop app built on Tauri 2.

## Features

- **D2 as source of truth.** Point the app at a folder of `.d2` files; imports between files just work.
- **Graphical editor.** Drag nodes on a finite dot-grid; positions and sizes snap to the grid.
- **Per-side connection ordering.** Each node has top/right/bottom/left sides with multiple anchors per side; click an anchor to swap order with a neighbour.
- **Orthogonal auto-routing.** Edges re-route around obstacles after every move (libavoid).
- **D2-driven styling.** Node and connection styles come straight from D2; the Blueprint theme provides the defaults.
- **Watch mode.** External edits to `.d2` files refresh the diagram. Minor changes (label/style) keep the layout; structural changes prompt a manual relayout.
- **Export.** SVG and PNG, both rendered from the same in-app SVG.

## Using the app

1. Launch Daedalus. Click **Open folder** and pick a folder containing one or more `.d2` files.
2. The app compiles `index.d2` (the entry file) using ELK for initial layout. Nodes appear snapped to the grid.
3. Drag nodes to rearrange them. Resize from the corner handles. Everything snaps.
4. Click an anchor on a node side to reveal alternate slot positions. Click one to commit a swap.
5. Edit your `.d2` file in any editor and save. The diagram updates: a renamed label keeps your layout; a new node lands in the **Unplaced** tray and waits for **Relayout**.
6. **Export** to SVG or PNG from the toolbar.

## Minimal data-file example

`example/index.d2`:

```d2
api: API
db: Database
cache: Cache

api -> db: query
api -> cache: lookup
cache -> db: miss
```

The full layout is stored beside it as `.daedalus.json`.

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

## Status

This is a fresh scaffold. The shared graph engine (D2 wrap, layout reconciliation, snap-to-grid, edge routing, sidecar IO, theming, render plan) is implemented and unit-tested. The web editor is wired up against the Tauri folder source. The Rust shell exposes `pick_folder`, `watch_folder`, and `unwatch_folder` and is ready to compile (run `make dev` to build). The first run will pull the Tauri Rust dependency tree on demand.

## License

MIT.
