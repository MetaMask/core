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
  const json = await handleFetch(
    getPricingURL(currency, nativeCurrency, includeUSDRate),
  );

  const conversionRate = isNaN(Number(json[currency.toUpperCase()]))
    ? null
    : Number(json[currency.toUpperCase()]);
  const usdConversionRate = isNaN(Number(json.USD)) ? null : Number(json.USD);

  return {
    conversionDate: Date.now() / 1000,
    conversionRate,
    usdConversionRate,
  };
}
