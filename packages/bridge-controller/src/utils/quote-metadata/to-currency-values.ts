import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { FeeType } from '../../validators/quote.js';

/**
 * Builds a partial {@link QuoteResponse} object with fiat values derived from the usd values provided by the bridge-api
 *
 * @param quote - The quote response to calculate the metadata for
 * @param usdToFiatExchangeRate - The usd to fiat exchange rate
 * @returns The partial {@link QuoteResponse} object with fiat values
 */
export const toCurrencyValues = (
  quote: QuoteResponse,
  usdToFiatExchangeRate?: BigNumber,
): DeepPartial<QuoteResponse> => {
  const {
    quote: { src, dest, feeData, priceData },
  } = quote;

  const { adjustedReturn, priceImpact } = priceData ?? {};

  const toFiat = ({
    usd,
    valueInCurrency,
  }: Pick<AmountsAndAsset, 'usd' | 'valueInCurrency'>):
    | Pick<AmountsAndAsset, 'valueInCurrency'>
    | undefined => {
    if (usd && usdToFiatExchangeRate) {
      return { valueInCurrency: usdToFiatExchangeRate.times(usd).toFixed() };
    }
    if (valueInCurrency) {
      return { valueInCurrency };
    }
    return undefined;
  };

  const priceImpactFiat = priceImpact ? toFiat(priceImpact) : undefined;
  const adjustedReturnFiat = adjustedReturn
    ? toFiat(adjustedReturn)
    : undefined;

  const minAmountValueInCurrency = toFiat({
    usd: dest.minAmountUsd,
    valueInCurrency: dest.minAmountValueInCurrency,
  })?.valueInCurrency;

  return {
    quote: {
      src: toFiat(src),
      dest: {
        ...toFiat(dest),
        ...(minAmountValueInCurrency && {
          minAmountValueInCurrency,
        }),
      },
      feeData:
        feeData &&
        Object.fromEntries(
          Object.values(FeeType)
            .filter((feeType) => feeData[feeType])
            .map((feeType) => [feeType, feeData[feeType]?.map(toFiat)]),
        ),
      ...((priceImpactFiat ?? adjustedReturnFiat) && {
        priceData: {
          ...(priceImpactFiat && {
            priceImpact: priceImpactFiat,
          }),
          ...(adjustedReturnFiat && {
            adjustedReturn: adjustedReturnFiat,
          }),
        },
      }),
    },
  };
};
