import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate } from './token';
import type {
  FiatRates,
  TransactionBridgeQuote,
  TransactionPayControllerMessenger,
} from '../types';

/**
 * Calculate the bridge fees for a given quote.
 *
 * @param quote - Bridge quote.
 * @param messenger - Controller messenger.
 * @returns The bridge fee in USD and fiat currency.
 */
function getBridgeFee(
  quote: TransactionBridgeQuote,
  messenger: TransactionPayControllerMessenger,
) {
  const fiat = getQuoteFiatAmounts(quote, messenger);
  const dust = getDust(quote, fiat.targetFiatRate);

  const feeUsd = new BigNumber(fiat.sourceAmountUsd)
    .minus(fiat.targetAmountUsd)
    .minus(dust.dustUsd);

  const feeFiat = new BigNumber(fiat.sourceAmountFiat)
    .minus(fiat.targetAmountFiat)
    .minus(dust.dustFiat);

  return {
    feeUsd,
    feeFiat,
  };
}

/**
 * Calculate the dust amount for a given quote and token.
 *
 * @param quote - Bridge quote.
 * @param targetFiatRates - Fiat rates for the target token.
 * @returns The dust amount as a string.
 */
function getDust(quote: TransactionBridgeQuote, targetFiatRates: FiatRates) {
  const minTargetAmountValue = new BigNumber(quote.quote.minDestTokenAmount);

  const dust = minTargetAmountValue.gt(quote.request.targetAmountMinimum)
    ? minTargetAmountValue.minus(quote.request.targetAmountMinimum)
    : new BigNumber(0);

  const dustUsd = dust.multipliedBy(targetFiatRates.usdRate).toString(10);
  const dustFiat = dust.multipliedBy(targetFiatRates.fiatRate).toString(10);

  return {
    dustUsd,
    dustFiat,
  };
}

/**
 * Calculate the fiat amounts for a given quote.
 *
 * @param quote - Bridge quote.
 * @param messenger - Controller messenger.
 * @returns The fiat amounts for the quote.
 */
function getQuoteFiatAmounts(
  quote: TransactionBridgeQuote,
  messenger: TransactionPayControllerMessenger,
) {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quote.quote.srcAsset.address as Hex,
    toHex(quote.quote.srcChainId),
  );

  const targetFiatRate = getTokenFiatRate(
    messenger,
    quote.quote.destAsset.address as Hex,
    toHex(quote.quote.destChainId),
  );

  if (!sourceFiatRate || !targetFiatRate) {
    throw new Error('Fiat rates not found for quote');
  }

  const sourceAmountValue = new BigNumber(quote.quote.srcTokenAmount);
  const targetAmountValue = new BigNumber(quote.quote.destTokenAmount);

  const sourceAmountFiat = sourceAmountValue
    .multipliedBy(sourceFiatRate.fiatRate)
    .toString(10);

  const sourceAmountUsd = sourceAmountValue
    .multipliedBy(sourceFiatRate.usdRate)
    .toString(10);

  const targetAmountFiat = targetAmountValue
    .multipliedBy(targetFiatRate.fiatRate)
    .toString(10);

  const targetAmountUsd = targetAmountValue
    .multipliedBy(targetFiatRate.usdRate)
    .toString(10);

  return {
    sourceAmountFiat,
    sourceAmountUsd,
    sourceFiatRate,
    targetAmountFiat,
    targetAmountUsd,
    targetFiatRate,
  };
}
