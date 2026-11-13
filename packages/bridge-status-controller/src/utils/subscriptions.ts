import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayControllerState } from '../../../transaction-pay-controller/src/types.js';
import type { BridgeStatusControllerMessenger, Operation } from '../types.js';
import { acceptApprovalRequest } from './approval.js';
import {
  setTransactionConfigForMmPay,
  updatePaymentToken,
} from './transaction-pay.js';
import {
  getTransactionMetaByBatchId,
  isCrossChainTx,
  isTradeTx,
} from './transaction.js';

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

export const depositUpdateHandler = ({
  txMeta,
  historyKey,
  onTransactionConfirmed,
  onTransactionFailed,
}: SubscriptionHandlerParams): void => {
  if (!historyKey) {
    return;
  }

  switch (txMeta.status) {
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

export const withdrawUpdateHandler = ({
  txMeta,
  historyKey,
  onTransactionConfirmed,
  onTransactionFailed,
}: SubscriptionHandlerParams) => {
  if (!historyKey) {
    return;
  }

  switch (txMeta.status) {
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

const waitForMmPayQuotesAndApprove = ({
  messenger,
  txMetaId,
  batchId,
}: {
  messenger: BridgeStatusControllerMessenger;
  txMetaId: string;
  batchId: string;
}): void => {
  const onAdded = (state: TransactionPayControllerState): void => {
    if (!state.transactionData[txMetaId]?.quotes?.length) {
      return;
    }

    if (state.transactionData[txMetaId].quotes.length > 0) {
      const tradeMeta = getTransactionMetaByBatchId({
        messenger,
        batchId,
      })[0];

      if (!tradeMeta) {
        throw new Error('Failed to find trade meta before approval');
      }

      if (tradeMeta?.status !== TransactionStatus.unapproved) {
        return;
      }

      acceptApprovalRequest(messenger, txMetaId)
        .then(() =>
          messenger.unsubscribe(
            'TransactionPayController:stateChange',
            onAdded,
          ),
        )
        .catch((error) => {
          throw error;
        });
    }
  };

  messenger.subscribe('TransactionPayController:stateChange', onAdded);
};

/**
 * Subscribes to upcoming unapproved transactions for a given batchId
 * and updates its MM Pay transaction fees.
 *
 * Once the fee quotes are populated, {@link waitForMmPayQuotesAndApprove}'s
 * subscription is triggered to approve the transaction.
 *
 * @param params - the parameters for the function
 * @param params.messenger - the messenger to use to subscribe to the transaction events
 * @param params.batchId - the batchId of the withdraw/deposit batch
 * @param params.primaryMoneyAccount - the money account to use for submission
 * @param params.underlyingToken - the token to use for fees (monad:MUSD)
 * @param params.chainId - the hex chainId
 * @param params.operation - withdraw/deposit
 */
export const waitForMMPayFeeQuotes = ({
  messenger,
  batchId,
  primaryMoneyAccount,
  underlyingToken,
  chainId,
  operation,
}: {
  messenger: BridgeStatusControllerMessenger;
  batchId: string;
  primaryMoneyAccount: { address: `0x${string}` };
  underlyingToken: `0x${string}`;
  chainId: `0x${string}`;
  operation: Operation;
}): void => {
  const onUnapprovedTransactionAdded = (txMeta: TransactionMeta): void => {
    if (txMeta.batchId?.toLowerCase() !== batchId.toLowerCase()) {
      return;
    }
    if (txMeta.status !== TransactionStatus.unapproved) {
      return;
    }

    // Subscribe to TransactionPayController state change then approve tx batch
    waitForMmPayQuotesAndApprove({
      messenger,
      txMetaId: txMeta.id,
      batchId,
    });

    // Populate MM Pay transaction config
    setTransactionConfigForMmPay(
      messenger,
      txMeta.id,
      primaryMoneyAccount.address,
      operation,
    );
    underlyingToken &&
      updatePaymentToken(messenger, txMeta.id, underlyingToken, chainId);

    messenger.unsubscribe(
      'TransactionController:unapprovedTransactionAdded',
      onUnapprovedTransactionAdded,
    );
  };

  messenger.subscribe(
    'TransactionController:unapprovedTransactionAdded',
    onUnapprovedTransactionAdded,
  );
};
