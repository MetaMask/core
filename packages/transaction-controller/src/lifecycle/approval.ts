import type { AddResult } from '@metamask/approval-controller';
import type { TraceContext } from '@metamask/controller-utils';
import { ApprovalType, ORIGIN_METAMASK } from '@metamask/controller-utils';
import { projectLogger as log } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { isTransactionCompleted } from '../utils/state.js';
import type { RejectTransactionRequest } from './error.js';
import { handleApprovalError } from './error.js';
import type { TransactionLifecycleContext } from './state.js';
import type {
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** The dependencies and context required to await approval. */
export type AwaitApprovalRequest = RejectTransactionRequest &
  TransactionLifecycleContext & {
    constructorOptions: Pick<TransactionConstructorOptions, 'trace'>;
    dependencies: Pick<
      TransactionStageDependencies,
      'failTransaction' | 'updateTransaction'
    >;
    /** Whether to display the approval request. Defaults to `true`. */
    shouldShowRequest?: boolean;
  };

/** The dependencies and context required to apply approval data. */
type ApplyApprovalDataRequest = {
  /** The value returned when the approval request was accepted. */
  approvalValue?: AddResult['value'];
  dependencies: Pick<TransactionStageDependencies, 'updateTransaction'>;
};

/**
 * Await user approval for a transaction.
 *
 * Resolves immediately when approval is not required, so that the transaction
 * proceeds straight to execution.
 *
 * @param request - Dependencies and context for the transaction.
 */
export async function awaitApproval(
  request: AwaitApprovalRequest,
): Promise<void> {
  const {
    addTransactionRequest: { options },
    constructorOptions: { trace },
    dependencies,
    shouldShowRequest = true,
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
    handleApprovalError({
      ...request,
      actionId: options.actionId,
      error,
      transactionMeta: meta,
    });

  if (requireApproval === false) {
    return;
  }

  const approvalResult = await trace(
    { name: 'Await Approval', parentContext: traceContext },
    (context) =>
      requestApproval(request, transactionMeta, {
        shouldShowRequest,
        traceContext: context,
      }),
  );

  request.lifecycle.resultCallbacks = approvalResult.resultCallbacks;
  applyApprovalData({ ...request, approvalValue: approvalResult.value });
}

async function waitForTransactionFinished(
  dependencies: Pick<TransactionStageDependencies, 'internalEvents'>,
  transactionId: string,
): Promise<TransactionMeta> {
  return new Promise((resolve) => {
    dependencies.internalEvents.once(`${transactionId}:finished`, (txMeta) => {
      resolve(txMeta);
    });
  });
}

async function requestApproval(
  request: {
    constructorOptions: Pick<TransactionConstructorOptions, 'trace'>;
    dependencies: Pick<TransactionStageDependencies, 'messenger'>;
  },
  txMeta: TransactionMeta,
  {
    shouldShowRequest,
    traceContext,
  }: { shouldShowRequest: boolean; traceContext?: TraceContext },
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
    shouldShowRequest,
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
 */
function applyApprovalData(request: ApplyApprovalDataRequest): void {
  const {
    approvalValue,
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
