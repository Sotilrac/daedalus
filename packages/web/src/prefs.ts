import { useEffect, useState } from 'react';

// Each call binds a piece of UI state to a localStorage key. Reads on first
// render, writes on every change. Safe under SSR/jsdom (no localStorage) by
// falling back to the default.

function read<T extends string | boolean>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  if (typeof fallback === 'boolean') return (raw === 'true') as T;
  return raw as T;
}

function write(key: string, value: string | boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, String(value));
}

export function useStoredFlag(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => read(key, defaultValue));
  useEffect(() => {
    write(key, value);
  }, [key, value]);
  return [value, setValue];
}

export function useStoredEnum<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = read<string>(key, defaultValue);
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : defaultValue;
  });
  useEffect(() => {
    write(key, value);
  }, [key, value]);
  return [value, setValue];
}

export function rememberFolder(path: string): void {
  write(LAST_FOLDER_KEY, path);
}

export function recallFolder(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_FOLDER_KEY);
}

export function forgetFolder(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LAST_FOLDER_KEY);
}

export const LAST_FOLDER_KEY = 'daedalus.lastFolder';
export const AUTO_RELOAD_KEY = 'daedalus.autoReload';
export const AUTOSAVE_KEY = 'daedalus.autosave';
export const ALLOW_CTX_KEY = 'daedalus.allowContextMenu';
export const SHOW_GRID_KEY = 'daedalus.showGrid';
export const SHOW_ANCHORS_KEY = 'daedalus.showAnchors';
export const THEME_KEY = 'daedalus.theme';
