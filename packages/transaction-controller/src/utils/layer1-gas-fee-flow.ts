import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { BN, addHexPrefix } from 'ethereumjs-util';
import { omit } from 'lodash';

import type { Layer1GasFeeFlow, TransactionMeta } from '../types';

/**
 * Get the layer 1 gas fee flow for a transaction.
 * @param transactionMeta - The transaction to get the layer 1 gas fee flow for.
 * @param layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @returns The layer 1 gas fee flow for the transaction, or undefined if none match.
 */
export function getLayer1GasFeeFlow(
  transactionMeta: TransactionMeta,
  layer1GasFeeFlows: Layer1GasFeeFlow[],
): Layer1GasFeeFlow | undefined {
  return layer1GasFeeFlows.find((layer1GasFeeFlow) =>
    layer1GasFeeFlow.matchesTransaction(transactionMeta),
  );
}

/**
 * Build transactionParams to be used in the unserialized transaction.
 *
 * @param transactionMeta - The transaction to build transactionParams.
 * @returns The transactionParams for the unserialized transaction.
 */
function buildTransactionParams(
  transactionMeta: TransactionMeta,
): TransactionMeta['txParams'] {
  return {
    ...omit(transactionMeta.txParams, 'gas'),
    gasLimit: transactionMeta.txParams.gas,
  };
}

/**
 * This produces a transaction whose information does not completely match an
 * Optimism transaction — for instance, DEFAULT_CHAIN is still 'mainnet' and
 * genesis points to the mainnet genesis, not the Optimism genesis — but
 * considering that all we want to do is serialize a transaction, this works
 * fine for our use case.
 *
 * @param transactionMeta - The transaction to build an unserialized transaction for.
 * @returns The unserialized transaction.
 */
function buildTransactionCommon(transactionMeta: TransactionMeta) {
  return Common.custom({
    chainId: new BN(
      addHexPrefix(transactionMeta.chainId),
      16,
    ) as unknown as number,
    // Optimism only supports type-0 transactions; it does not support any of
    // the newer EIPs since EIP-155. Source:
    // <https://github.com/ethereum-optimism/optimism/blob/develop/specs/l2geth/transaction-types.md>
    defaultHardfork: Hardfork.London,
  });
}

/**
 * Build an unserialized transaction for a transaction.
 *
 * @param transactionMeta - The transaction to build an unserialized transaction for.
 * @returns The unserialized transaction.
 */
export function buildUnserializedTransaction(transactionMeta: TransactionMeta) {
  const txParams = buildTransactionParams(transactionMeta);
  const common = buildTransactionCommon(transactionMeta);
  return TransactionFactory.fromTxData(txParams, { common });
}
