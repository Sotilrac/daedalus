import { useEffect, useState } from 'react';
import { readFile, readTextFile } from '@tauri-apps/plugin-fs';

// Module-level cache: each absolute asset path resolves to a Promise<string>
// holding a data URL the renderer can drop into <image href>. Keyed by the
// absolute path so React renders for different nodes pointing at the same
// file share one fetch. Stays warm across mount/unmount cycles.
const cache = new Map<string, Promise<string>>();

const SVG_MIME = 'image/svg+xml';
function mimeForExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  const ext = path.slice(dot + 1).toLowerCase();
  switch (ext) {
    case 'svg':
      return SVG_MIME;
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa() doesn't accept binary — convert to a binary string in chunks
  // small enough to avoid blowing the call-stack limit.
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function loadAsset(absolute: string): Promise<string> {
  const mime = mimeForExtension(absolute);
  if (mime === SVG_MIME) {
    // Inline SVGs as a UTF-8 data URL so the markup is human-readable in
    // exports and so themed `currentColor` references inside the SVG can
    // still cascade from the host SVG's stroke/fill.
    const text = await readTextFile(absolute);
    return `data:${SVG_MIME};utf8,${encodeURIComponent(text)}`;
  }
  const bytes = await readFile(absolute);
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function joinPath(root: string, rel: string): string {
  if (rel.startsWith('/')) return rel;
  if (root.endsWith('/')) return root + rel;
  return `${root}/${rel}`;
}

// Resolve a (project-relative) image path into a data URL the webview can
// render. Returns null while loading, the URL once available, or null on
// error (the caller falls back to a plain rectangle).
export function useAssetUrl(
  rootPath: string | null,
  relativePath: string | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rootPath || !relativePath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    const absolute = joinPath(rootPath, relativePath);
    let promise = cache.get(absolute);
    if (!promise) {
      promise = loadAsset(absolute);
      cache.set(absolute, promise);
    }
    promise.then(
      (u) => {
        if (!cancelled) setUrl(u);
      },
      (err) => {
        const g = globalThis as { console?: { warn?: (...a: unknown[]) => void } };
        g.console?.warn?.('[daedalus] failed to load image asset', absolute, err);
        if (!cancelled) setUrl(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rootPath, relativePath]);
  return url;
}
