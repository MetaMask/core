import { setDifference, setIntersection } from './utils';

describe('utils - setDifference()', () => {
  it('should return the difference between 2 sets', () => {
    const setA = new Set([1, 2, 3]);
    const setB = new Set([3, 4, 5]);

    const missingInSetA = Array.from(setDifference(setB, setA));
    expect(missingInSetA).toStrictEqual([4, 5]);

    const missingInSetB = Array.from(setDifference(setA, setB));
    expect(missingInSetB).toStrictEqual([1, 2]);
  });
});

describe('utils - setIntersection()', () => {
  it('should return values shared between 2 sets', () => {
    const setA = new Set([1, 2, 3]);
    const setB = new Set([3, 4, 5]);

    const inBothSets = Array.from(setIntersection(setA, setB));
    expect(inBothSets).toStrictEqual([3]);

    const inBothSetsWithParamsReversed = Array.from(
      setIntersection(setB, setA),
    );
    expect(inBothSetsWithParamsReversed).toStrictEqual([3]);
  });
});
