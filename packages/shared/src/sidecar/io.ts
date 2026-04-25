import type { Layout } from '../model/types.js';
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
    const msgs = (validateSidecar.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join(', ');
    throw new Error(`Invalid sidecar: ${msgs}`);
  }
  return migrated;
}

export function serializeSidecar(file: SidecarFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

// V1 is the only version; the migrate hook is here so future versions can
// upgrade older payloads in place before validation.
function migrate(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return emptySidecar();
  const obj = input as Record<string, unknown>;
  if ('entries' in obj) return obj;
  return emptySidecar();
}

export function setEntry(file: SidecarFile, entryPath: string, layout: Layout): SidecarFile {
  return { ...file, entries: { ...file.entries, [entryPath]: layout } };
}

export function getEntry(file: SidecarFile, entryPath: string): Layout | undefined {
  return file.entries[entryPath];
}
