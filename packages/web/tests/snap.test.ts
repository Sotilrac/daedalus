import { describe, expect, it } from 'vitest';
import { snap } from '@daedalus/shared/layout';

describe('shared resolves through path alias', () => {
  it('the alias is wired up correctly', () => {
    expect(snap(17, 16)).toBe(16);
  });
});
