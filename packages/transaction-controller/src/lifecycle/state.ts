import type { AcceptResultCallbacks } from '@metamask/approval-controller';
import type { NetworkClientId } from '@metamask/network-controller';

import { createModuleLogger, lifecycleLogger } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import type {
  TransactionLifecycleRequest,
  TransactionStageDependencies,
} from './types.js';

const approvingTransactionIds = new WeakMap<
  TransactionStageDependencies,
  Set<string>
>();

const log = createModuleLogger(lifecycleLogger, 'state');

/** Ephemeral coordination only; transaction data remains on transactionMeta. */
export type TransactionLifecycleState = {
  execution?: {
    /** Capture the network before signing hooks can replace metadata. */
    networkClientId: NetworkClientId;
    releaseApproval?: () => void;
    releaseNonce?: () => void;
  };
  finishedPromise?: Promise<TransactionMeta | undefined>;
  onError?: (error: Error) => void;
  resultCallbacks?: AcceptResultCallbacks;
};

/**
 * Check whether another invocation is already approving this transaction.
 *
 * @param dependencies - Stable controller-scoped resources.
 * @param transactionId - Transaction or serialized transaction identifier.
 * @returns Whether approval is in progress.
 */
export function isTransactionApproving(
  dependencies: TransactionStageDependencies,
  transactionId: string,
): boolean {
  return approvingTransactionIds.get(dependencies)?.has(transactionId) ?? false;
}

/**
 * Track an approval until the owning invocation releases it.
 *
 * @param dependencies - Stable controller-scoped resources.
 * @param transactionId - Transaction or serialized transaction identifier.
 * @returns Callback to release the approval.
 */
export function startTransactionApproval(
  dependencies: TransactionStageDependencies,
  transactionId: string,
): () => void {
  let transactionIds = approvingTransactionIds.get(dependencies);

  if (!transactionIds) {
    transactionIds = new Set();
    approvingTransactionIds.set(dependencies, transactionIds);
  }

  transactionIds.add(transactionId);

  log('Started transaction approval', transactionId);

  return () => {
    log('Released transaction approval', transactionId);
    transactionIds.delete(transactionId);
  };
}

/**
 * Release resources owned by this execution, including on early exits.
 *
 * @param lifecycle - Lifecycle state holding the active execution resources.
 */
export function releaseTransactionExecution(
  lifecycle: TransactionLifecycleState,
): void {
  lifecycle.execution?.releaseApproval?.();
  lifecycle.execution?.releaseNonce?.();
  delete lifecycle.execution;
}

/**
 * Release execution resources and restore normal simulation behaviour.
 *
 * @param request - Transaction metadata, lifecycle state, and dependencies.
 */
export function cleanupTransaction(request: TransactionLifecycleRequest): void {
  log('Cleaning up transaction', request.transactionMeta.id);

  releaseTransactionExecution(request.lifecycle);

  if (request.lifecycle.onError) {
    request.dependencies.skipSimulationTransactionIds.delete(
      request.transactionMeta.id,
    );
  }
}
