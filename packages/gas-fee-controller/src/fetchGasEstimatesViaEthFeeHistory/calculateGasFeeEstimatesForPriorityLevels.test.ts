import { BN } from 'ethereumjs-util';
import calculateGasFeeEstimatesForPriorityLevels from './calculateGasFeeEstimatesForPriorityLevels';

describe('calculateGasFeeEstimatesForPriorityLevels', () => {
  it('calculates a set of gas fee estimates targeting various priority levels based on the given blocks', () => {
    const estimates = calculateGasFeeEstimatesForPriorityLevels([
      {
        number: new BN(1),
        baseFeePerGas: new BN(300_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(0),
          20: new BN(1_000_000_000),
          30: new BN(0),
        },
      },
      {
        number: new BN(2),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          20: new BN(1_600_000_000),
          30: new BN(3_000_000_000),
        },
      },
      {
        number: new BN(3),
        baseFeePerGas: new BN(200_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          20: new BN(2_000_000_000),
          30: new BN(3_000_000_000),
        },
      },
    ]);

    expect(estimates).toStrictEqual({
      low: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 30_000,
        suggestedMaxPriorityFeePerGas: '1',
        suggestedMaxFeePerGas: '221',
      },
      medium: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 45_000,
        suggestedMaxPriorityFeePerGas: '1.552',
        suggestedMaxFeePerGas: '241.552',
      },
      high: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 60_000,
        suggestedMaxPriorityFeePerGas: '2.94',
        suggestedMaxFeePerGas: '252.94',
      },
    });
  });
});
