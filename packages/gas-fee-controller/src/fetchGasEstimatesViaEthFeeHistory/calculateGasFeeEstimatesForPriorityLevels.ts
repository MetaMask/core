import { GWEI } from '@metamask/controller-utils';
import { fromWei } from '@metamask/ethjs-unit';
import BN from 'bn.js';

import type { FeeHistoryBlock } from '../fetchBlockFeeHistory';
import type { Eip1559GasFee, GasFeeEstimates } from '../GasFeeController';
import medianOf from './medianOf';

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];
export type Percentile = (typeof PRIORITY_LEVEL_PERCENTILES)[number];

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
 * Calculates a set of estimates assigned to a particular priority level based on the data returned
 * by `eth_feeHistory`.
 *
 * @param priorityLevel - The level of fees that dictates how soon a transaction may go through
 * ("low", "medium", or "high").
 * @param blocks - A set of blocks as obtained from {@link fetchBlockFeeHistory}.
 * @returns The estimates.
 */
function calculateEstimatesForPriorityLevel(
  priorityLevel: PriorityLevel,
  blocks: FeeHistoryBlock<Percentile>[],
): Eip1559GasFee {
  const settings = SETTINGS_BY_PRIORITY_LEVEL[priorityLevel];

  const latestBaseFeePerGas = blocks[blocks.length - 1].baseFeePerGas;

  const adjustedBaseFee = latestBaseFeePerGas
    .mul(settings.baseFeePercentageMultiplier)
    .divn(100);
  const priorityFees = blocks
    .map((block) => {
      return 'priorityFeesByPercentile' in block
        ? block.priorityFeesByPercentile[settings.percentile]
        : null;
    })
    .filter(BN.isBN);
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
    suggestedMaxPriorityFeePerGas: fromWei(suggestedMaxPriorityFeePerGas, GWEI),
    suggestedMaxFeePerGas: fromWei(suggestedMaxFeePerGas, GWEI),
  };
}

/**
 * Calculates a set of estimates suitable for different priority levels based on the data returned
 * by `eth_feeHistory`.
 *
 * @param blocks - A set of blocks populated with data for priority fee percentiles 10, 20, and 30,
 * obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The estimates.
 */
export default function calculateGasFeeEstimatesForPriorityLevels(
  blocks: FeeHistoryBlock<Percentile>[],
): Pick<GasFeeEstimates, PriorityLevel> {
  return PRIORITY_LEVELS.reduce((obj, priorityLevel) => {
    const gasEstimatesForPriorityLevel = calculateEstimatesForPriorityLevel(
      priorityLevel,
      blocks,
    );
    return { ...obj, [priorityLevel]: gasEstimatesForPriorityLevel };
  }, {} as Pick<GasFeeEstimates, PriorityLevel>);
}
