import type { TraceContext } from '@metamask/controller-utils';
import { cloneDeep, noop } from 'lodash-es';

import { projectLogger as log } from '../logger.js';
import type { AfterAddHook, TransactionMeta } from '../types.js';
import { TransactionEnvelopeType, TransactionType } from '../types.js';
import { updateGasFees } from '../utils/gas-fees.js';
import { updateTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow.js';
import { updateSwapsTransaction } from '../utils/swaps.js';
import { rejectTransaction } from './error.js';
import { getEIP1559Compatibility } from './init.js';
import type { TransactionLifecycleRequest } from './types.js';

/**
 * Populate a newly initialised transaction with gas and swaps data.
 *
 * Runs the `afterAdd` hook, estimates gas properties, and applies swaps
 * metadata. Operates on the detached transaction from the init stage, before
 * it is persisted to state.
 *
 * When `skipInitialGasEstimate` is set the gas estimate runs in the background
 * against a clone and is written back to state once resolved, so that adding
 * the transaction is not blocked on it.
 *
 * @param request - Dependencies and context for the transaction.
 * @returns The transaction metadata including any swaps data.
 */
export async function addTransactionData(
  request: TransactionLifecycleRequest,
): Promise<TransactionMeta> {
  await applyAfterAddHook(request);
  await addGasData(request);
  addSwapsData(request);

  return request.transactionMeta;
}

/**
 * Apply the configured hook before gas estimation and preserve original params.
 *
 * @param request - The transaction and configured hooks.
 */
async function applyAfterAddHook(
  request: TransactionLifecycleRequest,
): Promise<void> {
  const {
    constructorOptions: { hooks },
    transactionMeta,
  } = request;

  const afterAdd =
    hooks.afterAdd ?? ((): ReturnType<AfterAddHook> => Promise.resolve({}));

  const { updateTransaction } = await afterAdd({ transactionMeta });

  if (updateTransaction) {
    log('Updating transaction using afterAdd hook');

    transactionMeta.txParamsOriginal = cloneDeep(transactionMeta.txParams);

    updateTransaction(transactionMeta);
  }
}

/**
 * Populate gas values now or start the non-blocking estimate.
 *
 * @param request - The transaction and gas estimation options.
 */
async function addGasData(request: TransactionLifecycleRequest): Promise<void> {
  const {
    addTransactionRequest: {
      options: { skipInitialGasEstimate, traceContext },
    },
    constructorOptions: { trace },
    transactionMeta,
  } = request;

  // eslint-disable-next-line no-negated-condition
  if (!skipInitialGasEstimate) {
    await trace(
      { name: 'Estimate Gas Properties', parentContext: traceContext },
      (context) =>
        updateGasProperties(request, transactionMeta, {
          traceContext: context,
        }),
    );
  } else {
    estimateGasPropertiesInBackground(request);
  }
}

/**
 * Estimate gas, select execution fees, and calculate the layer 1 fee in order.
 *
 * @param request - Gas services and configuration.
 * @param transactionMeta - Detached metadata to update.
 * @param options - Tracing options.
 * @param options.traceContext - Parent trace context.
 */
async function updateGasProperties(
  request: TransactionLifecycleRequest,
  transactionMeta: TransactionMeta,
  { traceContext }: { traceContext?: TraceContext } = {},
): Promise<void> {
  const isEIP1559Compatible =
    transactionMeta.txParams.type !== TransactionEnvelopeType.legacy &&
    (await getEIP1559Compatibility(
      request.dependencies,
      transactionMeta.networkClientId,
    ));

  await updateTransactionGas(request, transactionMeta, traceContext);

  await updateTransactionGasFees(
    request,
    transactionMeta,
    isEIP1559Compatible,
    traceContext,
  );

  await updateLayer1GasFees(request, transactionMeta, traceContext);
}

/**
 * Estimate the transaction gas limit.
 *
 * @param request - Gas estimation services and tracing.
 * @param transactionMeta - Detached metadata to update.
 * @param traceContext - Parent trace context.
 */
async function updateTransactionGas(
  request: TransactionLifecycleRequest,
  transactionMeta: TransactionMeta,
  traceContext?: TraceContext,
): Promise<void> {
  const {
    constructorOptions: { trace },
    dependencies,
  } = request;

  await trace({ name: 'Update Gas', parentContext: traceContext }, async () => {
    await dependencies.updateGasEstimate(transactionMeta);
  });
}

/**
 * Apply current gas fees and the account's saved fee preferences.
 *
 * @param request - Fee flows, saved preferences, and tracing.
 * @param transactionMeta - Detached metadata to update.
 * @param isEIP1559Compatible - Whether the transaction supports EIP-1559 fees.
 * @param traceContext - Parent trace context.
 */
async function updateTransactionGasFees(
  request: TransactionLifecycleRequest,
  transactionMeta: TransactionMeta,
  isEIP1559Compatible: boolean,
  traceContext?: TraceContext,
): Promise<void> {
  const {
    constructorOptions: { getSavedGasFees, trace },
    dependencies,
  } = request;

  await trace(
    { name: 'Update Gas Fees', parentContext: traceContext },
    async () =>
      await updateGasFees({
        eip1559: isEIP1559Compatible,
        gasFeeFlows: dependencies.gasFeeFlows,
        getGasFeeEstimates: (options) =>
          dependencies.messenger.call(
            'GasFeeController:fetchGasFeeEstimates',
            options,
          ),
        getSavedGasFees: getSavedGasFees ?? (() => undefined),
        messenger: dependencies.messenger,
        txMeta: transactionMeta,
      }),
  );
}

/**
 * Apply the layer 1 fee for rollup transactions.
 *
 * @param request - Layer 1 fee flows and tracing.
 * @param transactionMeta - Detached metadata to update.
 * @param traceContext - Parent trace context.
 */
async function updateLayer1GasFees(
  request: TransactionLifecycleRequest,
  transactionMeta: TransactionMeta,
  traceContext?: TraceContext,
): Promise<void> {
  const {
    constructorOptions: { trace },
    dependencies,
  } = request;

  await trace(
    { name: 'Update Layer 1 Gas Fees', parentContext: traceContext },
    async () =>
      await updateTransactionLayer1GasFee({
        layer1GasFeeFlows: dependencies.layer1GasFeeFlows,
        messenger: dependencies.messenger,
        transactionMeta,
      }),
  );
}

/**
 * Apply swaps metadata and reject an obsolete swaps transaction when required.
 *
 * @param request - The transaction and swaps configuration.
 */
function addSwapsData(request: TransactionLifecycleRequest): void {
  const {
    addTransactionRequest: {
      options: { swaps = {} },
    },
    constructorOptions: { disableSwaps },
    dependencies: { messenger },
    transactionMeta,
  } = request;

  request.transactionMeta = updateSwapsTransaction(
    transactionMeta,
    transactionMeta.type as TransactionType,
    swaps,
    {
      cancelTransaction: (transactionId) =>
        rejectTransaction(request, transactionId),
      isSwapsDisabled: disableSwaps ?? false,
      messenger,
    },
  );
}

/**
 * Estimate the gas properties of a transaction without blocking.
 *
 * Estimates against a clone so the transaction can be added immediately, and
 * writes the resulting gas values back to state once they resolve.
 *
 * @param request - Dependencies and context for the transaction.
 */
function estimateGasPropertiesInBackground(
  request: TransactionLifecycleRequest,
): void {
  const {
    transactionMeta,
    dependencies: { updateTransactionInternal },
  } = request;

  const newTransactionMeta = cloneDeep(transactionMeta);

  updateGasProperties(request, newTransactionMeta)
    .then(() => {
      updateTransactionInternal(
        {
          transactionId: newTransactionMeta.id,
          skipResimulateCheck: true,
          skipValidation: true,
        },
        (tx) => {
          tx.txParams.gas = newTransactionMeta.txParams.gas;
          tx.txParams.gasPrice = newTransactionMeta.txParams.gasPrice;
          tx.txParams.maxFeePerGas = newTransactionMeta.txParams.maxFeePerGas;
          tx.txParams.maxPriorityFeePerGas =
            newTransactionMeta.txParams.maxPriorityFeePerGas;
        },
      );

      return undefined;
    })
    .catch(noop);
}
