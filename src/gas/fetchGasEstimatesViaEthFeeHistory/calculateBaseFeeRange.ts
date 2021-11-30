import { fromWei } from 'ethjs-unit';
import { FeeHistoryBlock } from '../fetchBlockFeeHistory';
import { FeeRange } from './types';

/**
 * Calculates reasonable minimum and maximum values for base fees over the last 200 blocks.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The ranges.
 */
export default function calculateBaseFeeRange<Percentile extends number>(
  blocks: FeeHistoryBlock<Percentile>[],
): FeeRange {
  const sortedBaseFeesPerGas = blocks
    .map((block) => block.baseFeePerGas)
    .sort((a, b) => a.cmp(b));

  return [
    fromWei(sortedBaseFeesPerGas[0], 'gwei'),
    fromWei(sortedBaseFeesPerGas[sortedBaseFeesPerGas.length - 1], 'gwei'),
  ];
}
