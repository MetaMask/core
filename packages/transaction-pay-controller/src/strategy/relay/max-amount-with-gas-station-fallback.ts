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
import { calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenInfo,
} from '../../utils/token';

const log = createModuleLogger(
  projectLogger,
  'max-amount-with-gas-station-fallback',
);

const PROBE_AMOUNT_PERCENTAGE = 0.25;

enum GasCostEstimateSource {
  GasStation = 'gas-station',
  Probe = 'probe',
  Quote = 'quote',
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

type MaxAmountQuoteContext = {
  fullRequest: PayStrategyGetQuotesRequest;
  getSingleQuote: GetSingleQuoteFn;
  messenger: TransactionPayControllerMessenger;
  request: QuoteRequest;
};

/**
 * Gets a max-amount Relay quote and applies a gas-station fallback flow.
 *
 * Flow:
 * 1) Request phase-1 quote with the original max source amount.
 * 2) Early-return phase-1 when native gas is sufficient, feature flag is disabled,
 *    or gas station is not eligible on the source chain.
 * 3) Estimate source-token gas cost (quote -> gas-station params -> probe quote).
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
  const context = createContext({ fullRequest, getSingleQuote, request });

  const { maxGaslessEnabled, relayDisabledGasStationChains } =
    getFeatureFlags(messenger);

  const phase1Quote = await getSingleQuote(request, fullRequest);

  const nativeBalanceCheck = checkEnoughNativeBalanceIfSourceGasFeeTokenNotUsed(
    phase1Quote,
    messenger,
    request,
  );

  if (nativeBalanceCheck.hasEnoughNativeBalance) {
    log('Native balance sufficient for gas', {
      nativeBalance: nativeBalanceCheck.nativeBalance,
      nativeGasCost: nativeBalanceCheck.nativeGasCostRaw,
    });
    return phase1Quote;
  }

  if (!maxGaslessEnabled) {
    return fallbackToPhase1(
      phase1Quote,
      'Max gasless two-phase flow disabled via feature flag',
    );
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
    relayDisabledGasStationChains,
  );

  if (!gasStationEligibility.isEligible) {
    return fallbackToPhase1(phase1Quote, 'Gas station disabled or unsupported');
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);

  const initialGasEstimate = await getInitialGasCostEstimate(
    phase1Quote,
    context,
  );

  if (!initialGasEstimate) {
    return fallbackToPhase1(
      phase1Quote,
      'Unable to estimate gas station source token cost',
    );
  }

  const adjustedSourceAmount = getAdjustedSourceAmount(
    sourceAmountBN,
    initialGasEstimate.amount,
  );

  if (!isAdjustedAmountPositive(adjustedSourceAmount)) {
    return fallbackToPhase1(phase1Quote, 'Adjusted amount is not positive');
  }

  const phase2Quote = await getAdjustedPhase2Quote(
    adjustedSourceAmount,
    initialGasEstimate,
    context,
  );

  if (!phase2Quote) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted phase-2 quote request failed',
    );
  }

  const validationGasEstimate = await getValidationGasCostEstimate(
    phase2Quote,
    context,
  );

  if (!validationGasEstimate) {
    return fallbackToPhase1(
      phase1Quote,
      'Unable to validate gas station cost on adjusted quote',
    );
  }

  if (
    !isAdjustedAmountAffordable(
      adjustedSourceAmount,
      validationGasEstimate.amount,
      sourceAmountBN,
    )
  ) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted quote fails affordability validation',
      {
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
        validationGasCost: validationGasEstimate.amount.toString(10),
      },
    );
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

function isAdjustedAmountAffordable(
  adjustedSourceAmount: BigNumber,
  gasCost: BigNumber,
  originalSourceAmount: BigNumber,
): boolean {
  return adjustedSourceAmount
    .plus(gasCost)
    .isLessThanOrEqualTo(originalSourceAmount);
}

async function getAdjustedPhase2Quote(
  adjustedSourceAmount: BigNumber,
  initialGasEstimate: GasCostEstimate,
  context: MaxAmountQuoteContext,
): Promise<TransactionPayQuote<RelayQuote> | undefined> {
  const { fullRequest, getSingleQuote, request } = context;

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

async function getInitialGasCostEstimate(
  quote: TransactionPayQuote<RelayQuote>,
  context: MaxAmountQuoteContext,
): Promise<GasCostEstimate | undefined> {
  const primaryEstimate = await getGasCostFromQuoteOrGasStation(
    quote,
    context.messenger,
    context.request,
  );

  if (primaryEstimate) {
    return primaryEstimate;
  }

  const probeCost = await getProbeGasCostInSourceTokenRaw(context);

  if (!probeCost) {
    return undefined;
  }

  return {
    amount: probeCost,
    source: GasCostEstimateSource.Probe,
  };
}

async function getValidationGasCostEstimate(
  quote: TransactionPayQuote<RelayQuote>,
  context: MaxAmountQuoteContext,
): Promise<GasCostEstimate | undefined> {
  return await getGasCostFromQuoteOrGasStation(
    quote,
    context.messenger,
    context.request,
  );
}

async function getGasCostFromQuoteOrGasStation(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<GasCostEstimate | undefined> {
  const gasCost = quote.fees.sourceNetwork.max;

  if (quote.fees.isSourceGasFeeToken) {
    log('Gas cost already in source token units', { raw: gasCost.raw });
    return {
      amount: new BigNumber(gasCost.raw),
      source: GasCostEstimateSource.Quote,
    };
  }

  const gasStationCost = await getGasStationCostInSourceTokenRaw(
    quote,
    messenger,
    request,
  );

  if (!gasStationCost) {
    return undefined;
  }

  return {
    amount: gasStationCost,
    source: GasCostEstimateSource.GasStation,
  };
}

async function getGasStationCostInSourceTokenRaw(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<BigNumber | undefined> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  const firstItemData = phase1Quote.original.steps[0]?.items[0]?.data;

  if (!firstItemData) {
    return undefined;
  }

  const { data, to, value } = firstItemData;
  const totalItemCount = phase1Quote.original.steps.reduce(
    (count, step) => count + step.items.length,
    0,
  );

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

  if (totalItemCount > 1) {
    const gasLimits = phase1Quote.original.metamask.gasLimits ?? [];
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

  const normalizedAmount = amount.integerValue(BigNumber.ROUND_CEIL).toFixed(0);

  const gasFeeTokenCost = calculateGasFeeTokenCost({
    chainId: sourceChainId,
    gasFeeToken: {
      ...gasFeeToken,
      amount: toHex(normalizedAmount),
    },
    messenger,
  });

  if (!gasFeeTokenCost) {
    log('Unable to calculate gas fee token cost using fiat rates', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  log('Estimated gas station cost for source token', {
    amount: gasFeeTokenCost.raw,
    sourceTokenAddress,
    sourceChainId,
  });

  return new BigNumber(gasFeeTokenCost.raw);
}

async function getProbeGasCostInSourceTokenRaw(
  context: MaxAmountQuoteContext,
): Promise<BigNumber | undefined> {
  const { fullRequest, getSingleQuote, messenger, request } = context;

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

function parseGasValue(value: string): BigNumber {
  if (value.toLowerCase().startsWith('0x')) {
    return new BigNumber(value.slice(2), 16);
  }

  return new BigNumber(value);
}

function createContext({
  fullRequest,
  getSingleQuote,
  request,
}: {
  fullRequest: PayStrategyGetQuotesRequest;
  getSingleQuote: GetSingleQuoteFn;
  request: QuoteRequest;
}): MaxAmountQuoteContext {
  return {
    fullRequest,
    getSingleQuote,
    messenger: fullRequest.messenger,
    request,
  };
}

function fallbackToPhase1(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  message: string,
  paramsToLog?: Record<string, unknown>,
): TransactionPayQuote<RelayQuote> {
  log(message, paramsToLog);
  return phase1Quote;
}

function isAdjustedAmountPositive(adjustedSourceAmount: BigNumber): boolean {
  return adjustedSourceAmount.isGreaterThan(0);
}

function markQuoteAsTwoPhaseForMaxAmount(
  quote: TransactionPayQuote<RelayQuote>,
): void {
  quote.original.metamask = {
    ...quote.original.metamask,
    twoPhaseQuoteForMaxAmount: true,
  };
}
