/**
 * Fetches the exchange rate for a given currency.
 *
 * @param currency - ISO 4217 currency code.
 * @param nativeCurrency - Symbol for base asset.
 * @param includeUSDRate - Whether to add the USD rate to the fetch.
 * @returns Promise resolving to exchange rate for given currency.
 */
export declare function fetchExchangeRate(currency: string, nativeCurrency: string, includeUSDRate?: boolean): Promise<{
    conversionRate: number;
    usdConversionRate: number;
}>;
