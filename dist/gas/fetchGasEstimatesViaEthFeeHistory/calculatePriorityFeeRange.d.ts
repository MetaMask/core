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
export default function calculatePriorityFeeRange(blocks: ExistingFeeHistoryBlock<10 | 95>[]): FeeRange;
