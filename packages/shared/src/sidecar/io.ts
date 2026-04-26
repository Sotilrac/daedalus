import type { Layout } from '../model/types.js';
import { defaultSettings } from '../model/types.js';
import { validateSidecar } from './schema.js';

export interface SidecarFile {
  entries: Record<string, Layout>;
}

export function emptySidecar(): SidecarFile {
  return { entries: {} };
}

export function parseSidecar(text: string): SidecarFile {
  const json = JSON.parse(text) as unknown;
  const migrated = migrate(json);
  if (!validateSidecar(migrated)) {
    const msgs = (validateSidecar.errors ?? [])
      .map((e) => `${e.instancePath} ${e.message}`)
      .join(', ');
    throw new Error(`Invalid sidecar: ${msgs}`);
  }
  return migrated;
}

export function serializeSidecar(file: SidecarFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

// V1 is the only version; the migrate hook is here so future versions can
// upgrade older payloads in place before validation. We also fill in fields
// added after the first release (currently `settings`) so older sidecars keep
// loading without forcing a manual edit.
function migrate(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return emptySidecar();
  const obj = input as Record<string, unknown>;
  if (!('entries' in obj)) return emptySidecar();
  const entries = obj.entries as Record<string, Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const entry = entries[key];
    if (!entry) continue;
    if (!('settings' in entry)) entry.settings = defaultSettings();
    // The dark theme was originally named 'blueprint'; renamed to 'slate'
    // to match the actual gray palette. Coerce older sidecars.
    const viewport = entry.viewport as Record<string, unknown> | undefined;
    if (viewport && viewport.theme === 'blueprint') viewport.theme = 'slate';
  }
  return obj;
}

export function setEntry(file: SidecarFile, entryPath: string, layout: Layout): SidecarFile {
  return { ...file, entries: { ...file.entries, [entryPath]: layout } };
}

export function getEntry(file: SidecarFile, entryPath: string): Layout | undefined {
  return file.entries[entryPath];
}
