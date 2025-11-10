import { successfulFetch, toHex } from '@metamask/controller-utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_POLYGON,
  RELAY_FALLBACK_GAS_LIMIT,
  RELAY_URL_QUOTE,
} from './constants';
import type { RelayQuote } from './types';
import { TransactionPayStrategy } from '../..';
import { NATIVE_TOKEN_ADDRESS } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  FiatValue,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { calculateGasCost, calculateTransactionGasCost } from '../../utils/gas';
import { getNativeToken, getTokenFiatRate } from '../../utils/token';

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

  try {
    const result = requests
      // Ignore gas fee token requests
      .filter((r) => r.targetAmountMinimum !== '0')
      .map((r) => normalizeRequest(r));

    const normalizedRequests = result.map((r) => r.request);
    const isSkipTransaction = result.some((r) => r.isSkipTransaction);

    log('Normalized requests', { normalizedRequests, isSkipTransaction });

    return await Promise.all(
      normalizedRequests.map((r) =>
        getSingleQuote(r, isSkipTransaction, request),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch Relay quotes: ${String(error)}`);
  }
}

/**
 * Fetches a single Relay quote.
 *
 * @param request  - Quote request.
 * @param isSkipTransaction - Whether to skip the transaction.
 * @param fullRequest - Full quotes request.
 * @returns  Single quote.
 */
async function getSingleQuote(
  request: QuoteRequest,
  isSkipTransaction: boolean,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger } = fullRequest;

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

    const url = getFeatureFlags(messenger).relayQuoteUrl;

    const response = await successfulFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const quote = (await response.json()) as RelayQuote;
    quote.skipTransaction = isSkipTransaction;

    log('Fetched relay quote', { quote, url });

    return normalizeQuote(quote, request, fullRequest);
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

  const isPolygonNativeSource =
    request.sourceChainId === CHAIN_ID_POLYGON &&
    request.sourceTokenAddress === getNativeToken(request.sourceChainId);

  const requestOutput: QuoteRequest = {
    ...request,
    sourceTokenAddress: isPolygonNativeSource
      ? NATIVE_TOKEN_ADDRESS
      : request.sourceTokenAddress,
    targetChainId: isHyperliquidDeposit ? toHex(1337) : request.targetChainId,
    targetTokenAddress: isHyperliquidDeposit
      ? '0x00000000000000000000000000000000'
      : request.targetTokenAddress,
    targetAmountMinimum: isHyperliquidDeposit
      ? new BigNumber(request.targetAmountMinimum).shiftedBy(2).toString(10)
      : request.targetAmountMinimum,
  };

  if (isHyperliquidDeposit) {
    log('Converting Arbitrum Hyperliquid deposit to direct deposit', {
      originalRequest: request,
      normalizedRequest: requestOutput,
    });
  }

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
 * @param fullRequest - Full quotes request.
 * @returns Normalized quote.
 */
function normalizeQuote(
  quote: RelayQuote,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): TransactionPayQuote<RelayQuote> {
  const { messenger, transaction } = fullRequest;
  const { details, fees } = quote;

  const { usdToFiatRate } = getFiatRates(messenger, request);

  const dust = getFiatValueFromUsd(
    calculateDustUsd(quote, request),
    usdToFiatRate,
  );

  const provider = getFiatValueFromUsd(
    new BigNumber(fees.relayer.amountUsd),
    usdToFiatRate,
  );

  const sourceNetwork = calculateSourceNetworkCost(quote, messenger);

  const targetNetwork = quote.skipTransaction
    ? {
        usd: '0',
        fiat: '0',
      }
    : calculateTransactionGasCost(transaction, messenger);

  return {
    dust,
    estimatedDuration: details.timeEstimate,
    fees: {
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: quote,
    request,
    strategy: TransactionPayStrategy.Relay,
  };
}

/**
 * Calculate dust USD value.
 *
 * @param quote - Relay quote.
 * @param request - Quote request.
 * @returns Dust value in USD and fiat.
 */
function calculateDustUsd(quote: RelayQuote, request: QuoteRequest) {
  const { currencyOut } = quote.details;
  const { amountUsd, amountFormatted, minimumAmount } = currencyOut;
  const { decimals: targetDecimals } = currencyOut.currency;

  const targetUsdRate = new BigNumber(amountUsd).dividedBy(amountFormatted);

  const dustRaw = new BigNumber(minimumAmount).minus(
    request.targetAmountMinimum,
  );

  return dustRaw.shiftedBy(-targetDecimals).multipliedBy(targetUsdRate);
}

/**
 * Converts USD value to fiat value.
 *
 * @param usdValue - USD value.
 * @param usdToFiatRate - USD to fiat rate.
 * @returns Fiat value.
 */
function getFiatValueFromUsd(
  usdValue: BigNumber,
  usdToFiatRate: BigNumber,
): FiatValue {
  const fiatValue = usdValue.multipliedBy(usdToFiatRate);

  return {
    usd: usdValue.toString(10),
    fiat: fiatValue.toString(10),
  };
}

/**
 * Calculates USD to fiat rate.
 *
 * @param messenger - Controller messenger.
 * @param request - Quote request.
 * @returns USD to fiat rate.
 */
function getFiatRates(
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
) {
  const { sourceChainId, sourceTokenAddress } = request;

  const finalSourceTokenAddress =
    sourceChainId === CHAIN_ID_POLYGON &&
    sourceTokenAddress === NATIVE_TOKEN_ADDRESS
      ? getNativeToken(sourceChainId)
      : sourceTokenAddress;

  const sourceFiatRate = getTokenFiatRate(
    messenger,
    finalSourceTokenAddress,
    sourceChainId,
  );

  if (!sourceFiatRate) {
    throw new Error('Source token fiat rate not found');
  }

  const usdToFiatRate = new BigNumber(sourceFiatRate.fiatRate).dividedBy(
    sourceFiatRate.usdRate,
  );

  return { sourceFiatRate, usdToFiatRate };
}

/**
 * Gets feature flags for Relay quotes.
 *
 * @param messenger - Controller messenger.
 * @returns Feature flags.
 */
function getFeatureFlags(messenger: TransactionPayControllerMessenger) {
  const featureFlagState = messenger.call(
    'RemoteFeatureFlagController:getState',
  );

  const featureFlags = featureFlagState.remoteFeatureFlags
    ?.confirmations_pay as Record<string, string> | undefined;

  const relayQuoteUrl = featureFlags?.relayQuoteUrl ?? RELAY_URL_QUOTE;

  return {
    relayQuoteUrl,
  };
}

/**
 * Calculates source network cost from a Relay quote.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @returns Total source network cost in USD and fiat.
 */
function calculateSourceNetworkCost(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
) {
  const allParams = quote.steps[0].items.map((i) => i.data);
  const totalGasLimit = calculateSourceNetworkGasLimit(allParams);

  return calculateGasCost({
    chainId: allParams[0].chainId,
    gas: totalGasLimit,
    messenger,
  });
}

/**
 * Calculate the total gas limit for the source network transactions.
 *
 * @param params - Array of transaction parameters.
 * @returns - Total gas limit.
 */
function calculateSourceNetworkGasLimit(
  params: RelayQuote['steps'][0]['items'][0]['data'][],
): number {
  const allParamsHasGas = params.every((p) => p.gas !== undefined);

  if (allParamsHasGas) {
    return params.reduce(
      (total, p) => total + new BigNumber(p.gas as string).toNumber(),
      0,
    );
  }

  // In future, call `TransactionController:estimateGas`
  // or `TransactionController:estimateGasBatch` based on params length.

  return params.reduce(
    (total, p) =>
      total + new BigNumber(p.gas ?? RELAY_FALLBACK_GAS_LIMIT).toNumber(),
    0,
  );
}
