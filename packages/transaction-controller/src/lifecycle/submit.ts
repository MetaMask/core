import type { TraceContext } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import { ExtraTransactionsPublishHook } from '../hooks/ExtraTransactionsPublishHook.js';
import { projectLogger as log } from '../logger.js';
import type { PublishHook, TransactionMeta } from '../types.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { getTransaction, getTransactionOrThrow } from '../utils/state.js';
import type { PublishTransactionRequest } from './publish.js';
import { defaultPublishHook } from './publish.js';
import type { TransactionLifecycleContext } from './state.js';
import { releaseTransactionExecution } from './state.js';
import type {
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** The dependencies and context required to submit a transaction. */
export type SubmitTransactionRequest = PublishTransactionRequest & {
  dependencies: Pick<
    TransactionStageDependencies,
    | 'addTransactionBatch'
    | 'getState'
    | 'internalEvents'
    | 'messenger'
    | 'updateTransactionInternal'
  >;
  /**
   * The network client the transaction was approved on. Captured before
   * signing, as hooks may replace the transaction metadata.
   */
  networkClientId: NetworkClientId;

  /** Custom logic to publish the transaction. */
  publishHookOverride?: PublishHook;

  /** The serialized signed transaction, if it was signed locally. */
  rawTx?: string;

  /**
   * Release the nonce lock reserved by the approve stage. Called immediately
   * before publishing so the nonce stays locked until then.
   */
  releaseNonceLock: () => void;

  traceContext?: TraceContext;

  transactionMeta: TransactionMeta;
};

/** The dependencies and context required to submit a state-only transaction. */
export type SubmitStateOnlyTransactionRequest = {
  dependencies: Pick<TransactionStageDependencies, 'updateTransactionInternal'>;
  transactionMeta: TransactionMeta;
};

/** Apply publish hooks and submit the signed execution. */
export async function submitTransaction(
  request: {
    constructorOptions: {
      hooks: Pick<TransactionConstructorOptions['hooks'], 'beforePublish'>;
    };
    dependencies: Pick<
      TransactionStageDependencies,
      | 'addTransactionBatch'
      | 'getState'
      | 'internalEvents'
      | 'messenger'
      | 'updateTransactionInternal'
    >;
  } & PublishTransactionRequest &
    TransactionLifecycleContext,
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

  const publishRequest = {
    ...request,
    networkClientId: execution.networkClientId,
    publishHookOverride: options.publishHook,
    rawTx,
    releaseNonceLock: (): void => {
      execution.releaseNonce?.();
      delete execution.releaseNonce;
    },
    traceContext: options.traceContext,
  };
  try {
    await publishAndSubmitTransaction(publishRequest);
  } finally {
    request.transactionMeta = publishRequest.transactionMeta;
  }

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
export function submitStateOnlyTransaction(
  request: SubmitStateOnlyTransactionRequest,
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
 * @returns The submitted transaction.
 */
async function publishAndSubmitTransaction(
  request: SubmitTransactionRequest,
): Promise<TransactionMeta> {
  const {
    dependencies: { internalEvents, messenger, updateTransactionInternal },
    networkClientId,
    rawTx,
    releaseNonceLock,
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

  const publishHook = getPublishHook(request);

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
 * @returns The hook to publish the transaction with.
 */
function getPublishHook(request: SubmitTransactionRequest): PublishHook {
  const {
    dependencies: { addTransactionBatch, getState },
    networkClientId,
    publishHookOverride,
    traceContext,
    transactionMeta,
  } = request;

  const publishHook = defaultPublishHook.bind(null, request, {
    networkClientId,
    publishHookOverride,
    traceContext,
  });

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
