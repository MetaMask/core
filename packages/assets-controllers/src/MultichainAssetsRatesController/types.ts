import type { CaipAssetTypeOrId } from '@metamask/utils';

/**
 * Represents the rate details for a given token conversion.
 */
export type RateData = {
  conversionTime: number;
  rate: string;
  currency: CaipAssetTypeOrId;
};

/**
 * Represents all token conversion rates for a given account.
 * The key is a token identifier (for example,
 * 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501'),
 * and the value is a mapping of currency identifiers to RateData.
 */
export type AccountConversionRates = {
  [tokenId: CaipAssetTypeOrId]: RateData;
};

/**
 * The complete conversion rates structure.
 * The top-level object has a conversionRates property that maps account IDs to their respective rates.
 */
export type ConversionRatesWrapper = {
  conversionRates: AccountConversionRates;
};
