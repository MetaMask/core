import type { Hex } from '@metamask/utils';
import { noop } from 'lodash-es';
import { projectLogger as log } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { updateFirstTimeInteraction } from '../utils/first-time-interaction.js';
import { getTransaction } from '../utils/state.js';
import type {
  AddTransactionInput,
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** The dependencies and context required to start the background updates. */
export type StartBackgroundUpdatesRequest = {
  addTransactionRequest: AddTransactionInput;
  constructorOptions: Pick<
    TransactionConstructorOptions,
    'isFirstTimeInteractionEnabled' | 'trace'
  >;
  dependencies: Pick<
    TransactionStageDependencies,
    | 'getState'
    | 'messenger'
    | 'updateSimulationData'
    | 'updateTransactionInternal'
  >;
  delegationAddressPromise: Promise<Hex | undefined>;
  transactionMeta: TransactionMeta;
};

/**
 * Start the background updates for a newly added transaction.
 *
 * Resolves the delegation address started during init, and - when the
 * transaction will be shown for approval - refreshes simulation data and the
 * first time interaction flag.
 *
 * Deliberately synchronous and fire-and-forget: each update writes to state
 * once it resolves so that adding the transaction is not blocked on them.
 *
 * @param request - Dependencies and context for the transaction.
 */
export function startBackgroundUpdates(
  request: StartBackgroundUpdatesRequest,
): void {
  const {
    addTransactionRequest: { options },
    constructorOptions: { isFirstTimeInteractionEnabled, trace },
    dependencies: { getState, updateSimulationData, updateTransactionInternal },
    transactionMeta,
  } = request;

  const { isStateOnly, requireApproval, traceContext } = options;

  applyDelegationAddress(request);

  if (requireApproval !== false && !isStateOnly) {
    updateSimulationData(transactionMeta, {
      traceContext,
    }).catch((error) => {
      log('Error while updating simulation data', error);
      throw error;
    });

    updateFirstTimeInteraction({
      existingTransactions: getState().transactions,
      getTransaction: (transactionId: string) =>
        getTransaction(getState(), transactionId),
      isFirstTimeInteractionEnabled:
        isFirstTimeInteractionEnabled ?? (() => true),
      trace,
      traceContext,
      transactionMeta,
      updateTransaction: updateTransactionInternal,
    }).catch((error) => {
      log('Error while updating first interaction properties', error);
    });
  } else {
    log(
      'Skipping simulation & first interaction update as approval not required',
    );
  }

  request.dependencies.messenger.publish(
    'TransactionController:unapprovedTransactionAdded',
    transactionMeta,
  );
}

/**
 * Persist the delegation address once the request started during init
 * resolves.
 *
 * @param request - Dependencies and context for the transaction.
 */
function applyDelegationAddress(request: StartBackgroundUpdatesRequest): void {
  const {
    delegationAddressPromise,
    transactionMeta,
    dependencies: { updateTransactionInternal },
  } = request;

  delegationAddressPromise
    .then((delegationAddress) => {
      updateTransactionInternal(
        {
          transactionId: transactionMeta.id,
          skipResimulateCheck: true,
          skipValidation: true,
        },
        (tx) => {
          tx.delegationAddress = delegationAddress;
        },
      );

      return undefined;
    })
    .catch(noop);
}
