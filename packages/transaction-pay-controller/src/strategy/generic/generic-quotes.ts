import { Interface } from '@ethersproject/abi';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_HYPERCORE, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getGenericProviderPriority,
  getSlippage,
} from '../../utils/feature-flags';
import { fetchGenericQuote } from './generic-api';
import type {
  GenericQuote,
  GenericQuoteRequest,
  GenericQuoteResult,
} from './types';
import { GenericTradeType } from './types';

const log = createModuleLogger(projectLogger, 'generic-quotes');
const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';
const TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);
const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };
const ZERO_FIAT_VALUE = { fiat: '0', usd: '0' };

type FulfilledGenericQuoteResult = GenericQuoteResult & {
  id: string;
  input: NonNullable<GenericQuoteResult['input']>;
  output: NonNullable<GenericQuoteResult['output']>;
  status: 'fulfilled';
};

/**
 * Fetch generic intents-api quotes and normalize them into Transaction Pay quotes.
 *
 * @param request - Quote request context.
 * @returns Normalized generic strategy quotes.
 */
export async function getGenericQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<GenericQuote>[]> {
  const providerPriority = getGenericProviderPriority(request.messenger);
  const quoteRequests = request.requests.filter(shouldRequestQuote);

  log('Fetching quotes', { providerPriority, quoteRequests });

  const quotes = await Promise.all(
    quoteRequests.map((quoteRequest) => getQuotesForRequest(quoteRequest, request)),
  );

  return quotes.flat();
}

async function getQuotesForRequest(
  quoteRequest: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<GenericQuote>[]> {
  const { messenger, signal } = fullRequest;
  const providerPriority = getGenericProviderPriority(messenger);

  for (const provider of providerPriority) {
    const body = await buildGenericQuoteRequest(
      quoteRequest,
      fullRequest.transaction,
      messenger,
      provider,
    );

    try {
      log('Request body', body);

      const response = await fetchGenericQuote(messenger, body, signal);
      const fulfilledResults = response.results.filter(isFulfilledResult);

      if (fulfilledResults.length > 0) {
        return fulfilledResults.map((result) =>
          normalizeQuote(result, quoteRequest),
        );
      }

      log('Provider returned no fulfilled quote results', {
        error: response.results.find((result) => result.status === 'rejected')
          ?.error,
        provider,
      });
    } catch (error) {
      log('Error fetching provider quote', { error, provider });
    }
  }

  return [];
}

async function buildGenericQuoteRequest(
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  provider: GenericQuoteRequest['provider'],
): Promise<GenericQuoteRequest> {
  const {
    from,
    isMaxAmount,
    isPostQuote,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = quoteRequest;

  const useExactInput = Boolean((isMaxAmount ?? false) || (isPostQuote ?? false));
  const singleData = getSingleTransactionData(transaction);
  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;
  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  let recipient = from;

  if (isTokenTransfer && singleData) {
    recipient = decodeTransferRecipient(singleData);
  }

  const body: GenericQuoteRequest = {
    amount: useExactInput ? sourceTokenAmount : targetAmountMinimum,
    destinationChainId: Number(targetChainId),
    destinationToken: targetTokenAddress,
    originChainId: Number(sourceChainId),
    originToken: sourceTokenAddress,
    provider,
    recipient,
    sender: from,
    slippageBps: Math.round(
      getSlippage(messenger, sourceChainId, sourceTokenAddress) * 10000,
    ),
    tradeType: useExactInput
      ? GenericTradeType.ExactInput
      : GenericTradeType.ExpectedOutput,
  };

  const hasNoData = singleData === undefined || singleData === '0x';
  const skipDelegation =
    hasNoData ||
    isTokenTransfer ||
    isHypercore ||
    (isPostQuote ?? false) ||
    (isMaxAmount ?? false);

  if (!skipDelegation) {
    const delegation = await messenger.call(
      'TransactionPayController:getDelegationTransaction',
      { transaction },
    );

    body.calls = [
      {
        data: buildTransferData(from, targetAmountMinimum),
        to: targetTokenAddress,
        value: '0x0',
      },
      {
        data: delegation.data,
        to: delegation.to,
        value: delegation.value,
      },
    ];

    if (delegation.authorizationList?.length) {
      body.authorizationList = delegation.authorizationList.map((entry) => ({
        address: entry.address,
        chainId: Number(entry.chainId),
        nonce: Number(entry.nonce),
        r: entry.r as Hex,
        s: entry.s as Hex,
        yParity: Number(entry.yParity),
      }));
    }
  }

  return body;
}

function shouldRequestQuote(quoteRequest: QuoteRequest): boolean {
  return (
    quoteRequest.targetAmountMinimum !== '0' ||
    Boolean(quoteRequest.isPostQuote) ||
    Boolean(quoteRequest.isMaxAmount)
  );
}

function normalizeQuote(
  result: FulfilledGenericQuoteResult,
  quoteRequest: QuoteRequest,
): TransactionPayQuote<GenericQuote> {
  return {
    dust: ZERO_FIAT_VALUE,
    estimatedDuration: result.duration ?? 0,
    fees: {
      metaMask: ZERO_FIAT_VALUE,
      provider: {
        fiat: '0',
        usd: result.providerFeeUsd ?? '0',
      },
      sourceNetwork: { estimate: ZERO_AMOUNT, max: ZERO_AMOUNT },
      targetNetwork: ZERO_FIAT_VALUE,
    },
    original: {
      duration: result.duration ?? 0,
      id: result.id,
      input: result.input,
      output: result.output,
      provider: result.provider,
      providerFeeUsd: result.providerFeeUsd,
      steps: result.steps ?? [],
    },
    request: quoteRequest,
    sourceAmount: {
      fiat: '0',
      human: result.input.formatted,
      raw: result.input.raw,
      usd: '0',
    },
    strategy: TransactionPayStrategy.Generic,
    targetAmount: {
      fiat: '0',
      usd: '0',
    },
  };
}

function getSingleTransactionData(transaction: TransactionMeta): Hex | undefined {
  return transaction.nestedTransactions?.length === 1
    ? transaction.nestedTransactions[0].data
    : (transaction.txParams?.data as Hex | undefined);
}

function isFulfilledResult(
  result: GenericQuoteResult,
): result is FulfilledGenericQuoteResult {
  return (
    result.status === 'fulfilled' &&
    result.id !== undefined &&
    result.input !== undefined &&
    result.output !== undefined
  );
}

function decodeTransferRecipient(data: Hex): Hex {
  return TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

function buildTransferData(recipient: Hex, amountRaw: string): Hex {
  return TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amountRaw,
  ]) as Hex;
}
