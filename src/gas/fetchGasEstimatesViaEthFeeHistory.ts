// This code is translated from the MetaSwap API:
// <https://gitlab.com/ConsenSys/codefi/products/metaswap/gas-api>

import { BN } from 'ethereumjs-util';
import { fromWei } from 'ethjs-unit';
import fetchBlockFeeHistory, { Block } from './fetchBlockFeeHistory';
import { Eip1559GasFee, GasFeeEstimates } from './GasFeeController';

type EthQuery = any;
type PriorityLevel = typeof PRIORITY_LEVELS[number];
type Percentile = typeof PRIORITY_LEVEL_PERCENTILES[number];

const NUMBER_OF_HISTORICAL_BLOCKS_TO_FETCH = 20_000;
const NUMBER_OF_RECENT_BLOCKS_TO_FETCH = 5;
const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const;
const PRIORITY_LEVEL_PERCENTILES = [10, 20, 30] as const;
const SETTINGS_BY_PRIORITY_LEVEL = {
  low: {
    percentile: 10 as Percentile,
    baseFeePercentageMultiplier: new BN(110),
    priorityFeePercentageMultiplier: new BN(94),
    minSuggestedMaxPriorityFeePerGas: new BN(1_000_000_000),
    estimatedWaitTimes: {
      minWaitTimeEstimate: 15_000,
      maxWaitTimeEstimate: 30_000,
    },
  },
  medium: {
    percentile: 20 as Percentile,
    baseFeePercentageMultiplier: new BN(120),
    priorityFeePercentageMultiplier: new BN(97),
    minSuggestedMaxPriorityFeePerGas: new BN(1_500_000_000),
    estimatedWaitTimes: {
      minWaitTimeEstimate: 15_000,
      maxWaitTimeEstimate: 45_000,
    },
  },
  high: {
    percentile: 30 as Percentile,
    baseFeePercentageMultiplier: new BN(125),
    priorityFeePercentageMultiplier: new BN(98),
    minSuggestedMaxPriorityFeePerGas: new BN(2_000_000_000),
    estimatedWaitTimes: {
      minWaitTimeEstimate: 15_000,
      maxWaitTimeEstimate: 60_000,
    },
  },
};

/**
 * Finds the median among a list of numbers. Note that this is different from the implementation
 * in the MetaSwap API, as we want to hold to using BN as much as possible.
 *
 * @param numbers - A list of numbers, as BNs. Will be sorted automatically if unsorted.
 * @returns The median number.
 */
function medianOf(numbers: BN[]): BN {
  const sortedNumbers = numbers.slice().sort((a, b) => a.cmp(b));
  const len = sortedNumbers.length;
  const index = Math.floor((len - 1) / 2);
  return sortedNumbers[index];
}

/**
 * Calculates a set of estimates assigned to a particular priority level based on the data returned
 * by `eth_feeHistory`.
 *
 * @param priorityLevel - The level of fees that dictates how soon a transaction may go through
 * ("low", "medium", or "high").
 * @param blocks - A set of blocks as obtained from {@link fetchBlockFeeHistory}.
 * @returns The estimates.
 */
function calculateGasEstimatesForPriorityLevel(
  priorityLevel: PriorityLevel,
  blocks: Block<Percentile>[],
): Eip1559GasFee {
  const latestBaseFeePerGas = blocks[blocks.length - 1].baseFeePerGas;
  const settings = SETTINGS_BY_PRIORITY_LEVEL[priorityLevel];

  const adjustedBaseFee = latestBaseFeePerGas
    .mul(settings.baseFeePercentageMultiplier)
    .divn(100);
  const priorityFees = blocks.map((block) => {
    return block.priorityFeesByPercentile[settings.percentile];
  });
  const medianPriorityFee = medianOf(priorityFees);
  const adjustedPriorityFee = medianPriorityFee
    .mul(settings.priorityFeePercentageMultiplier)
    .divn(100);
  const suggestedMaxPriorityFeePerGas = BN.max(
    adjustedPriorityFee,
    settings.minSuggestedMaxPriorityFeePerGas,
  );
  const suggestedMaxFeePerGas = adjustedBaseFee.add(
    suggestedMaxPriorityFeePerGas,
  );

  return {
    ...settings.estimatedWaitTimes,
    suggestedMaxPriorityFeePerGas: fromWei(
      suggestedMaxPriorityFeePerGas,
      'gwei',
    ),
    suggestedMaxFeePerGas: fromWei(suggestedMaxFeePerGas, 'gwei'),
  };
}

