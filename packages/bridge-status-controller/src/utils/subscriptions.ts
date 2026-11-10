import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { isCrossChainTx, isTradeTx } from './transaction.js';

export type SubscriptionHandlerInputs = {
  txMeta: TransactionMeta;
  historyKey?: string;
};

export type SubscriptionHandlerParams = SubscriptionHandlerInputs & {
  onTransactionConfirmed: (params: {
    txMeta: TransactionMeta;
    historyKey: string;
  }) => void;
  onTransactionFailed: (params: {
    txMeta: TransactionMeta;
    historyKey?: string;
    isApprovalTxMeta?: boolean;
  }) => void;
  onReportSubmittedOnce: (
    historyKey: string,
    txHash: string,
    txId: string,
  ) => void;
};

export const tradeUpdateHandler = ({
  txMeta,
  historyKey,
  onTransactionConfirmed,
  onTransactionFailed,
  onReportSubmittedOnce,
}: SubscriptionHandlerParams): void => {
  const { type, status } = txMeta;

  // Allow event publishing if the txMeta is a swap/bridge OR if the
  // corresponding history item exists
  const isTradeTransaction = type && isTradeTx(type);
  if (!isTradeTransaction && !historyKey) {
    return;
  }

  switch (status) {
    case TransactionStatus.submitted:
      // EVM txs report SUBMITTED here (not via transactionSubmitted) so hash
      // replacements before confirmation still reach the Bridge API.
      if (
        txMeta.hash &&
        txMeta.type &&
        isCrossChainTx(txMeta.type) &&
        historyKey
      ) {
        onReportSubmittedOnce(historyKey, txMeta.hash, txMeta.id);
      }
      break;
    case TransactionStatus.confirmed:
      historyKey &&
        onTransactionConfirmed({
          txMeta,
          historyKey,
        });
      break;
    case TransactionStatus.failed:
    case TransactionStatus.dropped:
    case TransactionStatus.rejected:
      onTransactionFailed({ txMeta, historyKey });
      break;
    default:
      break;
  }
};

export const approvalUpdateHandler = ({
  txMeta,
  historyKey,
  onTransactionFailed,
}: SubscriptionHandlerParams): void => {
  if (!historyKey) {
    return;
  }

  switch (txMeta.status) {
    case TransactionStatus.failed:
    case TransactionStatus.dropped:
    case TransactionStatus.rejected:
      onTransactionFailed({
        txMeta,
        historyKey,
        isApprovalTxMeta: true,
      });
      break;
    default:
      break;
  }
};
