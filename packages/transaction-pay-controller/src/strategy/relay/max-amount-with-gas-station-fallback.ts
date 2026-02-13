import { toHex } from '@metamask/controller-utils';
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
import {
  getEIP7702SupportedChains,
  getFeatureFlags,
} from '../../utils/feature-flags';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token';

const log = createModuleLogger(
  projectLogger,
  'max-amount-with-gas-station-fallback',
);

/**
 * Minimum adjusted amount threshold as a percentage of original max amount (1%).
 * If the adjusted amount falls below this threshold, we fall back to phase-1.
 */
const MIN_ADJUSTED_AMOUNT_PERCENTAGE = 0.01;

type GasCostEstimateSource =
  | 'quote'
  | 'gas-station'
  | 'probe'
  | 'usd-bootstrap';

type GasCostEstimate = {
  amount: BigNumber;
  source: GasCostEstimateSource;
};

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
  const { sourceChainId, sourceTokenAmount } = request;

  const { maxGasless, relayDisabledGasStationChains } =
    getFeatureFlags(messenger);

  log('Phase 1: Getting max amount quote with full source amount', {
    sourceTokenAmount,
  });

  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (!phase1Quote.fees.isSourceGasFeeToken) {
    const nativeGasCost = phase1Quote.fees.sourceNetwork.max;
    const nativeBalance = getTokenBalance(
      messenger,
      request.from,
      sourceChainId,
      getNativeToken(sourceChainId),
    );

    const hasEnoughNativeBalance = new BigNumber(
      nativeBalance,
    ).isGreaterThanOrEqualTo(nativeGasCost.raw);

    if (hasEnoughNativeBalance) {
      log(
        'Phase 1 complete: Native balance sufficient for gas, returning phase-1 quote',
        { nativeBalance, nativeGasCost: nativeGasCost.raw },
      );
      return phase1Quote;
    }
  }

  if (!maxGasless.enabled) {
    log(
      'Phase 1 complete: Max gasless two-phase flow disabled via feature flag',
    );
    return phase1Quote;
  }

  const supportedChains = getEIP7702SupportedChains(messenger);
  const chainSupportsGasStation = supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === sourceChainId.toLowerCase(),
  );

  if (
    relayDisabledGasStationChains.includes(sourceChainId) ||
    !chainSupportsGasStation
  ) {
    log(
      'Phase 1 complete: Gas station disabled or unsupported, returning phase-1 quote',
      {
        chainSupportsGasStation,
        sourceChainId,
      },
    );
    return phase1Quote;
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);
  const minimumThreshold = sourceAmountBN.multipliedBy(
    MIN_ADJUSTED_AMOUNT_PERCENTAGE,
  );
  const bufferMultiplier = 1 + maxGasless.bufferPercentage;

  const initialGasEstimate = await getGasCostInSourceTokenRaw(
    phase1Quote,
    messenger,
    request,
    fullRequest,
    getSingleQuote,
    true,
  );

  if (!initialGasEstimate) {
    log('Unable to estimate gas station source token cost');
    return phase1Quote;
  }

  const bufferedGasCost =
    initialGasEstimate.amount.multipliedBy(bufferMultiplier);
  const adjustedSourceAmount = sourceAmountBN.minus(bufferedGasCost);

  if (
    adjustedSourceAmount.isLessThanOrEqualTo(0) ||
    adjustedSourceAmount.isLessThan(minimumThreshold)
  ) {
    log('Adjusted amount below minimum threshold', {
      adjustedSourceAmount: adjustedSourceAmount.toString(10),
      minimumThreshold: minimumThreshold.toString(10),
      gasCostInSourceToken: initialGasEstimate.amount.toString(10),
      bufferedGasCost: bufferedGasCost.toString(10),
    });
    return phase1Quote;
  }

  let phase2Quote: TransactionPayQuote<RelayQuote>;

  log('Requesting adjusted max quote', {
    adjustedAmount: adjustedSourceAmount.toString(10),
    gasCostInSourceToken: initialGasEstimate.amount.toString(10),
    gasEstimateSource: initialGasEstimate.source,
    originalAmount: sourceTokenAmount,
  });

  try {
    phase2Quote = await getSingleQuote(
      {
        ...request,
        sourceTokenAmount: adjustedSourceAmount.toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      },
      fullRequest,
    );
  } catch (error) {
    log('Adjusted quote request failed, falling back to phase-1 quote', {
      error,
    });
    return phase1Quote;
  }

  const validationGasEstimate = await getGasCostInSourceTokenRaw(
    phase2Quote,
    messenger,
    request,
    fullRequest,
    getSingleQuote,
    false,
  );

  if (
    !validationGasEstimate ||
    validationGasEstimate.source === 'usd-bootstrap'
  ) {
    log('Unable to validate gas station cost on adjusted quote');
    return phase1Quote;
  }

  const validationBufferedGasCost = validationGasEstimate.amount;

  if (
    adjustedSourceAmount
      .plus(validationBufferedGasCost)
      .isGreaterThan(sourceAmountBN)
  ) {
    log('Adjusted quote fails affordability validation', {
      adjustedSourceAmount: adjustedSourceAmount.toString(10),
      validationBufferedGasCost: validationBufferedGasCost.toString(10),
    });
    return phase1Quote;
  }

  phase2Quote.original.metamask = {
    ...phase2Quote.original.metamask,
    twoPhaseQuoteForMaxAmount: true,
  };

  return phase2Quote;
}

