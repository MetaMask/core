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

const PROBE_AMOUNT_PERCENTAGE = 0.01;

enum GasCostEstimateSource {
  GasStation = 'gas-station',
  Probe = 'probe',
  Quote = 'quote',
  UsdBootstrap = 'usd-bootstrap',
}

type GasCostEstimate = {
  amount: BigNumber;
  source: GasCostEstimateSource;
};

type NativeBalanceCheckResult = {
  hasEnoughNativeBalance: boolean;
  nativeBalance?: string;
  nativeGasCostRaw?: string;
};

type GasStationEligibility = {
  chainSupportsGasStation: boolean;
  isDisabledChain: boolean;
  isEligible: boolean;
};

type GetSingleQuoteFn = (
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
) => Promise<TransactionPayQuote<RelayQuote>>;

/**
 * Gets a max-amount Relay quote and applies a gas-station fallback flow.
 *
 * Flow:
 * 1) Request phase-1 quote with the original max source amount.
 * 2) Early-return phase-1 when native gas is sufficient, feature flag is disabled,
 *    or gas station is not eligible on the source chain.
 * 3) Estimate source-token gas cost (quote -> gas-station params -> probe quote ->
 *    USD bootstrap fallback).
 * 4) Request phase-2 quote with adjusted source amount.
 * 5) Re-validate affordability from phase-2 and return adjusted quote only when
 *    validation succeeds; otherwise fall back to phase-1.
 *
 * @param request - Max quote request.
 * @param fullRequest - Full quotes request context.
 * @param getSingleQuote - Quote fetcher used for phase-1/phase-2/probe requests.
 * @returns The adjusted phase-2 quote when valid, otherwise the phase-1 quote.
 */
export async function getMaxAmountQuoteWithGasStationFallback(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger } = fullRequest;
  const { sourceChainId, sourceTokenAmount } = request;

  const { maxGaslessEnabled, relayDisabledGasStationChains } =
    getFeatureFlags(messenger);

  log('Phase 1: Getting max amount quote with full source amount', {
    sourceTokenAmount,
  });

  const phase1Quote = await getSingleQuote(request, fullRequest);

  const nativeBalanceCheck = checkEnoughNativeBalanceIfSourceGasFeeTokenNotUsed(
    phase1Quote,
    messenger,
    request,
  );

  if (nativeBalanceCheck.hasEnoughNativeBalance) {
    log(
      'Phase 1 complete: Native balance sufficient for gas, returning phase-1 quote',
      {
        nativeBalance: nativeBalanceCheck.nativeBalance,
        nativeGasCost: nativeBalanceCheck.nativeGasCostRaw,
      },
    );
    return phase1Quote;
  }

  if (!maxGaslessEnabled) {
    log(
      'Phase 1 complete: Max gasless two-phase flow disabled via feature flag',
    );
    return phase1Quote;
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
    relayDisabledGasStationChains,
  );

  if (!gasStationEligibility.isEligible) {
    log(
      'Phase 1 complete: Gas station disabled or unsupported, returning phase-1 quote',
      {
        chainSupportsGasStation: gasStationEligibility.chainSupportsGasStation,
        isDisabledChain: gasStationEligibility.isDisabledChain,
        sourceChainId,
      },
    );
    return phase1Quote;
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);

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

  const adjustedSourceAmount = getAdjustedSourceAmount(
    sourceAmountBN,
    initialGasEstimate.amount,
  );

  if (!isAdjustedAmountPositive(adjustedSourceAmount)) {
    log('Adjusted amount is not positive, returning phase-1 quote', {
      adjustedSourceAmount: adjustedSourceAmount.toString(10),
      gasCostInSourceToken: initialGasEstimate.amount.toString(10),
    });
    return phase1Quote;
  }

  const phase2Quote = await getAdjustedPhase2Quote(
    adjustedSourceAmount,
    initialGasEstimate,
    request,
    fullRequest,
    getSingleQuote,
  );

  if (!phase2Quote) {
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
    validationGasEstimate.source === GasCostEstimateSource.UsdBootstrap
  ) {
    log('Unable to validate gas station cost on adjusted quote');
    return phase1Quote;
  }

  if (
    !isAdjustedAmountAffordable(
      adjustedSourceAmount,
      validationGasEstimate.amount,
      sourceAmountBN,
    )
  ) {
    log('Adjusted quote fails affordability validation', {
      adjustedSourceAmount: adjustedSourceAmount.toString(10),
      validationGasCost: validationGasEstimate.amount.toString(10),
    });
    return phase1Quote;
  }

  markQuoteAsTwoPhaseForMaxAmount(phase2Quote);

  return phase2Quote;
}

