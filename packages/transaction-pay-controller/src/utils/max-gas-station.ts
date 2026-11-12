import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { getGasStationCostBuffer } from './feature-flags.js';
import type { GasStationStepData } from './gas-payment.js';
import { resolveGasStationCost, shouldUseGasStation } from './gas-payment.js';
import { getTokenInfo } from './token.js';

const log = createModuleLogger(projectLogger, 'max-gas-station');

const PROBE_AMOUNT_PERCENTAGE = 0.25;

/**
 * Provider-agnostic view of a quote, supplied by each strategy so the max gas
 * station flow never reads a strategy's original quote shape directly.
 */
export type MaxGasStationQuoteDetails = {
  /** Gas limits estimated for each origin-chain transaction. */
  gasLimits: number[];

  /**
   * Origin-chain transactions the gas station simulates to price gas in the
   * source token, or `undefined` when the quote has none.
   */
  gasStationTransactions?: {
    /** First origin-chain call. */
    firstStepData: GasStationStepData;

    /** Number of origin-chain calls in the quote. */
    totalItemCount: number;
  };

  /** Whether origin gas is paid by someone other than the user. */
  isGasless: boolean;
};

/**
 * Callbacks bridging the max gas station flow to a specific strategy.
 */
export type MaxGasStationRequest<OriginalQuote> = {
  /** Map a strategy quote to the details the flow needs. */
  getQuoteDetails: (
    quote: TransactionPayQuote<OriginalQuote>,
  ) => MaxGasStationQuoteDetails;

  messenger: TransactionPayControllerMessenger;

  /** Quote for the full max source amount. */
  quote: TransactionPayQuote<OriginalQuote>;

  /** Fetch a quote for an adjusted request from the same provider. */
  requote: (
    request: QuoteRequest,
  ) => Promise<TransactionPayQuote<OriginalQuote>>;
};

type MaxGasStationContext<OriginalQuote> = Pick<
  MaxGasStationRequest<OriginalQuote>,
  'getQuoteDetails' | 'messenger' | 'requote'
> & {
  /** Request of the original max quote, captured before any re-quote. */
  request: QuoteRequest;
};

/**
 * Re-quote a max-amount flow so origin gas can be paid from the source token.
 *
 * A max quote commits the whole source balance, so when the user cannot cover
 * origin gas in native token the gas station has nothing left to collect. This
 * estimates the gas cost in source-token units via a smaller probe quote, then
 * re-quotes with the source amount reduced by that cost plus a configurable
 * buffer.
 *
 * The adjusted quote is accepted only if it is still priced with the source
 * gas fee token and the reduced amount plus its gas cost still fits the
 * original amount. Otherwise, and on any failure, the original quote is
 * returned.
 *
 * @param request - Max gas station request.
 * @returns The adjusted quote, or the original quote on fallback.
 */
export async function getMaxGasStationQuote<OriginalQuote>(
  request: MaxGasStationRequest<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote>> {
  const { getQuoteDetails, messenger, quote, requote } = request;
  const context: MaxGasStationContext<OriginalQuote> = {
    getQuoteDetails,
    messenger,
    request: quote.request,
    requote,
  };
  const details = getQuoteDetails(quote);

  if (details.isGasless) {
    return fallback(quote, 'Quote is gasless');
  }

  // A source-token gas fee means the native balance is irrelevant, so skip the
  // balance check entirely rather than comparing against a cost the user will
  // never pay in native token.
  const useGasStation = shouldUseGasStation({
    messenger,
    nativeGasCostRaw: quote.fees.isSourceGasFeeToken
      ? undefined
      : quote.fees.sourceNetwork.max.raw,
    request: context.request,
  });

  if (!useGasStation) {
    return fallback(
      quote,
      'Native balance covers gas or gas station is unavailable',
    );
  }

  const sourceAmount = new BigNumber(context.request.sourceTokenAmount);
  const probeGasCost = await getProbeGasCost(context);

  if (!probeGasCost) {
    return fallback(quote, 'Unable to estimate gas-station source token cost');
  }

  const reservedGasCost = probeGasCost
    .multipliedBy(getGasStationCostBuffer(messenger))
    .integerValue(BigNumber.ROUND_UP);

  const adjustedSourceAmount = sourceAmount
    .minus(reservedGasCost)
    .integerValue(BigNumber.ROUND_DOWN);

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    return fallback(
      quote,
      'Insufficient balance for gas station after max adjustment',
    );
  }

  const adjustedQuote = await getAdjustedQuote(
    adjustedSourceAmount,
    reservedGasCost,
    context,
  );

  if (!adjustedQuote) {
    return fallback(quote, 'Adjusted quote request failed');
  }

  const validationError = getAdjustedQuoteValidationError({
    adjustedQuote,
    adjustedSourceAmount,
    sourceAmount,
  });

  if (validationError) {
    return fallback(quote, validationError.message, validationError.params);
  }

  return adjustedQuote;
}

