import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import { buildFakeEthQuery } from '../../tests/util';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';
import calculateGasFeeEstimatesForPriorityLevels from './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels';
import fetchLatestBlock from './fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

jest.mock('./fetchBlockFeeHistory');
jest.mock(
  './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels',
);
jest.mock('./fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock');

const mockedFetchBlockFeeHistory = mocked(fetchBlockFeeHistory, true);
const mockedCalculateGasFeeEstimatesForPriorityLevels = mocked(
  calculateGasFeeEstimatesForPriorityLevels,
  true,
);
const mockedFetchLatestBlock = mocked(fetchLatestBlock, true);

describe('fetchGasEstimatesViaEthFeeHistory', () => {
  const latestBlock = {
    number: new BN(1),
    baseFeePerGas: new BN(100_000_000_000),
  };
  const ethQuery = buildFakeEthQuery({
    blockNumber: async () => latestBlock.number,
    getBlockByNumber: async () => latestBlock,
  });

  it('calculates target fees for low, medium, and high transaction priority levels', async () => {
    const blocks = [
      {
        number: new BN(3),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
        priorityFeesByPercentile: {
          10: new BN('0'),
          20: new BN('0'),
          30: new BN('0'),
        },
      },
    ];
    const levelSpecificEstimates = {
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
    };

    mockedFetchLatestBlock.mockResolvedValue(latestBlock);
    when(mockedFetchBlockFeeHistory)
      .calledWith({
        ethQuery,
        endBlock: latestBlock.number,
        numberOfBlocks: 5,
        percentiles: [10, 20, 30],
      })
      .mockResolvedValue(blocks);

    when(mockedCalculateGasFeeEstimatesForPriorityLevels)
      .calledWith(blocks)
      .mockReturnValue(levelSpecificEstimates);

    const gasFeeEstimates = await fetchGasEstimatesViaEthFeeHistory(ethQuery);

    expect(gasFeeEstimates).toStrictEqual({
      ...levelSpecificEstimates,
      estimatedBaseFee: '100',
      historicalBaseFeeRange: null,
      baseFeeTrend: null,
      latestPriorityFeeRange: null,
      historicalPriorityFeeRange: null,
      priorityFeeTrend: null,
      networkCongestion: null,
    });
  });
});
