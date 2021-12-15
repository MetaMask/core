import { EthBlock, EthQuery } from './types';
/**
 * Returns information about the latest completed block.
 *
 * @param ethQuery - An EthQuery instance
 * @param includeFullTransactionData - Whether or not to include all data for transactions as
 * opposed to merely hashes. False by default.
 * @returns The block.
 */
export default function fetchLatestBlock(ethQuery: EthQuery, includeFullTransactionData?: boolean): Promise<EthBlock>;
