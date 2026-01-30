import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import type { AuthorizationList } from '@metamask/transaction-controller';
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
  SourceTransaction,
  submitSourceTransactions,
} from '../../utils/strategy-helpers';
import { updateTransaction } from '../../utils/transaction';

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

  const { quotes } = request;

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleQuote(quote, request));
  }

  return { transactionHash };
}

/**
 * Executes a single Relay quote.
 *
 * @param quote - Relay quote to execute.
 * @param request - Original request.
 * @returns An object containing the transaction hash if available.
 */
async function executeSingleQuote(
  quote: TransactionPayQuote<RelayQuote>,
  request: PayStrategyExecuteRequest<RelayQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing single quote', quote);

  await submitSourceTransactions({
    request: {
      ...request,
      quotes: [quote],
    },
    requiredTransactionNote:
      'Add required transaction ID from Relay submission',
    markIntentComplete: false,
    buildTransactions: async (singleQuote) =>
      buildTransactions(singleQuote, request.messenger),
  });

  const targetHash = await waitForRelayCompletion(quote.original);

  log('Relay request completed', targetHash);

  updateTransaction(
    {
      transactionId: request.transaction.id,
      messenger: request.messenger,
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
 * Build transactions for a relay quote.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @returns Prepared transactions and submission callback.
 */
async function buildTransactions(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
): Promise<{
  chainId: Hex;
  from: Hex;
  transactions: SourceTransaction[];
  submit: (transactions: SourceTransaction[]) => Promise<void>;
}> {
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
  const chainId = sourceChainId;

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

  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  const { gasLimits } = quote.original.metamask;

  const transactions: SourceTransaction[] = normalizedParams.map(
    (singleParams, index) => ({
      params: singleParams,
      type:
        params.length === 1 || index > 0
          ? TransactionType.relayDeposit
          : TransactionType.tokenMethodApprove,
    }),
  );

  return {
    chainId,
    from,
    transactions,
    submit: async (preparedTransactions): Promise<void> => {
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

      if (preparedTransactions.length === 1) {
        const transactionParams = {
          ...preparedTransactions[0].params,
          authorizationList,
          gas: toHex(gasLimits[0]),
        };

        const result = await messenger.call(
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

        const txHash = await result.result;
        log('Submitted transaction', txHash);
        return;
      }

      const gasLimit7702 =
        gasLimits.length === 1 ? toHex(gasLimits[0]) : undefined;

      const batchTransactions = preparedTransactions.map(
        (singleParams, index) => ({
          params: {
            data: singleParams.params.data as Hex,
            gas: gasLimit7702 ? undefined : toHex(gasLimits[index]),
            maxFeePerGas: singleParams.params.maxFeePerGas as Hex,
            maxPriorityFeePerGas: singleParams.params
              .maxPriorityFeePerGas as Hex,
            to: singleParams.params.to as Hex,
            value: singleParams.params.value as Hex,
          },
          type:
            index === 0
              ? TransactionType.tokenMethodApprove
              : TransactionType.relayDeposit,
        }),
      );

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
        transactions: batchTransactions,
      });
    },
  };
}
