import {
  getIfEntriesHaveDifferentSalts,
  setDifference,
  setIntersection,
} from './utils';

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

describe('utils - getIfEntriesHaveDifferentSalts()', () => {
  it('should return true if entries have different salts', () => {
    const entries = [
      {
        HashedKey:
          '997050281e559a2bb40d1c2e73d9f0887cbea1b81ff9dd7815917949e37f4f2f',
        Data: '{"v":"1","t":"scrypt","d":"1yC/ZXarV57HbqEZ46nH0JWgXfPl86nTHD7kai2g5gm290FM9tw5QjOaAAwIuQESEE8TIM/J9pIj7nmlGi+BZrevTtK3DXWXwnUQsCP7amKd5Q4gs3EEQgXpA0W+WJUgyElj869rwIv/C6tl5E2pK4j/0EAjMSIm1TGoj9FPohyRgZsOIt8VhZfb7w0GODsjPwPIkN6zazvJ3gAFYFPh7yRtebFs86z3fzqCWZ9zakdCHntchC2oZiaApXR9yzaPlGgnPg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
      {
        HashedKey:
          'e53d8feb65b4cf0c339e57bee2a81b155e056622f9192c54b707f928c8a42a7a',
        Data: '{"v":"1","t":"scrypt","d":"x7QqsdqsdEtUo7q/jG+UNkD/HOxQARGGRXsGPrLsDlkwDfgfoYlPI0To/M3pJRBlKD0RLEFIPHtHBEA5bv/2izB21VljvhMnhHfo0KgQ+e8Uq1t7grwa+r+ge3qbPNY+w78Xt8GtC+Hkrw5fORKvCn+xjzaCHYV6RxKYbp1TpyCJq7hDrr1XiyL8kqbpE0hAHALrrQOoV9/WXJi9pC5J118kquXx8CNA1P5wO/BXKp1AbryGR6kVW3lsp1sy3lYE/TApa5lTj+","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
    ];

    const result = getIfEntriesHaveDifferentSalts(entries);
    expect(result).toBe(true);
  });

  it('should return false if entries have the same salts', () => {
    const entries = [
      {
        HashedKey:
          '997050281e559a2bb40d1c2e73d9f0887cbea1b81ff9dd7815917949e37f4f2f',
        Data: '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4dIzFL/hGR4Y6hb2qUGrPb/hjxHVJUk1jcJAyHP9eUzgZQ==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
      {
        HashedKey:
          'e53d8feb65b4cf0c339e57bee2a81b155e056622f9192c54b707f928c8a42a7a',
        Data: '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4XYxpF0N3IXuhCpPM9dAyw5pO2gcqcXNucJs60rBtgKttA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
    ];

    const result = getIfEntriesHaveDifferentSalts(entries);
    expect(result).toBe(false);
  });
});
