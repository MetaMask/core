import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { JsonRpcError } from '@metamask/rpc-errors';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import { data } from './stages/data';
import type {
  PipelineCallbacks,
  StartTransactionResult,
  TransactionContext,
} from './types';
import { projectLogger as log } from '../logger';
import type {
  AddTransactionOptions,
  TransactionMeta,
  TransactionParams,
} from '../types';
import { TransactionStatus } from '../types';
import { normalizeTransactionParams } from '../utils/utils';
import {
  ErrorCode,
  validateTransactionOrigin,
  validateTxParams,
} from '../utils/validation';

/**
 * Creates a transaction synchronously and runs the data pipeline in the background.
 *
 * The transaction is added to state immediately with `ready: false`. Gas estimation,
 * type resolution, and other async enrichment resolve in the background — `ready`
 * flips to `true` once essential data is available.
 *
 * @param txParams - Raw transaction parameters.
 * @param options - Options controlling gas, approval, and enrichment behaviour.
 * @param context - Controller context providing state access and side-effects.
 * @returns The transaction metadata and a result promise that resolves to the hash.
 */
export function startTransaction(
  txParams: TransactionParams,
  options: AddTransactionOptions,
  context: TransactionContext,
): StartTransactionResult {
  const normalizedParams = normalizeTransactionParams(txParams);

  validateRequest(normalizedParams, options, context);

  if (options.origin !== undefined && options.origin !== ORIGIN_METAMASK) {
    throw new Error(
      'startTransaction is not supported for external transactions.',
    );
  }

  const transactionMeta = createTransaction(
    normalizedParams,
    options,
    context,
    { ready: false },
  );

  const result = runPipeline(transactionMeta, options, context);

  return { transactionMeta, result };
}

/**
 * Creates a transaction, runs the data pipeline, and starts the approval flow.
 *
 * Validates the request, resolves all async data (gas, type, security, swaps),
 * then hands off to approval processing. If a transaction with the same
 * `actionId` already exists, returns the existing one instead.
 *
 * @param txParams - Raw transaction parameters.
 * @param options - Options controlling gas, approval, and enrichment behaviour.
 * @param context - Controller context providing state access and side-effects.
 * @returns The transaction metadata and a result promise that resolves to the hash.
 */
export async function addTransaction(
  txParams: TransactionParams,
  options: AddTransactionOptions,
  context: TransactionContext,
): Promise<{ transactionMeta: TransactionMeta; result: Promise<string> }> {
  log('Adding transaction', txParams, options);

  const normalizedParams = normalizeTransactionParams(txParams);

  validateRequest(normalizedParams, options, context);
  await validateOrigin(normalizedParams, options, context);
  validateBatchId(options, context);

  const existingTransactionMeta = context.getTransactionWithActionId(
    options.actionId,
  );

  if (existingTransactionMeta) {
    const transactionMeta = cloneDeep(existingTransactionMeta);

    return {
      transactionMeta,
      result: context.processApproval(transactionMeta, {
        actionId: options.actionId,
        isExisting: true,
        publishHook: options.publishHook,
        requireApproval: options.requireApproval,
        traceContext: options.traceContext,
      }),
    };
  }

  const transactionMeta = createTransaction(normalizedParams, options, context);

  const callbacks: PipelineCallbacks = { onSuccess: [], onError: [] };

  await data(cloneDeep(transactionMeta), options, callbacks, context);

  const resolvedMeta =
    context.getTransaction(transactionMeta.id) ?? transactionMeta;

  return {
    transactionMeta: resolvedMeta,
    result: processApprovalWithCallbacks(
      resolvedMeta,
      options,
      context,
      callbacks,
    ),
  };
}

function validateRequest(
  txParams: TransactionParams,
  options: AddTransactionOptions,
  context: TransactionContext,
): void {
  if (!context.hasNetworkClient(options.networkClientId)) {
    throw new Error(`Network client not found - ${options.networkClientId}`);
  }

  validateTxParams(txParams);
}

