import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { RELAY_POLLING_INTERVAL, RELAY_STATUS_URL } from './constants';
import type { RelayQuote, RelayStatusResponse } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFeatureFlags } from '../../utils/feature-flags';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

const FALLBACK_HASH = '0x0' as Hex;

const log = createModuleLogger(projectLogger, 'relay-strategy');

type SubmitContext = {
  from: Hex;
  gasFeeToken: Hex | undefined;
  gasLimits: number[];
  networkClientId: string;
  normalizedParams: TransactionParams[];
  sourceChainId: Hex;
  sourceTokenAddress: Hex;
};

/**
 * Extract and validate relay params from a quote.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @returns Submit context with normalized params and metadata.
 */
function getSubmitContext(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
): SubmitContext {
  const { steps } = quote.original;
  const params = steps.flatMap((step) => step.items).map((item) => item.data);
  const invalidKind = steps.find((step) => step.kind !== 'transaction')?.kind;

  if (invalidKind) {
    throw new Error(`Unsupported step kind: ${invalidKind}`);
  }

  const normalizedParams = params.map((singleParams) =>
    normalizeParams(singleParams, messenger),
  );

  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const { gasLimits } = quote.original.metamask;

  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    sourceChainId,
  );

  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  return {
    from,
    gasFeeToken,
    gasLimits,
    networkClientId,
    normalizedParams,
    sourceChainId,
    sourceTokenAddress,
  };
}

/**
 * Setup transaction ID collection with parent transaction updates.
 *
 * @param options - Options object.
 * @param options.sourceChainId - Source chain ID.
 * @param options.from - From address.
 * @param options.messenger - Controller messenger.
 * @param options.parentTransactionId - Parent transaction ID to update.
 * @param options.note - Note for the transaction update.
 * @returns Object with transactionIds array and end function.
 */
function setupTransactionCollection({
  sourceChainId,
  from,
  messenger,
  parentTransactionId,
  note,
}: {
  sourceChainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  parentTransactionId: string;
  note: string;
}): { transactionIds: string[]; end: () => void } {
  const transactionIds: string[] = [];

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
          note,
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(transactionId);
        },
      );
    },
  );

  return { transactionIds, end };
}

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
): Promise<{ transactionHash?: Hex }> {
  log('Executing single quote', quote);

  const isPostQuote = quote.request.isPostQuote;

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

  // For post-quote flows, create an atomic batch with:
  // 1. Original transaction
  // 2. Relay deposit transaction
  if (isPostQuote) {
    await submitPostQuoteTransactions(quote, transaction, messenger);
  } else {
    await submitTransactions(quote, transaction.id, messenger);
  }

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
 * Submit transactions for a post-quote flow.
 * Creates an atomic 7702 batch containing:
 * 1. Original transaction
 * 2. Relay deposit transaction
 *
 * @param quote - Relay quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 */
async function submitPostQuoteTransactions(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const {
    from,
    gasFeeToken,
    gasLimits,
    networkClientId,
    normalizedParams,
    sourceChainId,
  } = getSubmitContext(quote, messenger);

  const { txParams, type: originalType } = transaction;

  const { transactionIds, end } = setupTransactionCollection({
    sourceChainId,
    from,
    messenger,
    parentTransactionId: transaction.id,
    note: 'Add required transaction ID from post-quote batch',
  });

  // Build the batch transactions:
  // 1. Original transaction (e.g., Safe execTransaction call)
  // 2. Relay deposit transaction(s)
  const batchTransactions = buildPostQuoteBatchTransactions({
    txParams,
    originalType,
    normalizedParams,
    gasLimits,
  });

  await messenger.call('TransactionController:addTransactionBatch', {
    from,
    gasFeeToken,
    networkClientId,
    origin: ORIGIN_METAMASK,
    overwriteUpgrade: true,
    requireApproval: false,
    transactions: batchTransactions,
  });

  end();

  // Mark original transaction as handled by nested batch
  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Mark as dummy - handled by post-quote batch',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  if (transactionIds.length > 0) {
    await Promise.all(
      transactionIds.map((txId) =>
        waitForTransactionConfirmed(txId, messenger),
      ),
    );
  }
}

/**
 * Build batch transactions for post-quote flow.
 *
 * @param options - Options object.
 * @param options.txParams - Original transaction params.
 * @param options.originalType - Original transaction type.
 * @param options.normalizedParams - Normalized relay params.
 * @param options.gasLimits - Gas limits for each transaction.
 * @returns Array of batch transactions.
 */
