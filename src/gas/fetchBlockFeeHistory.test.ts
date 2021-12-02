import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import { query, fromHex, toHex } from '../util';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';

jest.mock('../util', () => {
  return {
    ...jest.requireActual('../util'),
    __esModule: true,
    query: jest.fn(),
  };
});

const mockedQuery = mocked(query, true);

/**
 * Calls the given function the given number of times, collecting the results from each call.
 *
 * @param n - The number of times you want to call the function.
 * @param fn - The function to call.
 * @returns An array of values gleaned from the results of each call to the function.
 */
function times<T>(n: number, fn: (n: number) => T): T[] {
  const values = [];
  for (let i = 0; i < n; i++) {
    values.push(fn(i));
  }
  return values;
}

describe('fetchBlockFeeHistory', () => {
  const ethQuery = { eth: 'query' };

  describe('with a minimal set of arguments', () => {
    const latestBlockNumber = 3;
    const numberOfRequestedBlocks = 3;

    beforeEach(() => {
      when(mockedQuery)
        .calledWith(ethQuery, 'blockNumber')
        .mockResolvedValue(new BN(latestBlockNumber));
    });

    it('should return a representation of fee history from the Ethereum network, organized by block rather than type of data', async () => {
      when(mockedQuery)
        .calledWith(ethQuery, 'eth_feeHistory', [
          toHex(numberOfRequestedBlocks),
          toHex(latestBlockNumber),
          [],
        ])
        .mockResolvedValue({
          oldestBlock: toHex(1),
          // Note that this array contains 4 items when the request was made for 3. Per
          // <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L191-L192>,
          // baseFeePerGas will always include an extra item which is the calculated base fee for the
          // next (future) block.
          baseFeePerGas: [
            toHex(10_000_000_000),
            toHex(20_000_000_000),
            toHex(30_000_000_000),
            toHex(40_000_000_000),
          ],
          gasUsedRatio: [0.1, 0.2, 0.3],
        });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
      });

      expect(feeHistory).toStrictEqual([
        {
          number: new BN(1),
          baseFeePerGas: new BN(10_000_000_000),
          gasUsedRatio: 0.1,
          priorityFeesByPercentile: {},
        },
        {
          number: new BN(2),
          baseFeePerGas: new BN(20_000_000_000),
          gasUsedRatio: 0.2,
          priorityFeesByPercentile: {},
        },
        {
          number: new BN(3),
          baseFeePerGas: new BN(30_000_000_000),
          gasUsedRatio: 0.3,
          priorityFeesByPercentile: {},
        },
      ]);
    });

    it('should be able to handle an "empty" response from eth_feeHistory', async () => {
      when(mockedQuery)
        .calledWith(ethQuery, 'eth_feeHistory', [
          toHex(numberOfRequestedBlocks),
          toHex(latestBlockNumber),
          [],
        ])
        .mockResolvedValue({
          oldestBlock: toHex(0),
          baseFeePerGas: [],
          gasUsedRatio: [],
        });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
      });

      expect(feeHistory).toStrictEqual([]);
    });
  });

  describe('given a numberOfBlocks that exceeds the max limit that the EVM returns', () => {
    it('divides the number into chunks and calls eth_feeHistory for each chunk', async () => {
      const latestBlockNumber = 2348;
      const numberOfRequestedBlocks = 2348;
      const expectedChunks = [
        { startBlockNumber: 1, endBlockNumber: 1024 },
        { startBlockNumber: 1025, endBlockNumber: 2048 },
        { startBlockNumber: 2049, endBlockNumber: 2348 },
      ];
      const expectedBlocks = times(numberOfRequestedBlocks, (i) => {
        return {
          number: i + 1,
          baseFeePerGas: toHex(1_000_000_000 * (i + 1)),
          gasUsedRatio: (i + 1) / numberOfRequestedBlocks,
        };
      });

      when(mockedQuery)
        .calledWith(ethQuery, 'blockNumber')
        .mockResolvedValue(new BN(latestBlockNumber));

      expectedChunks.forEach(({ startBlockNumber, endBlockNumber }) => {
        const baseFeePerGas = expectedBlocks
          .slice(startBlockNumber - 1, endBlockNumber + 1)
          .map((block) => block.baseFeePerGas);
        const gasUsedRatio = expectedBlocks
          .slice(startBlockNumber - 1, endBlockNumber)
          .map((block) => block.gasUsedRatio);

        when(mockedQuery)
          .calledWith(ethQuery, 'eth_feeHistory', [
            toHex(endBlockNumber - startBlockNumber + 1),
            toHex(endBlockNumber),
            [],
          ])
          .mockResolvedValue({
            oldestBlock: toHex(startBlockNumber),
            baseFeePerGas,
            gasUsedRatio,
          });
      });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
      });

      expect(feeHistory).toStrictEqual(
        expectedBlocks.map((block) => {
          return {
            number: new BN(block.number),
            baseFeePerGas: fromHex(block.baseFeePerGas),
            gasUsedRatio: block.gasUsedRatio,
            priorityFeesByPercentile: {},
          };
        }),
      );
    });
  });

  describe('given an endBlock of a BN', () => {
    it('should pass it to the eth_feeHistory call', async () => {
      const latestBlockNumber = 3;
      const numberOfRequestedBlocks = 3;
      const endBlock = new BN(latestBlockNumber);
      when(mockedQuery)
        .calledWith(ethQuery, 'eth_feeHistory', [
          toHex(numberOfRequestedBlocks),
          toHex(endBlock),
          [],
        ])
        .mockResolvedValue({
          oldestBlock: toHex(0),
          baseFeePerGas: [],
          gasUsedRatio: [],
        });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
        endBlock,
      });

      expect(feeHistory).toStrictEqual([]);
    });
  });

  describe('given percentiles', () => {
    const latestBlockNumber = 3;
    const numberOfRequestedBlocks = 3;

    beforeEach(() => {
      when(mockedQuery)
        .calledWith(ethQuery, 'blockNumber')
        .mockResolvedValue(new BN(latestBlockNumber));
    });

    it('should match each item in the "reward" key from the response to its percentile', async () => {
      when(mockedQuery)
        .calledWith(ethQuery, 'eth_feeHistory', [
          toHex(numberOfRequestedBlocks),
          toHex(latestBlockNumber),
          [10, 20, 30],
        ])
        .mockResolvedValue({
          oldestBlock: toHex(1),
          // Note that this array contains 4 items when the request was made for 3. Per
          // <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L191-L192>,
          // baseFeePerGas will always include an extra item which is the calculated base fee for the
          // next (future) block.
          baseFeePerGas: [
            toHex(100_000_000_000),
            toHex(200_000_000_000),
            toHex(300_000_000_000),
            toHex(400_000_000_000),
          ],
          gasUsedRatio: [0.1, 0.2, 0.3],
          reward: [
            [
              toHex(10_000_000_000),
              toHex(15_000_000_000),
              toHex(20_000_000_000),
            ],
            [toHex(0), toHex(10_000_000_000), toHex(15_000_000_000)],
            [
              toHex(20_000_000_000),
              toHex(20_000_000_000),
              toHex(30_000_000_000),
            ],
          ],
        });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
        percentiles: [10, 20, 30],
      });

      expect(feeHistory).toStrictEqual([
        {
          number: new BN(1),
          baseFeePerGas: new BN(100_000_000_000),
          gasUsedRatio: 0.1,
          priorityFeesByPercentile: {
            10: new BN(10_000_000_000),
            20: new BN(15_000_000_000),
            30: new BN(20_000_000_000),
          },
        },
        {
          number: new BN(2),
          baseFeePerGas: new BN(200_000_000_000),
          gasUsedRatio: 0.2,
          priorityFeesByPercentile: {
            10: new BN(0),
            20: new BN(10_000_000_000),
            30: new BN(15_000_000_000),
          },
        },
        {
          number: new BN(3),
          baseFeePerGas: new BN(300_000_000_000),
          gasUsedRatio: 0.3,
          priorityFeesByPercentile: {
            10: new BN(20_000_000_000),
            20: new BN(20_000_000_000),
            30: new BN(30_000_000_000),
          },
        },
      ]);
    });

    it('should be able to handle an "empty" response from eth_feeHistory including an empty "reward" array', async () => {
      when(mockedQuery)
        .calledWith(ethQuery, 'eth_feeHistory', [
          toHex(numberOfRequestedBlocks),
          toHex(latestBlockNumber),
          [10, 20, 30],
        ])
        .mockResolvedValue({
          oldestBlock: toHex(0),
          baseFeePerGas: [],
          gasUsedRatio: [],
          reward: [],
        });

      const feeHistory = await fetchBlockFeeHistory({
        ethQuery,
        numberOfBlocks: numberOfRequestedBlocks,
        percentiles: [10, 20, 30],
      });

      expect(feeHistory).toStrictEqual([]);
    });
  });
});
