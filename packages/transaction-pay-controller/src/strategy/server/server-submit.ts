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
  getServerPollingInterval,
  getServerPollingTimeout,
} from '../../utils/feature-flags';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { getServerStatus, submitServerIntent } from './server-api';
import type {
  ServerQuote,
  ServerQuoteStep,
  ServerStatusResponse,
  ServerSubmitRequest,
} from './types';
import { ServerStatus } from './types';

const log = createModuleLogger(projectLogger, 'server-strategy');

/**
 * Submits server intent quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitServerQuotes(
  request: PayStrategyExecuteRequest<ServerQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing server quotes', request);

  const { quotes, messenger, transaction } = request;

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleServerQuote(
      quote,
      messenger,
      transaction,
    ));
  }

  return { transactionHash };
}

async function executeSingleServerQuote(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<{ transactionHash?: Hex }> {
  log('Executing single server quote', quote);

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
    await submitViaServerExecute(quote, messenger, transaction);
  } else {
    await submitViaTransactionController(quote, messenger, transaction);
  }

  const targetHash = await waitForServerCompletion(
    quote.original,
    messenger,
    transaction.id,
  );

  log('Server request completed', targetHash);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Intent complete after Server completion',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { transactionHash: targetHash };
}

async function submitViaServerExecute(
  quote: TransactionPayQuote<ServerQuote>,
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

  log('Delegation result for server source calls', delegation);

  const submitBody: ServerSubmitRequest = {
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

  const submitResponse = await submitServerIntent(messenger, submitBody);

  if (!submitResponse.success) {
    throw new Error(
      `Server submit failed: ${submitResponse.error ?? 'unknown'}`,
    );
  }
}

async function submitViaTransactionController(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const { steps } = quote.original;

  if (steps.length === 0) {
    throw new Error('Server quote has no steps to submit');
  }

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  const { gasLimits, is7702, maxFeePerGas, maxPriorityFeePerGas } =
    quote.original.client;
  const transactionParams = steps.map((step, i) =>
    stepToParams(step, from, gasLimits[i], maxFeePerGas, maxPriorityFeePerGas),
  );
  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  log('Submitting via TransactionController', {
    from,
    gasFeeToken,
    is7702,
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
          note: 'Add required transaction ID from server submission',
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
      const addTransactionOptions = {
        gasFeeToken,
        isInternal: true,
        networkClientId,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
      };

      log('Calling addTransaction', {
        params: transactionParams[0],
        options: addTransactionOptions,
      });
      console.log(
        '[server-submit] addTransaction params',
        transactionParams[0],
        'options',
        addTransactionOptions,
      );

      await messenger.call(
        'TransactionController:addTransaction',
        transactionParams[0],
        addTransactionOptions,
      );
    } else {
      const gasLimit7702 = is7702 ? toHex(gasLimits[0]) : undefined;

      const batchTransactions = transactionParams.map((params, i) => {
        const gas = (gasLimit7702 ??
          (gasLimits[i] !== undefined ? params.gas : undefined)) as
          | Hex
          | undefined;

        return {
          params: {
            data: params.data as Hex,
            gas,
            maxFeePerGas: params.maxFeePerGas as Hex,
            maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex,
            to: params.to as Hex,
            value: params.value as Hex,
          },
        };
      });

      const addTransactionBatchOptions = {
        from,
        ...(gasLimit7702 !== undefined
          ? {
              disable7702: false,
              disableHook: true,
              disableSequential: true,
              gasLimit7702,
            }
          : { disable7702: true }),
        gasFeeToken,
        isInternal: true,
        networkClientId,
        origin: ORIGIN_METAMASK,
        overwriteUpgrade: true,
        requireApproval: false,
        transactions: batchTransactions,
      };

      log('Calling addTransactionBatch', addTransactionBatchOptions);
      console.log(
        '[server-submit] addTransactionBatch options',
        addTransactionBatchOptions,
      );

      await messenger.call(
        'TransactionController:addTransactionBatch',
        addTransactionBatchOptions,
      );
    }
  } finally {
    end();
  }

  log('Server transactions added', transactionIds);

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('Server transactions confirmed', transactionIds);

  const lastId = transactionIds.at(-1);
  const sourceHash = lastId
    ? getTransaction(lastId, messenger)?.hash
    : undefined;

  if (sourceHash) {
    updateTransaction(
      {
        transactionId: transaction.id,
        messenger,
        note: 'Add source hash from server transaction submission',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = sourceHash as Hex;
      },
    );
  }
}

function stepToParams(
  step: ServerQuoteStep,
  from: Hex,
  gasLimit?: number,
  clientMaxFeePerGas?: string,
  clientMaxPriorityFeePerGas?: string,
): TransactionParams {
  const gas = gasLimit
    ? toHex(gasLimit)
    : step.gasLimit
      ? toHex(step.gasLimit)
      : undefined;

  const resolvedMaxFeePerGas = step.maxFeePerGas ?? clientMaxFeePerGas;
  const resolvedMaxPriorityFeePerGas =
    step.maxPriorityFeePerGas ?? clientMaxPriorityFeePerGas;

  const params = {
    data: step.data,
    from,
    gas,
    maxFeePerGas: resolvedMaxFeePerGas
      ? toHex(resolvedMaxFeePerGas)
      : undefined,
    maxPriorityFeePerGas: resolvedMaxPriorityFeePerGas
      ? toHex(resolvedMaxPriorityFeePerGas)
      : undefined,
    to: step.to,
    value: toHex(step.value),
  };

  log('Step to params', {
    step: {
      gasLimit: step.gasLimit,
      maxFeePerGas: step.maxFeePerGas,
      maxPriorityFeePerGas: step.maxPriorityFeePerGas,
      value: step.value,
    },
    params: {
      gas: params.gas,
      maxFeePerGas: params.maxFeePerGas,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas,
      value: params.value,
    },
  });

  return params;
}

async function waitForServerCompletion(
  quote: ServerQuote,
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<Hex | undefined> {
  const pollingInterval = getServerPollingInterval(messenger);
  const pollingTimeout = getServerPollingTimeout(messenger);
  const hasTimeout = pollingTimeout !== undefined && pollingTimeout > 0;

  log('Server polling config', { pollingInterval, pollingTimeout });

  const startTime = Date.now();

  let lastStatus: string | undefined;
  let sourceHashEmitted = false;

  while (true) {
    let statusResponse: ServerStatusResponse | undefined;

    try {
      const tx = getTransaction(transactionId, messenger);

      statusResponse = await getServerStatus(messenger, {
        provider: quote.provider,
        id: quote.id,
        hash: tx?.metamaskPay?.sourceHash ?? tx?.hash,
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
            note: 'Add source hash from server status',
          },
          (tx) => {
            tx.metamaskPay ??= {};
            tx.metamaskPay.sourceHash = sourceHash;
          },
        );
      }

      if (statusResponse.status === ServerStatus.Confirmed) {
        return statusResponse.targetHash;
      }

      if (
        statusResponse.status === ServerStatus.Failed ||
        statusResponse.status === ServerStatus.Refunded
      ) {
        throw new Error(`Server intent ${statusResponse.status.toLowerCase()}`);
      }
    }

    if (hasTimeout && Date.now() - startTime >= pollingTimeout) {
      const statusDetail = lastStatus ? ` (last status: ${lastStatus})` : '';
      throw new Error(`Server polling timed out${statusDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
}
