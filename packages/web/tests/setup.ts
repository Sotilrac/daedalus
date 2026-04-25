// Stub the Tauri bridge so component tests don't try to talk to a native shell.
import { vi } from 'vitest';

// jsdom doesn't ship ResizeObserver; the editor canvas uses one to track host
// size. A no-op stub is enough for the smoke test.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));
