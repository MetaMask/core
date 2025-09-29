import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate, getTokenInfo } from './token';
import type {
  TransactionBridgeQuote,
  TransactionPayControllerMessenger,
  TransactionToken,
} from '../types';

export type TransactionTotals = {
  feeUsd: string;
  feeFiat: string;
  totalUsd: string;
  totalFiat: string;
};

/**
 * Calculate totals for a list of quotes and tokens.
 *
 * @param quotes - List of bridge quotes.
 * @param tokens - List of required transaction tokens.
 * @param messenger - Controller messenger.
 * @returns The calculated totals in USD and fiat currency.
 */
export function calculateTotals(
  quotes: TransactionBridgeQuote[],
  tokens: TransactionToken[],
  messenger: TransactionPayControllerMessenger,
): TransactionTotals {
  const bridgeFeeTotal = getBridgeFeeTotal(quotes, messenger);
  const total = getTotal(quotes, tokens, messenger);

  return { ...bridgeFeeTotal, ...total };
}

/**
 * Calculate the total cost for a list of quotes.
 *
 * @param quotes - List of bridge quotes.
 * @param tokens - List of transaction tokens.
 * @param messenger - Controller messenger.
 * @returns The total cost in USD and fiat currency.
 */
function getTotal(
  quotes: TransactionBridgeQuote[],
  tokens: TransactionToken[],
  messenger: TransactionPayControllerMessenger,
) {
  const amountTotal = getAmountTotal(tokens);
  const bridgeFeeTotal = getBridgeFeeTotal(quotes, messenger);

  const totalUsd = new BigNumber(amountTotal.amountUsd).plus(
    bridgeFeeTotal.feeUsd,
  );

  const totalFiat = new BigNumber(amountTotal.amountFiat).plus(
    bridgeFeeTotal.feeFiat,
  );

  return {
    totalUsd: totalUsd.toString(10),
    totalFiat: totalFiat.toString(10),
  };
}

/**
 * Calculate the total amount from a list of tokens.
 *
 * @param tokens - List of transaction tokens.
 * @returns The total amount in USD and fiat currency.
 */
function getAmountTotal(tokens: TransactionToken[]) {
  const total = tokens.reduce(
    (acc, token) => ({
      amountUsd: acc.amountUsd.plus(token.amountUsd),
      amountFiat: acc.amountFiat.plus(token.amountFiat),
    }),
    { amountUsd: new BigNumber(0), amountFiat: new BigNumber(0) },
  );

  return {
    amountUsd: total.amountUsd.toString(10),
    amountFiat: total.amountFiat.toString(10),
  };
}

/**
 * Calculate the total bridge fees from a list of quotes.
 *
 * @param quotes - List of bridge quotes.
 * @param messenger - Controller messenger.
 * @returns The total bridge fees in USD and fiat currency.
 */
function getBridgeFeeTotal(
  quotes: TransactionBridgeQuote[],
  messenger: TransactionPayControllerMessenger,
) {
  const total = quotes.reduce(
    (acc, quote) => {
      const fees = getBridgeFee(quote, messenger);

      return {
        feeUsd: acc.feeUsd.plus(fees.feeUsd),
        feeFiat: acc.feeFiat.plus(fees.feeFiat),
      };
    },
    { feeUsd: new BigNumber(0), feeFiat: new BigNumber(0) },
  );

  return {
    feeUsd: total.feeUsd.toString(10),
    feeFiat: total.feeFiat.toString(10),
  };
}

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
  const feeUsd = fiat.sourceAmountUsd.minus(fiat.targetAmountUsd);
  const feeFiat = fiat.sourceAmountFiat.minus(fiat.targetAmountFiat);

  return {
    feeUsd,
    feeFiat,
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

  const sourceDecimals = getTokenInfo(
    messenger,
    quote.quote.srcAsset.address as Hex,
    toHex(quote.quote.srcChainId),
  );

  const targetDecimals = getTokenInfo(
    messenger,
    quote.quote.destAsset.address as Hex,
    toHex(quote.quote.destChainId),
  );

  if (
    !sourceFiatRate ||
    !targetFiatRate ||
    sourceDecimals === undefined ||
    targetDecimals === undefined
  ) {
    throw new Error('Fiat rates not found for quote');
  }

  const sourceAmountValue = new BigNumber(quote.quote.srcTokenAmount).shiftedBy(
    -sourceDecimals.decimals,
  );

  const targetAmountValue = new BigNumber(
    quote.quote.minDestTokenAmount,
  ).shiftedBy(-targetDecimals.decimals);

  const sourceAmountFiat = sourceAmountValue.multipliedBy(
    sourceFiatRate.fiatRate,
  );

  const sourceAmountUsd = sourceAmountValue.multipliedBy(
    sourceFiatRate.usdRate,
  );

  const targetAmountFiat = targetAmountValue.multipliedBy(
    targetFiatRate.fiatRate,
  );

  const targetAmountUsd = targetAmountValue.multipliedBy(
    targetFiatRate.usdRate,
  );

  return {
    sourceAmountFiat,
    sourceAmountUsd,
    sourceFiatRate,
    targetAmountFiat,
    targetAmountUsd,
    targetFiatRate,
  };
}
