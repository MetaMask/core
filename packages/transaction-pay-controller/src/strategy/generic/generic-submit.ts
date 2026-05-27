import { ORIGIN_METAMASK, toHex } from '@metamask/controller-utils';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getGenericPollingInterval,
  getGenericPollingTimeout,
} from '../../utils/feature-flags';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { getGenericStatus, submitGenericIntent } from './generic-api';
import type {
  GenericQuote,
  GenericQuoteStep,
  GenericStatusResponse,
  GenericSubmitRequest,
} from './types';
import { GenericStatus } from './types';

const log = createModuleLogger(projectLogger, 'generic-strategy');

/**
 * Submits generic intent quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitGenericQuotes(
  request: PayStrategyExecuteRequest<GenericQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing generic quotes', request);

  const { quotes, messenger, transaction } = request;

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleGenericQuote(
      quote,
      messenger,
      transaction,
    ));
  }

  return { transactionHash };
}

async function executeSingleGenericQuote(
  quote: TransactionPayQuote<GenericQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<{ transactionHash?: Hex }> {
  log('Executing single generic quote', quote);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Remove nonce from skipped transaction',
    },
    (tx) => {
      tx.txParams.nonce = undefined;
    },
  );

  if (quote.original.gasless) {
    await submitViaGenericExecute(quote, messenger, transaction);
  } else {
    await submitViaTransactionController(quote, messenger, transaction);
  }

  const targetHash = await waitForGenericCompletion(
    quote.original,
    messenger,
    transaction.id,
  );

  log('Generic request completed', targetHash);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Intent complete after Generic completion',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { transactionHash: targetHash };
}

async function submitViaGenericExecute(
  quote: TransactionPayQuote<GenericQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const { from, sourceChainId } = quote.request;
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  const nestedTransactions = quote.original.steps.map((step) => ({
    data: step.data,
    to: step.to,
    value: step.value as Hex,
  }));

  const sourceCallTransaction = {
    ...transaction,
    chainId: sourceChainId,
    networkClientId,
    nestedTransactions,
    txParams: {
      ...transaction.txParams,
      from,
    },
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: sourceCallTransaction },
  );

  log('Delegation result for generic source calls', delegation);

  const submitBody: GenericSubmitRequest = {
    provider: quote.original.provider,
    id: quote.original.id,
    chainId: Number(sourceChainId),
    to: delegation.to,
    data: delegation.data,
    value: new BigNumber(delegation.value).toFixed(),
    ...(delegation.authorizationList?.length
      ? {
          authorizationList: delegation.authorizationList.map((auth) => ({
            chainId: Number(auth.chainId),
            address: auth.address,
            nonce: Number(auth.nonce),
            yParity: Number(auth.yParity),
            r: auth.r as Hex,
            s: auth.s as Hex,
          })),
        }
      : {}),
  };

  const submitResponse = await submitGenericIntent(messenger, submitBody);

  if (!submitResponse.success) {
    throw new Error(
      `Generic submit failed: ${submitResponse.error ?? 'unknown'}`,
    );
  }
}

async function submitViaTransactionController(
  quote: TransactionPayQuote<GenericQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const { steps } = quote.original;

  if (steps.length === 0) {
    throw new Error('Generic quote has no steps to submit');
  }

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  const transactionParams = steps.map((step) => stepToParams(step, from));
  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  log('Submitting via TransactionController', {
    from,
    gasFeeToken,
    networkClientId,
    sourceChainId,
    stepCount: steps.length,
  });

  const transactionIds: string[] = [];
  const { end } = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);
      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: 'Add required transaction ID from generic submission',
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(transactionId);
        },
      );
    },
  );

  try {
    if (transactionParams.length === 1) {
      await messenger.call(
        'TransactionController:addTransaction',
        transactionParams[0],
        {
          gasFeeToken,
          networkClientId,
          origin: ORIGIN_METAMASK,
          requireApproval: false,
        },
      );
    } else {
      await messenger.call('TransactionController:addTransactionBatch', {
        from,
        gasFeeToken,
        networkClientId,
        origin: ORIGIN_METAMASK,
        overwriteUpgrade: true,
        requireApproval: false,
        transactions: transactionParams.map((params) => ({
          params: {
            data: params.data as Hex,
            gas: params.gas as Hex | undefined,
            maxFeePerGas: params.maxFeePerGas as Hex,
            maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex,
            to: params.to as Hex,
            value: params.value as Hex,
          },
        })),
      });
    }
  } finally {
    end();
  }

  log('Generic transactions added', transactionIds);

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('Generic transactions confirmed', transactionIds);

  const lastId = transactionIds.at(-1);
  const sourceHash = lastId
    ? getTransaction(lastId, messenger)?.hash
    : undefined;

  if (sourceHash) {
    updateTransaction(
      {
        transactionId: transaction.id,
        messenger,
        note: 'Add source hash from generic transaction submission',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = sourceHash as Hex;
      },
    );
  }
}

function stepToParams(step: GenericQuoteStep, from: Hex): TransactionParams {
  return {
    data: step.data,
    from,
    gas: step.gasLimit ? toHex(step.gasLimit) : undefined,
    maxFeePerGas: step.maxFeePerGas ? toHex(step.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: step.maxPriorityFeePerGas
      ? toHex(step.maxPriorityFeePerGas)
      : undefined,
    to: step.to,
    value: toHex(step.value),
  };
}

async function waitForGenericCompletion(
  quote: GenericQuote,
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<Hex | undefined> {
  const pollingInterval = getGenericPollingInterval(messenger);
  const pollingTimeout = getGenericPollingTimeout(messenger);
  const hasTimeout = pollingTimeout !== undefined && pollingTimeout > 0;

  log('Generic polling config', { pollingInterval, pollingTimeout });

  const startTime = Date.now();

  let lastStatus: string | undefined;
  let sourceHashEmitted = false;

  while (true) {
    let statusResponse: GenericStatusResponse | undefined;

    try {
      statusResponse = await getGenericStatus(messenger, {
        provider: quote.provider,
        id: quote.id,
      });
    } catch (error) {
      log('Polling network error', error);
    }

    if (statusResponse) {
      lastStatus = statusResponse.status;
      log('Polled status', statusResponse.status, statusResponse);

      if (!sourceHashEmitted && statusResponse.sourceHash) {
        sourceHashEmitted = true;
        const { sourceHash } = statusResponse;

        updateTransaction(
          {
            transactionId,
            messenger,
            note: 'Add source hash from generic status',
          },
          (tx) => {
            tx.metamaskPay ??= {};
            tx.metamaskPay.sourceHash = sourceHash;
          },
        );
      }

      if (statusResponse.status === GenericStatus.Confirmed) {
        return statusResponse.targetHash;
      }

      if (
        statusResponse.status === GenericStatus.Failed ||
        statusResponse.status === GenericStatus.Refunded
      ) {
        throw new Error(
          `Generic intent ${statusResponse.status.toLowerCase()}`,
        );
      }
    }

    if (hasTimeout && Date.now() - startTime >= pollingTimeout) {
      const statusDetail = lastStatus ? ` (last status: ${lastStatus})` : '';
      throw new Error(`Generic polling timed out${statusDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
}
