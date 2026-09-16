import type { TraceContext } from '@metamask/controller-utils';
import { cloneDeep, noop } from 'lodash-es';
import { projectLogger as log } from '../logger.js';
import type { AfterAddHook, TransactionMeta } from '../types.js';
import { TransactionEnvelopeType, TransactionType } from '../types.js';
import { updateGasFees } from '../utils/gas-fees.js';
import { updateTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow.js';
import { updateSwapsTransaction } from '../utils/swaps.js';
import type { RejectTransactionRequest } from './error.js';
import { rejectTransaction } from './error.js';
import { getEIP1559Compatibility } from './init.js';
import type {
  AddTransactionInput,
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** The dependencies and context required to add transaction data. */
export type AddTransactionDataRequest = RejectTransactionRequest &
  UpdateGasPropertiesRequest & {
    addTransactionRequest: AddTransactionInput;
    constructorOptions: Pick<TransactionConstructorOptions, 'disableSwaps'> & {
      hooks: Pick<TransactionConstructorOptions['hooks'], 'afterAdd'>;
    };
    dependencies: Pick<
      TransactionStageDependencies,
      'updateTransactionInternal'
    >;
    transactionMeta: TransactionMeta;
  };

/** Resources used to estimate gas and apply fee preferences. */
type UpdateGasPropertiesRequest = {
  constructorOptions: Pick<
    TransactionConstructorOptions,
    'getSavedGasFees' | 'trace'
  >;
  dependencies: Pick<
    TransactionStageDependencies,
    'gasFeeFlows' | 'layer1GasFeeFlows' | 'messenger' | 'updateGasEstimate'
  >;
};

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
  request: AddTransactionDataRequest,
): Promise<TransactionMeta> {
  const {
    addTransactionRequest: { options },
    constructorOptions: { disableSwaps, hooks, trace },
    dependencies: { messenger },
    transactionMeta,
  } = request;

  const { skipInitialGasEstimate, swaps = {}, traceContext } = options;
  const afterAdd =
    hooks.afterAdd ?? ((): ReturnType<AfterAddHook> => Promise.resolve({}));

  const { updateTransaction } = await afterAdd({ transactionMeta });

  if (updateTransaction) {
    log('Updating transaction using afterAdd hook');

    transactionMeta.txParamsOriginal = cloneDeep(transactionMeta.txParams);

    updateTransaction(transactionMeta);
  }

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

  request.transactionMeta = updateSwapsTransaction(
    transactionMeta,
    transactionMeta.type as TransactionType,
    swaps,
    {
      isSwapsDisabled: disableSwaps ?? false,
      cancelTransaction: (transactionId) =>
        rejectTransaction(request, transactionId),
      messenger,
    },
  );
  return request.transactionMeta;
}

async function updateGasProperties(
  request: UpdateGasPropertiesRequest,
  transactionMeta: TransactionMeta,
  { traceContext }: { traceContext?: TraceContext } = {},
): Promise<void> {
  const {
    constructorOptions: { getSavedGasFees, trace },
    dependencies,
  } = request;
  const isEIP1559Compatible =
    transactionMeta.txParams.type !== TransactionEnvelopeType.legacy &&
    (await getEIP1559Compatibility(
      dependencies,
      transactionMeta.networkClientId,
    ));

  await trace({ name: 'Update Gas', parentContext: traceContext }, async () => {
    await dependencies.updateGasEstimate(transactionMeta);
  });

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
 * Estimate the gas properties of a transaction without blocking.
 *
 * Estimates against a clone so the transaction can be added immediately, and
 * writes the resulting gas values back to state once they resolve.
 *
 * @param request - Dependencies and context for the transaction.
 */
function estimateGasPropertiesInBackground(
  request: AddTransactionDataRequest,
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
