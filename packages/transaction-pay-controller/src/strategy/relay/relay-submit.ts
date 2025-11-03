import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import type { TransactionParams } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { RELAY_URL_BASE } from './constants';
import type { RelayQuote, RelayStatus } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import {
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const log = createModuleLogger(projectLogger, 'relay-strategy');

/**
 * Submits Relay quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitRelayQuotes(
  request: PayStrategyExecuteRequest<RelayQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing quotes', request);

  const { quotes, messenger, transaction } = request;

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleQuote(
      quote.original,
      messenger,
      transaction,
    ));
  }

  const isSkipTransaction = quotes.some((q) => q.original.skipTransaction);

  if (isSkipTransaction) {
    log('Skipping original transaction', transactionHash);
    return { transactionHash };
  }

  return { transactionHash: undefined };
}

/**
 * Executes a single Relay quote.
 *
 * @param quote - Relay quote to execute.
 * @param messenger - Controller messenger.
 * @param transaction - Original transaction meta.
 * @returns An object containing the transaction hash if available.
 */
async function executeSingleQuote(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
) {
  log('Executing single quote', quote);

  const { kind } = quote.steps[0];

  if (kind !== 'transaction') {
    throw new Error(`Unsupported step kind: ${kind as string}`);
  }

  const transactionParams = quote.steps[0].items[0].data;
  const chainId = toHex(transactionParams.chainId);
  const normalizedParams = normalizeParams(transactionParams);

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  log('Adding transaction', {
    chainId,
    normalizedParams,
    networkClientId,
  });

  if (quote.skipTransaction) {
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
  }

  const result = await messenger.call(
    'TransactionController:addTransaction',
    normalizedParams,
    {
      networkClientId,
      origin: ORIGIN_METAMASK,
      requireApproval: false,
    },
  );

  const { transactionMeta, result: transactionHashPromise } = result;

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Add required transaction ID',
    },
    (tx) => {
      if (!tx.requiredTransactionIds) {
        tx.requiredTransactionIds = [];
      }

      tx.requiredTransactionIds.push(transactionMeta.id);
    },
  );

  log('Added transaction', transactionMeta);

  const transactionHash = (await transactionHashPromise) as Hex;

  log('Submitted transaction', transactionHash);

  await waitForTransactionConfirmed(transactionMeta.id, messenger);

  log('Transaction confirmed', transactionMeta.id);

  await waitForRelayCompletion(quote);

  log('Relay request completed');

  if (quote.skipTransaction) {
    log('Updating intent complete flag on transaction', transaction.id);

    updateTransaction(
      {
        transactionId: transaction.id,
        messenger,
        note: 'Intent complete after Relay completion',
      },
      (tx) => {
        tx.isIntentComplete = true;
      },
    );
  }

  return { transactionHash };
}

/**
 * Wait for a Relay request to complete.
 *
 * @param quote - Relay quote associated with the request.
 * @returns A promise that resolves when the Relay request is complete.
 */
async function waitForRelayCompletion(quote: RelayQuote) {
  const { endpoint, method } = quote.steps[0].items[0].check;
  const url = `${RELAY_URL_BASE}${endpoint}`;

  while (true) {
    const response = await successfulFetch(url, { method });
    const status = (await response.json()) as RelayStatus;

    log('Polled status', status.status, status);

    if (status.status === 'success') {
      return;
    }

    if (['failure', 'refund'].includes(status.status)) {
      throw new Error(`Relay request failed with status: ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Normalize the parameters from a relay quote step to match TransactionParams.
 *
 * @param params - Parameters from a relay quote step.
 * @returns Normalized transaction parameters.
 */
function normalizeParams(
  params: RelayQuote['steps'][0]['items'][0]['data'],
): TransactionParams {
  return {
    data: params.data,
    from: params.from,
    gas: toHex(params.gas),
    maxFeePerGas: toHex(params.maxFeePerGas),
    maxPriorityFeePerGas: toHex(params.maxPriorityFeePerGas),
    to: params.to,
    value: toHex(params.value ?? '0'),
  };
}
