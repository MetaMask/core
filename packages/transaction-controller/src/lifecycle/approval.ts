import type { AddResult } from '@metamask/approval-controller';
import type { TraceContext } from '@metamask/controller-utils';
import { ApprovalType, ORIGIN_METAMASK } from '@metamask/controller-utils';

import { projectLogger as log } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { isTransactionCompleted } from '../utils/state.js';
import { handleApprovalError } from './error.js';
import type {
  TransactionLifecycleRequest,
  TransactionStageDependencies,
} from './types.js';

/**
 * Await user approval for a transaction.
 *
 * Resolves immediately when approval is not required, so that the transaction
 * proceeds straight to execution.
 *
 * @param request - Dependencies and context for the transaction.
 */
export async function awaitApproval(
  request: TransactionLifecycleRequest,
): Promise<void> {
  const {
    addTransactionRequest: { options },
    constructorOptions: { trace },
    dependencies,
    transactionMeta,
  } = request;

  const { requireApproval, traceContext } = options;

  if (transactionMeta.isStateOnly) {
    return;
  }

  const { isCompleted, meta } = isTransactionCompleted(
    dependencies.getState(),
    transactionMeta.id,
  );

  request.lifecycle.finishedPromise = isCompleted
    ? Promise.resolve(meta)
    : waitForTransactionFinished(dependencies, transactionMeta.id);

  if (!meta || isCompleted) {
    return;
  }

  request.lifecycle.onError = (error): void =>
    handleApprovalError({ ...request, transactionMeta: meta }, error);

  if (requireApproval === false) {
    return;
  }

  const approvalResult = await trace(
    { name: 'Await Approval', parentContext: traceContext },
    (context) =>
      requestApproval(request, transactionMeta, {
        traceContext: context,
      }),
  );

  request.lifecycle.resultCallbacks = approvalResult.resultCallbacks;
  applyApprovalData(request, approvalResult.value);
}

async function waitForTransactionFinished(
  dependencies: TransactionStageDependencies,
  transactionId: string,
): Promise<TransactionMeta> {
  return new Promise((resolve) => {
    dependencies.internalEvents.once(`${transactionId}:finished`, (txMeta) => {
      resolve(txMeta);
    });
  });
}

async function requestApproval(
  request: TransactionLifecycleRequest,
  txMeta: TransactionMeta,
  { traceContext }: { traceContext?: TraceContext },
): Promise<AddResult> {
  const {
    constructorOptions: { trace },
    dependencies: { messenger },
  } = request;

  const id = String(txMeta.id);
  const { origin } = txMeta;
  const type = ApprovalType.Transaction;
  const requestData = { txId: txMeta.id };

  await trace({
    name: 'Notification Display',
    id,
    parentContext: traceContext,
  });

  return (await messenger.call(
    'ApprovalController:addRequest',
    {
      id,
      origin: origin ?? ORIGIN_METAMASK,
      type,
      requestData,
      expectsResult: true,
    },
    true,
  )) as Promise<AddResult>;
}

/**
 * Apply any transaction data provided when the approval was accepted.
 *
 * The approval flow can edit the transaction - for example to change the nonce
 * or gas fees - so those changes are persisted before the transaction is
 * executed.
 *
 * @param request - Dependencies and context for the transaction.
 * @param approvalValue - The data returned when approval was accepted.
 */
function applyApprovalData(
  request: TransactionLifecycleRequest,
  approvalValue: AddResult['value'],
): void {
  const {
    dependencies: { updateTransaction },
  } = request;

  const updatedTransaction = (
    approvalValue as { txMeta?: TransactionMeta } | undefined
  )?.txMeta;

  if (!updatedTransaction) {
    return;
  }

  log('Updating transaction with approval data', {
    customNonce: updatedTransaction.customNonceValue,
    params: updatedTransaction.txParams,
  });

  updateTransaction(
    updatedTransaction,
    'TransactionController#processApproval - Updated with approval data',
  );
}
