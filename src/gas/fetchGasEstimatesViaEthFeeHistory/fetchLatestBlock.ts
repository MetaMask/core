import { query } from '../../util';
import { EthBlock, EthQuery } from './types';

/**
 * Returns information about the latest completed block.
 *
 * @param ethQuery - An EthQuery instance
 * @returns The block.
 */
export default async function fetchLatestBlock(
  ethQuery: EthQuery,
): Promise<EthBlock> {
  const blockNumber = await query(ethQuery, 'blockNumber');
  const block = await query(ethQuery, 'getBlockByNumber', blockNumber);
  return block;
}
