import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { FeeType } from '../../validators/quote.js';

const toFiat = (
  fee?: Pick<AmountsAndAsset, 'usd' | 'valueInCurrency'>,
  usdToFiatExchangeRate?: BigNumber,
): Pick<AmountsAndAsset, 'valueInCurrency'> | undefined => {
  const { usd, valueInCurrency } = fee ?? {};
  if (usd && usdToFiatExchangeRate) {
    return { valueInCurrency: usdToFiatExchangeRate.times(usd).toFixed() };
  }
  if (valueInCurrency) {
    return { valueInCurrency };
  }
  return undefined;
};

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

  const priceImpactFiat = toFiat(priceImpact, usdToFiatExchangeRate);
  const adjustedReturnFiat = toFiat(adjustedReturn, usdToFiatExchangeRate);

  const minAmountValueInCurrency = toFiat(
    {
      usd: dest.minAmountUsd,
      valueInCurrency: dest.minAmountValueInCurrency,
    },
    usdToFiatExchangeRate,
  )?.valueInCurrency;

  return {
    quote: {
      src: toFiat(src, usdToFiatExchangeRate),
      dest: {
        ...toFiat(dest, usdToFiatExchangeRate),
        ...(minAmountValueInCurrency && {
          minAmountValueInCurrency,
        }),
      },
      feeData:
        feeData &&
        Object.fromEntries(
          Object.values(FeeType)
            .filter((feeType) => feeData[feeType])
            .map((feeType) => [
              feeType,
              feeData[feeType]?.map((fee) =>
                toFiat(fee, usdToFiatExchangeRate),
              ),
            ]),
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