async function getGasCostInSourceTokenRaw(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
  allowProbe: boolean,
): Promise<GasCostEstimate | undefined> {
  const gasCost = phase1Quote.fees.sourceNetwork.max;

  if (phase1Quote.fees.isSourceGasFeeToken) {
    log('Gas cost already in source token units', { raw: gasCost.raw });
    return {
      amount: new BigNumber(gasCost.raw),
      source: 'quote',
    };
  }

  const gasStationCost = await getGasStationCostInSourceTokenRaw(
    phase1Quote,
    messenger,
    request,
  );

  if (gasStationCost) {
    return {
      amount: gasStationCost,
      source: 'gas-station',
    };
  }

  if (allowProbe) {
    const probeCost = await getProbeGasCostInSourceTokenRaw(
      request,
      fullRequest,
      getSingleQuote,
    );

    if (probeCost) {
      return {
        amount: probeCost,
        source: 'probe',
      };
    }
  }

  const bootstrapCost = getBootstrapGasCostInSourceTokenRaw(
    phase1Quote,
    messenger,
    request,
  );

  if (bootstrapCost) {
    return {
      amount: bootstrapCost,
      source: 'usd-bootstrap',
    };
  }

  return undefined;
}

async function getGasStationCostInSourceTokenRaw(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<BigNumber | undefined> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  const params = phase1Quote.original.steps
    .flatMap((step) => step.items)
    .map((item) => item.data);

  if (params.length === 0) {
    return undefined;
  }

  const { data, to, value } = params[0];

  let gasFeeTokens;

  try {
    gasFeeTokens = await messenger.call(
      'TransactionController:getGasFeeTokens',
      {
        chainId: sourceChainId,
        data,
        from,
        to,
        value: toHex(value ?? '0'),
      },
    );
  } catch (error) {
    log('Failed to estimate gas fee tokens for max amount fallback', {
      error,
      sourceChainId,
    });
    return undefined;
  }

  const gasFeeToken = gasFeeTokens.find(
    (singleGasFeeToken) =>
      singleGasFeeToken.tokenAddress.toLowerCase() ===
      sourceTokenAddress.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('No matching source token in gas fee token estimate', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  let amount = parseGasValue(gasFeeToken.amount);

  if (params.length > 1) {
    const { gasLimits } = phase1Quote.original.metamask;
    const totalGasEstimate = gasLimits.reduce(
      (acc, gasLimit) => acc + gasLimit,
      0,
    );

    const gas = parseGasValue(gasFeeToken.gas);
    const gasFeeAmount = parseGasValue(gasFeeToken.amount);

    if (totalGasEstimate > 0 && gas.isGreaterThan(0)) {
      const gasRate = gasFeeAmount.dividedBy(gas);
      amount = gasRate.multipliedBy(totalGasEstimate);
    }
  }

  log('Estimated gas station cost for source token', {
    amount: amount.toString(10),
    sourceTokenAddress,
    sourceChainId,
  });

  return amount.integerValue(BigNumber.ROUND_CEIL);
}

async function getProbeGasCostInSourceTokenRaw(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<BigNumber | undefined> {
  const { messenger } = fullRequest;

  const sourceTokenInfo = getTokenInfo(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (!sourceTokenInfo) {
    return undefined;
  }

  const probeAmount = getProbeSourceAmountRaw(
    request.sourceTokenAmount,
    sourceTokenInfo.decimals,
  );

  if (!probeAmount || probeAmount === request.sourceTokenAmount) {
    return undefined;
  }

  log('Requesting probe quote for gas station estimation', {
    originalSourceAmount: request.sourceTokenAmount,
    probeAmount,
  });

  let probeQuote: TransactionPayQuote<RelayQuote>;

  try {
    probeQuote = await getSingleQuote(
      {
        ...request,
        sourceTokenAmount: probeAmount,
      },
      fullRequest,
    );
  } catch (error) {
    log('Probe quote request failed', { error });
    return undefined;
  }

  if (probeQuote.fees.isSourceGasFeeToken) {
    return new BigNumber(probeQuote.fees.sourceNetwork.max.raw);
  }

  return await getGasStationCostInSourceTokenRaw(
    probeQuote,
    messenger,
    request,
  );
}

function getProbeSourceAmountRaw(
  sourceAmountRaw: string,
  sourceDecimals: number,
): string | undefined {
  const sourceAmount = new BigNumber(sourceAmountRaw);

  if (sourceAmount.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  const onePercentRaw = sourceAmount
    .multipliedBy(0.01)
    .integerValue(BigNumber.ROUND_FLOOR);
  const targetProbeRaw = new BigNumber(1).shiftedBy(
    Math.max(sourceDecimals - 2, 0),
  );

  const probeRaw = BigNumber.minimum(
    sourceAmount,
    BigNumber.maximum(onePercentRaw, targetProbeRaw),
  ).integerValue(BigNumber.ROUND_FLOOR);

  if (probeRaw.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  return probeRaw.toFixed(0);
}

function getBootstrapGasCostInSourceTokenRaw(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): BigNumber | undefined {
  const gasCostUsd = new BigNumber(quote.fees.sourceNetwork.max.usd);

  if (gasCostUsd.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  const sourceTokenFiatRate = getTokenFiatRate(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (!sourceTokenFiatRate) {
    return undefined;
  }

  const sourceTokenUsdRate = new BigNumber(sourceTokenFiatRate.usdRate);

  if (sourceTokenUsdRate.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  const sourceTokenInfo = getTokenInfo(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (!sourceTokenInfo) {
    return undefined;
  }

  const bootstrapCost = gasCostUsd
    .dividedBy(sourceTokenUsdRate)
    .shiftedBy(sourceTokenInfo.decimals)
    .integerValue(BigNumber.ROUND_CEIL);

  if (bootstrapCost.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  log('Using USD bootstrap gas estimate for source token', {
    bootstrapCost: bootstrapCost.toString(10),
    gasCostUsd: gasCostUsd.toString(10),
    sourceTokenUsdRate: sourceTokenUsdRate.toString(10),
  });

  return bootstrapCost;
}

function parseGasValue(value: string): BigNumber {
  if (value.toLowerCase().startsWith('0x')) {
    return new BigNumber(value.slice(2), 16);
  }

  return new BigNumber(value);
}
