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

/** Query options for V3 Assets endpoint */
export type V3AssetsQueryOptions = {
  /** Include icon URL in response */
  includeIconUrl?: boolean;
  /** Include market data in response */
  includeMarketData?: boolean;
  /** Include metadata in response */
  includeMetadata?: boolean;
  /** Include labels in response */
  includeLabels?: boolean;
  /** Include RWA data in response */
  includeRwaData?: boolean;
  /** Include DEX/aggregator integrations in response */
  includeAggregators?: boolean;
};

// ============================================================================
// V3 ASSET RESPONSE TYPES
// ============================================================================

/** Fee information for an asset */
export type V3AssetFees = {
  avgFee: number;
  maxFee: number;
  minFee: number;
};

/** Honeypot detection status */
export type V3AssetHoneypotStatus = {
  honeypotIs: boolean;
  goPlus?: boolean;
};

/** Storage slot information for the contract */
export type V3AssetStorage = {
  balance: number;
  approval: number;
};

/** Localized description */
export type V3AssetDescription = {
  en: string;
};

/**
 * Asset response from V3 Assets endpoint.
 * All fields are stored in state (FungibleAssetMetadata).
 */
export type V3AssetResponse = {
  /** CAIP-19 asset ID (e.g., "eip155:1/erc20:0x...") */
  assetId: string;
  /** Asset display name */
  name: string;
  /** Asset symbol */
  symbol: string;
  /** Decimal places */
  decimals: number;
  /** Icon URL (maps to `image` in state) */
  iconUrl?: string;
  /** CoinGecko ID for price lookups */
  coingeckoId?: string;
  /** Number of token list occurrences */
  occurrences?: number;
  /** DEX/aggregator integrations */
  aggregators?: string[];
  /** Asset labels/tags (e.g., "stable_coin") */
  labels?: string[];
  /** Whether the token supports ERC-20 permit */
  erc20Permit?: boolean;
  /** Fee information */
  fees?: V3AssetFees;
  /** Honeypot detection status */
  honeypotStatus?: V3AssetHoneypotStatus;
  /** Storage slot information */
  storage?: V3AssetStorage;
  /** Whether the contract is verified */
  isContractVerified?: boolean;
  /** Localized description (maps to metadata.description in state) */
  description?: V3AssetDescription;
};
