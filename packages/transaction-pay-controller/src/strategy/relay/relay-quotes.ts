import { successfulFetch, toHex } from '@metamask/controller-utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  RELAY_URL_QUOTE,
} from './constants';
import type { RelayQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';

const log = createModuleLogger(projectLogger, 'relay-strategy');

/**
 * Fetches Relay quotes.
 *
 * @param request - Request object.
 * @returns Array of quotes.
 */
export async function getRelayQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>[]> {
  const { requests } = request;

  log('Fetching quotes', requests);

  const result = requests.map((r) => normalizeRequest(r));

  const normalizedRequests = result.map((r) => r.request);
  const isSkipTransaction = result.some((r) => r.isSkipTransaction);

  log('Normalized requests', { normalizedRequests, isSkipTransaction });

  return await Promise.all(
    normalizedRequests.map((r) => getSingleQuote(r, isSkipTransaction)),
  );
}

/**
 * Fetches a single Relay quote.
 *
 * @param request  - Quote request.
 * @param isSkipTransaction - Whether to skip the transaction.
 * @returns  Single quote.
 */
async function getSingleQuote(
  request: QuoteRequest,
  isSkipTransaction: boolean,
): Promise<TransactionPayQuote<RelayQuote>> {
  try {
    const body = {
      amount: request.targetAmountMinimum,
      destinationChainId: Number(request.targetChainId),
      destinationCurrency: request.targetTokenAddress,
      originChainId: Number(request.sourceChainId),
      originCurrency: request.sourceTokenAddress,
      recipient: request.from,
      tradeType: 'EXPECTED_OUTPUT',
      user: request.from,
    };

    const response = await successfulFetch(RELAY_URL_QUOTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const quote = (await response.json()) as RelayQuote;
    quote.skipTransaction = isSkipTransaction;

    log('Fetched relay quote', quote);

    return normalizeQuote(quote, request);
  } catch (e) {
    log('Error fetching relay quote', e);
    throw e;
  }
}

/**
 * Normalizes requests for Relay.
 *
 * @param request - Quote request to normalize.
 * @returns Normalized request.
 */
function normalizeRequest(request: QuoteRequest) {
  const isHyperliquidDeposit =
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase();

  const requestOutput = {
    ...request,
    targetChainId: isHyperliquidDeposit ? toHex(1337) : request.targetChainId,
    targetTokenAddress: isHyperliquidDeposit
      ? '0x00000000000000000000000000000000'
      : request.targetTokenAddress,
    targetAmountMinimum: isHyperliquidDeposit
      ? new BigNumber(request.targetAmountMinimum).shiftedBy(2).toString(10)
      : request.targetAmountMinimum,
  };

  return {
    request: requestOutput,
    isSkipTransaction: isHyperliquidDeposit,
  };
}

/**
 * Normalizes a Relay quote into a TransactionPayQuote.
 *
 * @param quote - Relay quote.
 * @param request - Original quote request.
 * @returns Normalized quote.
 */
function normalizeQuote(
  quote: RelayQuote,
  request: QuoteRequest,
): TransactionPayQuote<RelayQuote> {
  const feeUsd = new BigNumber(quote.details?.currencyIn?.amountUsd ?? '0')
    .minus(quote?.details?.currencyOut?.amountUsd ?? '0')
    .toString(10);

  const sourceNetworkFeeUsd = new BigNumber(
    quote.fees?.gas?.amountUsd ?? '0',
  ).toString(10);

  return {
    dust: {
      usd: '0',
      fiat: '0',
    },
    estimatedDuration: quote.details?.timeEstimate ?? 0,
    fees: {
      provider: {
        usd: feeUsd,
        fiat: feeUsd,
      },
      sourceNetwork: {
        usd: sourceNetworkFeeUsd,
        fiat: sourceNetworkFeeUsd,
      },
      targetNetwork: { usd: '0', fiat: '0' },
    },
    original: quote,
    request,
  };
}
