import { fromWei } from 'ethjs-unit';
import { GasFeeEstimates } from './GasFeeController';
import { EthQuery } from './fetchGasEstimatesViaEthFeeHistory/types';
import BlockFeeHistoryDatasetFetcher from './fetchGasEstimatesViaEthFeeHistory/BlockFeeHistoryDatasetFetcher';
import calculateGasFeeEstimatesForPriorityLevels from './fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels';
import calculateBaseFeeRange from './fetchGasEstimatesViaEthFeeHistory/calculateBaseFeeRange';
import calculateBaseFeeTrend from './fetchGasEstimatesViaEthFeeHistory/calculateBaseFeeTrend';
import calculatePriorityFeeRange from './fetchGasEstimatesViaEthFeeHistory/calculatePriorityFeeRange';
import calculatePriorityFeeTrend from './fetchGasEstimatesViaEthFeeHistory/calculatePriorityFeeTrend';
import calculateNetworkCongestion from './fetchGasEstimatesViaEthFeeHistory/calculateNetworkCongestion';
import fetchLatestBlock from './fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock';

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
  const latestBlock = await fetchLatestBlock(ethQuery);
  const fetcher = new BlockFeeHistoryDatasetFetcher({
    ethQuery,
    endBlockNumber: latestBlock.number,
  });
  const blocksByDataset = await fetcher.forAll();

  const levelSpecificEstimates = calculateGasFeeEstimatesForPriorityLevels(
    blocksByDataset.smallRange,
  );
  const estimatedBaseFee = fromWei(latestBlock.baseFeePerGas, 'gwei');
  const historicalBaseFeeRange = calculateBaseFeeRange(
    blocksByDataset.mediumRange,
  );
  const baseFeeTrend = calculateBaseFeeTrend(
    blocksByDataset.latestWithNextBlock,
  );
  const latestPriorityFeeRange = calculatePriorityFeeRange(
    blocksByDataset.latest,
  );
  const historicalPriorityFeeRange = calculatePriorityFeeRange(
    blocksByDataset.mediumRange,
  );
  const priorityFeeTrend = calculatePriorityFeeTrend(blocksByDataset.tinyRange);
  const networkCongestion = calculateNetworkCongestion(
    blocksByDataset.longRange,
  );

  return {
    ...levelSpecificEstimates,
    estimatedBaseFee,
    historicalBaseFeeRange,
    baseFeeTrend,
    latestPriorityFeeRange,
    historicalPriorityFeeRange,
    priorityFeeTrend,
    networkCongestion,
  };
}
