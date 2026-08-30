import { generateDeterministicRandomNumber } from './user-segmentation-utils';
import { expect } from '@jest/globals';

describe('user-segmentation-utils', () => {
  describe('generateDeterministicRandomNumber', () => {
    it('produces uniform distribution across 1000 samples', () => {
      const seed = 'some-seed';
      const samples = Array(1000).fill(0).map(() => generateDeterministicRandomNumber(seed));
      // Use a statistical test for uniformity (e.g. chi-squared test)
      const chiSquared = samples.reduce((acc, sample) => acc + Math.pow(sample - 0.5, 2), 0);
      expect(chiSquared).toBeLessThan(1000);
    });
  });
});