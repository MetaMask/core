import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { prefixError } from '../../utils/error-prefix.js';
import { isAtomicMaxEnabled } from '../../utils/feature-flags.js';
import {
  shouldUseGasStation,
  resolveGasStationCost,
} from '../../utils/gas-payment.js';
import { getTokenInfo } from '../../utils/token.js';
import { QuoteError } from '../../utils/validation.js';
import { ATOMIC_PROMOTION_FAILURE_PREFIX } from './constants.js';
import { isSubsidizedRelayQuote } from './relay-submit-execute.js';
import type { RelayQuote, RelayTransactionStep } from './types.js';

const log = createModuleLogger(projectLogger, 'relay-max');

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
 * Fetch a max quote using the client's atomic hint for subsidized routes.
 *
 * @param request - Max quote request.
 * @param fullRequest - Full quote context.
 * @param getSingleQuote - Fetcher for a single Relay quote.
 * @returns An atomic subsidized quote or a non-atomic max quote.
 */
export async function getRelayMaxQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  getSingleQuote: GetSingleQuoteFn,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger, transaction } = fullRequest;
  const { atomic, isPostQuote } = request;

  if (isPostQuote || !isAtomicMaxEnabled(messenger, transaction)) {
    return getRelayMaxGasStationQuote(request, fullRequest, getSingleQuote);
  }

  if (atomic !== false) {
    const sourceToken = getTokenInfo(
      messenger,
      request.sourceTokenAddress,
      request.sourceChainId,
    );
    const targetToken = getTokenInfo(
      messenger,
      request.targetTokenAddress,
      request.targetChainId,
    );

    if (!sourceToken || !targetToken) {
      throw new Error('Token decimals not found for atomic max quote');
    }

    // Fixed-spread subsidized routes exchange stablecoins 1:1 without fees.
    // Use the source budget, not the required amount from before Max.
    const targetAmount = new BigNumber(request.sourceTokenAmount)
      .shiftedBy(targetToken.decimals - sourceToken.decimals)
      .toFixed(0, BigNumber.ROUND_DOWN);
    const quote = await getAtomicMaxQuote({
      amount: targetAmount,
      fullRequest,
      getSingleQuote,
      request,
    });

    if (isSubsidizedRelayQuote(quote.original)) {
      return quote;
    }

    return getRelayMaxGasStationQuote(
      { ...request, atomic: false },
      fullRequest,
      getSingleQuote,
    );
  }

  const quote = await getRelayMaxGasStationQuote(
    request,
    fullRequest,
    getSingleQuote,
  );

  if (!isSubsidizedRelayQuote(quote.original)) {
    return quote;
  }

  try {
    const promotedQuote = await getAtomicMaxQuote({
      amount: quote.original.details.currencyOut.amount,
      fullRequest,
      getSingleQuote,
      request,
    });

    if (!isSubsidizedRelayQuote(promotedQuote.original)) {
      throw new Error('Promoted quote lost subsidy');
    }

    return promotedQuote;
  } catch (error) {
    return throwAtomicPromotionFailed(error);
  }
}

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
  const { sourceTokenAmount } = request;
  const context: MaxAmountQuoteContext = {
    fullRequest,
    getSingleQuote,
    messenger,
    request,
  };

  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (phase1Quote.original.metamask?.isExecute) {
    return phase1Quote;
  }

  // A source-token gas fee means the native balance is irrelevant, so skip the
  // balance check entirely rather than comparing against a cost the user will
  // never pay in native token.
  const useGasStation = shouldUseGasStation({
    messenger,
    nativeGasCostRaw: phase1Quote.fees.isSourceGasFeeToken
      ? undefined
      : phase1Quote.fees.sourceNetwork.max.raw,
    request,
  });

  if (!useGasStation) {
    return fallbackToPhase1(
      phase1Quote,
      'Native balance covers gas or gas station is unavailable',
    );
  }

  const sourceAmountBN = new BigNumber(sourceTokenAmount);
  const probeCost = await getProbeGasCostInSourceTokenRaw(context);

  if (!probeCost) {
    return fallbackToPhase1(
      phase1Quote,
      'Unable to estimate gas-station source token cost',
    );
  }

  const initialGasEstimate: GasCostEstimate = {
    amount: probeCost,
    source: GasCostEstimateSource.Probe,
  };

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

  const firstTxStep = quote.original.steps.find(
    (step): step is RelayTransactionStep => step.kind === 'transaction',
  );
  const firstStepData = firstTxStep?.items[0]?.data;

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

  // Native balance and chain eligibility were already checked before the probe
  // flow started, so only the source-token pricing is needed here.
  const gasStationCost = await resolveGasStationCost({
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

  if (!gasStationCost.amount) {
    return undefined;
  }

  return {
    amount: new BigNumber(gasStationCost.amount.raw),
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

  // Minimum probe size: ~0.01 token for tokens with >=2 decimals,
  // otherwise one raw unit for low-decimal tokens.
  const minimumProbeRaw = new BigNumber(1).shiftedBy(
    Math.max(sourceDecimals - 2, 0),
  );

  const probeRaw = BigNumber.minimum(
    sourceAmount,
    BigNumber.maximum(probeRawAmount, minimumProbeRaw),
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

async function getAtomicMaxQuote({
  amount,
  fullRequest,
  getSingleQuote,
  request,
}: {
  amount: string;
  fullRequest: PayStrategyGetQuotesRequest;
  getSingleQuote: GetSingleQuoteFn;
  request: QuoteRequest;
}): Promise<TransactionPayQuote<RelayQuote>> {
  const targetAmount = validatePositiveIntegerString(amount);
  const atomicTransaction = await applyAmountDataUpdates({
    amount: targetAmount,
    messenger: fullRequest.messenger,
    transaction: cloneTransactionForPromotion(fullRequest.transaction),
  });

  return getSingleQuote(
    {
      ...request,
      atomic: true,
      targetAmountMinimum: targetAmount,
    },
    { ...fullRequest, transaction: atomicTransaction },
  );
}

export function throwAtomicPromotionFailed(error: unknown): never {
  const prefixed = prefixError(error, ATOMIC_PROMOTION_FAILURE_PREFIX);
  throw new QuoteError({
    detail: [prefixed.message],
    message: prefixed.message,
    reason: 'no-quotes',
  });
}

export function isSubsidizedAtomicMaxQuote(
  quote: TransactionPayQuote<RelayQuote>,
): boolean {
  return (
    quote.request.isMaxAmount === true &&
    quote.request.atomic === true &&
    isSubsidizedRelayQuote(quote.original)
  );
}

function validatePositiveIntegerString(value: string): string {
  const amount = new BigNumber(value);

  if (!amount.isFinite() || !amount.isInteger() || !amount.isGreaterThan(0)) {
    throw new Error(`Invalid target amount: ${value}`);
  }

  return amount.toFixed(0);
}

function cloneTransactionForPromotion(
  transaction: TransactionMeta,
): TransactionMeta {
  return {
    ...transaction,
    nestedTransactions: transaction.nestedTransactions?.map(
      (nestedTransaction) => ({
        ...nestedTransaction,
      }),
    ),
    requiredAssets: transaction.requiredAssets?.map((requiredAsset) => ({
      ...requiredAsset,
    })),
  };
}

async function applyAmountDataUpdates({
  amount,
  messenger,
  transaction,
}: {
  amount: string;
  messenger: TransactionPayControllerMessenger;
  transaction: TransactionMeta;
}): Promise<TransactionMeta> {
  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    {
      amount,
      transaction,
    },
  );

  if (!updates.length) {
    throw new Error('getAmountData returned no updates for atomic promotion');
  }

  const nestedTransactions = transaction.nestedTransactions?.map(
    (nestedTransaction) => ({
      ...nestedTransaction,
    }),
  );

  if (!nestedTransactions?.length) {
    throw new Error('Missing nested transactions for atomic promotion');
  }

  for (const { nestedTransactionIndex, data } of updates) {
    if (!nestedTransactions[nestedTransactionIndex]) {
      throw new Error(
        'getAmountData returned an unusable nested transaction update',
      );
    }

    nestedTransactions[nestedTransactionIndex].data = data;
  }

  const requiredAssets = transaction.requiredAssets?.map((requiredAsset) => ({
    ...requiredAsset,
  }));

  if (!requiredAssets?.[0]) {
    throw new Error('Missing required assets for atomic promotion');
  }

  requiredAssets[0].amount = toHex(BigInt(amount));

  return {
    ...transaction,
    nestedTransactions,
    requiredAssets,
  };
}
