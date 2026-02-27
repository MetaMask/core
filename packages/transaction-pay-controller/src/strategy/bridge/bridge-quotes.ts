import { FeatureId } from '@metamask/bridge-controller';
import type { GenericQuoteRequest } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import type { QuoteResponse } from '@metamask/bridge-controller';
import { toChecksumHexAddress, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { orderBy } from 'lodash';

import type {
  BridgeFeatureFlags,
  TransactionPayBridgeQuote,
  BridgeQuoteRequest,
} from './types';
import { TransactionPayStrategy } from '../..';
import { projectLogger } from '../../logger';
import type {
  Amount,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { calculateGasCost, calculateTransactionGasCost } from '../../utils/gas';
import { getTokenFiatRate } from '../../utils/token';

const ERROR_MESSAGE_NO_QUOTES = 'No quotes found';
const ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM = 'All quotes under minimum';
const ATTEMPTS_MAX_DEFAULT = 5;
const BUFFER_INITIAL_DEFAULT = 0.04;
const BUFFER_STEP_DEFAULT = 0.04;
const BUFFER_SUBSEQUENT_DEFAULT = 0.05;
const SLIPPAGE_DEFAULT = 0.005;

const FEATURE_ID_BY_TRANSACTION_TYPE = new Map<TransactionType, FeatureId>([
  [TransactionType.perpsDeposit, FeatureId.PERPS],
]);

const log = createModuleLogger(projectLogger, 'bridge-strategy');

/**
 * Fetch bridge quotes for multiple requests.
 *
 * @param request - Request object.
 * @returns An array of bridge quotes.
 */
export async function getBridgeQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<TransactionPayBridgeQuote>[]> {
  log('Fetching quotes', request);

  const { requests, messenger, transaction } = request;

  try {
    const finalRequests = getFinalRequests(requests, messenger);

    const quotes = await Promise.all(
      finalRequests.map((singleRequest, index) =>
        getSufficientSingleBridgeQuote(singleRequest, index, request),
      ),
    );

    return quotes.map((quote, index) =>
      normalizeQuote(quote, finalRequests[index], messenger, transaction),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch bridge quotes: ${String(error)}`);
  }
}

/**
 * Get bridge batch transactions if needed by the quotes.
 *
 * @param request - Request object.
 * @returns Array of batch transactions.
 */
export async function getBridgeBatchTransactions(
  request: PayStrategyGetBatchRequest<TransactionPayBridgeQuote>,
): Promise<BatchTransaction[]> {
  const { quotes } = request;
  const firstQuote = quotes[0]?.original?.quote;

  if (firstQuote?.srcChainId !== firstQuote?.destChainId) {
    log('No batch transactions needed for bridge quotes');
    return [];
  }

  return quotes
    .map((quote) => quote.original)
    .flatMap((quote) => {
      const result = [];

      if (quote.approval) {
        result.push({
          ...getBatchTransaction(quote.approval as TxData),
          type: TransactionType.swapApproval,
        });
      }

      result.push({
        ...getBatchTransaction(quote.trade as TxData),
        type: TransactionType.swap,
      });

      return result;
    });
}

/**
 * Get the refresh interval for bridge quotes.
 *
 * @param request - Request object.
 * @returns Refresh interval in milliseconds.
 */
export function getBridgeRefreshInterval(
  request: PayStrategyGetRefreshIntervalRequest,
): number | undefined {
  const { chainId, messenger } = request;

  const bridgeFeatureFlags = messenger.call(
    'RemoteFeatureFlagController:getState',
  ).remoteFeatureFlags.bridgeConfigV2 as BridgeFeatureFlags | undefined;

  const chainInterval =
    bridgeFeatureFlags?.chains?.[parseInt(chainId, 16)]?.refreshRate;

  const globalInterval = bridgeFeatureFlags?.refreshRate;

  return chainInterval ?? globalInterval;
}

/**
 * Get a fresh quote for a previously fetched bridge quote to avoid expiration.
 *
 * @param quote  - Original quote.
 * @param messenger - Controller messenger.
 * @param transaction - Transaction metadata.
 * @returns Fresh quote response.
 */
export async function refreshQuote(
  quote: TransactionPayQuote<TransactionPayBridgeQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<TransactionPayBridgeQuote> {
  const newQuote = await getSingleBridgeQuote(
    { ...quote.original.request, attemptsMax: 1 },
    messenger,
    transaction,
  );

  log('Refreshed quote', { old: quote, new: newQuote });

  return newQuote;
}

/**
 * Convert a quote trade or approval to a batch transaction.
 *
 * @param transaction - Quote trade or approval.
 * @returns Batch transaction.
 */
function getBatchTransaction(transaction: TxData): BatchTransaction {
  const data = transaction.data as Hex;
  const gas = transaction.gasLimit ? toHex(transaction.gasLimit) : undefined;
  const to = transaction.to as Hex;
  const value = transaction.value as Hex;

  return {
    data,
    gas,
    isAfter: false,
    to,
    value,
  };
}

/**
 * Retry fetching a single bridge quote until it meets the minimum target amount.
 *
 * @param quoteRequest - Original quote request.
 * @param index - Index of the request in the array.
 * @param request - Full quotes request.
 * @returns The sufficient bridge quote.
 */
async function getSufficientSingleBridgeQuote(
  quoteRequest: BridgeQuoteRequest,
  index: number,
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayBridgeQuote> {
  const {
    attemptsMax,
    bufferInitial,
    bufferStep,
    bufferSubsequent,
    sourceBalanceRaw,
    sourceTokenAmount,
    targetAmountMinimum,
    targetTokenAddress,
  } = quoteRequest;

  const sourceAmountValue = new BigNumber(sourceTokenAmount);
  const buffer = index === 0 ? bufferInitial : bufferSubsequent;
  const originalSourceAmount = sourceAmountValue.div(1 + buffer);
  const start = Date.now();

  let currentSourceAmount = sourceTokenAmount;

  for (let i = 0; i < attemptsMax; i++) {
    const currentRequest = {
      ...quoteRequest,
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

      const result = await getSingleBridgeQuote(
        currentRequest,
        request.messenger,
        request.transaction,
      );

      const dust = new BigNumber(result.quote.minDestTokenAmount)
        .minus(targetAmountMinimum)
        .toString(10);

      log('Found valid quote', {
        attempt: i + 1,
        target: targetTokenAddress,
        targetAmount: result.quote.minDestTokenAmount,
        goalAmount: targetAmountMinimum,
        dust,
        quote: result,
      });

      return {
        ...result,
        metrics: {
          attempts: i + 1,
          buffer: buffer + bufferStep * i,
          latency: Date.now() - start,
        },
      };
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
      log('Reached balance limit', {
        targetTokenAddress,
        sourceBalanceRaw,
        currentSourceAmount,
        attempt: i + 1,
      });

      break;
    }

    const newSourceAmount = originalSourceAmount.multipliedBy(
      1 + buffer + bufferStep * (i + 1),
    );

    currentSourceAmount = newSourceAmount.isLessThan(sourceBalanceRaw)
      ? newSourceAmount.toFixed(0)
      : sourceBalanceRaw;
  }

  log('All attempts failed', targetTokenAddress);

  throw new Error(ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM);
}

/**
 * Fetch a single bridge quote.
 *
 * @param quoteRequest - Quote request parameters.
 * @param messenger - Controller messenger.
 * @param transaction - Transaction metadata.
 * @returns The bridge quote.
 */
async function getSingleBridgeQuote(
  quoteRequest: BridgeQuoteRequest,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<TransactionPayBridgeQuote> {
  const {
    from,
    slippage,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetChainId,
    targetTokenAddress,
  } = quoteRequest;

  const { type } = transaction;
  const featureId = FEATURE_ID_BY_TRANSACTION_TYPE.get(type as TransactionType);

  const bridgeRequest: GenericQuoteRequest = {
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
    bridgeRequest,
    undefined,
    featureId,
  );

  if (!quotes.length) {
    throw new Error(ERROR_MESSAGE_NO_QUOTES);
  }

  const result = getBestQuote(quotes, quoteRequest);

  return {
    ...result,
    request: quoteRequest,
  };
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
function getFeatureFlags(messenger: TransactionPayControllerMessenger): {
  attemptsMax: number;
  bufferInitial: number;
  bufferStep: number;
  bufferSubsequent: number;
  slippage: number;
} {
  const featureFlags = messenger.call('RemoteFeatureFlagController:getState')
    .remoteFeatureFlags.confirmations_pay as Record<string, number> | undefined;

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
 * @param transaction - Transaction metadata.
 * @returns Normalized transaction pay quote.
 */
function normalizeQuote(
  quote: TransactionPayBridgeQuote,
  request: BridgeQuoteRequest,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): TransactionPayQuote<TransactionPayBridgeQuote> {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (sourceFiatRate === undefined) {
    throw new Error(
      `Fiat rate not found for source token - Chain ID: ${request.sourceChainId}, Address: ${request.sourceTokenAddress}`,
    );
  }

  const targetFiatRate = getTokenFiatRate(
    messenger,
    request.targetTokenAddress,
    request.targetChainId,
  );

  if (targetFiatRate === undefined) {
    throw new Error(
      `Fiat rate not found for target token - Chain ID: ${request.targetChainId}, Address: ${request.targetTokenAddress}`,
    );
  }

  const targetAmountMinimumFiat = calculateAmount(
    quote.quote.minDestTokenAmount,
    quote.quote.destAsset.decimals,
    targetFiatRate.fiatRate,
    targetFiatRate.usdRate,
  );

  const sourceAmount = calculateAmount(
    quote.quote.srcTokenAmount,
    quote.quote.srcAsset.decimals,
    sourceFiatRate.fiatRate,
    sourceFiatRate.usdRate,
  );

  const { fiat: targetAmountFiat, usd: targetAmountUsd } = calculateAmount(
    request.targetAmountMinimum,
    quote.quote.destAsset.decimals,
    targetFiatRate.fiatRate,
    targetFiatRate.usdRate,
  );

  const targetAmount = { fiat: targetAmountFiat, usd: targetAmountUsd };

  const targetNetwork = calculateTransactionGasCost(transaction, messenger);

  const sourceNetwork = {
    estimate: calculateSourceNetworkFee(quote, messenger),
    max: calculateSourceNetworkFee(quote, messenger, { isMax: true }),
  };

  return {
    estimatedDuration: quote.estimatedProcessingTimeInSeconds,
    dust: {
      fiat: new BigNumber(targetAmountMinimumFiat.fiat)
        .minus(targetAmount.fiat)
        .toString(10),
      usd: new BigNumber(targetAmountMinimumFiat.usd)
        .minus(targetAmount.usd)
        .toString(10),
    },
    fees: {
      metaMask: { usd: '0', fiat: '0' },
      provider: {
        fiat: new BigNumber(sourceAmount.fiat)
          .minus(targetAmountMinimumFiat.fiat)
          .toString(10),
        usd: new BigNumber(sourceAmount.usd)
          .minus(targetAmountMinimumFiat.usd)
          .toString(10),
      },
      sourceNetwork,
      targetNetwork,
    },
    original: quote,
    request,
    sourceAmount,
    targetAmount,
    strategy: TransactionPayStrategy.Bridge,
  };
}

/**
 * Calculate amount from raw value and fiat rates.
 *
 * @param raw - Amount to convert.
 * @param decimals - Token decimals.
 * @param fiatRateFiat - Fiat rate.
 * @param fiatRateUsd - USD rate.
 * @returns Amount object.
 */
function calculateAmount(
  raw: string,
  decimals: number,
  fiatRateFiat: string,
  fiatRateUsd: string,
): Amount {
  const humanValue = new BigNumber(raw).shiftedBy(-decimals);
  const human = humanValue.toString(10);

  const usd = humanValue.multipliedBy(fiatRateUsd).toString(10);
  const fiat = humanValue.multipliedBy(fiatRateFiat).toString(10);

  return { fiat, human, raw, usd };
}

/**
 * Calculate the source network fee for a bridge quote.
 *
 * @param quote - Bridge quote response.
 * @param messenger - Controller messenger.
 * @param options - Calculation options.
 * @param options.isMax - Whether to calculate the maximum cost.
 * @returns Estimated gas cost for the source network.
 */
function calculateSourceNetworkFee(
  quote: TransactionPayBridgeQuote,
  messenger: TransactionPayControllerMessenger,
  { isMax = false } = {},
): Amount {
  const { approval, trade } = quote;

  const approvalCost = approval
    ? calculateTransactionCost(approval as TxData, messenger, { isMax })
    : { fiat: '0', human: '0', raw: '0', usd: '0' };

  const tradeCost = calculateTransactionCost(trade as TxData, messenger, {
    isMax,
  });

  return {
    fiat: new BigNumber(approvalCost.fiat).plus(tradeCost.fiat).toString(10),
    human: new BigNumber(approvalCost.human).plus(tradeCost.human).toString(10),
    raw: new BigNumber(approvalCost.raw).plus(tradeCost.raw).toString(10),
    usd: new BigNumber(approvalCost.usd).plus(tradeCost.usd).toString(10),
  };
}

/**
 * Calculate the source gas cost for a transaction.
 *
 * @param transaction - Transaction parameters.
 * @param messenger - Controller messenger
 * @param options - Calculation options.
 * @param options.isMax - Whether to calculate the maximum cost.
 * @returns Estimated gas cost for a bridge transaction.
 */
function calculateTransactionCost(
  transaction: TxData,
  messenger: TransactionPayControllerMessenger,
  { isMax }: { isMax: boolean },
): Amount {
  const { effectiveGas: effectiveGasOriginal, gasLimit } = transaction;
  const effectiveGas = isMax ? undefined : effectiveGasOriginal;

  return calculateGasCost({
    ...transaction,
    gas: effectiveGas ?? gasLimit ?? '0x0',
    messenger,
    isMax,
  });
}
