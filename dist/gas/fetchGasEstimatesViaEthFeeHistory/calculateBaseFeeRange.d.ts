import { FeeHistoryBlock } from '../fetchBlockFeeHistory';
import { FeeRange } from './types';
/**
 * Calculates reasonable minimum and maximum values for base fees over the last 200 blocks.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The ranges.
 */
export default function calculateBaseFeeRange<Percentile extends number>(blocks: FeeHistoryBlock<Percentile>[]): FeeRange;