async function validateOrigin(
  txParams: TransactionParams,
  options: AddTransactionOptions,
  context: TransactionContext,
): Promise<void> {
  if (options.origin === undefined || options.origin === ORIGIN_METAMASK) {
    return;
  }

  const permittedAddresses = await context.getPermittedAccounts?.(
    options.origin,
  );

  const internalAccounts = context.getInternalAccounts();

  await validateTransactionOrigin({
    data: txParams.data,
    from: txParams.from,
    internalAccounts,
    origin: options.origin,
    permittedAddresses,
    txParams,
    type: options.type,
  });
}

function validateBatchId(
  options: AddTransactionOptions,
  context: TransactionContext,
): void {
  const { batchId } = options;

  if (!batchId?.length) {
    return;
  }

  const isDuplicate = context.existingTransactions.some(
    (tx) => tx.batchId?.toLowerCase() === batchId?.toLowerCase(),
  );

  if (isDuplicate && options.origin && options.origin !== ORIGIN_METAMASK) {
    throw new JsonRpcError(
      ErrorCode.DuplicateBundleId,
      'Batch ID already exists',
    );
  }
}

function createTransaction(
  txParams: TransactionParams,
  options: AddTransactionOptions,
  context: TransactionContext,
  { ready }: { ready?: boolean } = {},
): TransactionMeta {
  const {
    actionId,
    assetsFiatValues,
    batchId,
    deviceConfirmedOn,
    disableGasBuffer,
    excludeNativeTokenForFee,
    gasFeeToken,
    isGasFeeIncluded,
    isGasFeeSponsored,
    isStateOnly,
    nestedTransactions,
    networkClientId,
    origin,
    requestId,
    requiredAssets,
    securityAlertResponse,
    type,
  } = options;

  const dappSuggestedGasFees = context.generateDappSuggestedGasFees(
    txParams,
    origin,
  );

  const transactionMeta: TransactionMeta = {
    actionId,
    assetsFiatValues,
    batchId,
    chainId: context.getChainId(networkClientId),
    dappSuggestedGasFees,
    deviceConfirmedOn,
    disableGasBuffer,
    id: random(),
    isGasFeeTokenIgnoredIfBalance:
      Boolean(gasFeeToken) && !excludeNativeTokenForFee,
    isGasFeeIncluded,
    isGasFeeSponsored,
    // To avoid the property to be set as undefined.
    ...(excludeNativeTokenForFee === undefined
      ? {}
      : { excludeNativeTokenForFee }),
    isStateOnly,
    nestedTransactions,
    networkClientId,
    origin,
    ready,
    requestId,
    requiredAssets,
    securityAlertResponse,
    selectedGasFeeToken: gasFeeToken,
    status: TransactionStatus.unapproved as const,
    time: Date.now(),
    txParams,
    type,
    userEditedGasLimit: false,
    verifiedOnBlockchain: false,
  };

  context.addMetadata(transactionMeta);
  context.publishEvent(transactionMeta);

  return transactionMeta;
}

async function runPipeline(
  transactionMeta: TransactionMeta,
  options: AddTransactionOptions,
  context: TransactionContext,
): Promise<string> {
  const callbacks: PipelineCallbacks = { onSuccess: [], onError: [] };

  try {
    await data(cloneDeep(transactionMeta), options, callbacks, context);

    return await processApprovalWithCallbacks(
      transactionMeta,
      options,
      context,
      callbacks,
    );
  } catch (error) {
    for (const fn of callbacks.onError) {
      fn(error as Error);
    }

    throw error;
  }
}

async function processApprovalWithCallbacks(
  transactionMeta: TransactionMeta,
  options: AddTransactionOptions,
  context: TransactionContext,
  callbacks: PipelineCallbacks,
): Promise<string> {
  try {
    const hash = await context.processApproval(transactionMeta, {
      actionId: options.actionId,
      isExisting: false,
      publishHook: options.publishHook,
      requireApproval: options.requireApproval,
      traceContext: options.traceContext,
    });

    for (const fn of callbacks.onSuccess) {
      fn();
    }

    return hash;
  } catch (error) {
    for (const fn of callbacks.onError) {
      fn(error as Error);
    }

    throw error;
  }
}
