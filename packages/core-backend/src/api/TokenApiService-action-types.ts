/**
 * Messenger action types for TokenApiService
 *
 * Actions are namespaced as: BackendApiClient:Token:*
 * This is for the Token API at token.api.cx.metamask.io
 */

import type {
  GetTokenSupportedNetworksResponse,
  NetworkInfo,
  TopAsset,
  TokenDescriptionResponse,
  SuggestedOccurrenceFloorsResponse,
  TopGainersSortOption,
} from './TokenApiService';
import type {
  TokenMetadata,
  TrendingToken,
  GetTrendingTokensOptions,
} from './types';

// Using string literals directly in template types to avoid unused variable lint errors
type ServiceName = 'BackendApiClient';
type Namespace = 'Token';

// =============================================================================
// Supported Networks Actions
// =============================================================================

export type TokenGetV1SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV1SupportedNetworks`;
  handler: () => Promise<GetTokenSupportedNetworksResponse>;
};

// =============================================================================
// Networks Actions
// =============================================================================

export type TokenGetNetworksAction = {
  type: `${ServiceName}:${Namespace}:getNetworks`;
  handler: () => Promise<NetworkInfo[]>;
};

export type TokenGetNetworkByChainIdAction = {
  type: `${ServiceName}:${Namespace}:getNetworkByChainId`;
  handler: (chainId: number) => Promise<NetworkInfo>;
};

// =============================================================================
// Token List Actions
// =============================================================================

export type TokenGetTokenListAction = {
  type: `${ServiceName}:${Namespace}:getTokenList`;
  handler: (
    chainId: number,
    options?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
  ) => Promise<TokenMetadata[]>;
};

// =============================================================================
// Token Metadata Actions
// =============================================================================

export type TokenGetTokenMetadataAction = {
  type: `${ServiceName}:${Namespace}:getTokenMetadata`;
  handler: (
    chainId: number,
    tokenAddress: string,
    options?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
  ) => Promise<TokenMetadata | undefined>;
};

export type TokenGetTokenDescriptionAction = {
  type: `${ServiceName}:${Namespace}:getTokenDescription`;
  handler: (
    chainId: number,
    tokenAddress: string,
  ) => Promise<TokenDescriptionResponse | undefined>;
};

// =============================================================================
// Trending & Top Tokens (V3) Actions
// =============================================================================

export type TokenGetV3TrendingTokensAction = {
  type: `${ServiceName}:${Namespace}:getV3TrendingTokens`;
  handler: (options: GetTrendingTokensOptions) => Promise<TrendingToken[]>;
};

export type TokenGetV3TopGainersAction = {
  type: `${ServiceName}:${Namespace}:getV3TopGainers`;
  handler: (
    chainIds: string[],
    options?: {
      sort?: TopGainersSortOption;
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
  ) => Promise<TrendingToken[]>;
};

export type TokenGetV3PopularTokensAction = {
  type: `${ServiceName}:${Namespace}:getV3PopularTokens`;
  handler: (
    chainIds: string[],
    options?: {
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
  ) => Promise<TrendingToken[]>;
};

// =============================================================================
// Top Assets Actions
// =============================================================================

export type TokenGetTopAssetsAction = {
  type: `${ServiceName}:${Namespace}:getTopAssets`;
  handler: (chainId: number) => Promise<TopAsset[]>;
};

// =============================================================================
// Utility Actions
// =============================================================================

export type TokenGetV1SuggestedOccurrenceFloorsAction = {
  type: `${ServiceName}:${Namespace}:getV1SuggestedOccurrenceFloors`;
  handler: () => Promise<SuggestedOccurrenceFloorsResponse>;
};

// =============================================================================
// All Token API Actions
// =============================================================================

export type TokenApiActions =
  // Supported Networks
  | TokenGetV1SupportedNetworksAction
  // Networks
  | TokenGetNetworksAction
  | TokenGetNetworkByChainIdAction
  // Token List
  | TokenGetTokenListAction
  // Token Metadata
  | TokenGetTokenMetadataAction
  | TokenGetTokenDescriptionAction
  // Trending & Top Tokens (V3)
  | TokenGetV3TrendingTokensAction
  | TokenGetV3TopGainersAction
  | TokenGetV3PopularTokensAction
  // Top Assets
  | TokenGetTopAssetsAction
  // Utility
  | TokenGetV1SuggestedOccurrenceFloorsAction;
