# Daedalus

D2-driven diagram editor with snap-to-grid layout and orthogonal edge automatic routing.

The name comes from the Ancient Greek verb δαιδάλλω — to craft skillfully, to make artfully — by way of Δαίδαλος, the mythical artificer. In the same spirit: D2 keeps the structure correct, and you sculpt the composition.

## Download

Pre-built installers for macOS (universal), Windows (MSI / NSIS), and Linux (AppImage / deb) live on the [GitHub releases page](https://github.com/Sotilrac/daedalus/releases). The app checks for updates on launch and shows a pill next to the version label in the home card when a newer release is available; clicking it downloads, signature-verifies, and installs the update, then relaunches.

## Features

- **Write D2, drag the layout.** Your `.d2` files stay the source of truth; Daedalus never rewrites them. You move nodes around for clarity, and the positions, sizes, and connection ordering save alongside in `.daedalus.json`.
- **Move connections wherever they read best.** Every node side (top, right, bottom, left) holds an ordered list of edges. Grab any endpoint and drop it on a different slot or a different side; ghost dots show every valid landing spot.
- **Edges that don't trip over each other.** Orthogonal auto-routing detours around shapes, spaces parallel runs apart, and lands labels on a backing pill at each route's midpoint so the text reads even on dense boards.
- **Live updates from your editor.** Save the `.d2` and the diagram refreshes. A label or colour change keeps your layout untouched. Add a node and it slots in next to the existing bounds without trampling what you already arranged.
- **Drag, resize, snap.** Everything lands on the dot grid. Pan by dragging blank canvas; resize a selected node from the corner handle. Undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) covers every layout move.
- **Get the diagram out anywhere.** Export SVG or PNG, or copy a PNG straight to the clipboard for paste-into-Slack/Notion. Output is cropped to the content with editor chrome stripped and a transparent background.
- **Your D2 styles come through.** Fills, strokes, dashes, font color, bold/italic, opacity — whatever you set in D2 lands in the render. Pick Slate (dark, default) or Paper (light) for the theme around it.
- **A second opinion on layout.** Toggle between your edits and the engine's most recent ELK pass to spot drift. Your edits are stashed, not lost — flip back and they're right where you left them.
- **One click to start.** Create a new project (folder + sample D2) or open an existing folder of `.d2` files. Daedalus reopens whichever you had last on the next launch.

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

Layout, viewport, and project routing/export settings live in `.daedalus.json` next to your D2 files. Schema version: 1.

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

### Releases & auto-update

Pushing a tag matching `v*` or `desktop-v*` triggers `.github/workflows/release-desktop.yml`, which builds for all three desktop OSes and publishes the installers plus a signed `latest.json` to the GitHub release. The in-app updater (`tauri-plugin-updater`) reads `latest.json` from the `releases/latest/download/` URL and verifies every download against the public key embedded in `tauri.conf.json`.

One-time signing-key setup (do this once per project, not per release):

```sh
# Generate the keypair. --write-keys writes the private key to disk; the
# prompt sets a password that the CI also needs. `pnpm exec` runs the CLI
# directly so pnpm's own arg parsing doesn't strip flags.
mkdir -p ~/.tauri
pnpm -F @daedalus/desktop exec tauri signer generate --write-keys ~/.tauri/daedalus.key

# The command prints the public key; paste it into
# packages/desktop/src-tauri/tauri.conf.json under plugins.updater.pubkey
# (replacing REPLACE_WITH_TAURI_SIGNER_GENERATE_PUBLIC_KEY).

# Add two GitHub Actions secrets to the repo
# (Settings → Secrets and variables → Actions):
#   TAURI_SIGNING_PRIVATE_KEY            — contents of ~/.tauri/daedalus.key
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD   — the password you set above
```

Without these secrets the release workflow still builds installers, but `tauri-action` skips `latest.json` and the in-app updater will report "no update found" indefinitely. The private key never leaves your machine + GitHub's secret store; rotating it later means cutting a new keypair, updating the public half in `tauri.conf.json`, and shipping one bridge release on the old key so existing installs can update past it.

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

[Mozilla Public License 2.0](LICENSE). File-level weak copyleft: you can ship Daedalus inside proprietary or differently-licensed projects, but modifications to MPL-licensed source files have to be published under MPL-2.0. Includes an explicit patent grant.
