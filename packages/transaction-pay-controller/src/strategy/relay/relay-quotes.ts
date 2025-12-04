import { Interface } from '@ethersproject/abi';
import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { Hex, Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { CHAIN_ID_HYPERCORE, TOKEN_TRANSFER_FOUR_BYTE } from './constants';
import type { RelayQuote, RelayQuoteRequest } from './types';
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
import { getFeatureFlags } from '../../utils/feature-flags';
import { calculateGasCost, calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';

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
  const { slippage: slippageDecimal } = getFeatureFlags(messenger);
  const slippageTolerance = String(slippageDecimal * 100 * 100);

  try {
    const body: RelayQuoteRequest = {
      amount: request.targetAmountMinimum,
      destinationChainId: Number(request.targetChainId),
      destinationCurrency: request.targetTokenAddress,
      originChainId: Number(request.sourceChainId),
      originCurrency: request.sourceTokenAddress,
      recipient: request.from,
      slippageTolerance,
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
    quote.request = body;

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
  const { nestedTransactions, txParams } = transaction;
  const { data } = txParams;
  let newRecipient: Hex | undefined;

  const singleData =
    nestedTransactions?.length === 1 ? nestedTransactions[0].data : data;

  const isHypercore = request.targetChainId === CHAIN_ID_HYPERCORE;

  const isTokenTransfer =
    !isHypercore && singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE);

  if (isTokenTransfer) {
    newRecipient = new Interface([
      'function transfer(address to, uint256 amount)',
    ]).decodeFunctionData('transfer', singleData as Hex).to;

    log('Updating recipient as token transfer', newRecipient);

    requestBody.recipient = newRecipient?.toLowerCase();
  }

  const skipDelegation = isTokenTransfer || isHypercore;

  if (skipDelegation) {
    log('Skipping delegation as token transfer or Hypercore deposit');
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
  const newRequest = {
    ...request,
  };

  const isHyperliquidDeposit =
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase();

  const isPolygonNativeSource =
    request.sourceChainId === CHAIN_ID_POLYGON &&
    request.sourceTokenAddress === getNativeToken(request.sourceChainId);

  if (isPolygonNativeSource) {
    newRequest.sourceTokenAddress = NATIVE_TOKEN_ADDRESS;
  }

  if (isHyperliquidDeposit) {
    newRequest.targetChainId = CHAIN_ID_HYPERCORE;
    newRequest.targetTokenAddress = '0x00000000000000000000000000000000';
    newRequest.targetAmountMinimum = new BigNumber(request.targetAmountMinimum)
      .shiftedBy(2)
      .toString(10);

    log('Converting Arbitrum Hyperliquid deposit to direct deposit', {
      originalRequest: request,
      normalizedRequest: newRequest,
    });
  }

  return newRequest;
}

/**
 * Normalizes a Relay quote into a TransactionPayQuote.
 *
 * @param quote - Relay quote.
 * @param request - Original quote request.
 * @param fullRequest - Full quotes request.
 * @returns Normalized quote.
 */
async function normalizeQuote(
  quote: RelayQuote,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
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

  const { isGasFeeToken: isSourceGasFeeToken, ...sourceNetwork } =
    await calculateSourceNetworkCost(quote, messenger, request);

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
      isSourceGasFeeToken,
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
 * Calculates source network cost from a Relay quote.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @param request - Quote request.
 * @returns Total source network cost in USD and fiat.
 */
async function calculateSourceNetworkCost(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<
  TransactionPayQuote<RelayQuote>['fees']['sourceNetwork'] & {
    isGasFeeToken?: boolean;
  }
> {
  const { from, sourceChainId, sourceTokenAddress } = request;
  const allParams = quote.steps.flatMap((s) => s.items).map((i) => i.data);
  const { relayDisabledGasStationChains } = getFeatureFlags(messenger);

  const { chainId, data, maxFeePerGas, maxPriorityFeePerGas, to, value } =
    allParams[0];

  const totalGasLimitEstimate = calculateSourceNetworkGasLimit(
    allParams,
    messenger,
    {
      isMax: false,
    },
  );

  const totalGasLimitMax = calculateSourceNetworkGasLimit(
    allParams,
    messenger,
    {
      isMax: true,
    },
  );

  const estimate = calculateGasCost({
    chainId,
    gas: totalGasLimitEstimate,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
  });

  const max = calculateGasCost({
    chainId,
    gas: totalGasLimitMax,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
    isMax: true,
  });

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  if (new BigNumber(nativeBalance).isGreaterThanOrEqualTo(max.raw)) {
    return { estimate, max };
  }

  if (relayDisabledGasStationChains.includes(sourceChainId)) {
    log('Skipping gas station as disabled chain', {
      sourceChainId,
      disabledChainIds: relayDisabledGasStationChains,
    });

    return { estimate, max };
  }

  log('Checking gas fee tokens as insufficient native balance', {
    nativeBalance,
    max: max.raw,
  });

  const gasFeeTokens = await messenger.call(
    'TransactionController:getGasFeeTokens',
    {
      chainId: sourceChainId,
      data,
      from,
      to,
      value: toHex(value ?? '0'),
    },
  );

  log('Source gas fee tokens', { gasFeeTokens });

  const gasFeeToken = gasFeeTokens.find(
    (t) => t.tokenAddress.toLowerCase() === sourceTokenAddress.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('No matching gas fee token found', {
      sourceTokenAddress,
      gasFeeTokens,
    });

    return { estimate, max };
  }

  let finalAmount = gasFeeToken.amount;

  if (allParams.length > 1) {
    const gasRate = new BigNumber(gasFeeToken.amount, 16).dividedBy(
      gasFeeToken.gas,
      16,
    );

    const finalAmountValue = gasRate.multipliedBy(totalGasLimitEstimate);

    finalAmount = toHex(finalAmountValue.toFixed(0));

    log('Estimated gas fee token amount for batch', {
      finalAmount: finalAmountValue.toString(10),
      gasRate: gasRate.toString(10),
      totalGasLimitEstimate,
    });
  }

  const finalGasFeeToken = { ...gasFeeToken, amount: finalAmount };

  const gasFeeTokenCost = calculateGasFeeTokenCost({
    chainId: sourceChainId,
    gasFeeToken: finalGasFeeToken,
    messenger,
  });

  if (!gasFeeTokenCost) {
    return { estimate, max };
  }

  log('Using gas fee token for source network', {
    gasFeeTokenCost,
  });

  return {
    isGasFeeToken: true,
    estimate: gasFeeTokenCost,
    max: gasFeeTokenCost,
  };
}

/**
 * Calculate the total gas limit for the source network transactions.
 *
 * @param params - Array of transaction parameters.
 * @param messenger - Controller messenger.
 * @param options - Options.
 * @param options.isMax - Whether to calculate the maximum gas limit.
 * @returns - Total gas limit.
 */
function calculateSourceNetworkGasLimit(
  params: RelayQuote['steps'][0]['items'][0]['data'][],
  messenger: TransactionPayControllerMessenger,
  { isMax }: { isMax: boolean },
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

  const fallbackGas = getFeatureFlags(messenger).relayFallbackGas;

  return params.reduce((total, p) => {
    const fallback = isMax ? fallbackGas.max : fallbackGas.estimate;
    const gas = p.gas ?? fallback;

    return total + new BigNumber(gas).toNumber();
  }, 0);
}

/**
 * Calculate the provider fee for a Relay quote.
 *
 * @param quote - Relay quote.
 * @returns - Provider fee in USD.
 */
function calculateProviderFee(quote: RelayQuote) {
  return new BigNumber(quote.details.totalImpact.usd).abs();
}