/**
 * Calculates a set of estimates suitable for different priority levels based on the data returned
 * by `eth_feeHistory`.
 *
 * @param blocks - A set of blocks as obtained from {@link fetchBlockFeeHistory}.
 * @returns The estimates.
 */
function calculateGasEstimatesForAllPriorityLevels(
  blocks: Block<Percentile>[],
): Pick<GasFeeEstimates, PriorityLevel> {
  return PRIORITY_LEVELS.reduce((obj, priorityLevel) => {
    const gasEstimatesForPriorityLevel = calculateGasEstimatesForPriorityLevel(
      priorityLevel,
      blocks,
    );
    return { ...obj, [priorityLevel]: gasEstimatesForPriorityLevel };
  }, {} as Pick<GasFeeEstimates, PriorityLevel>);
}

/**
 * Calculates the approximate normalized ranking of the latest base fee in the given blocks among
 * the entirety of the blocks. That is, sorts all of the base fees, then finds the rank of the first
 * base fee that meets or exceeds the latest base fee among the base fees. The result is the rank
 * normalized as a number between 0 and 1, where 0 means that the latest base fee is the least of
 * all and 1 means that the latest base fee is the greatest of all. This can ultimately be used to
 * render a visualization of the status of the network for users.
 *
 * @param blocks - A set of blocks as obtained from {@link fetchBlockFeeHistory}.
 * @returns A promise of a number between 0 and 1.
 */
async function calculateNetworkCongestionLevelFrom(
  blocks: Block<Percentile>[],
): Promise<number> {
  const latestBaseFeePerGas = blocks[blocks.length - 1].baseFeePerGas;
  const sortedBaseFeesPerGas = blocks
    .map((block) => block.baseFeePerGas)
    .sort((a, b) => a.cmp(b));
  const indexOfBaseFeeNearestToLatest = sortedBaseFeesPerGas.findIndex(
    (baseFeePerGas) => baseFeePerGas.gte(latestBaseFeePerGas),
  );
  return indexOfBaseFeeNearestToLatest !== -1
    ? indexOfBaseFeeNearestToLatest / (blocks.length - 1)
    : 0;
}

/**
 * Generates gas fee estimates based on gas fees that have been used in the recent past so that
 * those estimates can be displayed to users.
 *
 * To produce the estimates, the last 5 blocks are read from the network, and for each block, the
 * priority fees for transactions at the 10th, 20th, and 30th percentiles are also read (here
 * "percentile" signifies the level at which those transactions contribute to the overall gas used
 * for the block, where higher percentiles correspond to higher fees). This information is used to
 * calculate reasonable max priority and max fees for three different priority levels (higher
 * priority = higher fee).
 *
 * @param ethQuery - An EthQuery instance.
 * @returns Base and priority fee estimates, categorized by priority level, as well as an estimate
 * for the next block's base fee.
 */
export default async function fetchGasEstimatesViaEthFeeHistory(
  ethQuery: EthQuery,
): Promise<GasFeeEstimates> {
  const recentBlocks = await fetchBlockFeeHistory<Percentile>({
    ethQuery,
    numberOfBlocks: NUMBER_OF_RECENT_BLOCKS_TO_FETCH,
    percentiles: PRIORITY_LEVEL_PERCENTILES,
  });
  const latestBlock = recentBlocks[recentBlocks.length - 1];
  const historicalBlocks = await fetchBlockFeeHistory<Percentile>({
    ethQuery,
    numberOfBlocks: NUMBER_OF_HISTORICAL_BLOCKS_TO_FETCH,
    endBlock: latestBlock.number,
  });
  const levelSpecificGasEstimates = calculateGasEstimatesForAllPriorityLevels(
    recentBlocks,
  );
  const estimatedBaseFee = fromWei(latestBlock.baseFeePerGas, 'gwei');
  const networkCongestion = await calculateNetworkCongestionLevelFrom(
    historicalBlocks,
  );

  return {
    ...levelSpecificGasEstimates,
    estimatedBaseFee,
    networkCongestion,
  };
}
