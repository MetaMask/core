import { BN } from 'ethereumjs-util';
import calculatePriorityFeeTrend from './calculatePriorityFeeTrend';

describe('calculatePriorityFeeTrend', () => {
  it('returns "up" if the last priority fee at the 50th percentile among the blocks is greater than the first', () => {
    const priorityFeeTrend = calculatePriorityFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_000_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(900_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_100_000_000),
        },
      },
    ]);

    expect(priorityFeeTrend).toStrictEqual('up');
  });

  it('returns "down" if the last priority fee at the 50th percentile among the blocks is less than the first', () => {
    const priorityFeeTrend = calculatePriorityFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_000_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_100_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(900_000_000),
        },
      },
    ]);

    expect(priorityFeeTrend).toStrictEqual('down');
  });

  it('returns "level" if the last priority fee at the 50th percentile among the blocks is the same as the first', () => {
    const priorityFeeTrend = calculatePriorityFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_000_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_100_000_000),
        },
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          50: new BN(1_000_000_000),
        },
      },
    ]);

    expect(priorityFeeTrend).toStrictEqual('level');
  });
});
