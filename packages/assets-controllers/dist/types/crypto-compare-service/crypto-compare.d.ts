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
/**
 * Fetches the exchange rates for multiple currencies.
 *
 * @param fiatCurrency - The currency of the rates (ISO 4217).
 * @param cryptocurrencies - The cryptocurrencies to get conversion rates for. Min length: 1. Max length: 300.
 * @param includeUSDRate - Whether to add the USD rate to the fetch.
 * @returns Promise resolving to exchange rates for given currencies.
 */
export declare function fetchMultiExchangeRate(fiatCurrency: string, cryptocurrencies: string[], includeUSDRate: boolean): Promise<Record<string, Record<string, string>>>;
//# sourceMappingURL=crypto-compare.d.ts.map