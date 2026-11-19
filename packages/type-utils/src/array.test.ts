import { describe, expect, it } from 'vitest';

import { isNonEmptyArray } from './array.js';

describe('isNonEmptyArray', () => {
  it('identifies non-empty arrays', () => {
    [[1], [1, 2], [1, 2, 3, 4, 5]].forEach((nonEmptyArray) => {
      expect(isNonEmptyArray<unknown>(nonEmptyArray)).toBe(true);
    });
  });

  it('identifies empty arrays', () => {
    expect(isNonEmptyArray<unknown>([])).toBe(false);
  });
});
