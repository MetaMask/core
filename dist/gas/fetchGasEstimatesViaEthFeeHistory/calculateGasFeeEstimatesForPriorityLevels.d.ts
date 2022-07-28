import { GasFeeEstimates } from '../GasFeeController';
import { FeeHistoryBlock } from '../fetchBlockFeeHistory';
export declare type PriorityLevel = typeof PRIORITY_LEVELS[number];
export declare type Percentile = typeof PRIORITY_LEVEL_PERCENTILES[number];
declare const PRIORITY_LEVELS: readonly ["low", "medium", "high"];
declare const PRIORITY_LEVEL_PERCENTILES: readonly [10, 20, 30];
/**
 * Calculates a set of estimates suitable for different priority levels based on the data returned
 * by `eth_feeHistory`.
 *
 * @param blocks - A set of blocks populated with data for priority fee percentiles 10, 20, and 30,
 * obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The estimates.
 */
export default function calculateGasFeeEstimatesForPriorityLevels(blocks: FeeHistoryBlock<Percentile>[]): Pick<GasFeeEstimates, PriorityLevel>;
export {};
