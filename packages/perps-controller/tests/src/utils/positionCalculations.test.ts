import { describe, expect, it } from 'vitest';

import { getPositionDirection } from '../../../src/utils/positionCalculations.js';

describe('getPositionDirection', () => {
  it.each([
    ['1.5', 'long'],
    [2, 'long'],
    ['-0.2', 'short'],
    [-3, 'short'],
  ])('reads %s as %s', (size, expected) => {
    expect(getPositionDirection(size)).toBe(expected);
  });

  it.each(['0', 0, '-0', '', 'abc', Number.NaN, Number.POSITIVE_INFINITY])(
    'returns undefined for %s',
    (size) => {
      expect(getPositionDirection(size)).toBeUndefined();
    },
  );
});
