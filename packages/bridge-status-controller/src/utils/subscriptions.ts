import type { ExtractEventHandler, MessengerEvents } from '@metamask/messenger';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionPayControllerState } from '@metamask/transaction-pay-controller';

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

const subscribeOnce = (
  connect: (
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (reason: Error) => void,
  ) => () => void,
): { promise: Promise<void>; unsubscribe: () => void } => {
  const stops: (() => void)[] = [];
  const promise = new Promise<void>((resolve, reject) => {
    stops.push(
      connect(resolve, (reason): void => {
        reject(reason);
      }),
    );
  });

  return {
    promise,
    unsubscribe: (): void => {
      stops[0]();
    },
  };
};

const safeUnsubscribe = <
  EventType extends MessengerEvents<BridgeStatusControllerMessenger>['type'],
>(
  messenger: BridgeStatusControllerMessenger,
  eventName: EventType,
  handler: ExtractEventHandler<
    MessengerEvents<BridgeStatusControllerMessenger>,
    EventType
  >,
): void => {
  try {
    messenger.unsubscribe(eventName, handler);
  } catch {
    // already unsubscribed
  }
};

export const mmPayQuotesReadySubscription = (
  messenger: BridgeStatusControllerMessenger,
  batchId: string,
): { promise: Promise<void>; unsubscribe: () => void } =>
  subscribeOnce((resolve, reject) => {
    const handler = ({
      transactionData,
    }: TransactionPayControllerState): void => {
      const txMeta = getTransactionMetaByBatchId({ messenger, batchId })[0];
      if (!txMeta) {
        // Wait for next state change
        return;
      }
      const hasQuotes = (transactionData[txMeta.id]?.quotes?.length ?? 0) > 0;
      if (!hasQuotes) {
        return;
      }

      safeUnsubscribe(
        messenger,
        'TransactionPayController:stateChange',
        handler,
      );

      try {
        if (txMeta.status !== TransactionStatus.unapproved) {
          // Settle promise, no need to accept approval request
          resolve();
          return;
        }

        resolve(
          (async (): Promise<void> => {
            await acceptApprovalRequest(messenger, txMeta.id);
          })(),
        );
      } catch (error) {
        reject(error as Error);
      }
    };

    messenger.subscribe('TransactionPayController:stateChange', handler);

    return (): void => {
      safeUnsubscribe(
        messenger,
        'TransactionPayController:stateChange',
        handler,
      );
    };
  });

export const unapprovedTxSubscription = (
  messenger: BridgeStatusControllerMessenger,
  batchId: string,
  operation: Operation,
  primaryMoneyAccount: { address: `0x${string}` },
  underlyingToken: `0x${string}`,
  chainId: `0x${string}`,
): { promise: Promise<void>; unsubscribe: () => void } =>
  subscribeOnce((resolve, reject) => {
    const handler = (txMeta: TransactionMeta): void => {
      if (
        txMeta.batchId?.toLowerCase() !== batchId.toLowerCase() ||
        txMeta.status !== TransactionStatus.unapproved
      ) {
        return;
      }

      safeUnsubscribe(
        messenger,
        'TransactionController:unapprovedTransactionAdded',
        handler,
      );

      try {
        setTransactionConfigForMmPay(
          messenger,
          txMeta.id,
          primaryMoneyAccount,
          operation,
        );

        updatePaymentToken(messenger, txMeta.id, underlyingToken, chainId);

        resolve();
      } catch (error) {
        reject(error as Error);
      }
    };

    messenger.subscribe(
      'TransactionController:unapprovedTransactionAdded',
      handler,
    );

    return (): void => {
      safeUnsubscribe(
        messenger,
        'TransactionController:unapprovedTransactionAdded',
        handler,
      );
    };
  });
