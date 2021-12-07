import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

jest.mock('./fetchBlockFeeHistory');

const mockedFetchBlockFeeHistory = mocked(fetchBlockFeeHistory, true);

describe('fetchGasEstimatesViaEthFeeHistory', () => {
  it('calculates target fees for low, medium, and high transaction priority levels, as well as the network congestion level', async () => {
    const ethQuery = {};
    when(mockedFetchBlockFeeHistory)
      .calledWith({
        ethQuery,
        numberOfBlocks: 5,
        percentiles: [10, 20, 30],
      })
      .mockResolvedValue([
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
      ])
      .calledWith({
        ethQuery,
        numberOfBlocks: 20_000,
        endBlock: new BN(3),
      })
      .mockResolvedValue([
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

    const gasFeeEstimates = await fetchGasEstimatesViaEthFeeHistory(ethQuery);

    expect(gasFeeEstimates).toStrictEqual({
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
      estimatedBaseFee: '200',
      networkCongestion: 0.5,
    });
  });
});
