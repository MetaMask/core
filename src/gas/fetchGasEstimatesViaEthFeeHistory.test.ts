import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

jest.mock('./fetchBlockFeeHistory');

const mockedFetchFeeHistory = mocked(fetchBlockFeeHistory, true);

describe('fetchGasEstimatesViaEthFeeHistory', () => {
  it('calculates target fees for low, medium, and high transaction priority levels', async () => {
    const ethQuery = {};
    mockedFetchFeeHistory.mockResolvedValue([
      {
        number: new BN(1),
        baseFeePerGas: new BN(0),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(0),
          20: new BN(1_000_000_000),
          30: new BN(0),
        },
      },
      {
        number: new BN(2),
        baseFeePerGas: new BN(0),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          20: new BN(1_600_000_000),
          30: new BN(3_000_000_000),
        },
      },
      {
        number: new BN(3),
        baseFeePerGas: new BN(100_000_000_000),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN(500_000_000),
          20: new BN(2_000_000_000),
          30: new BN(3_000_000_000),
        },
      },
    ]);

    const gasFeeEstimates = await fetchGasEstimatesViaEthFeeHistory(ethQuery);

    expect(gasFeeEstimates).toStrictEqual({
      low: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 30_000,
        suggestedMaxPriorityFeePerGas: '1',
        suggestedMaxFeePerGas: '121',
      },
      medium: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 45_000,
        suggestedMaxPriorityFeePerGas: '1.552',
        suggestedMaxFeePerGas: '131.552',
      },
      high: {
        minWaitTimeEstimate: 15_000,
        maxWaitTimeEstimate: 60_000,
        suggestedMaxPriorityFeePerGas: '2.94',
        suggestedMaxFeePerGas: '142.94',
      },
      estimatedBaseFee: '100',
    });
  });
});
