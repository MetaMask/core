/**
 * Tokens API types for the API Platform Client.
 * API: tokens.api.cx.metamask.io
 */

// ============================================================================
// SUPPORTED NETWORKS TYPES
// ============================================================================

/** Token supported networks response (v1) */
export type V1TokenSupportedNetworksResponse = {
  fullSupport: string[];
};

/** Token supported networks response (v2) - includes partial support */
export type V2TokenSupportedNetworksResponse = {
  fullSupport: string[];
  partialSupport: string[];
};

// ============================================================================
// ASSET TYPES
// ============================================================================

/** Asset by CAIP-19 ID response */
export type V3AssetResponse = {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  chainId: number | string;
  iconUrl?: string;
  iconUrlThumbnail?: string;
  coingeckoId?: string;
  occurrences?: number;
  aggregators?: string[];
};
