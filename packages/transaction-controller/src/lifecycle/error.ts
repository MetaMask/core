import { errorCodes, providerErrors } from '@metamask/rpc-errors';
import type { Json } from '@metamask/utils';
import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import {
  deleteTransaction,
  getTransaction,
  isTransactionCompleted,
} from '../utils/state.js';
import { normalizeTxError } from '../utils/utils.js';
import { ErrorCode } from '../utils/validation.js';
import type { TransactionLifecycleContext } from './state.js';
import { releaseTransactionExecution } from './state.js';
import type { TransactionStageDependencies } from './types.js';

const controllerName = 'TransactionController';

/** An error thrown while a transaction was being approved or executed. */
export type TransactionError = Error & { code?: number; data?: Json };

/** Controller resources needed to reject and remove a transaction. */
export type RejectTransactionRequest = {
  dependencies: Pick<
    TransactionStageDependencies,
    'getState' | 'internalEvents' | 'messenger' | 'update'
  >;
};

/** The dependencies and context required to handle a transaction error. */
export type HandleTransactionErrorRequest = RejectTransactionRequest & {
  /** Unique ID persisted on transaction metadata. */
  actionId?: string;

  dependencies: Pick<TransactionStageDependencies, 'failTransaction'>;

  error: TransactionError;

  transactionMeta: TransactionMeta;
};

/**
 * Handle an error thrown while approving or executing a transaction.
 *
 * Rejection errors reject the transaction and rethrow, whereas any other error
 * fails it. Transactions that already completed are left untouched, as their
 * result has already been determined.
 *
 * @param request - Dependencies and context for the error.
 */
export function handleApprovalError(
  request: HandleTransactionErrorRequest,
): void {
  const {
    actionId,
    dependencies: { failTransaction, getState },
    error,
    transactionMeta,
  } = request;

  const { isCompleted } = isTransactionCompleted(
    getState(),
    transactionMeta.id,
  );

  if (!isCompleted) {
    if (isRejectError(error)) {
      rejectTransactionAndThrow(request, transactionMeta.id, actionId, error);
    } else {
      failTransaction(transactionMeta, error, actionId);
    }
  }
}

/** Preserve execution failure semantics separately from approval rejection. */
export function handleTransactionError(
  request: {
    dependencies: Pick<TransactionStageDependencies, 'failTransaction'>;
  } & TransactionLifecycleContext,
  error: unknown,
): void {
  if (!request.lifecycle.execution) {
    if (!request.lifecycle.onError) {
      throw error;
    }
    request.lifecycle.onError(error as Error);
    return;
  }

  try {
    request.dependencies.failTransaction(
      request.transactionMeta,
      error as Error,
    );
  } catch (failure) {
    releaseTransactionExecution(request.lifecycle);
    request.lifecycle.onError?.(failure as Error);
  }
}

/**
 * Rejects a transaction based on its ID by setting its status to "rejected"
 * and emitting a `<tx.id>:finished` hub event.
 *
 * @param request - Controller state and notification resources.
 * @param transactionId - The ID of the transaction to cancel.
 * @param actionId - Unique ID persisted on transaction metadata.
 * @param error - The error that caused the rejection.
 */
export function rejectTransaction(
  request: RejectTransactionRequest,
  transactionId: string,
  actionId?: string,
  error?: Error,
): void {
  const { dependencies } = request;
  const transactionMeta = getTransaction(
    dependencies.getState(),
    transactionId,
  );

  if (!transactionMeta) {
    return;
  }

  deleteTransaction(dependencies, transactionId);

  const updatedTransactionMeta: TransactionMeta = {
    ...transactionMeta,
    status: TransactionStatus.rejected as const,
    error: normalizeTxError(error ?? providerErrors.userRejectedRequest()),
  };

  dependencies.messenger.publish(
    `${controllerName}:transactionFinished`,
    updatedTransactionMeta,
  );

  dependencies.internalEvents.emit(
    `${transactionMeta.id}:finished`,
    updatedTransactionMeta,
  );

  dependencies.messenger.publish(`${controllerName}:transactionRejected`, {
    transactionMeta: updatedTransactionMeta,
    actionId,
  });

  dependencies.messenger.publish(`${controllerName}:transactionStatusUpdated`, {
    transactionMeta: updatedTransactionMeta,
  });
}

function isRejectError(error: Error & { code?: number }): boolean {
  return [
    errorCodes.provider.userRejectedRequest,
    ErrorCode.RejectedUpgrade,
  ].includes(error.code as number);
}

function rejectTransactionAndThrow(
  request: RejectTransactionRequest,
  transactionId: string,
  actionId: string | undefined,
  error: Error & { code?: number; data?: Json },
): void {
  rejectTransaction(request, transactionId, actionId, error);

  if (error.code === errorCodes.provider.userRejectedRequest) {
    throw providerErrors.userRejectedRequest({
      message: 'MetaMask Tx Signature: User denied transaction signature.',
      data: error?.data,
    });
  }

  throw error;
}