async function getAdjustedQuote<OriginalQuote>(
  adjustedSourceAmount: BigNumber,
  reservedGasCost: BigNumber,
  { request, requote }: MaxGasStationContext<OriginalQuote>,
): Promise<TransactionPayQuote<OriginalQuote> | undefined> {
  log('Requesting adjusted max quote', {
    adjustedAmount: adjustedSourceAmount.toString(10),
    gasCostInSourceToken: reservedGasCost.toString(10),
    originalAmount: request.sourceTokenAmount,
  });

  try {
    return await requote({
      ...request,
      sourceTokenAmount: adjustedSourceAmount.toFixed(0, BigNumber.ROUND_DOWN),
    });
  } catch (error) {
    log('Adjusted quote request failed', { error });
    return undefined;
  }
}

function getAdjustedQuoteValidationError<OriginalQuote>({
  adjustedQuote,
  adjustedSourceAmount,
  sourceAmount,
}: {
  adjustedQuote: TransactionPayQuote<OriginalQuote>;
  adjustedSourceAmount: BigNumber;
  sourceAmount: BigNumber;
}): { message: string; params?: Record<string, unknown> } | undefined {
  if (!adjustedQuote.fees.isSourceGasFeeToken) {
    return {
      message: 'Adjusted quote did not return source gas fee token pricing',
    };
  }

  const adjustedGasCost = new BigNumber(
    adjustedQuote.fees.sourceNetwork.max.raw,
  );

  const isAffordable = adjustedSourceAmount
    .plus(adjustedGasCost)
    .isLessThanOrEqualTo(sourceAmount);

  if (!isAffordable) {
    return {
      message: 'Adjusted quote fails affordability validation',
      params: {
        adjustedGasCost: adjustedGasCost.toString(10),
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
      },
    };
  }

  return undefined;
}

/**
 * Estimate origin gas in source-token units using a quote for a fraction of
 * the source amount, leaving balance for the gas station to collect.
 *
 * @param context - Max gas station context.
 * @returns The probe's gas cost in raw source-token units, or `undefined` if
 * unknown.
 */
async function getProbeGasCost<OriginalQuote>(
  context: MaxGasStationContext<OriginalQuote>,
): Promise<BigNumber | undefined> {
  const { getQuoteDetails, messenger, request, requote } = context;
  const sourceToken = getTokenInfo(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (!sourceToken) {
    return undefined;
  }

  const probeAmount = getProbeAmount(
    request.sourceTokenAmount,
    sourceToken.decimals,
  );

  if (!probeAmount || probeAmount === request.sourceTokenAmount) {
    return undefined;
  }

  log('Requesting probe quote for gas station estimation', {
    originalSourceAmount: request.sourceTokenAmount,
    probeAmount,
  });

  let probeQuote: TransactionPayQuote<OriginalQuote> | undefined;

  try {
    probeQuote = await requote({ ...request, sourceTokenAmount: probeAmount });
  } catch (error) {
    log('Probe quote request failed', { error });
    return undefined;
  }

  if (!probeQuote) {
    return undefined;
  }

  const { gasLimits, gasStationTransactions } = getQuoteDetails(probeQuote);

  if (probeQuote.fees.isSourceGasFeeToken) {
    const { raw } = probeQuote.fees.sourceNetwork.max;
    log('Probe gas cost already in source token units', { raw });
    return new BigNumber(raw);
  }

  if (!gasStationTransactions) {
    return undefined;
  }

  // Native balance and chain eligibility were already checked before the probe
  // flow started, so only the source-token pricing is needed here.
  const gasStationCost = await resolveGasStationCost({
    firstStepData: gasStationTransactions.firstStepData,
    messenger,
    request: {
      from: request.from,
      sourceChainId: request.sourceChainId,
      sourceTokenAddress: request.sourceTokenAddress,
    },
    totalGasEstimate: sum(gasLimits),
    totalItemCount: gasStationTransactions.totalItemCount,
  });

  if (!gasStationCost.amount) {
    return undefined;
  }

  return new BigNumber(gasStationCost.amount.raw);
}

function getProbeAmount(
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

function fallback<OriginalQuote>(
  quote: TransactionPayQuote<OriginalQuote>,
  message: string,
  params?: Record<string, unknown>,
): TransactionPayQuote<OriginalQuote> {
  log(`Using original max quote: ${message}`, params);
  return quote;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