function buildPostQuoteBatchTransactions({
  txParams,
  originalType,
  normalizedParams,
  gasLimits,
}: {
  txParams: TransactionMeta['txParams'];
  originalType: TransactionMeta['type'];
  normalizedParams: TransactionParams[];
  gasLimits: number[];
}): {
  params: {
    data?: Hex;
    gas?: Hex;
    maxFeePerGas?: Hex;
    maxPriorityFeePerGas?: Hex;
    to: Hex;
    value?: Hex;
  };
  type?: TransactionType;
}[] {
  const batchTransactions: {
    params: {
      data?: Hex;
      gas?: Hex;
      maxFeePerGas?: Hex;
      maxPriorityFeePerGas?: Hex;
      to: Hex;
      value?: Hex;
    };
    type?: TransactionType;
  }[] = [];

  // Add original transaction (e.g., Safe execTransaction call)
  // Note: We use txParams (the outer call) not nestedTransactions (internal calls)
  // because nestedTransactions are executed BY the Safe, not by the user's EOA
  if (txParams.to) {
    batchTransactions.push({
      params: {
        data: txParams.data as Hex | undefined,
        to: txParams.to as Hex,
        value: txParams.value as Hex | undefined,
      },
      type: originalType,
    });
  }

  // Add relay deposit transaction(s)
  for (let i = 0; i < normalizedParams.length; i++) {
    const relayParams = normalizedParams[i];
    batchTransactions.push({
      params: {
        data: relayParams.data as Hex,
        gas: gasLimits[i] ? toHex(gasLimits[i]) : undefined,
        maxFeePerGas: relayParams.maxFeePerGas as Hex,
        maxPriorityFeePerGas: relayParams.maxPriorityFeePerGas as Hex,
        to: relayParams.to as Hex,
        value: relayParams.value as Hex,
      },
      type: TransactionType.relayDeposit,
    });
  }

  return batchTransactions;
}

/**
 * Wait for a Relay request to complete.
 *
 * @param quote - Relay quote associated with the request.
 * @returns A promise that resolves when the Relay request is complete.
 */
async function waitForRelayCompletion(quote: RelayQuote): Promise<Hex> {
  const isSameChain =
    quote.details.currencyIn.currency.chainId ===
    quote.details.currencyOut.currency.chainId;

  const isSingleDepositStep =
    quote.steps.length === 1 && quote.steps[0].id === 'deposit';

  if (isSameChain && !isSingleDepositStep) {
    log('Skipping polling as same chain');
    return FALLBACK_HASH;
  }

  const { requestId } = quote.steps[0];
  const url = `${RELAY_STATUS_URL}?requestId=${requestId}`;

  while (true) {
    const response = await successfulFetch(url, { method: 'GET' });
    const status = (await response.json()) as RelayStatusResponse;

    log('Polled status', status.status, status);

    if (status.status === 'success') {
      const targetHash = status.txHashes?.slice(-1)[0] as Hex;
      return targetHash ?? FALLBACK_HASH;
    }

    if (['failure', 'refund', 'refunded'].includes(status.status)) {
      throw new Error(`Relay request failed with status: ${status.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, RELAY_POLLING_INTERVAL));
  }
}

/**
 * Normalize the parameters from a relay quote step to match TransactionParams.
 *
 * @param params - Parameters from a relay quote step.
 * @param messenger - Controller messenger.
 * @returns Normalized transaction parameters.
 */
function normalizeParams(
  params: RelayQuote['steps'][0]['items'][0]['data'],
  messenger: TransactionPayControllerMessenger,
): TransactionParams {
  const featureFlags = getFeatureFlags(messenger);

  return {
    data: params.data,
    from: params.from,
    gas: toHex(params.gas ?? featureFlags.relayFallbackGas.max),
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
  const {
    from,
    gasFeeToken,
    gasLimits,
    networkClientId,
    normalizedParams,
    sourceChainId,
  } = getSubmitContext(quote, messenger);

  log('Adding transactions', {
    normalizedParams,
    sourceChainId,
    from,
    networkClientId,
  });

  const { transactionIds, end } = setupTransactionCollection({
    sourceChainId,
    from,
    messenger,
    parentTransactionId,
    note: 'Add required transaction ID from Relay submission',
  });

  let result: { result: Promise<string> } | undefined;

  const isSameChain =
    quote.original.details.currencyIn.currency.chainId ===
    quote.original.details.currencyOut.currency.chainId;

  const authorizationList: AuthorizationList | undefined =
    isSameChain && quote.original.request.authorizationList?.length
      ? quote.original.request.authorizationList.map((a) => ({
          address: a.address,
          chainId: toHex(a.chainId),
        }))
      : undefined;

  if (normalizedParams.length === 1) {
    const transactionParams = {
      ...normalizedParams[0],
      authorizationList,
      gas: toHex(gasLimits[0]),
    };

    result = await messenger.call(
      'TransactionController:addTransaction',
      transactionParams,
      {
        gasFeeToken,
        networkClientId,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
        type: TransactionType.relayDeposit,
      },
    );
  } else {
    const gasLimit7702 =
      gasLimits.length === 1 ? toHex(gasLimits[0]) : undefined;

    const transactions = normalizedParams.map((singleParams, index) => ({
      params: {
        data: singleParams.data as Hex,
        gas: gasLimit7702 ? undefined : toHex(gasLimits[index]),
        maxFeePerGas: singleParams.maxFeePerGas as Hex,
        maxPriorityFeePerGas: singleParams.maxPriorityFeePerGas as Hex,
        to: singleParams.to as Hex,
        value: singleParams.value as Hex,
      },
      type:
        index === 0
          ? TransactionType.tokenMethodApprove
          : TransactionType.relayDeposit,
    }));

    await messenger.call('TransactionController:addTransactionBatch', {
      from,
      disable7702: !gasLimit7702,
      disableHook: Boolean(gasLimit7702),
      disableSequential: Boolean(gasLimit7702),
      gasFeeToken,
      gasLimit7702,
      networkClientId,
      origin: ORIGIN_METAMASK,
      overwriteUpgrade: true,
      requireApproval: false,
      transactions,
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