function checkEnoughNativeBalanceIfSourceGasFeeTokenNotUsed(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): NativeBalanceCheckResult {
  if (quote.fees.isSourceGasFeeToken) {
    return { hasEnoughNativeBalance: false };
  }

  const nativeGasCostRaw = quote.fees.sourceNetwork.max.raw;
  const nativeBalance = getTokenBalance(
    messenger,
    request.from,
    request.sourceChainId,
    getNativeToken(request.sourceChainId),
  );

  return {
    hasEnoughNativeBalance: new BigNumber(nativeBalance).isGreaterThanOrEqualTo(
      nativeGasCostRaw,
    ),
    nativeBalance,
    nativeGasCostRaw,
  };
}

function getGasStationEligibility(
  messenger: TransactionPayControllerMessenger,
  sourceChainId: QuoteRequest['sourceChainId'],
  relayDisabledGasStationChains: readonly QuoteRequest['sourceChainId'][],
): GasStationEligibility {
  const supportedChains = getEIP7702SupportedChains(messenger);
  const chainSupportsGasStation = supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === sourceChainId.toLowerCase(),
  );

  const isDisabledChain = relayDisabledGasStationChains.includes(sourceChainId);

  return {
    chainSupportsGasStation,
    isDisabledChain,
    isEligible: !isDisabledChain && chainSupportsGasStation,
  };
}

function getAdjustedSourceAmount(
  sourceAmount: BigNumber,
  estimatedGasCost: BigNumber,
): BigNumber {
  return sourceAmount
    .minus(estimatedGasCost)
    .integerValue(BigNumber.ROUND_DOWN);
}

function isAdjustedAmountPositive(adjustedSourceAmount: BigNumber): boolean {
  return adjustedSourceAmount.isGreaterThan(0);
}

function isAdjustedAmountAffordable(
  adjustedSourceAmount: BigNumber,
  gasCost: BigNumber,
  originalSourceAmount: BigNumber,
): boolean {
  return adjustedSourceAmount
    .plus(gasCost)
    .isLessThanOrEqualTo(originalSourceAmount);
}

function markQuoteAsTwoPhaseForMaxAmount(
  quote: TransactionPayQuote<RelayQuote>,
): void {
  quote.original.metamask = {
    ...quote.original.metamask,
    twoPhaseQuoteForMaxAmount: true,
  };
}

async function getAdjustedPhase2Quote(
  adjustedSourceAmount: BigNumber,
  initialGasEstimate: GasCostEstimate,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<TransactionPayQuote<RelayQuote> | undefined> {
  log('Requesting adjusted max quote', {
    adjustedAmount: adjustedSourceAmount.toString(10),
    gasCostInSourceToken: initialGasEstimate.amount.toString(10),
    gasEstimateSource: initialGasEstimate.source,
    originalAmount: request.sourceTokenAmount,
  });

  try {
    return await getSingleQuote(
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
    return undefined;
  }
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
      source: GasCostEstimateSource.Quote,
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
      source: GasCostEstimateSource.GasStation,
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
        source: GasCostEstimateSource.Probe,
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
      source: GasCostEstimateSource.UsdBootstrap,
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
    .multipliedBy(PROBE_AMOUNT_PERCENTAGE)
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
