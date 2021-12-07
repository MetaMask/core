import { BN } from 'ethereumjs-util';
import { query, fromHex, toHex } from '../util';

type EthQuery = any;

/**
 * @type RequestChunkSpecifier
 *
 * Arguments to `eth_feeHistory` that can be used to fetch a set of historical data.
 * @property blockCount - The number of blocks requested.
 * @property endBlockNumber - The number of the block at the end of the requested range.
 */
type RequestChunkSpecifier = {
  numberOfBlocks: number;
  endBlockNumber: BN;
};

/**
 * @type EthFeeHistoryResponse
 *
 * Response data for `eth_feeHistory`.
 * @property oldestBlock - The id of the oldest block (in hex format) in the range of blocks
 * requested.
 * @property baseFeePerGas - Base fee per gas for each block in the range of blocks requested.
 * @property gasUsedRatio - A number between 0 and 1 that represents the gas used vs. gas limit for
 * each block in the range of blocks requested.
 * @property reward - The priority fee at the percentiles requested for each block in the range of
 * blocks requested.
 */

export type EthFeeHistoryResponse = {
  oldestBlock: string;
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  reward?: string[][];
};

/**
 * @type Block
 *
 * Historical data for a particular block.
 * @property number - The number of the block, as a BN.
 * @property baseFeePerGas - The base fee per gas for the block in WEI, as a BN.
 * @property gasUsedRatio - A number between 0 and 1 that represents the ratio between the gas paid
 * for the block and its set gas limit.
 * @property priorityFeesByPercentile - The priority fees paid for the transactions in the block
 * that occurred at particular levels at which those transactions contributed to the overall gas
 * used for the block, indexed by those percentiles. (See docs for {@link fetchBlockFeeHistory} for more
 * on how this works.)
 */
export type Block<Percentile extends number> = {
  number: BN;
  baseFeePerGas: BN;
  gasUsedRatio: number;
  priorityFeesByPercentile: Record<Percentile, BN>;
};

const MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL = 1024;

/**
 * Uses `eth_feeHistory` (an EIP-1559 feature) to obtain information about gas fees from a range of
 * blocks that have occurred recently on a network.
 *
 * To learn more, see these resources:
 *
 * - <https://infura.io/docs/ethereum#operation/eth_feeHistory>
 * - <https://github.com/zsfelfoldi/feehistory/blob/main/docs/feeHistory.md>
 * - <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L180>
 * - <https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1559.md>
 * - <https://gas-api.metaswap.codefi.network/testFeeHistory>
 *
 * @param args - The arguments to this function.
 * @param args.ethQuery - An EthQuery instance that wraps a provider for the network in question.
 * @param args.endBlock - The desired end of the requested block range. Can be "latest" if you want
 * to start from the latest successful block or the number of a known past block.
 * @param args.numberOfBlocks - How many total blocks to fetch. Note that if this is more than 1024,
 * multiple calls to `eth_feeHistory` will be made.
 * @param args.percentiles - A set of numbers between 1 and 100 which will dictate how
 * `priorityFeesByPercentile` in each returned block will be formed. When Ethereum runs the
 * `eth_feeHistory` method, for each block it is considering, it will first sort all transactions by
 * the priority fee. It will then go through each transaction and add the total amount of gas paid
 * for that transaction to a bucket which maxes out at the total gas used for the whole block. As
 * the bucket fills, it will cross percentages which correspond to the percentiles specified here,
 * and the priority fees of the first transactions which cause it to reach those percentages will be
 * recorded. Hence, `priorityFeesByPercentile` represents the priority fees of transactions at key
 * gas used contribution levels, where earlier levels have smaller contributions and later levels
 * have higher contributions.
 * @returns The list of blocks and their fee data, sorted from oldest to newest.
 */
export default async function fetchBlockFeeHistory<Percentile extends number>({
  ethQuery,
  numberOfBlocks: totalNumberOfBlocks,
  endBlock: givenEndBlock = 'latest',
  percentiles: givenPercentiles = [],
}: {
  ethQuery: EthQuery;
  numberOfBlocks: number;
  endBlock?: 'latest' | BN;
  percentiles?: readonly Percentile[];
}): Promise<Block<Percentile>[]> {
  const percentiles =
    givenPercentiles.length > 0
      ? Array.from(new Set(givenPercentiles)).sort((a, b) => a - b)
      : [];

  const finalEndBlockNumber =
    givenEndBlock === 'latest'
      ? await query(ethQuery, 'blockNumber')
      : givenEndBlock;

  const requestChunkSpecifiers = determineRequestChunkSpecifiers(
    finalEndBlockNumber,
    totalNumberOfBlocks,
  );

  const blockChunks = await Promise.all(
    requestChunkSpecifiers.map(({ numberOfBlocks, endBlockNumber }) => {
      return makeRequestForChunk({
        ethQuery,
        numberOfBlocks,
        endBlockNumber,
        percentiles,
      });
    }),
  );

  return blockChunks.reduce(
    (array, blocks) => [...array, ...blocks],
    [] as Block<Percentile>[],
  );
}

