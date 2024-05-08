/**
 * Represents the conversion rates from one currency to others.
 * Each key is a string representing the cryptocurrency code (e.g., "BTC", "SOL"),
 * and its value is either a number representing the conversion rate to that currency,
 * or `null` if the conversion rate is not available.
 */
export type Rate = Record<string, number | null>;

/**
 * Represents the conversion rates for multiple cryptocurrencies.
 * Each key is a string representing the cryptocurrency symbol (e.g., "BTC", "SOL"),
 * and its value is a `Rate` object containing conversion rates from that cryptocurrency
 * to various fiat currencies or other cryptocurrencies.
 */
export type ConversionRates = Record<string, Rate>;
