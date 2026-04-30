import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  forgetFolder,
  LAST_FOLDER_KEY,
  recallFolder,
  rememberFolder,
  useStoredEnum,
  useStoredFlag,
} from '../src/prefs.js';

afterEach(() => {
  localStorage.clear();
});

describe('useStoredFlag', () => {
  it('returns the default when localStorage is empty', () => {
    const { result } = renderHook(() => useStoredFlag('key.flag', true));
    expect(result.current[0]).toBe(true);
  });

  it('reads a previously-stored "true"/"false" string back as a boolean', () => {
    localStorage.setItem('key.flag', 'false');
    const { result } = renderHook(() => useStoredFlag('key.flag', true));
    expect(result.current[0]).toBe(false);
  });

  it('writes through to localStorage on change', () => {
    const { result } = renderHook(() => useStoredFlag('key.flag', true));
    act(() => result.current[1](false));
    expect(localStorage.getItem('key.flag')).toBe('false');
  });
});

describe('useStoredEnum', () => {
  const ALLOWED = ['slate', 'paper'] as const;

  it('returns the default when no value is stored', () => {
    const { result } = renderHook(() => useStoredEnum('key.theme', 'slate', ALLOWED));
    expect(result.current[0]).toBe('slate');
  });

  it('round-trips an allowed stored value', () => {
    localStorage.setItem('key.theme', 'paper');
    const { result } = renderHook(() => useStoredEnum('key.theme', 'slate', ALLOWED));
    expect(result.current[0]).toBe('paper');
  });

  it('falls back to default when the stored value is no longer allowed', () => {
    // E.g. an old build wrote 'blueprint' that we removed from the enum.
    localStorage.setItem('key.theme', 'blueprint');
    const { result } = renderHook(() => useStoredEnum('key.theme', 'slate', ALLOWED));
    expect(result.current[0]).toBe('slate');
  });

  it('persists the new value on update', () => {
    const { result } = renderHook(() => useStoredEnum('key.theme', 'slate', ALLOWED));
    act(() => result.current[1]('paper'));
    expect(localStorage.getItem('key.theme')).toBe('paper');
  });
});

describe('rememberFolder / recallFolder / forgetFolder', () => {
  it('writes and reads the last opened folder under a stable key', () => {
    rememberFolder('/home/me/proj');
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe('/home/me/proj');
    expect(recallFolder()).toBe('/home/me/proj');
  });

  it('returns null when no folder has been remembered', () => {
    expect(recallFolder()).toBeNull();
  });

  it('forgetFolder clears the stored value', () => {
    rememberFolder('/home/me/proj');
    forgetFolder();
    expect(recallFolder()).toBeNull();
  });
});
