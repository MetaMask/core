import { Interface } from '@ethersproject/abi';
import { successfulFetch } from '@metamask/controller-utils';
import type { Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  CHAIN_ID_HYPERCORE,
  RELAY_FALLBACK_GAS_LIMIT,
  RELAY_URL_QUOTE,
} from './constants';
import type { RelayQuote } from './types';
import { TransactionPayStrategy } from '../..';
import type { TransactionMeta } from '../../../../transaction-controller/src';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatValue,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { calculateGasCost } from '../../utils/gas';
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
    const normalizedRequests = requests
      // Ignore gas fee token requests
      .filter((r) => r.targetAmountMinimum !== '0')
      .map((r) => normalizeRequest(r));

    log('Normalized requests', normalizedRequests);

    return await Promise.all(
      normalizedRequests.map((r) => getSingleQuote(r, request)),
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
 * @param fullRequest - Full quotes request.
 * @returns  Single quote.
 */
async function getSingleQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger, transaction } = fullRequest;

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

    await processTransactions(transaction, request, body, messenger);

    const url = getFeatureFlags(messenger).relayQuoteUrl;

    log('Request body', { body, url });

    const response = await successfulFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const quote = (await response.json()) as RelayQuote;

    log('Fetched relay quote', quote);

    return normalizeQuote(quote, request, fullRequest);
  } catch (e) {
    log('Error fetching relay quote', e);
    throw e;
  }
}

/**
 * Add tranasction data to request body if needed.
 *
 * @param transaction - Transaction metadata.
 * @param request - Quote request.
 * @param requestBody  - Request body to populate.
 * @param messenger  - Controller messenger.
 */
async function processTransactions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: Record<string, Json | undefined>,
  messenger: TransactionPayControllerMessenger,
) {
  const { data, value } = transaction.txParams;

  /* istanbul ignore next */
  const hasNoParams = (!data || data === '0x') && (!value || value === '0x0');

  const skipDelegation =
    hasNoParams || request.targetChainId === CHAIN_ID_HYPERCORE;

  if (skipDelegation) {
    log('Skipping delegation as no transaction data');
    return;
  }

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  const normalizedAuthorizationList = delegation.authorizationList?.map(
    (a) => ({
      ...a,
      chainId: Number(a.chainId),
      nonce: Number(a.nonce),
      yParity: Number(a.yParity),
    }),
  );

  const tokenTransferData = new Interface([
    'function transfer(address to, uint256 amount)',
  ]).encodeFunctionData('transfer', [
    request.from,
    request.targetAmountMinimum,
  ]);

  requestBody.authorizationList = normalizedAuthorizationList;
  requestBody.tradeType = 'EXACT_OUTPUT';

  requestBody.txs = [
    {
      to: request.targetTokenAddress,
      data: tokenTransferData,
      value: '0x0',
    },
    {
      to: delegation.to,
      data: delegation.data,
      value: delegation.value,
    },
  ];
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
    targetChainId: isHyperliquidDeposit
      ? CHAIN_ID_HYPERCORE
      : request.targetChainId,
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

  return requestOutput;
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
  const { messenger } = fullRequest;
  const { details } = quote;
  const { currencyIn } = details;

  const { usdToFiatRate } = getFiatRates(messenger, request);

  const dust = getFiatValueFromUsd(
    calculateDustUsd(quote, request),
    usdToFiatRate,
  );

  const provider = getFiatValueFromUsd(
    calculateProviderFee(quote),
    usdToFiatRate,
  );

  const sourceNetwork = calculateSourceNetworkCost(quote, messenger);

  const targetNetwork = {
    usd: '0',
    fiat: '0',
  };

  const sourceAmount: Amount = {
    human: currencyIn.amountFormatted,
    raw: currencyIn.amount,
    ...getFiatValueFromUsd(new BigNumber(currencyIn.amountUsd), usdToFiatRate),
  };

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
    sourceAmount,
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
): TransactionPayQuote<RelayQuote>['fees']['sourceNetwork'] {
  const allParams = quote.steps[0].items.map((i) => i.data);
  const { chainId } = allParams[0];
  const totalGasLimit = calculateSourceNetworkGasLimit(allParams);

  const estimate = calculateGasCost({
    chainId,
    gas: totalGasLimit,
    messenger,
  });

  const max = calculateGasCost({
    chainId,
    gas: totalGasLimit,
    messenger,
    isMax: true,
  });

  return { estimate, max };
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

/**
 * Calculate the provider fee for a Relay quote.
 *
 * @param quote - Relay quote.
 * @returns - Provider fee in USD.
 */
function calculateProviderFee(quote: RelayQuote) {
  const relayerFee = new BigNumber(quote.fees.relayer.amountUsd);

  const valueLoss = new BigNumber(quote.details.currencyIn.amountUsd).minus(
    quote.details.currencyOut.amountUsd,
  );

  return relayerFee.gt(valueLoss) ? relayerFee : valueLoss;
}
