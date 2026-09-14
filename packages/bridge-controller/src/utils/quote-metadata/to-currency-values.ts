import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../../types.js';
import type { AmountsAndAsset } from '../../validators/amount-and-asset.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { FeeType } from '../../validators/quote.js';

const toCurrency = (
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

  const { adjustedReturn, priceImpact, cost } = priceData ?? {};

  const priceImpactFiat = toCurrency(priceImpact, usdToFiatExchangeRate);
  const adjustedReturnFiat = toCurrency(adjustedReturn, usdToFiatExchangeRate);
  const costFiat = toCurrency(cost, usdToFiatExchangeRate);

  const minAmountValueInCurrency = toCurrency(
    {
      usd: dest.minAmountUsd,
      valueInCurrency: dest.minAmountValueInCurrency,
    },
    usdToFiatExchangeRate,
  )?.valueInCurrency;

  return {
    quote: {
      src: toCurrency(src, usdToFiatExchangeRate),
      dest: {
        ...toCurrency(dest, usdToFiatExchangeRate),
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
                toCurrency(fee, usdToFiatExchangeRate),
              ),
            ]),
        ),
      ...((priceImpactFiat ?? adjustedReturnFiat ?? costFiat) && {
        priceData: {
          ...(priceImpactFiat && {
            priceImpact: priceImpactFiat,
          }),
          ...(adjustedReturnFiat && {
            adjustedReturn: adjustedReturnFiat,
          }),
          ...(costFiat && {
            cost: costFiat,
          }),
        },
      }),
    },
  };
};
