import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import BlockFeeHistoryDatasetFetcher from './fetchGasEstimatesViaEthFeeHistory/BlockFeeHistoryDatasetFetcher';
import calculateGasFeeEstimatesForPriorityLevels from './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels';
import calculateNetworkCongestion from './fetchGasEstimatesViaEthFeeHistory/calculateNetworkCongestion';
import fetchLatestBlock from './fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

jest.mock('./fetchGasEstimatesViaEthFeeHistory/BlockFeeHistoryDatasetFetcher');
jest.mock(
  './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels',
);
jest.mock('./fetchGasEstimatesViaEthFeeHistory/calculateNetworkCongestion');
jest.mock('./fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock');

const mockedBlockFeeHistoryDatasetFetcherConstructor = mocked(
  BlockFeeHistoryDatasetFetcher,
  true,
);
const mockedCalculateGasFeeEstimatesForPriorityLevels = mocked(
  calculateGasFeeEstimatesForPriorityLevels,
  true,
);
const mockedCalculateNetworkCongestion = mocked(
  calculateNetworkCongestion,
  true,
);
const mockedFetchLatestBlock = mocked(fetchLatestBlock, true);

describe('fetchGasEstimatesViaEthFeeHistory', () => {
  const latestBlock = {
    number: new BN(1),
    baseFeePerGas: new BN(100_000_000_000),
  };
  const ethQuery = {
    blockNumber: async () => latestBlock.number,
    getBlockByNumber: async () => latestBlock,
  };

  it('calculates target fees for low, medium, and high transaction priority levels, as well as the network congestion level', async () => {
    const blocksByDataset = {
      longRange: [
        {
          number: new BN(1),
          baseFeePerGas: new BN(1),
          gasUsedRatio: 1,
          priorityFeesByPercentile: {},
        },
      ],
      mediumRange: [
        {
          number: new BN(2),
          baseFeePerGas: new BN(1),
          gasUsedRatio: 1,
          priorityFeesByPercentile: {
            10: new BN('0'),
            95: new BN('0'),
          },
        },
      ],
      smallRange: [
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
      ],
      tinyRange: [
        {
          number: new BN(4),
          baseFeePerGas: new BN(1),
          gasUsedRatio: 1,
          priorityFeesByPercentile: {
            50: new BN('0'),
          },
        },
      ],
      latest: [
        {
          number: new BN(5),
          baseFeePerGas: new BN(1),
          gasUsedRatio: 1,
          priorityFeesByPercentile: {
            10: new BN('0'),
            95: new BN('0'),
          },
        },
      ],
    };
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
    const networkCongestion = 0.5;

    mockedFetchLatestBlock.mockResolvedValue(latestBlock);
    mockedBlockFeeHistoryDatasetFetcherConstructor.prototype.forLongRange.mockResolvedValue(
      blocksByDataset.longRange,
    );

    mockedBlockFeeHistoryDatasetFetcherConstructor.prototype.forSmallRange.mockResolvedValue(
      blocksByDataset.smallRange,
    );

    when(mockedCalculateGasFeeEstimatesForPriorityLevels)
      .calledWith(blocksByDataset.smallRange)
      .mockReturnValue(levelSpecificEstimates);

    when(mockedCalculateNetworkCongestion)
      .calledWith(blocksByDataset.longRange)
      .mockReturnValue(networkCongestion);

    const gasFeeEstimates = await fetchGasEstimatesViaEthFeeHistory(ethQuery);

    expect(gasFeeEstimates).toStrictEqual({
      ...levelSpecificEstimates,
      estimatedBaseFee: '100',
      networkCongestion,
    });
  });
});
