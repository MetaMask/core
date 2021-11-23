import { BN } from 'ethereumjs-util';
import calculateNetworkCongestion from './calculateNetworkCongestion';

describe('calculateNetworkCongestion', () => {
  it('returns a number between 0 and 1 based on the base fee of the last given block vs. the base fees across all blocks', () => {
    const networkCongestion = calculateNetworkCongestion([
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
    expect(networkCongestion).toStrictEqual(0.5);
  });
});
