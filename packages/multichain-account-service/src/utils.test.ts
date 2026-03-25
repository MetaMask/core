import {
  toErrorMessage,
  assertGroupIndexRangeIsValid,
  assertGroupIndexIsValid,
} from './utils';

describe('toErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    const error = new Error('something went wrong');
    expect(toErrorMessage(error)).toBe(error.message);
  });

  it('returns the string representation of a non-Error value', () => {
    expect(toErrorMessage('raw string')).toBe('raw string');
  });

  it('converts a number to string', () => {
    expect(toErrorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(toErrorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(toErrorMessage(undefined)).toBe('undefined');
  });

  it('converts an object to string', () => {
    expect(toErrorMessage({ foo: 'bar' })).toBe('[object Object]');
  });
});

describe('assertGroupIndexRangeIsValid', () => {
  describe('when range is valid', () => {
    it.each([
      { from: 0, to: 5 },
      { from: 1, to: 10 },
      { from: 5, to: 5 },
      { to: 5 },
      { to: 0 },
      { from: 3, to: 3 },
    ])('does not throw for valid range: %o', (range) => {
      expect(() => assertGroupIndexRangeIsValid(range)).not.toThrow();
    });
  });

  describe('when range is invalid', () => {
    it.each([
      { from: -1, to: 5 },
      { from: -10, to: 0 },
    ])('throws when from is negative: %o', (range) => {
      expect(() => assertGroupIndexRangeIsValid(range)).toThrow(
        `Bad range, from (${range.from}) must be >= 0`,
      );
    });

    it.each([{ from: 0, to: -1 }, { to: -5 }])(
      'throws when to is negative: %o',
      (range) => {
        expect(() => assertGroupIndexRangeIsValid(range)).toThrow(
          `Bad range, to (${range.to}) must be >= 0`,
        );
      },
    );

    it.each([
      { from: 5, to: 3 },
      { from: 10, to: 2 },
    ])('throws when to is less than from: %o', (range) => {
      expect(() => assertGroupIndexRangeIsValid(range)).toThrow(
        `Bad range, to (${range.to}) must be >= from (${range.from})`,
      );
    });

    it.each([{ from: -1, to: -2 }])(
      'throws when both from and to are negative (prioritizes from validation): %o',
      (range) => {
        expect(() => assertGroupIndexRangeIsValid(range)).toThrow(
          `Bad range, from (${range.from}) must be >= 0`,
        );
      },
    );
  });
});

describe('assertGroupIndexIsValid', () => {
  describe('when group index is valid', () => {
    it.each([
      { groupIndex: 0, nextGroupIndex: 5 },
      { groupIndex: 3, nextGroupIndex: 10 },
      { groupIndex: 5, nextGroupIndex: 5 },
      { groupIndex: 0, nextGroupIndex: 0 },
    ])(
      'does not throw for valid group index: $groupIndex <= $nextGroupIndex',
      ({ groupIndex, nextGroupIndex }) => {
        expect(() =>
          assertGroupIndexIsValid(groupIndex, nextGroupIndex),
        ).not.toThrow();
      },
    );
  });

  describe('when group index is invalid', () => {
    it.each([
      { groupIndex: 6, nextGroupIndex: 5 },
      { groupIndex: 10, nextGroupIndex: 3 },
      { groupIndex: 1, nextGroupIndex: 0 },
    ])(
      'throws when group index is greater than next group index: $groupIndex > $nextGroupIndex',
      ({ groupIndex, nextGroupIndex }) => {
        expect(() =>
          assertGroupIndexIsValid(groupIndex, nextGroupIndex),
        ).toThrow(
          `Bad group index, groupIndex (${groupIndex}) cannot be higher than the next available one (<= ${nextGroupIndex})`,
        );
      },
    );
  });
});
