import { handleFetch } from '@metamask/controller-utils';

import { getKeyByValue } from '../assetsUtil';

/**
 * A map from native currency symbol to CryptoCompare identifier.
 * This is only needed when the values don't match.
 */
const nativeSymbolOverrides = new Map([
  ['MNT', 'MANTLE'],
  ['OMNI', 'OMNINET'],
]);

const CRYPTO_COMPARE_DOMAIN = 'https://min-api.cryptocompare.com';

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
  return (
    `${CRYPTO_COMPARE_DOMAIN}/data/price?fsym=` +
    `${nativeCurrency}&tsyms=${currentCurrency}` +
    `${includeUSDRate && currentCurrency.toUpperCase() !== 'USD' ? ',USD' : ''}`
  );
}

/**
 * Get the CryptoCompare API URL for getting the conversion rate from a given array of native currencies
 * to the given currencies. Optionally, the conversion rate from the native currency to USD can also be
 * included in the response.
 *
 * @param fsyms - The native currencies to get conversion rates for.
 * @param tsyms - The currencies to convert to.
 * @param includeUSDRate - Whether or not the native currency to USD conversion rate should be included.
 * @returns The API URL for getting the conversion rates.
 */
function getMultiPricingURL(
  fsyms: string[],
  tsyms: string[],
  includeUSDRate = false,
) {
  const updatedTsyms =
    includeUSDRate && !tsyms.some((t) => t.toUpperCase() === 'USD')
      ? [...tsyms, 'USD']
      : tsyms;

  const params = new URLSearchParams();
  params.append('fsyms', fsyms.join(','));
  params.append('tsyms', updatedTsyms.join(','));

  const url = new URL(`${CRYPTO_COMPARE_DOMAIN}/data/pricemulti`);
  url.search = params.toString();
  return url.toString();
}

/**
 * Handles an error response from the CryptoCompare API.
 * Expected error response format
 * { Response: "Error", Message: "...", HasWarning: false }
 *
 * @param json - The JSON response from the CryptoCompare API.
 * @param json.Response - The response status.
 * @param json.Message - The error message.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
function handleErrorResponse(json: { Response?: string; Message?: string }) {
  if (json.Response === 'Error') {
    throw new Error(json.Message);
  }
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
  currency = currency.toUpperCase();
  nativeCurrency = nativeCurrency.toUpperCase();
  currency = nativeSymbolOverrides.get(currency) ?? currency;
  nativeCurrency = nativeSymbolOverrides.get(nativeCurrency) ?? nativeCurrency;

  const json = await handleFetch(
    getPricingURL(currency, nativeCurrency, includeUSDRate),
  );

  handleErrorResponse(json);
  const conversionRate = Number(json[currency.toUpperCase()]);

  const usdConversionRate = Number(json.USD);
  if (!Number.isFinite(conversionRate)) {
    throw new Error(
      `Invalid response for ${currency.toUpperCase()}: ${
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        json[currency.toUpperCase()]
      }`,
    );
  }

  if (includeUSDRate && !Number.isFinite(usdConversionRate)) {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Invalid response for usdConversionRate: ${json.USD}`);
  }

  return {
    conversionRate,
    usdConversionRate,
  };
}

/**
 * Fetches the exchange rates for multiple currencies.
 *
 * @param fiatCurrency - The currency of the rates (ISO 4217).
 * @param cryptocurrencies - The cryptocurrencies to get conversion rates for. Min length: 1. Max length: 300.
 * @param includeUSDRate - Whether to add the USD rate to the fetch.
 * @returns Promise resolving to exchange rates for given currencies.
 */
export async function fetchMultiExchangeRate(
  fiatCurrency: string,
  cryptocurrencies: string[],
  includeUSDRate: boolean,
): Promise<Record<string, Record<string, number>>> {
  const fsyms = cryptocurrencies.map(
    (nativeCurrency) =>
      nativeSymbolOverrides.get(nativeCurrency) ?? nativeCurrency,
  );
  const url = getMultiPricingURL(fsyms, [fiatCurrency], includeUSDRate);
  const response = await handleFetch(url);
  handleErrorResponse(response);

  const rates: Record<string, Record<string, number>> = {};
  for (const [cryptocurrency, values] of Object.entries(response) as [
    string,
    Record<string, number>,
  ][]) {
    const key = getKeyByValue(nativeSymbolOverrides, cryptocurrency);
    rates[key?.toLowerCase() ?? cryptocurrency.toLowerCase()] = {
      [fiatCurrency.toLowerCase()]: values[fiatCurrency.toUpperCase()],
      ...(includeUSDRate && { usd: values.USD }),
    };
  }

  return rates;
}
