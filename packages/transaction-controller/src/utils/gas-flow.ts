import type { GasFeeFlow, TransactionMeta } from '../types';

/**
 * Returns the first gas fee flow that matches the transaction.
 *
 * @param transactionMeta - The transaction metadata to find a gas fee flow for.
 * @param gasFeeFlows - The gas fee flows to search.
 * @returns The first gas fee flow that matches the transaction, or undefined if none match.
 */
export function getGasFeeFlow(
  transactionMeta: TransactionMeta,
  gasFeeFlows: GasFeeFlow[],
): GasFeeFlow | undefined {
  return gasFeeFlows.find((gasFeeFlow) =>
    gasFeeFlow.matchesTransaction(transactionMeta),
  );
}
