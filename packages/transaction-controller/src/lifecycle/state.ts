import type { AcceptResultCallbacks } from '@metamask/approval-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { TransactionMeta } from '../types.js';
import type {
  AddTransactionInput,
  TransactionStageDependencies,
} from './types.js';

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

/** Context shared by the stages after initialization. */
export type TransactionLifecycleContext = {
  addTransactionRequest: AddTransactionInput;
  lifecycle: TransactionLifecycleState;
  transactionMeta: TransactionMeta;
};

/** Release resources owned by this execution, including on early exits. */
export function releaseTransactionExecution(
  lifecycle: TransactionLifecycleState,
): void {
  lifecycle.execution?.releaseApproval?.();
  lifecycle.execution?.releaseNonce?.();
  delete lifecycle.execution;
}

/** Release execution resources and restore normal simulation behaviour. */
export function cleanupTransaction(
  request: {
    dependencies: Pick<
      TransactionStageDependencies,
      'skipSimulationTransactionIds'
    >;
  } & TransactionLifecycleContext,
): void {
  releaseTransactionExecution(request.lifecycle);
  if (request.lifecycle.onError) {
    request.dependencies.skipSimulationTransactionIds.delete(
      request.transactionMeta.id,
    );
  }
}
