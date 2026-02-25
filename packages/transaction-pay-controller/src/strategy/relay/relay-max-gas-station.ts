import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  getGasStationEligibility,
  getGasStationCostInSourceTokenRaw,
} from './gas-station';
import type { RelayQuote } from './types';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getNativeToken,
  getTokenBalance,
  getTokenInfo,
} from '../../utils/token';

const log = createModuleLogger(projectLogger, 'relay-max-gas-station');

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
 * Returns a Relay max-amount quote using a two-phase gas-station fallback.
 *
 * It first requests a standard max quote (phase 1), then when needed estimates
 * gas in source-token units (directly or via a probe quote), requests an
 * adjusted max quote (phase 2), and accepts phase 2 only if validation passes
 * (source gas fee token selected, gas-limit checks, affordability).
 *
 * If any step fails or validation is unsafe, it safely falls back to phase 1.
 * Successful phase-2 quotes are tagged with `metamask.isMaxGasStation = true`.
 *
 * @param request - Relay quote request for a max-amount flow.
 * @param fullRequest - Full quote request context including messenger and transaction.
 * @param getSingleQuote - Quote fetcher used for phase-1, phase-2, and probe quotes.
 * @returns The validated adjusted phase-2 quote, or the original phase-1 quote on fallback.
 */
export async function getRelayMaxGasStationQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger } = fullRequest;
  const { sourceChainId, sourceTokenAmount } = request;
  const context: MaxAmountQuoteContext = {
    fullRequest,
    getSingleQuote,
    messenger,
    request,
  };

  const phase1Quote = await getSingleQuote(request, fullRequest);

  const nativeBalanceCheck = checkEnoughNativeBalanceIfSourceGasFeeTokenNotUsed(
    phase1Quote,
    messenger,
    request,
  );

  if (nativeBalanceCheck.hasEnoughNativeBalance) {
    return fallbackToPhase1(
      phase1Quote,
      'Native balance is sufficient for gas',
      {
        nativeBalance: nativeBalanceCheck.nativeBalance,
        nativeGasCost: nativeBalanceCheck.nativeGasCostRaw,
      },
    );
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
  );

  if (!gasStationEligibility.isEligible) {
    return fallbackToPhase1(
      phase1Quote,
      'Gas station is disabled or unsupported',
    );
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);
  const initialGasEstimate = await getInitialGasCostEstimate(
    phase1Quote,
    context,
  );

  if (!initialGasEstimate) {
    return fallbackToPhase1(
      phase1Quote,
      'Unable to estimate gas-station source token cost',
    );
  }

  const adjustedSourceAmount = getAdjustedSourceAmount(
    sourceAmountBN,
    initialGasEstimate.amount,
  );

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    return fallbackToPhase1(
      phase1Quote,
      'Insufficient balance for gas station after max adjustment',
    );
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

  if (!phase2Quote.fees.isSourceGasFeeToken) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted quote did not return source gas fee token pricing',
    );
  }

  const phase1GasLimits = phase1Quote.original.metamask.gasLimits ?? [];
  const phase2GasLimits = phase2Quote.original.metamask.gasLimits ?? [];

  if (!hasMatchingGasLimitShape(phase1GasLimits, phase2GasLimits)) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted quote gas limit shape changed between phases',
      {
        phase1GasLimits,
        phase2GasLimits,
      },
    );
  }

  const phase1TotalGasLimit = getTotalGasLimit(phase1GasLimits);
  const phase2TotalGasLimit = getTotalGasLimit(phase2GasLimits);

  if (phase2TotalGasLimit > phase1TotalGasLimit) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted quote total gas limit increased between phases',
      {
        phase1TotalGasLimit,
        phase2TotalGasLimit,
      },
    );
  }

  const validationGasEstimate = new BigNumber(
    phase2Quote.fees.sourceNetwork.max.raw,
  );

  if (
    !isAdjustedAmountAffordable(
      adjustedSourceAmount,
      validationGasEstimate,
      sourceAmountBN,
    )
  ) {
    return fallbackToPhase1(
      phase1Quote,
      'Adjusted quote fails affordability validation',
      {
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
        validationGasCost: validationGasEstimate.toString(10),
      },
    );
  }

  markQuoteAsMaxGasStation(phase2Quote);

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

  const firstStepData = quote.original.steps[0]?.items[0]?.data;

  if (!firstStepData) {
    return undefined;
  }

  const totalItemCount = quote.original.steps.reduce(
    (count, step) => count + step.items.length,
    0,
  );

  const totalGasEstimate = (quote.original.metamask.gasLimits ?? []).reduce(
    (acc, gasLimit) => acc + gasLimit,
    0,
  );

  const gasStationCost = await getGasStationCostInSourceTokenRaw({
    firstStepData,
    messenger,
    request: {
      from: request.from,
      sourceChainId: request.sourceChainId,
      sourceTokenAddress: request.sourceTokenAddress,
    },
    totalGasEstimate,
    totalItemCount,
  });

  if (!gasStationCost) {
    return undefined;
  }

  return {
    amount: new BigNumber(gasStationCost.raw),
    source: GasCostEstimateSource.GasStation,
  };
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

  let probeQuote: TransactionPayQuote<RelayQuote> | undefined;

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

  if (!probeQuote) {
    return undefined;
  }

  const probeEstimate = await getGasCostFromQuoteOrGasStation(
    probeQuote,
    messenger,
    request,
  );

  return probeEstimate?.amount;
}

function getProbeSourceAmountRaw(
  sourceAmountRaw: string,
  sourceDecimals: number,
): string | undefined {
  const sourceAmount = new BigNumber(sourceAmountRaw);

  if (sourceAmount.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  const probeRawAmount = sourceAmount
    .multipliedBy(PROBE_AMOUNT_PERCENTAGE)
    .integerValue(BigNumber.ROUND_FLOOR);

  const targetProbeRaw = new BigNumber(1).shiftedBy(
    Math.max(sourceDecimals - 2, 0),
  );

  const probeRaw = BigNumber.minimum(
    sourceAmount,
    BigNumber.maximum(probeRawAmount, targetProbeRaw),
  ).integerValue(BigNumber.ROUND_FLOOR);

  if (probeRaw.isLessThanOrEqualTo(0)) {
    return undefined;
  }

  return probeRaw.toFixed(0);
}

function fallbackToPhase1(
  phase1Quote: TransactionPayQuote<RelayQuote>,
  message: string,
  paramsToLog?: Record<string, unknown>,
): TransactionPayQuote<RelayQuote> {
  log(message, paramsToLog);
  return phase1Quote;
}

function hasMatchingGasLimitShape(phase1: number[], phase2: number[]): boolean {
  return phase1.length === phase2.length;
}

function getTotalGasLimit(gasLimits: number[]): number {
  return gasLimits.reduce((total, gasLimit) => total + gasLimit, 0);
}

function markQuoteAsMaxGasStation(
  quote: TransactionPayQuote<RelayQuote>,
): void {
  quote.original.metamask = {
    ...quote.original.metamask,
    isMaxGasStation: true,
  };
}
