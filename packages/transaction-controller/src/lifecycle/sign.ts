import type { TypedTxData } from '@ethereumjs/tx';
import { add0x } from '@metamask/utils';
import { cloneDeep, merge } from 'lodash-es';

import { projectLogger as log } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import { signAuthorizationList } from '../utils/eip7702.js';
import { checkGasFeeTokenBeforePublish } from '../utils/gas-fee-tokens.js';
import { prepareTransaction, serializeTransaction } from '../utils/prepare.js';
import { getTransaction, getTransactionOrThrow } from '../utils/state.js';
import { startTransactionApproval } from './state.js';
import type {
  TransactionConstructorOptions,
  TransactionLifecycleRequest,
  TransactionStageDependencies,
} from './types.js';

const signAbortCallbacks = new WeakMap<
  TransactionStageDependencies,
  Map<string, () => void>
>();

/**
 * Sign the current execution and refresh its persisted metadata.
 *
 * @param request - Transaction context and controller resources.
 */
export async function signTransaction(
  request: TransactionLifecycleRequest,
): Promise<void> {
  if (!request.lifecycle.execution) {
    return;
  }

  await request.constructorOptions.trace(
    {
      name: 'Sign',
      parentContext: request.addTransactionRequest.options.traceContext,
    },
    () =>
      signTransactionMeta(
        request.constructorOptions,
        request.dependencies,
        request.transactionMeta,
      ),
  );

  request.transactionMeta = getTransactionOrThrow(
    request.dependencies.getState(),
    request.transactionMeta.id,
  );
}

/**
 * Apply signing hooks and authorization data, sign, and persist the raw transaction.
 * Also used when signing transactions in a batch.
 *
 * @param constructorOptions - Hooks configured on the controller.
 * @param dependencies - Controller resources and state access.
 * @param originalTransactionMeta - Transaction to sign.
 * @returns The serialized transaction, or undefined for external signing.
 */
export async function signTransactionMeta(
  constructorOptions: TransactionConstructorOptions,
  dependencies: TransactionStageDependencies,
  originalTransactionMeta: TransactionMeta,
): Promise<string | undefined> {
  const {
    fetchGasFeeTokens,
    getState,
    messenger,
    updateTransaction: persistTransaction,
    updateTransactionInternal,
  } = dependencies;

  let transactionMeta = originalTransactionMeta;
  const { id: transactionId } = transactionMeta;

  log('Calling before sign hook', transactionMeta);

  const { updateTransaction } =
    (await constructorOptions.hooks.beforeSign?.({ transactionMeta })) ?? {};

  if (updateTransaction) {
    updateTransactionInternal(
      { transactionId, skipResimulateCheck: true },
      updateTransaction,
    );

    log('Updated transaction after before sign hook');
  }

  transactionMeta = getTransactionOrThrow(getState(), transactionId);

  const { networkClientId } = transactionMeta;

  await checkGasFeeTokenBeforePublish({
    fetchGasFeeTokens,
    messenger,
    networkClientId,
    transaction: transactionMeta,
    updateTransaction: (txId, fn) =>
      updateTransactionInternal({ transactionId: txId }, fn),
  });

  transactionMeta = getTransactionOrThrow(getState(), transactionId);

  const { chainId, isExternalSign, txParams } = transactionMeta;

  if (isExternalSign) {
    log('Skipping sign as signed externally');
    return undefined;
  }

  const { authorizationList, from } = txParams;

  const signedAuthorizationList = await signAuthorizationList({
    authorizationList,
    messenger,
    transactionMeta,
  });

  if (signedAuthorizationList) {
    updateTransactionInternal({ transactionId }, (txMeta) => {
      txMeta.txParams.authorizationList = signedAuthorizationList;
    });
  }

  const finalTransactionMeta = getTransactionOrThrow(getState(), transactionId);
  const { txParams: finalTxParams } = finalTransactionMeta;
  const unsignedEthTx = prepareTransaction(chainId, finalTxParams);

  startTransactionApproval(dependencies, transactionId);
  log('Signing transaction', finalTxParams);

  const abortCallbacks = getSignAbortCallbacks(dependencies);

  const signedTxData = await new Promise<TypedTxData>((resolve, reject) => {
    // eslint-disable-next-line promise/catch-or-return
    messenger
      .call('KeyringController:signTransaction', unsignedEthTx, from)
      .then(resolve, reject);

    abortCallbacks.set(transactionId, () =>
      reject(new Error('Signing aborted by user')),
    );
  });

  abortCallbacks.delete(transactionId);

  const transactionMetaWithRsv = {
    ...updateTransactionMetaRSV(finalTransactionMeta, signedTxData),
    status: TransactionStatus.signed as const,
    txParams: finalTxParams,
  };

  persistTransaction(
    transactionMetaWithRsv,
    'TransactionController#approveTransaction - Transaction signed',
  );

  messenger.publish('TransactionController:transactionStatusUpdated', {
    transactionMeta: transactionMetaWithRsv,
  });

  const rawTx = serializeTransaction(chainId, signedTxData);
  const transactionMetaWithRawTx = merge({}, transactionMetaWithRsv, { rawTx });

  persistTransaction(
    transactionMetaWithRawTx,
    'TransactionController#approveTransaction - RawTransaction added',
  );

  return rawTx;
}

/**
 * Copy the signature components onto transaction metadata.
 *
 * @param transactionMeta - The transaction metadata to copy.
 * @param signedTx - The signed transaction containing r, s, and v.
 * @returns Metadata including the signature components.
 */
export function updateTransactionMetaRSV(
  transactionMeta: TransactionMeta,
  signedTx: TypedTxData,
): TransactionMeta {
  const transactionMetaWithRsv = cloneDeep(transactionMeta);

  for (const key of ['r', 's', 'v'] as const) {
    const value = signedTx[key];

    if (value === undefined || value === null) {
      continue;
    }

    transactionMetaWithRsv[key] = add0x(
      BigInt(value as bigint | number | string).toString(16),
    );
  }

  return transactionMetaWithRsv;
}

/**
 * Reject a pending signing request for this controller.
 *
 * @param dependencies - Controller resources owning the signing request.
 * @param transactionId - Transaction whose signing should be aborted.
 */
export function abortTransactionSigning(
  dependencies: TransactionStageDependencies,
  transactionId: string,
): void {
  if (!getTransaction(dependencies.getState(), transactionId)) {
    throw new Error('Cannot abort signing as no transaction metadata found');
  }

  const abortCallbacks = signAbortCallbacks.get(dependencies);
  const abortCallback = abortCallbacks?.get(transactionId);

  if (!abortCallbacks || !abortCallback) {
    throw new Error(
      'Cannot abort signing as transaction is not waiting for signing',
    );
  }

  abortCallback();
  abortCallbacks.delete(transactionId);
}

/**
 * Get the controller-scoped callbacks for aborting keyring signing.
 *
 * @param dependencies - Stable controller-scoped resources.
 * @returns The callbacks for this controller.
 */
function getSignAbortCallbacks(
  dependencies: TransactionStageDependencies,
): Map<string, () => void> {
  let callbacks = signAbortCallbacks.get(dependencies);

  if (!callbacks) {
    callbacks = new Map();
    signAbortCallbacks.set(dependencies, callbacks);
  }

  return callbacks;
}
