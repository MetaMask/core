import { handleFetch } from '@metamask/controller-utils';

/**
 * A map from native currency symbol to CryptoCompare identifier.
 * This is only needed when the values don't match.
 */
const nativeSymbolOverrides = new Map([['MNT', 'MANTLE']]);

/**
 * Get the CryptoCompare API URL for getting the conversion rate from the given native currency to
 * the given currency. Optionally, the conversion rate from the native currency to USD can also be
 * included in the response.
 *
 * @param currentCurrency - The currency to get a conversion rate for.
 * @param nativeCurrency - The native currency to convert from.
 * @param includeUSDRate - Whether or not the native currency to USD conversion rate should be
 * included in the response as well.
 * @returns The API URL for getting the conversion rate.
 */
function getPricingURL(
  currentCurrency: string,
  nativeCurrency: string,
  includeUSDRate?: boolean,
) {
  nativeCurrency = nativeCurrency.toUpperCase();
  const fsym = nativeSymbolOverrides.get(nativeCurrency) ?? nativeCurrency;
  return (
    `https://min-api.cryptocompare.com/data/price?fsym=` +
    `${fsym}&tsyms=${currentCurrency.toUpperCase()}` +
    `${includeUSDRate && currentCurrency.toUpperCase() !== 'USD' ? ',USD' : ''}`
  );
}

/**
 * Fetches the exchange rate for a given currency.
 *
 * @param currency - ISO 4217 currency code.
 * @param nativeCurrency - Symbol for base asset.
 * @param includeUSDRate - Whether to add the USD rate to the fetch.
 * @returns Promise resolving to exchange rate for given currency.
 */
export async function fetchExchangeRate(
  currency: string,
  nativeCurrency: string,
  includeUSDRate?: boolean,
): Promise<{
  conversionRate: number;
  usdConversionRate: number;
}> {
  const json = await handleFetch(
    getPricingURL(currency, nativeCurrency, includeUSDRate),
  );

  /*
  Example expected error response (if pair is not found)
  {
    Response: "Error",
    Message: "cccagg_or_exchange market does not exist for this coin pair (ETH-<NON_EXISTENT_TOKEN>)",
    HasWarning: false,
  }
  */
  if (json.Response === 'Error') {
    throw new Error(json.Message);
  }

  const conversionRate = Number(json[currency.toUpperCase()]);

  const usdConversionRate = Number(json.USD);
  if (!Number.isFinite(conversionRate)) {
    throw new Error(
      `Invalid response for ${currency.toUpperCase()}: ${
        json[currency.toUpperCase()]
      }`,
    );
  }

  if (includeUSDRate && !Number.isFinite(usdConversionRate)) {
    throw new Error(`Invalid response for usdConversionRate: ${json.USD}`);
  }

  return {
    conversionRate,
    usdConversionRate,
  };
}
