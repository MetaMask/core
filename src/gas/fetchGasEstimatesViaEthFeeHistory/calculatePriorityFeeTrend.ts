import { BN } from 'ethereumjs-util';
import { FeeHistoryBlock } from '../fetchBlockFeeHistory';

/**
 * Given a collection of blocks, returns an indicator of whether the base fee is moving up, down, or
 * holding steady, based on comparing the last base fee in the collection to the first.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The indicator ("up", "down", or "level").
 */
export default function calculatePriorityFeeTrend(
  blocks: FeeHistoryBlock<50>[],
) {
  const priorityFees = blocks
    .map((block) => block.priorityFeesByPercentile[50])
    .filter((priorityFee) => !priorityFee.eq(new BN(0)));
  const first = priorityFees[0];
  const last = priorityFees[priorityFees.length - 1];

  if (last.gt(first)) {
    return 'up';
  } else if (first.gt(last)) {
    return 'down';
  }
  return 'level';
}
