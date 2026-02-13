import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { RelayQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFeatureFlags } from '../../utils/feature-flags';
import { getTokenFiatRate, getTokenInfo } from '../../utils/token';

const log = createModuleLogger(
  projectLogger,
  'max-amount-with-gas-station-fallback',
);

/**
 * Minimum adjusted amount threshold as a percentage of original max amount (1%).
 * If the adjusted amount falls below this threshold, we fall back to phase-1.
 */
const MIN_ADJUSTED_AMOUNT_PERCENTAGE = 0.01;

type GetSingleQuoteFn = (
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
) => Promise<TransactionPayQuote<RelayQuote>>;

/**
 * Handles max amount quotes with potential gas station fallback.
 * This implements a two-phase quoting strategy:
 *
 * Phase 1: Get quote with full source amount
 * - If native balance is sufficient for gas, return phase-1 quote
 * - If gas station is not eligible, return phase-1 quote
 *
 * Phase 2: Adjust source amount and re-quote (only if needed)
 * - Compute adjusted amount = sourceAmount - gasFeeTokenCost (with buffer)
 * - If adjusted amount is viable, get phase-2 quote
 * - Return phase-2 quote on success, or fall back to phase-1
 *
 * @param request - Quote request with isMaxAmount=true.
 * @param fullRequest - Full quotes request.
 * @param getSingleQuote - Function to fetch a single quote.
 * @returns Quote with potential two-phase adjustment.
 */
export async function getMaxAmountQuoteWithGasStationFallback(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger } = fullRequest;
  const { sourceChainId, sourceTokenAddress, sourceTokenAmount } = request;

  const { maxGasless } = getFeatureFlags(messenger);

  log('Phase 1: Getting max amount quote with full source amount', {
    sourceTokenAmount,
  });

  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (!maxGasless.enabled) {
    log(
      'Phase 1 complete: Max gasless two-phase flow disabled via feature flag',
    );
    return phase1Quote;
  }

  const gasCostInSourceToken = getGasCostInSourceTokenRaw(
    phase1Quote,
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  if (!gasCostInSourceToken) {
    log(
      'Phase 1 complete: Unable to convert gas cost to source token units, returning phase-1 quote',
    );
    return phase1Quote;
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);

  const configuredBuffer = maxGasless.bufferPercentage;
  const bufferMultiplier = 1 + configuredBuffer;
  const bufferedGasCost = gasCostInSourceToken.multipliedBy(bufferMultiplier);

  const adjustedSourceAmount = sourceAmountBN.minus(bufferedGasCost);

  const minimumThreshold = sourceAmountBN.multipliedBy(
    MIN_ADJUSTED_AMOUNT_PERCENTAGE,
  );

  if (
    adjustedSourceAmount.isLessThanOrEqualTo(0) ||
    adjustedSourceAmount.isLessThan(minimumThreshold)
  ) {
    log(
      'Phase 1 complete: Adjusted amount below minimum threshold, returning phase-1 quote',
      {
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
        minimumThreshold: minimumThreshold.toString(10),
        gasCostInSourceToken: gasCostInSourceToken.toString(10),
        bufferedGasCost: bufferedGasCost.toString(10),
      },
    );
    return phase1Quote;
  }

  log('Phase 2: Attempting re-quote with adjusted source amount', {
    originalAmount: sourceTokenAmount,
    adjustedAmount: adjustedSourceAmount.toString(10),
    gasCostInSourceToken: gasCostInSourceToken.toString(10),
    bufferedGasCost: bufferedGasCost.toString(10),
  });

  try {
    const adjustedRequest: QuoteRequest = {
      ...request,
      sourceTokenAmount: adjustedSourceAmount.toFixed(0),
    };

    const phase2Quote = await getSingleQuote(adjustedRequest, fullRequest);

    phase2Quote.original.metamask = {
      ...phase2Quote.original.metamask,
      twoPhaseQuoteForMaxAmount: true,
    };

    log('Phase 2 complete: Returning adjusted quote', {
      phase1SourceAmount: sourceTokenAmount,
      phase2SourceAmount: phase2Quote.sourceAmount.raw,
      gasReserve: bufferedGasCost.toString(10),
    });

    return phase2Quote;
  } catch (error) {
    log('Phase 2 failed: Falling back to phase-1 quote', { error });
    return phase1Quote;
  }
}

/**
 * Converts the gas cost from the phase-1 quote into source token raw units.
 *
 * When the gas fee token IS the source token (isSourceGasFeeToken), the
 * `.raw` value is already in source token units and can be used directly.
 *
 * When it is NOT (e.g. max-send spending all source tokens so the simulation
 * cannot offer the source token as a gas fee token), the gas cost `.raw` is
 * in native token denomination. We convert it to source token units via USD:
 *   gasCostSourceRaw = (gasCostUSD / sourceTokenUsdRate) * 10^sourceDecimals
 *
 * @param phase1Quote - The phase-1 quote.
 * @param messenger - Controller messenger.
 * @param sourceChainId - Chain ID of the source token.
 * @param sourceTokenAddress - Address of the source token.
 * @returns Gas cost in source token raw units, or undefined if conversion fails.
 */
function getGasCostInSourceTokenRaw(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  sourceChainId: Hex,
  sourceTokenAddress: Hex,
): BigNumber | undefined {
  const gasCost = phase1Quote.fees.sourceNetwork.max;

  // When isSourceGasFeeToken is true, .raw is already in source token units
  if (phase1Quote.fees.isSourceGasFeeToken) {
    log('Gas cost already in source token units', { raw: gasCost.raw });
    return new BigNumber(gasCost.raw);
  }

  // Otherwise, convert native gas cost to source token units via USD
  const gasCostUsd = new BigNumber(gasCost.usd);

  if (gasCostUsd.isLessThanOrEqualTo(0)) {
    log('Gas cost USD is zero or negative', { usd: gasCost.usd });
    return undefined;
  }

  const sourceTokenFiatRate = getTokenFiatRate(
    messenger,
    sourceTokenAddress,
    sourceChainId,
  );

  if (!sourceTokenFiatRate) {
    log('Source token fiat rate not found', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  const sourceTokenUsdRate = new BigNumber(sourceTokenFiatRate.usdRate);

  if (sourceTokenUsdRate.isLessThanOrEqualTo(0)) {
    log('Source token USD rate is zero or negative', {
      usdRate: sourceTokenFiatRate.usdRate,
    });
    return undefined;
  }

  const sourceTokenInfo = getTokenInfo(
    messenger,
    sourceTokenAddress,
    sourceChainId,
  );

  if (!sourceTokenInfo) {
    log('Source token info not found', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  // gasCostSourceHuman = gasCostUSD / sourceTokenUsdRate
  // gasCostSourceRaw = gasCostSourceHuman * 10^sourceDecimals
  const gasCostInSourceRaw = gasCostUsd
    .dividedBy(sourceTokenUsdRate)
    .shiftedBy(sourceTokenInfo.decimals);

  log('Converted gas cost to source token units via USD', {
    gasCostUsd: gasCostUsd.toString(10),
    sourceTokenUsdRate: sourceTokenUsdRate.toString(10),
    sourceDecimals: sourceTokenInfo.decimals,
    gasCostInSourceRaw: gasCostInSourceRaw.toString(10),
  });

  return gasCostInSourceRaw;
}
