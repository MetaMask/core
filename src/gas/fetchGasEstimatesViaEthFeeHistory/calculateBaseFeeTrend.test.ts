import { BN } from 'ethereumjs-util';
import calculateBaseFeeTrend from './calculateBaseFeeTrend';

describe('calculateBaseFeeTrend', () => {
  it('returns "up" if the base fee of the last block is greater than the first', () => {
    const baseFeeTrend = calculateBaseFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(95_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(110_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
    ]);

    expect(baseFeeTrend).toStrictEqual('up');
  });

  it('returns "down" if the base fee of the last block is less than the first', () => {
    const baseFeeTrend = calculateBaseFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(110_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(95_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
    ]);

    expect(baseFeeTrend).toStrictEqual('down');
  });

  it('returns "level" if the base fee of the last block is the same as the first', () => {
    const baseFeeTrend = calculateBaseFeeTrend([
      {
        number: new BN(1),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(110_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
      {
        number: new BN(1),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {},
      },
    ]);

    expect(baseFeeTrend).toStrictEqual('level');
  });
});
