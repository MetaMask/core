import type { NetworkClientId } from '@metamask/network-controller';

import { ExtraTransactionsPublishHook } from '../hooks/ExtraTransactionsPublishHook.js';
import { projectLogger as log } from '../logger.js';
import type {
  PublishHook,
  PublishHookResult,
  TransactionMeta,
} from '../types.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { getTransaction, getTransactionOrThrow } from '../utils/state.js';
import { releaseTransactionExecution } from './state.js';
import type { TransactionLifecycleRequest } from './types.js';

/** Apply publish hooks and submit the signed execution. */
export async function submitTransaction(
  request: TransactionLifecycleRequest,
): Promise<void> {
  const {
    addTransactionRequest: { options },
    constructorOptions: { hooks },
    dependencies,
    lifecycle,
    transactionMeta,
  } = request;

  if (transactionMeta.isStateOnly) {
    submitStateOnlyTransaction(request);
    return;
  }

  const { execution } = lifecycle;

  if (!execution) {
    return;
  }

  const rawTx = transactionMeta.isExternalSign
    ? undefined
    : transactionMeta.rawTx;

  const beforePublish = hooks.beforePublish ?? (() => Promise.resolve(true));

  if (!(await beforePublish(transactionMeta))) {
    log('Skipping publishing transaction based on hook');

    dependencies.messenger.publish(
      'TransactionController:transactionPublishingSkipped',
      transactionMeta,
    );

    releaseTransactionExecution(lifecycle);
    lifecycle.resultCallbacks?.success();
    return;
  }

  if (!rawTx && !transactionMeta.isExternalSign) {
    return;
  }

  await publishAndSubmitTransaction(
    request,
    execution.networkClientId,
    rawTx,
    () => {
      execution.releaseNonce?.();
      delete execution.releaseNonce;
    },
  );

  releaseTransactionExecution(lifecycle);

  dependencies.messenger.publish('TransactionController:transactionApproved', {
    actionId: options.actionId,
    transactionMeta: getTransaction(
      dependencies.getState(),
      transactionMeta.id,
    ) as TransactionMeta,
  });
}

/**
 * Record a state-only transaction as submitted.
 *
 * State-only transactions are never signed or published, so they bypass
 * approval entirely and are marked as submitted immediately.
 *
 * @param request - Dependencies and context for the transaction.
 * @returns An empty hash, as no transaction was published.
 */
function submitStateOnlyTransaction(
  request: TransactionLifecycleRequest,
): string {
  const {
    transactionMeta,
    dependencies: { updateTransactionInternal },
  } = request;

  updateTransactionInternal(
    { transactionId: transactionMeta.id, skipValidation: true },
    (tx) => {
      tx.status = TransactionStatus.submitted;
      tx.submittedTime = new Date().getTime();
    },
  );

  return '';
}

/**
 * Publish a signed transaction to the network and record it as submitted.
 *
 * Captures the pre-transaction balance for swaps, releases the nonce lock,
 * publishes via the applicable hook, and emits the submitted and finished
 * events.
 *
 * @param request - Dependencies and context for the transaction.
 * @param networkClientId - The network captured before signing hooks run.
 * @param rawTx - The locally signed transaction, if present.
 * @param releaseNonceLock - Release the nonce immediately before publishing.
 * @returns The submitted transaction.
 */
async function publishAndSubmitTransaction(
  request: TransactionLifecycleRequest,
  networkClientId: NetworkClientId,
  rawTx: string | undefined,
  releaseNonceLock: () => void,
): Promise<TransactionMeta> {
  const {
    dependencies: { internalEvents, messenger, updateTransactionInternal },
    transactionMeta,
  } = request;

  const { id: transactionId, txParams } = transactionMeta;
  const shouldUpdatePreTxBalance =
    transactionMeta.type === TransactionType.swap;

  let preTxBalance: string | undefined;

  if (shouldUpdatePreTxBalance) {
    log('Determining pre-transaction balance');

    preTxBalance = (await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_getBalance',
      params: [txParams.from, 'latest'],
    })) as string;
  }

  log('Publishing transaction', transactionMeta.txParams);

  releaseNonceLock();

  const publishHook = getPublishHook(request, networkClientId);

  const { transactionHash: hash } = await publishHook(
    transactionMeta,
    rawTx ?? '0x',
  );

  const submittedTransactionMeta = updateTransactionInternal(
    {
      transactionId,
    },
    (draftTxMeta) => {
      draftTxMeta.hash = hash;
      draftTxMeta.status = TransactionStatus.submitted;
      draftTxMeta.submittedTime ??= new Date().getTime();

      if (shouldUpdatePreTxBalance) {
        draftTxMeta.preTxBalance = preTxBalance;
        log('Updated pre-transaction balance', preTxBalance);
      }
    },
  );

  request.transactionMeta = submittedTransactionMeta;

  messenger.publish('TransactionController:transactionSubmitted', {
    transactionMeta: submittedTransactionMeta,
  });

  messenger.publish(
    'TransactionController:transactionFinished',
    submittedTransactionMeta,
  );

  internalEvents.emit(`${transactionId}:finished`, submittedTransactionMeta);

  messenger.publish('TransactionController:transactionStatusUpdated', {
    transactionMeta: submittedTransactionMeta,
  });

  return submittedTransactionMeta;
}

/**
 * Determine which hook to publish the transaction with.
 *
 * Transactions with additional batch transactions are published by a hook that
 * submits those alongside the original transaction.
 *
 * @param request - Dependencies and context for the transaction.
 * @param networkClientId - The network captured before signing hooks run.
 * @returns The hook to publish the transaction with.
 */
function getPublishHook(
  request: TransactionLifecycleRequest,
  networkClientId: NetworkClientId,
): PublishHook {
  const {
    dependencies: { addTransactionBatch, getState },
    transactionMeta,
  } = request;

  const publishHook = defaultPublishHook.bind(null, request, networkClientId);

  if (!transactionMeta.batchTransactions?.length) {
    return publishHook;
  }

  log('Found batch transactions', transactionMeta.batchTransactions);

  return new ExtraTransactionsPublishHook({
    addTransactionBatch,
    getTransaction: (transactionId) =>
      getTransactionOrThrow(getState(), transactionId),
    originalPublishHook: publishHook,
  }).getHook();
}

/**
 * Run the publish hook, falling back to the controller's shared publisher.
 *
 * @param request - Transaction input and controller resources.
 * @param networkClientId - The network captured before signing hooks run.
 * @param transactionMeta - The transaction to publish.
 * @param signedTx - The serialized signed transaction.
 * @returns The resulting transaction hash.
 */
async function defaultPublishHook(
  request: TransactionLifecycleRequest,
  networkClientId: NetworkClientId,
  transactionMeta: TransactionMeta,
  signedTx: string,
): Promise<PublishHookResult> {
  const {
    addTransactionRequest: {
      options: { publishHook: publishHookOverride, traceContext },
    },
    constructorOptions: { hooks, trace },
    dependencies,
  } = request;

  let transactionHash: string | undefined;

  await trace({ name: 'Publish', parentContext: traceContext }, async () => {
    const publishHook: PublishHook =
      publishHookOverride ??
      hooks.publish ??
      (() => Promise.resolve({ transactionHash: undefined }));

    ({ transactionHash } = await publishHook(transactionMeta, signedTx));

    // eslint-disable-next-line require-atomic-updates
    transactionHash ??= await dependencies.publishTransaction({
      ...transactionMeta,
      networkClientId,
      rawTx: signedTx,
    });
  });

  log('Publish successful', transactionHash);
  return { transactionHash };
}
