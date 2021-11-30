import { BN } from 'ethereumjs-util';
import calculateBaseFeeRange from './calculateBaseFeeRange';

describe('calculateBaseFeeRange', () => {
  it('returns the min and max of base fees across the given blocks', () => {
    const baseFeeRange = calculateBaseFeeRange([
      {
        number: new BN(1),
        baseFeePerGas: new BN(300_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(2),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(3),
        baseFeePerGas: new BN(200_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
    ]);

    expect(baseFeeRange).toStrictEqual(['100', '300']);
  });
});