/**
 * Uses eth_feeHistory to request historical data about a group of blocks (max size 1024).
 *
 * @param args - The arguments
 * @param args.ethQuery - An EthQuery instance.
 * @param args.numberOfBlocks - The number of blocks in the chunk. Must be at most 1024, as this is
 * the maximum that `eth_feeHistory` can return in one call.
 * @param args.endBlockNumber - The end of the requested block range.
 * @param args.percentiles - A set of numbers betwen 1 and 100 that will be used to pull priority
 * fees for each block.
 * @returns A list of block data.
 */
async function makeRequestForChunk<Percentile extends number>({
  ethQuery,
  numberOfBlocks,
  endBlockNumber,
  percentiles,
}: {
  ethQuery: EthQuery;
  numberOfBlocks: number;
  endBlockNumber: BN;
  percentiles: readonly Percentile[];
}): Promise<Block<Percentile>[]> {
  const response: EthFeeHistoryResponse = await query(
    ethQuery,
    'eth_feeHistory',
    [toHex(numberOfBlocks), toHex(endBlockNumber), percentiles],
  );

  const startBlockNumber = fromHex(response.oldestBlock);

  if (
    response.baseFeePerGas.length > 0 &&
    response.gasUsedRatio.length > 0 &&
    (response.reward === undefined || response.reward.length > 0)
  ) {
    // Per
    // <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L191-L192>,
    // baseFeePerGas will always include an extra item which is the calculated base fee for the
    // next (future) block. We don't care about this, so chop it off.
    const baseFeesPerGasAsHex = response.baseFeePerGas.slice(0, numberOfBlocks);
    const gasUsedRatios = response.gasUsedRatio;
    const priorityFeePercentileGroups = response.reward ?? [];

    return baseFeesPerGasAsHex.map((baseFeePerGasAsHex, blockIndex) => {
      const baseFeePerGas = fromHex(baseFeePerGasAsHex);
      const gasUsedRatio = gasUsedRatios[blockIndex];
      const number = startBlockNumber.addn(blockIndex);

      const priorityFeesForEachPercentile =
        priorityFeePercentileGroups[blockIndex];

      const priorityFeesByPercentile = percentiles.reduce(
        (obj, percentile, percentileIndex) => {
          const priorityFee = priorityFeesForEachPercentile[percentileIndex];
          return { ...obj, [percentile]: fromHex(priorityFee) };
        },
        {} as Record<Percentile, BN>,
      );

      return {
        number,
        baseFeePerGas,
        gasUsedRatio,
        priorityFeesByPercentile,
      };
    });
  }

  return [];
}

/**
 * Divides a block range (specified by a range size and the end of the range) into chunks based on
 * the maximum number of blocks that `eth_feeHistory` can return in a single call.
 *
 * @param endBlockNumber - The final block in the complete desired block range after all
 * `eth_feeHistory` requests have been made.
 * @param totalNumberOfBlocks - The total number of desired blocks after all `eth_feeHistory`
 * requests have been made.
 * @returns A set of arguments that can be used to make requests to `eth_feeHistory` in order to
 * retrieve all of the requested blocks, sorted from oldest block to newest block.
 */
function determineRequestChunkSpecifiers(
  endBlockNumber: BN,
  totalNumberOfBlocks: number,
): RequestChunkSpecifier[] {
  const specifiers = [];
  for (
    let chunkStartBlockNumber = endBlockNumber.subn(totalNumberOfBlocks);
    chunkStartBlockNumber.lt(endBlockNumber);
    chunkStartBlockNumber = chunkStartBlockNumber.addn(
      MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL,
    )
  ) {
    const distanceToEnd = endBlockNumber.sub(chunkStartBlockNumber).toNumber();
    const numberOfBlocks =
      distanceToEnd < MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL
        ? distanceToEnd
        : MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL;
    const chunkEndBlockNumber = chunkStartBlockNumber.addn(numberOfBlocks);
    specifiers.push({ numberOfBlocks, endBlockNumber: chunkEndBlockNumber });
  }
  return specifiers;
}
