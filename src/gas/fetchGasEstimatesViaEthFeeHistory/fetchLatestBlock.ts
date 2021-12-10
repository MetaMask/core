import { query, fromHex } from '../../util';
import { EthBlock, EthQuery } from './types';

/**
 * Returns information about the latest completed block.
 *
 * @param ethQuery - An EthQuery instance
 * @param includeFullTransactionData - Whether or not to include all data for transactions as
 * opposed to merely hashes. False by default.
 * @returns The block.
 */
export default async function fetchLatestBlock(
  ethQuery: EthQuery,
  includeFullTransactionData = false,
): Promise<EthBlock> {
  const blockNumber = await query(ethQuery, 'blockNumber');
  const block = await query(ethQuery, 'getBlockByNumber', [
    blockNumber,
    includeFullTransactionData,
  ]);
  return {
    ...block,
    number: fromHex(block.number),
    baseFeePerGas: fromHex(block.baseFeePerGas),
  };
}
