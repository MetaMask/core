import type { GenericQuoteRequest } from '@metamask/bridge-controller';
import type { QuoteResponse } from '@metamask/bridge-controller';
import { toChecksumHexAddress, toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { orderBy } from 'lodash';

import { projectLogger } from '../../logger';
import type {
  FiatValue,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getTokenFiatRate } from '../../utils/token';

const ERROR_MESSAGE_NO_QUOTES = 'No quotes found';
const ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM = 'All quotes under minimum';
const ATTEMPTS_MAX_DEFAULT = 5;
const BUFFER_INITIAL_DEFAULT = 0.04;
const BUFFER_STEP_DEFAULT = 0.04;
const BUFFER_SUBSEQUENT_DEFAULT = 0.05;
const SLIPPAGE_DEFAULT = 0.005;

const log = createModuleLogger(projectLogger, 'bridge-strategy');

type BridgeQuoteRequest = QuoteRequest & {
  attemptsMax: number;
  bufferInitial: number;
  bufferStep: number;
  bufferSubsequent: number;
  slippage: number;
  sourceBalanceRaw: string;
};

/**
 * Fetch bridge quotes for multiple requests.
 *
 * @param requests - An array of bridge quote requests.
 * @param messenger - Controller messenger.
 * @returns An array of bridge quotes.
 */
export async function getBridgeQuotes(
  requests: QuoteRequest[],
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionPayQuote<QuoteResponse>[]> {
  log('Fetching quotes', requests);

  if (!requests?.length) {
    return [];
  }

  const finalRequests = getFinalRequests(requests, messenger);

  const quotes = await Promise.all(
    finalRequests.map((request, index) =>
      getSufficientSingleBridgeQuote(request, index, messenger),
    ),
  );

  return quotes.map((quote, index) =>
    normalizeQuote(quote, finalRequests[index], messenger),
  );
}

/**
 * Retry fetching a single bridge quote until it meets the minimum target amount.
 *
 * @param request - Original quote request.
 * @param index - Index of the request in the array.
 * @param messenger - Controller messenger.
 * @returns The sufficient bridge quote.
 */
async function getSufficientSingleBridgeQuote(
  request: BridgeQuoteRequest,
  index: number,
  messenger: TransactionPayControllerMessenger,
): Promise<QuoteResponse> {
  const {
    attemptsMax,
    bufferInitial,
    bufferStep,
    bufferSubsequent,
    sourceBalanceRaw,
    sourceTokenAmount,
    targetTokenAddress,
  } = request;

  const sourceAmountValue = new BigNumber(sourceTokenAmount);
  const buffer = index === 0 ? bufferInitial : bufferSubsequent;
  const originalSourceAmount = sourceAmountValue.div(1 + buffer);

  let currentSourceAmount = sourceTokenAmount;

  for (let i = 0; i < attemptsMax; i++) {
    const currentRequest = {
      ...request,
      sourceTokenAmount: currentSourceAmount,
    };

    try {
      log('Attempt', {
        attempt: i + 1,
        attemptsMax,
        bufferInitial,
        bufferStep,
        currentSourceAmount,
        target: targetTokenAddress,
      });

      const result = await getSingleBridgeQuote(currentRequest, messenger);

      const dust = new BigNumber(result.quote.minDestTokenAmount)
        .minus(request.targetAmountMinimum)
        .toString(10);

      log('Found valid quote', {
        attempt: i + 1,
        target: targetTokenAddress,
        targetAmount: result.quote.minDestTokenAmount,
        goalAmount: request.targetAmountMinimum,
        dust,
        quote: result,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as { message: string }).message;

      if (errorMessage !== ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM) {
        throw error;
      }
    }

    if (
      new BigNumber(currentSourceAmount).isGreaterThanOrEqualTo(
        sourceBalanceRaw,
      )
    ) {
      log('Reached balance limit', targetTokenAddress);
      break;
    }

    const newSourceAmount = originalSourceAmount.multipliedBy(
      1 + buffer + bufferStep * (i + 1),
    );

    currentSourceAmount = newSourceAmount.isLessThan(sourceBalanceRaw)
      ? newSourceAmount.toFixed(0)
      : sourceBalanceRaw;
  }

  log('All attempts failed', request.targetTokenAddress);

  throw new Error(ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM);
}

/**
 * Fetch a single bridge quote.
 *
 * @param request - Quote request parameters.
 * @param messenger - Controller messenger.
 * @returns The bridge quote.
 */
async function getSingleBridgeQuote(
  request: BridgeQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<QuoteResponse> {
  const {
    from,
    slippage,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetChainId,
    targetTokenAddress,
  } = request;

  const quoteRequest: GenericQuoteRequest = {
    destChainId: targetChainId,
    destTokenAddress: toChecksumHexAddress(targetTokenAddress),
    destWalletAddress: from,
    gasIncluded: false,
    gasIncluded7702: false,
    insufficientBal: false,
    slippage: slippage * 100,
    srcChainId: sourceChainId,
    srcTokenAddress: toChecksumHexAddress(sourceTokenAddress),
    srcTokenAmount: sourceTokenAmount,
    walletAddress: from,
  };

  const quotes = await messenger.call(
    'BridgeController:fetchQuotes',
    quoteRequest,
  );

  if (!quotes.length) {
    throw new Error(ERROR_MESSAGE_NO_QUOTES);
  }

  return getBestQuote(quotes, request);
}

/**
 * Select the best quote from a list of quotes.
 *
 * @param quotes - List of quotes.
 * @param request - Original quote request.
 * @returns The best quote.
 */
function getBestQuote(
  quotes: QuoteResponse[],
  request: BridgeQuoteRequest,
): QuoteResponse {
  const fastestQuotes = orderBy(
    quotes,
    (quote) => quote.estimatedProcessingTimeInSeconds,
    'asc',
  ).slice(0, 3);

  const quotesOverMinimumTarget = fastestQuotes.filter((quote) =>
    new BigNumber(quote.quote.minDestTokenAmount).isGreaterThanOrEqualTo(
      request.targetAmountMinimum,
    ),
  );

  log('Finding best quote', {
    allQuotes: quotes,
    fastestQuotes,
    quotesOverMinimumTarget,
  });

  if (!quotesOverMinimumTarget.length) {
    throw new Error(ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM);
  }

  const cheapestQuote = orderBy(
    quotesOverMinimumTarget,
    (quote) => BigNumber(quote.quote.minDestTokenAmount).toNumber(),
    'desc',
  )[0];

  return cheapestQuote;
}

/**
 * Get the final bridge quote requests.
 * Subtracts subsequent source amounts from the available balance.
 *
 * @param requests - List of bridge quote requests.
 * @param messenger - Controller messenger.
 * @returns The final bridge quote requests.
 */
function getFinalRequests(
  requests: QuoteRequest[],
  messenger: TransactionPayControllerMessenger,
): BridgeQuoteRequest[] {
  const featureFlags = getFeatureFlags(messenger);

  return requests
    .map((request) => ({ ...request, ...featureFlags }))
    .map((request, index) => {
      const isFirstRequest = index === 0;
      const attemptsMax = isFirstRequest ? request.attemptsMax : 1;

      const sourceBalanceRaw = requests
        .reduce((acc, value, j) => {
          const isSameSource =
            value.sourceTokenAddress.toLowerCase() ===
              request.sourceTokenAddress.toLowerCase() &&
            value.sourceChainId === request.sourceChainId;

          if (isFirstRequest && j > index && isSameSource) {
            return acc.minus(value.sourceTokenAmount);
          }

          return acc;
        }, new BigNumber(request.sourceBalanceRaw))
        .toFixed(0);

      return {
        ...request,
        attemptsMax,
        sourceBalanceRaw,
      };
    });
}

/**
 * Get feature flags for bridge quotes.
 *
 * @param messenger - Controller messenger.
 * @returns Feature flags.
 */
function getFeatureFlags(messenger: TransactionPayControllerMessenger) {
  const featureFlags = messenger.call('RemoteFeatureFlagController:getState')
    .remoteFeatureFlags.confirmation_pay as Record<string, number> | undefined;

  return {
    attemptsMax: featureFlags?.attemptsMax ?? ATTEMPTS_MAX_DEFAULT,
    bufferInitial: featureFlags?.bufferInitial ?? BUFFER_INITIAL_DEFAULT,
    bufferStep: featureFlags?.bufferStep ?? BUFFER_STEP_DEFAULT,
    bufferSubsequent:
      featureFlags?.bufferSubsequent ?? BUFFER_SUBSEQUENT_DEFAULT,
    slippage: featureFlags?.slippage ?? SLIPPAGE_DEFAULT,
  };
}

/**
 * Convert a bridge specific quote response to a normalized transaction pay quote.
 *
 * @param quote - Bridge quote response.
 * @param request - Request
 * @param messenger - Controller messenger.
 * @returns Normalized transaction pay quote.
 */
function normalizeQuote(
  quote: QuoteResponse,
  request: BridgeQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): TransactionPayQuote<QuoteResponse> {
  const targetFiatRate = getTokenFiatRate(
    messenger,
    quote.quote.destAsset.address as Hex,
    toHex(quote.quote.destChainId),
  );

  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quote.quote.srcAsset.address as Hex,
    toHex(quote.quote.srcChainId),
  );

  if (sourceFiatRate === undefined || targetFiatRate === undefined) {
    throw new Error('Fiat rate not found for source or target token');
  }

  const targetAmountMinimumFiat = calculateFiatValue(
    quote.quote.minDestTokenAmount,
    quote.quote.destAsset.decimals,
    targetFiatRate.fiatRate,
    targetFiatRate.usdRate,
  );

  const sourceAmountFiat = calculateFiatValue(
    quote.quote.srcTokenAmount,
    quote.quote.srcAsset.decimals,
    sourceFiatRate.fiatRate,
    sourceFiatRate.usdRate,
  );

  const targetAmountGoal = calculateFiatValue(
    request.targetAmountMinimum,
    quote.quote.destAsset.decimals,
    targetFiatRate.fiatRate,
    targetFiatRate.usdRate,
  );

  return {
    estimatedDuration: quote.estimatedProcessingTimeInSeconds,
    dust: {
      fiat: new BigNumber(targetAmountMinimumFiat.fiat)
        .minus(targetAmountGoal.fiat)
        .toString(10),
      usd: new BigNumber(targetAmountMinimumFiat.usd)
        .minus(targetAmountGoal.usd)
        .toString(10),
    },
    fees: {
      provider: {
        fiat: new BigNumber(sourceAmountFiat.fiat)
          .minus(targetAmountMinimumFiat.fiat)
          .toString(10),
        usd: new BigNumber(sourceAmountFiat.usd)
          .minus(targetAmountMinimumFiat.usd)
          .toString(10),
      },
      sourceNetwork: {
        fiat: '0',
        usd: '0',
      },
      targetNetwork: {
        fiat: '0',
        usd: '0',
      },
    },
    original: quote,
    request,
  };
}

/**
 * Calculate fiat value from amount and fiat rates.
 *
 * @param amount - Amount to convert.
 * @param decimals - Token decimals.
 * @param fiatRateFiat - Fiat rate.
 * @param fiatRateUsd - USD rate.
 * @returns Fiat value.
 */
function calculateFiatValue(
  amount: string,
  decimals: number,
  fiatRateFiat: string,
  fiatRateUsd: string,
): FiatValue {
  const amountHuman = new BigNumber(amount).shiftedBy(-decimals);
  const usd = amountHuman.multipliedBy(fiatRateUsd).toString(10);
  const fiat = amountHuman.multipliedBy(fiatRateFiat).toString(10);

  return { fiat, usd };
}
