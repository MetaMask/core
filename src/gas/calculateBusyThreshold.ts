import { BN } from 'ethereumjs-util';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';

type EthQuery = any;

const NUMBER_OF_BLOCKS_TO_FETCH = 20_000;

/**
 * Uses historical base fees to determine a threshold we can use to determine whether the network is
 * busy. Specifically, pulls the last 20,000 blocks (which at the time of this writing represents
 * around 2 days), sorts the base fees of those blocks, then chooses the base fee which is 9/10 of
 * the way into the list (i.e. the 90th percentile).
 *
 * @param ethQuery - An EthQuery instance.
 * @returns A promise for the 90th percentile base fee in WEI, as a BN.
 */
export default async function calculateBusyThreshold(
  ethQuery: EthQuery,
): Promise<BN> {
  const blocks = await fetchBlockFeeHistory({
    ethQuery,
    numberOfBlocks: NUMBER_OF_BLOCKS_TO_FETCH,
  });
  const sortedBaseFeesPerGas = blocks
    .map((block) => block.baseFeePerGas)
    .sort((a, b) => a.cmp(b));
  const indexAtPercentile90 = Math.floor(sortedBaseFeesPerGas.length * 0.9) - 1;
  return sortedBaseFeesPerGas[indexAtPercentile90];
}
