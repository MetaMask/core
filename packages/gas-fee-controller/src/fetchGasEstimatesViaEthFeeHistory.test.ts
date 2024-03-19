import EthQuery from '@metamask/eth-query';
import BN from 'bn.js';
import { when } from 'jest-when';

import fetchBlockFeeHistory from './fetchBlockFeeHistory';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';
import calculateGasFeeEstimatesForPriorityLevels from './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels';
import fetchLatestBlock from './fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock';

jest.mock('./fetchBlockFeeHistory');
jest.mock(
  './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels',
);
jest.mock('./fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock');

const mockedFetchBlockFeeHistory = fetchBlockFeeHistory as jest.Mock<
  ReturnType<typeof fetchBlockFeeHistory>,
  Parameters<typeof fetchBlockFeeHistory>
>;
const mockedCalculateGasFeeEstimatesForPriorityLevels =
  calculateGasFeeEstimatesForPriorityLevels as jest.Mock<
    ReturnType<typeof calculateGasFeeEstimatesForPriorityLevels>,
    Parameters<typeof calculateGasFeeEstimatesForPriorityLevels>
  >;
const mockedFetchLatestBlock = fetchLatestBlock as jest.Mock<
  ReturnType<typeof fetchLatestBlock>,
  Parameters<typeof fetchLatestBlock>
>;

describe('fetchGasEstimatesViaEthFeeHistory', () => {
  const latestBlock = {
    number: new BN(1),
    baseFeePerGas: new BN(100_000_000_000),
  };
  const mockEthQuery = {
    sendAsync: EthQuery.prototype.sendAsync,
    blockNumber: async () => latestBlock.number,
    getBlockByNumber: async () => latestBlock,
  };

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
        ethQuery: mockEthQuery,
        endBlock: latestBlock.number,
        numberOfBlocks: 5,
        percentiles: [10, 20, 30],
      })
      .mockResolvedValue(blocks);

    when(mockedCalculateGasFeeEstimatesForPriorityLevels)
      .calledWith(blocks)
      .mockReturnValue(levelSpecificEstimates);

    const gasFeeEstimates = await fetchGasEstimatesViaEthFeeHistory(
      mockEthQuery,
    );

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
