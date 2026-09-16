import { getTransactionOrThrow } from '../utils/state.js';
import type { TransactionLifecycleContext } from './state.js';
import type {
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** Dependencies and context required to sign an approved transaction. */
export type SignTransactionRequest = TransactionLifecycleContext & {
  constructorOptions: Pick<TransactionConstructorOptions, 'trace'>;
  dependencies: Pick<
    TransactionStageDependencies,
    'getState' | 'signTransaction'
  >;
};

/**
 * Sign the current execution and refresh its persisted metadata.
 *
 * @param request - Transaction context and shared signing implementation.
 */
export async function signTransaction(
  request: SignTransactionRequest,
): Promise<void> {
  if (!request.lifecycle.execution) {
    return;
  }

  await request.constructorOptions.trace(
    {
      name: 'Sign',
      parentContext: request.addTransactionRequest.options.traceContext,
    },
    () => request.dependencies.signTransaction(request.transactionMeta),
  );
  request.transactionMeta = getTransactionOrThrow(
    request.dependencies.getState(),
    request.transactionMeta.id,
  );
}
