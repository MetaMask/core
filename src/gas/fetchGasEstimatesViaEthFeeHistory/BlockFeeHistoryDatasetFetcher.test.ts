import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import fetchBlockFeeHistory, { FeeHistoryBlock } from '../fetchBlockFeeHistory';
import { EthQuery } from './types';
import BlockFeeHistoryDatasetFetcher from './BlockFeeHistoryDatasetFetcher';

jest.mock('../fetchBlockFeeHistory');

const mockedFetchBlockFeeHistory = mocked(fetchBlockFeeHistory, true);

describe('BlockFeeHistoryDatasetFetcher', () => {
  let fakeEthQuery: EthQuery;
  let fakeEndBlockNumber: BN;
  let fakeBlocks: FeeHistoryBlock<never>[];

  beforeEach(() => {
    fakeEthQuery = {
      async getBlockByNumber() {
        return { number: new BN(1), baseFeePerGas: new BN(1) };
      },
    };
    fakeEndBlockNumber = new BN(1);
    fakeBlocks = [
      {
        number: new BN(1),
        baseFeePerGas: new BN(1),
        gasUsedRatio: 1,
      },
    ];
  });

  describe('forMediumRange', () => {
    it('returns 200 blocks along with the 10th and 95th reward percentiles (excluding the next block)', async () => {
      when(mockedFetchBlockFeeHistory)
        .calledWith({
          ethQuery: fakeEthQuery,
          endBlock: fakeEndBlockNumber,
          numberOfBlocks: 200,
          percentiles: [10, 95],
          includeNextBlock: true,
        })
        .mockResolvedValue(fakeBlocks);

      const fetcher = new BlockFeeHistoryDatasetFetcher({
        ethQuery: fakeEthQuery,
        endBlockNumber: fakeEndBlockNumber,
      });

      expect(await fetcher.forMediumRange()).toStrictEqual(fakeBlocks);
    });
  });

  describe('forSmallRange', () => {
    it('returns 5 blocks along with the 10th, 20th, and 30th reward percentiles (excluding the next block)', async () => {
      when(mockedFetchBlockFeeHistory)
        .calledWith({
          ethQuery: fakeEthQuery,
          endBlock: fakeEndBlockNumber,
          numberOfBlocks: 5,
          percentiles: [10, 20, 30],
        })
        .mockResolvedValue(fakeBlocks);

      const fetcher = new BlockFeeHistoryDatasetFetcher({
        ethQuery: fakeEthQuery,
        endBlockNumber: fakeEndBlockNumber,
      });

      expect(await fetcher.forSmallRange()).toStrictEqual(fakeBlocks);
    });
  });

  describe('forTinyRange', () => {
    it('returns 2 blocks along with the 50th reward percentiles (excluding the next block)', async () => {
      when(mockedFetchBlockFeeHistory)
        .calledWith({
          ethQuery: fakeEthQuery,
          endBlock: fakeEndBlockNumber,
          numberOfBlocks: 2,
          percentiles: [50],
        })
        .mockResolvedValue(fakeBlocks);

      const fetcher = new BlockFeeHistoryDatasetFetcher({
        ethQuery: fakeEthQuery,
        endBlockNumber: fakeEndBlockNumber,
      });

      expect(await fetcher.forTinyRange()).toStrictEqual(fakeBlocks);
    });
  });
});
