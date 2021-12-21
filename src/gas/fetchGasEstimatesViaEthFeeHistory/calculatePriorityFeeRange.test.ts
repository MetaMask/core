import { BN } from 'ethereumjs-util';
import calculatePriorityFeeRange from './calculatePriorityFeeRange';

describe('calculatePriorityFeeRange', () => {
  it('returns the min and max of priority fees across the given blocks (omitting 0)', () => {
    const blocks = [
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(0),
          95: new BN(1_000_000_000),
        },
      },
      {
        number: new BN(2),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          95: new BN(1_600_000_000),
        },
      },
      {
        number: new BN(3),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          95: new BN(2_000_000_000),
        },
      },
    ];

    const priorityFeeRange = calculatePriorityFeeRange(blocks);

    expect(priorityFeeRange).toStrictEqual(['0.5', '2']);
  });
});
