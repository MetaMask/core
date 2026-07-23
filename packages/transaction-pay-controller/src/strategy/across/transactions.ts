import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type { AcrossSwapApprovalResponse } from './types.js';

export type AcrossOrderedTransaction = {
  chainId: number;
  data: `0x${string}`;
  gas?: string;
  kind: 'approval' | 'swap';
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  to: `0x${string}`;
  type?: TransactionType;
  value?: `0x${string}`;
};

export function getAcrossOrderedTransactions({
  quote,
  swapType,
}: {
  quote: AcrossSwapApprovalResponse;
  swapType?: TransactionType;
}): AcrossOrderedTransaction[] {
  const swapChainId = quote.swapTx.chainId;
  const approvalTransactions = (quote.approvalTxns ?? []).map((approval) => ({
    ...approval,
    chainId: approval.chainId ?? swapChainId,
    kind: 'approval' as const,
    type: TransactionType.tokenMethodApprove,
  }));

  return [
    ...approvalTransactions,
    {
      ...quote.swapTx,
      kind: 'swap',
      type: swapType,
    },
  ];
}

/**
 * Get a usable gas limit from the original or nested transaction.
 *
 * @param transaction - Original transaction metadata.
 * @returns Positive integer gas limit if present, otherwise undefined.
 */
export function getOriginalTransactionGas(
  transaction: TransactionMeta,
): number | undefined {
  const nestedGas = transaction.nestedTransactions?.find((tx) => tx.gas)?.gas;
  const rawGas = nestedGas ?? transaction.txParams.gas;

  if (rawGas === undefined) {
    return undefined;
  }

  const gas = new BigNumber(rawGas);

  if (!gas.isFinite() || gas.isNaN() || !gas.isInteger() || gas.lte(0)) {
    return undefined;
  }

  return gas.toNumber();
}
