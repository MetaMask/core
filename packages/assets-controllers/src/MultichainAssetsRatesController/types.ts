import type { CaipAssetId } from '@metamask/utils';

/**
 * Represents the rate details for a given token conversion.
 */
export type RateData = {
  conversionTime: number;
  rate: string;
};

/**
 * Represents the conversion rates for a specific token.
 * The key is a currency identifier (for example, 'swift:0/iso4217:USD'),
 * and the value is a RateData object.
 */
export type TokenConversionRates = {
  [currency: CaipAssetId]: RateData;
};

/**
 * Represents all token conversion rates for a given account.
 * The key is a token identifier (for example,
 * 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'),
 * and the value is a mapping of currency identifiers to RateData.
 */
export type AccountConversionRates = {
  [tokenId: CaipAssetId]: TokenConversionRates;
};

/**
 * The complete conversion rates structure.
 * The top-level object has a conversionRates property that maps account IDs to their respective rates.
 */
export type ConversionRatesWrapper = {
  conversionRates: AccountConversionRates;
};
