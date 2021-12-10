import { BN } from 'ethereumjs-util';
import { fromWei } from 'ethjs-unit';
import { GWEI } from '../../constants';
import { ExistingFeeHistoryBlock } from '../fetchBlockFeeHistory';
import { FeeRange } from './types';

/**
 * Calculates reasonable minimum and maximum values for priority fees over the last 200 blocks.
 * Although some priority fees may be 0, these are discarded as they are not useful for suggestion
 * purposes.
 *
 * @param blocks - A set of blocks populated with data for priority fee percentiles 10 and 95,
 * obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The range.
 */
export default function calculatePriorityFeeRange(
  blocks: ExistingFeeHistoryBlock<10 | 95>[],
): FeeRange {
  const sortedLowPriorityFees = blocks
    .map((block) => block.priorityFeesByPercentile[10])
    .filter((priorityFee) => !priorityFee.eq(new BN(0)))
    .sort((a, b) => a.cmp(b));

  const sortedHighPriorityFees = blocks
    .map((block) => block.priorityFeesByPercentile[95])
    .sort((a, b) => a.cmp(b));

  return [
    fromWei(sortedLowPriorityFees[0], GWEI),
    fromWei(sortedHighPriorityFees[sortedHighPriorityFees.length - 1], GWEI),
  ];
}
