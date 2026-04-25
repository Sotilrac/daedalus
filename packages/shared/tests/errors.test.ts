import { describe, expect, it } from 'vitest';
import { normalizeD2Error } from '../src/d2/errors.js';

describe('normalizeD2Error', () => {
  it('parses file:line:col messages', () => {
    const errs = normalizeD2Error(new Error('index.d2:3:5: unexpected token'));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      file: 'index.d2',
      line: 3,
      column: 5,
      message: 'unexpected token',
    });
  });

  it('falls back to a single message when format is unknown', () => {
    const errs = normalizeD2Error('something exploded');
    expect(errs).toEqual([{ message: 'something exploded', raw: 'something exploded' }]);
  });
});
