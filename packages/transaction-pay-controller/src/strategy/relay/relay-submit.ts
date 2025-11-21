import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import {
  TransactionType,
  type TransactionParams,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import {
  RELAY_FALLBACK_GAS_LIMIT,
  RELAY_POLLING_INTERVAL,
  RELAY_URL_BASE,
} from './constants';
import type { RelayQuote, RelayStatus } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const FALLBACK_HASH = '0x0' as Hex;

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
      quote,
      messenger,
      transaction,
    ));
  }

  return { transactionHash };
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
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
) {
  log('Executing single quote', quote);

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

  await submitTransactions(quote, transaction.id, messenger);

  const targetHash = await waitForRelayCompletion(quote.original);

  log('Relay request completed', targetHash);

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

  return { transactionHash: targetHash };
}

/**
 * Wait for a Relay request to complete.
 *
 * @param quote - Relay quote associated with the request.
 * @returns A promise that resolves when the Relay request is complete.
 */
async function waitForRelayCompletion(quote: RelayQuote): Promise<Hex> {
  if (
    quote.details.currencyIn.currency.chainId ===
    quote.details.currencyOut.currency.chainId
  ) {
    log('Skipping polling as same chain');
    return FALLBACK_HASH;
  }

  const { endpoint, method } = quote.steps
    .slice(-1)[0]
    .items.slice(-1)[0].check;

  const url = `${RELAY_URL_BASE}${endpoint}`;

  while (true) {
    const response = await successfulFetch(url, { method });
    const status = (await response.json()) as RelayStatus;

    log('Polled status', status.status, status);

    if (status.status === 'success') {
      const targetHash = status.txHashes?.slice(-1)[0] as Hex;
      return targetHash ?? FALLBACK_HASH;
    }

    if (['failure', 'refund', 'fallback'].includes(status.status)) {
      throw new Error(`Relay request failed with status: ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, RELAY_POLLING_INTERVAL));
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
    gas: toHex(params.gas ?? RELAY_FALLBACK_GAS_LIMIT),
    maxFeePerGas: toHex(params.maxFeePerGas),
    maxPriorityFeePerGas: toHex(params.maxPriorityFeePerGas),
    to: params.to,
    value: toHex(params.value ?? '0'),
  };
}

/**
 * Submit transactions for a relay quote.
 *
 * @param quote - Relay quote.
 * @param parentTransactionId - ID of the parent transaction.
 * @param messenger - Controller messenger.
 * @returns Hash of the last submitted transaction.
 */
async function submitTransactions(
  quote: TransactionPayQuote<RelayQuote>,
  parentTransactionId: string,
  messenger: TransactionPayControllerMessenger,
): Promise<Hex> {
  const { steps } = quote.original;
  const params = steps.flatMap((s) => s.items).map((i) => i.data);
  const invalidKind = steps.find((s) => s.kind !== 'transaction')?.kind;

  if (invalidKind) {
    throw new Error(`Unsupported step kind: ${invalidKind}`);
  }

  const normalizedParams = params.map(normalizeParams);

  const transactionIds: string[] = [];
  const { from, sourceChainId, sourceTokenAddress } = quote.request;

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  log('Adding transactions', {
    normalizedParams,
    sourceChainId,
    from,
    networkClientId,
  });

  const { end } = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);

      updateTransaction(
        {
          transactionId: parentTransactionId,
          messenger,
          note: 'Add required transaction ID from Relay submission',
        },
        (tx) => {
          if (!tx.requiredTransactionIds) {
            tx.requiredTransactionIds = [];
          }

          tx.requiredTransactionIds.push(transactionId);
        },
      );
    },
  );

  let result: { result: Promise<string> } | undefined;

  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  if (params.length === 1) {
    result = await messenger.call(
      'TransactionController:addTransaction',
      normalizedParams[0],
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
      requireApproval: false,
      transactions: normalizedParams.map((p, i) => ({
        params: {
          data: p.data as Hex,
          gas: p.gas as Hex,
          to: p.to as Hex,
          value: p.value as Hex,
        },
        type: i === 0 ? TransactionType.tokenMethodApprove : undefined,
      })),
    });
  }

  end();

  log('Added transactions', transactionIds);

  if (result) {
    const txHash = await result.result;
    log('Submitted transaction', txHash);
  }

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('All transactions confirmed', transactionIds);

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  return hash as Hex;
}
