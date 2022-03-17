import { query, fromHex, EthQueryish } from '../../util';
import { EthBlock, RawEthBlock } from './types';

/**
 * Returns information about the latest completed block.
 *
 * @param ethQuery - An EthQuery instance
 * @param includeFullTransactionData - Whether or not to include all data for transactions as
 * opposed to merely hashes. False by default.
 * @returns The block.
 */
export default async function fetchLatestBlock(
  ethQuery: EthQueryish,
  includeFullTransactionData = false,
): Promise<EthBlock> {
  const blockNumber = await query<string>(ethQuery, 'blockNumber');
  // According to the spec, `getBlockByNumber` could return null, but to prevent
  // backward incompatibilities, we assume that there will always be a latest
  // block
  const block = await query<RawEthBlock>(ethQuery, 'getBlockByNumber', [
    blockNumber,
    includeFullTransactionData,
  ]);

  return {
    ...block,
    number: fromHex(block.number),
    baseFeePerGas: fromHex(block.baseFeePerGas),
  };
}
