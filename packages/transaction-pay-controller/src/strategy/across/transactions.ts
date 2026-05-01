import { TransactionType } from '@metamask/transaction-controller';

import type { AcrossSwapApprovalResponse } from './types';

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
