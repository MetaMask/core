import { FeeHistoryBlock } from '../fetchBlockFeeHistory';

/**
 * Calculates the approximate normalized ranking of the latest base fee in the given blocks among
 * the entirety of the blocks. That is, sorts all of the base fees, then finds the rank of the first
 * base fee that meets or exceeds the latest base fee among the base fees. The result is the rank
 * normalized as a number between 0 and 1, where 0 means that the latest base fee is the least of
 * all and 1 means that the latest base fee is the greatest of all. This can ultimately be used to
 * render a visualization of the status of the network for users.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns A number between 0 and 1.
 */
export default function fetchNetworkCongestionLevel(
  blocks: FeeHistoryBlock<never>[],
): number {
  if (blocks.length > 0) {
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
  return 0.5;
}
