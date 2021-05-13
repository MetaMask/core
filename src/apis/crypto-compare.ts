import { handleFetch } from '../util';

function getPricingURL(
  currentCurrency: string,
  nativeCurrency: string,
  includeUSDRate?: boolean,
) {
  return (
    `https://min-api.cryptocompare.com/data/price?fsym=` +
    `${nativeCurrency.toUpperCase()}&tsyms=${currentCurrency.toUpperCase()}` +
    `${includeUSDRate && currentCurrency.toUpperCase() !== 'USD' ? ',USD' : ''}`
  );
}

/**
 * Fetches the exchange rate for a given currency
 *
 * @param currency - ISO 4217 currency code
 * @param nativeCurrency - Symbol for base asset
 * @param includeUSDRate - Whether to add the USD rate to the fetch
 * @returns - Promise resolving to exchange rate for given currency
 */
export async function fetchExchangeRate(
  currency: string,
  nativeCurrency: string,
  includeUSDRate?: boolean,
): Promise<{
  conversionDate: number;
  conversionRate: number | null;
  usdConversionRate: number | null;
}> {
  if (!currency || !nativeCurrency) {
    return {
      conversionDate: Date.now() / 1000,
      conversionRate: null,
      usdConversionRate: null,
    };
  }

  const json = await handleFetch(
    getPricingURL(currency, nativeCurrency, includeUSDRate),
  );

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
    conversionDate: Date.now() / 1000,
    conversionRate,
    usdConversionRate,
  };
}
